import { useEffect } from 'react';
import type { ShareProfileView } from '@hattz/profile-view';

/**
 * Metadados do documento (título/descrição) do perfil público.
 *
 * Preocupação exclusiva do host Share: o renderizador compartilhado (`@hattz/profile-view`) é puro e
 * o preview do Studio não deve assumir o `document.title` da aplicação. Por isso o efeito vive aqui.
 * Um `profile` nulo (estado não pronto) não altera o documento.
 */
export function useDocumentMeta(profile: ShareProfileView | null): void {
  useEffect(() => {
    if (!profile) return;

    const previousTitle = document.title;
    document.title = profile.seo.title ?? `${profile.displayName} — Hättz`;

    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const created = meta === null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    const previousDescription = meta.getAttribute('content');
    if (profile.seo.description) {
      meta.setAttribute('content', profile.seo.description);
    }

    return () => {
      document.title = previousTitle;
      if (created) {
        meta?.remove();
      } else if (previousDescription !== null) {
        meta?.setAttribute('content', previousDescription);
      }
    };
  }, [profile]);
}
