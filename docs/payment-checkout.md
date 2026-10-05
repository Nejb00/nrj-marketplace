# Checkout NRJ — étape serveur

## Ce qui est actif dans la branche

Le checkout possède maintenant une modale dédiée avec :
- nom client ;
- numéro Mobile Money ;
- résumé de commande ;
- envoi WhatsApp.

Avant l'envoi WhatsApp, le frontend tente de créer une commande serveur via `create-order`.

## Source de vérité

Le backend :
1. authentifie la session Supabase ;
2. récupère les produits depuis `public.products` ;
3. récupère leurs prix depuis Supabase ;
4. reconstruit les lignes de commande ;
5. calcule le total ;
6. crée `public.orders` avec le `user_id` authentifié.

Le total fourni implicitement par le navigateur n'est donc pas utilisé pour créer la commande.

## Fallback

La commande locale reste enregistrée et WhatsApp reste utilisable si la création serveur échoue. Cette tolérance permet de déployer le frontend avant de déployer l'Edge Function.

## Paiement Mobile Money

Le parcours MTN/Airtel est maintenant câblé dans l'interface, mais reste verrouillé par défaut avec `MOBILE_MONEY_PAYMENT_ENABLED = false` côté frontend.

Le backend possède un second verrou `OPENPAY_PAYMENT_ENABLED = false` par défaut. Les deux doivent être activés séparément après validation de la migration, des secrets et des tests.

L'étape suivante pourra brancher :
`createRemoteOrder(payment_method=openpay_mtn|openpay_airtel)`
→ `OpenPayProvider`
→ `payment-openpay`

Aucune transaction réelle n'est déclenchée par cette branche tant que l'interface conserve le bouton désactivé et que les secrets/provider ne sont pas configurés.

## Contrat OpenPay vérifié

- Création : `POST /v1/transaction/payment`.
- Statut : `GET /v1/transaction/status/:referenceId`.
- Opérateurs : MTN et AIRTEL.
- Devise : XAF.
- Authentification : `XO-API-KEY` côté serveur uniquement.

