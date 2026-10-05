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
