#!/usr/bin/env python3
"""
Synchronisation GitHub -> Google Drive (miroir fichier par fichier).

Fonctionnement :
  - Scanne le dépôt local (checkout GitHub Actions).
  - Crée un dossier racine <repo-name> sous le dossier Drive parent.
  - Crée les sous-dossiers nécessaires (src/css, src/js, ...).
  - Pour chaque fichier : crée ou met à jour son contenu dans Drive.
  - Compare un hash MD5 pour ne renvoyer que les fichiers modifiés.
  - Supprime les fichiers Drive qui n'existent plus dans le dépôt.

Secrets GitHub requis (les MÊMES que le workflow Node drive-sync.mjs) :
  - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN : OAuth Google.
  - GDRIVE_PARENT_FOLDER_ID (ou DRIVE_FOLDER_ID) : ID du dossier Drive racine du miroir.

Note : le miroir écrit directement dans ce dossier racine (comme drive-sync.mjs)
pour que les deux workflows entretiennent le MÊME miroir Drive.
"""

import os
import json
import hashlib
import mimetypes

try:
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaInMemoryUpload
except ImportError:
    print("ERREUR : installe les dépendances avec : pip install google-api-python-client google-auth")
    raise

# Configuration — OAuth identique au script Node (aucun compte de service requis)
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
GOOGLE_REFRESH_TOKEN = os.environ.get("GOOGLE_REFRESH_TOKEN", "").strip()
PARENT_FOLDER_ID = (os.environ.get("GDRIVE_PARENT_FOLDER_ID")
                    or os.environ.get("DRIVE_FOLDER_ID") or "").strip()
REPO_NAME = os.environ.get("GITHUB_REPOSITORY", os.path.basename(os.getcwd())).split("/")[-1]

# Aligné sur drive-sync.mjs (isIgnored) pour ne pas entrer en conflit avec lui :
# le Node ne supprime pas, ce script si — les filtres doivent coïncider,
# sinon ping-pong de suppressions/créations entre les deux workflows.
EXCLUDE_DIRS = {".git", "node_modules", "dist", "build", ".next", ".cache", ".drive-sync"}
EXCLUDE_FILES = set()

TEXT_MIME_OVERRIDES = {
    ".js":   "application/javascript",
    ".jsx":  "application/javascript",
    ".ts":   "application/javascript",
    ".tsx":  "application/javascript",
    ".css":  "text/css",
    ".html": "text/html",
    ".json": "application/json",
    ".py":   "text/x-python",
    ".md":   "text/markdown",
    ".yml":  "text/yaml",
    ".yaml": "text/yaml",
    ".svg":  "image/svg+xml",
    ".webmanifest": "application/json",
}

def get_drive_service():
    if not (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN):
        raise SystemExit("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN manquants.")
    if not PARENT_FOLDER_ID:
        raise SystemExit("GDRIVE_PARENT_FOLDER_ID (ou DRIVE_FOLDER_ID) manquant.")
    creds = Credentials(
        token=None,
        refresh_token=GOOGLE_REFRESH_TOKEN,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
    )
    return build("drive", "v3", credentials=creds, cache_discovery=False)

def md5_of_file(filepath):
    h = hashlib.md5()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()

def mime_for(filepath):
    ext = os.path.splitext(filepath)[1].lower()
    if ext in TEXT_MIME_OVERRIDES:
        return TEXT_MIME_OVERRIDES[ext]
    guessed, _ = mimetypes.guess_type(filepath)
    return guessed or "application/octet-stream"

def list_files_in_folder(service, folder_id):
    result = {}
    page_token = None
    while True:
        resp = service.files().list(
            q=f"'{folder_id}' in parents and trashed = false",
            fields="nextPageToken, files(id, name, mimeType, md5Checksum)",
            pageSize=200, pageToken=page_token,
        ).execute()
        for f in resp.get("files", []):
            if f.get("mimeType") != "application/vnd.google-apps.folder":
                result[f["name"]] = {"id": f["id"], "md5": f.get("md5Checksum", "")}
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return result

def find_folder(service, name, parent_id):
    resp = service.files().list(
        q=f"name = '{name}' and mimeType = 'application/vnd.google-apps.folder' and '{parent_id}' in parents and trashed = false",
        fields="files(id, name)", pageSize=1,
    ).execute()
    files = resp.get("files", [])
    return files[0]["id"] if files else None

