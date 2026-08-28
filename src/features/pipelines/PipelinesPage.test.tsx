import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PipelinesPage from './PipelinesPage';

describe('PipelinesPage', () => {
  it('rend la page sans planter', async () => {
    render(<PipelinesPage />);
    expect(screen.getByText('Architecture du flux')).toBeInTheDocument();
    await waitFor(
      () => {
        expect(screen.getByText('Historique des exécutions')).toBeInTheDocument();
        expect(screen.getAllByText('dvf-ingest-monthly').length).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );
    expect(screen.getByText('Santé PostgreSQL')).toBeInTheDocument();
  });
});
