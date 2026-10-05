# DVF Insights

Plateforme d'analyse du marché immobilier français fondée sur les données ouvertes **DVF**
(Demandes de Valeurs Foncières, data.gouv.fr). Vitrine technique : front React typé strict,
pipeline ETL n8n, base PostgreSQL 17 auto-hébergée (API PostgREST compatible Supabase), déploiement continu GitHub Actions sur VPS (Plesk, nginx).

| | |
|---|---|
| Dépôt | https://github.com/FaridP92/dvf-insights |
| Production | https://dvf.lyfh.fr |
| Backend données | Postgres 17 + PostgREST + Edge Functions Deno en Docker sur le VPS ([deploy/backend](deploy/backend)), API https://dvf.lyfh.fr/rest/v1 |
| Workflow n8n | https://n8n.lyfh.fr/workflow/PR0xIuYH9y68zOVc |
| Stratégie data | [docs/DATA_STRATEGY.md](docs/DATA_STRATEGY.md) |
| Pipeline | [docs/N8N_PIPELINE.md](docs/N8N_PIPELINE.md) · [supabase/README.md](supabase/README.md) |

## Stack

- **Front** : React 18 · Vite 8 · TypeScript 6 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) · Tailwind CSS v4 · Recharts 3 · Lucide · React Router 7
- **Data** : PostgreSQL 17 + PostgREST (contrat Supabase : `/rest/v1`, `/functions/v1`, RLS, `pg_cron`), fonctions Deno · n8n (orchestration ETL) · Zod (validation aux frontières)
- **Qualité** : Vitest · oxlint · Prettier
- **Hébergement** : VPS OVH sous Plesk, nginx sert la SPA statique (en-têtes de sécurité, cache immuable des assets, Brotli), Cloudflare en proxy (SSL Full strict)

## Pages

1. **Vue d'ensemble** (`/`) : 4 KPI macro (prix médian au m², volume, valeur échangée, indice de tension), bande de dispersion P10-P90, volume mensuel, base 100 par région avec le département sélectionné en surbrillance, communes en mouvement (top et flop triés côté serveur).
2. **Explorateur & Analytics** (`/explorer`) : un département à la fois (le détail national ne se charge jamais en entier), puis filtres multi-critères côté client, distribution du prix au m², nuage prix/surface avec droite d'élasticité, matrice de corrélation, structure du marché, classement des communes.
3. **Prédictions IA & Tendances** (`/predictions`) : simulateur d'estimation hédonique (département puis commune, comparables et intervalle de confiance), prévision 12 mois (Holt), phases de marché des 97 départements, anomalies détectées sur un département (z-score robuste).
4. **Data Pipelines** (`/pipelines`) : schéma d'architecture animé, santé PostgreSQL, trafic webhooks, historique des exécutions n8n, auto-rafraîchissement.

## Architecture du code

```
src/
  app/            routeur, layout (sidebar, navigation mobile, ErrorBoundary par page)
  features/       une feature = une page : composants, hooks, lib (fonctions pures testées)
    overview/  explorer/  predictions/  pipelines/
  shared/
    api/          client Supabase, repository (bascule Supabase / mock), useQuery, useDepartments
    charts/       thème Recharts, ChartTooltip, Sparkline
    mocks/        jeux de données déterministes (PRNG à graine)
    types/        types du domaine, partagés par les mocks et les tables SQL
    ui/           design system (Card, KpiCard, Trend, Badge, états)
  lib/
    result.ts     Result<T, AppError> : standard global de gestion d'erreurs
    format.ts     formats fr-FR (€, %, dates, octets)
    stats/        quantiles, MAD, Pearson, régression, Holt, indice de tension
supabase/
  migrations/     schéma partitionné, table nettoyée, tables d'agrégats, RLS, RPC
  functions/      ingest-dvf, pipeline-status (webhooks n8n authentifiés)
docs/             stratégie data, pipeline n8n
```

### Principes

