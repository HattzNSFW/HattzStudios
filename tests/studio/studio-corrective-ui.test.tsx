import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Studio } from '../../apps/studio/src/components/Studio';
import {
  closeStudioDb,
  getStudioDb,
  type StudioDatabase,
} from '../../apps/studio/src/persistence/db';
import { ensureStudioDbReady } from '../../apps/studio/src/persistence/migrations';
import {
  createLocalDraftProfile,
  createWorkingDraft,
  enqueuePendingSyncOperation,
  storeMediaAsset,
} from '../../apps/studio/src/persistence/repository';
import { useStudioEditor } from '../../apps/studio/src/hooks/useStudioEditor';
import { useStudioMedia } from '../../apps/studio/src/hooks/useStudioMedia';
import { useStudioPublication } from '../../apps/studio/src/hooks/useStudioPublication';
import { createEmptyDraft, slugForPreview, toSnapshotRecord } from '../../apps/studio/src/editor';

describe('Studio — regressões corretivas de UI e concorrência', () => {
  const dbs: StudioDatabase[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await closeStudioDb();
    // Perfis criados pela UI também usam o DB singleton; registre-o para não vazar entre testes.
    const current = getStudioDb();
    if (!dbs.includes(current)) dbs.push(current);
    for (const db of dbs.splice(0)) {
      db.close();
      await db.delete();
    }
  });

  async function seed(technicalId: string, name: string): Promise<void> {
    const db = getStudioDb();
    if (!dbs.includes(db)) dbs.push(db);
    await ensureStudioDbReady(db);
    await createLocalDraftProfile({
      technicalId,
      displayName: name,
      publicSlugDraft: slugForPreview(name),
    });
    await createWorkingDraft(technicalId, toSnapshotRecord(createEmptyDraft(name)));
  }

  async function createProfileViaUi(name: string): Promise<void> {
    await screen.findByText('Nenhum perfil ainda.');
    fireEvent.change(screen.getByLabelText('Novo perfil'), { target: { value: name } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar perfil' }));
    await screen.findByLabelText('Nome de exibição');
  }

  /** Seleciona um perfil já seedado no IndexedDB, tornando-o o perfil ativo do Studio. */
  async function selectSeededProfile(name: string): Promise<void> {
    const sidebar = within(screen.getByRole('complementary', { name: 'Perfis locais' }));
    const item = await sidebar.findByRole('button', { name: new RegExp(name) });
    fireEvent.click(item);
    await screen.findByLabelText('Nome de exibição');
  }

  it('implementa o padrão ARIA de abas com foco por setas e painel associado', async () => {
    render(<Studio />);
    await createProfileViaUi('Alice');

    const firstTab = screen.getByRole('tab', { name: 'Perfil' });
    const secondTab = screen.getByRole('tab', { name: 'Seções' });
    expect(firstTab).toHaveAttribute('tabindex', '0');
    expect(secondTab).toHaveAttribute('tabindex', '-1');
    expect(firstTab).toHaveAttribute('aria-controls', 'studio-panel-perfil');

    firstTab.focus();
    fireEvent.keyDown(firstTab, { key: 'ArrowRight' });

    expect(secondTab).toHaveFocus();
    expect(secondTab).toHaveAttribute('aria-selected', 'true');
    expect(firstTab).toHaveAttribute('tabindex', '-1');
    expect(secondTab).toHaveAttribute('tabindex', '0');

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('id', 'studio-panel-secoes');
    expect(secondTab).toHaveAttribute('aria-controls', panel.id);

    fireEvent.keyDown(secondTab, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Dados' })).toHaveFocus();
  });

  it('nunca apresenta a fila local como sincronização remota', async () => {
    await seed('prof_fila', 'Alice');
    for (const state of ['pendente', 'falhou', 'conflito', 'sincronizando'] as const) {
      await enqueuePendingSyncOperation({
        operationId: `op_${state}`,
        profileTechnicalId: 'prof_fila',
        type: 'upsert_profile',
        state,
        payload: {},
        baseVersion: 1,
        lastError: null,
      });
    }

    render(<Studio />);
    await selectSeededProfile('Alice');
    fireEvent.click(screen.getByRole('tab', { name: 'Dados' }));

    expect(
      await screen.findByText(/Registros na fila local \(sem envio remoto nesta fase\)/),
    ).toBeVisible();
    // A leitura da fila é assíncrona; espera o item com estado de falha antes de verificar rótulos.
    expect(await screen.findByText(/Falha local — sem envio remoto/)).toBeVisible();
    expect(screen.queryByText('Sincronizando')).toBeNull();
  });

  it('consome a confirmação destrutiva mesmo quando a leitura do backup falha', async () => {
    await seed('prof_confirm', 'Alice');

    render(<Studio />);
    await selectSeededProfile('Alice');
    fireEvent.click(screen.getByRole('tab', { name: 'Dados' }));
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    const restoreInput = screen
      .getByText('Restaurar backup')
      .closest('label')!
      .querySelector('input')!;
    fireEvent.change(restoreInput, {
      target: {
        files: [new File(['{json-invalido'], 'invalido.json', { type: 'application/json' })],
      },
    });
    expect(await screen.findByText(/JSON válido/)).toBeVisible();

    expect(checkbox).not.toBeChecked();
    fireEvent.change(restoreInput, {
      target: { files: [new File(['{}'], 'backup.json', { type: 'application/json' })] },
    });
    expect(await screen.findByText(/Confirme a substituição/)).toBeVisible();
  });

  it('não devolve object URL revogada durante reload da mídia', async () => {
    await seed('prof_media_url', 'Alice');
    await storeMediaAsset({
      profileTechnicalId: 'prof_media_url',
      kind: 'avatar',
      blob: new Blob(['avatar'], { type: 'image/png' }),
    });
    let counter = 0;
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: () => `blob:mock/${++counter}`,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revoke,
    });

    const { result } = renderHook(() => useStudioMedia('prof_media_url'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const asset = result.current.assets[0]!;
    const firstUrl = result.current.resolver.resolveMediaUrl(asset.assetId);
    expect(firstUrl).toMatch(/^blob:mock\//);

    act(() => result.current.reload());

    // URLs revogadas não podem continuar resolvendo enquanto a nova leitura termina.
    expect(revoke).toHaveBeenCalledWith(firstUrl);
    expect(result.current.resolver.resolveMediaUrl(asset.assetId)).toBeNull();

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.resolver.resolveMediaUrl(asset.assetId)).toMatch(/^blob:mock\//);
  });

  it('descarta publicação tardia quando o perfil ativo muda', async () => {
    await seed('prof_pub_a', 'Alice');
    await seed('prof_pub_b', 'Bruno');
    let releaseFlush!: () => void;
    const flushGate = new Promise<void>((resolve) => {
      releaseFlush = resolve;
    });
    const draft = createEmptyDraft('Alice');
    const flush = () => flushGate;

    const { result, rerender } = renderHook(
      ({ profileId, activeDraft }) =>
        useStudioPublication({
          profileId,
          publicSlugDraft: profileId === 'prof_pub_a' ? 'alice' : 'bruno',
          draft: activeDraft,
          flush,
          getRevision: () => 1,
        }),
      { initialProps: { profileId: 'prof_pub_a', activeDraft: draft as typeof draft | null } },
    );
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => {
      void result.current.publish();
    });
    await waitFor(() => expect(result.current.status).toBe('publishing'));

    rerender({ profileId: 'prof_pub_b', activeDraft: null });
    await waitFor(() => expect(result.current.current).toBeNull());
    await waitFor(() => expect(result.current.ready).toBe(true));

    releaseFlush();
    await waitFor(() => expect(result.current.status).not.toBe('publishing'));
    expect(result.current.current).toBeNull();
    expect(result.current.history).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: 'alice' })]),
    );
  });

  it('mantém o último perfil selecionado quando duas trocas correm fora de ordem', async () => {
    await seed('prof_load_a', 'Alice');
    await seed('prof_load_b', 'Bruno');
    const db = getStudioDb();
    const originalGet = db.workingDrafts.get.bind(db.workingDrafts);
    let releaseA!: () => void;
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    vi.spyOn(db.workingDrafts, 'get').mockImplementation((key) =>
      originalGet(key).then(async (record) => {
        if (String(key) === 'prof_load_a') await gateA;
        return record;
      }),
    );

    const { result } = renderHook(() => useStudioEditor());
    await waitFor(() => expect(result.current.storageReady).toBe(true));

    act(() => {
      void result.current.selectProfile('prof_load_a');
      void result.current.selectProfile('prof_load_b');
    });

    await waitFor(() => expect(result.current.activeProfileId).toBe('prof_load_b'));
    expect(result.current.draft?.profile.displayName).toBe('Bruno');

    releaseA();
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.activeProfileId).toBe('prof_load_b');
    expect(result.current.draft?.profile.displayName).toBe('Bruno');
  });
});
