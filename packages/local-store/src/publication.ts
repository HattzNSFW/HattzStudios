import type { PublishedProfileSnapshotContract } from '@hattz/contracts';
import type { LocalPublicationRecord } from './db';

function readSeo(content: Record<string, unknown>): {
  title: string | null;
  description: string | null;
} {
  const seo = content.seo;
  if (typeof seo !== 'object' || seo === null) return { title: null, description: null };
  const record = seo as Record<string, unknown>;
  const title =
    typeof record.title === 'string' && record.title.trim() !== '' ? record.title : null;
  const description =
    typeof record.description === 'string' && record.description.trim() !== ''
      ? record.description
      : null;
  return { title, description };
}

/**
 * Constrói o snapshot público (mesmo contrato consumido pelo Share) a partir de uma publicação
 * local. Expõe APENAS os campos permitidos na interface pública — nunca o registro interno
 * (`profileTechnicalId`, `state`, etc.).
 *
 * Compartilhado entre o Studio (prévia publicada) e o Share (leitura pública), garantindo que a
 * projeção pública seja exatamente a mesma nos dois lados.
 */
export function publicationToSnapshot(
  record: LocalPublicationRecord,
): PublishedProfileSnapshotContract {
  const content = record.content;
  const seo = readSeo(content);
  return {
    slug: record.slug,
    profileVersion: record.version,
    publishedAt: new Date(record.publishedAt).toISOString(),
    seoTitle: seo.title,
    seoDescription: seo.description,
    content,
  };
}
