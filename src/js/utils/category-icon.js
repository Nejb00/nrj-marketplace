// ═══ Utils — icône par catégorie ═══
// Éclaté de utils.js (refacto-archi).
export function getCategoryIcon(category) {
    if (!category) return '📦';
    const cat = category.toLowerCase();
    if (cat.includes('chaussure') || cat.includes('basket') || cat.includes('sneaker') || cat.includes('sport')) return '👟';
    if (cat.includes('electronique') || cat.includes('tech') || cat.includes('phone') || cat.includes('mobile')) return '📱';
    if (cat.includes('mode') || cat.includes('vetement') || cat.includes('fashion')) return '👕';
    if (cat.includes('bijou') || cat.includes('accessoire')) return '💍';
    if (cat.includes('maison') || cat.includes('deco')) return '🏠';
    if (cat.includes('beaute') || cat.includes('cosmetique')) return '💄';
    if (cat.includes('enfant') || cat.includes('jouet')) return '🧸';
    if (cat.includes('livre') || cat.includes('book')) return '📚';
    return '📦';
}
