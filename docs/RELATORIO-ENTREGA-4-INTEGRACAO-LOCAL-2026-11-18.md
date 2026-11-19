# Relatório — Entrega 4 (Integração local das três apps: Share ↔ Studio ↔ Control) — 2026-11-18

Continuação do desenvolvimento do produto Hättz 2.0, dando sequência à Entrega 1 (Share funcional),
à Entrega 2 (Studio funcional) e à Entrega 3 (publicação local). **Sem commits, sem push, sem
deploy, sem Supabase, sem credenciais, sem Storage remoto.** Toda a integração desta entrega é
**local**, roda na **mesma origem** e **nada é enviado para a internet**.

> **Entrega 4 (o que ela é):** um **ambiente local integrado** onde o Owner abre **uma única URL** no
> navegador e usa as três aplicações já implementadas de forma integrada — com **fluxo de dados real
> do Studio para o Share** (o Share lê os **snapshots que o Studio publicou**). Não é Bloco 4/5, não
> cria telas administrativas falsas e não publica nada remotamente.

## 1. Objetivo

- Entregar uma **estrutura local integrada** para as três apps: **Share** (visão pública do perfil),
  **Studio** (edição + publicação local) e **Control** (área administrativa, **mantendo a
  funcionalidade atual** — a fundação permanece para o Bloco 5).
- Navegação **funcional, responsiva e consistente** com a identidade Hättz.
- **Requisito principal — Share ↔ Studio com dados reais:** o Share consulta os **snapshots
  efetivamente publicados pelo Studio**, encontra perfis publicados, resolve slugs e renderiza o
  snapshot publicado — **nunca** lê rascunhos, **nunca** expõe campos internos/admin e **nunca**
  apresenta dados de demonstração como publicação real. Estados "inexistente" e "despublicado"
  corretos.
- Preservar a identidade visual (preto/grafite/prata/púrpura, Liquid Glass, elegante, responsiva,
  acessível, com estados de carregamento/erro/vazio), sem redesenhar entregas anteriores.
- **Não** construir telas de administração falsas só para "parecer pronto".

## 2. Arquitetura de integração escolhida

### 2.1 Problema central: o IndexedDB é isolado por origem

A publicação local (Entrega 3) e as mídias (blobs) vivem no **IndexedDB**, que é **isolado por
origem** (`scheme + host + port`). Se o Studio rodasse em `http://localhost:5173` e o Share em
`http://localhost:5174` (os dev servers standalone), eles teriam **bases diferentes** e o Share
**não** enxergaria o que o Studio publicou. Servir as três apps na **mesma origem** é, portanto, o
requisito que torna o fluxo real possível **sem** Supabase, **sem** backend e **sem** serviços pagos.

### 2.2 Solução: um "hub" de desenvolvimento na mesma origem

Foi adicionado um **servidor de desenvolvimento único na raiz do repositório** (`vite.hub.config.ts`)
que serve as três apps a partir da **mesma origem**, com **porta fixa** `http://localhost:5180/`
(`strictPort: true`) — a porta fixa é deliberada: se ela mudasse entre reinícios, a origem mudaria e
a persistência deixaria de ser compartilhada.

- **`/`** → landing do hub (`index.html` da raiz) com cards para as três apps e a **lista real de
  perfis publicados**.
- **`/studio`**, **`/studio/*`** → app **Studio** (com redirecionamento para a forma canônica
  `/studio/`).
- **`/control`**, **`/control/*`** → app **Control** (idem).
- **Qualquer outro caminho** (ex.: `/alice-andrade`) → app **Share**, preservando o contrato público
  `/<slug>` já definido na Entrega 1.
- Caminhos de infraestrutura (`/apps/`, `/hub/`, `/@vite`, `/node_modules/`, `/share-data/`,
  `/favicon`) e arquivos com extensão passam direto.

A lógica de roteamento é **pura e testável** em `hub/routing.ts` (`resolveHubRoute`), e o servidor
apenas aplica o resultado (passthrough / redirect 302 / rewrite) em um middleware **antes** dos
middlewares internos do Vite.

