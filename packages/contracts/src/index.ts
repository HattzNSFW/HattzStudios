export type ContractVersion = `${number}.${number}.${number}`;

export interface VersionedContract {
  contract: string;
  version: ContractVersion;
}

export const CONTRACTS = {
  foundation: {
    contract: 'hattz.foundation',
    version: '0.1.0',
  },
  profile: {
    contract: 'hattz.profile',
    version: '0.1.0',
  },
  publishing: {
    contract: 'hattz.publishing',
    version: '0.1.0',
  },
  permissions: {
    contract: 'hattz.permissions',
    version: '0.1.0',
  },
} as const satisfies Record<string, VersionedContract>;

export type PublicationState =
  | 'draft'
  | 'validating'
  | 'ready_to_publish'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'unpublished';

export type SyncState =
  | 'offline'
  | 'sincronizando'
  | 'sincronizado'
  | 'pendente'
  | 'falhou'
  | 'conflito';

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
