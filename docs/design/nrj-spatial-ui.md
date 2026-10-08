# NRJ Spatial UI — Constitution du design

## Positionnement

NRJ Marketplace adopte une interface **content-first** : les produits, les prix et les actions utiles restent prioritaires. Le langage Liquid Glass est réservé aux surfaces fonctionnelles qui flottent au-dessus du contenu.

## Règles

1. Une surface vitrée doit avoir une raison fonctionnelle.
2. Pas de « glass on glass » inutile : un même groupe de contrôles partage une surface.
3. Les produits restent sur des surfaces solides et lisibles.
4. La couleur NRJ est un accent d'action et d'état, pas une peinture globale de l'interface.
5. Les animations expliquent une relation spatiale ou un changement d'état.
6. Chaque interaction tactile doit avoir un retour visible mais bref.
7. Le flou doit rester limité sur mobile pour préserver la fluidité.
8. Toute surface Glass possède un fallback opaque.
9. Les états de réduction du mouvement et de la transparence doivent rester accessibles.
10. Les composants partagés doivent être réutilisés entre catalogue, panier, checkout, compte et paramètres.

## Matériaux

- **Regular** : surface fonctionnelle par défaut.
- **Clear** : transparence renforcée, uniquement sur fonds suffisamment riches.
- **Floating** : navigation ou contrôle détaché du contenu.
- **Overlay** : sheets, menus et confirmations temporaires.

## Géométrie

Les rayons suivent l'échelle NRJ : 10 / 14 / 18 / 22 / 26 / 999px.

Les composants d'un même groupe doivent partager une logique de rayon et de profondeur.

## Mouvement

Références d'interaction : press = légère compression ; focus = contour NRJ clair ; apparition = courte montée/fusion ; fermeture = retour vers l'élément déclencheur ; scroll = aucun effet décoratif permanent.

`prefers-reduced-motion` désactive les ressorts et transitions non nécessaires.

## Performance

Le design doit rester exploitable sur des appareils mobiles modestes.

Les garde-fous principaux sont : animation d'arrière-plan désactivée sur petit écran ; blur réduit sur mobile ; `backdrop-filter` avec fallback ; `content-visibility` sur les sections tardives du profil ; images des rails via le pipeline de thumbnails existant.

## Mon NRJ

La hiérarchie cible est : **Identité → résumé → activité → raccourcis → commandes → récemment consultés → pour toi**.

Les paramètres restent dans une vue distincte afin de préserver la lisibilité du profil.

## Sécurité

Aucun changement visuel ne doit contourner l'authentification, les RLS, les contrôles de permissions ou les invariants de paiement.

## NRJ Design DNA — v1.0

### Hiérarchie
Le contenu marchand reste la couche primaire : produit, prix, disponibilité, variantes et action principale. Les surfaces fonctionnelles flottent au-dessus sans concurrencer ces informations.

### Couleur
- Orange NRJ : action, sélection et états importants.
- Neutres : structure, surfaces et texte.
- Couleurs sémantiques : uniquement pour communiquer un état (succès, erreur, attention).
- Pas de dégradé coloré généralisé sur les zones de contenu.

### Typographie
La typographie doit privilégier la lecture rapide sur mobile : titres courts et denses, libellés secondaires atténués, prix fortement hiérarchisés. Aucun effet de texte ne doit réduire le contraste.

### Espacement
L'interface suit une échelle de 4px et des incréments de 8px pour les regroupements. Les zones tactiles visent au minimum 44px.

### Matières
- Content surface : opaque et stable pour les produits et informations importantes.
- Regular glass : navigation, contrôles persistants et overlays fonctionnels.
- Clear glass : uniquement au-dessus de fonds visuellement riches.
- Overlay : confirmation, sheet, menu temporaire.

### Motion
Les animations expriment une relation spatiale ou un changement d'état. Aucun mouvement décoratif permanent sur petit écran. Les animations sont coupées avec prefers-reduced-motion.

### Accessibilité
Toutes les surfaces transparentes doivent conserver un fallback opaque avec prefers-reduced-transparency: reduce ou lorsque backdrop-filter n'est pas disponible. Les contrôles clavier gardent un anneau de focus visible.

### Responsive
Mobile-first : aucune information essentielle ne dépend d'un hover. Les interactions tactiles restent utilisables avec clavier, lecteur d'écran et affichage à contraste élevé.

### Évaluation
Une attaque design n'est considérée terminée que si :
1. la hiérarchie reste lisible en clair et sombre ;
2. la surface principale reste content-first ;
3. les fallbacks accessibilité existent ;
4. le build et les tests passent ;
5. aucun invariant métier, paiement, auth ou RLS n'est touché.
