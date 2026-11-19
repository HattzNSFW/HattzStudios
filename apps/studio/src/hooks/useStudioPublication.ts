import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ValidationIssue } from '@hattz/validation';
import { slugForPreview, toSnapshotRecord, type StudioDraft } from '../editor';
import { contentDiffers } from '../publishing';
import {
  PublicationValidationError,
  StaleDraftError,
  getCurrentPublication,
  listPublications,
  publishWorkingDraft,
  unpublishProfile,
  type LocalPublicationRecord,
} from '../persistence';

export type PublicationStatus =
  | 'idle'
  | 'publishing'
  | 'unpublishing'
  | 'published'
  | 'unpublished'
  | 'error';

export interface StudioPublicationApi {
  current: LocalPublicationRecord | null;
  history: LocalPublicationRecord[];
  status: PublicationStatus;
  error: string | null;
  issues: ValidationIssue[];
  ready: boolean;
  differsFromPublished: boolean;
  publish: () => Promise<void>;
  unpublish: () => Promise<void>;
  refresh: () => Promise<void>;
}

export interface UseStudioPublicationOptions {
  profileId: string | null;
  /** Endereço público rascunho do perfil — é ele, e não o nome, que congela o slug publicado. */
  publicSlugDraft: string | null;
  draft: StudioDraft | null;
  /** Escoa o autosave pendente antes de publicar (garante que o snapshot é o rascunho atual). */
  flush: () => Promise<void>;
  /** Revisão atual do rascunho (concorrência otimista). */
  getRevision: () => number | null;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Estado de publicação local do perfil ativo.
 *
 * A publicação atual é lida do banco (`[profileTechnicalId+state]`), nunca derivada da lista.
 * Publicar/despublicar nunca altera o rascunho nem snapshots anteriores.
 */
export function useStudioPublication(options: UseStudioPublicationOptions): StudioPublicationApi {
  const { profileId, publicSlugDraft, draft, flush, getRevision } = options;
  const [current, setCurrent] = useState<LocalPublicationRecord | null>(null);
  const [history, setHistory] = useState<LocalPublicationRecord[]>([]);
  const [status, setStatus] = useState<PublicationStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [ready, setReady] = useState(false);

  const profileIdRef = useRef(profileId);
  profileIdRef.current = profileId;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const publicSlugRef = useRef(publicSlugDraft);
  publicSlugRef.current = publicSlugDraft;
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const id = profileIdRef.current;
    const token = ++requestRef.current;
    if (!id) {
      setCurrent(null);
      setHistory([]);
      setStatus('idle');
      setError(null);
      setIssues([]);
      setReady(true);
      return;
    }
    try {
      const [publication, list] = await Promise.all([
        getCurrentPublication(id),
        listPublications(id),
      ]);
      if (token !== requestRef.current) return;
      setCurrent(publication);
      setHistory(list);
      setStatus(publication ? 'published' : 'idle');
      setError(null);
      setIssues([]);
    } catch (err) {
      if (token !== requestRef.current) return;
      setError(messageOf(err, 'Falha ao carregar o estado de publicação.'));
      setStatus('error');
    } finally {
      if (token === requestRef.current) setReady(true);
    }
  }, []);

  useEffect(() => {
    setReady(false);
    void refresh();
  }, [profileId, refresh]);

  const publish = useCallback(async () => {
    const id = profileIdRef.current;
    const activeDraft = draftRef.current;
    if (!id || !activeDraft) return;
    setStatus('publishing');
    setError(null);
    setIssues([]);
    try {
      // Garante que o snapshot publicado é exatamente o rascunho atual.
      await flush();
      const revision = getRevision();
      const record = await publishWorkingDraft(id, {
        // O endereço editado na aba Dados é a fonte autoritativa; o fallback só cobre o caso
        // de um perfil carregado sem slug rascunho (não acontece no fluxo normal do Studio).
        slug: publicSlugRef.current ?? slugForPreview(activeDraft.profile.displayName),
        ...(revision !== null ? { expectedRevision: revision } : {}),
      });
      const list = await listPublications(id);
      setCurrent(record);
      setHistory(list);
      setStatus('published');
    } catch (err) {
      if (err instanceof PublicationValidationError) {
        setIssues(err.issues);
        setError('O rascunho atual tem problemas que impedem a publicação.');
      } else if (err instanceof StaleDraftError) {
        setError('O rascunho mudou enquanto era publicado. Recarregue e tente novamente.');
      } else {
        setError(messageOf(err, 'Falha ao publicar o perfil.'));
      }
      setStatus('error');
    }
  }, [flush, getRevision]);

  const unpublish = useCallback(async () => {
    const id = profileIdRef.current;
    if (!id) return;
    setStatus('unpublishing');
    setError(null);
    try {
      await unpublishProfile(id);
      const list = await listPublications(id);
      setCurrent(null);
      setHistory(list);
      setStatus('unpublished');
    } catch (err) {
      setError(messageOf(err, 'Falha ao despublicar o perfil.'));
      setStatus('error');
    }
  }, []);

  const differsFromPublished = useMemo(() => {
    if (!current || !draft) return false;
    return contentDiffers(toSnapshotRecord(draft), current.content);
  }, [current, draft]);

  return {
    current,
    history,
    status,
    error,
    issues,
    ready,
    differsFromPublished,
    publish,
    unpublish,
    refresh,
  };
}
