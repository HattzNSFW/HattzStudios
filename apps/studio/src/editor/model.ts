import { createLocalId } from '@hattz/shared-utils';
import { blockDefaultProps, type StudioBlockType } from './blocks';

export type StudioFont = 'sans' | 'serif' | 'mono';
export type StudioBackgroundStyle = 'solid' | 'gradient' | 'aurora';

export interface StudioProfileInfo {
  displayName: string;
  bio: string;
  avatarAssetId: string | null;
  bannerAssetId: string | null;
}

export interface StudioTheme {
  accent: string | null;
  background: string | null;
  surface: string | null;
  text: string | null;
  headingFont: StudioFont;
  bodyFont: StudioFont;
  radius: number | null;
  backgroundStyle: StudioBackgroundStyle;
  avatarFrame: string | null;
  grain: boolean;
  glow: boolean;
}

export interface StudioBlock {
  id: string;
  type: StudioBlockType;
  visible: boolean;
  props: Record<string, unknown>;
}

export interface StudioSection {
  id: string;
  type: string;
  visible: boolean;
  blocks: StudioBlock[];
}

export interface StudioSeo {
  title: string;
  description: string;
}

/**
 * Modelo de edição do Studio.
 *
 * É a fonte da verdade no editor e é convertido para `PublishableSnapshotContent` (o mesmo formato
 * consumido pelo Share) apenas na serialização/preview. A ordem de seções/blocos é a ordem do
 * array — não há campo `order` mutável no editor (o `order` é derivado no momento de serializar).
 */
export interface StudioDraft {
  schemaVersion: number;
  profile: StudioProfileInfo;
  theme: StudioTheme;
  seo: StudioSeo;
  sections: StudioSection[];
}

export const DEFAULT_STUDIO_THEME: StudioTheme = {
  accent: null,
  background: null,
  surface: null,
  text: null,
  headingFont: 'sans',
  bodyFont: 'sans',
  radius: null,
  backgroundStyle: 'gradient',
  avatarFrame: null,
  grain: false,
  glow: false,
};

export function createBlock(type: StudioBlockType): StudioBlock {
  return {
    id: createLocalId('blk'),
    type,
    visible: true,
    props: blockDefaultProps(type),
  };
}

export function createSection(type = 'content'): StudioSection {
  return {
    id: createLocalId('sec'),
    type,
    visible: true,
    blocks: [],
  };
}

export function createEmptyDraft(displayName = ''): StudioDraft {
  return {
    schemaVersion: 1,
    profile: {
      displayName,
      bio: '',
      avatarAssetId: null,
      bannerAssetId: null,
    },
    theme: { ...DEFAULT_STUDIO_THEME },
    seo: { title: '', description: '' },
    sections: [],
  };
}

/* ------------------------------------------------------------------ */
/* Operações puras (imutáveis)                                        */
/* ------------------------------------------------------------------ */

function mapSection(
  draft: StudioDraft,
  sectionId: string,
  update: (section: StudioSection) => StudioSection,
): StudioDraft {
  return {
    ...draft,
    sections: draft.sections.map((section) =>
      section.id === sectionId ? update(section) : section,
    ),
  };
}

function mapBlock(
  draft: StudioDraft,
  sectionId: string,
  blockId: string,
  update: (block: StudioBlock) => StudioBlock,
): StudioDraft {
  return mapSection(draft, sectionId, (section) => ({
    ...section,
    blocks: section.blocks.map((block) => (block.id === blockId ? update(block) : block)),
  }));
}

export function withProfile(draft: StudioDraft, patch: Partial<StudioProfileInfo>): StudioDraft {
  return { ...draft, profile: { ...draft.profile, ...patch } };
}

export function withTheme(draft: StudioDraft, patch: Partial<StudioTheme>): StudioDraft {
  return { ...draft, theme: { ...draft.theme, ...patch } };
}

export function withSeo(draft: StudioDraft, patch: Partial<StudioSeo>): StudioDraft {
  return { ...draft, seo: { ...draft.seo, ...patch } };
}

export function addSection(draft: StudioDraft, type = 'content'): StudioDraft {
  return { ...draft, sections: [...draft.sections, createSection(type)] };
}

export function withSection(
  draft: StudioDraft,
  sectionId: string,
  patch: Partial<Pick<StudioSection, 'type' | 'visible'>>,
): StudioDraft {
  return mapSection(draft, sectionId, (section) => ({ ...section, ...patch }));
}

export function removeSection(draft: StudioDraft, sectionId: string): StudioDraft {
  return { ...draft, sections: draft.sections.filter((section) => section.id !== sectionId) };
}

export function moveSection(draft: StudioDraft, sectionId: string, delta: -1 | 1): StudioDraft {
  return { ...draft, sections: moveItem(draft.sections, sectionId, delta) };
}

export function addBlock(
  draft: StudioDraft,
  sectionId: string,
  type: StudioBlockType,
): StudioDraft {
  return mapSection(draft, sectionId, (section) => ({
    ...section,
    blocks: [...section.blocks, createBlock(type)],
  }));
}

export function withBlock(
  draft: StudioDraft,
  sectionId: string,
  blockId: string,
  patch: Partial<Pick<StudioBlock, 'visible' | 'type'>>,
): StudioDraft {
  return mapBlock(draft, sectionId, blockId, (block) => ({ ...block, ...patch }));
}

export function updateBlockProps(
  draft: StudioDraft,
  sectionId: string,
  blockId: string,
  patch: Record<string, unknown>,
): StudioDraft {
  return mapBlock(draft, sectionId, blockId, (block) => ({
    ...block,
    props: { ...block.props, ...patch },
  }));
}

export function removeBlock(draft: StudioDraft, sectionId: string, blockId: string): StudioDraft {
  return mapSection(draft, sectionId, (section) => ({
    ...section,
    blocks: section.blocks.filter((block) => block.id !== blockId),
  }));
}

export function moveBlock(
  draft: StudioDraft,
  sectionId: string,
  blockId: string,
  delta: -1 | 1,
): StudioDraft {
  return mapSection(draft, sectionId, (section) => ({
    ...section,
    blocks: moveItem(section.blocks, blockId, delta),
  }));
}

function moveItem<T extends { id: string }>(items: T[], id: string, delta: -1 | 1): T[] {
  const index = items.findIndex((item) => item.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(index, 1);
  if (moved) next.splice(target, 0, moved);
  return next;
}
