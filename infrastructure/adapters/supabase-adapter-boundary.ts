import type {
  PublicMediaReadAdapter,
  PublicProfileReadAdapter,
  PublishedProfilePublicMediaContract,
  PublishedProfileSnapshotContract,
} from '@hattz/contracts';

// Boundary de adapter Supabase (planejado). NÃO conecta nem instancia cliente externo nesta fase.
// Leitura pública futura deve usar views seguras explícitas (ex.: v_share_published_profiles, v_share_public_media).
export interface SupabaseAdapterConfig {
  projectUrl?: string;
  anonKey?: string;
}

export class PlannedSupabasePublicProfileReadAdapter implements PublicProfileReadAdapter {
  constructor(_config: SupabaseAdapterConfig = {}) {}

  async getPublishedProfileBySlug(_slug: string): Promise<PublishedProfileSnapshotContract | null> {
    throw new Error(
      'Adapter Supabase não configurado/conectado nesta fase (Fase 2A: preparação apenas).',
    );
  }
}

export class PlannedSupabasePublicMediaReadAdapter implements PublicMediaReadAdapter {
  constructor(_config: SupabaseAdapterConfig = {}) {}

  async listPublicMedia(): Promise<PublishedProfilePublicMediaContract[]> {
    throw new Error(
      'Adapter Supabase não configurado/conectado nesta fase (Fase 2A: preparação apenas).',
    );
  }
}
