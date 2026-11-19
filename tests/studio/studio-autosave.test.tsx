import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Studio } from '../../apps/studio/src/components/Studio';
import {
  closeStudioDb,
  getStudioDb,
  type StudioDatabase,
} from '../../apps/studio/src/persistence/db';
import {
  StaleDraftError,
  createLocalDraftProfile,
  createWorkingDraft,
  getWorkingDraft,
  listLocalProfiles,
  saveWorkingDraft,
} from '../../apps/studio/src/persistence/repository';
import { ensureStudioDbReady } from '../../apps/studio/src/persistence/migrations';

describe('Studio autosave (flush + no silent loss)', () => {
  const dbs: StudioDatabase[] = [];

  afterEach(async () => {
    await closeStudioDb();
    for (const db of dbs.splice(0)) {
      db.close();
      await db.delete();
    }
  });

  it('flushes a pending autosave on pagehide and drains edits made while saving', async () => {
    const db = getStudioDb();
    dbs.push(db);
    const { unmount } = render(<Studio />);

    await screen.findByText('Nenhum perfil ainda.');
    fireEvent.change(screen.getByLabelText('Novo perfil'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar perfil' }));
    const input = await screen.findByLabelText('Nome de exibição');
    await waitFor(() => expect(input).toBeEnabled());

    fireEvent.change(input, { target: { value: 'Primeiro' } });
    // Flush before the debounce fires.
    fireEvent(window, new Event('pagehide'));
    // A new edit arrives while the flush/save is in flight.
    fireEvent.change(input, { target: { value: 'Segundo' } });

    await waitFor(
      async () => {
        const profiles = await listLocalProfiles();
        expect(profiles[0]?.displayName).toBe('Segundo');
      },
      { timeout: 5000 },
    );

    const id = (await listLocalProfiles())[0]!.technicalId;
    const working = await getWorkingDraft(id);
    expect(working?.content).toMatchObject({ profile: { displayName: 'Segundo' } });

    unmount();
  });

  it('does not lose data when two saves race for the same revision', async () => {
    const db = getStudioDb();
    dbs.push(db);
    await ensureStudioDbReady(db);
    await createLocalDraftProfile({
      technicalId: 'prof_auto',
      displayName: 'A',
      publicSlugDraft: 'a',
    });
    const created = await createWorkingDraft('prof_auto', { n: 1 });

    const results = await Promise.allSettled([
      saveWorkingDraft('prof_auto', { n: 2 }, created.revision),
      saveWorkingDraft('prof_auto', { n: 3 }, created.revision),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(StaleDraftError);

    // The winner's content is persisted; nothing is silently overwritten or lost.
    const current = await getWorkingDraft('prof_auto');
    expect(current?.revision).toBe(2);
    expect([{ n: 2 }, { n: 3 }]).toContainEqual(current?.content);
  });
});
