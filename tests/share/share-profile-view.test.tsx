import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PublishedProfileSnapshotContract } from '@hattz/contracts';
import { LoadingState } from '@hattz/profile-view';
import type { ShareDataSource } from '../../apps/share/src/data/types';
import { ProfileRoute } from '../../apps/share/src/rendering/ProfileRoute';

const readyContent = {
  schemaVersion: 1,
  profile: {
    displayName: 'Alice Andrade',
    bio: 'Bio pública',
    avatarAssetId: 'avatar_alice',
  },
  theme: { accent: '#a78bfa', avatarFrame: 'frame-purple' },
  sections: [
    {
      id: 's_links',
      type: 'links',
      visible: true,
      order: 1,
      blocks: [
        {
          id: 'b_links',
          type: 'links',
          visible: true,
          order: 1,
          props: { items: [{ label: 'GitHub', url: 'https://github.com/example' }] },
        },
      ],
    },
    {
      id: 's_badges',
      type: 'badges',
      visible: true,
      order: 2,
      blocks: [
        {
          id: 'b_badges',
          type: 'badges',
          visible: true,
          order: 1,
          props: { title: 'Coleção', items: [{ name: 'Fundadora', rarity: 'lendaria' }] },
        },
      ],
    },
  ],
};

const readySnapshot: PublishedProfileSnapshotContract = {
  slug: 'alice',
  profileVersion: 4,
  publishedAt: '2026-11-10T18:24:00.000Z',
  seoTitle: null,
  seoDescription: null,
  content: readyContent,
};

function makeSource(overrides: Partial<ShareDataSource> = {}): ShareDataSource {
  return {
    getPublishedProfileBySlug: async () => null,
    isKnownUnpublishedSlug: async () => false,
    resolveMediaUrl: () => null,
    ...overrides,
  };
}

describe('Share profile route states', () => {
  it('shows an accessible loading state', () => {
    render(<LoadingState slug="alice" />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando perfil');
  });

  it('renders a published profile with links, badges and document metadata', async () => {
    const source = makeSource({
      getPublishedProfileBySlug: async () => readySnapshot,
      resolveMediaUrl: (assetId) =>
        assetId === 'avatar_alice' ? '/share-data/media/avatar-alice.svg' : null,
    });

    render(<ProfileRoute source={source} slug="alice" />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Alice Andrade' })).toBeVisible();
    expect(screen.getByText('Bio pública')).toBeVisible();
    expect(screen.getByAltText('Avatar de Alice Andrade')).toBeVisible();

    const link = screen.getByRole('link', { name: /GitHub/ });
    expect(link).toHaveAttribute('href', 'https://github.com/example');
    expect(link.getAttribute('rel')).toContain('noopener');

    expect(screen.getByText('Fundadora')).toBeVisible();
    expect(screen.getByText('Lendária')).toBeVisible();

    await waitFor(() => expect(document.title).toBe('Alice Andrade — Hättz'));
  });

  it('shows the not-found state for an unknown slug', async () => {
    render(<ProfileRoute source={makeSource()} slug="ghost" />);
    expect(await screen.findByRole('heading', { name: 'Perfil não encontrado' })).toBeVisible();
  });

  it('shows the unpublished state when the source knows the slug is unpublished', async () => {
    const source = makeSource({ isKnownUnpublishedSlug: async () => true });
    render(<ProfileRoute source={source} slug="marina" />);
    expect(await screen.findByRole('heading', { name: 'Perfil despublicado' })).toBeVisible();
  });

  it('shows an error state and recovers on retry', async () => {
    let calls = 0;
    const source = makeSource({
      getPublishedProfileBySlug: async () => {
        calls += 1;
        if (calls === 1) throw new Error('falha temporária de rede');
        return readySnapshot;
      },
    });

    render(<ProfileRoute source={source} slug="alice" />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar este perfil.');
    expect(alert).not.toHaveTextContent('falha temporária de rede');

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Alice Andrade' })).toBeVisible();
    expect(calls).toBe(2);
  });

  it('does not resurrect a ready profile when navigating back to a previously visited slug', async () => {
    let mediaRevoked = false;
    let releaseAliceAgain!: () => void;
    const aliceAgainGate = new Promise<void>((resolve) => {
      releaseAliceAgain = resolve;
    });
    const brunoGate = new Promise<PublishedProfileSnapshotContract | null>(() => undefined);
    let aliceCalls = 0;

    const source = makeSource({
      getPublishedProfileBySlug: async (slug) => {
        if (slug === 'alice') {
          aliceCalls += 1;
          mediaRevoked = false;
          if (aliceCalls === 1) return readySnapshot;
          await aliceAgainGate;
          return readySnapshot;
        }
        if (slug === 'bruno') {
          mediaRevoked = true;
          return brunoGate;
        }
        return null;
      },
      resolveMediaUrl: (assetId) =>
        assetId === 'avatar_alice' && !mediaRevoked ? '/share-data/media/avatar-alice.svg' : null,
    });

    const view = render(<ProfileRoute source={source} slug="alice" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Alice Andrade' })).toBeVisible();
    expect(screen.getByAltText('Avatar de Alice Andrade')).toBeVisible();

    view.rerender(<ProfileRoute source={source} slug="bruno" />);
    expect(await screen.findByRole('status')).toHaveTextContent('Carregando perfil');

    // Uma nova visita a "alice" é uma nova requisição: o resultado antigo não pode ser
    // ressuscitado enquanto a leitura atual está pendente (especialmente sem a mídia antiga).
    view.rerender(<ProfileRoute source={source} slug="alice" />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando perfil');
    expect(screen.queryByRole('heading', { level: 1, name: 'Alice Andrade' })).toBeNull();

    releaseAliceAgain();
    expect(await screen.findByRole('heading', { level: 1, name: 'Alice Andrade' })).toBeVisible();
    expect(screen.getByAltText('Avatar de Alice Andrade')).toBeVisible();
    expect(aliceCalls).toBe(2);
  });

  it('announces terminal not-found and unpublished states to assistive technology', async () => {
    const notFound = render(<ProfileRoute source={makeSource()} slug="ghost" />);
    expect(await screen.findByRole('heading', { name: 'Perfil não encontrado' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Perfil não encontrado');
    notFound.unmount();

    const unpublishedSource = makeSource({ isKnownUnpublishedSlug: async () => true });
    const unpublished = render(<ProfileRoute source={unpublishedSource} slug="marina" />);
    expect(await screen.findByRole('heading', { name: 'Perfil despublicado' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Perfil despublicado');
    unpublished.unmount();
  });
});
