import type { PublicationState, SyncState } from './index';

export type DataIsolationZone = 'local' | 'published' | 'administrative' | 'audit';

export interface ProfileIdentityContract {
  technicalId: string; // permanente
  publicSlug: string;
  displayName: string;
}

export interface PublicationRecordContract {
  profileTechnicalId: string;
  version: number;
  state: PublicationState;
  manifestHash?: string;
  publishedAt?: string;
  unpublishedAt?: string;
}

export interface SyncOperationContract {
  operationId: string;
  profileTechnicalId?: string;
  type: string;
  state: SyncState;
  baseVersion?: number;
  targetVersion?: number;
  conflictRef?: string;
}

export interface PublicProfileQuery {
  slug: string;
}

export interface PublishedProfileSnapshotContract {
  // Campos explicitamente permitidos na interface pública Share (view segura), sem IDs internos sensíveis.
  slug: string;
  profileVersion: number;
  publishedAt?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  content: Record<string, unknown>;
}

export interface PublishedProfilePublicMediaContract {
  assetId: string;
  kind: string;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  variant: string;
  format?: string | null;
  variantWidth?: number | null;
  variantHeight?: number | null;
}

export interface AuditLogContract {
  actorType: 'admin' | 'system' | 'service';
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  reason?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  result: 'success' | 'failure' | 'denied' | 'partial';
  correlationId?: string;
}
