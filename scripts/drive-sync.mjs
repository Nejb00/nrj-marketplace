// =============================================================================
// drive-sync.mjs
// Synchronisation bidirectionnelle entre un repo GitHub et un dossier Google Drive.
//
// Règle de conflit : GitHub fait toujours autorité. Si un fichier a changé des
// deux côtés depuis le dernier passage, la version GitHub écrase Drive, et la
// version Drive divergente est conservée à côté sous le nom
// "<fichier>.drive-version.<ext>" (jamais écrasée silencieusement).
//
// Les suppressions ne sont JAMAIS propagées automatiquement (trop risqué) :
// elles sont juste signalées dans le résumé de fin d'exécution.
// =============================================================================

import { Octokit } from "@octokit/rest";
import { google } from "googleapis";
import crypto from "node:crypto";
import { Readable } from "node:stream";

// ---------------------------------------------------------------------------
// Configuration (via variables d'environnement / secrets GitHub Actions)
// ---------------------------------------------------------------------------
const CONFIG = {
  githubToken: requireEnv("GITHUB_TOKEN"),
  owner: process.env.GH_OWNER || "Nejb00",
  repo: process.env.GH_REPO || "nrj-marketplace",
  mainBranch: process.env.GH_MAIN_BRANCH || "main-merged",
  syncBranch: process.env.GH_SYNC_BRANCH || "drive-sync",
  driveFolderId: requireEnv("DRIVE_FOLDER_ID"),
  googleClientId: requireEnv("GOOGLE_CLIENT_ID"),
  googleClientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
  googleRefreshToken: requireEnv("GOOGLE_REFRESH_TOKEN"),
  statePath: ".drive-sync/state.json",
  // Dossiers/fichiers ignorés des deux côtés
  ignorePatterns: [/^\.git\//, /^node_modules\//, /^\.drive-sync\//],
};

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Variable d'environnement manquante : ${name}`);
    process.exit(1);
  }
  return v;
}

function isIgnored(path) {
  return CONFIG.ignorePatterns.some((re) => re.test(path));
}

// ---------------------------------------------------------------------------
// Clients GitHub / Google Drive
// ---------------------------------------------------------------------------
function getOctokit() {
  return new Octokit({ auth: CONFIG.githubToken });
}

function getDriveClient() {
  const oauth2Client = new google.auth.OAuth2(
    CONFIG.googleClientId,
    CONFIG.googleClientSecret
  );
  oauth2Client.setCredentials({ refresh_token: CONFIG.googleRefreshToken });
  return google.drive({ version: "v3", auth: oauth2Client });
}

// ---------------------------------------------------------------------------
// Lecture de l'arbre GitHub (branche principale)
// ---------------------------------------------------------------------------
async function getGithubTree(octokit) {
  const { data: refData } = await octokit.git.getRef({
    owner: CONFIG.owner,
    repo: CONFIG.repo,
    ref: `heads/${CONFIG.mainBranch}`,
  });
  const commitSha = refData.object.sha;

  const { data: commitData } = await octokit.git.getCommit({
    owner: CONFIG.owner,
    repo: CONFIG.repo,
    commit_sha: commitSha,
  });

  const { data: treeData } = await octokit.git.getTree({
    owner: CONFIG.owner,
    repo: CONFIG.repo,
    tree_sha: commitData.tree.sha,
    recursive: "true",
  });

  const files = new Map();
  for (const entry of treeData.tree) {
    if (entry.type !== "blob") continue;
    if (isIgnored(entry.path)) continue;
    files.set(entry.path, { sha: entry.sha, size: entry.size });
  }
  return { files, commitSha, baseTreeSha: commitData.tree.sha };
}

async function getGithubBlobContent(octokit, blobSha) {
  const { data } = await octokit.git.getBlob({
    owner: CONFIG.owner,
    repo: CONFIG.repo,
    file_sha: blobSha,
  });
  return Buffer.from(data.content, data.encoding);
}

// ---------------------------------------------------------------------------
// Lecture de l'arbre Google Drive (récursif depuis le dossier racine)
// ---------------------------------------------------------------------------
const FOLDER_MIME = "application/vnd.google-apps.folder";

