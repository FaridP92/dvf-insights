# Orchestration n8n

Deux workflows créés via MCP :
- **DVF Insights - Ingestion mensuelle DVF** (orchestrateur) : https://n8n.lyfh.fr/workflow/PR0xIuYH9y68zOVc
- **DVF Insights - Ingestion d un departement** (sous-workflow) : https://n8n.lyfh.fr/workflow/NmOeXUv5Cet7H4aQ

Pourquoi un sous-workflow : un fichier départemental fait 20 000 à 60 000 lignes une fois parsé ;
tout garder dans une seule exécution a fait crasher n8n (mémoire) au 5e département. Chaque
département tourne dans sa propre exécution, dont la mémoire est libérée à la fin.

## Flux

```
Schedule (le 5 de chaque mois, 03:00)
  -> Paramètres du run (supabaseUrl, année, période, 12 départements)
  -> POST pipeline-status { action: "start" }           -> runId
  -> Code : 1 item par département (URL geo-DVF)
  -> Loop Over Items (batch 1)
       -> Execute Sub-workflow "Ingestion d un departement" (attend la fin)
            -> GET files.data.gouv.fr/geo-dvf/latest/csv/{millésime}/departements/{dep}.csv.gz
            -> Compression : gunzip
            -> Extract from File : CSV (relaxQuotes, skip erreurs)
            -> Code : filtre Appartement/Maison, normalise, lots de 5 000 ; le 1er lot porte
               reset = { millésime, département } : ingest-dvf purge ce couple avant d'insérer
            -> POST ingest-dvf { runId, rows, reset?, final: false }  (1 requête par lot)
       -> retour boucle
     done -> POST ingest-dvf { runId, rows: [], final: true, period }
             = enqueue_maintenance(run, period) : le run passe en stage "refresh"
                pg_cron (chaque minute) -> process_maintenance_jobs()
                  = refresh_clean_mutations(period) + refresh des vues + clôture du run (success / failed)
```

## Millésime

Les fichiers geo-DVF de l'année N ne sont publiés qu'à partir d'octobre N (puis complétés en avril N+1).
Le workflow vise donc l'année en cours à partir d'octobre, l'année précédente sinon, et remplace
intégralement ce millésime à chaque run : les runs sont idempotents, département par département.

## Configuration à faire une fois

1. Nœud "Parametres du run" : `supabaseUrl` est déjà renseigné (`https://ntfeumptvwcrwoxzprbb.supabase.co`).
2. Credential **Header Auth** nommé "Supabase webhook secret (x-webhook-secret)" :
   nom d'en-tête `x-webhook-secret`, valeur = le secret `N8N_WEBHOOK_SECRET` des Edge Functions.
   L'assigner aux 3 nœuds HTTP qui appellent Supabase (pas au téléchargement data.gouv).
3. Activer le workflow.

## Pourquoi le nettoyage est asynchrone

Un appel RPC via PostgREST est soumis au `statement_timeout` du rôle ; nettoyer 345 000 lignes
le dépasse. L'Edge Function ne fait donc qu'enfiler un job dans `maintenance_jobs`, et un job
`pg_cron` l'exécute sans limite de durée. La page Data Pipelines montre le run en "running"
pendant cette phase, puis "success" avec le nombre de lignes nettoyées dans `metadata`.

## Chargement de l'historique

Le run mensuel ne remplace que le millésime courant. Pour charger un millésime antérieur,
figer `year`, `periodFrom` et `periodTo` dans "Parametres du run" (ex. 2024 / 2024-01-01 /
2025-01-01), exécuter, puis remettre les expressions automatiques. Chaque (millésime,
département) est remplacé atomiquement, on peut donc relancer sans doublon.

## Observabilité

Chaque appel HTTP vers les Edge Functions écrit une ligne dans `webhook_events`
(latence, code, taille) et met à jour `pipeline_runs` (lignes ingérées / rejetées, statut, durée).
La page "Data Pipelines" du front lit ces deux tables et `get_database_health()`.
