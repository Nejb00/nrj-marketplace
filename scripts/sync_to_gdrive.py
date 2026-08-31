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

Secrets GitHub requis (dans Settings -> Secrets -> Actions) :
  - GDRIVE_SERVICE_ACCOUNT : contenu JSON de la clé du compte de service Google.
  - GDRIVE_PARENT_FOLDER_ID : ID du dossier Drive racine (partagé avec le compte de service).
"""

import os
import json
import hashlib
import mimetypes

try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaInMemoryUpload
except ImportError:
    print("ERREUR : installe les dépendances avec : pip install google-api-python-client google-auth")
    raise

# Configuration
SERVICE_ACCOUNT_JSON = os.environ.get("GDRIVE_SERVICE_ACCOUNT", "").strip()
PARENT_FOLDER_ID = os.environ.get("GDRIVE_PARENT_FOLDER_ID", "").strip()
REPO_NAME = os.environ.get("GITHUB_REPOSITORY", os.path.basename(os.getcwd())).split("/")[-1]

EXCLUDE_DIRS = {".git", "node_modules", "dist", "build", ".next", ".cache"}
EXCLUDE_FILES = {"package-lock.json", "yarn.lock"}

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
    if not SERVICE_ACCOUNT_JSON:
        raise SystemExit("GDRIVE_SERVICE_ACCOUNT manquant.")
    if not PARENT_FOLDER_ID:
        raise SystemExit("GDRIVE_PARENT_FOLDER_ID manquant.")
    try:
        info = json.loads(SERVICE_ACCOUNT_JSON)
    except json.JSONDecodeError as e:
        raise SystemExit(f"GDRIVE_SERVICE_ACCOUNT n'est pas du JSON valide : {e}")
    scopes = ["https://www.googleapis.com/auth/drive"]
    creds = service_account.Credentials.from_service_account_info(info, scopes=scopes)
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
            if f.startswith(".") or f in EXCLUDE_FILES:
                continue
            rel = os.path.relpath(os.path.join(root, f), ".")
            file_list.append(os.path.normpath(rel))
    file_list.sort()
    return file_list

def sync():
    print(f"Dossier racine : {REPO_NAME}")
    service = get_drive_service()
    root_folder_id = ensure_folder(service, REPO_NAME, PARENT_FOLDER_ID)
    print(f"Dossier racine Drive : {REPO_NAME} ({root_folder_id})")
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
