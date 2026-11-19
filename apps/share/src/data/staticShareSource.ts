import type { PublishedProfileSnapshotContract } from '@hattz/contracts';
import { validatePublishableSnapshotContent } from '@hattz/validation';
import type { ShareDataSource } from './types';

/**
 * Fonte de dados local do Share (desenvolvimento).
 *
 * IMPORTANTE: NÃO é o Supabase e NÃO representa dados reais de produção. É um manifesto estático
 * servido pelo próprio app (`public/share-data/`) que tem o MESMO formato da view pública
 * `v_share_published_profiles`, para permitir exercitar de ponta a ponta o roteamento, o
 * carregamento, os estados e a renderização do Share enquanto a integração com o Supabase
 * não é autorizada. O adapter Supabase (`PlannedSupabasePublicProfileReadAdapter`) continua sendo
 * o destino de produção e segue não conectado.
 */

export interface StaticShareSourceOptions {
  /** Base dos arquivos estáticos (default `/share-data`). */
  baseUrl?: string;
  /** `fetch` injetável (testes). */
  fetchImpl?: typeof fetch;
}

interface StaticManifestProfile {
  slug: string;
  state: 'published' | 'unpublished';
  snapshot?: string;
}

interface StaticManifest {
  schemaVersion: number;
  profiles: StaticManifestProfile[];
  media: Record<string, string>;
}

function isManifest(value: unknown): value is StaticManifest {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.profiles)) return false;
  if (typeof candidate.media !== 'object' || candidate.media === null) return false;
  return candidate.profiles.every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const p = entry as Record<string, unknown>;
    return (
      typeof p.slug === 'string' &&
      (p.state === 'published' || p.state === 'unpublished') &&
      (p.snapshot === undefined || typeof p.snapshot === 'string')
    );
  });
}

function isSnapshot(value: unknown): value is PublishedProfileSnapshotContract {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.slug !== 'string' || typeof candidate.profileVersion !== 'number') {
    return false;
  }
  // Mesmo validador canônico do banco e do `parsePublishedSnapshot`: um fixture estático nunca
  // pode introduzir chaves internas/privadas no conteúdo público, mesmo em desenvolvimento.
  return validatePublishableSnapshotContent(candidate.content).ok;
}

export class StaticShareDataSource implements ShareDataSource {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private manifest: StaticManifest | null = null;
  private manifestPromise: Promise<StaticManifest> | null = null;

  constructor(options: StaticShareSourceOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '/share-data').replace(/\/+$/, '');
    // `fetch` nativo exige o receptor `Window`; guardá-lo em um campo e chamá-lo como método
    // dispara "Illegal invocation". O wrapper preserva o receptor correto.
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  }

  private loadManifest(): Promise<StaticManifest> {
    if (this.manifest) return Promise.resolve(this.manifest);
    if (this.manifestPromise) return this.manifestPromise;

    this.manifestPromise = (async () => {
      const response = await this.fetchImpl(`${this.baseUrl}/index.json`);
      if (!response.ok) {
        throw new Error(`Falha ao carregar o manifesto do Share (HTTP ${response.status}).`);
      }
      const json: unknown = await response.json();
      if (!isManifest(json)) {
        throw new Error('Manifesto do Share inválido.');
      }
      this.manifest = json;
      return json;
    })();

    // Não manter uma promise rejeitada em cache: permite nova tentativa (estado de erro → retry).
    this.manifestPromise.catch(() => {
      this.manifestPromise = null;
    });

    return this.manifestPromise;
  }

  async getPublishedProfileBySlug(slug: string): Promise<PublishedProfileSnapshotContract | null> {
    const manifest = await this.loadManifest();
    const entry = manifest.profiles.find((profile) => profile.slug === slug);
    if (!entry || entry.state !== 'published' || !entry.snapshot) return null;

    const response = await this.fetchImpl(`${this.baseUrl}/${entry.snapshot}`);
    if (!response.ok) {
      throw new Error(`Falha ao carregar o perfil "${slug}" (HTTP ${response.status}).`);
    }
    const json: unknown = await response.json();
    // O endereço solicitado, o conteúdo e o canonical precisam concordar. Um fixture desatualizado
    // não pode fazer `/alice` renderizar (e anunciar como canonical) o slug de outro perfil.
    if (!isSnapshot(json) || json.slug !== slug) {
      throw new Error(`Snapshot público inválido para o perfil "${slug}".`);
    }
    return json;
  }

  async isKnownUnpublishedSlug(slug: string): Promise<boolean> {
    const manifest = await this.loadManifest();
    return manifest.profiles.some(
      (profile) => profile.slug === slug && profile.state === 'unpublished',
    );
  }

  resolveMediaUrl(assetId: string): string | null {
    const url = this.manifest?.media[assetId];
    return typeof url === 'string' ? url : null;
  }
}