- **Feature-based** : chaque page possède ses composants, hooks et calculs ; `shared/` ne contient que ce qui est réellement partagé.
- **Calculs purs et testés** : toute transformation vit dans `lib/` ou `features/*/lib/` et est couverte par Vitest ; les composants ne font que rendre.
- **Erreurs** : aucune couche data ne lance ; tout renvoie `Result<T, AppError>` (`network` · `supabase` · `validation` · `sync` · `unknown`, avec `retryable`). L'UI a trois états explicites : chargement, erreur (avec réessai), succès.
- **Périmètre dynamique** : aucune liste de départements n'est codée dans le front. Le référentiel vient de la table `departments` (97 départements DVF) via `useDepartments`, et les listes déroulantes basculent en champ de recherche au-delà de vingt entrées.
- **Mock / live** : sans `VITE_SUPABASE_URL`, l'application sert des mocks typés déterministes qui partagent exactement les types des tables SQL, sur douze départements de démonstration. Le badge "Source" de la sidebar indique le mode. La production tourne en mode live sur le projet Supabase du tableau ci-dessus, à l'échelle de la France entière (97 départements DVF, millésimes 2023 à 2025 ingérés par le pipeline n8n) : 33 000 communes, 721 000 mutations de détail sur douze mois glissants, 36 mois d'agrégats mensuels et 11 000 communes classées, le tout dans 250 Mo grâce au stockage frugal.

## Modèle de données

Le stockage frugal vient du plan Supabase Free (500 Mo) d'origine ; il est conservé car il interdit de conserver la France entière au
grain de la mutation sur trois ans. Le stockage est donc **frugal et à trois couches**, chacune
avec sa propre rétention.

```
dvf_mutations (brut, tampon)                 <- n8n via Edge Function ingest-dvf
  | process_department(from, to, dep) : nettoyage puis agrégation, département par département
  | puis purge immédiate du brut traité
dvf_mutations_clean (détail, 12 mois glissants, ~2,3 M lignes)
  |
communes (référentiel, ~35 000 lignes : insee, nom, département, lat/lng)
monthly_stats (36 mois × 97 départements × 2 types : médiane, P10, P90, volume, valeur)
commune_stats (12 mois glissants par commune × type : médiane, variation N-1, variation de volume)
commune_yearly_stats (référence N-1 servant à calculer les variations)
pipeline_runs / webhook_events               <- monitoring
```

- **Le brut est un tampon**, pas un entrepôt : `process_department` le nettoie, l'agrège, puis
  le supprime. La santé de la page Pipelines l'affiche sous le libellé "Brut (tampon)".
- **Le détail est borné à douze mois glissants** et n'est jamais lu sans filtre de département
  ou de commune : c'est la règle qui rend l'échelle nationale tenable côté client.
- **L'historique long vit dans les agrégats** : trois ans de `monthly_stats` tiennent en
  quelques milliers de lignes, contre plusieurs millions au grain de la mutation.
- **Pagination** : PostgREST plafonne chaque réponse à 1 000 lignes. Le repository pagine en
  parallèle sur les volumes au plafond connu, en série avec arrêt anticipé sur les volumes
  variables, et délègue au serveur les tris qui ne rapatrieraient qu'une poignée de lignes
  utiles (`fetchTopMovers`).

Sécurité : RLS activée partout, lecture publique sur le référentiel, le détail nettoyé, les agrégats et le monitoring, tampon brut invisible à la clé anon, écritures réservées à la `service_role` via Edge Functions authentifiées (HMAC ou secret partagé, comparaison en temps constant).

## Choix de visualisation (résumé)

| Question du décideur | Indicateur | Graphique |
|---|---|---|
| Combien vaut le m² et où va-t-il ? | Médiane + variation N-1 | KPI + sparkline, bande P10-P90 |
| Le marché chauffe-t-il ? | Indice de tension 0-10 | Jauge + Badge |
| Les grandes surfaces sont-elles décotées ? | Élasticité prix/surface (log-log) | Scatter + droite |
| Quels territoires divergent ? | Base 100 par région, département surligné | LineChart multi-séries |
| Quelle est la fourchette crédible d'un bien ? | Estimation hédonique + comparables | KPI + intervalle |
| Y a-t-il des ventes hors marché ? | z-score robuste (MAD) par commune | Tableau + Scatter |
| Et dans 12 mois ? | Holt (niveau + tendance), bande √h | Historique + projection |