async function listDriveTree(drive) {
  const files = new Map(); // path -> { id, md5Checksum, modifiedTime }
  const folderIdByPath = new Map(); // path -> folderId (pour les dossiers)
  folderIdByPath.set("", CONFIG.driveFolderId);

  async function walk(folderId, prefix) {
    let pageToken;
    do {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields:
          "nextPageToken, files(id, name, mimeType, md5Checksum, modifiedTime)",
        pageSize: 1000,
        pageToken,
      });
      for (const f of res.data.files) {
        const relPath = prefix ? `${prefix}/${f.name}` : f.name;
        if (isIgnored(relPath)) continue;
        if (f.mimeType === FOLDER_MIME) {
          folderIdByPath.set(relPath, f.id);
          await walk(f.id, relPath);
        } else {
          files.set(relPath, {
            id: f.id,
            md5Checksum: f.md5Checksum,
            modifiedTime: f.modifiedTime,
          });
        }
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);
  }

  await walk(CONFIG.driveFolderId, "");
  return { files, folderIdByPath };
}

async function ensureDriveFolderPath(drive, folderIdByPath, dirPath) {
  if (dirPath === "") return CONFIG.driveFolderId;
  if (folderIdByPath.has(dirPath)) return folderIdByPath.get(dirPath);

  const parts = dirPath.split("/");
  let currentPath = "";
  let parentId = CONFIG.driveFolderId;
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    if (folderIdByPath.has(currentPath)) {
      parentId = folderIdByPath.get(currentPath);
      continue;
    }
    const res = await drive.files.create({
      requestBody: {
        name: part,
        mimeType: FOLDER_MIME,
        parents: [parentId],
      },
      fields: "id",
    });
    folderIdByPath.set(currentPath, res.data.id);
    parentId = res.data.id;
  }
  return parentId;
}

