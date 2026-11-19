# Hättz 2.0 — Relatório da Revisão Conjunta (2026-11-18)

Rodada de revisão conjunta solicitada pelo Owner. O trabalho parte do **projeto principal**
(`C:\Users\Noir\Documents\Hattz-2.0`), usando a **cópia revisada** fornecida pelo Owner
(`C:\Users\Noir\Documents\Hattz-2.0-revisao-assistente\Hattz-2.0`) **apenas como referência**.
A cópia revisada **não substitui** o projeto; nenhum `.git`/`node_modules`/`dist`/cache foi copiado.

Este relatório cobre as 10 seções pedidas: (1) comparação principal × revisada; (2) correções
adotadas/adaptadas/rejeitadas; (3) problemas encontrados e resolvidos; (4) problemas remanescentes;
(5) identidade visual dos painéis; (6) player de música + evidência de funcionamento; (7) arquivos
criados/modificados; (8) testes executados e resultados reais; (9) preservação das Entregas 1–4;
(10) confirmação de ausência de operação remota/commit/push/deploy.

---

## 1. Comparação: projeto principal × cópia revisada

Comparação **byte a byte** das duas árvores (excluindo `node_modules`, `.git`, `dist`, `.vite`,
`.cache` e `package-lock.json`), feita por um script de hash (SHA-256) — não por inspeção visual.

**Antes desta rodada**, a cópia revisada diferia do principal em **7 arquivos** (0 exclusivos do
principal, 0 exclusivos da revisada, 7 divergentes). **Depois** de incorporar as correções, a
comparação é:

- **Exclusivos do principal (2):** `tests/design-system/tokens.test.ts`,
  `tests/share/music-player.test.tsx` — testes novos desta rodada (não existem na cópia revisada).
- **Exclusivos da revisada (0):** nada da cópia revisada ficou de fora.
- **Divergentes (16):** 12 são trabalho novo do principal (identidade visual + player + adaptação,
  que a cópia revisada não tem) e **4 contêm correções já adotadas**, cuja única diferença restante
  é **comentário/ordem de import** (a lógica é idêntica):

| Arquivo divergente                          | Natureza da diferença restante                                             |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `hub/routing.ts`                            | Comentário explicativo extra no principal (lógica do favicon **idêntica**) |
| `packages/shared-utils/src/index.ts`        | Comentário mais detalhado no principal (array/função **idênticos**)        |
| `apps/studio/src/persistence/repository.ts` | Comentários mais detalhados no principal (lógica **idêntica**)             |
| `tests/studio/studio-publication.test.ts`   | Ordem dos imports (Prettier/ESLint) — **idêntico em semântica**            |

Arquivos de correção que ficaram **byte a byte idênticos** após a adoção:
`apps/share/src/data/localPublicationSource.ts`, `tests/hub/routing.test.ts`,
`tests/share/localPublicationSource.test.ts`.

**Conclusão:** todas as correções da cópia revisada foram incorporadas; onde o principal difere
agora é por comentários/testes/ordem de import ou por trabalho novo desta rodada — nunca por
divergência de comportamento.

---

## 2. Correções adotadas / adaptadas / rejeitadas

### Adotadas (7 de 7, todas as divergências da cópia revisada)

1. **`packages/shared-utils/src/index.ts` — slugs reservados.**
   `RESERVED_PUBLIC_SLUGS` (`studio`, `control`, `hub`, `apps`, `share-data`, `favicon`) +
   `isReservedPublicSlug`. **Problema original:** um perfil publicado com slug igual a uma rota
   interna do hub (`/studio`, `/control`, …) ficaria **inalcançável**, porque o caminho é consumido
   pelo próprio hub antes de chegar ao Share. **Adotada** (com comentário ampliado no principal).

2. **`apps/studio/src/persistence/repository.ts` — validação de slug na publicação.**
   `publishWorkingDraft` passou a validar o slug (`validateSlug`), a rejeitar slugs **reservados**
   (`PublicationSlugError`) e a **bloquear colisão** com o slug publicado de outro perfil; a
   `visibility` passa a `'public_intent'` ao publicar e `'unpublished'` ao despublicar.
   **Problema original:** era possível publicar um slug inválido/reservado/duplicado (endereço
   inalcançável ou ambíguo no Share). **Adotada.**

