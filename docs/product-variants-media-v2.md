# NRJ Product Variants & Media V2

## Objectif

Séparer durablement trois concepts qui étaient mélangés dans le modèle historique :

- **Product** : le produit commercial visible dans le catalogue.
- **Variant** : une configuration vendable du produit (couleur, taille, combinaison d'attributs, SKU, prix/MOQ éventuellement spécifiques).
- **Media** : une image ou vidéo, liée au produit entier ou à une variante précise.

## Contrat V2

Une variante peut être simple :

```json
{
  "variant_key": "color:white",
  "label": "Blanc",
  "color": "Blanc",
  "size": null,
  "attributes": {
    "colorHex": "#ffffff"
  }
}
```

Ou porter plusieurs dimensions :

```json
{
  "variant_key": "color:white|size:m",
  "label": "Blanc / M",
  "color": "Blanc",
  "size": "M",
  "attributes": {
    "material": "coton"
  }
}
```

Une galerie peut contenir autant de médias que nécessaire :

```json
[
  {
    "variant_id": "white-uuid",
    "url": "https://…/white-front.jpg",
    "media_type": "image",
    "sort_order": 0
  },
  {
    "variant_id": "white-uuid",
    "url": "https://…/white-side.jpg",
    "media_type": "image",
    "sort_order": 1
  }
]
```

Ainsi, **17 photos d'un même produit blanc restent 17 médias de la variante Blanc**, sans créer 17 variantes.

## Compatibilité legacy

Les champs historiques `image…image6`, `couleurs`, `tailles` restent actifs.

La migration V2 :

1. crée les tables normalisées ;
2. crée une variante `legacy` par produit ;
3. rattache les anciennes images à cette variante ;
4. n'invente aucune combinaison couleur × taille que les données historiques ne permettent pas de prouver.

Le frontend utilise ensuite les médias V2 lorsqu'ils existent et retombe automatiquement sur les colonnes legacy sinon.

## Import OS

Le champ JSONB `product_imports.variants` est volontairement conservé comme enveloppe d'import. La forme cible pourra contenir :

```json
{
  "sizes": ["S", "M", "L"],
  "colors": ["Blanc", "Rouge"],
  "items": [
    {
      "variant_key": "color:white",
      "label": "Blanc",
      "color": "Blanc",
      "size": null,
      "media": [
        "https://…/white-1.jpg",
        "https://…/white-2.jpg"
      ]
    }
  ]
}
```

Le publisher pourra créer les variantes et leurs médias sans perdre les anciens flux texte.

## Règles de sécurité

Les tables V2 sont exposées en lecture publique uniquement pour le catalogue. Les écritures passent exclusivement par une session authentifiée reconnue admin via `public.is_chat_admin()`.

Aucune clé `service_role` n'est introduite dans le frontend.

## Admin V2

Le panneau Admin expose une surface dédiée pour gérer le graphe V2 :

- sélection d'un produit ;
- création / modification d'une variante ;
- couleur, taille, SKU, prix, MOQ, ordre et état actif ;
- galerie avec plusieurs URLs HTTPS, jusqu'à 100 médias ;
- suppression d'une variante avec cascade de ses médias.

Les écritures passent par `save_product_variant_graph` et `delete_product_variant`. Ces RPC sont `SECURITY DEFINER`, vérifient `public.is_chat_admin()`, et l'exécution est retirée de `PUBLIC`. La variante et sa galerie sont donc mises à jour dans une même transaction PostgreSQL.

## Ordre d'intégration

1. Schéma + backfill legacy.
2. Hydratation de la fiche produit.
3. Galerie pilotée par variante.
4. Sélection des variantes et validation réelle des combinaisons.
5. Cart : `productId + variantId`.
6. Import OS : publication des variantes et médias.
7. Migration/backfill complémentaire et E2E.
8. Activation finale après audit.

Le chantier reste isolé de `main` et ne dépend d'aucun déploiement preview manuel.
