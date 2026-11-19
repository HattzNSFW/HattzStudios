import { useCallback, useEffect, useState } from 'react';
import { listPendingSyncOperations, type PendingSyncOperationRecord } from '../persistence';

export interface StudioConnectivityApi {
  online: boolean;
  pending: PendingSyncOperationRecord[];
  error: string | null;
  reload: () => Promise<void>;
}

function readOnline(): boolean {
  return typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean'
    ? true
    : navigator.onLine;
}

/**
 * Estado de conexão e visibilidade da fila de sincronização local.
 *
 * A fila é SOMENTE LIDA: não existe drenagem remota nesta fase (ADR-002/ADR-004). Mostrar o estado
 * real evita sugerir que uma sincronização aconteceu quando ela apenas foi enfileirada.
 */
export function useStudioConnectivity(profileTechnicalId: string | null): StudioConnectivityApi {
  const [online, setOnline] = useState(readOnline);
  const [pending, setPending] = useState<PendingSyncOperationRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const records = await listPendingSyncOperations(profileTechnicalId ?? undefined);
      setPending(records);
      setError(null);
    } catch (cause) {
      setPending([]);
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível ler a fila de sincronização.',
      );
    }
  }, [profileTechnicalId]);

  useEffect(() => {
    const update = () => setOnline(readOnline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    // Defere a leitura para um microtask: o efeito apenas agenda a sincronização com o storage,
    // sem atualizar estado sincronamente durante a renderização/efeito.
    queueMicrotask(() => {
      void reload();
    });
  }, [reload]);

  return { online, pending, error, reload };
}
