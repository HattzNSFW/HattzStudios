import type { PublicProfileReadAdapter, PublishedProfileSnapshotContract } from '@hattz/contracts';

// Boundary de adapter Supabase (planejado). NÃO conecta nem instancia cliente externo nesta fase.
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
