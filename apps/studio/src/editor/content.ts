import type { PublishedProfileSnapshotContract } from '@hattz/contracts';
import { parsePublishedSnapshot, type ShareProfileView } from '@hattz/profile-view';
import {
  validatePublishableSnapshotContent,
  type PublishableSnapshotContent,
  type ValidationIssue,
} from '@hattz/validation';
import { createLocalId } from '@hattz/shared-utils';
import {
  DEFAULT_STUDIO_THEME,
  type StudioBlock,
  type StudioDraft,
  type StudioSeo,
  type StudioTheme,
} from './model';
import { BLOCK_TYPES, type StudioBlockType } from './blocks';

const BLOCK_TYPE_SET = new Set<string>(BLOCK_TYPES.map((entry) => entry.type));
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function readHex(value: unknown): string | null {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : null;
}

function normalizeBlockType(value: unknown): StudioBlockType {
  return typeof value === 'string' && BLOCK_TYPE_SET.has(value)
    ? (value as StudioBlockType)
    : 'text';
}

/* ------------------------------------------------------------------ */
/* StudioDraft -> PublishableSnapshotContent (formato consumido pelo Share) */
/* ------------------------------------------------------------------ */

function serializeTheme(theme: StudioTheme): Record<string, unknown> {
  const out: Record<string, unknown> = {
    headingFont: theme.headingFont,
    bodyFont: theme.bodyFont,
    backgroundStyle: theme.backgroundStyle,
  };
  // Colors are stored only when they are safe 6-digit hex, matching the renderer's
  // `parseShareTheme`/`readHex` and the editor's `draftFromContent` (fail-closed).
  const accent = readHex(theme.accent);
  const background = readHex(theme.background);
  const surface = readHex(theme.surface);
  const text = readHex(theme.text);
  if (accent) out.accent = accent;
  if (background) out.background = background;
  if (surface) out.surface = surface;
  if (text) out.text = text;
  if (theme.radius !== null) out.radius = theme.radius;
  if (theme.avatarFrame) out.avatarFrame = theme.avatarFrame;
  return out;
}

function serializeSeo(seo: StudioSeo): { title?: string; description?: string } | null {
  const title = seo.title.trim();
  const description = seo.description.trim();
  if (!title && !description) return null;
  return { ...(title ? { title } : {}), ...(description ? { description } : {}) };
}

function serializeItems(
  value: unknown,
  mapItem: (item: Record<string, unknown>) => Record<string, unknown>,
): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value
    .map(asRecord)
    .filter((item): item is Record<string, unknown> => item !== null)
    .map(mapItem);
}

function serializeBlockProps(block: StudioBlock): Record<string, unknown> {
  const props = block.props;
  switch (block.type) {
    case 'heading':
      return { text: readString(props.text) ?? '', level: props.level === 3 ? 3 : 2 };
    case 'text':
      return { text: readString(props.text) ?? '' };
    case 'link': {
      const out: Record<string, unknown> = {
        label: readString(props.label) ?? '',
        url: readString(props.url) ?? '',
      };
      const description = readString(props.description);
      if (description) out.description = description;
      return out;
    }
    case 'links':
      return {
        items: serializeItems(props.items, (item) => {
          const out: Record<string, unknown> = {
            label: readString(item.label) ?? '',
            url: readString(item.url) ?? '',
          };
          const description = readString(item.description);
          if (description) out.description = description;
          return out;
        }),
      };
    case 'image': {
      const out: Record<string, unknown> = { alt: readString(props.alt) ?? '' };
      const assetId = readString(props.assetId);
      if (assetId) out.assetId = assetId;
      const caption = readString(props.caption);
      if (caption) out.caption = caption;
      return out;
    }
    case 'badges':
      return {
        title: readString(props.title) ?? '',
        items: serializeItems(props.items, (item) => {
          const out: Record<string, unknown> = { name: readString(item.name) ?? '' };
          const rarity = readString(item.rarity);
          if (rarity) out.rarity = rarity;
          const description = readString(item.description);
          if (description) out.description = description;
          return out;
        }),
      };
    case 'music': {
      const out: Record<string, unknown> = { title: readString(props.title) ?? '' };
      const artist = readString(props.artist);
      if (artist) out.artist = artist;
      const assetId = readString(props.assetId);
      if (assetId) out.assetId = assetId;
      const coverAssetId = readString(props.coverAssetId);
      if (coverAssetId) out.coverAssetId = coverAssetId;
      return out;
    }
    case 'divider':
      return {};
  }
}

/** Converte o modelo de edição no formato de snapshot publicável (mesmo contrato do Share). */
export function toSnapshotContent(draft: StudioDraft): PublishableSnapshotContent {
  const content: PublishableSnapshotContent = {
    schemaVersion: draft.schemaVersion,
    profile: { displayName: draft.profile.displayName },
    sections: draft.sections.map((section, sectionIndex) => ({
      id: section.id,
      type: section.type,
      visible: section.visible,
      order: sectionIndex,
      blocks: section.blocks.map((block, blockIndex) => ({
        id: block.id,
        type: block.type,
        visible: block.visible,
        order: blockIndex,
        props: serializeBlockProps(block),
      })),
    })),
  };

  const bio = draft.profile.bio.trim();
  if (bio) content.profile.bio = bio;
  if (draft.profile.avatarAssetId) content.profile.avatarAssetId = draft.profile.avatarAssetId;
  if (draft.profile.bannerAssetId) content.profile.bannerAssetId = draft.profile.bannerAssetId;

  content.theme = serializeTheme(draft.theme);
  content.effects = { grain: draft.theme.grain, glow: draft.theme.glow };

  const seo = serializeSeo(draft.seo);
  if (seo) content.seo = seo;

  return content;
}

