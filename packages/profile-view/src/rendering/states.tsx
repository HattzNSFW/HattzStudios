import type { ReactNode } from 'react';

function StateShell({ children }: { children: ReactNode }) {
  return (
    <div className="share-state">
      <div className="share-state__card hattz-liquid-glass">{children}</div>
    </div>
  );
}

export function LoadingState({ slug }: { slug: string }) {
  return (
    <StateShell>
      <div className="share-state__loading" role="status" aria-live="polite">
        <span className="share-spinner" aria-hidden="true" />
        <p className="share-state__title">Carregando perfil…</p>
        <p className="share-state__text">Buscando o perfil público “{slug}”.</p>
      </div>
    </StateShell>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <StateShell>
      <div role="alert" className="share-state__body">
        <p className="share-state__eyebrow">Erro</p>
        <h1 className="share-state__title">Não foi possível carregar o perfil</h1>
        <p className="share-state__text">{message}</p>
        <button type="button" className="share-button" onClick={onRetry}>
          Tentar novamente
        </button>
      </div>
    </StateShell>
  );
}

export function NotFoundState() {
  return (
    <StateShell>
      <div className="share-state__body" role="status" aria-live="polite">
        <p className="share-state__eyebrow">404</p>
        <h1 className="share-state__title">Perfil não encontrado</h1>
        <p className="share-state__text">
          Não existe um perfil público publicado neste endereço. Verifique o link.
        </p>
      </div>
    </StateShell>
  );
}

export function UnpublishedState() {
  return (
    <StateShell>
      <div className="share-state__body" role="status" aria-live="polite">
        <p className="share-state__eyebrow">Indisponível</p>
        <h1 className="share-state__title">Perfil despublicado</h1>
        <p className="share-state__text">
          Este perfil existe, mas não está publicado no momento. Tente novamente mais tarde.
        </p>
      </div>
    </StateShell>
  );
}

export function HomeState() {
  return (
    <StateShell>
      <div className="share-state__body">
        <p className="share-state__eyebrow">Hättz</p>
        <h1 className="share-state__title">Share</h1>
        <p className="share-state__text">
          Acesse um perfil público pelo endereço direto, por exemplo <code>/alice</code>.
        </p>
      </div>
    </StateShell>
  );
}