3. **`apps/share/src/data/localPublicationSource.ts` — guarda de propriedade de mídia.**
   `loadMedia(assetIds, ownerProfileTechnicalId)` só resolve uma mídia se ela pertencer ao perfil
   dono do snapshot. **Problema original:** um snapshot poderia referenciar um `assetId` de outro
   perfil e vazar/embaralhar mídia alheia. **Adotada** (idêntica à cópia revisada).

4. **`hub/routing.ts` — roteamento de favicon.**
   `/favicon.ico` e `/favicon.*` passam como arquivo estático. **Problema original:** o hub tratava o
   favicon como slug do Share. **Adotada.** No principal, o teste de prefixo ficou **restrito** a
   `/favicon.` para **não** engolir slugs legítimos que comecem com `favicon` (ex.: `/favicon-profile`),
   com comentário explicando — comportamento equivalente e mais seguro.

5–7. **Testes correspondentes** (`tests/hub/routing.test.ts`,
`tests/share/localPublicationSource.test.ts`, `tests/studio/studio-publication.test.ts`).
**Adotados** — os dois primeiros ficaram idênticos; o terceiro difere só na ordem dos imports.

### Adaptação (além da cópia revisada)

- **`apps/studio/src/editor/content.ts` → `slugForPreview`.** A nova validação de slug exige
  **mínimo de 3 caracteres**. O `displayName` do perfil, porém, só exige **não ser vazio** — um nome
  curto ("Jo") gerava um slug de prévia (`jo`) que a própria publicação rejeitaria, criando um
  preview que não podia ser publicado. **Adaptação:** `slug.padEnd(3, '0')` de forma determinística
  ("Jo" → `jo0`, "A" → `a00`). Teste de regressão em `tests/studio/editor-content.test.ts`.
  **Justificativa:** mantém a prévia consistente com o que a publicação aceita, sem afrouxar a regra
  de negócio do slug (que continua sendo decisão do Owner).

### Rejeitadas

- **Nenhuma.** Todas as divergências da cópia revisada eram correções válidas e foram incorporadas.
  Não houve alteração feita "só para bater com a cópia": cada uma foi justificada pelo problema real
  que resolve e coberta por teste.

---

## 3. Problemas reais encontrados e resolvidos

1. **Slug reservado/duplicado/inválido na publicação** (§2.1–2.2) — corrigido e testado.
2. **Mídia de outro perfil resolvível pelo Share** (§2.3) — corrigido e testado.
3. **Favicon tratado como slug** (§2.4) — corrigido e testado.
4. **Prévia com slug impublicável para nomes curtos** (§2, adaptação) — corrigido e testado.
5. **Corrida entre autosave e publicação** (da Entrega 4, permanece corrigida): `flush()` aguarda a
   gravação em voo (`savePromiseRef`); publicação não falha mais com `StaleDraftError`.
6. **Erro de lint `react-hooks/set-state-in-effect` no player** — o reset de faixa usava `setState`
   dentro de `useEffect`; reescrito com o padrão recomendado pelo React (ajuste de estado durante a
   renderização via `syncedUrl`), mantendo o `load()` do áudio num efeito separado.

Nenhum problema foi corrigido "para parecer" corrigido: cada um tem teste de regressão e/ou
verificação de navegador.

---

## 4. Problemas remanescentes

- **Supabase real** (Auth/JWT/PostgREST/Storage) não exercitado — requer ambiente autorizado.
  Sem alteração nesta rodada.
- **`npm audit` (dev-only):** 11 `high` em tooling (`picomatch 4.0.7`, sem correção upstream);
  **produção (`--omit=dev`) = 0 vulnerabilidades**. Não aplicado (`npm audit fix --force` exigiria
  downgrade major de `vite`).
