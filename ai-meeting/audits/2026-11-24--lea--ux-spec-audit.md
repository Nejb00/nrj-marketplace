# NRJ Marketplace — Audit croisé UX / spécifications (Léa)

- **Date :** 2026-11-24
- **Agent :** Léa (ChatGPT)
- **Branche d'audit :** `audit/ai-cross-review-2026-11-24-lea`
- **Base observée :** `main` — `c35e887cb878e5e55c0d46a250b4d4b801ab482b`
- **Portée :** revue statique en lecture seule du dépôt GitHub, de la documentation, des contrats UI, du flux de commande et des PR ouvertes.
- **Hors périmètre :** aucune modification du code applicatif, aucune action sur Vercel/Supabase, aucune commande réelle, aucun test navigateur ou achat en production.

## 1. Synthèse exécutive

NRJ possède une direction UX cohérente et documentée : mobile-first, content-first, surfaces Liquid Glass fonctionnelles, hiérarchie produit/prix/action, accessibilité et attention aux appareils modestes. Le dépôt contient également des contrats de design automatisés et une gouvernance technique qui distingue correctement preuve, validation et déploiement.

Les principaux risques observés dans cette revue ne sont pas l'absence de vision, mais **l'écart entre la documentation, les branches de travail et l'expérience réellement vérifiée** :

1. Plusieurs améliorations UX importantes restent en PR ouvertes et ne sont donc pas confirmées dans `main`.
2. La validation visuelle réelle reste incomplète pour le catalogue avec images, la fiche produit, le panier et Mon NRJ.
3. Le parcours de commande est encore principalement WhatsApp, avec une création de commande distante best-effort et un fallback local/WhatsApp.
4. La documentation d'entrée du dépôt est fragmentée depuis la suppression du README racine.
5. Le tableau de bord d'automatisation présente un compteur de PR qui ne correspond plus à la recherche GitHub actuelle.

## 2. Ce qui est solide

### 2.1 Direction UX claire

La constitution de design `docs/design/nrj-spatial-ui.md` définit des principes pertinents :
- priorité au contenu marchand plutôt qu'aux effets ;
- produits et informations importantes sur des surfaces opaques ;
- Liquid Glass réservé aux contrôles, navigation et overlays qui en ont besoin ;
- fallback opaque si le flou n'est pas supporté ;
- prise en compte de `prefers-reduced-motion` et `prefers-reduced-transparency` ;
- zones tactiles cibles d'au moins 44 px ;
- aucune information essentielle dépendante du hover ;
- limitation des effets coûteux sur mobile.

C'est une bonne base pour éviter une interface simplement « jolie » mais moins lisible ou moins performante.

### 2.2 Structure du parcours principal

Le HTML de `index.html` confirme une architecture centrée sur :
- recherche produit et recherche par photo ;
- catégories ;
- grille produits ;
- navigation basse Accueil / Catégories / Panier / Favoris / Mon NRJ ;
- fiche produit sous forme de dialogue/sheet.

La structure est alignée avec une expérience marketplace mobile-first. La revue statique ne prouve toutefois pas que tous les états, tailles d'écran et interactions fonctionnent actuellement en navigateur.

### 2.3 Contrats de design

`test/nrj-design-contract.test.js` vérifie notamment :
- chargement des tokens et styles Glass ;
- cible tactile minimale de 44 px ;
- rayons et tokens de mouvement ;
- fallback et réduction de transparence ;
- lisibilité et focus des cartes ;
- structure et profondeur de la navigation et des panneaux.

Ces tests sont utiles comme garde-fous de régression, mais ne remplacent pas une QA visuelle sur de vraies images et de vrais appareils.

## 3. Constats et écarts à traiter

### UX-01 — Validation visuelle réelle incomplète
**Priorité : P1 — confiance UX**

La note active `docs/operations/mission-control/active/NRJ-DES-001-liquid-glass-accessibility.md` indique que les contrôles locaux précédents passaient, mais que l'environnement de test avait détecté 12 cartes produits et zéro élément image chargé. Elle indique explicitement que la QA visuelle du catalogue/imagery, de la fiche produit, du panier et de Mon NRJ restait à faire.