Détail et justifications dans [docs/DATA_STRATEGY.md](docs/DATA_STRATEGY.md).

## Démarrer

```bash
npm install
cp .env.example .env        # optionnel : clés Supabase, sinon mode mock
npm run dev
```

Scripts : `dev` · `build` · `preview` · `typecheck` · `lint` · `test` · `test:coverage` · `check` (typecheck + lint + test).

## CI/CD

Chaque push sur `main` déclenche le workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) : `npm run check` (typecheck + lint + test), build avec les secrets `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (clé publique, prévue pour être exposée au navigateur ; l'accès aux données est borné par la RLS), puis `rsync` par SSH de `dist/` vers `releases/<horodatage>-<sha>/` sur le VPS. Le lien `current` (docroot Plesk de https://dvf.lyfh.fr) bascule ensuite de façon atomique, un smoke test vérifie le site et déclenche un rollback automatique en cas d'échec. Les 5 dernières releases sont conservées.

- **Config serveur** : [`deploy/nginx/vhost_nginx.conf`](deploy/nginx/vhost_nginx.conf) (fallback SPA vers `index.html`, `/assets` en cache immuable, `index.html` sans cache long, en-têtes `X-Frame-Options`, `nosniff`, `Referrer-Policy`, Brotli/gzip), installée dans `/var/www/vhosts/system/dvf.lyfh.fr/conf/` côté Plesk.
- **Secrets GitHub** : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `DEPLOY_SSH_KEY` (clé dédiée), `DEPLOY_KNOWN_HOSTS`, `DEPLOY_HOST`, `DEPLOY_USER`.
- **Rollback manuel** : `ssh <user>@<hôte> 'bash -s -- rollback' < deploy/release.sh` (`list` pour voir les releases).

## Conventions

- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- Nommage explicite (`usePriceMedianByMonth`, jamais `useData`), types `readonly`, pas de `any`.
- Textes UI en français, chiffres tabulaires, une seule couleur d'accent.

## Backend de données (VPS)

Le projet Supabase d'origine a été remplacé par une pile Docker équivalente dans `/opt/dvf-backend` (sources dans [`deploy/backend`](deploy/backend)) :

- `db` : Postgres 17 avec `pg_cron`, rôles `anon` / `authenticated` / `service_role`, migrations `supabase/migrations/0001` à `0009` (liées à `127.0.0.1:54320`).
- `rest` : PostgREST, exposé par nginx sur `https://dvf.lyfh.fr/rest/v1/` (même origine que le site, pas de CORS). Clés JWT HS256 signées avec `JWT_SECRET`.
- `fn-ingest-dvf` et `fn-pipeline-status` : les Edge Functions du dépôt exécutées telles quelles sous Deno, exposées sur `/functions/v1/` et appelées par n8n.
- Secrets dans `/opt/dvf-backend/deploy/backend/.env` (jamais versionné, modèle `.env.example`).
- **Sauvegardes** : `pg_dump` quotidien à 03h30 UTC dans `/var/backups/dvf` (14 jours), script `deploy/backend/tools/backup.sh`, restauration documentée en en-tête du script.
- **Migration** : `deploy/backend/tools/migrate-from-supabase.py` a copié les 9 tables publiques depuis Supabase (comptes et empreintes identiques) avant la suppression du projet.
- **Mise à jour du backend** : `rsync` de `deploy/backend` et `supabase/` vers `/opt/dvf-backend`, puis `docker compose up -d` ; une nouvelle migration s'applique avec `docker compose exec -T db psql -U postgres -d dvf < supabase/migrations/NNNN_xxx.sql`.
