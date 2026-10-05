import os
import json
import urllib.request
import urllib.error
import re
import time

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

# Fichiers binaires : illisibles en bloc de code, très lourds, et c'est eux
# qui faisaient exploser les requêtes (PNG de 762 Ko lu comme du texte !).
# Le .svg reste inclus : c'est du texte lisible et éditable.
BINARY_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico',
                     '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.mp4',
                     '.zip', '.pdf'}

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

# Limites d'envoi.
# Notion n'autorise que 100 blocs enfants par bloc parent, mais surtout :
# embarquer tout le code du repo dans une seule requête PATCH déclenche un
# HTTP 413 "Payload Too Large" depuis que le projet a grossi (refacto,
# liquid-glass, admin). On garde donc une marge large par requête.
MAX_CHILDREN_PER_TOGGLE = 100      # limite dure de l'API Notion
CHILDREN_BATCH_SIZE = 40           # ~76 Ko max par requête (40 x 1900 car.)
TOP_LEVEL_BATCH_SIZE = 25          # blocs racine (petits : titres de toggles)

# Notion applique une limite de débit moyenne et peut répondre HTTP 429
# pendant les longues synchronisations (beaucoup de DELETE/PATCH successifs).
# On espace légèrement les requêtes et on respecte Retry-After avec backoff.
NOTION_MIN_REQUEST_INTERVAL = 0.4  # ~2,5 requêtes/s maximum
NOTION_RETRY_ATTEMPTS = 6
NOTION_MAX_RETRY_DELAY = 30

def get_language(filename):
    ext = os.path.splitext(filename)[1].lower()
    return LANG_MAP.get(ext, 'plain text')

def chunk_text(text, max_len=1900):
    if not text:
        return ["// Fichier vide"]
    return [text[i:i + max_len] for i in range(0, len(text), max_len)]

_last_notion_request_at = 0.0


def notion_request(method, url, payload=None):
    """Requête Notion avec pacing et retry ciblé des HTTP 429."""
    global _last_notion_request_at

    headers = dict(BASE_HEADERS)
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode('utf-8')

    for attempt in range(NOTION_RETRY_ATTEMPTS):
        # Évite les rafales de DELETE/PATCH qui déclenchent le rate limit.
        elapsed = time.monotonic() - _last_notion_request_at
        if elapsed < NOTION_MIN_REQUEST_INTERVAL:
            time.sleep(NOTION_MIN_REQUEST_INTERVAL - elapsed)

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                _last_notion_request_at = time.monotonic()
                body = resp.read().decode('utf-8')
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as e:
            _last_notion_request_at = time.monotonic()
            body = e.read().decode('utf-8')
            if e.code != 429 or attempt == NOTION_RETRY_ATTEMPTS - 1:
                print(f"Erreur HTTP {e.code}: {body}")
                raise

            retry_after_raw = e.headers.get("Retry-After", "")
            try:
                retry_after = float(retry_after_raw)
            except (TypeError, ValueError):
                retry_after = 2 ** attempt

            delay = min(max(retry_after, 1.0), NOTION_MAX_RETRY_DELAY)
            print(
                f"HTTP 429 Notion : nouvelle tentative "
                f"{attempt + 2}/{NOTION_RETRY_ATTEMPTS} dans {delay:.1f}s"
            )
            time.sleep(delay)

def clear_existing_blocks():
    """Supprime les anciens blocs de la page Notion pour repartir à zéro.
    Pagination ajoutée : au-delà de 100 blocs racine, l'ancien nettoyage
    laissait des blocs orphelins s'accumuler sur la page."""
    cursor = None
    total_deleted = 0
    while True:
        url = f"https://api.notion.com/v1/blocks/{PAGE_ID}/children?page_size=100"
        if cursor:
            url += f"&start_cursor={cursor}"
        data = notion_request('GET', url)
        for block in data.get('results', []):
            try:
                notion_request('DELETE', f"https://api.notion.com/v1/blocks/{block['id']}")
                total_deleted += 1
            except Exception:
                pass
        if not data.get('has_more'):
            break
        cursor = data.get('next_cursor')
    print(f"Anciens blocs supprimés : {total_deleted}")

def push_children(parent_id, children, label=""):
    """Envoie les blocs enfants d'un parent par petits paquets (anti-413)."""
    url = f"https://api.notion.com/v1/blocks/{parent_id}/children"
    for i in range(0, len(children), CHILDREN_BATCH_SIZE):
        batch = children[i:i + CHILDREN_BATCH_SIZE]
        notion_request('PATCH', url, {"children": batch})
        print(f"  {label} : séquence {i // CHILDREN_BATCH_SIZE + 1}"
              f"/{(len(children) + CHILDREN_BATCH_SIZE - 1) // CHILDREN_BATCH_SIZE}"
              f" ({len(batch)} blocs)")

