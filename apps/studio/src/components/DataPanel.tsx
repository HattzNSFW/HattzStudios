import { useCallback, useEffect, useState } from 'react';
import {
  deleteMediaAsset,
  listDraftSnapshots,
  listPublications,
  restoreDraftSnapshot,
  restorePublishedVersion,
  saveDraftSnapshot,
  updatePublicSlugDraft,
  type DraftSnapshotRecord,
  type LocalPublicationRecord,
  type MediaAssetRecord,
} from '../persistence';
import {
  downloadJson,
  exportBackup,
  exportProfileDraft,
  importProfileDraft,
  readJsonFile,
  restoreBackup,
} from '../persistence/transfer';
import { useStudioConnectivity } from '../hooks/useStudioConnectivity';
import type { StudioMediaState } from '../hooks/useStudioMedia';
import { toSnapshotRecord, type StudioDraft } from '../editor';
import { FileButton } from './fields';

interface DataPanelProps {
  profileId: string;
  slug: string;
  draft: StudioDraft;
  media: StudioMediaState;
  disabled: boolean;
  flush: () => Promise<void>;
  getRevision: () => number | null;
  reloadActive: () => Promise<void>;
  refreshProfiles: () => Promise<void>;
  onSlugChanged: (slug: string) => void;
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const SYNC_STATE_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  falhou: 'Falhou',
  conflito: 'Conflito',
  sincronizando: 'Sincronizando',
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Falha inesperada.';
}