> **Compatibilidade:** os dev servers standalone (`npm run dev:share` / `dev:studio` /
> `dev:control`, portas 5173/5174/…), os builds individuais de cada app e os testes existentes
> **continuam funcionando**. O hub é um **servidor adicional**, não substitui nada.

### 2.3 Pacote compartilhado `@hattz/local-store`

O schema local-first (Dexie) e as leituras públicas foram extraídos para um **pacote compartilhado**
(`packages/local-store`), para que **Studio (escritor)** e **Share (leitor)** usem **exatamente a
mesma base** e a **mesma projeção pública** — sem duas cópias divergentes:

- `db.ts` — o schema `hattz_studio` (`STUDIO_DB_VERSION = 3`), tabelas `localProfiles`,
  `draftSnapshots`, `pendingSyncOps`, `studioMeta`, `workingDrafts`, `mediaAssets` e `publications`.
  **Idêntico ao da Entrega 3** (migrações declaradas apenas via `.stores()`; nenhum dado
  transformado).
- `publication.ts` — `publicationToSnapshot(record)`: converte um registro de publicação no **formato
  exato do contrato público** (`PublishedProfileSnapshotContract`), **whitelistando apenas campos
  públicos**. Estava no Studio (Entrega 3) e foi **movido** para cá (o Studio reexporta, mantendo o
  caminho histórico).
- `queries.ts` — **leituras públicas somente-leitura**:
  - `findPublishedPublicationBySlug(slug)` — a publicação **atual** (`state === 'published'`) para o
    slug, ou `null`.
  - `hasAnyPublicationWithSlug(slug)` — existe **qualquer** publicação (publicada ou não) com o slug
    (para distinguir "despublicado" de "inexistente").
  - `listPublishedProfiles()` — resumo dos perfis **efetivamente publicados** (para o hub).
- `index.ts` — ponto de entrada único (sem subpaths).

`apps/studio/src/persistence/db.ts` passou a ser `export * from '@hattz/local-store'`, e
`apps/studio/src/publishing/index.ts` importa e reexporta `publicationToSnapshot` — nenhuma linha de
código/teste existente precisou mudar de contrato.

### 2.4 Identidade visual / navegação

O hub injeta, via `transformIndexHtml`, uma **pílula de navegação Hättz** (Liquid Glass: fundo
`rgba(18,20,26,.62)`, borda prata translúcida, `backdrop-filter: blur`, destaque púrpura) nos três
apps servidos pelo hub — permitindo alternar entre **Hub**, **Studio** e **Control** de qualquer
tela, com o item ativo marcado por `aria-current="page"`. A injeção acontece **apenas no servidor do
hub**, então os apps standalone e os builds individuais **permanecem inalterados**. A landing do hub
usa a mesma linguagem visual (cards `hattz-liquid-glass`, tipografia e paleta do design system).

## 3. Como as apps compartilham dados

1. As três apps rodam na **mesma origem** (`http://localhost:5180/`).
2. O **Studio** abre o IndexedDB `hattz_studio` (via `@hattz/local-store`) e **grava** ali:
   rascunho de trabalho (`workingDrafts`), mídias (`mediaAssets`, blobs) e **publicações**
   (`publications`, snapshots imutáveis versionados).
3. O **Share** abre **a mesma** base `hattz_studio` (mesma origem) e **lê somente** a tabela
   `publications`, e somente os registros com `state === 'published'`.
4. A **projeção pública** usada pelo Share é `publicationToSnapshot` — **a mesma** usada pela prévia
   publicada do Studio. Logo, o que o Studio publica é exatamente o que o Share renderiza.
5. O **hub** usa `listPublishedProfiles()` para listar os perfis publicados com link direto para o
   Share.

Nenhuma dessas etapas toca a rede: tudo é **local**, no navegador.

## 4. Como o Share encontra os snapshots publicados

`apps/share/src/data/localPublicationSource.ts` implementa a interface `ShareDataSource` (já definida
na Entrega 1) sobre a base local:

