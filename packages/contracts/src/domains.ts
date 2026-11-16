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
  profileTechnicalId: string;
  slug: string;
  version: number;
  visibility: 'public' | 'unpublished';
  content: Record<string, unknown>;
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
