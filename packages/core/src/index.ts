export type ProfileVisibility = 'public' | 'private' | 'unpublished';

export interface ProfileIdentity {
  id: string;
  publicSlug: string;
  displayName: string;
}

export interface ProfileSectionMeta {
  id: string;
  type: string;
  visible: boolean;
  order: number;
}

export const COLLECTIBLE_RARITIES = [
  'comum',
  'incomum',
  'rara',
  'epica',
  'lendaria',
  'mitica',
  'especial',
] as const;

export type CollectibleRarity = (typeof COLLECTIBLE_RARITIES)[number];

export interface FoundationModuleStatus {
  module: string;
  implemented: boolean;
  notes: string;
}