- `getPublishedProfileBySlug(slug)`:
  1. `findPublishedPublicationBySlug(slug)` — busca **apenas** a publicação **atual**
     (`state === 'published'`), usando o índice de `state` e filtrando por slug;
  2. se não houver → devolve `null`;
  3. se houver → **pré-carrega as mídias referenciadas** (avatar, banner, `assetId`/`coverAssetId`
     de blocos) como **object URLs** a partir de `mediaAssets`, liberando os object URLs da leitura
     anterior (o renderizador resolve mídia de forma síncrona);
  4. devolve `publicationToSnapshot(record)` — a projeção pública.
- `isKnownUnpublishedSlug(slug)`: se **não** há publicação atual, responde `true` quando existe
  **qualquer** publicação com aquele slug (publicada outrora e agora despublicada) e `false` quando
  **nunca** houve publicação. É isso que faz o Share distinguir **"Perfil despublicado"** de
  **"Perfil não encontrado"**.

**Garantias de isolamento (verificadas por teste e no navegador):**

- Rascunhos (`workingDrafts` / `draftSnapshots`) **nunca** são lidos pelo Share.
- Campos internos do registro de publicação (`publicationId`, `profileTechnicalId`, `state`,
  `unpublishedAt`, …) **nunca** são expostos — a projeção é whitelist.
- Nenhum dado de demonstração é usado em runtime. O manifesto estático
  (`apps/share/public/share-data/` + `StaticShareDataSource`) foi **preservado** como fixture/adaptador
  documentado, mas **não é mais usado em runtime** (o `App.tsx` do Share agora instancia
  `LocalPublicationSource`).

## 5. Evidência do fluxo em navegador (fluxo obrigatório do Owner)

Verificação manual no navegador no hub (`npm run dev:hub`, `http://localhost:5180/`), lendo **DOM,
árvore de acessibilidade, console e IndexedDB**. **0 erros de console em todas as etapas.**

1. **Abrir o Studio** — `/studio/` carrega com a pílula de navegação do hub injetada (Hub/Studio/
   Control). ✅
2. **Criar perfil** — "Alice Andrade" → perfil aparece na sidebar (`rascunho`) e o editor abre. ✅
3. **Editar nome/bio/avatar/banner/conteúdo** — bio definida; **seção + bloco de texto** adicionados
   ("Olá! Este conteúdo foi escrito no Studio e publicado para o Share."); **avatar e banner**
   enviados (prévias `blob:` no editor). ✅
4. **Salvar rascunho** — "Salvar agora" → status **"Salvo às 21:21:59"**. ✅
5. **Confirmar que o Share NÃO mostra o rascunho** — abrir `/alice-andrade` → **"Perfil não
   encontrado"** (o rascunho não é exposto); **0 erros de console**. ✅
6. **Publicar (v1)** — aba Publicação → **"Publicar versão"** → badge **`PUBLICADO (LOCAL) V1`**;
   histórico `v1 publicada (atual)`. ✅
7. **Abrir o perfil no Share** — `/alice-andrade` renderiza o snapshot real: nome **Alice Andrade**,
   bio v1, o bloco de texto, **avatar e banner** (blobs reais) e **"Perfil v1"**; **0 erros de
   console**. ✅
8. **Editar o rascunho novamente** — bio alterada para a "segunda versão"; rascunho salvo
   ("Salvo às 21:24:18"). ✅
9. **Confirmar que o Share continua com a versão publicada anterior** — `/alice-andrade` **ainda
   mostra v1** (bio antiga), **não** a v2 do rascunho (isolamento de rascunho). ✅
10. **Publicar nova versão (v2)** — **"Publicar nova versão"** → badge `PUBLICADO (LOCAL) V2`;
    histórico com `v2 publicada (atual)` e `v1 despublicada`. ✅
11. **Confirmar que o Share mostra a nova versão** — `/alice-andrade` agora mostra **v2** (bio nova);
    **0 erros de console**. ✅
12. **Despublicar** — **"Despublicar"** → badge volta a `RASCUNHO`; histórico com v2 e v1
    `despublicada`. ✅
13. **Confirmar que o Share para de mostrar** — `/alice-andrade` → **"Perfil despublicado"**
    (indisponível), **0 erros de console**. ✅
