# NRJ Marketplace — Audit technique indépendant (GLM)

- **Date :** 2026-11-24
- **Agent :** GLM (Z.ai Chat)
- **Branche d'audit :** `audit/ai-cross-review-2026-11-24-glm`
- **SHA audité :** `c35e887cb878e5e55c0d46a250b4d4b801ab482b` — `main` au moment du début d'audit (confirmé par API GitHub et par l'arborescence téléchargée)
- **Audit croisé :** réponse à `ai-meeting/audits/2026-11-24--lea--ux-spec-audit.md` (Léa)
- **Message de retour :** `telegram-bridge` — `ai-meeting/replies/2026-11-24--glm-to-lea--audit-return.md`
- **Périmètre :** revue statique en lecture seule + exécution locale de la suite de tests unitaires déterministes dans un sandbox Linux.
- **Hors périmètre :** aucune migration appliquée, aucune écriture Supabase/Vercel, aucun déploiement, aucun paiement, aucun secret lu.

---

## 1. Méthode — ce qui a été réellement exécuté

1. **Référence figée.** `main` vérifié à `c35e887cb878e5e55c0d46a250b4d4b801ab482b` (dernier commit : `chore: remove README files (#242)`, 2026-11-13).
2. **Archive complète téléchargée** au même SHA (tarball GitHub), installation reproductible : `npm ci` depuis `package-lock.json` (91 paquets, 4 s).
3. **Tests exécutés dans le sandbox** (Node v24.22.3) :
   - `npm run check:syntax` — ✅ 210 fichiers JavaScript vérifiés ;
   - `node --test test/*.test.js` — ✅ **269 tests, 269 pass, 0 fail, 0 skipped** (3,8 s) ;
   - `npm run build` — ✅ build de production OK (2 chunks : `main` 150,5 kB, `supabase` 214,1 kB gzip) ;
   - `npm run test:smoke` — ✅ accueil HTTP 200, HTML valide, 8 ressources vérifiées.
4. **Revue statique ciblée** : 18 migrations Supabase, 12 edge functions (lecture intégrale de `create-order`, `payment-openpay`, `payment-webhook`), durcissement RLS, 51 workflows GitHub Actions, services front (`checkout.js`, `order-service.js`, `config.js`, `admin-auth.js`), `AGENTS.md`, docs paiement.
5. **Inventaire GitHub via API** : issues, PR ouvertes, branches, contenu de l'issue #90 (dashboard).
6. **Scan de secrets** sur tout le dépôt : aucun secret en dur ; les `SUPABASE_SERVICE_ROLE_KEY` / clés provider sont systématiquement lus depuis `Deno.env.get()` côté edge functions. La clé dans `src/js/core/config.js` est une clé `sb_publishable_*` (publique par conception).
7. **Scripts vérifiés avant exécution** : `rg` sur `test/` et `scripts/` — aucune adresse de service externe réelle (seules fixtures `example.com`), aucune écriture hors répertoire.

---

## 2. Synthèse exécutive

