import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { closeStudioDb, getStudioDb, StudioDatabase } from '@hattz/local-store';
import {
  createLocalDraftProfile,
  createWorkingDraft,
  getCurrentPublication,
  publishWorkingDraft,
  saveWorkingDraft,
  unpublishProfile,
} from '../../apps/studio/src/persistence/repository';
import { ensureStudioDbReady } from '../../apps/studio/src/persistence/migrations';
import { LocalPublicationSource } from '../../apps/share/src/data/localPublicationSource';
import { ProfileRoute } from '../../apps/share/src/rendering/ProfileRoute';

function makeContent(displayName: string, bio: string): Record<string, unknown> {
  return {
    schemaVersion: 1,
    profile: { displayName, bio },
    sections: [],
    theme: { backgroundStyle: 'gradient' },
    effects: { grain: false, glow: false },
  };
}

async function createStudioProfile(
  technicalId: string,
  displayName: string,
  bio: string,
): Promise<void> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  await createLocalDraftProfile({ technicalId, displayName, publicSlugDraft: 'alice' });
  await createWorkingDraft(technicalId, makeContent(displayName, bio));
}

function renderShare() {
  return render(<ProfileRoute source={new LocalPublicationSource()} slug="alice" />);
}

/**
 * Fluxo integrado Studio → Share na mesma origem (mesma base IndexedDB). Exercita exatamente os
 * passos do fluxo obrigatório do Owner, no nível de renderização real do Share.
 */
describe('Studio → Share integration (same-origin local publication)', () => {
  afterEach(async () => {
    cleanup();
    await closeStudioDb();
    const cleanupDb = new StudioDatabase();
    await cleanupDb.delete();
  });

  it('walks the full publish/edit/unpublish flow through the real Share renderer', async () => {
    await createStudioProfile('prof_flow', 'Alice Andrade', 'Bio v1');

    // 1) Draft only: the Share must NOT show it.
    const draftOnly = renderShare();
    expect(await screen.findByRole('heading', { name: 'Perfil não encontrado' })).toBeVisible();
    expect(screen.queryByText('Bio v1')).toBeNull();
    draftOnly.unmount();

    // 2) Publish v1: the Share shows the published snapshot.
    await publishWorkingDraft('prof_flow', { slug: 'alice' });
    const v1 = renderShare();
    expect(await screen.findByRole('heading', { level: 1, name: 'Alice Andrade' })).toBeVisible();
    expect(screen.getByText('Bio v1')).toBeVisible();
    v1.unmount();

    // 3) Edit the draft again WITHOUT publishing: the Share still shows v1.
    await saveWorkingDraft('prof_flow', makeContent('Alice Andrade', 'Bio v2 (rascunho)'), 1);
    const stillV1 = renderShare();
    expect(await screen.findByText('Bio v1')).toBeVisible();
    expect(screen.queryByText('Bio v2 (rascunho)')).toBeNull();
    stillV1.unmount();

    // 4) Publish v2: the Share shows the new version.
    await publishWorkingDraft('prof_flow', { slug: 'alice' });
    const v2 = renderShare();
    expect(await screen.findByText('Bio v2 (rascunho)')).toBeVisible();
    expect(screen.queryByText('Bio v1')).toBeNull();
    v2.unmount();

    // 5) Unpublish: the Share stops showing the profile.
    await unpublishProfile('prof_flow');
    const unpublished = renderShare();
    expect(await screen.findByRole('heading', { name: 'Perfil despublicado' })).toBeVisible();
    unpublished.unmount();
  });

  it('keeps showing the published version after a simulated reload', async () => {
    await createStudioProfile('prof_reload', 'Alice', 'Bio persistida');
    await publishWorkingDraft('prof_reload', { slug: 'alice' });

    // Simulate "reload + restart": drop the DB connection, then render with a fresh source.
    await closeStudioDb();

    renderShare();
    expect(await screen.findByText('Bio persistida')).toBeVisible();
  });

  it('shows an error state when the stored snapshot is corrupt (error handling)', async () => {
    await createStudioProfile('prof_bad', 'Alice', 'Bio');
    await publishWorkingDraft('prof_bad', { slug: 'alice' });

    // Corrupt the persisted snapshot content (e.g. legacy/manual data).
    const db = getStudioDb();
    const current = await getCurrentPublication('prof_bad');
    expect(current).not.toBeNull();
    await db.publications.update(current!.publicationId, {
      content: { schemaVersion: 1, profile: {}, sections: [] },
    });

    renderShare();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar este perfil.');
    expect(alert).not.toHaveTextContent('contrato público');
  });
});