14. **Recarregar a página** — a persistência se mantém (o rascunho, as publicações e a versão atual
    seguem no IndexedDB); **0 erros de console**. ✅
15. **Reiniciar os servidores** — servidor do hub **encerrado (árvore de processos)** e reiniciado
    (`npm run dev:hub`). Em abas novas: o Share continua mostrando o perfil **v3** (com avatar e
    banner) e a **landing do hub lista** `/alice-andrade · v3 · 18/11/2026, 21:28`; **0 erros de
    console**. **Persistência confirmada após reinício.** ✅

Também verificado: a landing do hub renderiza o **estado vazio** ("Nenhum perfil publicado ainda")
quando não há publicação, e passa a **listar o perfil real** com link "Abrir no Share" após publicar
— nunca exibindo rascunhos ou dados de demonstração.

### 5.1 Dois defeitos reais encontrados e corrigidos durante a verificação

1. **Entry script do Share resolvido contra o slug (`vite.hub.config.ts`).** O Share é servido na URL
   pública `/<slug>`. Um `src` **relativo** (`./src/main.tsx`) era resolvido pelo navegador contra
   `/<slug>` e apontava para o arquivo errado (404 em `/src/main.tsx`), deixando o Share **sem
   montar**. Correção: o plugin do hub **reescreve o entry** `./src/main.tsx` →
   `/apps/<app>/src/main.tsx` para o app correspondente (aplicado uniformemente a Studio/Control/Share,
   que não são afetados).
2. **Corrida entre autosave e publicação (`useStudioEditor.ts`).** Ao publicar enquanto um autosave
   estava **em voo**, `flush()` (`editor.saveNow`, chamado antes de publicar) retornava **cedo** — e a
   gravação pendente, ao concluir, avançava a revisão do rascunho. A publicação seguinte então falhava
   com `StaleDraftError` ("O rascunho mudou enquanto era publicado…"). Correção: `runSave` agora
   **aguarda a gravação em voo** (`savePromiseRef`) antes de decidir, de modo que `flush()` realmente
   **drena** o autosave pendente. Um **teste de regressão determinístico** foi adicionado e
   **confirmado falhando sem a correção** (reproduzindo exatamente o erro) e passando com ela.

## 6. Arquivos criados

- `packages/local-store/` — pacote compartilhado (schema + leituras públicas):
  - `package.json`, `tsconfig.json`
  - `src/index.ts`, `src/db.ts`, `src/publication.ts`, `src/queries.ts`
- `apps/share/src/data/localPublicationSource.ts` — fonte de dados do Share sobre a base local
  (somente publicados; pré-resolução de mídia).
- `hub/routing.ts` — roteamento puro do hub (`resolveHubRoute`).
- `hub/Hub.tsx` — landing do hub (cards + lista real de perfis publicados).
- `hub/main.tsx` — bootstrap da landing.
- `hub/hub.css` — estilos da landing do hub (Liquid Glass).
- `index.html` (raiz) — landing do hub.
- `vite.hub.config.ts` — servidor do hub (middleware de roteamento, plugin de navegação, reescrita do
  entry, aliases, porta 5180 `strictPort`).
- `tsconfig.hub.json` — typecheck do hub/config.
- Testes:
  - `tests/hub/routing.test.ts` — roteamento (landing, Studio, Control, Share `/<slug>`,
    passthrough de infraestrutura/assets).
  - `tests/share/localPublicationSource.test.ts` — leitura somente de publicados; não expõe
    rascunho; não expõe campos internos; versão anterior permanece com o rascunho alterado; nova
    versão aparece; despublicar para de retornar; persistência após reload; pré-resolução de mídia.
  - `tests/integration/studio-share.integration.test.tsx` — fluxo integrado ponta a ponta pelo
    **renderizador real do Share** (rascunho não aparece → publica v1 → edita rascunho → ainda v1 →
    publica v2 → despublica → despublicado; persistência após "reload"; estado de erro com snapshot
    corrompido).
