# Relatório — Entrega 3 (Publicação local, snapshots imutáveis versionados e prévia publicada) — 2026-11-18

Continuação do desenvolvimento do produto Hättz 2.0, dando sequência à Entrega 1 (Share funcional)
e à Entrega 2 (Studio funcional). **Sem commits, sem push, sem deploy, sem Supabase, sem
credenciais, sem Storage remoto.** Toda a publicação desta entrega é **local (IndexedDB/Dexie)** e
**nada é enviado para a internet**.

> **Distinção central desta entrega:** _publicação local_ **≠** _publicação pública_. O que esta
> entrega cria é um **snapshot imutável e versionado guardado apenas neste navegador**. O perfil
> **não** fica publicamente acessível, **não** é enviado a nenhum servidor e **não** integra o
> Supabase. Essa distinção está explícita na UI (aviso dedicado no painel de Publicação).

## 1. Objetivo

Adicionar ao Studio um fluxo **explícito** de **publicar/despublicar** um rascunho local, criando
**snapshots imutáveis e versionados**, com **histórico de versões**, **identificação da versão
publicada atual**, **validação antes de persistir**, **preservação integral do rascunho** após
publicar, **proteção contra publicação de conteúdo inválido**, **tratamento de erro/estado**, e uma
**prévia "publicada"** que lê **exclusivamente** o snapshot publicado (separada da prévia de
edição, que mostra o rascunho atual). **Nunca publica automaticamente ao salvar o rascunho.**

## 2. Resumo da implementação

### 2.1 Persistência (Dexie v3) — nova tabela `publications`

- `apps/studio/src/persistence/db.ts`: `STUDIO_DB_VERSION = 3`. Nova tabela **`publications`** com
  índice composto `[profileTechnicalId+state]` e índice `profileTechnicalId`. Migração declarada
  **apenas** via `.stores()` (sem transformação de dados): a v3 **adiciona** a tabela e preserva
  integralmente `localProfiles`, `draftSnapshots`, `pendingSyncOps`, `studioMeta`, `workingDrafts` e
  `mediaAssets`. **A Dexie foi preservada**; nenhuma tabela foi removida.
- Registro:

  ```ts
  interface LocalPublicationRecord {
    publicationId: string;
    profileTechnicalId: string;
    version: number; // 1, 2, 3, … por perfil
    slug: string;
    state: 'published' | 'unpublished';
    content: Record<string, unknown>; // snapshot imutável (contrato público)
    publishedAt: number;
    unpublishedAt: number | null;
    createdAt: number;
  }
  ```

- `apps/studio/src/persistence/repository.ts`: novas operações
  - `publishWorkingDraft({ profileTechnicalId, slug, expectedRevision })` — **valida** o conteúdo
    (`validatePublishableSnapshotContent`) e lança `PublicationValidationError(issues)` **antes** de
    gravar; calcula `version = max(existing.version) + 1` **dentro de uma única transação `rw`**;
    faz `structuredClone` do conteúdo (imutabilidade); marca a publicação anterior como
    `unpublished` e a nova como `published` **na mesma transação**; atualiza
    `localProfiles.lastPublishedVersion`.
  - `unpublishProfile(profileTechnicalId)` — muda a versão publicada atual para `unpublished`,
    preenche `unpublishedAt` e zera `lastPublishedVersion`; **não** apaga nem altera o conteúdo.
  - `getCurrentPublication(profileTechnicalId)` — busca pela **chave composta**
    `[profileTechnicalId+state]` com `state = 'published'` (**não depende de ordenação de registros**).
  - `listPublications(profileTechnicalId)` — histórico (ordenado por `version` decrescente para
    exibição).
  - `getPublicationByVersion(profileTechnicalId, version)`.
  - `PublicationValidationError` — carrega a lista de `issues` do validador compartilhado.
- **Concorrência:** `publishWorkingDraft` usa `expectedRevision` (revisão otimista do rascunho de
  trabalho) para que uma publicação **não** se aplique silenciosamente sobre um rascunho que mudou;
  `StaleDraftError` é propagado (mesma semântica da Entrega 2). Não há sobrescrita silenciosa.

