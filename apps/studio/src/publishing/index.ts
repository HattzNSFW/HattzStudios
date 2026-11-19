import { parsePublishedSnapshot, type ShareProfileView } from '@hattz/profile-view';
import { publicationToSnapshot } from '@hattz/local-store';
import { validatePublishableSnapshotContent, type ValidationIssue } from '@hattz/validation';
import type { LocalPublicationRecord } from '../persistence';

export interface StudioPublishedPreview {
  profile: ShareProfileView | null;
  issues: ValidationIssue[];
}

/**
 * Constrói o snapshot público (mesmo contrato consumido pelo Share) a partir de uma publicação
 * local. Implementado em `@hattz/local-store` e reexportado aqui para manter o ponto de entrada
 * histórico `apps/studio/src/publishing` — o Share usa exatamente a mesma projeção pública.
 */
export { publicationToSnapshot };

/**
 * Prévia da versão publicada: lê EXCLUSIVAMENTE o snapshot persistido (nunca o rascunho) e usa o
 * mesmo `@hattz/profile-view` do Share. Sem publicação, devolve `profile: null` sem issues.
 */
export function buildPublishedPreview(
  record: LocalPublicationRecord | null,
): StudioPublishedPreview {
  if (!record) return { profile: null, issues: [] };
  try {
    return { profile: parsePublishedSnapshot(publicationToSnapshot(record)), issues: [] };
  } catch {
    const validation = validatePublishableSnapshotContent(record.content);
    return { profile: null, issues: validation.ok ? [] : validation.issues };
  }
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) out[key] = sortValue(record[key]);
    return out;
  }
  return value;
}

/** JSON estável (chaves ordenadas) para comparar conteúdo sem depender da ordem das chaves. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

/** `true` quando o conteúdo informado difere do conteúdo publicado (comparação canônica). */
export function contentDiffers(
  a: Record<string, unknown> | null,
  b: Record<string, unknown> | null,
): boolean {
  if (!a || !b) return a !== b;
  return stableStringify(a) !== stableStringify(b);
}
