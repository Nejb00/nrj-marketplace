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