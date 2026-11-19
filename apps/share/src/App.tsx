import { useMemo } from 'react';
import { HomeState, NotFoundState } from '@hattz/profile-view';
import { LocalPublicationSource } from './data';
import { useSlugRoute } from './routing/useSlugRoute';
import { ErrorBoundary } from './rendering/ErrorBoundary';
import { ProfileRoute } from './rendering/ProfileRoute';

export function App() {
  // Fonte de dados local integrada ao Studio: lê somente snapshots publicados na base local
  // compartilhada (mesma origem). NÃO é o Supabase e NÃO usa dados de demonstração.
  const source = useMemo(() => new LocalPublicationSource(), []);
  const route = useSlugRoute();

  return (
    <main className="share-app">
      <ErrorBoundary>
        {route.kind === 'slug' ? (
          <ProfileRoute source={source} slug={route.slug} />
        ) : route.kind === 'root' ? (
          <HomeState />
        ) : (
          <NotFoundState />
        )}
      </ErrorBoundary>
    </main>
  );
}
