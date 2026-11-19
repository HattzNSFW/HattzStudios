import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { parsePublishedSnapshot, type ShareProfileView } from '@hattz/profile-view';
import { useDocumentMeta } from '../../apps/share/src/rendering/useDocumentMeta';

function makeProfile(
  slug: string,
  seoTitle: string | null = null,
  seoDescription: string | null = null,
): ShareProfileView {
  const seo: Record<string, string> = {};
  if (seoTitle) seo.title = seoTitle;
  if (seoDescription) seo.description = seoDescription;

  return parsePublishedSnapshot({
    slug,
    profileVersion: 1,
    seoTitle,
    seoDescription,
    content: {
      schemaVersion: 1,
      profile: { displayName: `Perfil ${slug}`, bio: `Bio pública de ${slug}` },
      sections: [],
      ...(Object.keys(seo).length > 0 ? { seo } : {}),
    },
  });
}

function MetaHarness({ profile }: { profile: ShareProfileView | null }) {
  useDocumentMeta(profile);
  return <div data-testid="harness" />;
}

function metaContent(attribute: 'name' | 'property', key: string): string | null {
  return (
    document
      .querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
      ?.getAttribute('content') ?? null
  );
}

function canonicalHref(): string | null {
  return (
    document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute('href') ?? null
  );
}

function seedHead(): void {
  document.head.innerHTML = `
    <meta name="description" content="descrição original" />
    <meta property="og:title" content="título OG original" />
    <link rel="canonical" href="https://original.example/antigo" />
    <meta name="robots" content="noindex, nofollow" />
  `;
  document.title = 'Título original';
}

const ORIGINAL_TITLE = 'Título original';

describe('useDocumentMeta — metadados públicos do perfil', () => {
  afterEach(() => {
    cleanup();
    document.head.innerHTML = '';
    document.title = '';
  });

  it('cria todos os metadados a partir de um perfil público pronto e restaura tudo ao desmontar', () => {
    seedHead();
    const profile = makeProfile('alice', 'SEO de Alice', 'Descrição SEO de Alice');
    const expectedUrl = `${window.location.origin}/alice`;

    const { unmount } = render(<MetaHarness profile={profile} />);

    expect(document.title).toBe('SEO de Alice');
    expect(metaContent('name', 'description')).toBe('Descrição SEO de Alice');
    expect(metaContent('property', 'og:type')).toBe('profile');
    expect(metaContent('property', 'og:title')).toBe('SEO de Alice');
    expect(metaContent('property', 'og:description')).toBe('Descrição SEO de Alice');
    expect(metaContent('property', 'og:url')).toBe(expectedUrl);
    expect(metaContent('name', 'twitter:card')).toBe('summary');
    expect(metaContent('name', 'twitter:title')).toBe('SEO de Alice');
    expect(metaContent('name', 'twitter:description')).toBe('Descrição SEO de Alice');
    expect(metaContent('name', 'robots')).toBe('index, follow');
    expect(canonicalHref()).toBe(expectedUrl);
    // Nenhuma URL http(s) de imagem é fornecida pela view pública: og:image não é criado.
    expect(document.querySelector('meta[property="og:image"]')).toBeNull();

    unmount();

    expect(document.title).toBe(ORIGINAL_TITLE);
    expect(metaContent('name', 'description')).toBe('descrição original');
    expect(metaContent('property', 'og:title')).toBe('título OG original');
    expect(metaContent('name', 'robots')).toBe('noindex, nofollow');
    expect(canonicalHref()).toBe('https://original.example/antigo');
    expect(metaContent('property', 'og:type')).toBeNull();
    expect(metaContent('property', 'og:description')).toBeNull();
    expect(metaContent('property', 'og:url')).toBeNull();
    expect(metaContent('name', 'twitter:card')).toBeNull();
    expect(metaContent('name', 'twitter:title')).toBeNull();
    expect(metaContent('name', 'twitter:description')).toBeNull();
  });

  it('atualiza sem duplicatas quando o perfil muda e limpa os metadados ao ficar indisponível', () => {
    document.head.innerHTML = '';
    document.title = 'Título da aplicação';
    const alice = makeProfile('alice');
    const bruno = makeProfile('bruno', 'SEO de Bruno');

    const { rerender, unmount } = render(<MetaHarness profile={alice} />);
    expect(metaContent('property', 'og:url')).toBe(`${window.location.origin}/alice`);

    rerender(<MetaHarness profile={bruno} />);
    expect(document.title).toBe('SEO de Bruno');
    expect(metaContent('property', 'og:url')).toBe(`${window.location.origin}/bruno`);
    expect(canonicalHref()).toBe(`${window.location.origin}/bruno`);
    expect(document.querySelectorAll('meta[property="og:url"]')).toHaveLength(1);
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);

    rerender(<MetaHarness profile={null} />);
    expect(metaContent('name', 'robots')).toBe('noindex');
    expect(metaContent('property', 'og:url')).toBeNull();
    expect(metaContent('property', 'og:type')).toBeNull();
    expect(metaContent('name', 'twitter:card')).toBeNull();
    expect(metaContent('name', 'description')).toBeNull();
    expect(canonicalHref()).toBeNull();
    expect(document.title).toBe('Título da aplicação');

    unmount();
    expect(metaContent('name', 'robots')).toBeNull();
  });

  it('marca noindex quando o perfil não está publicamente disponível e restaura o robots original', () => {
    document.head.innerHTML = '<meta name="robots" content="index, follow" />';
    document.title = 'Título da aplicação';

    const { unmount } = render(<MetaHarness profile={null} />);

    expect(metaContent('name', 'robots')).toBe('noindex');
    expect(metaContent('property', 'og:type')).toBeNull();
    expect(canonicalHref()).toBeNull();
    expect(document.title).toBe('Título da aplicação');

    unmount();
    expect(metaContent('name', 'robots')).toBe('index, follow');
  });
});
