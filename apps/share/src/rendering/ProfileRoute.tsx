import { useEffect } from 'react';
import {
  ErrorState,
  LoadingState,
  NotFoundState,
  ProfileView,
  UnpublishedState,
} from '@hattz/profile-view';
import type { ShareDataSource } from '../data/types';
import { useShareProfile } from '../useShareProfile';
import { useDocumentMeta } from './useDocumentMeta';

interface ProfileRouteProps {
  source: ShareDataSource;
  slug: string;
}

/** Rota pública de um perfil: resolve os estados de conexão e renderiza o conteúdo publicado. */
export function ProfileRoute({ source, slug }: ProfileRouteProps) {
  const { state, reload } = useShareProfile(source, slug);

  // Ao sair da rota pública (home/404), a mídia pré-resolvida não tem mais consumidor.
  useEffect(() => () => source.dispose?.(), [source]);

  // O título/descrição do documento refletem apenas o perfil pronto (efeito incondicional).
  useDocumentMeta(state.status === 'ready' ? state.profile : null);

  switch (state.status) {
    case 'loading':
      return <LoadingState slug={slug} />;
    case 'error':
      return <ErrorState message={state.message} onRetry={reload} />;
    case 'not_found':
      return <NotFoundState />;
    case 'unpublished':
      return <UnpublishedState />;
    case 'ready':
      return <ProfileView profile={state.profile} media={source} />;
  }
}
