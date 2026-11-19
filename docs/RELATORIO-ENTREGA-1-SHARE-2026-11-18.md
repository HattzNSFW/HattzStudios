# Relatório — Entrega 1 (Share funcional) — 2026-11-18

Continuação do desenvolvimento do produto Hättz 2.0 após o encerramento operacional da etapa de
infraestrutura (rodada 6). **Sem commits, sem push, sem deploy, sem Supabase, sem credenciais.**

## 1. Objetivo

Entregar a primeira funcionalidade de maior valor para um **site de perfil utilizável**: o **Share**
(aplicação pública de perfis), com rota por slug, carregamento de dados publicados, renderização de
conteúdo, estados de conexão e design premium — reutilizando os contratos/validações existentes e
**sem exibir dados internos/privados/draft**.

## 2. Funcionalidades implementadas

- **Rota pública individual por slug** (`/<slug>`) com roteamento próprio (sem dependência nova de
  router), suporte a histórico (popstate/pushState) e estados `root`/`slug`/`inválido`.
- **Carregamento de perfil** através do boundary `ShareProfileSource` (estende o contrato existente
  `PublicProfileReadAdapter`) + `ShareMediaResolver`, sem acoplar a UI a uma fonte concreta.
- **Renderização do perfil publicado**: banner, avatar (com fallback de iniciais), nome, bio,
  metadados de publicação (versão/data).
- **Seções personalizadas** com ordenação/filtragem por `visible`/`order` e rótulos acessíveis.
- **Blocos de conteúdo**: `heading`, `text`, `link`, `links`, `image`, `badges`, `music`, `divider`
  (tipos desconhecidos são ignorados; nada de HTML arbitrário).
- **Badges e molduras**: selos com as raridades aprovadas (`comum…especial`) e molduras de avatar
  (`theme.avatarFrame`), com estilos dedicados.
- **Tema visual e tipografia**: interpretação segura de `theme` (cores hex, fontes sans/serif/mono,
  raio, estilo de fundo, moldura) aplicada via custom properties; `effects` (glow/grain).
- **Mídias públicas**: resolução de `assetId` → URL via boundary de mídia (avatar, banner, imagem de
  bloco, capa de música).
- **Links e informações de perfil** (apenas `https:`/`mailto:`, com `rel="noopener noreferrer"`).
- **Player de música** com `<audio>` nativo, sem dependências; não renderiza controles inertes quando
  a mídia não resolve.
- **Estados**: `loading` (acessível, `role="status"`), `error` (com nova tentativa), `not_found` e
  `unpublished`.
- **SEO mínimo**: `document.title` e `meta[name=description]` por perfil, com restauração ao desmontar.
- **Responsividade** (layout adaptativo até telas pequenas) e **acessibilidade** (skip link, landmarks,
  hierarquia de títulos, `alt`, foco visível, `prefers-reduced-motion`).
- **Segurança de dados**: validação do snapshot com o validador compartilhado
  (`validatePublishableSnapshotContent`, o mesmo contrato do banco); conteúdo inválido vira estado de
  erro, nunca é renderizado parcialmente.

## 3. Arquivos criados

Fonte (`apps/share/src`):

- `routing/slugRoute.ts`, `routing/useSlugRoute.ts`
- `data/types.ts`, `data/staticShareSource.ts`, `data/index.ts`
- `content/shareContent.ts`
- `theme/shareTheme.ts`
- `useShareProfile.ts`
- `rendering/MediaImage.tsx`, `rendering/BadgeChip.tsx`, `rendering/MusicPlayer.tsx`,
  `rendering/props.ts`, `rendering/BlockRenderer.tsx`, `rendering/ProfileSection.tsx`,
  `rendering/ProfileHeader.tsx`, `rendering/states.tsx`, `rendering/ErrorBoundary.tsx`,
  `rendering/ProfileRoute.tsx`, `rendering/ShareProfileView.tsx`

Dados locais de desenvolvimento (`apps/share/public/share-data/`):

- `index.json` (manifesto com perfis publicados/não publicados e mapa de mídia)
- `profiles/alice.json`, `profiles/bruno.json`, `profiles/lena.json`
- `media/*.svg` (avatares, banners, capa, foto) e `media/tone.wav`

Testes (`tests/share/`):

- `slugRoute.test.ts`, `shareTheme.test.ts`, `shareContent.test.ts`, `staticShareSource.test.ts`,
  `share-profile-view.test.tsx`

Relatório: `docs/RELATORIO-ENTREGA-1-SHARE-2026-11-18.md`

## 4. Arquivos modificados

- `apps/share/src/App.tsx` (era shell estático → app funcional)
- `apps/share/src/index.css` (estilos Liquid Glass, responsivo, acessível)
- `apps/share/index.html` (título/descrição)
- `tsconfig.tests.json` (inclui `tests/**/*.tsx`)