export function DataPanel({
  profileId,
  slug,
  draft,
  media,
  disabled,
  flush,
  getRevision,
  reloadActive,
  refreshProfiles,
  onSlugChanged,
}: DataPanelProps) {
  const connectivity = useStudioConnectivity(profileId);
  const [checkpoints, setCheckpoints] = useState<DraftSnapshotRecord[]>([]);
  const [publications, setPublications] = useState<LocalPublicationRecord[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [slugValue, setSlugValue] = useState(slug);
  const [backupConfirmed, setBackupConfirmed] = useState(false);

  useEffect(() => setSlugValue(slug), [slug]);

  const refreshHistory = useCallback(async () => {
    try {
      const [drafts, published] = await Promise.all([
        listDraftSnapshots(profileId),
        listPublications(profileId),
      ]);
      setCheckpoints(drafts);
      setPublications(published);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, [profileId]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        await action();
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const handleSaveCheckpoint = () =>
    run(async () => {
      await flush();
      await saveDraftSnapshot(profileId, toSnapshotRecord(draft), 'manual');
      await refreshHistory();
      setNotice('Checkpoint salvo sem alterar a publicação.');
    });

  const handleRestoreCheckpoint = (version: number) =>
    run(async () => {
      const revision = getRevision();
      if (revision === null) throw new Error('Rascunho sem revisão carregada.');
      await restoreDraftSnapshot(profileId, version, revision);
      await reloadActive();
      await refreshHistory();
      setNotice('Checkpoint restaurado para o rascunho de trabalho.');
    });

  const handleRestorePublication = (version: number) =>
    run(async () => {
      const revision = getRevision();
      if (revision === null) throw new Error('Rascunho sem revisão carregada.');
      await restorePublishedVersion(profileId, version, revision);
      await reloadActive();
      setNotice('Versão publicada copiada para o rascunho (não republicada).');
    });

  const handleExportDraft = () =>
    run(async () => {
      await flush();
      const payload = await exportProfileDraft(profileId);
      downloadJson(payload, `hattz-rascunho-${payload.publicSlugDraft}.json`);
      setNotice('Rascunho exportado.');
    });

  const handleImportDraft = (file: File) =>
    run(async () => {
      const result = await importProfileDraft(await readJsonFile(file));
      await refreshProfiles();
      setNotice(`Rascunho importado como novo perfil local: ${result.profile.displayName}.`);
    });

  const handleExportBackup = () =>
    run(async () => {
      await flush();
      const payload = await exportBackup();
      downloadJson(payload, `hattz-backup-${new Date().toISOString().slice(0, 10)}.json`);
      setNotice('Backup completo exportado.');
    });

  const handleRestoreBackup = (file: File) =>
    run(async () => {
      if (!backupConfirmed) {
        throw new Error('Confirme a substituição dos dados locais antes de restaurar.');
      }
      const result = await restoreBackup(await readJsonFile(file));
      setBackupConfirmed(false);
      await refreshProfiles();
      await reloadActive();
      await refreshHistory();
      setNotice(
        `Backup restaurado: ${result.profiles} perfil(is), ${result.publications} publicação(ões), ${result.mediaAssets} arquivo(s).`,
      );
    });

  const handleDeleteMedia = (asset: MediaAssetRecord) =>
    run(async () => {
      await deleteMediaAsset(asset.assetId);
      media.reload();
      setNotice('Arquivo excluído da mídia local.');
    });

  const handleSaveSlug = () =>
    run(async () => {
      const updated = await updatePublicSlugDraft(profileId, slugValue);
      setSlugValue(updated.publicSlugDraft);
      onSlugChanged(updated.publicSlugDraft);
      await refreshProfiles();
      setNotice('Endereço rascunho atualizado (a publicação não foi alterada).');
    });

  return (
    <div className="studio-panel studio-data-panel">
      <h2 className="studio-panel__title">Dados, histórico e sincronização</h2>
      <p className="studio-help">
        Todas as operações desta aba são locais (IndexedDB). Nenhuma publicação remota ou drenagem
        de fila acontece nesta fase.
      </p>

      {notice ? (
        <p className="studio-notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="studio-banner-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="studio-data-section" aria-label="Endereço público">
        <h3>Endereço público</h3>
        <label className="studio-field">
          <span>Endereço rascunho (/slug)</span>
          <input
            type="text"
            value={slugValue}
            disabled={disabled || busy}
            onChange={(event) => setSlugValue(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="studio-button studio-button--small"
          disabled={disabled || busy || slugValue === slug}
          onClick={() => void handleSaveSlug()}
        >
          Salvar endereço
        </button>
      </section>

      <section className="studio-data-section" aria-label="Estado de conexão">
        <h3>Conexão</h3>
        <p className="studio-connection" data-online={connectivity.online}>
          <span className="studio-status__dot" aria-hidden="true" />
          {connectivity.online ? 'Online' : 'Offline — o Studio continua funcionando localmente'}
        </p>
        <p>
          Operações pendentes na fila local: <strong>{connectivity.pending.length}</strong>.
        </p>
        {connectivity.error ? (
          <p className="studio-banner-error" role="alert">
            {connectivity.error}
          </p>
        ) : null}
        {connectivity.pending.length > 0 ? (
          <ul className="studio-list">
            {connectivity.pending.map((op) => (
              <li key={op.operationId}>
                <code>{op.type}</code> — {SYNC_STATE_LABELS[op.state] ?? op.state} — tentativas:{' '}
                {op.attemptCount}
                {op.lastError ? ` — ${op.lastError}` : ''}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="studio-data-section" aria-label="Exportação e importação">
        <h3>Exportar e importar</h3>
        <div className="studio-data-actions">
          <button
            type="button"
            className="studio-button"
            disabled={disabled || busy}
            onClick={() => void handleExportDraft()}
          >
            Exportar rascunho (.json)
          </button>
          <FileButton
            label="Importar rascunho (novo perfil)"
            accept="application/json"
            disabled={disabled || busy}
            onFile={(file) => void handleImportDraft(file)}
          />
        </div>
        <div className="studio-data-actions">
          <button
            type="button"
            className="studio-button"
            disabled={disabled || busy}
            onClick={() => void handleExportBackup()}
          >
            Baixar backup completo (.json)
          </button>
          <FileButton
            label="Restaurar backup"
            accept="application/json"
            disabled={disabled || busy}
            onFile={(file) => void handleRestoreBackup(file)}
          />
        </div>
        <label className="studio-checkbox">
          <input
            type="checkbox"
            checked={backupConfirmed}
            onChange={(event) => setBackupConfirmed(event.target.checked)}
          />
          <span>
            Entendo que restaurar o backup substitui todos os dados locais deste navegador.
          </span>
        </label>
      </section>

      <section className="studio-data-section" aria-label="Histórico de rascunhos">
        <h3>Histórico de rascunhos</h3>
        <button
          type="button"
          className="studio-button studio-button--small"
          disabled={disabled || busy}
          onClick={() => void handleSaveCheckpoint()}
        >
          Salvar checkpoint
        </button>
        {checkpoints.length === 0 ? (
          <p className="studio-empty">Nenhum checkpoint salvo para este perfil.</p>
        ) : (
          <ul className="studio-list">
            {checkpoints.map((entry) => (
              <li key={entry.id}>
                <span>
                  v{entry.version} — {entry.label} — {dateFormatter.format(entry.createdAt)}
                </span>
                <button
                  type="button"
                  className="studio-button studio-button--small"
                  disabled={disabled || busy}
                  onClick={() => void handleRestoreCheckpoint(entry.version)}
                >
                  Restaurar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="studio-data-section" aria-label="Histórico de publicações">
        <h3>Versões publicadas</h3>
        {publications.length === 0 ? (
          <p className="studio-empty">Este perfil ainda não tem versões publicadas.</p>
        ) : (
          <ul className="studio-list">
            {publications.map((entry) => (
              <li key={entry.publicationId}>
                <span>
                  v{entry.version} — /{entry.slug} — {entry.state} —{' '}
                  {dateFormatter.format(entry.publishedAt)}
                </span>
                <button
                  type="button"
                  className="studio-button studio-button--small"
                  disabled={disabled || busy}
                  onClick={() => void handleRestorePublication(entry.version)}
                >
                  Copiar para rascunho
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="studio-data-section" aria-label="Biblioteca de mídia">
        <h3>Arquivos locais ({media.assets.length})</h3>
        {media.assets.length === 0 ? (
          <p className="studio-empty">Nenhum arquivo enviado para este perfil.</p>
        ) : (
          <ul className="studio-list">
            {media.assets.map((asset) => (
              <li key={asset.assetId}>
                <span>
                  {asset.kind} — {asset.mimeType} — {asset.size} bytes
                </span>
                <button
                  type="button"
                  className="studio-button studio-button--small"
                  disabled={disabled || busy}
                  onClick={() => void handleDeleteMedia(asset)}
                >
                  Excluir
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="studio-help">
          Arquivos referenciados por rascunhos, checkpoints ou publicações não podem ser excluídos.
        </p>
      </section>
    </div>
  );
}