### 2.2 Módulo de publicação — `apps/studio/src/publishing/index.ts`

- `publicationToSnapshot(record)` — converte o registro de publicação em um input no **formato exato
  do contrato público** (`PublishedProfileSnapshotContract`), **whitelistando apenas campos
  públicos** (nunca expõe campos internos/admin).
- `buildPublishedPreview(record)` — monta o input e chama `parsePublishedSnapshot` (o **mesmo**
  pipeline do Share).
- `stableStringify` / `contentDiffers` — comparação estável rascunho × publicado (para o indicador
  "difere da versão publicada"), sem depender da ordem das chaves.

### 2.3 Hook — `apps/studio/src/hooks/useStudioPublication.ts`

- Lê **versão publicada atual** e **histórico** do banco; expõe `publish`, `unpublish`, `refresh`,
  `status`/`error`/`issues`, `differsFromPublished` e a versão publicada atual.
- `publish` faz `await` do **flush** do autosave do editor antes de publicar e usa
  `expectedRevision` (concorrência otimista).

### 2.4 UI

- **Nova 4ª aba "Publicação"** (`PublicationPanel.tsx`): botões **Publicar versão** / **Publicar
  nova versão** / **Despublicar**; **badge de estado** (`rascunho` / `publicado (local) vN`); versão
  publicada atual + data; **histórico de versões** (`publicada (atual)` / `despublicada`); lista de
  **erros de validação** quando o conteúdo é inválido; e o **aviso explícito**: _"Publicação local ≠
  publicação pública. Publicar aqui cria um snapshot imutável guardado apenas neste navegador
  (IndexedDB). Nada é enviado para a internet e o perfil não fica publicamente acessível."_
- **`PreviewPane.tsx`**: alternância **Rascunho / Publicado**. A prévia de edição mostra o rascunho
  atual; a prévia publicada lê **exclusivamente** o snapshot publicado; indicador **"difere da
  versão publicada"** quando divergem; estado vazio claro **"Sem versão publicada."** quando não há
  publicação. Usa o **mesmo** `@hattz/profile-view`.
- **`ProfileSidebar.tsx`**: meta do perfil mostra `publicado (local) vN` ou `rascunho`.
- **`Studio.tsx`**: 4ª aba + wiring da publicação.
- **`apps/studio/src/index.css`**: estilos do painel de publicação e da alternância de prévia.

## 3. Fluxo de publicar/despublicar

1. O usuário edita o rascunho (autosave normal; **nada é publicado**).
2. Abre a aba **Publicação**. O painel mostra o estado atual (`rascunho` ou `publicado (local) vN`) e
   o aviso local-vs-público.
3. Clica **Publicar versão** (ou **Publicar nova versão**):
   - o hook **escoa** o autosave pendente (`flush`);
   - o conteúdo é **validado** (`validatePublishableSnapshotContent`);
     - se **inválido** → `PublicationValidationError` com a lista de `issues`; **nada é persistido**;
     - se **válido** → numa **única transação**: versão anterior → `unpublished`, nova versão →
       `published`, `version = max+1`, conteúdo clonado.
4. A UI atualiza: badge `publicado (local) vN`, histórico com `vN publicada (atual)` e versões
   anteriores como `despublicada`, sidebar com `publicado (local) vN`.
5. **Despublicar**: a versão atual vira `unpublished` (com `unpublishedAt`), `lastPublishedVersion`
   é zerado, a prévia publicada mostra **"Sem versão publicada."**; **o rascunho e o histórico são
   preservados**.

## 4. Modelo de versionamento e imutabilidade

- Cada publicação é um **registro novo** com `version` monotônica (`max(existing.version)+1`),
  calculada **dentro da mesma transação** que a grava (sem corrida).
- O `content` é **clonado** (`structuredClone`) no momento da publicação e **nunca é mutado depois**:
  editar o rascunho **não** altera snapshots anteriores.
