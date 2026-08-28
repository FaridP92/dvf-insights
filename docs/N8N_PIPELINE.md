# Orchestration n8n

Workflow créé via MCP : **DVF Insights - Ingestion mensuelle DVF**
https://n8n.lyfh.fr/workflow/PR0xIuYH9y68zOVc (12 nœuds)

## Flux

```
Schedule (le 5 de chaque mois, 03:00)
  -> Paramètres du run (supabaseUrl, année, période, 12 départements)
  -> POST pipeline-status { action: "start" }           -> runId
  -> Code : 1 item par département (URL geo-DVF)
  -> Loop Over Items (batch 1)
       -> GET files.data.gouv.fr/geo-dvf/latest/csv/{année}/departements/{dep}.csv.gz (binaire)
       -> Compression : gunzip
       -> Extract from File : CSV (relaxQuotes, skip erreurs)
       -> Code : filtre Appartement/Maison, normalise les colonnes, lots de 5 000 lignes
       -> POST ingest-dvf { runId, rows, final: false }  (1 requête par lot, 500 ms d'espacement)
       -> retour boucle
     done -> POST ingest-dvf { runId, rows: [], final: true, period }
             = refresh_clean_mutations(period) + refresh_materialized_views() + clôture du run
```

## Configuration à faire une fois

1. Nœud "Parametres du run" : remplacer `https://VOTRE-PROJET.supabase.co`.
2. Credential **Header Auth** nommé "Supabase webhook secret (x-webhook-secret)" :
   nom d'en-tête `x-webhook-secret`, valeur = le secret `N8N_WEBHOOK_SECRET` des Edge Functions.
   L'assigner aux 3 nœuds HTTP qui appellent Supabase (pas au téléchargement data.gouv).
3. Activer le workflow.

## Observabilité

Chaque appel HTTP vers les Edge Functions écrit une ligne dans `webhook_events`
(latence, code, taille) et met à jour `pipeline_runs` (lignes ingérées / rejetées, statut, durée).
La page "Data Pipelines" du front lit ces deux tables et `get_database_health()`.
