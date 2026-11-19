export * from './availability';
export * from './collectibles';
export * from './catalog';

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

export interface FoundationModuleStatus {
  module: string;
  implemented: boolean;
  notes: string;
}
