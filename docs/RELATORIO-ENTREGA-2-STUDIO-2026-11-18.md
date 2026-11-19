# Relatório — Entrega 2 (Studio funcional com editor e persistência local) — 2026-11-18

Continuação do desenvolvimento do produto Hättz 2.0. **Sem commits, sem push, sem deploy, sem
Supabase, sem credenciais.** Toda a persistência desta entrega é **local (IndexedDB/Dexie)**.

## 1. Objetivo

Transformar o **Studio** de uma base inerte (persistência Dexie existente, porém **não ligada à
UI**) em um **editor funcional de perfis**: criar, editar, personalizar e **salvar de verdade** um
perfil local (nome, bio, avatar/banner, tema/cores/fontes, seções e os oito blocos aprovados,
visibilidade, ordem), com **preview ao vivo** que reutiliza **exatamente o renderizador do Share**, e
com **persistência confiável** (autosave, sem perda ao navegar/fechar, rascunhos que sobrevivem a
reload, falhas de IndexedDB tratadas, sem sobrescrita silenciosa). Sem controles decorativos sem
função.

## 2. Funcionalidades implementadas

### Etapa 1 — Inspeção e preservação

- Inspeção do Studio e dos contratos/adapters/Dexie existentes; **nada foi recriado** nem removido.
- A biblioteca de persistência já testada (`createLocalDraftProfile`, `saveDraftSnapshot`,
  `enqueuePendingSyncOperation`) foi **mantida** e **estendida**, não substituída. A **Dexie foi
  preservada**.

### Etapa 2 — UI premium do Studio

- Layout com **barra lateral** (lista de perfis + criação), **área central de edição** (abas
  Perfil / Seções / Tema), **painel de propriedades** (do bloco selecionado) e **prévia do perfil**.
- Estética **preto/grafite/prata/roxo** com **Liquid Glass** (reutilizando `hattz-liquid-glass` do
  Design System), responsiva até telas pequenas.
- Estados de **salvamento/erro** visíveis (`idle`/`dirty`/`saving`/`saved`/`error`/`conflict`) e
  estados de armazenamento (carregando/indisponível/erro).

### Etapa 3 — Editor funcional

- **Criar perfil** (nome de exibição) a partir da barra lateral.
- **Editar** nome e bio; **upload local** de **avatar** e **banner** (arquivos guardados no
  IndexedDB como `Blob`).
- **Tema**: cor de destaque/fundo/superfície/texto (hex), fonte de títulos e corpo
  (sans/serif/mono), estilo de fundo (sólido/gradiente/aurora), raio, moldura de avatar, e efeitos
  (glow/grain). SEO mínimo (título/descrição).
- **Seções**: criar, escolher tipo (`about`/`links`/`content`/`badges`/`music`/`gallery`),
  renomear (tipo), **remover** e **reordenar** (mover para cima/baixo).
- **Blocos** (os **oito aprovados**): `heading`, `text`, `link`, `links`, `image`, `badges`,
  `music`, `divider` — criar, **editar propriedades**, **remover** e **reordenar**.
- **Controle de visibilidade** por seção e por bloco (invisíveis não aparecem na prévia, igual ao
  Share).
- **Prévia ao vivo** que atualiza a cada edição.
- **Nenhum controle decorativo sem função**: cada botão/aba/campo altera o rascunho de verdade.

### Etapa 4 — Ligação à persistência Dexie

- **Rascunho de trabalho mutável** (`workingDrafts`, novo na v2): **um** registro por perfil,
  sobrescrito a cada autosave; `saveDraftSnapshot` (checkpoints versionados) **permanece** para
  salvamentos explícitos.
- **Autosave com debounce** de **700 ms** após a última alteração, com **single-flight** (uma
  escrita em voo por vez) e **drenagem** de edições que chegam durante a escrita.
- **Flush** do autosave em `visibilitychange` (aba oculta) e `pagehide`; **aviso** (`beforeunload`)
  quando há alterações não salvas.
