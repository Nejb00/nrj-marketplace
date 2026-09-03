import os
import json
import urllib.request
import urllib.error
import re

NOTION_TOKEN = (os.environ.get("NOTION_TOKEN") or "").strip()
RAW_PAGE_INPUT = (os.environ.get("NOTION_PAGE_ID") or "").strip()
REPO_NAME = os.environ.get("GITHUB_REPOSITORY", "Dépôt GitHub")

# Extraction robuste de l'ID Notion (32 caractères HEX)
all_hex = re.findall(r'[a-fA-F0-9]{32}', RAW_PAGE_INPUT)
if all_hex:
    raw_id = all_hex[-1]
else:
    raw_id = re.sub(r'[^a-fA-F0-9]', '', RAW_PAGE_INPUT)

if len(raw_id) == 32:
    PAGE_ID = f"{raw_id[:8]}-{raw_id[8:12]}-{raw_id[12:16]}-{raw_id[16:20]}-{raw_id[20:]}"
else:
    PAGE_ID = RAW_PAGE_INPUT

print(f"ID Notion ciblé : {PAGE_ID}")

# Headers communs à toutes les requêtes.
# Un User-Agent explicite est INDISPENSABLE : Cloudflare bloque les requêtes
# urllib qui envoient l'User-Agent par défaut "Python-urllib/3.x" (403).
BASE_HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": "2022-06-28",
    "User-Agent": "nrj-marketplace-notion-sync/1.0 (+https://github.com/Nejb00/nrj-marketplace)",
}

EXCLUDE_DIRS = {'.git', 'node_modules', 'dist', 'build', '.next', '.cache'}
EXCLUDE_FILES = {'package-lock.json', 'yarn.lock'}

LANG_MAP = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.css': 'css',
    '.html': 'html',
    '.json': 'json',
    '.py': 'python',
    '.md': 'markdown',
    '.yml': 'yaml',
    '.yaml': 'yaml'
}

def get_language(filename):
    ext = os.path.splitext(filename)[1].lower()
    return LANG_MAP.get(ext, 'plain text')

def chunk_text(text, max_len=1900):
    if not text:
        return ["// Fichier vide"]
    return [text[i:i + max_len] for i in range(0, len(text), max_len)]

def clear_existing_blocks():
    """Supprime les anciens blocs de la page Notion pour repartir à zéro"""
    url = f"https://api.notion.com/v1/blocks/{PAGE_ID}/children?page_size=100"
    headers = dict(BASE_HEADERS)
    req = urllib.request.Request(url, headers=headers, method='GET')
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            blocks = data.get('results', [])
            for block in blocks:
                del_url = f"https://api.notion.com/v1/blocks/{block['id']}"
                del_req = urllib.request.Request(del_url, headers=headers, method='DELETE')
                try:
                    urllib.request.urlopen(del_req)
                except Exception:
                    pass
    except Exception as e:
        print(f"Note lors du nettoyage : {e}")

def push_blocks_in_batches(blocks):
    """Envoie les blocs à Notion par paquets de 100 (limite API)"""
    url = f"https://api.notion.com/v1/blocks/{PAGE_ID}/children"
    headers = {**BASE_HEADERS, "Content-Type": "application/json"}

    batch_size = 80
    for i in range(0, len(blocks), batch_size):
        batch = blocks[i:i + batch_size]
        payload = {"children": batch}
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers=headers, method='PATCH')
        try:
            with urllib.request.urlopen(req) as resp:
                print(f"Séquence {i // batch_size + 1} envoyée ({len(batch)} blocs)")
        except urllib.error.HTTPError as e:
            print(f"Erreur HTTP {e.code}: {e.read().decode('utf-8')}")
            raise e

def generate_notion_content():
    all_blocks = []
    all_blocks.append({
        "object": "block",
        "type": "heading_1",
        "heading_1": {
            "rich_text": [{"type": "text", "text": {"content": f"🚀 Code Source : {REPO_NAME}"}}]
        }
    })

    file_list = []
    total_chars = 0

    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for f in sorted(files):
            if f.startswith('.') or f in EXCLUDE_FILES:
                continue
            filepath = os.path.normpath(os.path.join(root, f))
            file_list.append(filepath)

    file_list.sort()

    for filepath in file_list:
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as file_obj:
                content = file_obj.read()
        except Exception as e:
            content = f"// Erreur de lecture : {e}"

        char_count = len(content)
        total_chars += char_count
        lang = get_language(filepath)
        chunks = chunk_text(content)

        children_code_blocks = []
        for chunk in chunks:
            children_code_blocks.append({
                "object": "block",
                "type": "code",
                "code": {
                    "rich_text": [{"type": "text", "text": {"content": chunk}}],
                    "language": lang
                }
            })

        toggle_block = {
            "object": "block",
            "type": "toggle",
            "toggle": {
                "rich_text": [
                    {
                        "type": "text",
                        "text": {"content": f"📄 {filepath} "},
                        "annotations": {"bold": True}
                    },
                    {
                        "type": "text",
                        "text": {"content": f"({char_count:,} caractères)"},
                        "annotations": {"italic": True, "color": "gray"}
                    }
                ],
                "children": children_code_blocks[:100]
            }
        }
        all_blocks.append(toggle_block)

    summary_block = {
        "object": "block",
        "type": "callout",
        "callout": {
            "rich_text": [{
                "type": "text",
                "text": {"content": f"📊 Projet synchronisé : {len(file_list)} fichiers | {total_chars:,} caractères au total.\nCliquez sur un fichier pour dérouler son code ou laissez Claude lire la page."}
            }],
            "icon": {"type": "emoji", "emoji": "⚡"}
        }
    }
    all_blocks.insert(1, summary_block)

    return all_blocks

if __name__ == "__main__":
    print("Nettoyage de l'ancienne page Notion...")
    clear_existing_blocks()
    print("Génération du code source pour Notion...")
    blocks = generate_notion_content()
    print(f"Envoi de {len(blocks)} éléments vers Notion...")
    push_blocks_in_batches(blocks)
    print("Synchronisation terminée avec succès !")
