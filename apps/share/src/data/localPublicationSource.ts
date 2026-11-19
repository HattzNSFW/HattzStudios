import type { PublishedProfileSnapshotContract } from '@hattz/contracts';
import {
  findPublishedPublicationBySlug,
  getStudioDb,
  hasAnyPublicationWithSlug,
  publicationToSnapshot,
} from '@hattz/local-store';
import type { ShareDataSource } from './types';

/**
 * Fonte de dados do Share integrada ao Studio (mesma origem / mesmo IndexedDB).
 *
 * O Share lê EXCLUSIVAMENTE a tabela `publications` da base local compartilhada
 * (`@hattz/local-store`) e somente o registro com `state === 'published'`. Rascunhos
 * (`workingDrafts`/`draftSnapshots`) nunca são consultados, e a projeção pública passa por
 * `publicationToSnapshot` — os mesmos campos permitidos que o Studio publica. Nenhum dado de
 * demonstração é usado em runtime.
 *
 * Como o renderizador resolve mídia de forma síncrona (`ShareMediaResolver`), os blobs referenciados
 * pelo snapshot são pré-carregados como object URLs em `getPublishedProfileBySlug`, antes de o
 * perfil ser renderizado. Os object URLs da leitura anterior são liberados a cada nova leitura.
 */

/** Chaves de asset públicas que podem aparecer no conteúdo publicado. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectAssetIds(content: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const add = (value: unknown): void => {
    if (typeof value === 'string' && value.trim() !== '') ids.add(value);
  };

  if (isRecord(content.profile)) {
    add(content.profile.avatarAssetId);
    add(content.profile.bannerAssetId);
  }

  if (Array.isArray(content.sections)) {
    for (const section of content.sections) {
      if (!isRecord(section) || !Array.isArray(section.blocks)) continue;
      for (const block of section.blocks) {
        if (!isRecord(block) || !isRecord(block.props)) continue;
        add(block.props.assetId);
        add(block.props.coverAssetId);
      }
    }
  }

  return [...ids];
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

export class LocalPublicationSource implements ShareDataSource {
  private readonly urls = new Map<string, string>();
  private created: string[] = [];

  async getPublishedProfileBySlug(slug: string): Promise<PublishedProfileSnapshotContract | null> {
    const record = await findPublishedPublicationBySlug(slug);
    if (!record) return null;
    await this.loadMedia(collectAssetIds(record.content), record.profileTechnicalId);
    return publicationToSnapshot(record);
  }

  async isKnownUnpublishedSlug(slug: string): Promise<boolean> {
    // Só é consultado quando não há publicação atual para o slug. Se existir uma publicação
    // anterior (agora despublicada), distinguimos "não publicado" de "inexistente".
    const published = await findPublishedPublicationBySlug(slug);
    if (published) return false;
    return hasAnyPublicationWithSlug(slug);
  }

  resolveMediaUrl(assetId: string): string | null {
    return this.urls.get(assetId) ?? null;
  }

  private async loadMedia(assetIds: string[], ownerProfileTechnicalId: string): Promise<void> {
    this.releaseMedia();
    if (assetIds.length === 0) return;

    const db = getStudioDb();
    const records = await db.mediaAssets.bulkGet(assetIds);
    for (const record of records) {
      // Uma referência adulterada não pode fazer o Share resolver mídia pertencente a outro perfil.
      if (!record || record.profileTechnicalId !== ownerProfileTechnicalId) continue;
      const url = createObjectUrl(record.blob);
      if (url) {
        this.urls.set(record.assetId, url);
        this.created.push(url);
      }
    }
  }

  private releaseMedia(): void {
    for (const url of this.created) revokeObjectUrl(url);
    this.created = [];
    this.urls.clear();
  }
}
