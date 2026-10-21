# Audit mobile comparatif des sites universitaires du Congo-Brazzaville

- **Identifiant de connaissance :** IMB-AUD-001
- **Type :** Audit comparatif
- **Date de collecte :** 2026-10-20
- **Version documentaire :** 1.0 — archive versionnée le 2026-10-21
- **Statut :** Brouillon à relire ; les observations ci-dessous sont celles de l'audit daté du 20 octobre et ne signifient pas que les pages ont été recontrôlées aujourd'hui.
- **Périmètre :** lecture publique mobile, viewport approximatif 390 × 844
- **Source Notion originale :** https://app.notion.com/p/4000f09830e181af8ca4c3b0d8ba91c5
- **Fiche Knowledge Base :** https://app.notion.com/p/4000f09830e181be9511db55fa768061
- **Project Knowledge OS :** https://app.notion.com/p/4000f09830e181ed94c8e07c48871274

> Cette archive conserve le compte rendu initial. Elle ne remplace pas un nouvel audit en direct, ni un audit complet de performance, d'accessibilité, de sécurité ou de fonctionnement côté serveur.

## 1. Objectif

Comparer les sites publics d'établissements d'enseignement supérieur du Congo-Brazzaville pour inspirer la refonte proposée du site de l'Institut Management de Brazzaville (IMB), sans copier un site concurrent.

## 2. Résumé exécutif

- L'Université Libre du Congo (ULC) présentait un accès candidat visible dès l'accueil, mais les informations d'inscription consultées renvoyaient à la campagne 2024–2025.
- L'IMB présentait plusieurs appels à l'action utiles et la rentrée 2026–2027, mais sa page de préinscription indiquait que l'inscription en ligne n'était pas disponible.
- L'Université Marien Ngouabi (UMNG) présentait une variété de formations et une structure institutionnelle, mais l'accueil donnait une place importante à des contenus anciens.
- L'Institut Universitaire Henri Lopes (IUHL) présentait ses établissements, mais l'accès à l'inscription n'était pas évident depuis le premier écran mobile.
- L'Université Denis Sassou-N'Guesso (UDSN) proposait plusieurs pages administratives et étudiantes, mais l'accueil comportait des contenus et liens manifestement hors sujet. Cela mérite une vérification autorisée ; l'origine technique n'a pas été déterminée.

## 3. Méthode et périmètre

- Navigation publique sur téléphone, viewport approximatif de 390 × 844.
- Cinq sites : UMNG, UDSN, ULC, IUHL et IMB.
- Aucun compte privé n'a été utilisé.
- Aucun formulaire réel n'a été soumis ; aucune donnée personnelle saisie et aucun changement effectué.
- Les observations datent du compte rendu du 20 octobre 2026. Les URLs ci-dessous sont des sources à reconsulter, pas une affirmation de disponibilité actuelle.

## 4. Résultats par site

### 4.1 Université Marien Ngouabi (UMNG)

**Source :** https://www.umng.cg/?q=fr

**Points positifs rapportés**
- Les rubriques Formation, Établissements, Admission et Contact étaient repérables.
- L'offre de formations était variée et le site proposait des contenus institutionnels.

**Frottements observés**
- Sur mobile, la navigation était repliée derrière un menu.
- Le parcours vers l'admission n'était pas l'action la plus mise en avant.
- La page était longue et des actualités visibles étaient anciennes, notamment des contenus de 2023 et un concours 2022–2023.

**Piste proposée pour l'IMB**
Mettre la recherche de formation et le parcours d'admission en évidence avant les actualités secondaires.

**Note technique à confirmer**
Les métadonnées détectées indiquaient Drupal 7. Cela invite à vérifier la maintenance et les mises à jour, mais ne prouve pas à lui seul une vulnérabilité active.

### 4.2 Université Denis Sassou-N'Guesso (UDSN)

**Source :** https://www.udsn.cg/

**Points positifs rapportés**
- Des pages distinctes couvraient les formations, les inscriptions, les résultats et l'espace étudiant.
- Des documents de résultats étaient directement accessibles.

**Frottements observés**
- L'accueil mobile mettait particulièrement en avant les résultats PDF ; le parcours « futur étudiant » n'était pas le CTA le plus évident.
- La page était très longue et certains blocs semblaient répétitifs.
- L'extraction de contenu et l'inspection mobile avaient relevé des liens SEO, automobiles, de loterie/jeux et d'autres textes sans rapport avec l'université.

**Prudence d'interprétation**
Le contenu hors sujet réduit la crédibilité du site. Il peut être compatible avec du spam SEO ou une injection de contenu, mais aucune de ces causes n'a été confirmée. Seule une inspection autorisée du CMS, des fichiers et des journaux pourrait établir l'origine. Aucun test intrusif n'a été effectué.

**Piste proposée pour l'IMB**
Séparer clairement « Je veux rejoindre l'établissement » de « Je suis déjà étudiant » et garder l'accueil centré sur les informations officielles.

### 4.3 Université Libre du Congo (ULC)