- **Política de slugs do Owner** (histórico, reservados completos, normalização) permanece
  **decisão pendente**; esta rodada apenas protege os caminhos já ocupados pelo hub.
- **Screenshot de navegador indisponível** neste ambiente ("Screenshot needs a visible tab"):
  a verificação visual foi feita por **DOM/árvore de acessibilidade + estilos computados**, não por
  captura de imagem. Registrado como limitação, não como aprovação.
- **Emulação de viewport indisponível:** os breakpoints responsivos foram verificados pelo **CSS
  carregado** (`@media (max-width: 560px)`) e por testes, não por redimensionamento real.
- **Sem backend / fila de sync sem drenagem / catálogo autoritativo de molduras e badges** —
  pendências já conhecidas, fora do escopo desta rodada.

---

## 5. Identidade visual dos painéis (Liquid Glass)

**Tokens consolidados** em `packages/design-system/src/tokens.css` + `tokens.ts` (uma única fonte de
verdade, evitando implementações divergentes):

- Superfícies: `--hattz-glass-surface-soft/surface/strong` (grafite semitransparente, escuro).
- Bordas: `--hattz-glass-border/border-strong/border-highlight` (fina + realce interno claro).
- Reflexos: `--hattz-glass-highlight` (roxo **sutil**) e `--hattz-glass-reflection` (prata discreta).
- Profundidade: `--hattz-glass-shadow-soft/shadow/shadow-lifted`.
- Vidro: `--hattz-glass-blur: 16px`, `--hattz-glass-saturate: 140%`, receita
  `--hattz-glass-background` e `--hattz-glass-shadow-stack`.
- Raios: `--hattz-radius-sm/md/lg/pill`.
- **Fallback legível** via `@supports not (backdrop-filter…)`: o vidro fica **mais opaco** (mais
  escuro) para não perder contraste — nunca leitoso/claro.
- **Reduced motion:** `--hattz-motion-*` → `0ms` em `prefers-reduced-motion: reduce`.
- Classe reutilizável `.hattz-liquid-glass`.

**Aplicação:** `.share-section` (Share), `.studio-sidebar` / `.studio-panel` / `.studio-preview__frame`
(Studio), `.panel` (Control), cards do hub (`hub/hub.css`) e a **pílula de navegação injetada** do hub
(`HUB_NAV_CSS` em `vite.hub.config.ts`), agora referenciando os **mesmos tokens** (com fallbacks
literais para o instante anterior ao CSS do app).

**Regras respeitadas:** fundo escuro semitransparente real, `backdrop-filter: blur()` **de verdade**
quando suportado, borda fina/discreta, reflexos suaves, profundidade, cantos arredondados, contraste
adequado, hover/focus refinados. **Não** há painéis opacos fingindo vidro, branco leitoso, gradientes
rosa, roxo saturado, brilho forte em todas as bordas nem UI genérica de dashboard. A estrutura de
navegação e os fluxos existentes foram preservados (Share = experiência pública premium; Studio =
criação/edição; Control = estrutura administrativa pronta para o Bloco 5, **sem** admin fictício).

**Evidência (estilos computados no navegador, via hub):**
`backdrop-filter: blur(16px) saturate(1.4)`, `background-color: rgba(18, 20, 26, 0.55)`,
`border-color: rgba(199, 204, 214, 0.18)`, `border-radius: 20px` (painéis) / `999px` (pílula);
fallback de `@supports` e media queries `(max-width: 560px)` e `(prefers-reduced-motion: reduce)`
presentes no CSS carregado. Guarda automatizada: `tests/design-system/tokens.test.ts` (4 testes).

---

## 6. Player de música (expandido + mini) + evidência de funcionamento

**Modelo:** o `music` continua sendo **um bloco por faixa** (nada removido). Vários blocos `music`
numa mesma seção são agrupados num **playlist** (o primeiro é a âncora, os demais renderizam `null`),
com **anterior/próxima** apenas quando há mais de uma faixa. **Sem** botão de favorito (o modelo
**não** tem esse campo). **Nunca** há autoplay.