- Publicar uma nova versão **não modifica** a anterior: a anterior apenas muda de `state` para
  `unpublished` (continua íntegra e listada no histórico).
- A **versão publicada atual** é obtida por **índice composto** `[profileTechnicalId+state]` com
  `state='published'` — **não depende de ordem de registros**.
- **Compatibilidade:** snapshots são validados antes de persistir; snapshots antigos permanecem
  renderizáveis (mesmo pipeline `parsePublishedSnapshot`); **blocos desconhecidos não quebram** o
  renderizador; **campos internos/admin nunca são expostos** (whitelist em `publicationToSnapshot`).
- **Despublicar** impede que aquela versão continue sendo a atual (não é selecionável como
  `published`), sem apagar dados.

## 5. Arquivos criados

- `apps/studio/src/publishing/index.ts` — conversão snapshot público, prévia publicada, diff estável.
- `apps/studio/src/hooks/useStudioPublication.ts` — estado/ações de publicação.
- `apps/studio/src/components/PublicationPanel.tsx` — painel de publicação (publish/unpublish/
  histórico/erros/aviso local-vs-público).
- Testes:
  - `tests/studio/studio-publication.test.ts` — publicação, versionamento, imutabilidade,
    validação, despublicar, concorrência, compatibilidade.
  - `tests/studio/studio-publication-ui.test.tsx` — fluxo de UI (publicar, não auto-publicar,
    despublicar, prévia publicada).
  - `tests/studio/studio-media-persistence.test.ts` — persistência de mídia após reload/reabertura.
  - `tests/studio/studio-autosave.test.tsx` — flush/concorrência do autosave (sem perda silenciosa).
  - `tests/studio/studio-migration.test.ts` — migração v1→v2→v3 (preserva dados, sem duplicação,
    idempotente).
- Relatório: `docs/RELATORIO-ENTREGA-3-PUBLICACAO-LOCAL-2026-11-18.md`.

## 6. Arquivos modificados

- `apps/studio/src/persistence/db.ts` — **v3**: tabela `publications`, `STUDIO_DB_VERSION = 3`,
  `LocalPublicationRecord`.
- `apps/studio/src/persistence/repository.ts` — `publishWorkingDraft`, `unpublishProfile`,
  `getCurrentPublication`, `listPublications`, `getPublicationByVersion`,
  `PublicationValidationError`.
- `apps/studio/src/hooks/useStudioEditor.ts` — `getRevision`, `refreshProfiles` (para o fluxo de
  publicação e atualização da sidebar).
- `apps/studio/src/components/PreviewPane.tsx` — alternância Rascunho/Publicado + indicador de
  divergência + estado vazio.
- `apps/studio/src/components/Studio.tsx` — 4ª aba "Publicação" + wiring.
- `apps/studio/src/components/ProfileSidebar.tsx` — meta `publicado (local) vN` / `rascunho`.
- `apps/studio/src/index.css` — estilos de publicação/prévia.
- `tests/studio/studio-editor.test.tsx` — aguarda controles habilitados (robustez de teste).
- `vitest.setup.ts` — `configure({ asyncUtilTimeout: 10_000 })`; `vitest.config.ts` —
  `testTimeout: 20_000` (robustez em máquina restrita).

## 7. Testes executados (reais)

Comandos executados via `cmd /c npm ...` (todos com código de saída registrado):

- `npm run typecheck` — **PASS (exit 0)** (workspaces + adapters + `tsconfig.tests.json`)
- `npm run lint` — **PASS (exit 0)** (ESLint)
- `npm run format` — **PASS (exit 0)** (Prettier; após `--write` em 2 arquivos de teste)
- `npm run test` — **PASS (exit 0)** — Vitest v4.1.12, **22 arquivos / 117 testes** (após a Entrega
  2: 17 arquivos/90 testes; **+5 arquivos, +27 testes**)
- `npm run build` — **PASS (exit 0)** — Vite v7.3.8; `dist/` presente em `apps/control`,
  `apps/share` (com `share-data/`) e `apps/studio`
