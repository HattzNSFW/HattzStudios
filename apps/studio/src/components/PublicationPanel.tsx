import { useMemo } from 'react';
import { validatePublishableSnapshotContent, type ValidationIssue } from '@hattz/validation';
import { toSnapshotContent, type StudioDraft } from '../editor';
import type { LocalPublicationRecord } from '../persistence';
import type { PublicationStatus } from '../hooks/useStudioPublication';

interface PublicationPanelProps {
  draft: StudioDraft;
  current: LocalPublicationRecord | null;
  history: LocalPublicationRecord[];
  status: PublicationStatus;
  error: string | null;
  issues: ValidationIssue[];
  differsFromPublished: boolean;
  disabled: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function formatDate(value: number): string {
  return dateFormatter.format(new Date(value));
}

export function PublicationPanel({
  draft,
  current,
  history,
  status,
  error,
  issues,
  differsFromPublished,
  disabled,
  onPublish,
  onUnpublish,
}: PublicationPanelProps) {
  // Pré-checagem local: mesma validação usada antes de persistir (proteção contra publicação
  // de conteúdo inválido). O bloqueio real continua sendo a validação no repositório.
  const validation = useMemo(
    () => validatePublishableSnapshotContent(toSnapshotContent(draft)),
    [draft],
  );
  const blockingIssues = issues.length > 0 ? issues : validation.ok ? [] : validation.issues;

  const publishing = status === 'publishing';
  const unpublishing = status === 'unpublishing';
  const canPublish = !disabled && !publishing && validation.ok;
  const canUnpublish = !disabled && !unpublishing && current !== null;

  return (
    <div className="studio-panel studio-publication">
      <div className="studio-panel__head">
        <h2 className="studio-panel__title">Publicação</h2>
        {current ? (
          <span className="studio-publication__badge studio-publication__badge--published">
            publicado (local) v{current.version}
          </span>
        ) : (
          <span className="studio-publication__badge">rascunho</span>
        )}
      </div>

      <p className="studio-publication__notice" role="note">
        <strong>Publicação local ≠ publicação pública.</strong> Publicar aqui cria um snapshot
        imutável guardado apenas neste navegador (IndexedDB). Nada é enviado para a internet e o
        perfil <em>não</em> fica publicamente acessível.
      </p>

      <div className="studio-publication__status">
        {current ? (
          <>
            <p className="studio-publication__line">
              Versão publicada: <strong>v{current.version}</strong>
            </p>
            <p className="studio-publication__meta">
              Publicada em {formatDate(current.publishedAt)}
            </p>
            {differsFromPublished ? (
              <p className="studio-publication__differs" aria-live="polite">
                O rascunho atual difere da versão publicada.
              </p>
            ) : (
              <p className="studio-publication__meta">O rascunho está igual à versão publicada.</p>
            )}
          </>
        ) : (
          <p className="studio-publication__meta">
            Nenhuma versão publicada ainda. Publique para criar a primeira versão.
          </p>
        )}
      </div>

      {!validation.ok ? (
        <div className="studio-publication__issues" role="alert">
          <p className="studio-publication__issues-title">
            Corrija os problemas abaixo para poder publicar:
          </p>
          <ul>
            {blockingIssues.map((issue) => (
              <li key={`${issue.path}:${issue.code}`}>
                {issue.path}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p className="studio-publication__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="studio-publication__actions">
        <button
          type="button"
          className="studio-button studio-button--primary"
          onClick={onPublish}
          disabled={!canPublish}
        >
          {publishing ? 'Publicando…' : current ? 'Publicar nova versão' : 'Publicar versão'}
        </button>
        <button
          type="button"
          className="studio-button"
          onClick={onUnpublish}
          disabled={!canUnpublish}
        >
          {unpublishing ? 'Despublicando…' : 'Despublicar'}
        </button>
      </div>

      <div className="studio-publication__history">
        <h3 className="studio-publication__history-title">Histórico de versões</h3>
        {history.length === 0 ? (
          <p className="studio-empty">Nenhuma versão publicada.</p>
        ) : (
          <ul className="studio-publication__history-list">
            {history.map((record) => (
              <li key={record.publicationId} className="studio-publication__history-item">
                <span className="studio-publication__history-version">v{record.version}</span>
                <span
                  className={`studio-publication__history-state${
                    record.state === 'published' ? ' is-current' : ''
                  }`}
                >
                  {record.state === 'published' ? 'publicada (atual)' : 'despublicada'}
                </span>
                <span className="studio-publication__history-date">
                  {record.state === 'published'
                    ? `publicada em ${formatDate(record.publishedAt)}`
                    : record.unpublishedAt
                      ? `despublicada em ${formatDate(record.unpublishedAt)}`
                      : `criada em ${formatDate(record.createdAt)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
