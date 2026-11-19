import { COLLECTIBLE_RARITIES } from '@hattz/core';

/** Tipos de bloco suportados pelo editor (os oito aprovados). */
export type StudioBlockType =
  | 'heading'
  | 'text'
  | 'link'
  | 'links'
  | 'image'
  | 'badges'
  | 'music'
  | 'divider';

export interface BlockTypeDefinition {
  type: StudioBlockType;
  label: string;
  hint: string;
  defaultProps: Record<string, unknown>;
}

export const BLOCK_TYPES: readonly BlockTypeDefinition[] = [
  {
    type: 'heading',
    label: 'Título',
    hint: 'Cabeçalho de seção',
    defaultProps: { text: 'Novo título', level: 2 },
  },
  {
    type: 'text',
    label: 'Texto',
    hint: 'Parágrafo de texto',
    defaultProps: { text: 'Escreva algo…' },
  },
  {
    type: 'link',
    label: 'Link',
    hint: 'Um único link',
    defaultProps: { label: 'Meu link', url: 'https://' },
  },
  {
    type: 'links',
    label: 'Lista de links',
    hint: 'Vários links em grade',
    defaultProps: { items: [{ label: 'Meu link', url: 'https://' }] },
  },
  {
    type: 'image',
    label: 'Imagem',
    hint: 'Imagem com legenda',
    defaultProps: { assetId: '', alt: '', caption: '' },
  },
  {
    type: 'badges',
    label: 'Selos',
    hint: 'Coleção de conquistas',
    defaultProps: { title: 'Conquistas', items: [{ name: 'Novo selo', rarity: 'comum' }] },
  },
  {
    type: 'music',
    label: 'Música',
    hint: 'Player de áudio',
    defaultProps: { title: 'Nova faixa', artist: '', assetId: '', coverAssetId: '' },
  },
  {
    type: 'divider',
    label: 'Divisor',
    hint: 'Linha separadora',
    defaultProps: {},
  },
] as const;

export const BLOCK_TYPE_LABELS: Record<StudioBlockType, string> = {
  heading: 'Título',
  text: 'Texto',
  link: 'Link',
  links: 'Lista de links',
  image: 'Imagem',
  badges: 'Selos',
  music: 'Música',
  divider: 'Divisor',
};

/** Tipos de seção (agrupadores) reconhecidos pelo renderizador público. */
export const SECTION_TYPES: readonly { type: string; label: string }[] = [
  { type: 'about', label: 'Sobre' },
  { type: 'links', label: 'Links' },
  { type: 'content', label: 'Conteúdo' },
  { type: 'badges', label: 'Conquistas' },
  { type: 'music', label: 'Música' },
  { type: 'gallery', label: 'Galeria' },
] as const;

export function blockDefaultProps(type: StudioBlockType): Record<string, unknown> {
  const definition = BLOCK_TYPES.find((entry) => entry.type === type);
  return definition ? structuredClone(definition.defaultProps) : {};
}

export const RARITY_OPTIONS = COLLECTIBLE_RARITIES;