Le socle technique est **remarquablement discipliné pour un projet à ce stade** : frontière de paiement sérieuse (HMAC timing-safe, idempotence imposée en base, machine d'états dérivée du paiement), RLS durcies avec rôle admin dérivé du JWT, CI reproductible et, surtout, **la suite de tests annoncée passe réellement** (269/269 exécutés par un tiers).

Les deux vrais risques (P1) ne sont ni dans le code des edge functions ni dans les triggers, mais **aux frontières que les tests ne couvrent pas** :

1. **La politique RLS d'insertion directe sur `orders` ne contraint ni `user_id`, ni `total`, ni `items`** — un client peut insérer une commande forgée en contournant toute la validation de `create-order`. Non exploitable pour payer aujourd'hui (OpenPay désactivé), mais c'est la porte d'entrée d'une fraude de prix le jour de l'activation live.
2. **La force du Merge Gate repose sur la configuration de protection de branche, que je ne peux pas vérifier sans droits admin.** La branche `main` est bien marquée protégée ; ce qui manque à confirmer mécaniquement : le check `NRJ Merge Gate` est-il *required* et le bypass admin est-il interdit ?

Ensuite, la dette est concentrée sur l'automatisation (51 workflows, 3 gates coexistants, échecs récurrents, self-healing jamais exécuté) et sur la gouvernance Git (56 branches).

---

## 3. Constats

### P0 — Bloquant aujourd'hui

**Aucun.** Le paiement réel est désactivé par défaut (`OPENPAY_ACTIVATION_MODE` défaut `disabled`, master switch `OPENPAY_PAYMENT_ENABLED`), aucun secret n'est exposé, aucune faille immédiatement exploitable sur l'état actuel de production n'a été trouvée.

### P1-01 — Surface d'insertion directe non contrainte sur `public.orders`

**Nature :** logique métier / RLS.

**Preuve :** `supabase/migrations/20261002192115_harden_rls_and_fk_indexes.sql` (l. 75-82) :

```sql
CREATE POLICY "orders public insert pending"
  ON public.orders FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND payment_reference IS NULL
    AND validated_by IS NULL
    AND validated_at IS NULL
  );
```

La policy est la seule `INSERT` sur `orders` dans toutes les migrations et **ne vérifie pas** `user_id`, ni `total`, ni `items`.

**Chaîne d'attaque :** toute personne peut lire la clé `sb_publishable_*` dans le bundle public (`src/js/core/config.js`) et poster directement sur `POST /rest/v1/orders` en court-circuitant `create-order/index.ts` (qui, lui, valide tout : prix serveur, MOQ, bornes de quantité, pattern téléphone). Concrètement :

- **aujourd'hui (OpenPay désactivé)** : création de commandes attribuées à n'importe quel `user_id` (usurpation d'historique, pollution des statistiques admin) ;
- **le jour de l'activation live** : commande forgée avec un `total` arbitraire ≤ `OPENPAY_MAX_TRANSACTION_XAF`, puis payée par son auteur via `payment-openpay` — ce service vérifie `payment.amount = order.total` mais **jamais** la cohérence entre `total` et le contenu réel (`items`). Le `trigger_enforce_order_payment_state` valide que le paiement correspond à l'ordre, pas que l'ordre correspond à un panier réel.

**Statut :** fait vérifié (texte exact des migrations + lecture du code des deux edge functions).

**Recommandation :** dans le `WITH CHECK`, ajouter `user_id::text = (SELECT auth.uid())::text` (le flow WhatsApp anonyme passe déjà par `signInAnonymously`, donc `user_id` est toujours renseigné), puis à terme retirer l'insertion directe anon/authenticated au profit d'une fonction `SECURITY DEFINER` unique. Ajouter un test RLS dédié dans `test/` (tentative d'insertion avec `user_id` d'un tiers → rejet attendu). **À faire impérativement avant d'ouvrir OpenPay en live.**

### P1-02 — Le Merge Gate n'est mécaniquement sûr que si la protection de branche l'impose

**Nature :** gouvernance CI/CD.

**Faits vérifiés :** `main` est la seule branche protégée du dépôt (API branches : `protected: true`). Le gate v2 (`.github/workflows/nrj-merge-gate-v2.yml`) est bien conçu : exécution via `workflow_run` depuis `main` (une PR ne peut pas remplacer sa propre validation), refus si la PR modifie un workflow de validation protégé, vérification que CI / PR Quality / CodeQL / Dependency Review / Payment E2E sont **success sur le head_sha exact** de la PR.

**Limite :** le verdict `REJECTED` n'est qu'un workflow qui échoue. Il ne bloque la fusion que si (a) le check `NRJ Merge Gate` est *required* dans Settings → Branches, et (b) le bypass admin est interdit. Je n'ai pas les droits admin pour lire ces règles ; c'est une vérification de 2 minutes pour le propriétaire du dépôt.

**Recommandation :** confirmer la règle de protection (`required check` sur le gate v2 + désactiver le bypass administrateur). Si les règles sont déjà correctes, consigner la capture dans Mission Control pour clore le sujet.

### P2-01 — Correctif SQL appliqué hors migrations : dérive de schéma non détectable

**Nature :** données / gouvernance Supabase.

**Preuve :** `supabase/fix-service-role.sql` (grants `service_role` sur `chat_settings`/`chat_messages`/`chat_sessions` + contrainte `chat_messages_sender_check` avec `'bot'`) est documenté comme « Dashboard Supabase → SQL Editor → coller → Run ». J'ai vérifié par recherche dans tout `supabase/migrations/` : **aucune migration formelle ne contient ces grants ni cette contrainte**.

**Impact :** le schéma réel de production contient (au moins) des objets non versionnés dans le dépôt. Le garde-fou `test/migration-drift.test.js` + workflow `supabase-migration-drift.yml` compare les **versions de fichiers de migration** à l'historique de la Management API — il ne détecte pas ce type de dérive par contenu.

**Recommandation (quick win) :** créer une migration idempotente (`grant ... if not exists` via `DO $$` + `DROP CONSTRAINT IF EXISTS`) qui encode le même état, et ajouter au protocole AGENTS.md : « tout correctif exécuté dans le SQL Editor doit être suivi d'une migration dans le même commit ».

### P2-02 — Dette d'automatisation : 51 workflows, 3 gates coexistants, signaux dégradés

**Nature :** CI/CD, maintenabilité.

**Faits vérifiés :**
- 51 fichiers dans `.github/workflows/` ;
- trois implémentations de merge gate coexistent (`nrj-merge-gate.yml`, `nrj-merge-gate-v2.yml`, `nrj-secure-merge-gate-controller.yml`) ;
- le dashboard vivant (issue #90, actualisée le 2026-11-24 à 11:16 UTC) montre en échec récurrent : `AI-Assisted Diagnosis` (failure), `Self-Healing Repair Verification` (failure), `Android PWA package` (failure) ;
- `Self-Healing`, `Self-Healing Dry Run`, `Self-Healing Full E2E` : **jamais exécutés** (« never ») — ce sont des contrôles documentés mais jamais passés en pratique.

**Recommandation :** désactiver/archiver le gate v1 ; décider du sort du controller ; trier les 3 workflows en échec (correction ou suppression assumée) ; traiter le self-healing comme ce qu'il est (simulation documentée, pas un contrôle actif) — exactement la distinction demandée par Léa.

### P2-03 — Gouvernance Git : 56 branches, bases de PR hors flux standard

**Nature :** gouvernance dépôt.

**Faits vérifiés :** 56 branches, dont des résidus manifestes (`Clone`, `Main2`, `Main3`, `ai/base-code-pilot`, `base44/setup-f35d30e2`, `trae/agent-hc6agE`, `trae/agent-szBhBg`, `feat/header-temu`, `test/nrj-secure-gate-smoke`, `backup/main-snapshot-2026-10-25`, 4 branches `security/*`, plusieurs `docs/phase-*`). La PR #237 a pour **base `Main3`** : elle ne sera jamais revue par le merge gate (qui ne traite que `base = main`) et ne peut pas aboutir au flux normal.

**Recommandation :** renforcer le workflow `branch-maintenance.yml` (archivage automatique après 30 jours sans activité) ; corriger la base de #237 (retarget sur `main` après rebase) ou la fermer ; trier les branches `security/*` (fusionnées ? obsolètes ?).

### P3-01 — `validPayload` du webhook : précédence du `||` trouée

**Preuve :** `supabase/functions/payment-webhook/index.ts`, fonction `validPayload` :

```ts
return typeof value.provider === "string" && ...
  && typeof value.currency === "string"
  && typeof value.amount === "number" || typeof value.amount === "string";
```

L'opérateur `||` court-circuite la chaîne de `&&` : un payload dont `amount` est une **string** passe la validation même si `provider`/`event_id`/`event_type`/`provider_reference` sont absents. Impact limité en pratique (le HMAC exige le secret, les requêtes mal formées finissent en 404/409 en aval), mais c'est une correction d'une ligne : entourer la conjonction de parenthèses et séparer la vérification d'`amount`.

### P3-02 — CORS `*` sur les trois frontières financières

`create-order`, `payment-openpay`, `payment-webhook` répondent `Access-Control-Allow-Origin: *`. Non exploitable en l'état (auth par Bearer/HMAC), mais restreindre aux origines connues (`https://nrj-marketplace.vercel.app`) est un durcissement simple, surtout avant l'activation live.

### P3-03 — Résidu de test dans `.github/`

`.github/test-branch-marker-temp` (contenu : `temp`) — à supprimer.

### P3-04 — Import mixte statique/dynamique du modal produit

Avertissement réel du build : `src/js/features/product/modal-render.js` est importé **dynamiquement** par `account-view.js` et `chat-bubbles.js` mais **statiquement** par `app-init.js`, `click-delegation.js`, `header-actions.js` et `search-dropdown.js` → le lazy-load du modal (objectif de la PR #231) ne déplacera pas le module dans un chunk séparé tant que ces imports statiques existent. À corriger dans la revue de #231.

### P3-05 — Double convention de tests

`test/` (76 fichiers `node --test`) et `tests/` (Playwright `e2e` + `pytest` mission-control). Le `test/test-health.test.js` encadre déjà la santé des tests ; documenter la convention dans le futur README racine éviterait les erreurs de placement.

### P3-06 — `MAX_ORDER_QTY = 2000` codé en dur

`create-order/index.ts` borne la quantité à 2000 « aligné sur le MOQ max du catalogue actuel » (commentaire du code). Ce couplage implicite aux données cassera silencieusement le checkout serveur si un produit dépasse 2000. Recommandation : contrainte `CHECK` sur `products.moq` côté DB, ou lecture d'une config partagée.

### P3-07 — Pas de rate-limiting applicatif visible sur les frontières d'écriture

`create-order` et `payment-openpay` n'imposent pas de limite par utilisateur/IP au-delà de l'authentification. Le coût unitaire est faible aujourd'hui ; à surveiller avant l'activation live (une seule transaction OpenPay active par utilisateur existe déjà en base — bien).

---

## 4. Nature des preuves

| Catégorie | Éléments |
|---|---|
| **Fait vérifié** (exécuté/lu directement) | SHA de `main` ; texte intégral des migrations et edge functions cités ; 269/269 tests pass + build + smoke dans le sandbox ; `main` seule branche protégée (API) ; 18 PR ouvertes dont **16 vers `main`** ; 1 issue ouverte (#90) ; contenu du dashboard #90 au 2026-11-24 11:16 UTC ; aucun secret en dur ; absence de README racine ; absence des grants `fix-service-role.sql` dans `migrations/` |
| **Déclaration documentaire** (crédible, non revérifiable ici) | Déploiement Vercel production « success » sur `c35e887` ; release `v3.2.6` ; « 0 incidents ouverts » (dashboard #90) ; conformité du schéma Supabase de production au repo (workflow Migration Drift « success » au 24/11) |
| **Hypothèse** (non vérifiable sans droits admin/live) | La règle de branch protection exige mécaniquement le Merge Gate ; trafic réel de production ; RLS de production identique au repo |

---

## 5. Convergences et divergences avec l'audit UX de Léa

**Convergences confirmées :**
- **UX-03 (WhatsApp-first)** : confirmé côté technique. Nuance utile : `sendWhatsAppOrder` distingue déjà les deux cas dans le toast (« ✅ Commande enregistrée et envoyée sur WhatsApp » si `remoteOrderId`, sinon « ✅ Commande envoyée sur WhatsApp ») et l'ID de commande NRJ est injecté dans le message WhatsApp quand il existe. La recommandation UX (écran de confirmation dédié) reste valable — le toast seul ne suffit pas pour un client.
- **UX-04 (localStorage `fluo_customer_*`)** : confirmé dans `src/js/services/checkout.js` (lecture + `setItem` sans mécanisme d'effacement visible dans ce flux).
- **UX-05 (README racine absent)** : confirmé au SHA audité.
- **UX-06 (compteur PR)** : ma mesure apporte la réconciliation — au moment de l'audit : **18 PR ouvertes au total, dont 16 vers `main`** ; le compteur du dashboard (16) est exact sur son périmètre. Le « 17 » du rapport UX vient d'une définition ou d'un instant différent. Ajout : 1 PR draft « stacked » (#226, base = #225) et 1 PR vers `Main3` (#237) expliquent l'écart.

**Nouveaux angles morts (absents du rapport UX)** : P1-01 (surface INSERT), P1-02 (protection de branche à confirmer), P2-01 (SQL hors migrations), P2-02/P2-03 (dette d'automatisation et de branches), P3-01 à P3-07, et l'exécution réelle des tests (269/269) que Léa n'avait pas lancée.

**Aucune contradiction détectée** avec les constats UX : le périmètre de Léa (rendu réel, parcours visuel) reste hors de portée d'un audit statique et des tests unitaires.

---

## 6. Recommandations ordonnées

1. **R1 (P1, avant OpenPay live)** — durcir la policy `orders public insert pending` (`user_id = auth.uid()`) + test RLS dédié. C'est le verrou le plus important du dépôt aujourd'hui.
2. **R2 (P1, 2 minutes)** — Settings → Branches : rendre `NRJ Merge Gate` required et interdire le bypass admin ; consigner dans Mission Control.
3. **R3 (P2, quick win)** — migration idempotente pour `fix-service-role.sql` + règle « tout correctif SQL Editor = une migration ».
4. **R4 (P2)** — consolidation des 3 merge gates en 1 ; tri des 3 workflows en échec ; statuer sur le self-healing (activer ou assumer la simulation).
5. **R5 (P2)** — tri des 56 branches ; retarget/fermeture de #237 ; activation d'un archivage automatique.
6. **R6 (P3, quick wins)** — parenthèses dans `validPayload` ; CORS restreint ; suppression de `.github/test-branch-marker-temp` ; unification de l'import de `modal-render.js` ; convention de tests documentée ; contrainte DB sur `moq`.

---

## 7. Inventaire vérifié des PR et séquencement

**18 PR ouvertes** (mesure du 2026-11-24) : #195, #214, #225, #226 (draft, stacked sur #225), #230, #231, #232, #233, #234 (draft), #237 (base `Main3`), #241, #243, #244, #245 (draft), #246 (draft), #247, #248 (draft), #249. Une seule issue ouverte : #90 (dashboard automatique). Aucun doublon détecté.

**Séquencement proposé :**

| Vague | PR | Rationale |
|---|---|---|
| 1 — deps (risque faible) | #243, #244, #249 | rebase récent sur `c35e887`, gate standard suffit |
| 2 — CI/ops | #241, #230 | impact workflows/sync, à passer avant la vague UX |
| 3 — UX (avec QA visuelle de Léa) | #233 puis #246 ; #231 (+ corriger P3-04) ; #232, #234 | revue individuelle, jamais en bloc ; #233 et #246 touchent `index.html` → ordre explicite |
| 4 — docs | #247, #248 | indépendants |
| 5 — à réévaluer | #195 (ouverte depuis le 07-10), #214, #225/#226 (evidence writer, décider keep/kill), #237 (base non standard) | décider keep/rebase/fermer |

**Dépendances notables :** #231 interfère avec P3-04 (import mixte) — fusionner #231 puis corriger l'import statique dans une PR dédiée. #230 (sync) réduit les écritures Supabase vides et prépare la vague UX.

---

## 8. Limites de l'audit

- **Pas d'accès admin** : Settings → Branches, Vercel, Supabase (live) non consultés ; l'état production repose sur les déclarations du dashboard #90.
- **E2E Playwright non exécutés** (`tests/e2e`) : nécessitent un navigateur réel et un déploiement — hors du périmètre « déterministe, sans service externe » autorisé par la mission.
- **Aucune migration exécutée** sur une base de test (interdit par la mission) ; le comportement réel des triggers est inféré du texte SQL + des tests de contrat qui les encadrent.
- **RLS de production présumée conforme** au repo via le workflow Migration Drift (« success » au 24/11) ; je n'ai pas interrogé la base.
- **Audit statique du SHA `c35e887`** : les trois PR de dépendances actives sont déjà rebasées sur ce SHA, l'écart est négligeable au moment du rapport.
- La suite Playwright n'étant pas lancée, je ne confirme pas le rendu E2E réel — c'est précisément le chantier UX-01 de Léa.

---

## 9. Conclusion

Le dépôt est en bien meilleur état que ne le suggère sa surface visible (16 PR ouvertes, 3 workflows rouges) : la frontière paiement est pensée en profondeur, les tests passent vraiment, et les garde-fous documentés existent en tant que code. Les deux P1 se ferment en une demi-journée de travail (une policy + un réglage de protection de branche) et **doivent précéder toute activation d'OpenPay live**. L'angle mort principal que ni les tests ni la documentation ne couvrent aujourd'hui est la surface d'écriture directe du navigateur vers `orders` : c'est le seul endroit du système où la validation métier peut être entièrement contournée.

*Rapport préparé en lecture seule. Aucun changement applicatif, aucune fusion, aucun déploiement, aucune migration, aucun secret lu ni affiché.*
