import { useCallback, useEffect, useRef, useState } from 'react';
import { createLocalId } from '@hattz/shared-utils';
import {
  StaleDraftError,
  createLocalProfileWithDraft,
  createWorkingDraft,
  getLocalProfile,
  getWorkingDraft,
  listLocalProfiles,
  saveWorkingDraft,
  type LocalProfileRecord,
} from '../persistence';
import {
  createEmptyDraft,
  draftFromContent,
  slugForPreview,
  toSnapshotRecord,
  type StudioDraft,
} from '../editor';

/** Intervalo do autosave após a última alteração. */
export const AUTOSAVE_DELAY_MS = 700;

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';

export interface StudioEditorApi {
  profiles: LocalProfileRecord[];
  activeProfileId: string | null;
  draft: StudioDraft | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  lastSavedAt: number | null;
  storageReady: boolean;
  storageError: string | null;
  busy: boolean;
  createProfile: (displayName: string) => Promise<void>;
  selectProfile: (technicalId: string) => Promise<void>;
  updateDraft: (updater: (draft: StudioDraft) => StudioDraft) => void;
  saveNow: () => Promise<void>;
  reloadActive: () => Promise<void>;
  /** Limpa o perfil ativo quando ele desaparece (por exemplo, após restaurar um backup). */
  clearActiveProfile: () => void;
  /** Revisão atual do rascunho de trabalho (concorrência otimista na publicação). */
  getRevision: () => number | null;
  /** Recarrega a lista de perfis (ex.: após publicar/despublicar atualizar o rótulo). */
  refreshProfiles: () => Promise<void>;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Estado do Studio: lista de perfis, rascunho ativo, autosave e estados de salvamento/erro.
 *
 * O `draftRef` é a fonte da verdade (permite salvar sem depender do ciclo de render); o state
 * espelha para a UI. O salvamento é serializado (single-flight) e com verificação de revisão —
 * nunca sobrescreve silenciosamente (`StaleDraftError` → estado de conflito).
 *
 * Cargas de perfil também são serializadas por token: uma troca rápida A→B não pode terminar com
 * o rascunho de A caso a leitura de A seja mais lenta que a de B. Toda troca/reload/criação espera
 * o autosave em voo terminar antes de substituir `draftRef`, evitando gravar o rascunho novo no
 * perfil antigo.
 */
export function useStudioEditor(): StudioEditorApi {
  const [profiles, setProfiles] = useState<LocalProfileRecord[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [draft, setDraftState] = useState<StudioDraft | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const draftRef = useRef<StudioDraft | null>(null);
  const revisionRef = useRef<number | null>(null);
  const profileIdRef = useRef<string | null>(null);
  const loadTokenRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const dirtyRef = useRef(false);
  const conflictRef = useRef(false);
  const mountedRef = useRef(true);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const waitForSave = useCallback(async () => {
    // `clearTimer()` impede novas gravações agendadas, mas não cancela uma gravação já em voo.
    while (savingRef.current && savePromiseRef.current) {
      await savePromiseRef.current;
    }
  }, []);

  const runSave = useCallback(async () => {
    // Se já existe uma gravação em voo, aguarde-a antes de decidir. Sem isso, um `flush()`
    // (chamado antes de publicar) retornaria imediatamente enquanto a escrita pendente ainda
    // avança a revisão, e a publicação seguinte falharia por revisão obsoleta.
    // A verificação precisa ser síncrona: uma gravação iniciada por `pagehide` deve ser vista
    // por um `flush()` imediato. Um `await` aqui abriria uma janela em que `savingRef` ainda é
    // falso e a publicação usaria uma revisão obsoleta.
    while (savingRef.current && savePromiseRef.current) {
      await savePromiseRef.current;
    }
    if (savingRef.current || conflictRef.current) return;
    const profileId = profileIdRef.current;
    if (!profileId || !draftRef.current || revisionRef.current === null) return;
    if (!dirtyRef.current) return;

    savingRef.current = true;
    const promise = (async () => {
      // Loop para escoar edições que cheguem enquanto uma escrita está em voo.
      while (dirtyRef.current && !conflictRef.current) {
        const content = draftRef.current;
        const revision = revisionRef.current;
        if (!content || revision === null) break;
        dirtyRef.current = false;
        setSaveStatus('saving');
        try {
          const saved = await saveWorkingDraft(profileId, toSnapshotRecord(content), revision);
          if (!mountedRef.current) return;
          revisionRef.current = saved.revision;
          setLastSavedAt(saved.updatedAt);
          setSaveError(null);
          setSaveStatus(dirtyRef.current ? 'dirty' : 'saved');
        } catch (error) {
          if (!mountedRef.current) return;
          if (error instanceof StaleDraftError) {
            conflictRef.current = true;
            dirtyRef.current = false;
            setSaveStatus('conflict');
            setSaveError(
              'Este rascunho foi alterado em outro lugar. Recarregue para continuar sem sobrescrever o conteúdo mais recente.',
            );
          } else {
            dirtyRef.current = true;
            setSaveStatus('error');
            setSaveError(messageOf(error, 'Falha ao salvar o rascunho local.'));
          }
          break;
        }
      }
    })();
    savePromiseRef.current = promise;
    try {
      await promise;
    } finally {
      savingRef.current = false;
      savePromiseRef.current = null;
    }
  }, []);

  const scheduleSave = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void runSave();
    }, AUTOSAVE_DELAY_MS);
  }, [clearTimer, runSave]);

  const loadProfile = useCallback(
    async (technicalId: string) => {
      const token = ++loadTokenRef.current;
      // Nunca leia o banco enquanto uma gravação ainda pode estar mudando a revisão.
      await waitForSave();
      if (token !== loadTokenRef.current) return;

      const profile = await getLocalProfile(technicalId);
      if (!profile) throw new Error('Perfil local não encontrado.');
      if (token !== loadTokenRef.current) return;

      let working = await getWorkingDraft(technicalId);
      if (token !== loadTokenRef.current) return;
      if (!working) {
        const seed = createEmptyDraft(profile.displayName);
        working = await createWorkingDraft(technicalId, toSnapshotRecord(seed));
        if (token !== loadTokenRef.current) return;
      }

      const loaded = draftFromContent(working.content);
      if (!loaded.profile.displayName && profile.displayName) {
        loaded.profile.displayName = profile.displayName;
      }

      // Só o token mais recente pode publicar estado: uma leitura antiga que termina por último
      // não pode fazer a UI voltar ao perfil errado nem sobrescrever um autosave mais novo.
      if (token !== loadTokenRef.current || !mountedRef.current) return;
      draftRef.current = loaded;
      revisionRef.current = working.revision;
      profileIdRef.current = technicalId;
      dirtyRef.current = false;
      conflictRef.current = false;
      setDraftState(loaded);
      setActiveProfileId(technicalId);
      setSaveStatus('idle');
      setSaveError(null);
      setLastSavedAt(working.updatedAt);
    },
    [waitForSave],
  );

  const clearActiveProfile = useCallback(() => {
    clearTimer();
    loadTokenRef.current += 1;
    draftRef.current = null;
    revisionRef.current = null;
    profileIdRef.current = null;
    dirtyRef.current = false;
    conflictRef.current = false;
    setDraftState(null);
    setActiveProfileId(null);
    setSaveStatus('idle');
    setSaveError(null);
    setLastSavedAt(null);
    setStorageError(null);
  }, [clearTimer]);

  const createProfile = useCallback(
    async (displayName: string) => {
      clearTimer();
      await waitForSave();
      setBusy(true);
      try {
        const technicalId = createLocalId('prof');
        const seed = createEmptyDraft(displayName.trim());
        // Perfil e primeiro rascunho entram juntos: uma falha na segunda escrita não deixa
        // um perfil órfão (sem rascunho) na lista local.
        const { draft: working } = await createLocalProfileWithDraft(
          {
            technicalId,
            displayName: displayName.trim(),
            publicSlugDraft: slugForPreview(displayName),
          },
          toSnapshotRecord(seed),
        );

        loadTokenRef.current += 1;
        draftRef.current = seed;
        revisionRef.current = working.revision;
        profileIdRef.current = technicalId;
        dirtyRef.current = false;
        conflictRef.current = false;
        setDraftState(seed);
        setActiveProfileId(technicalId);
        setSaveStatus('idle');
        setSaveError(null);
        setLastSavedAt(working.updatedAt);
        setStorageError(null);
        setProfiles(await listLocalProfiles());
      } catch (error) {
        setStorageError(messageOf(error, 'Falha ao criar o perfil local.'));
      } finally {
        setBusy(false);
      }
    },
    [clearTimer, waitForSave],
  );

  const selectProfile = useCallback(
    async (technicalId: string) => {
      if (profileIdRef.current === technicalId) return;
      clearTimer();
      await runSave();
      setBusy(true);
      try {
        await loadProfile(technicalId);
        setStorageError(null);
      } catch (error) {
        setStorageError(messageOf(error, 'Falha ao abrir o perfil local.'));
      } finally {
        setBusy(false);
      }
    },
    [clearTimer, loadProfile, runSave],
  );

  const reloadActive = useCallback(async () => {
    const id = profileIdRef.current;
    if (!id) return;
    clearTimer();
    setBusy(true);
    try {
      await runSave();
      await loadProfile(id);
      setStorageError(null);
    } catch (error) {
      setStorageError(messageOf(error, 'Falha ao recarregar o perfil local.'));
    } finally {
      setBusy(false);
    }
  }, [clearTimer, loadProfile, runSave]);

  const updateDraft = useCallback(
    (updater: (draft: StudioDraft) => StudioDraft) => {
      const current = draftRef.current;
      if (!current) return;
      const next = updater(current);
      draftRef.current = next;
      setDraftState(next);
      if (!conflictRef.current) {
        dirtyRef.current = true;
        setSaveStatus('dirty');
        scheduleSave();
      }
    },
    [scheduleSave],
  );

  const saveNow = useCallback(async () => {
    clearTimer();
    if (conflictRef.current) return;
    await runSave();
  }, [clearTimer, runSave]);

  const getRevision = useCallback(() => revisionRef.current, []);

  const refreshProfiles = useCallback(async () => {
    try {
      const list = await listLocalProfiles();
      if (!mountedRef.current) return;
      setProfiles(list);
      // Uma recuperação bem-sucedida (botão "Tentar novamente") precisa limpar o erro anterior.
      setStorageError(null);
    } catch (error) {
      if (!mountedRef.current) return;
      setStorageError(messageOf(error, 'Falha ao atualizar a lista de perfis.'));
    }
  }, []);

  // Carrega a lista de perfis ao montar.
  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      try {
        const list = await listLocalProfiles();
        if (!mountedRef.current) return;
        setProfiles(list);
      } catch (error) {
        if (!mountedRef.current) return;
        setStorageError(messageOf(error, 'Falha ao acessar o armazenamento local.'));
      } finally {
        if (mountedRef.current) setStorageReady(true);
      }
    })();
    return () => {
      mountedRef.current = false;
      loadTokenRef.current += 1;
    };
  }, []);

  // Escoa o autosave quando a página fica oculta / é fechada.
  useEffect(() => {
    const flush = () => {
      if (dirtyRef.current) void runSave();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [runSave]);

  // Avisa antes de fechar com alterações não salvas.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current || saveStatus === 'saving' || saveStatus === 'error') {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveStatus]);

  // Limpa o timer ao desmontar.
  useEffect(() => () => clearTimer(), [clearTimer]);

  return {
    profiles,
    activeProfileId,
    draft,
    saveStatus,
    saveError,
    lastSavedAt,
    storageReady,
    storageError,
    busy,
    createProfile,
    selectProfile,
    updateDraft,
    saveNow,
    reloadActive,
    clearActiveProfile,
    getRevision,
    refreshProfiles,
  };
}