**Sources**
- Site : https://universitelibreducongo.com/
- Informations d'inscription : https://universitelibreducongo.com/formations/offre/inscription-et-reinscription
- Portail ENT / intranet : https://universitelibreducongo.com/intranet/login-portail

**Points positifs rapportés**
- Le message d'inscription était visible sur l'accueil.
- Les formations, l'inscription et le portail étudiant étaient faciles à repérer.

**Frottements observés**
- Les informations publiques renvoyaient à la campagne 2024–2025.
- La procédure publiée demandait de contacter la scolarité et de fournir les pièces nécessaires ; une candidature numérique de bout en bout n'a pas été établie par cet audit.
- Un léger débordement visuel du carrousel était observé sur mobile.

**Piste proposée pour l'IMB**
Un CTA visible doit correspondre à un service réellement disponible ; dates et démarches doivent être tenues à jour.

### 4.4 Institut Universitaire Henri Lopes (IUHL)

**Source :** https://www.iuhledu.com/

**Points positifs rapportés**
- Présentation de plusieurs établissements et campus à Brazzaville et Pointe-Noire.
- Visuel et titre institutionnel lisibles sur mobile.

**Frottements observés**
- Aucun CTA Inscription, Admission ou Préinscription n'était évident sur le premier écran.
- Le visiteur devait ouvrir le menu ou chercher davantage pour trouver les prochaines étapes.

**Piste proposée pour l'IMB**
Mettre une entrée directe vers les formations et l'admission au niveau du premier écran.

### 4.5 Institut Management de Brazzaville (IMB)

**Sources**
- Site : https://imb-edu.cg/
- Page de préinscription : https://imb-edu.cg/preinscription.php

**Points positifs rapportés**
- Appels à l'action visibles : Inscription, Préinscription, Contact, rendez-vous et informations administratives.
- La rentrée 2026–2027 et plusieurs pôles de formation étaient mis en avant.
- Des actualités récentes figuraient sur l'accueil.

**Frottements observés**
- La page de préinscription indiquait que l'inscription en ligne n'était pas disponible.
- Un débordement horizontal d'environ 15 pixels avait été mesuré pendant l'inspection mobile.
- Les images étaient très larges, les carrousels nombreux et la page d'accueil extrêmement longue.
- Une page de formation conservait des dates de cours remontant à 2019.

**Pistes prioritaires proposées**
1. Corriger le débordement horizontal et adapter les images à la largeur des écrans.
2. Simplifier la page d'accueil et raccourcir le parcours.
3. Mettre à jour les contenus et identifier les archives anciennes.
4. Remplacer toute promesse de préinscription en ligne indisponible par une prochaine étape claire.
5. Étudier les besoins administratifs avant de proposer un système réel de préinscription.

## 5. Synthèse comparative

- **Parcours candidat le plus évident dans les pages publiques examinées :** ULC.
- **Exemple de plusieurs étapes administratives publiées :** UDSN.
- **Site cible avec opportunités d'amélioration mobile et de contenu :** IMB.
- **Point d'attention sur les contenus hors sujet :** UDSN, dont l'origine n'a pas été confirmée.

Ces constats décrivent les pages et comportements observés pendant l'audit. Ils ne démontrent pas que tous les parcours de formulaire, portails privés, paiements ou services authentifiés fonctionnent ou échouent.

## 6. Limites et inconnues

- Lecture publique et navigation mobile uniquement ; aucun compte privé utilisé.
- Aucun formulaire réel soumis, aucune donnée personnelle saisie et aucun changement effectué.
- La vérification visuelle desktop n'a pas abouti pour UMNG, UDSN, ULC et IUHL en raison d'une erreur de connexion de l'outil de navigation. Leur affichage desktop n'est donc pas considéré comme vérifié.
- Aucun score Lighthouse/Core Web Vitals, audit d'accessibilité exhaustif ou scan de sécurité n'a été réalisé.
- Les notes de mesure de débordement horizontal sont approximatives ; une mesure reproductible avec captures reste à recueillir.
- Le contenu hors sujet de l'UDSN peut justifier une vérification par son administrateur, mais ce rapport n'établit ni la présence ni l'origine d'une compromission.
- Les pages publiques doivent être reconsultées avant de traiter ces constats comme l'état actuel.

## 7. Sources publiques

- UMNG : https://www.umng.cg/?q=fr
- UDSN : https://www.udsn.cg/
- ULC : https://universitelibreducongo.com/
- ULC — inscription et réinscription : https://universitelibreducongo.com/formations/offre/inscription-et-reinscription
- ULC — portail ENT / intranet : https://universitelibreducongo.com/intranet/login-portail
- IUHL : https://www.iuhledu.com/
- IMB : https://imb-edu.cg/
- IMB — préinscription : https://imb-edu.cg/preinscription.php

## 8. Prochaines actions proposées

- Faire relire les conclusions et corriger les détails qui seraient imprécis.
- Reconsulter les pages publiques importantes et joindre des preuves de capture/mesure pour les constats clés.
- Transformer les constats validés en exigences UI/UX priorisées pour le prototype IMB.
- Effectuer ultérieurement des mesures explicites de performance, d'accessibilité et des tests fonctionnels sans toucher au site officiel.