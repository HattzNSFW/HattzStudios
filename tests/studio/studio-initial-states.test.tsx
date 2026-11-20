import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Studio } from '../../apps/studio/src/components/Studio';
import { closeStudioDb, getStudioDb } from '../../apps/studio/src/persistence/db';
import { ensureStudioDbReady } from '../../apps/studio/src/persistence/migrations';
import { createLocalProfileWithDraft } from '../../apps/studio/src/persistence/repository';

describe('Studio — estados iniciais do armazenamento local', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    const db = getStudioDb();
    await closeStudioDb();
    try {
      await db.delete();
    } catch {
      // ignore
    }
  });

  it('mostra carregamento sem contagens definitivas enquanto o IndexedDB é lido', async () => {
    const db = getStudioDb();
    await ensureStudioDbReady(db);
    const filter = vi.spyOn(db.localProfiles, 'filter').mockImplementationOnce(
      () =>
        ({
          sortBy: () => new Promise(() => undefined),
        }) as never,
    );

    const view = render(<Studio />);

    expect(screen.getByText('Carregando armazenamento local…')).toBeInTheDocument();
    expect(screen.getByText('Carregando perfis…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Visão geral do Studio')).not.toBeInTheDocument();
    expect(screen.queryByText('Crie seu primeiro perfil')).not.toBeInTheDocument();

    filter.mockRestore();
    view.unmount();
  });

  it('pede seleção quando existem perfis mas nenhum está ativo', async () => {
    const db = getStudioDb();
    await ensureStudioDbReady(db);
    await createLocalProfileWithDraft(
      { technicalId: 'prof_selecao', displayName: 'Luna', publicSlugDraft: 'luna' },
      { profile: { displayName: 'Luna' } },
    );

    render(<Studio />);

    const profileButton = await screen.findByRole('button', { name: /Luna/ });
    expect(screen.getByText('Selecione um perfil para continuar')).toBeInTheDocument();
    expect(screen.queryByText('Crie seu primeiro perfil')).not.toBeInTheDocument();

    fireEvent.click(profileButton);
    expect(await screen.findByLabelText('Nome de exibição')).toHaveValue('Luna');
  });

  it('mostra erro claro e recupera com "Tentar novamente"', async () => {
    const db = getStudioDb();
    await ensureStudioDbReady(db);
    const filter = vi.spyOn(db.localProfiles, 'filter').mockImplementationOnce(() => {
      throw new Error('IndexedDB indisponível');
    });

    render(<Studio />);

    expect(
      await screen.findByText('Não foi possível acessar o armazenamento local'),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('alert')
        .some((node) => /IndexedDB indisponível/.test(node.textContent ?? '')),
    ).toBe(true);
    expect(screen.queryByLabelText('Visão geral do Studio')).not.toBeInTheDocument();

    filter.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() =>
      expect(
        screen.queryByText('Não foi possível acessar o armazenamento local'),
      ).not.toBeInTheDocument(),
    );
    expect(await screen.findByText('Crie seu primeiro perfil')).toBeInTheDocument();
  });
});
