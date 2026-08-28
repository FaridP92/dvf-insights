# DVF Insights

Plateforme d'analyse du marché immobilier français fondée sur les données ouvertes **DVF**
(Demandes de Valeurs Foncières, data.gouv.fr). Vitrine technique : front React typé strict,
pipeline ETL n8n, base PostgreSQL Supabase, déploiement continu Vercel.

| | |
|---|---|
| Dépôt | https://github.com/FaridP92/dvf-insights |
| Production | https://dvf-insights.vercel.app |
| Supabase | projet `ntfeumptvwcrwoxzprbb` (eu-west-3), API https://ntfeumptvwcrwoxzprbb.supabase.co |
| Workflow n8n | https://n8n.lyfh.fr/workflow/PR0xIuYH9y68zOVc |
| Stratégie data | [docs/DATA_STRATEGY.md](docs/DATA_STRATEGY.md) |
| Pipeline | [docs/N8N_PIPELINE.md](docs/N8N_PIPELINE.md) · [supabase/README.md](supabase/README.md) |

## Stack

- **Front** : React 18 · Vite 8 · TypeScript 6 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) · Tailwind CSS v4 · Recharts 3 · Lucide · React Router 7
- **Data** : Supabase (PostgreSQL 15, Edge Functions Deno, RLS) · n8n (orchestration ETL) · Zod (validation aux frontières)
- **Qualité** : Vitest · oxlint · Prettier
- **Hébergement** : Vercel (SPA, en-têtes de sécurité, cache immuable des assets)

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
- **Mock / live** : sans `VITE_SUPABASE_URL`, l'application sert des mocks typés déterministes qui partagent exactement les types des tables SQL, sur douze départements de démonstration. Le badge "Source" de la sidebar indique le mode. La production tourne en mode live sur le projet Supabase du tableau ci-dessus, à l'échelle de la France entière : environ 35 000 communes, 2,3 millions de mutations nettoyées sur douze mois glissants et 36 mois d'agrégats mensuels.

## Modèle de données

Le plan Supabase Free plafonne à 500 Mo, ce qui interdit de conserver la France entière au
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

Chaque push sur `main` déclenche un build Vercel (framework Vite, `vercel.json` : rewrites SPA, cache immuable `/assets`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`). Variables définies dans Vercel (tous environnements) : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (clé publique, prévue pour être exposée au navigateur ; l'accès aux données est borné par la RLS).

## Conventions

- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- Nommage explicite (`usePriceMedianByMonth`, jamais `useData`), types `readonly`, pas de `any`.
- Textes UI en français, chiffres tabulaires, une seule couleur d'accent.
