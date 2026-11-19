import { useEffect, useState } from 'react';
import { buildPathForSlug, resolveSlugRoute, type SlugRouteMatch } from './slugRoute';

/** Observa a rota pública atual e reage a navegação (popstate/pushState). */
export function useSlugRoute(): SlugRouteMatch {
  const [route, setRoute] = useState<SlugRouteMatch>(() =>
    resolveSlugRoute(window.location.pathname),
  );

  useEffect(() => {
    const onChange = () => setRoute(resolveSlugRoute(window.location.pathname));
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);

  return route;
}

/** Navegação client-side para um perfil (mantém histórico do navegador). */
export function navigateToSlug(slug: string): void {
  window.history.pushState(null, '', buildPathForSlug(slug));
  window.dispatchEvent(new PopStateEvent('popstate'));
}