**Expandido:** capa (quando há `coverAssetId`), título, artista, **waveform determinística**
integrada ao progresso real do áudio, **seek** pela waveform (range sobreposto, acessível),
tempo atual + duração, play/pause, anterior/próxima (quando há playlist), volume + mudo.
Estados de **carregando/erro/fim** respeitados; controles **desabilitados** quando não aplicáveis.

**Mini flutuante:** waveform compacta, faixa atual, progresso, play/pause e acesso a **expandir**;
transição suave entre os formatos. É renderizado por `createPortal(..., document.body)` porque o
`backdrop-filter` cria um _containing block_ para descendentes `position: fixed` — sem o portal, o
mini seria recortado pelos painéis. O **mesmo** elemento `<audio>` permanece montado ao alternar
(não reinicia a reprodução).

**Acessibilidade:** rótulos reais (`aria-label`) nos botões e sliders; `aria-valuetext` no seek;
respeita `prefers-reduced-motion`.

**Evidência funcional (navegador, hub `http://localhost:5180/player-demo`, mídia de teste
autorizada `tone.wav` — tom sintético de 2 s, sem música protegida):**

- Perfil semeado com 2 faixas: título "Tom de teste A", artista "Hättz Lab", eyebrow "Faixa 1 de 2".
- `audio` com **`autoplay` ausente** e `audio.paused === true` no carregamento (não inicia sozinho).
- Capa e áudio resolvidos como `blob:` (mídia local), **sem** botão de favorito.
- Play → `paused=false`, `currentTime` avançou (~0,33 s), rótulo virou "Pausar …"; pause → volta a
  "Reproduzir …". **Os controles acionam o áudio real** (não são decorativos).
- "Próxima faixa" → "Tom de teste B" / "Faixa 2 de 2", anterior habilitado, próxima desabilitado.
- "Minimizar" → mini **portalado** (pai é `document.body`), expandido ausente, `<audio>` **continua
  montado**; "Expandir" restaura o expandido.
- **Após reload e reinício do servidor**, o player volta a resolver a mídia (novo `blob:`) e funciona.
- **0 erros de console** em todas as etapas.

---

## 7. Arquivos criados/modificados (nesta rodada de revisão conjunta)

**Correções da cópia revisada (adotadas/adaptadas):**

- `packages/shared-utils/src/index.ts`
- `apps/studio/src/persistence/repository.ts`
- `apps/share/src/data/localPublicationSource.ts`
- `hub/routing.ts`
- `apps/studio/src/editor/content.ts` (adaptação `slugForPreview`)

**Identidade visual (Liquid Glass):**

- `packages/design-system/src/tokens.css`, `packages/design-system/src/tokens.ts`
- `packages/profile-view/src/styles.css`
- `apps/studio/src/index.css`, `apps/control/src/index.css`, `hub/hub.css`
- `vite.hub.config.ts` (pílula de navegação usando os tokens)

**Player de música:**

- `packages/profile-view/src/rendering/MusicPlayer.tsx` (expandido + mini)
- `packages/profile-view/src/rendering/BlockRenderer.tsx`, `.../ProfileSection.tsx` (playlist)

**Testes (criados/atualizados):**

- `tests/design-system/tokens.test.ts` **(novo)**
- `tests/share/music-player.test.tsx` **(novo)**
- `tests/studio/editor-content.test.ts`, `tests/studio/studio-publication.test.ts`,
  `tests/share/localPublicationSource.test.ts`, `tests/hub/routing.test.ts`

**Documentação:**

- `docs/RELATORIO-REVISAO-CONJUNTA-2026-11-18.md` (este relatório)
- `DEVELOPMENT_STATUS.md`, `README.md`

> Observação: **todo** o trabalho das Entregas 1–4 e desta rodada está **no working tree, sem commit**
> (HEAD continua `2ab007c08d88d5cb518c39db65736eaba32f86d8`).

---

## 8. Testes executados + resultados reais

Comandos via `cmd /c npm …`; **todos os resultados abaixo foram realmente executados** (nenhum
teste é declarado aprovado sem execução).

