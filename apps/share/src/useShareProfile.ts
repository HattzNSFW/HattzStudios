import { useCallback, useEffect, useState } from 'react';
import { parsePublishedSnapshot, type ShareProfileView } from '@hattz/profile-view';
import { lookupProfile, type ShareDataSource } from './data';

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
 * O estado é derivado de `resolved`: enquanto o resultado resolvido não corresponde à requisição
 * atual (slug/retry), o estado é `loading`. Isso evita `setState` síncrono dentro do efeito e
 * trata naturalmente troca de slug e nova tentativa. Efeitos assíncronos são cancelados quando
 * a requisição muda (evita corrida entre slugs).
 */
export function useShareProfile(source: ShareDataSource, slug: string): UseShareProfileResult {
  const [attempt, setAttempt] = useState(0);
  const [resolved, setResolved] = useState<ResolvedState | null>(null);
  const requestKey = `${slug}#${attempt}`;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const result = await lookupProfile(source, slug);
        if (cancelled) return;

        if (result.status === 'not_found') {
          setResolved({ requestKey, state: { status: 'not_found' } });
          return;
        }
        if (result.status === 'unpublished') {
          setResolved({ requestKey, state: { status: 'unpublished' } });
          return;
        }

        const profile = parsePublishedSnapshot(result.snapshot);
        if (cancelled) return;
        setResolved({ requestKey, state: { status: 'ready', profile } });
      } catch (error) {
        if (cancelled) return;
        setResolved({
          requestKey,
          state: {
            status: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Erro inesperado ao carregar o perfil público.',
          },
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source, slug, requestKey]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  const state: ShareProfileState =
    resolved && resolved.requestKey === requestKey ? resolved.state : { status: 'loading' };

  return { state, reload };
}