- Relatório: `docs/RELATORIO-ENTREGA-4-INTEGRACAO-LOCAL-2026-11-18.md`.

## 7. Arquivos modificados

- `package.json` — script `dev:hub`; `typecheck` passou a incluir `tsc -p tsconfig.hub.json`.
- `package-lock.json` — registro do workspace `@hattz/local-store`.
- `tsconfig.base.json` — `paths` para `@hattz/local-store`.
- `apps/{studio,share,control}/vite.config.ts` — alias `@hattz/local-store`.
- `apps/{studio,share,control}/package.json` — dependência `@hattz/local-store` (workspace).
- `apps/{studio,share,control}/index.html` — entry script `/src/main.tsx` → `./src/main.tsx`.
- `apps/share/src/App.tsx` — passa a usar `LocalPublicationSource` (não usa mais o manifesto estático
  em runtime).
- `apps/share/src/index.css` — ajustes de integração.
- `apps/studio/src/persistence/db.ts` — `export * from '@hattz/local-store'`.
- `apps/studio/src/persistence/repository.ts` — imports da base compartilhada.
- `apps/studio/src/publishing/index.ts` — importa/reexporta `publicationToSnapshot` da base
  compartilhada.
- `apps/studio/src/hooks/useStudioEditor.ts` — **correção da corrida** entre autosave e publicação
  (`savePromiseRef`).
- `tests/studio/studio-publication-ui.test.tsx` — novo teste de regressão da corrida de flush.
- `DEVELOPMENT_STATUS.md`, `README.md` — status e estrutura da Entrega 4.

> **Nota:** o pacote `@hattz/profile-view` (renderizador compartilhado) e o contrato
> `PublishedProfileSnapshotContract` são os mesmos das entregas anteriores — **nenhum contrato foi
> alterado**.

## 8. Testes executados (reais)

Comandos executados via `cmd /c npm ...` (todos com código de saída registrado):

- `npm run typecheck` — **PASS (exit 0)** — workspaces + adapters + `tsconfig.hub.json` +
  `tsconfig.tests.json`.
- `npm run lint` — **PASS (exit 0)** — ESLint.
- `npm run format` — **PASS (exit 0)** — Prettier (`All matched files use Prettier code style!`).
- `npm run test` — **PASS (exit 0)** — Vitest v4.1.12, **25 arquivos / 133 testes** (após a Entrega
  3: 22 arquivos / 117 testes; **+3 arquivos, +16 testes** — incluindo o teste de regressão da corrida
  de flush).
- `npm run build` — **PASS (exit 0)** — Vite v7.3.8; `dist/` presente em `apps/control`,
  `apps/share` e `apps/studio`.
- `npm audit --omit=dev` — **PASS (exit 0)** — `found 0 vulnerabilities`.

Cobertura dos novos testes:

- **Roteamento do hub:** landing em `/`; Studio/Control com normalização de barra final; **qualquer
  outro caminho → Share** (contrato `/<slug>`, inclusive sub-rotas inválidas que devem carregar o app
  para exibir o próprio "não encontrado"); passthrough de infraestrutura e assets.
- **Fonte do Share:** não expõe rascunho; slug nunca publicado → "não encontrado"; só devolve o
  snapshot publicado e **sem campos internos**; versão anterior permanece enquanto o rascunho muda;
  nova versão aparece ao publicar; despublicar → deixa de retornar e passa a "despublicado";
  **persistência após reload** (nova conexão lê os mesmos dados da origem); **pré-resolução de mídia**
  e liberação de object URLs.
- **Integração Studio → Share (renderizador real):** percorre os passos do fluxo obrigatório no nível
  de renderização do Share; persistência após "reload + restart" (conexão descartada); **tratamento de
  erro** com snapshot corrompido (alerta "não corresponde ao contrato público").
- **Regressão da corrida de flush:** publicar com um autosave em voo **não** resulta em
  `StaleDraftError` e publica a revisão atual (confirmado falhando antes da correção).

## 9. Confirmação — entregas anteriores preservadas

