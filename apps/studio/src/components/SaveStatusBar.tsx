import type { SaveStatus } from '../hooks/useStudioEditor';

interface SaveStatusBarProps {
  status: SaveStatus;
  error: string | null;
  lastSavedAt: number | null;
  disabled: boolean;
  onSave: () => void;
  onReload: () => void;
}

const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function statusLabel(status: SaveStatus, lastSavedAt: number | null): string {
  switch (status) {
    case 'idle':
      return lastSavedAt ? `Salvo às ${timeFormatter.format(lastSavedAt)}` : 'Pronto';
    case 'dirty':
      return 'Alterações não salvas';
    case 'saving':
      return 'Salvando…';
    case 'saved':
      return lastSavedAt ? `Salvo às ${timeFormatter.format(lastSavedAt)}` : 'Salvo';
    case 'error':
      return 'Falha ao salvar';
    case 'conflict':
      return 'Conflito de versão';
  }
}

export function SaveStatusBar({
  status,
  error,
  lastSavedAt,
  disabled,
  onSave,
  onReload,
}: SaveStatusBarProps) {
  return (
    <div className="studio-status hattz-liquid-glass" role="status" aria-live="polite">
      <span className={`studio-status__dot studio-status__dot--${status}`} aria-hidden="true" />
      <span className="studio-status__label">{statusLabel(status, lastSavedAt)}</span>
      {error ? <span className="studio-status__error">{error}</span> : null}
      {status === 'conflict' ? (
        <button type="button" className="studio-button studio-button--small" onClick={onReload}>
          Recarregar do armazenamento
        </button>
      ) : (
        <button
          type="button"
          className="studio-button studio-button--small"
          onClick={onSave}
          disabled={disabled || status === 'saving'}
        >
          Salvar agora
        </button>
      )}
    </div>
  );
}
