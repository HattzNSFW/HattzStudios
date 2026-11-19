// Roteamento público do Share baseado em path: `/<slug>`.
// Sem dependências externas de router: o app é uma SPA pequena e o contrato de URL é trivial.
// Nota (decisão pendente do Owner): a normalização de slug (regra 8) ainda não foi aprovada.
// Por isso o Share exige a forma canônica (minúsculas) e trata variações como inexistente,
// em vez de inventar uma política de normalização no cliente.

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SlugRouteMatch =
  | { kind: 'slug'; slug: string }
  | { kind: 'root' }
  | { kind: 'invalid' };

/**
 * Resolve a rota a partir do `pathname` (sem query/hash).
 * - `/` → raiz (home do Share)
 * - `/<slug-canonico>` → perfil
 * - qualquer outra coisa (slug inválido, subrotas, `%` inválido) → inválido (não encontrado)
 */
export function resolveSlugRoute(pathname: string): SlugRouteMatch {
  const trimmed = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  if (trimmed === '') return { kind: 'root' };
  if (trimmed.includes('/')) return { kind: 'invalid' };

  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return { kind: 'invalid' };
  }

  if (!SLUG_PATTERN.test(decoded)) return { kind: 'invalid' };
  // Mesmos limites do contrato de slug (`validateSlug`: 3–48). Slugs fora disso não podem existir.
  if (decoded.length < 3 || decoded.length > 48) return { kind: 'invalid' };
  return { kind: 'slug', slug: decoded };
}

/** Caminho público canônico de um slug. */
export function buildPathForSlug(slug: string): string {
  return `/${slug}`;
}