def ensure_folder(service, name, parent_id):
    existing = find_folder(service, name, parent_id)
    if existing:
        return existing
    created = service.files().create(
        body={"name": name, "mimeType": "application/vnd.google-apps.folder", "parents": [parent_id]},
        fields="id",
    ).execute()
    return created["id"]

def ensure_path(service, rel_path, root_folder_id):
    if not rel_path:
        return root_folder_id
    current_parent = root_folder_id
    for part in rel_path.split(os.sep):
        current_parent = ensure_folder(service, part, current_parent)
    return current_parent

def upload_file(service, filepath, folder_id):
    name = os.path.basename(filepath)
    mime = mime_for(filepath)
    media = MediaInMemoryUpload(open(filepath, "rb").read(), mimetype=mime, resumable=False)
    created = service.files().create(body={"name": name, "parents": [folder_id]}, media_body=media, fields="id").execute()
    return created.get("id")

def update_file(service, local_path, file_id):
    mime = mime_for(local_path)
    media = MediaInMemoryUpload(open(local_path, "rb").read(), mimetype=mime, resumable=False)
    service.files().update(fileId=file_id, media_body=media, fields="id").execute()

def delete_file(service, file_id):
    service.files().delete(fileId=file_id).execute()

def collect_local_files():
    file_list = []
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for f in sorted(files):
            if f in EXCLUDE_FILES:
                continue
            rel = os.path.relpath(os.path.join(root, f), ".")
            file_list.append(os.path.normpath(rel))
    file_list.sort()
    return file_list

def sync():
    service = get_drive_service()
    # Racine = PARENT_FOLDER_ID directement (même miroir que drive-sync.mjs,
    # pas de sous-dossier <repo-name>) pour éviter deux miroirs divergents.
    root_folder_id = PARENT_FOLDER_ID
    print(f"Dossier racine Drive : {root_folder_id}")
    local_files = collect_local_files()
    print(f"Fichiers locaux a synchroniser : {len(local_files)}")
    created_count = 0; updated_count = 0; skipped_count = 0
    folder_cache = {"": root_folder_id}
    drive_file_ids_seen = set()
    for rel_path in local_files:
        rel_dir = os.path.dirname(rel_path)
        if rel_dir not in folder_cache:
            folder_cache[rel_dir] = ensure_path(service, rel_dir, root_folder_id)
        parent_id = folder_cache[rel_dir]
        existing = list_files_in_folder(service, parent_id)
        fname = os.path.basename(rel_path)
        local_md5 = md5_of_file(rel_path)
        if fname in existing:
            if existing[fname]["md5"] == local_md5:
                skipped_count += 1
                drive_file_ids_seen.add(existing[fname]["id"])
                continue
            update_file(service, rel_path, existing[fname]["id"])
            updated_count += 1
            drive_file_ids_seen.add(existing[fname]["id"])
            print(f"  ~ mis a jour : {rel_path}")
        else:
            file_id = upload_file(service, rel_path, parent_id)
            created_count += 1
            drive_file_ids_seen.add(file_id)
            print(f"  + cree : {rel_path}")
    deleted_count = 0
    for rel_dir, folder_id in folder_cache.items():
        existing = list_files_in_folder(service, folder_id)
        for fname, info in existing.items():
            if info["id"] not in drive_file_ids_seen:
                display = os.path.join(rel_dir, fname) if rel_dir else fname
                try:
                    delete_file(service, info["id"])
                    deleted_count += 1
                    print(f"  - supprime : {display}")
                except Exception as e:
                    print(f"  ! erreur suppression {display} : {e}")
    print(f"\n{'=' * 50}")
    print(f"Synchronisation terminee : {REPO_NAME}")
    print(f"  + crees      : {created_count}")
    print(f"  ~ mis a jour  : {updated_count}")
    print(f"  = inchanges   : {skipped_count}")
    print(f"  - supprimes   : {deleted_count}")
    print(f"  Total fichiers: {len(local_files)}")

if __name__ == "__main__":
    print(f"Sync GitHub -> Google Drive : {REPO_NAME}")
    print(f"Parent folder ID : {PARENT_FOLDER_ID}")
    sync()
