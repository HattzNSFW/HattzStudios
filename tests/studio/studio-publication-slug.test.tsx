import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  closeStudioDb,
  getStudioDb,
  type StudioDatabase,
} from '../../apps/studio/src/persistence/db';
import { ensureStudioDbReady } from '../../apps/studio/src/persistence/migrations';
import {
  createLocalDraftProfile,
  createWorkingDraft,
  getCurrentPublication,
} from '../../apps/studio/src/persistence/repository';
import { createEmptyDraft, toSnapshotRecord } from '../../apps/studio/src/editor';
import { useStudioPublication } from '../../apps/studio/src/hooks/useStudioPublication';

describe('useStudioPublication — slug publicado vem do endereço rascunho', () => {
  const dbs: StudioDatabase[] = [];

  afterEach(async () => {
    await closeStudioDb();
    for (const db of dbs.splice(0)) {
      db.close();
      await db.delete();
    }
  });

  it('congela publicSlugDraft no snapshot, não o slug derivado do nome de exibição', async () => {
    const db = getStudioDb();
    dbs.push(db);
    await ensureStudioDbReady(db);
    await createLocalDraftProfile({
      technicalId: 'prof_slug_publicacao',
      displayName: 'Nome Antigo',
      publicSlugDraft: 'endereco-escolhido',
    });
    const draft = createEmptyDraft('Nome Novo Diferente');
    await createWorkingDraft('prof_slug_publicacao', toSnapshotRecord(draft));

    const { result } = renderHook(() =>
      useStudioPublication({
        profileId: 'prof_slug_publicacao',
        publicSlugDraft: 'endereco-escolhido',
        draft,
        flush: async () => undefined,
        getRevision: () => 1,
      }),
    );

    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await result.current.publish();
    });

    const publication = await getCurrentPublication('prof_slug_publicacao');
    expect(publication).not.toBeNull();
    expect(publication!.slug).toBe('endereco-escolhido');
    expect(result.current.error).toBeNull();
  });
});