def make_code_blocks(chunks, lang):
    return [{
        "object": "block",
        "type": "code",
        "code": {
            "rich_text": [{"type": "text", "text": {"content": chunk}}],
            "language": lang
        }
    } for chunk in chunks]

def make_toggle_header(filepath, char_count, part, parts):
    """Bloc toggle SANS enfants imbriqués : le code sera envoyé séparément,
    requête par requête, pour rester sous les limites de taille de payload."""
    label = f"📄 {filepath}"
    if parts > 1:
        label += f" — partie {part}/{parts}"
    return {
        "object": "block",
        "type": "toggle",
        "toggle": {
            "rich_text": [
                {
                    "type": "text",
                    "text": {"content": label},
                    "annotations": {"bold": True}
                },
                {
                    "type": "text",
                    "text": {"content": f" ({char_count:,} caractères)"},
                    "annotations": {"italic": True, "color": "gray"}
                }
            ]
        }
    }

def generate_content():
    """Retourne (blocs_racine, fichiers) où fichiers = liste de
    (bloc_toggle_sans_enfants, blocs_de_code_a_ajouter_dedans)."""
    top_blocks = [{
        "object": "block",
        "type": "heading_1",
        "heading_1": {
            "rich_text": [{"type": "text", "text": {"content": f"🚀 Code Source : {REPO_NAME}"}}]
        }
    }]

    file_list = []
    binary_count = 0
    total_chars = 0

    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for f in sorted(files):
            if f.startswith('.') or f in EXCLUDE_FILES:
                continue
            if os.path.splitext(f)[1].lower() in BINARY_EXTENSIONS:
                binary_count += 1
                continue
            filepath = os.path.normpath(os.path.join(root, f))
            file_list.append(filepath)

    file_list.sort()
    if binary_count:
        print(f"{binary_count} fichiers binaires ignorés (images, polices…)")

    file_entries = []
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

        # Découpage en "parties" de 100 chunks max (= 190 000 caractères) :
        # l'ancien [:100] tronquait silencieusement les gros fichiers.
        parts = [chunks[i:i + MAX_CHILDREN_PER_TOGGLE]
                 for i in range(0, len(chunks), MAX_CHILDREN_PER_TOGGLE)]
        for index, part_chunks in enumerate(parts):
            header = make_toggle_header(filepath, char_count, index + 1, len(parts))
            file_entries.append((header, make_code_blocks(part_chunks, lang)))

    summary_block = {
        "object": "block",
        "type": "callout",
        "callout": {
            "rich_text": [{
                "type": "text",
                "text": {"content": f"📊 Projet synchronisé : {len(file_list)} fichiers | {total_chars:,} caractères au total.\n🧿 {binary_count} fichiers binaires (images, polices) non inclus.\nCliquez sur un fichier pour dérouler son code ou laissez Claude lire la page."}
            }],
            "icon": {"type": "emoji", "emoji": "⚡"}
        }
    }
    top_blocks.insert(1, summary_block)
    return top_blocks, file_entries

if __name__ == "__main__":
    print("Nettoyage de l'ancienne page Notion...")
    clear_existing_blocks()
    print("Génération du code source pour Notion...")
    top_blocks, file_entries = generate_content()
    print(f"{len(file_entries)} fichiers à envoyer...")

    # 1) Créer tous les blocs racine (titres vides) par petits lots et
    #    mémoriser leur ID renvoyé par l'API.
    headers_with_children = [header for header, _ in file_entries]
    all_root = top_blocks + headers_with_children
    id_by_header_index = {}
    for i in range(0, len(all_root), TOP_LEVEL_BATCH_SIZE):
        batch = all_root[i:i + TOP_LEVEL_BATCH_SIZE]
        resp = notion_request(
            'PATCH',
            f"https://api.notion.com/v1/blocks/{PAGE_ID}/children",
            {"children": batch}
        )
        for local_index, created in enumerate(resp.get('results', [])):
            global_index = i + local_index
            id_by_header_index[global_index] = created['id']
        print(f"Blocs racine {i + 1}-{i + len(batch)} créés")

    # 2) Remplir chaque toggle avec son code, fichier par fichier,
    #    en petites requêtes : plus aucune payload ne transporte tout le repo.
    first_header_position = len(top_blocks)
    for j, (header, children) in enumerate(file_entries):
        global_index = first_header_position + j
        block_id = id_by_header_index.get(global_index)
        if not block_id:
            print(f"⚠️ ID manquant pour le bloc {global_index}, fichier ignoré")
            continue
        label = header["toggle"]["rich_text"][0]["text"]["content"]
        push_children(block_id, children, label)

    print("Synchronisation terminée avec succès !")