- **Concorrência otimista**: cada rascunho tem `revision`; um salvamento só é aplicado se a revisão
  esperada ainda for a atual, caso contrário lança **`StaleDraftError`** → estado de **conflito**
  (com botão **Recarregar**) — **nunca sobrescreve silenciosamente**.
- **Salvar agora** explícito, além do autosave.
- **Falhas de IndexedDB** tratadas com mensagens explícitas (sem sucesso silencioso).
- **Sem perda ao navegar**: trocar de perfil escoa o rascunho sujo antes de carregar o próximo.
- **Rascunhos sobrevivem ao fechar/reabrir** (verificado em navegador e em teste de reload).
- **Migração v1 → v2** via `Dexie.version(2).upgrade()`: semeia o rascunho de trabalho a partir do
  snapshot mais recente de cada perfil (preserva conteúdo já existente). Bancos v1 existentes
  continuam válidos.
- **Offline-first**: tudo funciona sem internet.

### Etapa 5 — Reúso do Share e não publicação automática

- O **mesmo renderizador** do Share foi extraído para o pacote compartilhado **`@hattz/profile-view`**
  e agora é consumido por **Share e Studio** (sem componentes duplicados). `useDocumentMeta`
  permaneceu **só no Share**, para a prévia do Studio **não** sequestrar o `document.title`.
- O editor usa o **formato de dados do Share** (`PublishableSnapshotContent`): `toSnapshotContent`
  serializa o rascunho e `buildPreview` valida com `validatePublishableSnapshotContent` e interpreta
  com `parsePublishedSnapshot` — **o mesmo pipeline do Share**.
- **Nunca publica automaticamente**: a prévia é apenas renderização local; não há gravação de
  snapshot publicado nem integração de publicação nesta entrega.
- Cores de tema são sanitizadas para hex seguro antes de persistir (fail-closed, consistente com o
  renderizador).

## 3. Arquivos criados

Pacote compartilhado de renderização (novo; consumido por Share e Studio):

- `packages/profile-view/package.json`, `packages/profile-view/tsconfig.json`,
  `packages/profile-view/src/index.ts`, `src/styles.css`, `src/content.ts`, `src/media.ts`,
  `src/props.ts`, `src/theme.ts`
- `packages/profile-view/src/rendering/`: `ProfileView.tsx`, `ProfileHeader.tsx`,
  `ProfileSection.tsx`, `BlockRenderer.tsx`, `BadgeChip.tsx`, `MediaImage.tsx`, `MusicPlayer.tsx`,
  `states.tsx`

Modelo de edição (`apps/studio/src/editor/`):

- `blocks.ts`, `model.ts`, `content.ts`, `index.ts`

Hooks do Studio (`apps/studio/src/hooks/`):

- `useStudioEditor.ts`, `useStudioMedia.ts`

UI do Studio (`apps/studio/src/components/`):

- `Studio.tsx`, `ProfileSidebar.tsx`, `ProfileFields.tsx`, `SectionsEditor.tsx`, `BlockEditor.tsx`,
  `ThemePanel.tsx`, `PreviewPane.tsx`, `SaveStatusBar.tsx`, `fields.tsx`, `types.ts`

Testes (`tests/studio/`):

- `editor-model.test.ts`, `editor-content.test.ts`, `studio-persistence.test.ts`,
  `studio-editor.test.tsx`

Relatório: `docs/RELATORIO-ENTREGA-2-STUDIO-2026-11-18.md`

## 4. Arquivos modificados

- `apps/studio/src/persistence/db.ts` — **v2**: tabelas `workingDrafts` e `mediaAssets`,
  `STUDIO_DB_VERSION = 2`, migração v1→v2.
- `apps/studio/src/persistence/repository.ts` — `getLocalProfile`, `StaleDraftError`,
  `createWorkingDraft`, `getWorkingDraft`, `saveWorkingDraft`, `storeMediaAsset`, `getMediaAsset`,
  `listMediaAssets`.
