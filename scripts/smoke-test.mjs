import { spawn } from "node:child_process";
import { request } from "node:http";

const HOST = "127.0.0.1";
const PORT = 4173;
const BASE = `http://${HOST}:${PORT}`;
const START_TIMEOUT_MS = 15_000;

function get(pathname) {
  return new Promise((resolve, reject) => {
    const req = request(`${BASE}${pathname}`, { method: "GET" }, (res) => {
      let body = "";

      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk.toString();
      });
      res.on("end", () => {
        resolve({ status: res.statusCode ?? 0, body });
      });
    });

    req.on("error", reject);
    req.setTimeout(5_000, () => {
      req.destroy(new Error(`Timeout sur ${pathname}`));
    });
    req.end();
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const server = spawn(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "preview", "--", "--host", HOST, "--port", String(PORT)],
  { stdio: ["ignore", "pipe", "pipe"] }
);

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

try {
  const deadline = Date.now() + START_TIMEOUT_MS;
  let homepage = null;

  while (Date.now() < deadline) {
    try {
      homepage = await get("/");
      if (homepage.status === 200) break;
    } catch {
      // Le serveur n'est pas encore prêt.
    }
    await wait(250);
  }

  if (!homepage || homepage.status !== 200) {
    throw new Error(
      `Le serveur Vite Preview n'est pas disponible. Sortie:\n${serverOutput}`
    );
  }

  if (!/<html[\s>]/i.test(homepage.body) || !homepage.body.toLowerCase().includes("</html>")) {
    throw new Error("La page d'accueil servie n'est pas un document HTML valide.");
  }

  const references = [...homepage.body.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((value) => value.startsWith("/") && !value.startsWith("//"))
    .filter((value) => !value.startsWith("/#"));

  const uniqueReferences = [...new Set(references)].slice(0, 12);

  for (const pathname of uniqueReferences) {
    const response = await get(pathname);
    if (response.status !== 200) {
      throw new Error(`Ressource invalide: ${pathname} -> HTTP ${response.status}`);
    }
  }

  console.log(
    `Smoke test OK — accueil HTTP 200, HTML valide, ${uniqueReferences.length} ressource(s) vérifiée(s).`
  );
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => server.once("exit", resolve));
}