/** Mesmo conteúdo, tipado como registro (formato persistido/transportado). */
export function toSnapshotRecord(draft: StudioDraft): Record<string, unknown> {
  return toSnapshotContent(draft) as unknown as Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* PublishableSnapshotContent (armazenado) -> StudioDraft             */
/* ------------------------------------------------------------------ */

function readOrder(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function readFont(
  value: unknown,
  fallback: StudioTheme['headingFont'],
): StudioTheme['headingFont'] {
  return value === 'sans' || value === 'serif' || value === 'mono' ? value : fallback;
}

/** Reconstrói o modelo de edição a partir do conteúdo armazenado (tolerante a dados incompletos). */
export function draftFromContent(content: unknown): StudioDraft {
  const root = asRecord(content) ?? {};
  const profile = asRecord(root.profile) ?? {};
  const theme = asRecord(root.theme) ?? {};
  const effects = asRecord(root.effects) ?? {};
  const seo = asRecord(root.seo) ?? {};
  const sectionsRaw = Array.isArray(root.sections) ? root.sections : [];

  const radius = theme.radius;
  const sections = sectionsRaw
    .map(asRecord)
    .filter((section): section is Record<string, unknown> => section !== null)
    .sort((a, b) => readOrder(a.order) - readOrder(b.order))
    .map((section) => {
      const blocksRaw = Array.isArray(section.blocks) ? section.blocks : [];
      return {
        id: readString(section.id) ?? createLocalId('sec'),
        type: readString(section.type) ?? 'content',
        visible: section.visible !== false,
        blocks: blocksRaw
          .map(asRecord)
          .filter((block): block is Record<string, unknown> => block !== null)
          .sort((a, b) => readOrder(a.order) - readOrder(b.order))
          .map((block) => ({
            id: readString(block.id) ?? createLocalId('blk'),
            type: normalizeBlockType(block.type),
            visible: block.visible !== false,
            props: asRecord(block.props) ?? {},
          })),
      };
    });

  return {
    schemaVersion: typeof root.schemaVersion === 'number' ? root.schemaVersion : 1,
    profile: {
      displayName: typeof profile.displayName === 'string' ? profile.displayName : '',
      bio: typeof profile.bio === 'string' ? profile.bio : '',
      avatarAssetId: readString(profile.avatarAssetId),
      bannerAssetId: readString(profile.bannerAssetId),
    },
    theme: {
      ...DEFAULT_STUDIO_THEME,
      accent: readHex(theme.accent),
      background: readHex(theme.background),
      surface: readHex(theme.surface),
      text: readHex(theme.text),
      headingFont: readFont(theme.headingFont, 'sans'),
      bodyFont: readFont(theme.bodyFont, 'sans'),
      radius:
        typeof radius === 'number' && Number.isFinite(radius) && radius >= 0
          ? Math.min(radius, 40)
          : null,
      backgroundStyle:
        theme.backgroundStyle === 'solid' ||
        theme.backgroundStyle === 'gradient' ||
        theme.backgroundStyle === 'aurora'
          ? theme.backgroundStyle
          : 'gradient',
      avatarFrame: readString(theme.avatarFrame),
      grain: effects.grain === true,
      glow: effects.glow === true,
    },
    seo: {
      title: typeof seo.title === 'string' ? seo.title : '',
      description: typeof seo.description === 'string' ? seo.description : '',
    },
    sections,
  };
}

/* ------------------------------------------------------------------ */
/* Preview (mesmo pipeline de validação + renderização do Share)      */
/* ------------------------------------------------------------------ */

export interface StudioPreview {
  profile: ShareProfileView | null;
  issues: ValidationIssue[];
}

export function slugForPreview(displayName: string): string {
  const slug = displayName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (!slug) return 'preview';
  // O contrato de slug exige ao menos 3 caracteres (`validateSlug`): um nome curto ("Jo") não
  // pode gerar um endereço que a própria publicação rejeitaria. Completamos de forma determinística.
  return slug.length < 3 ? slug.padEnd(3, '0') : slug;
}

/**
 * Constrói o preview usando exatamente o pipeline do Share: serializa para o formato de snapshot,
 * valida com `validatePublishableSnapshotContent` e interpreta com `parsePublishedSnapshot`.
 *
 * Um `displayName` vazio é substituído por um placeholder APENAS no preview (o rascunho salvo
 * preserva o valor real); se ainda assim houver problemas, devolve as issues em vez de renderizar.
 */
export function buildPreview(draft: StudioDraft): StudioPreview {
  const previewDraft: StudioDraft = {
    ...draft,
    profile: {
      ...draft.profile,
      displayName: draft.profile.displayName.trim() || 'Seu perfil',
    },
  };

  const content = toSnapshotContent(previewDraft);
  const snapshot: PublishedProfileSnapshotContract = {
    slug: slugForPreview(draft.profile.displayName),
    profileVersion: 1,
    publishedAt: null,
    seoTitle: null,
    seoDescription: null,
    content: content as unknown as Record<string, unknown>,
  };
  try {
    return { profile: parsePublishedSnapshot(snapshot), issues: [] };
  } catch {
    return { profile: null, issues: validatePublishableSnapshotContent(content).issues };
  }
}