- `apps/studio/src/App.tsx` — renderiza `<Studio/>`.
- `apps/studio/src/index.css` — estilos do Studio (Liquid Glass, layout, responsivo, acessível).
- `apps/studio/src/main.tsx` — importa `@hattz/profile-view/styles.css`.
- `apps/studio/index.html` — título/descrição.
- `apps/studio/package.json` — dependência `@hattz/profile-view`.
- `apps/studio/vite.config.ts` — alias `@hattz/profile-view` e `@hattz/profile-view/styles.css`.
- `apps/share/src/App.tsx`, `apps/share/src/index.css`, `apps/share/src/main.tsx`,
  `apps/share/package.json`, `apps/share/vite.config.ts`, `apps/share/index.html` — passam a consumir
  `@hattz/profile-view` (arquivos de renderização movidos de `apps/share` para o pacote).
- `vitest.config.ts`, `vitest.setup.ts`, `tsconfig.base.json`, `tsconfig.tests.json` — alias/inclusão
  de `@hattz/profile-view`, `fake-indexeddb/auto` e `tests/**/*.tsx`.

## 5. Testes executados (reais)

Comandos executados via `cmd /c npm ...`:

- `npm run typecheck` — **PASS (exit 0)** (workspaces + adapters + `tsconfig.tests.json`)
- `npm run lint` — **PASS (exit 0)**
- `npm run format` — **PASS (exit 0)** (após `format:write` em 13 arquivos)
- `npm run test` — **PASS (exit 0)** — Vitest v4.1.12, **17 arquivos / 90 testes** (antes: 13/59;
  **+4 arquivos, +31 testes**)
- `npm run build` — **PASS (exit 0)** — Vite v7.3.8 (Share, Studio, Control)
- `npm audit --omit=dev` — **PASS** — `found 0 vulnerabilities`

Cobertura dos novos testes (`tests/studio/`):

- **Modelo do editor** (operações puras/imutáveis): criar rascunho; os oito tipos de bloco com
  defaults clonados; adicionar/reordenar/remover seções; adicionar os oito blocos e
  reordenar/remover; visibilidade e merge de props; perfil/tema/seo imutáveis; ids únicos.
- **Ponte Studio→Share**: serialização aceita pelo validador; omissão de campos opcionais vazios;
  `order` derivado da posição após reordenação; `Record` de persistência; **round-trip**
  (draft→content→draft) preservando ordem e props; tolerância a conteúdo incompleto.
- **Prévia reutilizando o Share**: `buildPreview` sem issues para draft válido; **igual** ao que
  `parsePublishedSnapshot` produziria para o mesmo conteúdo; placeholder de nome só na prévia;
  seções/blocos invisíveis ocultos; issues em vez de renderização quando inválido; slugify; descarte
  de cores inseguras.
- **Persistência**: criar/ler/salvar rascunho (revisão incrementa, nome espelhado, **sem** bump de
  versão de checkpoint); **`StaleDraftError`** sem sobrescrever; falhas explícitas (criação duplicada,
  save de inexistente); **persistência após fechar/reabrir o banco**; **migração v1→v2** semeando do
  snapshot mais recente; ativos de mídia (store/list/get); nome padrão do banco singleton.
- **Componente (jsdom)**: criar perfil, editar nome, **autosave persistido**, **reload sobrevive** e
  recarrega os valores; adicionar seção + bloco refletidos no rascunho armazenado.

## 6. Resultados reais

- O Studio deixou de ser um shell e passou a **criar, editar e salvar perfis** de ponta a ponta, com
  prévia ao vivo usando **o mesmo renderizador e o mesmo pipeline de validação do Share**.
- Nenhum componente de renderização foi duplicado: Share e Studio consomem `@hattz/profile-view`.
- A persistência existente foi **estendida** (v2) sem quebrar os testes de IndexedDB anteriores
  (incl. cenários de falha), que continuam passando.

