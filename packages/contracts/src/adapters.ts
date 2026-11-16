import type {
  PublicationRecordContract,
  PublishedProfileSnapshotContract,
  SyncOperationContract,
} from './domains';

export interface PublicProfileReadAdapter {
  // Share: leitura somente de conteúdo publicado/público
  getPublishedProfileBySlug(slug: string): Promise<PublishedProfileSnapshotContract | null>;
}

export interface PublicationAdapter {
  // Preparação para publicação futura (sem conexão externa nesta fase)
  getPublicationState(profileTechnicalId: string): Promise<PublicationRecordContract | null>;
}

export interface SyncAdapter {
  listPendingOperations(profileTechnicalId?: string): Promise<SyncOperationContract[]>;
}

export interface StorageMetadataAdapter {
  getProfileStorageUsage(profileTechnicalId: string): Promise<{
    totalBytes: number;
    imagesBytes: number;
    mediaBytes: number;
    otherBytes: number;
  } | null>;
}

export interface AuditAdapter {
  append(event: {
    actorType: 'admin' | 'system' | 'service';
    actorId?: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    result: 'success' | 'failure' | 'denied' | 'partial';
    reason?: string;
  }): Promise<void>;
}
