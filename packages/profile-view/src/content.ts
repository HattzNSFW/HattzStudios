import type { PublishedProfileSnapshotContract } from '@hattz/contracts';
import {
  validatePublishableSnapshotContent,
  type PublishableBlock,
  type PublishableSection,
} from '@hattz/validation';
import {
  DEFAULT_SHARE_THEME,
  parseShareEffects,
  parseShareTheme,
  type ShareEffects,
  type ShareTheme,
} from './theme';

/** Erro de conteúdo: snapshot publicado que não corresponde ao contrato público esperado. */
export class ShareContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShareContentError';
  }
}

export interface ShareBlockView {
  id: string;
  type: string;
  order: number;
  props: Record<string, unknown>;
}

export interface ShareSectionView {
  id: string;
  type: string;
  order: number;
  blocks: ShareBlockView[];
}

export interface ShareSeoView {
  title: string | null;
  description: string | null;
}

export interface ShareProfileView {
  slug: string;
  profileVersion: number;
  publishedAt: string | null;
  displayName: string;
  bio: string | null;
  avatarAssetId: string | null;
  bannerAssetId: string | null;
  sections: ShareSectionView[];
  theme: ShareTheme;
  effects: ShareEffects;
  seo: ShareSeoView;
}

function toBlockView(block: PublishableBlock): ShareBlockView {
  return { id: block.id, type: block.type, order: block.order, props: block.props };
}

function toSectionView(section: PublishableSection): ShareSectionView {
  const blocks = section.blocks
    .filter((block) => block.visible)
    .sort((a, b) => a.order - b.order)
    .map(toBlockView);
  return { id: section.id, type: section.type, order: section.order, blocks };
}

function readSeo(
  snapshot: PublishedProfileSnapshotContract,
  contentSeo: { title?: string; description?: string } | undefined,
): ShareSeoView {
  const title = contentSeo?.title ?? snapshot.seoTitle ?? null;
  const description = contentSeo?.description ?? snapshot.seoDescription ?? null;
  return {
    title: typeof title === 'string' && title.trim() !== '' ? title : null,
    description: typeof description === 'string' && description.trim() !== '' ? description : null,
  };
}

/**
 * Interpreta um snapshot publicado no modelo de renderização do perfil.
 * Aplica o validador compartilhado (`@hattz/validation`) — o mesmo contrato do banco —
 * e rejeita conteúdo inválido com `ShareContentError` (o host mostra o estado de erro).
 */
export function parsePublishedSnapshot(
  snapshot: PublishedProfileSnapshotContract,
): ShareProfileView {
  const validation = validatePublishableSnapshotContent(snapshot.content);
  if (!validation.ok || !validation.value) {
    throw new ShareContentError('O conteúdo publicado não corresponde ao contrato público.');
  }
  const content = validation.value;

  const sections = content.sections
    .filter((section) => section.visible)
    .sort((a, b) => a.order - b.order)
    .map(toSectionView);

  return {
    slug: snapshot.slug,
    profileVersion: snapshot.profileVersion,
    publishedAt: snapshot.publishedAt ?? null,
    displayName: content.profile.displayName,
    bio: content.profile.bio ?? null,
    avatarAssetId: content.profile.avatarAssetId ?? null,
    bannerAssetId: content.profile.bannerAssetId ?? null,
    sections,
    theme: content.theme ? parseShareTheme(content.theme) : { ...DEFAULT_SHARE_THEME },
    effects: parseShareEffects(content.effects),
    seo: readSeo(snapshot, content.seo),
  };
}
