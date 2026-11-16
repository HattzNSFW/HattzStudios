import type { SyncAdapter, SyncOperationContract } from '@hattz/contracts';

// Adapter local (preparação): representa a fronteira da fila local do Studio.
// Implementações reais de sync remoto dependem de fases autorizadas e configuração segura.
export class LocalStudioSyncAdapter implements SyncAdapter {
  constructor(private readonly operations: SyncOperationContract[] = []) {}

  async listPendingOperations(profileTechnicalId?: string): Promise<SyncOperationContract[]> {
    return this.operations.filter(
      (op) => !profileTechnicalId || op.profileTechnicalId === profileTechnicalId,
    );
  }
}