**Impact :** les contrats CSS et tests automatisés peuvent passer alors que le rendu réel, les images, les états de chargement ou les superpositions ne sont pas satisfaisants.

**Recommandation :** réaliser une passe visuelle ciblée avec données et images réellement chargées, sur au moins un viewport mobile étroit et un viewport desktop. Capturer les états accueil/catalogue, recherche, fiche produit/options, panier, checkout et Mon NRJ. Ne pas déclarer la mission design terminée avant cette vérification.

### UX-02 — Améliorations UX toujours en PR, non garanties sur main
**Priorité : P1 — cohérence de l'expérience**

La recherche des PR ouvertes montre notamment :
- [#246 — fallback Liquid Glass et cibles tactiles](https://github.com/Nejb00/nrj-marketplace/pull/246) ;
- [#234 — visibilité du bouton « Charger plus »](https://github.com/Nejb00/nrj-marketplace/pull/234) ;
- [#233 — retrait des quick filter chips](https://github.com/Nejb00/nrj-marketplace/pull/233) ;
- [#232 — header compact des catégories avec masquage au scroll](https://github.com/Nejb00/nrj-marketplace/pull/232) ;
- [#231 — lazy-loading de la fiche produit](https://github.com/Nejb00/nrj-marketplace/pull/231).

Ces PR sont des propositions en attente et ne doivent pas être décrites comme des corrections déjà livrées sur `main`.

**Impact :** l'interface de production peut différer des captures, descriptions ou intentions portées par ces branches.

**Recommandation :** faire une revue groupée des PR UI, mais vérifier individuellement base, divergence, checks et diff avant toute décision. Les PR ne doivent pas être fusionnées en bloc.

### UX-03 — Flux de commande encore WhatsApp-first
**Priorité : P1 — clarté du parcours et confiance client**

La lecture de `src/js/services/checkout.js` et `docs/payment-architecture.md` montre que :
- le client renseigne son nom et un numéro congolais au format attendu ;
- les articles indisponibles et les quantités inférieures au MOQ sont refusés ;
- la création distante de commande est tentée via `createRemoteOrder` ;
- si cette création échoue, le code poursuit avec un enregistrement local et l'ouverture de WhatsApp ;
- le paiement réel par fournisseur externe reste une architecture cible, pas un parcours de paiement confirmé comme actif.

**Impact :** le parcours peut être fonctionnel comme prise de commande assistée, mais ne doit pas être présenté comme un checkout avec paiement intégré. En cas d'échec distant, l'utilisateur reçoit un message de fallback ; la différence entre commande locale et commande enregistrée côté serveur mérite d'être très explicite.

**Recommandation :** afficher un état de confirmation distinct selon que la commande distante a réellement été créée ou que seul le fallback WhatsApp/local a été utilisé. Prévoir un identifiant de suivi seulement lorsqu'il existe réellement. Documenter clairement le rôle de WhatsApp et l'étape de paiement.

### UX-04 — Données personnelles dans le navigateur
**Priorité : P2 — transparence et confidentialité**

Le flux de commande conserve le nom et le téléphone du client dans `localStorage` sous des clés historiques `fluo_customer_name` et `fluo_customer_phone`.

**Impact :** la persistance facilite le réachat, mais l'utilisateur ne voit pas dans le code consulté d'information associée sur la conservation locale, ni de mécanisme de suppression exposé par ce flux précis. Cette lecture limitée ne prouve pas qu'aucun contrôle n'existe ailleurs dans l'application.

**Recommandation :** vérifier le parcours de confidentialité global et proposer une explication courte sur l'appareil partagé, ainsi qu'une action claire pour effacer les informations mémorisées si elle n'existe pas déjà.

### UX-05 — Documentation d'entrée du dépôt fragmentée
**Priorité : P2 — onboarding et maintenance**

Le README racine n'est plus présent sur `main` ; la PR [#242](https://github.com/Nejb00/nrj-marketplace/pull/242) documente sa suppression. Les informations de travail existent dans `AGENTS.md`, `docs/operations/mission-control/README.md`, les documents d'architecture et les notes de mission.

**Impact :** les agents et contributeurs expérimentés disposent d'un protocole, mais un nouvel arrivant ne trouve pas immédiatement une page racine courte expliquant le produit, le démarrage local, les scripts utiles, l'architecture et les liens vers la documentation.

**Recommandation :** envisager un README racine minimal orienté produit et démarrage, qui renvoie vers Mission Control et les documents spécialisés. Il s'agit d'une proposition documentaire, pas d'une demande de rétablir l'ancien README à l'identique.

### UX-06 — Tableau de bord et état GitHub pas parfaitement synchronisés
**Priorité : P2 — fiabilité de l'information**

La recherche GitHub du 24 novembre retourne **17 PR ouvertes** dans le dépôt. Le contenu de l'issue [#90 — NRJ Automation Dashboard](https://github.com/Nejb00/nrj-marketplace/issues/90) affiche un compteur de 16 PR ouvertes vers `main`.

**Impact :** un tableau de bord est utile seulement si ses chiffres sont datés et réconciliés avec les données GitHub actuelles. L'écart peut venir du périmètre de comptage (PR vers main ou toutes les PR ouvertes) ou d'un décalage de rafraîchissement ; la cause n'a pas été établie dans cette revue.

**Recommandation :** préciser le périmètre du compteur, son horodatage et le lien vers la requête source. Éviter de comparer un total de toutes les branches avec un total limité aux PR vers `main`.

## 4. Risques de confusion à éviter

- Une PR ouverte n'est pas une fonctionnalité en production.
- Un test de contrat UI réussi ne prouve pas la qualité du rendu réel.
- Un ordre sauvegardé localement n'est pas nécessairement une commande distante.
- Une architecture de paiement documentée n'est pas une activation de paiement.
- Un rapport historique de Mission Control ne constitue pas un état opérationnel actuel.
- Une synchronisation proposée ou un workflow en lecture seule ne signifie pas qu'un writer Notion automatique est actif.

## 5. Plan recommandé

1. **QA visuelle** — vérifier les vrais médias et les parcours clés sur mobile et desktop.
2. **Revue des PR UX** — comparer #246, #234, #233, #232 et #231 à `main`, sans fusion automatique.
3. **Clarté du checkout** — séparer explicitement confirmation distante, fallback local et envoi WhatsApp.
4. **Confidentialité** — examiner l'information et les contrôles autour du nom/téléphone mémorisés.
5. **Documentation** — proposer un README racine synthétique et des liens cohérents.
6. **Dashboard** — clarifier la définition et la fraîcheur du compteur de PR.

## 6. Limites de cet audit

- Audit statique du dépôt GitHub et des documents consultés sur `main` au commit indiqué.
- Aucun navigateur réel n'a été lancé ; aucun screenshot visuel n'a été vérifié dans cette session.
- Aucun workflow n'a été relancé.
- Aucun accès en lecture à Vercel ou Supabase n'a été utilisé pour cette revue UX.
- Les déclarations et descriptions de PR sont traitées comme des éléments de contexte, pas comme une preuve de comportement en production.
- Les constats sur le stockage local proviennent du fichier de checkout consulté et ne couvrent pas tous les autres écrans ou mécanismes de l'application.

## 7. Conclusion

La base UX de NRJ est réfléchie et plutôt mature sur le plan des principes. Le prochain gain le plus important n'est pas d'ajouter encore des effets visuels : c'est de **fermer la boucle entre intention, implémentation, QA réelle et état livré**. La priorité est donc de vérifier les parcours réels et de clarifier le checkout, puis de traiter les PR UX ouvertes avec une revue factuelle.

---

*Rapport préparé en lecture seule. Aucun changement applicatif, aucune modification de production et aucune fusion n'ont été effectués.*
