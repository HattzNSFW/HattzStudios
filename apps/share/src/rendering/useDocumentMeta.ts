import { useEffect } from 'react';
import type { ShareProfileView } from '@hattz/profile-view';

type Restore = () => void;

/**
 * Define o conteúdo de uma meta tag, registrando como desfazer a alteração.
 *
 * Tags criadas são removidas na limpeza; tags preexistentes têm o `content` original restaurado
 * (inclusive quando ele não existia). Isso impede que metadados de um perfil vazem para outra rota.
 */
function setMetaContent(
  attribute: 'name' | 'property',
  key: string,
  content: string,
  restores: Restore[],
): void {
  let element = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  let created = false;
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
    created = true;
  }
  const target = element;
  const previousContent = target.getAttribute('content');
  target.setAttribute('content', content);

  restores.push(() => {
    if (created) {
      target.remove();
    } else if (previousContent === null) {
      target.removeAttribute('content');
    } else {
      target.setAttribute('content', previousContent);
    }
  });
}

/** O mesmo contrato de restauração de `setMetaContent`, aplicado ao link canônico. */
function setCanonicalHref(href: string, restores: Restore[]): void {
  let element = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  let created = false;
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', 'canonical');
    document.head.appendChild(element);
    created = true;
  }
  const target = element;
  const previousHref = target.getAttribute('href');
  target.setAttribute('href', href);

  restores.push(() => {
    if (created) {
      target.remove();
    } else if (previousHref === null) {
      target.removeAttribute('href');
    } else {
      target.setAttribute('href', previousHref);
    }
  });
}

/**
 * Metadados do documento (título/descrição/Open Graph/Twitter/canônico/robots) do perfil público.
 *
 * Preocupação exclusiva do host Share: o renderizador compartilhado (`@hattz/profile-view`) é puro e
 * o preview do Studio não deve assumir o `document.title` da aplicação. Por isso o efeito vive aqui.
 * Somente dados já públicos do perfil são usados. Perfil indisponível (`null`) recebe `noindex`, sem
 * metadados de perfil. `og:image` é deliberadamente omitido: o Share conhece apenas asset ids locais
 * (caminhos estáticos/`blob:`), nunca uma URL http(s) pública — se não há URL http(s), não há imagem.
 */
export function useDocumentMeta(profile: ShareProfileView | null): void {
  useEffect(() => {
    const restores: Restore[] = [];

    if (!profile) {
      setMetaContent('name', 'robots', 'noindex', restores);
      return () => {
        for (const restore of restores) restore();
      };
    }

    const previousTitle = document.title;
    const title = profile.seo.title ?? `${profile.displayName} — Hättz`;
    const description =
      profile.seo.description ??
      profile.bio ??
      `Perfil público de ${profile.displayName} no Hättz.`;
    const canonicalUrl = `${window.location.origin}/${profile.slug}`;

    document.title = title;
    restores.push(() => {
      document.title = previousTitle;
    });

    setMetaContent('name', 'description', description, restores);
    setMetaContent('property', 'og:type', 'profile', restores);
    setMetaContent('property', 'og:title', title, restores);
    setMetaContent('property', 'og:description', description, restores);
    setMetaContent('property', 'og:url', canonicalUrl, restores);
    setMetaContent('name', 'twitter:card', 'summary', restores);
    setMetaContent('name', 'twitter:title', title, restores);
    setMetaContent('name', 'twitter:description', description, restores);
    setMetaContent('name', 'robots', 'index, follow', restores);
    setCanonicalHref(canonicalUrl, restores);

    return () => {
      for (const restore of restores) restore();
    };
  }, [profile]);
}
