import type { CommuneStat } from '@/shared/types/dvf';
import { tensionIndex } from '@/lib/stats/tension';
import { DEPARTMENTS, PROPERTY_TYPES } from './departments';
import { clamp, createRng, round } from './seed';

/** Commune de référence : code INSEE, nom et coordonnées réels. */
export interface CommuneSeed {
  readonly inseeCode: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
}

const SEED = 730_115;

/**
 * Six à dix communes réelles par département, choisies pour couvrir le centre dense,
 * la première couronne et une ville secondaire : c'est ce contraste qui rend la carte
 * et le classement lisibles.
 */
export const COMMUNES: Readonly<Record<string, readonly CommuneSeed[]>> = {
  '75': [
    { inseeCode: '75101', name: 'Paris 1er', lat: 48.8626, lng: 2.3363 },
    { inseeCode: '75105', name: 'Paris 5e', lat: 48.8448, lng: 2.3471 },
    { inseeCode: '75107', name: 'Paris 7e', lat: 48.8565, lng: 2.3125 },
    { inseeCode: '75109', name: 'Paris 9e', lat: 48.8769, lng: 2.3376 },
    { inseeCode: '75111', name: 'Paris 11e', lat: 48.859, lng: 2.3785 },
    { inseeCode: '75113', name: 'Paris 13e', lat: 48.8322, lng: 2.3561 },
    { inseeCode: '75115', name: 'Paris 15e', lat: 48.8412, lng: 2.3003 },
    { inseeCode: '75116', name: 'Paris 16e', lat: 48.8637, lng: 2.2769 },
    { inseeCode: '75118', name: 'Paris 18e', lat: 48.8926, lng: 2.3444 },
    { inseeCode: '75120', name: 'Paris 20e', lat: 48.8641, lng: 2.3984 },
  ],
  '92': [
    { inseeCode: '92012', name: 'Boulogne-Billancourt', lat: 48.8352, lng: 2.2409 },
    { inseeCode: '92050', name: 'Nanterre', lat: 48.8924, lng: 2.2069 },
    { inseeCode: '92026', name: 'Courbevoie', lat: 48.8978, lng: 2.2564 },
    { inseeCode: '92051', name: 'Neuilly-sur-Seine', lat: 48.8846, lng: 2.2685 },
    { inseeCode: '92040', name: 'Issy-les-Moulineaux', lat: 48.8236, lng: 2.273 },
    { inseeCode: '92023', name: 'Clamart', lat: 48.8014, lng: 2.2625 },
    { inseeCode: '92044', name: 'Levallois-Perret', lat: 48.8939, lng: 2.2874 },
    { inseeCode: '92004', name: 'Asnières-sur-Seine', lat: 48.9163, lng: 2.2853 },
  ],
  '69': [
    { inseeCode: '69383', name: 'Lyon 3e', lat: 45.7597, lng: 4.8574 },
    { inseeCode: '69386', name: 'Lyon 6e', lat: 45.7708, lng: 4.8497 },
    { inseeCode: '69387', name: 'Lyon 7e', lat: 45.7333, lng: 4.8419 },
    { inseeCode: '69266', name: 'Villeurbanne', lat: 45.7719, lng: 4.8902 },
    { inseeCode: '69259', name: 'Vénissieux', lat: 45.6975, lng: 4.8859 },
    { inseeCode: '69034', name: 'Caluire-et-Cuire', lat: 45.7955, lng: 4.8455 },
    { inseeCode: '69029', name: 'Bron', lat: 45.7333, lng: 4.9111 },
    { inseeCode: '69256', name: 'Vaulx-en-Velin', lat: 45.7768, lng: 4.9204 },
    { inseeCode: '69149', name: 'Oullins', lat: 45.7148, lng: 4.8078 },
  ],
  '33': [
    { inseeCode: '33063', name: 'Bordeaux', lat: 44.8378, lng: -0.5792 },
    { inseeCode: '33281', name: 'Mérignac', lat: 44.8386, lng: -0.6456 },
    { inseeCode: '33318', name: 'Pessac', lat: 44.8067, lng: -0.6311 },
    { inseeCode: '33522', name: 'Talence', lat: 44.8081, lng: -0.5906 },
    { inseeCode: '33550', name: "Villenave-d'Ornon", lat: 44.7789, lng: -0.5661 },
    { inseeCode: '33039', name: 'Bègles', lat: 44.8081, lng: -0.5478 },
    { inseeCode: '33009', name: 'Arcachon', lat: 44.658, lng: -1.1685 },
    { inseeCode: '33243', name: 'Libourne', lat: 44.9139, lng: -0.2436 },
  ],
  '13': [
    { inseeCode: '13205', name: 'Marseille 5e', lat: 43.2917, lng: 5.3958 },
    { inseeCode: '13208', name: 'Marseille 8e', lat: 43.2725, lng: 5.3822 },
    { inseeCode: '13213', name: 'Marseille 13e', lat: 43.3444, lng: 5.4067 },
    { inseeCode: '13001', name: 'Aix-en-Provence', lat: 43.5297, lng: 5.4474 },
    { inseeCode: '13005', name: 'Aubagne', lat: 43.2925, lng: 5.5706 },
    { inseeCode: '13056', name: 'Martigues', lat: 43.4053, lng: 5.0483 },
    { inseeCode: '13103', name: 'Salon-de-Provence', lat: 43.6406, lng: 5.0972 },
    { inseeCode: '13004', name: 'Arles', lat: 43.6768, lng: 4.628 },
    { inseeCode: '13028', name: 'La Ciotat', lat: 43.1747, lng: 5.6044 },
  ],
  '31': [
    { inseeCode: '31555', name: 'Toulouse', lat: 43.6045, lng: 1.4442 },
    { inseeCode: '31069', name: 'Blagnac', lat: 43.6367, lng: 1.3958 },
    { inseeCode: '31149', name: 'Colomiers', lat: 43.6108, lng: 1.3339 },
    { inseeCode: '31557', name: 'Tournefeuille', lat: 43.5811, lng: 1.3436 },
    { inseeCode: '31395', name: 'Muret', lat: 43.4614, lng: 1.3269 },
    { inseeCode: '31044', name: 'Balma', lat: 43.6103, lng: 1.4989 },
    { inseeCode: '31157', name: 'Cugnaux', lat: 43.5386, lng: 1.345 },
    { inseeCode: '31446', name: 'Ramonville-Saint-Agne', lat: 43.5461, lng: 1.4756 },
  ],
  '44': [
    { inseeCode: '44109', name: 'Nantes', lat: 47.2184, lng: -1.5536 },
    { inseeCode: '44184', name: 'Saint-Nazaire', lat: 47.2733, lng: -2.2134 },
    { inseeCode: '44162', name: 'Saint-Herblain', lat: 47.2172, lng: -1.6486 },
    { inseeCode: '44143', name: 'Rezé', lat: 47.1836, lng: -1.5494 },
    { inseeCode: '44114', name: 'Orvault', lat: 47.2711, lng: -1.6222 },
    { inseeCode: '44215', name: 'Vertou', lat: 47.1686, lng: -1.4692 },
    { inseeCode: '44055', name: 'La Baule-Escoublac', lat: 47.2864, lng: -2.3933 },
    { inseeCode: '44026', name: 'Carquefou', lat: 47.2967, lng: -1.4933 },
  ],
  '59': [
    { inseeCode: '59350', name: 'Lille', lat: 50.6292, lng: 3.0573 },
    { inseeCode: '59512', name: 'Roubaix', lat: 50.6942, lng: 3.1746 },
    { inseeCode: '59599', name: 'Tourcoing', lat: 50.7236, lng: 3.1611 },
    { inseeCode: '59009', name: "Villeneuve-d'Ascq", lat: 50.6222, lng: 3.1339 },
    { inseeCode: '59183', name: 'Dunkerque', lat: 51.0344, lng: 2.3768 },
    { inseeCode: '59606', name: 'Valenciennes', lat: 50.3583, lng: 3.5233 },
    { inseeCode: '59178', name: 'Douai', lat: 50.3714, lng: 3.08 },
    { inseeCode: '59378', name: 'Marcq-en-Barœul', lat: 50.6739, lng: 3.0928 },
  ],
  '06': [
    { inseeCode: '06088', name: 'Nice', lat: 43.7102, lng: 7.262 },
    { inseeCode: '06029', name: 'Cannes', lat: 43.5528, lng: 7.0174 },
    { inseeCode: '06004', name: 'Antibes', lat: 43.5808, lng: 7.1251 },
    { inseeCode: '06069', name: 'Grasse', lat: 43.6597, lng: 6.9225 },
    { inseeCode: '06083', name: 'Menton', lat: 43.7747, lng: 7.4972 },
    { inseeCode: '06027', name: 'Cagnes-sur-Mer', lat: 43.6644, lng: 7.1489 },
    { inseeCode: '06123', name: 'Saint-Laurent-du-Var', lat: 43.6681, lng: 7.1858 },
    { inseeCode: '06155', name: 'Vallauris', lat: 43.5806, lng: 7.0553 },
  ],
  '35': [
    { inseeCode: '35238', name: 'Rennes', lat: 48.1173, lng: -1.6778 },
    { inseeCode: '35288', name: 'Saint-Malo', lat: 48.6493, lng: -2.0257 },
    { inseeCode: '35051', name: 'Cesson-Sévigné', lat: 48.1211, lng: -1.6031 },
    { inseeCode: '35047', name: 'Bruz', lat: 48.025, lng: -1.7458 },
    { inseeCode: '35115', name: 'Fougères', lat: 48.3522, lng: -1.2019 },
    { inseeCode: '35360', name: 'Vitré', lat: 48.1244, lng: -1.21 },
    { inseeCode: '35278', name: 'Saint-Grégoire', lat: 48.1439, lng: -1.6892 },
  ],
  '67': [
    { inseeCode: '67482', name: 'Strasbourg', lat: 48.5734, lng: 7.7521 },
    { inseeCode: '67447', name: 'Schiltigheim', lat: 48.6058, lng: 7.7472 },
    { inseeCode: '67218', name: 'Illkirch-Graffenstaden', lat: 48.5306, lng: 7.7156 },
    { inseeCode: '67180', name: 'Haguenau', lat: 48.8156, lng: 7.7906 },
    { inseeCode: '67462', name: 'Sélestat', lat: 48.2597, lng: 7.4536 },
    { inseeCode: '67267', name: 'Lingolsheim', lat: 48.5578, lng: 7.6817 },
    { inseeCode: '67348', name: 'Obernai', lat: 48.4622, lng: 7.4817 },
  ],
  '34': [
    { inseeCode: '34172', name: 'Montpellier', lat: 43.6108, lng: 3.8767 },
    { inseeCode: '34032', name: 'Béziers', lat: 43.3442, lng: 3.2158 },
    { inseeCode: '34301', name: 'Sète', lat: 43.4033, lng: 3.6931 },
    { inseeCode: '34057', name: 'Castelnau-le-Lez', lat: 43.6367, lng: 3.9047 },
    { inseeCode: '34129', name: 'Lattes', lat: 43.5686, lng: 3.9028 },
    { inseeCode: '34003', name: 'Agde', lat: 43.3108, lng: 3.4756 },
    { inseeCode: '34145', name: 'Lunel', lat: 43.6772, lng: 4.1361 },
    { inseeCode: '34108', name: 'Frontignan', lat: 43.4478, lng: 3.7561 },
  ],
};

