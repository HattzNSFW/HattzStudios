import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { resolveHubRoute } from './hub/routing';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

/**
 * Middleware que dá aos três aplicativos a MESMA origem (o requisito para o IndexedDB
 * compartilhado). Roda antes dos middlewares internos do Vite: reescreve a URL para o arquivo do
 * app correspondente (ou redireciona/normaliza) e deixa o Vite servir/transformar normalmente.
 */
function hubRoutingPlugin(): Plugin {
  return {
    name: 'hattz-hub-routing',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (!req.url) return next();
        const route = resolveHubRoute(req.url);
        if (route.type === 'redirect') {
          _res.statusCode = 302;
          _res.setHeader('Location', route.location);
          _res.end();
          return;
        }
        if (route.type === 'rewrite') req.url = route.url;
        next();
      });
    },
  };
}

// A pílula usa os MESMOS tokens de vidro dos painéis (`@hattz/design-system/tokens.css`, carregado
// por todos os apps). Os fallbacks literais espelham os tokens para o instante em que o CSS do app
// ainda não foi aplicado — assim o vidro nunca "pisca" opaco nem perde legibilidade.
const HUB_NAV_CSS = `
.hattz-hub-nav{position:fixed;top:.85rem;right:.85rem;z-index:2147483000;display:flex;align-items:center;gap:.35rem;
padding:.3rem;border-radius:var(--hattz-radius-pill,999px);
background:var(--hattz-glass-background,linear-gradient(135deg,rgba(167,139,250,.22),transparent 45%),rgba(18,20,26,.55));
border:1px solid var(--hattz-glass-border,rgba(199,204,214,.18));
box-shadow:var(--hattz-glass-shadow-stack,0 12px 40px rgba(0,0,0,.45),inset 0 1px 0 rgba(242,244,247,.28));
backdrop-filter:blur(var(--hattz-glass-blur,16px)) saturate(var(--hattz-glass-saturate,140%));
-webkit-backdrop-filter:blur(var(--hattz-glass-blur,16px)) saturate(var(--hattz-glass-saturate,140%));
font-family:var(--hattz-font-sans,Inter,system-ui,sans-serif);font-size:.8rem}
.hattz-hub-nav a{color:var(--hattz-color-silver-300,#c7ccd6);text-decoration:none;padding:.35rem .7rem;border-radius:var(--hattz-radius-pill,999px);line-height:1;
transition:background var(--hattz-motion-fast,120ms) var(--hattz-motion-ease,ease),color var(--hattz-motion-fast,120ms) var(--hattz-motion-ease,ease)}
.hattz-hub-nav a:hover{background:rgba(167,139,250,.16);color:var(--hattz-color-silver-100,#f2f4f7)}
.hattz-hub-nav a:focus-visible{outline:2px solid var(--hattz-color-purple-soft-500,#a78bfa);outline-offset:2px}
.hattz-hub-nav a[aria-current="page"]{background:rgba(167,139,250,.22);color:var(--hattz-color-silver-100,#f2f4f7)}
.hattz-hub-nav__brand{font-weight:600;letter-spacing:.02em;color:var(--hattz-color-silver-100,#f2f4f7)}
`;

const HUB_NAV_HTML =
  '<a class="hattz-hub-nav__brand" href="/" data-hub-link>Hättz</a>' +
  '<a href="/studio/" data-hub-link>Studio</a>' +
  '<a href="/control/" data-hub-link>Control</a>';

const HUB_NAV_SCRIPT = `(function(){var p=location.pathname;var links=document.querySelectorAll('.hattz-hub-nav a[data-hub-link]');for(var i=0;i<links.length;i++){var h=links[i].getAttribute('href');var active=(h==='/')?(p.indexOf('/studio')!==0&&p.indexOf('/control')!==0):(p.indexOf(h)===0);if(active){links[i].setAttribute('aria-current','page');}}})();`;

/**
 * Injeta uma pequena pílula de navegação Hättz nos apps servidos pelo hub, para alternar entre
 * Hub, Studio e Control. É aplicada apenas pelo servidor do hub (`transformIndexHtml`), de modo
 * que os apps standalone e os builds individuais permaneçam inalterados.
 */
function hubNavPlugin(): Plugin {
  return {
    name: 'hattz-hub-nav',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const match = ctx.filename.match(/apps[\\/](studio|control|share)[\\/]index\.html$/);
        if (!match) return html;
        // O app é servido sob o prefixo do hub (`/studio/`, `/apps/share/…`), mas o Share é
        // servido na URL pública `/<slug>`. Um `src` relativo (`./src/main.tsx`) seria resolvido
        // pelo navegador contra `/<slug>` e apontaria para o arquivo errado. Reescrevemos o entry
        // para o caminho absoluto do app, que o roteamento do hub repassa corretamente.
        const app = match[1];
        const withEntry = html.replace(
          /(src=")\.\/src\/main\.tsx(")/,
          `$1/apps/${app}/src/main.tsx$2`,
        );
        return {
          html: withEntry,
          tags: [
            { tag: 'style', children: HUB_NAV_CSS, injectTo: 'head' },
            {
              tag: 'nav',
              attrs: { class: 'hattz-hub-nav', 'aria-label': 'Navegação Hättz' },
              children: HUB_NAV_HTML,
              injectTo: 'body-prepend',
            },
            { tag: 'script', children: HUB_NAV_SCRIPT, injectTo: 'body' },
          ],
        };
      },
    },
  };
}

export default defineConfig({
  root: rootDir,
  plugins: [react(), hubRoutingPlugin(), hubNavPlugin()],
  resolve: {
    // Evita duas cópias do React no mesmo servidor (hub + apps).
    dedupe: ['react', 'react-dom'],
    alias: {
      '@hattz/design-system/tokens.css': resolve(rootDir, 'packages/design-system/src/tokens.css'),
      '@hattz/core': resolve(rootDir, 'packages/core/src/index.ts'),
      '@hattz/contracts': resolve(rootDir, 'packages/contracts/src/index.ts'),
      '@hattz/design-system': resolve(rootDir, 'packages/design-system/src/index.ts'),
      '@hattz/permissions': resolve(rootDir, 'packages/permissions/src/index.ts'),
      '@hattz/validation': resolve(rootDir, 'packages/validation/src/index.ts'),
      '@hattz/shared-utils': resolve(rootDir, 'packages/shared-utils/src/index.ts'),
      '@hattz/local-store': resolve(rootDir, 'packages/local-store/src/index.ts'),
      '@hattz/profile-view/styles.css': resolve(rootDir, 'packages/profile-view/src/styles.css'),
      '@hattz/profile-view': resolve(rootDir, 'packages/profile-view/src/index.ts'),
    },
  },
  optimizeDeps: {
    entries: ['index.html', 'apps/*/index.html'],
  },
  server: {
    // Porta fixa: a persistência local vive no IndexedDB, que é isolado por origem. Se a porta
    // mudasse entre reinícios, a origem mudaria e o Share deixaria de enxergar o Studio.
    port: 5180,
    strictPort: true,
  },
});