| Comando                | Resultado                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`    | **PASS (exit 0)** — workspaces + `infrastructure/adapters` + `tsconfig.hub.json` + `tsconfig.tests.json` |
| `npm run lint`         | **PASS (exit 0)** — ESLint limpo                                                                         |
| `npm run format`       | **PASS (exit 0)** — Prettier limpo                                                                       |
| `npm test`             | **PASS (exit 0)** — Vitest v4.1.12, **27 arquivos / 152 testes aprovados**                               |
| `npm run build`        | **PASS (exit 0)** — Vite v7.3.8 (`@hattz/control`, `@hattz/share`, `@hattz/studio`)                      |
| `npm audit --omit=dev` | **PASS (exit 0)** — **found 0 vulnerabilities** (produção)                                               |
| `npm audit`            | **FAIL (exit 1)** — 11 `high` **dev-only** (`picomatch`, sem correção upstream)                          |

**Testes novos desta rodada:**

- `tests/share/music-player.test.tsx` — **8 testes** (expandido com controles rotulados e sem
  autoplay; ausência de favorito; play/pause ligados ao áudio real via eventos; seek pela waveform
  com tempo/duração; estado de erro; mini portalado sem reiniciar o áudio; nada renderiza sem URL;
  agrupamento de playlist com anterior/próxima).
- `tests/design-system/tokens.test.ts` — **4 testes** (todos os tokens de vidro declarados; valores
  TS idênticos ao CSS; fallback opaco quando `backdrop-filter` não é suportado; `blur()` real).

**Node/npm:** requisito do projeto é Node **24 LTS** (`.nvmrc`); ambiente atual Node **v26.13.0**,
npm **11.20.0** (dentro de `engines: >=24 <25 || >=26 <27`). Testes, lint, typecheck, build e audit
rodaram com sucesso nesse ambiente.

---

## 9. Confirmação: Entregas 1–4 preservadas

- **Entrega 1 (Share funcional)** — preservada: rota `/<slug>`, dados publicados, tema, mídia,
  estados de loading/erro/não encontrado/despublicado, responsivo e acessível. Verificado no
  navegador (`/alice-andrade`, `/player-demo`, não encontrado).
- **Entrega 2 (Studio funcional)** — preservada: criar/editar/salvar, prévia ao vivo reutilizando o
  renderizador do Share, autosave com concorrência otimista. Verificado no navegador.
- **Entrega 3 (Publicação local)** — preservada: publicar/despublicar, snapshots imutáveis
  versionados, histórico, prévia publicada. **Reforçada** pelas correções de slug (mais validação,
  não menos).
- **Entrega 4 (Integração local)** — preservada: hub na mesma origem, Share lendo o que o Studio
  publicou, corrida autosave×publicação corrigida. Verificado **após reinício do servidor**: as
  publicações persistiram e o Share voltou a renderizar.

Nenhuma funcionalidade aprovada foi removida; nenhuma decisão das Entregas 1–4 foi revertida.

---

## 10. Confirmação: nenhuma operação remota/commit/push/deploy

- **Sem commit, sem push, sem deploy, sem publicação** — todo o trabalho está no **working tree**;
  HEAD inalterado em `2ab007c08d88d5cb518c39db65736eaba32f86d8`.
- **Sem operações destrutivas** (`reset --hard`/`clean`/`rebase`/`squash`) — nenhuma executada.
- **Sem Supabase, sem Storage remoto, sem credenciais reais, sem migrations remotas, sem
  modificação de dados externos.**
- **Dexie preservada**; nenhuma dependência paga; nenhum arquivo/histórico apagado; ADR-003 intacto.
- **Sem `SECURITY DEFINER`/`BYPASSRLS`**; nenhuma reabertura da Fase 2B nem repetição de auditoria
  PostgreSQL/RLS sem mudança de infraestrutura relevante.
- **Sem avanço automático para o Bloco 4** (a administração real do Control permanece pendente).

**Aguardando avaliação do Owner.**
