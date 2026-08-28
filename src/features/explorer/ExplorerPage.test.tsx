import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ExplorerPage from './ExplorerPage';

/**
 * Test de fumée : la page monte, quitte l'état de chargement et réagit aux filtres.
 * Recharts ne dessine rien sous jsdom (le conteneur a une largeur nulle), on vérifie donc
 * le squelette accessible autour des graphiques, pas les tracés eux-mêmes.
 */
/** Les intitulés de KpiCard sont des <p> : le sélecteur les distingue des en-têtes de tri. */
const kpiLabel = (label: string): HTMLElement => screen.getByText(label, { selector: 'p' });

describe('ExplorerPage', () => {
  it('affiche les KPI et le compteur une fois les mutations chargées', async () => {
    render(<ExplorerPage />);

    expect(
      await screen.findByText('Transactions', { selector: 'p' }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/transactions sur/i)).toBeInTheDocument();
    expect(kpiLabel('Prix médian au m²')).toBeInTheDocument();
    expect(kpiLabel('Dispersion P10-P90')).toBeInTheDocument();
    expect(kpiLabel('Surface médiane')).toBeInTheDocument();
    expect(screen.getByText(/Élasticité/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /Matrice des corrélations/i })).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: /Communes classées par volume/i }),
    ).toBeInTheDocument();
  });

  it('recharge l échantillon quand le département change', async () => {
    render(<ExplorerPage />);
    await screen.findByText('Transactions', { selector: 'p' }, { timeout: 5000 });
    await screen.findByText(/département Paris/, {}, { timeout: 5000 });

    const select = screen.getByLabelText('Département analysé');
    expect(select).toHaveValue('75');

    fireEvent.change(select, { target: { value: '69' } });
    await waitFor(() => expect(select).toHaveValue('69'));
    expect(await screen.findByText(/département Rhône/, {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('trie le classement des communes au clic sur un en-tête', async () => {
    render(<ExplorerPage />);
    await screen.findByText('Transactions', { selector: 'p' }, { timeout: 5000 });

    const header = screen.getByRole('columnheader', { name: /^Commune$/ });
    expect(header).toHaveAttribute('aria-sort', 'none');

    fireEvent.click(screen.getByRole('button', { name: 'Trier par Commune' }));
    await waitFor(() => expect(header).toHaveAttribute('aria-sort', 'ascending'));

    fireEvent.click(screen.getByRole('button', { name: 'Trier par Commune' }));
    await waitFor(() => expect(header).toHaveAttribute('aria-sort', 'descending'));
  });
});