- **Entrega 1 (Share funcional):** o Share continua renderizando por rota `/<slug>` com todos os
  estados (carregando/erro/não encontrado/despublicado) e o mesmo renderizador; a mudança é a **fonte
  de dados** (antes manifesto estático, agora base local compartilhada). O manifesto estático foi
  **mantido** como fixture/adaptador.
- **Entrega 2 (Studio funcional):** edição, prévia ao vivo, autosave, concorrência otimista e
  persistência de rascunho/mídia **inalterados** (o schema Dexie é o mesmo; apenas centralizado no
  pacote compartilhado).
- **Entrega 3 (publicação local):** snapshots imutáveis versionados, histórico, despublicar, validação
  antes de persistir e prévia publicada **inalterados**. `publicationToSnapshot` foi **movido** para o
  pacote compartilhado e **reexportado** — mesma projeção, agora compartilhada com o Share.
- **Control:** mantém a funcionalidade atual (fundação para o Bloco 5); **nenhuma** tela
  administrativa falsa foi criada.
- **Nenhuma feature removida, nenhum componente duplicado** (o renderizador continua sendo
  `@hattz/profile-view`), **Dexie preservada**, **nenhuma migration alterada**.

## 10. Confirmações de limites

- **Nenhuma conexão remota** foi criada: sem projeto Supabase, sem Auth/JWT/PostgREST/Storage, sem
  credenciais reais, sem internet.
- **Nenhuma publicação pública** ocorreu: a "publicação" é **local** (IndexedDB) e a UI deixa
  explícito que o perfil **não** fica publicamente acessível.
- **Nenhum commit, push, deploy ou operação destrutiva.** HEAD permanece
  `2ab007c08d88d5cb518c39db65736eaba32f86d8`, branch `main`, **todas as mudanças não commitadas**.
- **Nenhuma migration** foi alterada ou executada remotamente. A bateria PostgreSQL/RLS **não** foi
  reexecutada (não houve mudança de infraestrutura relevante para ela).
- **Sem auto-publicação:** salvar o rascunho **nunca** publica (testado e verificado).
- **Sem dependências pagas** e **sem novas dependências** além do workspace interno
  `@hattz/local-store` (Dexie já existia).

## 11. Limitações explícitas

- **Integração é local e por origem.** O compartilhamento de dados depende de as três apps rodarem na
  **mesma origem** (o hub em `http://localhost:5180/`). Nos dev servers standalone (portas separadas)
  o Share **não** enxerga a base do Studio — isso é inerente ao isolamento de origem do IndexedDB.
- **Porta fixa:** o hub exige a porta `5180` (`strictPort`); se estiver ocupada, o servidor falha em
  vez de escolher outra porta (proposital, para não quebrar a persistência).
- **Colisão de slug com rotas reservadas:** um perfil cujo slug seja `studio`, `control`, `hub` ou
  `apps` colide com as rotas do hub. Documentado como limitação; a política de slugs (normalização,
  reservados, histórico) continua **decisão do Owner**.
- **Sem backend:** a fila `pendingSyncOps` permanece sem drenagem; nenhuma integração remota foi
  ligada.
- **Não é Bloco 4/5:** a administração real (Control) e a publicação remota continuam fora do escopo.
- **`npm audit` (dev-only):** 11 vulnerabilidades `high` em tooling (`picomatch`, sem correção
  upstream); produção limpa (`--omit=dev` = 0).
- **jsdom + fake-indexeddb** não preservam o conteúdo interno de `Blob` no structured clone; os testes
  de mídia verificam **metadados + presença do blob** (a verificação real de bytes é feita no
  navegador, via `blob:` URLs renderizados).

## 12. Próxima etapa recomendada

1. **Aguardar a avaliação do Owner** sobre a Entrega 4 (a entrega **não** avança para o Bloco 4 sem
   autorização).
2. Quando autorizado: **Bloco 4** (administração real no Control) e/ou a **ponte de publicação
   remota** (Supabase/Storage) — sempre com ambiente autorizado, credenciais próprias e sem alterar
   contratos públicos sem decisão.
3. Definir com o Owner as **regras de slug** (normalização/reservados/histórico) e o **catálogo
   autoritativo** de molduras/badges.
