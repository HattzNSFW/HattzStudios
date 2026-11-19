import { getStudioDb, type LocalPublicationRecord } from './db';

/**
 * Leituras públicas da base local (somente `publications`).
 *
 * Estas funções são o único caminho pelo qual o Share e o hub enxergam o que foi publicado.
 * Elas NUNCA leem rascunhos (`workingDrafts`/`draftSnapshots`) e nunca expõem campos internos:
 * devolvem o registro de publicação cru (para o chamador projetar com `publicationToSnapshot`)
 * ou um resumo com apenas o necessário para listar perfis publicados.
 */

export interface PublishedProfileSummary {
  slug: string;
  displayName: string;
  version: number;
  publishedAt: number;
}

function readDisplayName(content: Record<string, unknown>): string {
  const profile = content.profile;
  if (typeof profile !== 'object' || profile === null) return '';
  const name = (profile as Record<string, unknown>).displayName;
  return typeof name === 'string' ? name : '';
}

/**
 * Publicação atual (`state === 'published'`) para um slug, ou `null`.
 *
 * Percorre apenas os registros publicados e filtra por slug — o índice de `state` evita varrer o
 * histórico inteiro e o filtro por slug é aplicado em memória (o slug não é indexado).
 */
export async function findPublishedPublicationBySlug(
  slug: string,
): Promise<LocalPublicationRecord | null> {
  const db = getStudioDb();
  const record = await db.publications
    .where('state')
    .equals('published')
    .filter((entry) => entry.slug === slug)
    .first();
  return record ?? null;
}

/** `true` quando existe QUALQUER publicação (publicada ou não) com o slug informado. */
export async function hasAnyPublicationWithSlug(slug: string): Promise<boolean> {
  const db = getStudioDb();
  const count = await db.publications.filter((entry) => entry.slug === slug).count();
  return count > 0;
}

/** Perfis efetivamente publicados, do mais recente para o mais antigo. */
export async function listPublishedProfiles(): Promise<PublishedProfileSummary[]> {
  const db = getStudioDb();
  const records = await db.publications.where('state').equals('published').toArray();
  return records
    .map((record) => ({
      slug: record.slug,
      displayName: readDisplayName(record.content),
      version: record.version,
      publishedAt: record.publishedAt,
    }))
    .sort((a, b) => b.publishedAt - a.publishedAt);
}