/**
 * Agrégats communaux sur les douze derniers mois.
 *
 * Le prix communal s'écarte du niveau départemental d'un facteur 0,7 à 1,6 : c'est l'ordre
 * de grandeur réel de l'écart entre une commune populaire et une commune recherchée du même
 * département. L'indice de tension n'est pas inventé : il est calculé par la même fonction
 * que celle utilisée sur les données Supabase, à partir du momentum de volume, du momentum
 * de prix et du taux de rotation du parc communal.
 */
export function generateCommuneStats(): readonly CommuneStat[] {
  const rng = createRng(SEED);
  const rows: CommuneStat[] = [];

  for (const department of DEPARTMENTS) {
    const communes = COMMUNES[department.code] ?? [];
    for (const commune of communes) {
      // Part du parc départemental portée par la commune, et attractivité locale.
      const stockShare = rng.range(0.02, 0.1);
      const priceFactor = rng.range(0.7, 1.6);

      for (const propertyType of PROPERTY_TYPES) {
        const typeShare =
          propertyType === 'appartement'
            ? department.apartmentShare
            : 1 - department.apartmentShare;
        const turnoverRate = rng.range(0.01, 0.04);
        const yoyChange = rng.range(-0.08, 0.09);
        const volumeChange = rng.range(-0.28, 0.32);

        const transactions = Math.max(
          10,
          Math.round(department.housingStock * stockShare * typeShare * turnoverRate),
        );
        const medianPricePerSqm =
          department.basePricePerSqm[propertyType] * priceFactor * rng.normal(1, 0.03);

        rows.push({
          inseeCode: commune.inseeCode,
          communeName: commune.name,
          departmentCode: department.code,
          propertyType,
          transactions,
          medianPricePerSqm: round(clamp(medianPricePerSqm, 800, 22_000)),
          yoyChange: round(yoyChange, 4),
          tensionIndex: tensionIndex({ volumeChange, priceChange: yoyChange, turnoverRate }),
          lat: commune.lat,
          lng: commune.lng,
        });
      }
    }
  }

  return rows;
}