## 5. Testes executados (reais)

- `npm run typecheck` — **PASS (exit 0)** (workspaces + adapters + `tsconfig.tests.json`)
- `npm run lint` — **PASS (exit 0)**
- `npm run format` — **PASS (exit 0)**
- `npm run test` — **PASS (exit 0)** — Vitest v4.1.12, **13 arquivos / 59 testes** (antes: 8/38;
  +5 arquivos, +21 testes)
- `npm run build` — **PASS (exit 0)** — Vite v7.3.8 (Share, Studio, Control)
- `npm audit --omit=dev` — **PASS** — `found 0 vulnerabilities`
- **Verificação manual no navegador** (build de produção via `vite preview`, aba real):
  - `/alice` → renderiza nome, bio, avatar, seções Sobre/Links/Conquistas/Música, 3 links com href
    corretos e `<audio>` presente; **0 erros de console**; requisições `index.json` + `profiles/alice.json`
    - mídias OK; **a seção invisível não é renderizada**.
  - `/bruno` → perfil mínimo (links GitHub/LinkedIn).
  - `/lena` → galeria (imagem + legenda) e badge `ESPECIAL`; tipografia serifada.
  - `/marina` → estado **Perfil despublicado**.
  - `/ghost` e `/Alice` → estado **Perfil não encontrado**.
  - `/` → home do Share.
  - **0 erros de console** em todas as rotas.

Não foram executados testes de PostgreSQL nesta entrega (a alteração não toca banco/contratos de banco).

## 6. Resultados reais

- O Share deixou de ser um shell estático e passou a **carregar e renderizar perfis publicados** de
  ponta a ponta, com estados de conexão e sem expor dados internos.
- A verificação no navegador revelou e permitiu corrigir um bug real de runtime (`fetch` nativo perdia
  o receptor `Window` ao ser guardado em um campo → "Illegal invocation"). Após a correção, todas as
  rotas renderizam sem erros.
- Contratos existentes foram reutilizados (`PublicProfileReadAdapter`, `validatePublishableSnapshotContent`,
  tokens do Design System, `COLLECTIBLE_RARITIES`).

## 7. Limitações (explícitas)

- **Fonte de dados local, não Supabase.** O Share consome um **manifesto estático local**
  (`apps/share/public/share-data/`) com o **mesmo formato da view pública** `v_share_published_profiles`.
  Não há conexão com Supabase, nem dados reais de produção. O adapter Supabase permanece um stub que
  lança. **Isso é intencional e explícito**; a UI e o pipeline de renderização são reais e reutilizáveis.
- **Distinção "despublicado" vs "inexistente":** a view pública do Supabase não expõe perfis não
  publicados, então o adapter Supabase real devolverá `false` em `isKnownUnpublishedSlug` (o Share
  mostrará "não encontrado"). A fonte local distingue via manifesto. Se a distinção for desejada em
  produção, requer uma capacidade de backend adicional (decisão pendente do Owner).
- **Molduras:** o canal interino é `theme.avatarFrame`. A fonte autoritativa (`frames_catalog`, por
  role) e sua exposição pública ainda são decisão pendente; por isso o Share reconhece a chave, mas o
  catálogo por role não está integrado.
- **Badges/coleções:** renderizados a partir do snapshot (bloco `badges`). A origem autoritativa
  (`user_badges`, `collections`, `user_collection_progress`) ainda não é exposta publicamente.
- **Slugs:** o roteador exige a forma canônica (minúsculas, 3–48) e trata variações como não
  encontrado. A normalização de entrada (regra 8) segue **pendente do Owner**; não foi inventada no
  cliente.
- **Mídia pública:** a view pública expõe apenas metadados (sem paths). A estratégia de URL pública do
  Supabase ainda é decisão pendente; a fonte local mapeia `assetId` → arquivo estático.
- **Sem autenticação/edição:** o Share é somente leitura, como esperado.
- **Screenshot:** não foi possível capturar imagem no ambiente (a janela do app não estava visível);
  a verificação visual foi feita pela árvore de acessibilidade + DOM + rede.

## 8. Próxima entrega recomendada

Seguindo a ordem recomendada (item 8 da orientação), a próxima entrega de maior valor é **conectar a
persistência do Studio (Dexie) à UI e construir o editor de perfil** — começando por um fluxo real de
**criar/editar/salvar rascunho local** (nome, bio, avatar/banner, seções e blocos, tema), reutilizando
`apps/studio/src/persistence` já testado, com salvamento confiável e sem perda de dados. Em seguida,
publicação/snapshot e visualização da versão publicada (o Share já está pronto para consumi-la quando
a publicação existir).

Alternativa de menor risco, se preferível: consolidar contratos de dados (item 3) antes do Studio.
