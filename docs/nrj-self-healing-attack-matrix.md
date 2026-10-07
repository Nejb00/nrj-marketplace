# NRJ Self-Healing OS — Attack Matrix

Cette matrice décrit la couverture automatisée actuelle. Elle distingue les contrôles réellement exécutables des contrôles volontairement conditionnels.

## A — Bugs métier et invariants

| ID | Contrôle | État |
|---|---|---|
| A1 | Business Invariant Engine | ✅ |
| A2 | Signaux métier → Incident Intelligence | ✅ |
| A3 | Signaux métier → AI Diagnosis | ✅ |
| A4 | Frontière de sécurité entre preuve et auto-réparation | ✅ |
| A5 | Invariants métier avancés / chronologie paiement | ✅ via Payment Attack Matrix |

## B — Payment OS

| ID | Contrôle | État |
|---|---|---|
| #18 | Référence provider perdue / récupération depuis événement | ✅ audit lecture seule |
| #19 | Callback/webhook → réconciliation complète | ✅ audit lecture seule |
| #20 | Payment → Order state machine | ✅ audit déterministe |
| #21 | Observabilité financière des erreurs de traitement | ✅ audit déterministe |
| #22 | Anti-double-submit / idempotence | ✅ |
| #23 | Parcours E2E paiement complet | ✅ gate des étapes |
| #24 | Activation OpenPay contrôlée | ✅ gate ; aucune activation automatique |

## C — Intégrité des données

| ID | Contrôle | État |
|---|---|---|
| C1 | Doublons | ✅ |
| C2 | Références orphelines | ✅ |
| C3 | Cohérence inter-tables | ✅ moteur + validation réelle |
| C4 | Valeurs impossibles / chronologies | ✅ moteur + validation réelle |
| C5 | Dérive Repository ↔ Supabase migrations | ✅ |

## D — Sécurité

| ID | Contrôle | État |
|---|---|---|
| D1 | Patterns d’autorisation obsolètes | ✅ |
| D2 | Fonctions privilégiées | ✅ |
| D3 | Secrets côté navigateur | ✅ détection statique |
| D4 | Permissions workflows | ✅ détection statique |
| D5 | RLS public tables | ✅ |
| D6 | Exécution publique de fonctions privilégiées / grants d’écriture anon | ✅ |

## E — Tests intelligents

| Contrôle | État |
|---|---|
| Impact des fichiers modifiés | ✅ |
| Sélection des scopes de tests | ✅ |
| Santé historique tests | ✅ |
| Détection simple de flakiness | ✅ |
| Suite complète CI existante | ✅ |

## F — Auto-réparation

| Contrôle | État |
|---|---|
| Fraîcheur du run source | ✅ |
| Une seule tentative automatique | ✅ |
| Cibles sensibles interdites | ✅ |
| Taille/no-op recipe guards | ✅ |
| Autorisation finale liée au diagnostic déterministe | ✅ existante |

## G — Rollback / récupération

| Contrôle | État |
|---|---|
| Corrélation avec réparation fusionnée | ✅ |
| Régression obligatoire | ✅ |
| Âge maximum | ✅ |
| Budget de rollback | ✅ |
| Draft rollback uniquement | ✅ existant |

## H — Observabilité

| Contrôle | État |
|---|---|
| Santé globale basée sur main | ✅ nouveau modèle |
| Incidents ouverts | ✅ |
| Runs en échec/attente | ✅ |
| Observabilité autonome | ✅ |
| Dashboard historique | ⚠️ ancien workflow n’a pas pu être modifié dans cette session |

## I — Git / PR

| Contrôle | État |
|---|---|
| Branche derrière main | ✅ |
| Base non-main | ✅ |
| PR volumineuse | ✅ |
| Checks échoués/en attente | ✅ |
| Mergeability | ✅ |
| Ready-to-merge déterministe | ✅ |

## J — Production

| Contrôle | État |
|---|---|
| Deployment success | ✅ |
| Smoke test | ✅ |
| Browser E2E | ✅ |
| Incidents ouverts | ✅ |
| Environnement Production | ✅ |

## K — Mémoire d’incidents

| Contrôle | État |
|---|---|
| Clé stable de récurrence | ✅ |
| Comptage d’occurrences | ✅ |
| Classement rare/récurrent | ✅ |
| Persistance automatique externe | ⚠️ non activée |

## L — Corrélation inter-systèmes

| Contrôle | État |
|---|---|
| Git ↔ Vercel | ✅ |
| Git ↔ Supabase migration drift | ✅ |
| Supabase integrity ↔ incident | ✅ |
| Vercel production failure ↔ corrélation | ✅ |

### Règle générale

Aucune preuve d’intégrité, de sécurité, de paiement ou de corrélation ne donne seule le droit de modifier des données, d’appliquer une migration, d’activer un provider ou de merger une PR.
