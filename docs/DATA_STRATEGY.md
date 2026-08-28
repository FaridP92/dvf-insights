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
| Pas de prix/m² ni d'agrégat fourni | Tout calcul côté client est lent et faux | Colonne générée `price_per_sqm`, tables d'agrégats |

## 2. Modèle en trois couches

Le périmètre est national et l'hébergement tient dans 500 Mo : garder trois ans de mutations
pour la France entière au grain du bien est hors de portée. Chaque couche a donc sa rétention,
et c'est ce compromis qui définit le modèle.

```
dvf_mutations (brut, partitionné par année)        <- n8n : téléchargement + insertion
   |  process_department(from, to, département) : nettoyage, agrégation, puis purge du brut
dvf_mutations_clean (1 ligne = 1 bien, prix/m²)    <- 12 mois glissants, RLS lecture
   |  finalize_run() : rétention et reconstruction des agrégats
communes                                            <- référentiel, ~35 000 lignes
monthly_stats                                       <- 36 mois × département × type
commune_stats / commune_yearly_stats                <- 12 mois glissants par commune × type
pipeline_runs / webhook_events                      <- monitoring, écrit par n8n
```

| Couche | Grain | Rétention | Ordre de grandeur |
|---|---|---|---|
| `dvf_mutations` | ligne DVF brute | tampon, purgé dès le département agrégé | proche de zéro au repos |
| `dvf_mutations_clean` | un bien vendu | 12 mois glissants | ~2,3 M lignes |
| `monthly_stats` | mois × département × type | 36 mois | ~7 000 lignes |
| `commune_stats` | commune × type | 12 mois glissants | ~40 000 lignes |

Trois conséquences pour le front, toutes portées par `shared/api/repository.ts` :

1. **Le détail ne se lit jamais sans borne territoriale.** `fetchTransactions` exige un code de
   département ; la commune est un filtre supplémentaire. Une requête nationale sur
   `dvf_mutations_clean` serait un incident, pas une lenteur.
2. **Les agrégats persistants ont remplacé les vues matérialisées.** Un `percentile_cont` sur des
   millions de lignes prend plusieurs secondes ; pré-agrégé, il répond en millisecondes. Les
   tables sont écrites par le pipeline, donc la fraîcheur est celle de l'ingestion, et rien
   n'oblige à conserver le détail qui les a produites.
3. **Tout ce qui dépasse mille lignes est paginé**, PostgREST plafonnant chaque réponse. Quand le
   besoin se réduit à quelques lignes extrêmes, le tri part au serveur plutôt que la table au
   client : `fetchTopMovers` remonte dix communes au lieu de quarante mille.

## 3. KPIs retenus et justification

| KPI | Formule | Pourquoi celui-là | Visuel |
|---|---|---|---|
| Prix médian au m² | `percentile_cont(0.5)` sur `price_per_sqm` | La médiane ignore les extrêmes ; c'est le standard notarial et INSEE | KPI + sparkline |
| Volume de transactions | `count(*)` mensuel | Indicateur avancé : le volume décroche avant les prix | KPI + BarChart |
| Indice de tension (0-10) | sigmoïdes pondérées de Δvolume, Δprix, rotation | Un seul chiffre pour "où ça chauffe" | Jauge radiale |
| Élasticité prix/surface | pente de log(prix) ~ log(surface) | < 1 : décote des grandes surfaces, signal de marché locatif tendu | Scatter + droite |
| Dispersion P10 / P50 / P90 | quantiles mensuels | L'hétérogénéité d'un territoire, invisible dans une moyenne | Bande d'aire |
| Base 100 par région | médiane régionale pondérée / médiane du mois de référence | Comparer des trajectoires à l'échelle nationale sans 97 courbes | LineChart multi-séries |
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

## 5. Périmètre géographique

**France entière : les 97 départements publiés dans DVF.** Le référentiel vit dans la table
`departments` (code, nom, région, parc de logements) et non dans le code du front : ajouter un
territoire ne demande aucun déploiement.

L'**Alsace-Moselle (57, 67, 68) est exclue par construction** : ces départements relèvent du
Livre foncier et ne sont pas publiés dans DVF (un premier choix incluant le 67 a échoué en
ingestion, fichier inexistant). Mayotte (976), également absente de DVF, ne l'est pas davantage.
D'où 97 départements et non 101.

Le passage de douze départements de référence à la France entière change surtout la lecture :

- Une courbe par département devient illisible au-delà de la vingtaine. La comparaison en base
  100 s'agrège donc **par région** (pondérée par les transactions), le département sélectionné
  restant superposé en accent.
- Un nuage de 97 points ne peut pas porter 97 étiquettes : les phases de marché ne libellent que
  les douze départements les plus actifs, l'infobulle nommant tous les autres.
- Les listes déroulantes de département et de commune basculent en champ de recherche au-delà de
  vingt entrées (`SearchableSelect`).

## 6. Mocks

Les jeux mock sont générés de façon déterministe (générateur pseudo-aléatoire à graine) à
partir de niveaux de prix réalistes par département, avec saisonnalité et tendance. Ils
partagent les types des tables Supabase : le jour où `VITE_SUPABASE_URL` est renseigné,
les composants ne changent pas. Ils restent volontairement bornés à douze départements, ce qui
suffit à exercer toutes les vues et garde les tests rapides et déterministes.
