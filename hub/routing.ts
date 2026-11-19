/**
 * Roteamento do hub local (servidor de desenvolvimento único dos três aplicativos).
 *
 * O hub serve Studio, Share e Control a partir da MESMA origem — requisito para que o IndexedDB
 * (e, portanto, os snapshots publicados e as mídias) seja compartilhado entre escritor (Studio) e
 * leitor (Share). A função abaixo é pura e testável: dado o `req.url` recebido, decide se a
 * requisição passa direto, se redireciona ou se é reescrita para outro arquivo.
 *
 * Contrato de URLs:
 * - `/`                     → landing do hub (arquivo `index.html` da raiz)
 * - `/studio`, `/studio/*`  → app Studio (`/studio` redireciona para `/studio/`)
 * - `/control`, `/control/*`→ app Control (idem)
 * - qualquer outro caminho  → app Share (contrato público `/<slug>`)
 * - caminhos de infraestrutura (`/apps/`, `/hub/`, `/@vite`, `/node_modules/`, …) e arquivos
 *   com extensão passam direto.
 */

export type HubRoute =
  | { type: 'pass' }
  | { type: 'redirect'; location: string }
  | { type: 'rewrite'; url: string };

const PASSTHROUGH_PREFIXES = ['/apps/', '/hub/', '/@', '/node_modules/', '/share-data/'] as const;

function splitUrl(rawUrl: string): { pathname: string; suffix: string } {
  const queryIndex = rawUrl.indexOf('?');
  if (queryIndex === -1) return { pathname: rawUrl, suffix: '' };
  return { pathname: rawUrl.slice(0, queryIndex), suffix: rawUrl.slice(queryIndex) };
}

/** Um caminho é tratado como arquivo quando o último segmento tem extensão (`app.css`, `x.svg`). */
function looksLikeAsset(pathname: string): boolean {
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  return lastSegment.includes('.');
}

export function resolveHubRoute(rawUrl: string): HubRoute {
  const { pathname, suffix } = splitUrl(rawUrl);

  if (pathname === '/' || pathname === '/index.html') return { type: 'pass' };

  // O favicon é servido como arquivo, mas NÃO pode ser um prefixo genérico: caso contrário
  // engoliria slugs legítimos do Share que começam com "favicon" (ex.: `/favicon-profile`).
  if (pathname === '/favicon.ico' || pathname.startsWith('/favicon.')) {
    return { type: 'pass' };
  }

  for (const prefix of PASSTHROUGH_PREFIXES) {
    if (pathname.startsWith(prefix)) return { type: 'pass' };
  }

  // Redirect para a forma canônica com barra final (base de resolução dos módulos do app).
  if (pathname === '/studio') return { type: 'redirect', location: `/studio/${suffix}` };
  if (pathname === '/control') return { type: 'redirect', location: `/control/${suffix}` };

  if (pathname === '/studio/') return { type: 'rewrite', url: `/apps/studio/index.html${suffix}` };
  if (pathname.startsWith('/studio/')) {
    return { type: 'rewrite', url: `/apps/studio${pathname.slice('/studio'.length)}${suffix}` };
  }

  if (pathname === '/control/')
    return { type: 'rewrite', url: `/apps/control/index.html${suffix}` };
  if (pathname.startsWith('/control/')) {
    return { type: 'rewrite', url: `/apps/control${pathname.slice('/control'.length)}${suffix}` };
  }

  if (looksLikeAsset(pathname)) return { type: 'pass' };

  // Qualquer outro caminho pertence ao Share (ex.: `/alice`).
  return { type: 'rewrite', url: `/apps/share/index.html${suffix}` };
}
