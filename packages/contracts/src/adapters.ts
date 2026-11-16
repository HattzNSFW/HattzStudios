import type {
  PublicationRecordContract,
  PublishedProfilePublicMediaContract,
  PublishedProfileSnapshotContract,
  SyncOperationContract,
} from './domains';

export interface PublicProfileReadAdapter {
  // Share: leitura somente de conteúdo efetivamente publicado/público via interface explícita (ex.: view segura).
  getPublishedProfileBySlug(slug: string): Promise<PublishedProfileSnapshotContract | null>;
}

export interface PublicMediaReadAdapter {
  // Share: metadados públicos mínimos de mídia (sem paths/buckets/checksums/metadata interna).
  listPublicMedia(): Promise<PublishedProfilePublicMediaContract[]>;
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
