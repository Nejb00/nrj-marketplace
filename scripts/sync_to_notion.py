import os
import json
import urllib.request
import urllib.error
import re

NOTION_TOKEN = (os.environ.get("NOTION_TOKEN") or "").strip()
RAW_PAGE_ID = (os.environ.get("NOTION_PAGE_ID") or "").strip()
REPO_NAME = os.environ.get("GITHUB_REPOSITORY", "Dépôt GitHub")

# Nettoyage et formatage automatique de l'ID Notion au format UUID (8-4-4-4-12)
hex_chars = re.sub(r'[^a-fA-F0-9]', '', RAW_PAGE_ID)
if len(hex_chars) == 32:
    PAGE_ID = f"{hex_chars[:8]}-{hex_chars[8:12]}-{hex_chars[12:16]}-{hex_chars[16:20]}-{hex_chars[20:]}"
else:
    PAGE_ID = RAW_PAGE_ID

EXCLUDE_DIRS = {'.git', 'node_modules', 'dist', 'build', '.next', '.cache', '.github'}

def generate_tree_and_stats():
    tree_lines = []
    stats = {"total_files": 0, "total_dirs": 0, "extensions": {}}
    react_components = []

    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        
        level = root.replace('.', '').count(os.sep)
        indent = '  ' * level
        folder_name = os.path.basename(root)
        
        if folder_name and folder_name != '.':
            tree_lines.append(f"{indent}📁 {folder_name}/")
            stats["total_dirs"] += 1
            
        sub_indent = '  ' * (level + 1) if folder_name != '.' else ''
        for f in sorted(files):
            if f.startswith('.'): continue
            tree_lines.append(f"{sub_indent}📄 {f}")
            stats["total_files"] += 1
            
            ext = os.path.splitext(f)[1] or 'sans extension'
            stats["extensions"][ext] = stats["extensions"].get(ext, 0) + 1
            
            if ext in ['.jsx', '.tsx'] or (ext in ['.js', '.ts'] and f[0].isupper() and 'config' not in f):
                react_components.append(f)

    return "\n".join(tree_lines), stats, react_components

def send_to_notion(tree_str, stats, react_components):
    url = f"https://api.notion.com/v1/blocks/{PAGE_ID}/children"
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
    }

    ext_summary = ", ".join([f"{k}: {v}" for k, v in stats["extensions"].items()])
    react_summary = ", ".join(react_components[:10]) if react_components else "Aucun détecté"

    payload = {
        "children": [
            {
                "object": "block",
                "type": "heading_2",
                "heading_2": {"rich_text": [{"type": "text", "text": {"content": f"📊 Vue d'ensemble : {REPO_NAME}"}}]}
            },
            {
                "object": "block",
                "type": "callout",
                "callout": {
                    "rich_text": [{"type": "text", "text": {"content": f"📁 Dossiers : {stats['total_dirs']} | 📄 Fichiers : {stats['total_files']}\n🧩 Types : {ext_summary}\n⚛️ Composants React/JS : {len(react_components)} ({react_summary})"}}],
                    "icon": {"emoji": "🚀"}
                }
            },
            {
                "object": "block",
                "type": "heading_3",
                "heading_3": {"rich_text": [{"type": "text", "text": {"content": "🌳 Arborescence du dépôt"}}]}
            },
            {
                "object": "block",
                "type": "code",
                "code": {
                    "rich_text": [{"type": "text", "text": {"content": tree_str[:1900]}}],
                    "language": "plain text"
                }
            }
        ]
    }

    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers, method='PATCH')
    try:
        with urllib.request.urlopen(req) as response:
            print("Synchronisation Notion réussie !")
    except urllib.error.HTTPError as e:
        error_details = e.read().decode('utf-8')
        print(f"Erreur HTTP {e.code}: {e.reason}")
        print(f"Détails de l'erreur Notion : {error_details}")
        raise e

if __name__ == "__main__":
    tree, stats, components = generate_tree_and_stats()
    send_to_notion(tree, stats, components)