- `npm audit --omit=dev` — **PASS (exit 0)** — `found 0 vulnerabilities`

Cobertura dos novos testes:

- **Publicação (unitário/DB):** publicação inicial cria `v1` e define a versão atual; nova publicação
  cria `v2` e marca `v1` como `unpublished`; **imutabilidade** (conteúdo de `v1` inalterado após
  editar o rascunho e publicar `v2`); **validação** bloqueia conteúdo inválido (`displayName` vazio →
  `PublicationValidationError`, nada persistido); **despublicar** remove a versão atual sem apagar o
  histórico; seleção da versão atual por **chave composta** (ordem-independente); **concorrência**
  (`expectedRevision` desatualizada → `StaleDraftError`); **compatibilidade** com snapshot antigo;
  tolerância a **bloco desconhecido**; **whitelist** (sem campos internos/admin).
- **UI de publicação:** publicar pela aba Publicação com o aviso local-vs-público; **não** auto-publica
  ao salvar o rascunho; prévia publicada **congelada** após editar o rascunho; despublicar retorna a
  estado vazio claro.
- **Mídia após reload/reabertura:** blobs persistidos em `mediaAssets`; metadados + presença de blob
  após reabrir o banco (jsdom + fake-indexeddb não preservam o conteúdo interno do `Blob` no
  structured clone — asserção de metadados + presença).
- **Autosave (flush + sem perda silenciosa):** flush em `pagehide` e drenagem de edições feitas
  durante a escrita.
- **Migração v1→v2→v3:** preserva dados, evita duplicação e é correta quando já aplicada (adiciona
  tabela `publications` vazia).

## 8. Evidência de persistência após reload (verificação em navegador)

Verificação manual no navegador (dev server `npm run dev:studio`, `http://localhost:5173/`), com
leitura direta do DOM, do IndexedDB e do console. **0 erros de console em todas as etapas.**

1. **Criar** perfil "Alice" → sidebar `Alice / rascunho`; prévia renderiza.
2. **Editar** nome → "Alice Andrade" e bio (eventos de input nativos) → status **"Salvo às …"**.
3. **Aba Publicação:** aviso local-vs-público presente; badge `rascunho`; histórico vazio
   ("Nenhuma versão publicada ainda…").
4. **Publicar** → badge `publicado (local) v1`; sidebar `publicado (local) v1`; histórico
   `v1 publicada (atual)`.
5. **Prévia publicada** → `Alice Andrade` (modo "Mostrando a versão publicada v1 (snapshot
   imutável).").
6. **Editar rascunho** para `Alice Editada` → prévia de rascunho atualiza e mostra **"difere da
   versão publicada"**; prévia publicada **continua** `Alice Andrade`.
7. **Publicar v2** → histórico `v2 publicada (atual)`, `v1 despublicada`; sidebar `publicado (local)
v2`; prévia publicada `Alice Editada`.
8. **IndexedDB (`hattz_studio.publications`):**
   - `v1` → `state: unpublished`, `content.profile.displayName: "Alice Andrade"` (**preservado**);
   - `v2` → `state: published`, `content.profile.displayName: "Alice Editada"`.
   - `workingDrafts`: `revision: 3`, `"Alice Editada"`; `localProfiles.lastPublishedVersion: 2`.
9. **Reload completo da página** → sidebar `publicado (local) v2` persistido; **0 erros de console**.
10. **Despublicar** → badge `rascunho`; "Nenhuma versão publicada ainda…"; histórico com `v2` e `v1`
    ambas `despublicada`; prévia publicada **"Sem versão publicada."** (sem `h1`); IndexedDB:
    **0** publicações `published`, rascunho **preservado** (`revision: 3`, "Alice Editada"),
    `lastPublishedVersion: null`.
11. **Reload novamente** → sidebar `rascunho`, rascunho persistido; **0 erros de console**.

## 9. Confirmação — Share e Studio continuam funcionando