## 7. Evidência de persistência após reload (verificação em navegador)

Verificação manual no navegador (dev server `npm run dev:studio`, `http://localhost:5173/`), com
leitura direta do DOM, do IndexedDB e do console:

1. **Criar** perfil "Alice" → perfil aparece na lista; prévia renderiza.
2. **Editar** nome → "Alice Andrade" e bio → "Bio de teste do Studio" (via eventos de input nativos).
   - Prévia atualizada: nome e bio corretos.
   - Barra de status: **"Salvo às 14:20:18"**.
   - IndexedDB `hattz_studio.workingDrafts`: `revision: 2`, `content.profile` refletindo o novo
     nome/bio.
3. **Reload completo da página** e **seleção do perfil**:
   - Lista lateral: **"Alice Andrade"**.
   - Campos carregados: nome = **"Alice Andrade"**, bio = **"Bio de teste do Studio"**.
   - Prévia: nome e bio corretos.
   - **0 erros de console** em todas as etapas.
4. **Adicionar seção + bloco** (aba Seções): seção e bloco criados, refletidos na prévia
   (bloco de texto com "Escreva algo…"), status **"Salvo às 14:20:56"**, **0 erros de console**.

## 8. Limitações (explícitas)

- **Publicação/snapshot não implementados** nesta entrega: o Studio salva **rascunhos locais**; não
  há publish/unpublish, snapshot publicado nem integração com o backend. **Isso é intencional** e
  evita publicação automática.
- **Mídia local**: avatar/banner/imagem/áudio são armazenados como `Blob` no IndexedDB e resolvidos
  por `object URL` (o `ShareMediaResolver` do Studio é síncrono). **Não há upload para o Supabase
  Storage** (sem credenciais). A resolução de URL pública do Supabase permanece decisão pendente.
- **Sem backend/Supabase**: nada de Auth/JWT/PostgREST/Storage. A fila de sync (`pendingSyncOps`)
  permanece como base, **sem drenagem**.
- **Fonte de dados do Share**: continua um **manifesto estático local** (não é Supabase nem dados
  reais), como na Entrega 1.
- **Molduras/badges**: o catálogo autoritativo por role (`frames_catalog`, `user_badges`, coleções)
  permanece pendente; a moldura interina é `theme.avatarFrame` e os badges vêm do snapshot.
- **Normalização de slug** (regra 8) e **proteção de slugs `reserved`** (regra 4) permanecem decisão
  do Owner; o Studio gera um slug de prévia apenas para renderização.
- **Sem autenticação**: o Studio é local e de usuário único; a concorrência otimista cobre múltiplas
  abas, não múltiplos usuários.
- **Screenshot**: não foi possível capturar imagem no ambiente (janela do app não visível); a
  verificação visual foi feita por árvore de acessibilidade + DOM + IndexedDB + console.
- **`npm audit` (dev-only)**: 11 vulnerabilidades `high` em tooling (`picomatch`), sem correção
  upstream; produção limpa (`--omit=dev` = 0).

## 9. Próxima entrega recomendada

**Publicação/snapshot + visualização da versão publicada.** O Studio já produz o conteúdo no formato
exato do Share e o Share já renderiza esse formato. O próximo passo de maior valor é:

1. Fluxo explícito de **publicar/despublicar** um rascunho local, criando um **snapshot versionado**
   (usando `saveDraftSnapshot`, já existente e testado) com confirmação do usuário — **sem**
   publicação automática.
2. Uma **prévia "como publicado"** que lê o snapshot publicado (não o rascunho) para confirmar o que
   ficará público.
3. Quando um ambiente autorizado existir, ligar o `PlannedSupabasePublicProfileReadAdapter` (hoje um
   stub que lança) e o upload de mídia ao Storage — **somente após autorização explícita**.

Alternativa de menor risco: consolidar os contratos de dados e a estratégia de URL pública de mídia
antes de ligar qualquer backend.
