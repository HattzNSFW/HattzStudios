import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { PublishedProfileSnapshotContract } from '@hattz/contracts';
import type { ShareDataSource } from '../../apps/share/src/data/types';
import { ProfileRoute } from '../../apps/share/src/rendering/ProfileRoute';

const PUBLIC_MESSAGE = 'Não foi possível carregar este perfil.';
const SENSITIVE_MESSAGE = 'token=SUPER_SECRET_ADMIN_123; dsn=postgres://internal';

const readySnapshot: PublishedProfileSnapshotContract = {
  slug: 'alice',
  profileVersion: 1,
  content: {
    schemaVersion: 1,
    profile: { displayName: 'Alice Andrade' },
    sections: [],
  },
};

function makeSource(overrides: Partial<ShareDataSource> = {}): ShareDataSource {
  return {
    getPublishedProfileBySlug: async () => null,
    isKnownUnpublishedSlug: async () => false,
    resolveMediaUrl: () => null,
    ...overrides,
  };
}

describe('useShareProfile — mensagens públicas de erro', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('não expõe detalhes internos na UI, mantém o diagnóstico no console e preserva a nova tentativa', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let calls = 0;
    const source = makeSource({
      getPublishedProfileBySlug: async () => {
        calls += 1;
        if (calls === 1) throw new Error(SENSITIVE_MESSAGE);
        return readySnapshot;
      },
    });

    render(<ProfileRoute source={source} slug="alice" />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(PUBLIC_MESSAGE);
    expect(alert).not.toHaveTextContent(SENSITIVE_MESSAGE);
    expect(alert).not.toHaveTextContent('postgres://internal');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeEnabled();

    // O detalhe permanece disponível para desenvolvimento, mas nunca vem do estado público.
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('[share]'),
      expect.any(Error),
    );
    expect(
      consoleError.mock.calls.some((args) =>
        args.some((arg) => arg instanceof Error && arg.message === SENSITIVE_MESSAGE),
      ),
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Alice Andrade' })).toBeVisible();
    expect(calls).toBe(2);
  });
});