- **Studio:** fluxo completo de ponta a ponta verificado no navegador (criar → editar → publicar →
  editar rascunho → publicar nova versão → despublicar → reload), com **0 erros de console** e
  evidência de IndexedDB em cada etapa (seção 8).
- **Share:** `npm run dev:share` em `http://localhost:5174/` → home carrega ("Acesse um perfil
  público pelo endereço direto, por exemplo /alice."), **0 erros de console**. Navegação para
  `http://localhost:5174/alice` → perfil **renderiza** (`Alice Andrade`, 4 seções, badges e rodapé
  `/alice`), **0 erros de console**. A fonte de dados do Share continua sendo o **manifesto estático
  local** (`apps/share/public/share-data/`), **não** o Supabase.

## 10. Confirmações de limites

- **Nenhuma conexão remota** foi criada: sem projeto Supabase, sem Auth/JWT/PostgREST/Storage, sem
  credenciais reais, sem internet.
- **Nenhuma publicação pública** ocorreu: a publicação desta entrega é **local** (IndexedDB) e a UI
  deixa explícito que o perfil **não** fica publicamente acessível. O adapter Supabase do Share
  permanece um **stub que lança**.
- **Nenhum commit, push, deploy ou operação destrutiva** foi realizado. HEAD permanece
  `2ab007c08d88d5cb518c39db65736eaba32f86d8`, branch `main`, **todas as mudanças não commitadas**.
- **Nenhuma migration existente foi alterada** nesta entrega; nenhuma migration foi executada
  remotamente.
- **Dexie preservada**; nenhuma feature das Entregas 1/2 foi removida; nenhum componente duplicado
  (a prévia continua usando `@hattz/profile-view`).
- **Sem auto-publicação:** salvar o rascunho **nunca** publica (testado e verificado).

## 11. Limitações explícitas

- **Publicação local, não pública:** o snapshot vive **apenas neste navegador**. Não há envio ao
  Supabase, upload ao Storage nem URL pública. A "prévia publicada" é uma renderização **local** do
  snapshot, não uma página acessível externamente.
- **Sem backend:** a fila `pendingSyncOps` permanece sem drenagem; nenhuma integração remota foi
  ligada.
- **Fonte de dados do Share:** continua o **manifesto estático local** (não é Supabase nem dados
  reais). Publicar no Studio **não** alimenta o manifesto do Share.
- **Slug:** o slug do snapshot é derivado do nome para prévia/registro local; **normalização de slug
  (regra 8)**, slugs `reserved` (regra 4) e política de slugs históricos (regra 2) permanecem
  **decisão do Owner**.
- **Catálogo autoritativo** de molduras/badges (`frames_catalog`, `user_badges`, coleções) permanece
  pendente; moldura interina via `theme.avatarFrame` e badges do snapshot.
- **Concorrência** cobre múltiplas abas no mesmo navegador (revisão otimista), **não** múltiplos
  usuários (sem autenticação).
- **jsdom + fake-indexeddb** não preservam o conteúdo interno de `Blob` no structured clone; os
  testes de mídia verificam **metadados + presença do blob**, não os bytes.
- **`npm audit` (dev-only):** 11 vulnerabilidades `high` em tooling (`picomatch`, sem correção
  upstream); produção limpa (`--omit=dev` = 0).
- **Screenshot:** não foi possível capturar imagem no ambiente (janela do app não visível); a
  verificação visual foi feita por árvore de acessibilidade + DOM + IndexedDB + console.

## 12. Próxima entrega recomendada

1. **Ponte Studio → Share (quando autorizado):** definir como um snapshot publicado localmente se
   tornaria o manifesto estático do Share (ou o `PlannedSupabasePublicProfileReadAdapter`) — **somente
   após autorização explícita** e sem credenciais nesta fase.
2. **Estratégia de URL pública de mídia** e upload ao Storage (Supabase), quando houver ambiente
   autorizado.
3. **Regras de slug** (normalização/reserved/histórico) e **catálogo autoritativo** de molduras e
   badges, quando o Owner aprovar as regras de negócio.
