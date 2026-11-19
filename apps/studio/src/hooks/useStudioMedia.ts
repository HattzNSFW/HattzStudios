import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ShareMediaResolver } from '@hattz/profile-view';
import { listMediaAssets, type MediaAssetRecord } from '../persistence';

export interface StudioMediaState {
  resolver: ShareMediaResolver;
  assets: MediaAssetRecord[];
  ready: boolean;
  error: string | null;
  reload: () => void;
}

function createObjectUrl(blob: Blob): string | null {
  if (typeof URL.createObjectURL !== 'function') return null;
  try {
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

function revokeObjectUrl(url: string): void {
  if (typeof URL.revokeObjectURL !== 'function') return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
}

/**
 * Carrega os ativos de mídia locais do perfil e expõe um `ShareMediaResolver` síncrono
 * (o renderizador resolve URLs de forma síncrona, então os object URLs são pré-computados).
 */
export function useStudioMedia(profileTechnicalId: string | null): StudioMediaState {
  const [assets, setAssets] = useState<MediaAssetRecord[]>([]);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState(0);

  useEffect(() => {
    if (!profileTechnicalId) {
      setAssets([]);
      setUrls(new Map());
      setReady(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const created: string[] = [];
    setReady(false);

    void (async () => {
      try {
        const list = await listMediaAssets(profileTechnicalId);
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const asset of list) {
          const url = createObjectUrl(asset.blob);
          if (url) {
            created.push(url);
            map.set(asset.assetId, url);
          }
        }
        setAssets(list);
        setUrls(map);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Falha ao carregar as mídias locais.');
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      for (const url of created) revokeObjectUrl(url);
    };
  }, [profileTechnicalId, token]);

  const resolver = useMemo<ShareMediaResolver>(
    () => ({ resolveMediaUrl: (assetId: string) => urls.get(assetId) ?? null }),
    [urls],
  );

  const reload = useCallback(() => setToken((value) => value + 1), []);

  return { resolver, assets, ready, error, reload };
}
