import type { PublicProfileReadAdapter, PublishedProfileSnapshotContract } from '@hattz/contracts';
import type { ShareMediaResolver } from '@hattz/profile-view';

/**
 * Fonte de dados pública do Share.
 *
 * `getPublishedProfileBySlug` reutiliza o contrato `PublicProfileReadAdapter`: deve devolver
 * APENAS um perfil efetivamente publicado e público (equivalente à view `v_share_published_profiles`),
 * ou `null` quando não existe perfil publicado/público para o slug.
 *
 * `isKnownUnpublishedSlug` permite distinguir "não publicado" de "inexistente" QUANDO a fonte
 * consegue responder isso sem violar a separação público/interno. A view pública do Supabase não
 * expõe perfis não publicados, então o adapter Supabase real devolverá `false` (o Share mostrará
 * "não encontrado"). A fonte local de desenvolvimento responde a partir de um manifesto explícito.
 */
export interface ShareProfileSource extends PublicProfileReadAdapter {
  isKnownUnpublishedSlug(slug: string): Promise<boolean>;
}

/**
 * Resolve a URL pública de mídia a partir de um `assetId` do snapshot.
 *
 * Definido no renderizador compartilhado (`@hattz/profile-view`) e reexportado aqui para que o
 * boundary de dados do Share permaneça a superfície pública do app.
 *
 * A view pública de mídia (`v_share_public_media`) expõe apenas metadados (sem paths/buckets).
 * A estratégia de URL pública do Supabase ainda é decisão pendente; a fonte local mapeia os
 * asset ids para arquivos estáticos servidos pelo próprio Share.
 */
export type { ShareMediaResolver };

export type ShareDataSource = ShareProfileSource & ShareMediaResolver;

export type ShareProfileLookup =
  | { status: 'found'; snapshot: PublishedProfileSnapshotContract }
  | { status: 'unpublished' }
  | { status: 'not_found' };

/** Compõe a leitura do perfil publicado com a distinção (opcional) de "não publicado". */
export async function lookupProfile(
  source: ShareProfileSource,
  slug: string,
): Promise<ShareProfileLookup> {
  const snapshot = await source.getPublishedProfileBySlug(slug);
  if (snapshot) return { status: 'found', snapshot };

  const unpublished = await source.isKnownUnpublishedSlug(slug);
  return unpublished ? { status: 'unpublished' } : { status: 'not_found' };
}
