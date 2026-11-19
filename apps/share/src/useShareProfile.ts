import { useCallback, useEffect, useRef, useState } from 'react';
import { parsePublishedSnapshot, type ShareProfileView } from '@hattz/profile-view';
import { lookupProfile, type ShareDataSource } from './data';
import { PUBLIC_PROFILE_ERROR_MESSAGE } from './publicMessages';

export type ShareProfileState =
  | { status: 'loading' }
  | { status: 'ready'; profile: ShareProfileView }
  | { status: 'not_found' }
  | { status: 'unpublished' }
  | { status: 'error'; message: string };

export interface UseShareProfileResult {
  state: ShareProfileState;
  reload: () => void;
}

interface ResolvedState {
  requestKey: string;
  state: ShareProfileState;
}

/**
 * Carrega o perfil público de um slug através do boundary de dados do Share.
 *
 * Cada visita (inclusive voltar a um slug já visto) recebe uma chave de requisição única no efeito.
 * O estado só é exibido quando a chave resolvida é a corrente; enquanto a leitura atual não termina,
 * a UI permanece em `loading`. Assim um resultado antigo não ressuscita com mídia já revogada.
 */
export function useShareProfile(source: ShareDataSource, slug: string): UseShareProfileResult {
  const [attempt, setAttempt] = useState(0);
  const [requestKey, setRequestKey] = useState(() => `${slug}#0#1`);
  const [resolved, setResolved] = useState<ResolvedState | null>(null);
  const visitSequenceRef = useRef(0);

  useEffect(() => {
    // O sequencial é incrementado dentro do efeito: uma nova visita é uma nova requisição mesmo
    // quando slug e tentativa são idênticos (navegação A → B → A).
    const key = `${slug}#${attempt}#${++visitSequenceRef.current}`;
    setRequestKey(key);
    let cancelled = false;

    void (async () => {
      try {
        const result = await lookupProfile(source, slug);
        if (cancelled) return;

        if (result.status === 'not_found') {
          setResolved({ requestKey: key, state: { status: 'not_found' } });
          return;
        }
        if (result.status === 'unpublished') {
          setResolved({ requestKey: key, state: { status: 'unpublished' } });
          return;
        }

        const profile = parsePublishedSnapshot(result.snapshot);
        if (cancelled) return;
        setResolved({ requestKey: key, state: { status: 'ready', profile } });
      } catch (error) {
        if (cancelled) return;
        // Diagnóstico completo para desenvolvimento; a UI recebe apenas a mensagem fixa.
        console.error('[share] Falha ao carregar o perfil público.', error);
        setResolved({
          requestKey: key,
          state: { status: 'error', message: PUBLIC_PROFILE_ERROR_MESSAGE },
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source, slug, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  const state: ShareProfileState =
    resolved && resolved.requestKey === requestKey ? resolved.state : { status: 'loading' };

  return { state, reload };
}