function md5(buffer) {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

function splitPath(path) {
  const idx = path.lastIndexOf("/");
  return idx === -1
    ? { dir: "", name: path }
    : { dir: path.slice(0, idx), name: path.slice(idx + 1) };
}

function withSuffix(path, suffix) {
  const dotIdx = path.lastIndexOf(".");
  if (dotIdx === -1 || dotIdx < path.lastIndexOf("/")) {
    return `${path}${suffix}`;
  }
  return `${path.slice(0, dotIdx)}${suffix}${path.slice(dotIdx)}`;
}

async function uploadOrUpdateDriveFile(
  drive,
  folderIdByPath,
  driveFiles,
  relPath,
  buffer,
  mimeType = "application/octet-stream"
) {
  const { dir, name } = splitPath(relPath);
  const parentId = await ensureDriveFolderPath(drive, folderIdByPath, dir);
  const existing = driveFiles.get(relPath);
  const media = { mimeType, body: bufferToStream(buffer) };

  if (existing) {
    await drive.files.update({
      fileId: existing.id,
      media,
    });
  } else {
    await drive.files.create({
      requestBody: { name, parents: [parentId] },
      media,
      fields: "id",
    });
  }
}

function bufferToStream(buffer) {
  return new Readable({
    read() {
      this.push(buffer);
      this.push(null);
    },
  });
}

// ---------------------------------------------------------------------------
// Etat de synchronisation (mémoire du dernier passage)
// ---------------------------------------------------------------------------
async function loadState(octokit) {
  try {
    const { data } = await octokit.repos.getContent({
      owner: CONFIG.owner,
      repo: CONFIG.repo,
      path: CONFIG.statePath,
      ref: CONFIG.syncBranch,
    });
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return JSON.parse(content);
  } catch (err) {
    if (err.status === 404) return { files: {} };
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Ecriture d'un commit unique sur la branche drive-sync (fichiers + état)
// ---------------------------------------------------------------------------
async function ensureSyncBranch(octokit) {
  try {
    await octokit.git.getRef({
      owner: CONFIG.owner,
      repo: CONFIG.repo,
      ref: `heads/${CONFIG.syncBranch}`,
    });
  } catch (err) {
    if (err.status !== 404) throw err;
    const { data: mainRef } = await octokit.git.getRef({
      owner: CONFIG.owner,
      repo: CONFIG.repo,
      ref: `heads/${CONFIG.mainBranch}`,
    });
    await octokit.git.createRef({
      owner: CONFIG.owner,
      repo: CONFIG.repo,
      ref: `refs/heads/${CONFIG.syncBranch}`,
      sha: mainRef.object.sha,
    });
  }
}

async function commitFilesToSyncBranch(octokit, filesToWrite, message) {
  // filesToWrite: Map<path, Buffer>
  if (filesToWrite.size === 0) return null;

  const { data: ref } = await octokit.git.getRef({
    owner: CONFIG.owner,
    repo: CONFIG.repo,
    ref: `heads/${CONFIG.syncBranch}`,
  });
  const baseSha = ref.object.sha;
  const { data: baseCommit } = await octokit.git.getCommit({
    owner: CONFIG.owner,
    repo: CONFIG.repo,
    commit_sha: baseSha,
  });

  const tree = [];
  for (const [path, buffer] of filesToWrite) {
    const { data: blob } = await octokit.git.createBlob({
      owner: CONFIG.owner,
      repo: CONFIG.repo,
      content: buffer.toString("base64"),
      encoding: "base64",
    });
    tree.push({
      path,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    });
  }

  const { data: newTree } = await octokit.git.createTree({
    owner: CONFIG.owner,
    repo: CONFIG.repo,
    base_tree: baseCommit.tree.sha,
    tree,
  });

  const { data: newCommit } = await octokit.git.createCommit({
    owner: CONFIG.owner,
    repo: CONFIG.repo,
    message,
    tree: newTree.sha,
    parents: [baseSha],
  });

  await octokit.git.updateRef({
    owner: CONFIG.owner,
    repo: CONFIG.repo,
    ref: `heads/${CONFIG.syncBranch}`,
    sha: newCommit.sha,
  });

  return newCommit.sha;
}

async function ensurePullRequest(octokit) {
  const { data: openPrs } = await octokit.pulls.list({
    owner: CONFIG.owner,
    repo: CONFIG.repo,
    state: "open",
    head: `${CONFIG.owner}:${CONFIG.syncBranch}`,
    base: CONFIG.mainBranch,
  });
  if (openPrs.length > 0) return openPrs[0];

  const { data: pr } = await octokit.pulls.create({
    owner: CONFIG.owner,
    repo: CONFIG.repo,
    title: "Synchro Google Drive -> GitHub",
    head: CONFIG.syncBranch,
    base: CONFIG.mainBranch,
    body: "Pull Request générée automatiquement par le script de synchronisation Drive <-> GitHub.",
  });
  return pr;
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------
async function main() {
  const octokit = getOctokit();
  const drive = getDriveClient();

  await ensureSyncBranch(octokit);

  const [{ files: githubFiles }, { files: driveFiles, folderIdByPath }, state] =
    await Promise.all([
      getGithubTree(octokit),
      listDriveTree(drive),
      loadState(octokit),
    ]);

  const prevState = state.files || {};
  const allPaths = new Set([
    ...githubFiles.keys(),
    ...driveFiles.keys(),
    ...Object.keys(prevState),
  ]);

  const toWriteOnGithub = new Map(); // path -> Buffer (branche drive-sync)
  const driveUploadQueue = []; // { relPath, buffer, mime }
  const newState = {};
  const summary = {
    githubToDrive: [],
    driveToGithub: [],
    conflicts: [],
    deletedOnGithub: [],
    deletedOnDrive: [],
    unchanged: 0,
  };

  for (const path of allPaths) {
    const gh = githubFiles.get(path);
    const dr = driveFiles.get(path);
    const prev = prevState[path];

    const ghChanged = gh && (!prev || prev.githubSha !== gh.sha);
    const drChanged =
      dr && (!prev || prev.driveMd5 !== dr.md5Checksum);

    // Fichier supprimé d'un côté
    if (!gh && prev?.githubSha) {
      summary.deletedOnGithub.push(path);
    }
    if (!dr && prev?.driveMd5) {
      summary.deletedOnDrive.push(path);
    }
    if (!gh && !dr) continue; // supprimé des deux côtés, rien à faire

    if (gh && !dr) {
      // Nouveau (ou jamais synchronisé) côté GitHub -> on pousse vers Drive
      const buffer = await getGithubBlobContent(octokit, gh.sha);
      driveUploadQueue.push({ relPath: path, buffer });
      newState[path] = { githubSha: gh.sha, driveMd5: md5(buffer) };
      summary.githubToDrive.push(path);
      continue;
    }

    if (!gh && dr) {
      // Nouveau côté Drive uniquement -> à committer sur GitHub
      // (on ne le fait que si ce n'est pas une suppression GitHub qu'on
      // ne veut pas annuler : ici prev n'a pas githubSha donc c'est un ajout)
      if (!prev?.githubSha) {
        const buffer = await downloadDriveFile(drive, dr.id);
        toWriteOnGithub.set(path, buffer);
        newState[path] = { githubSha: null, driveMd5: dr.md5Checksum };
        summary.driveToGithub.push(path);
      }
      continue;
    }

    // Présent des deux côtés
    if (ghChanged && drChanged) {
      // CONFLIT : GitHub gagne, on garde la version Drive à part
      const ghBuffer = await getGithubBlobContent(octokit, gh.sha);
      const drBuffer = await downloadDriveFile(drive, dr.id);
      driveUploadQueue.push({ relPath: path, buffer: ghBuffer });
      driveUploadQueue.push({
        relPath: withSuffix(path, ".drive-version"),
        buffer: drBuffer,
      });
      newState[path] = { githubSha: gh.sha, driveMd5: md5(ghBuffer) };
      summary.conflicts.push(path);
      continue;
    }

    if (ghChanged) {
      const buffer = await getGithubBlobContent(octokit, gh.sha);
      driveUploadQueue.push({ relPath: path, buffer });
      newState[path] = { githubSha: gh.sha, driveMd5: md5(buffer) };
      summary.githubToDrive.push(path);
      continue;
    }

    if (drChanged) {
      const buffer = await downloadDriveFile(drive, dr.id);
      toWriteOnGithub.set(path, buffer);
      newState[path] = { githubSha: null, driveMd5: dr.md5Checksum };
      summary.driveToGithub.push(path);
      continue;
    }

    // Rien n'a changé
    newState[path] = { githubSha: gh.sha, driveMd5: dr.md5Checksum };
    summary.unchanged++;
  }

  // 1) Appliquer les changements côté Drive
  for (const { relPath, buffer } of driveUploadQueue) {
    await uploadOrUpdateDriveFile(
      drive,
      folderIdByPath,
      driveFiles,
      relPath,
      buffer
    );
  }

  // 2) Appliquer les changements côté GitHub (commit + PR si nécessaire)
  if (toWriteOnGithub.size > 0) {
    // Compléter les shas GitHub réels après commit
    const commitSha = await commitFilesToSyncBranch(
      octokit,
      toWriteOnGithub,
      `Synchro Drive -> GitHub (${toWriteOnGithub.size} fichier(s))`
    );
    if (commitSha) {
      const { data: newTree } = await octokit.git.getTree({
        owner: CONFIG.owner,
        repo: CONFIG.repo,
        tree_sha: commitSha,
        recursive: "true",
      });
      for (const entry of newTree.tree) {
        if (toWriteOnGithub.has(entry.path)) {
          newState[entry.path].githubSha = entry.sha;
        }
      }
      await ensurePullRequest(octokit);
    }
  }

  // 3) Sauvegarder le nouvel état sur la branche drive-sync
  const stateBuffer = Buffer.from(
    JSON.stringify({ files: newState, updatedAt: new Date().toISOString() }, null, 2)
  );
  await commitFilesToSyncBranch(
    octokit,
    new Map([[CONFIG.statePath, stateBuffer]]),
    "Mise à jour de l'état de synchronisation"
  );

  // 4) Résumé
  console.log("=== Résumé de la synchronisation ===");
  console.log(`GitHub -> Drive : ${summary.githubToDrive.length}`, summary.githubToDrive);
  console.log(`Drive -> GitHub : ${summary.driveToGithub.length}`, summary.driveToGithub);
  console.log(`Conflits (GitHub prioritaire) : ${summary.conflicts.length}`, summary.conflicts);
  console.log(`Supprimés côté GitHub (non propagé) : ${summary.deletedOnGithub.length}`, summary.deletedOnGithub);
  console.log(`Supprimés côté Drive (non propagé) : ${summary.deletedOnDrive.length}`, summary.deletedOnDrive);
  console.log(`Inchangés : ${summary.unchanged}`);
}

async function downloadDriveFile(drive, fileId) {
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data);
}

main().catch((err) => {
  console.error("Erreur durant la synchronisation :", err);
  process.exit(1);
});
