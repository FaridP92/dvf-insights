# Stratégie Data : KPIs, visualisations et modèle

## 1. La donnée source : DVF

DVF (Demandes de Valeurs Foncières) publie chaque mutation immobilière enregistrée par les
services fiscaux : date, prix, adresse, surface bâtie, nombre de pièces, type de local,
surface de terrain. Environ 3 à 4 millions de lignes par an, en CSV sur data.gouv.fr.

Trois pièges structurent tout le pipeline :

| Piège | Conséquence si ignoré | Traitement |
|---|---|---|
| Une mutation = plusieurs lignes (lots, dispositions) | Prix compté N fois, surfaces additionnées à tort | Ne conserver que les `id_mutation` à ligne unique |
| Ventes en bloc, VEFA, cessions non marchandes | Prix/m² absurdes (5 €/m² ou 200 000 €/m²) | Filtre `nature_mutation = 'Vente'` + fenêtre [200, 30 000] €/m² |
| Pas de prix/m² ni d'agrégat fourni | Tout calcul côté client est lent et faux | Colonne générée `price_per_sqm`, vues matérialisées |

## 2. Modèle en trois couches

```
dvf_mutations (brut, partitionné par année)        <- n8n : téléchargement + insertion
   |  refresh_clean_mutations(from, to)
dvf_mutations_clean (1 ligne = 1 bien, prix/m²)    <- filtres qualité, RLS lecture
   |  refresh materialized view
mv_monthly_stats / mv_commune_stats                 <- consommées par le front
pipeline_runs / webhook_events                      <- monitoring, écrit par n8n
```

Pourquoi des vues matérialisées et non des requêtes à la volée : un `percentile_cont`
sur 3 millions de lignes prend plusieurs secondes ; pré-agrégé par mois × département × type,
la table fait quelques milliers de lignes et répond en millisecondes. Le rafraîchissement
est déclenché par n8n en fin d'ingestion, donc la fraîcheur est celle du pipeline.

## 3. KPIs retenus et justification

| KPI | Formule | Pourquoi celui-là | Visuel |
|---|---|---|---|
| Prix médian au m² | `percentile_cont(0.5)` sur `price_per_sqm` | La médiane ignore les extrêmes ; c'est le standard notarial et INSEE | KPI + sparkline |
| Volume de transactions | `count(*)` mensuel | Indicateur avancé : le volume décroche avant les prix | KPI + BarChart |
| Indice de tension (0-10) | sigmoïdes pondérées de Δvolume, Δprix, rotation | Un seul chiffre pour "où ça chauffe" | Jauge radiale |
| Élasticité prix/surface | pente de log(prix) ~ log(surface) | < 1 : décote des grandes surfaces, signal de marché locatif tendu | Scatter + droite |
| Dispersion P10 / P50 / P90 | quantiles mensuels | L'hétérogénéité d'un territoire, invisible dans une moyenne | Bande d'aire |
| Base 100 par département | médiane / médiane du mois de référence | Comparer des marchés de niveaux différents | LineChart multi-séries |
| Structure du marché | répartition type × tranche de surface | Lire la composition avant les prix | Barres empilées |
| Corrélations | Pearson sur prix, surface, pièces, terrain, année | Vitrine data science, lecture immédiate | Heatmap |
| Estimation | hédonique simplifiée : médiane locale × ajustement surface × prime pièces | Explicable en une phrase, bande de confiance honnête | KPI + intervalle |
| Anomalies | z-score robuste (MAD) par commune × type, seuil 3 | Robuste aux marchés chers, sous- et sur-évaluations | Scatter surligné |
| Prévision 12 mois | Holt (niveau + tendance), bande √h | Peu de paramètres, robuste sur 24 à 60 points | Historique + projection |

## 4. Règles de visualisation

- **Une donnée, une couleur** : émeraude pour l'accent et le positif, ambre pour l'alerte,
  rose pour l'erreur, gris pour tout le reste. Les séries multiples suivent une palette
  ordonnée par contraste perceptif.
- **Infobulles intelligentes** : chaque tooltip donne la valeur formatée avec unité, la
  variation N-1 et le contexte (nombre de transactions) pour qualifier la fiabilité.
- **Pas de légende si le titre suffit**, pas de grille verticale, axes en gris subtil.
- **Chiffres tabulaires** (`tnum`) partout : les colonnes de nombres s'alignent.
- **États explicites** : chargement (squelette), erreur (message + réessayer), vide.

## 5. Mocks

Les jeux mock sont générés de façon déterministe (générateur pseudo-aléatoire à graine) à
partir de niveaux de prix réalistes par département, avec saisonnalité et tendance. Ils
partagent les types des vues Supabase : le jour où `VITE_SUPABASE_URL` est renseigné,
les composants ne changent pas.
