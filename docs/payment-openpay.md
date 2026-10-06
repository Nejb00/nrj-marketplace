# OpenPay — NRJ Marketplace

## Décision

OpenPay est le premier provider externe ciblé pour NRJ Marketplace car sa documentation publique actuelle décrit l'encaissement en XAF avec sélection de l'opérateur MTN ou AIRTEL, ainsi qu'un endpoint de consultation du statut.

## Architecture

Le navigateur utilise uniquement OpenPayProvider et appelle payment-openpay.

payment-openpay garde la clé OPENPAY_API_KEY côté serveur, vérifie que la commande appartient à l'utilisateur via la session Supabase, crée d'abord la ligne payments avec une clé d'idempotence unique, puis appelle OpenPay.

Les callbacks OpenPay arrivent sur openpay-callback. La documentation publique actuelle ne décrit pas de signature cryptographique pour le callback ; nous ne traitons donc jamais le callback comme preuve de paiement. Nous revalidons toujours la référence, le montant et la devise auprès d'OpenPay avant de modifier l'état local.

## Limites connues

OpenPay documente actuellement une commission de retrait de 4 % à 6 %, alors que les encaissements affichés sont gratuits. Le coût réel dépend du contrat/palier du marchand et doit être validé avant production.

La documentation publique consultée ne fournit pas d'endpoint de remboursement ; le remboursement OpenPay reste donc explicitement non implémenté.

## Sécurité

Aucune clé OpenPay n'est exposée au frontend.
Aucun secret ne doit être ajouté au dépôt.
Les paiements utilisent XAF uniquement.
Le montant facturé est lu depuis la commande en base et non accepté comme source de vérité depuis le navigateur.
Les callbacks sont revalidés côté serveur.
L'intégration reste désactivée tant que la migration payments/payment_events n'est pas mergée/appliquée et que les secrets/contrat marchand ne sont pas configurés.

## Activation contrôlée — ATTAQUE #24

L'activation OpenPay est volontairement en deux couches :

- `OPENPAY_PAYMENT_ENABLED=true` active le moteur serveur principal.
- `OPENPAY_ACTIVATION_MODE=canary` ou `live` choisit le niveau d'ouverture.
- `OPENPAY_MAX_TRANSACTION_XAF` est obligatoire et limite chaque nouvelle transaction.
- En mode `canary`, `OPENPAY_CANARY_USER_IDS` doit contenir explicitement les identifiants autorisés.
- Toute configuration incomplète reste bloquée en mode fail-closed.
- `action=readiness` permet de vérifier l'état d'activation sans contacter OpenPay et sans créer de paiement.

### Séquence de mise en service

1. Laisser `OPENPAY_PAYMENT_ENABLED=false` et `OPENPAY_ACTIVATION_MODE=disabled` par défaut.
2. Configurer la clé OpenPay uniquement comme secret Supabase Edge Function, jamais dans le dépôt.
3. Pour une première mise en service, choisir `OPENPAY_ACTIVATION_MODE=canary`, fournir une petite liste `OPENPAY_CANARY_USER_IDS` et un plafond `OPENPAY_MAX_TRANSACTION_XAF`.
4. Vérifier le endpoint de readiness et les tests CI avant d'activer l'interface de paiement.
5. Activer uniquement le flag d'interface `VITE_MOBILE_MONEY_PAYMENT_ENABLED=true` côté build après validation du garde serveur.
6. Le passage à `OPENPAY_ACTIVATION_MODE=live` reste une décision de déploiement explicite.
7. En cas d'incident, remettre immédiatement `OPENPAY_PAYMENT_ENABLED=false` : le serveur redevient fermé sans nécessiter de modification du frontend.

Le flag frontend `VITE_MOBILE_MONEY_PAYMENT_ENABLED` ne constitue jamais une autorisation financière. Un client peut l'activer localement, mais `payment-openpay` refuse toute opération tant que les garde-fous serveur ne sont pas satisfaits.

Cette attaque n'active volontairement aucun paiement réel pendant les tests ou la validation CI.
