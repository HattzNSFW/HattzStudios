# Hättz 2.0 — Development Status

## Classificação formal

- **Fase 2A:** **CONCLUÍDA — PREPARAÇÃO TÉCNICA LOCAL**, com **validação de runtime executada em PostgreSQL 17.12 local e descartável**.
- **Produto:** **em desenvolvimento por entregas funcionais**. Entrega 1 — **Share funcional** (perfil público publicado, com fonte de dados local) — implementada e verificada em 2026-11-18. Entrega 2 — **Studio funcional** (editor de perfis com persistência local, prévia ao vivo reutilizando o renderizador do Share) — implementada e verificada em 2026-11-18. Entrega 3 — **Publicação local** (snapshots imutáveis versionados, histórico, despublicar e prévia publicada) — implementada e verificada em 2026-11-18. Entrega 4 — **Integração local** (Share ↔ Studio ↔ Control na mesma origem, com o Share lendo os snapshots publicados pelo Studio) — implementada e verificada em 2026-11-18.
- **Data:** 2026-11-16 (revisão de correções: 2026-11-17; rodada 6 — resolução de pendências/hardening final: 2026-11-17; entrega 1 — Share funcional: 2026-11-18; entrega 2 — Studio funcional: 2026-11-18; entrega 3 — publicação local: 2026-11-18; entrega 4 — integração local: 2026-11-18; revisão conjunta — correções da cópia revisada + identidade Liquid Glass + player de música: 2026-11-18; **validação final e fechamento: 2026-11-19**)
- **Branch:** `main`
- **Commits preservados:** `196c2a3`, `202b478`, `5aa24a0`, `2ab007c`, `902da77` (histórico integral preservado; sem rebase/reset/amend/squash). O baseline `902da77` preserva todas as entregas 1–4 e B4.1/B4.2; o trabalho da validação final foi feito em commits locais adicionais (sem push) — ver `docs/RELATORIO-FINAL-22-ITENS-2026-11-19.md`.
- **HEAD de baseline:** `902da779267555611f55967c4856c29e4046619e`. O hash dos commits finais locais consta no relatório final; **nenhum push, deploy ou publicação remota**.

**Significado desta classificação:** modelagem, implementação local, hardening, contratos, persistência inicial, documentação e testes automatizados previstos para a Fase 2A foram concluídos, e as migrations `0001`–`0014` foram **efetivamente aplicadas e exercitadas** em instâncias PostgreSQL locais isoladas e descartáveis (ver seções "Validação de runtime" e "Auditoria corretiva integral").

**Esta classificação NÃO significa:**

- Segurança de produção certificada.
- Banco Supabase criado ou conectado (Auth/JWT/PostgREST/Storage do Supabase **não** exercitados).
- Sistema pronto para publicação.
- Fase 2B iniciada.

**Próxima etapa:** aguardar avaliação/aprovação do Owner para iniciar **Fase 2B** (não iniciada).

## Restrições respeitadas

- Banco modelado para **Supabase (PostgreSQL) inteiramente novo**; migrations `0001`–`0014`. **Sem criação/conexão de projeto Supabase, sem credenciais reais, sem execução remota de migrations, sem acesso/modificação de bancos antigos, sem deploy/publicação/push, sem autenticação administrativa, sem Fase 2B, sem operações destrutivas.**
- A validação de runtime ocorreu **somente** em instâncias PostgreSQL locais, novas e descartáveis (`hattz_phase2b_validation_6`, `hattz_final_validation_20261119` e `hattz_phase2b_validation_7_audit_20261119`/`_8_`/`_9_`), criadas para este fim. Os bancos `hattz_phase2b_validation`, `_2`, `_3`, `_4` e `_5` foram **preservados**; o banco descartável de pré-checagem foi removido.
- Sem enfraquecimento de RLS, grants ou validações. **Nenhum `SECURITY DEFINER` ou bypass de RLS foi introduzido** (ADR-003 respeitado).
- Share limitado a interfaces/conteúdo publicado-público-ativo conforme modelo.

## Concluído (evidências locais)

- Modelagem do banco e migrations `0001`–`0014` (versionadas, sem execução remota).
- Separação entre dados locais (Studio/IndexedDB), públicos (Share), administrativos e de auditoria (domínios isolados).
- Políticas RLS, grants mínimos e restrições de acesso (`ENABLE/FORCE RLS`, revogações, policies restritivas por linha/coluna).
- Views públicas com projeções explícitas (`v_share_published_profiles`, `v_share_public_media`, `security_invoker=true`, `security_barrier=true`) como interface canônica do Share.
- Validação de snapshots publicáveis no TypeScript (`@hattz/validation`) e no PostgreSQL (função/trigger), com alinhamento estrutural TS↔SQL.
- Limites explícitos e extensibilidade controlada/tipada para snapshots (`props/theme/effects`).
- Integridade referencial de `profile_public_snapshots.og_image_asset_id` com FK para `media_assets(id)` e `ON DELETE SET NULL`.
- **Integridade de identidade do snapshot (`0011`)**: FK composta garante que `publication_id`, `profile_id` e `version` do snapshot pertençam à mesma publicação.
- **Correção de visibilidade pública (`0010`)**: coluna derivada `profile_publications.is_publicly_visible` mantida por trigger; elimina a recursão de RLS do A1-ii (P2 autocontida; P1/P3 dependem do flag derivado).
- **Grants do escritor confiável (`0012`, resolvido nesta rodada)**: provisiona o conjunto **mínimo por coluna** de privilégios do papel server-side `service_role` exigido pelos triggers `SECURITY INVOKER` da `0010` (e pelos DML do próprio escritor), guardado por existência do papel, **sem** `SECURITY DEFINER`, **sem** `BYPASSRLS`, **sem** tocar `anon`/`authenticated` e **sem** over-grant. Cada privilégio provado **necessário** por controle negativo.
- **Regra 1 de slug (`0013`, resolvida nesta rodada)**: índice único parcial garante **no máximo um slug atual por perfil**; a unicidade global (case-insensitive) já vinha da `0002`.
- Persistência local do Studio (IndexedDB/Dexie, migrações/versionamento, fila/metadados) com semântica de falha explícita (sem sobrescrita silenciosa).
- Contratos e adapters/boundaries.
- Testes automatizados estruturais e de validação (TypeScript e inspeção estrutural de migrations/SQL).
- **Testes de comportamento SQL e de RLS executados em PostgreSQL real local** (ver abaixo).

## Validação de runtime (PostgreSQL 17.12 local e descartável)

Banco descartável `hattz_phase2b_validation_6`; owner `hattz_pg_admin`. Migrations aplicadas em ordem com `psql -v ON_ERROR_STOP=1`. Logs em `%LOCALAPPDATA%\Hattz-2.0-postgres\logs\phase2b_validation_6`. Harness versionado e reproduzível em `infrastructure/supabase/validation/` (ver `README.md` do diretório). **35 passos / 0 falhas** (`=== ALL VALIDATION STEPS PASSED ===`, exit 0); bancos `_`, `_2`, `_3`, `_4`, `_5` preservados.

**Reexecução final (2026-11-19):** o mesmo harness rodou em banco **novo e descartável** `hattz_final_validation_20261119`, com preflight (`00_preflight.sql`) e oito blocos de validação. Resultado: **36 etapas / 0 falhas**, exit 0, incluindo **27 execuções de concorrência** (9 cenários × 3, todas `PASS`). Logs em `%LOCALAPPDATA%\Hattz-2.0-postgres\logs\final_validation_20261119\runner-console.log`. Bancos anteriores preservados. PostgreSQL **17.12** local; Supabase real permanece pendente.

- **Migrations `0001`–`0014`:** aplicadas com sucesso (exit 0 em todas); reaplicação idempotente de `0012`/`0013`/`0014` (exit 0, após a auditoria corretiva).
- **Estrutura:** 34 tabelas de domínio; **5 policies**; **34/34 tabelas com FORCE RLS**; funções de sync sem `SECURITY DEFINER` (`prosecdef=false`, `search_path=pg_catalog, public`).
- **Invariante do flag derivado:** 0 divergências entre `is_publicly_visible` e o predicado `(state='published' AND snapshot.visibility='public')`.
- **Transições de matriz (T0–T12):** publicar/despublicar, snapshot público/não público, inserir/remover snapshot, mover publicação no mesmo perfil — todas consistentes; **movimento cross-profile agora é rejeitado pela FK composta (`0011`)**; `DELETE` de publicação com snapshot rejeitado (FK `ON DELETE RESTRICT`).
- **Integridade de identidade `0011` (N1–N6):** inserções/atualizações com `profile_id`/`version` divergentes da publicação referenciada são rejeitadas por FK; atualização que preserva identidade é aceita. Pré-checagem diagnóstica bloqueia banco legado com dados divergentes (mensagem clara) e a migration aplica com sucesso após a correção dos dados.
- **Validador (paridade SQL↔TS):** fixture única (`tests/fixtures/publishable-snapshot-parity.json`) exercita TS (`tests/validation/publishable-snapshot-parity.test.ts`) e SQL (`sql/30_validator_parity.sql`) com os mesmos casos; `tokens` aceito, `token` rejeitado; guard `CASE` dos SRFs evita erro em escalares; `charLength` por code points e `schemaVersion` limitado ao intervalo inteiro seguro (alinhados ao SQL). A auditoria corretiva ampliou para **71 casos** (trim Unicode e `schemaVersion: 1.0`); a integração posterior ampliou para **75 casos**, incluindo chaves internas de identidade/propriedade.
- **Matriz de acesso `anon` e `authenticated`:** apenas o perfil publicado/público (Alice) é visível; leituras de `profiles`/admin/audit/agregados negadas; escritas negadas (incl. tentativa de forjar o flag derivado); funções internas não executáveis; **sem recursão de RLS**.
- **Contexto de privilégio/trigger (`service_role`, BYPASSRLS) — modelo provado e grants aplicados:** os triggers `0010` executam como **invocador**; o trigger BEFORE precisa de `SELECT` em `profile_public_snapshots` **somente quando** `state → 'published'` (o predicado é `(state='published') AND EXISTS(...)`, com curto-circuito do `AND`); o trigger AFTER precisa de `SELECT + UPDATE` em `profile_publications` (`FOR UPDATE`). Privilégios negativos provam que **não há bypass silencioso**. Nenhum `SECURITY DEFINER`. A `0012` **aplica** esse mínimo por coluna (`82`): `G1` grants presentes, `G2` sem over-grant, `W1–W9` todos os caminhos de escrita, `N1–N6` cada grant necessário, `N7` papéis públicos sem escrita, `I1` invariante, `G3` rollback preserva a ACL.
- **Integridade de slug (`0013`, `72`):** índices presentes (`0002` global + `0013` por perfil); slug atual duplicado rejeitado; segundo slug atual para o mesmo perfil rejeitado (**regra 1**); troca atômica termina com exatamente um slug atual. **`reserved`/histórico/normalização permanecem decisão do Owner** (documentado).
- **Concorrência:** **27 execuções (9 cenários × 3)** com duas transações sobrepostas — 6 cenários originais (estado × visibilidade) + `INSERT`/`DELETE` de snapshot + mudança de `publication_id`; overlap comprovado por traço e por `pg_stat_activity`; **todas consistentes** (flag final = predicado).

**Limites desta validação:** a instância é PostgreSQL 17.12 local. Os papéis `anon`/`authenticated`/`service_role` são **stand-ins locais**; **não** são equivalentes ao Supabase Auth/JWT/PostgREST/Storage. A semântica específica do Supabase (RLS via JWT, PostgREST, Storage policies) permanece pendente de ambiente autorizado.

## Não validado em execução real

- Projeto Supabase real (Auth/JWT/PostgREST/Storage) e semântica de RLS via token.
- Integração remota, deploy/publicação e fluxos da Fase 2B.
- Contexto administrativo do Control (autenticação administrativa não implementada).

## Auditoria de aplicação (Share / Studio / Control) — read-only (rodada 6, histórico)

Auditoria de leitura contra os checklists das apps; **nenhum código de app foi alterado** nessa rodada. As seções "Entrega 1" a "Validação final" abaixo descrevem o estado atual.

- **`apps/share`:** shell **estático** (Fase 0–1). Sem acesso a dados, sem roteamento, sem resolução de slug, sem mídia, sem estados de loading/erro. `@hattz/contracts`/`@hattz/core` declarados mas **não usados**; o adapter Supabase é um **stub que lança**. Apenas CSS responsivo + shell. — **Superado pela Entrega 1 (Share funcional), ver abaixo.**
- **`apps/studio`:** biblioteca de persistência local Dexie **real e testada** (`createLocalDraftProfile`, `saveDraftSnapshot` com incremento atômico de versão, `enqueuePendingSyncOperation`), **porém não ligada à UI**; sem publish/unpublish, sem wiring de validação, sem drenagem de sync, sem editor. — **Superado pela Entrega 2 (Studio funcional), ver abaixo.**
- **`apps/control`:** placeholder **estático**, com **zero** lógica administrativa/auth/backend.

**Consequência:** nenhum app tem backend ligado; a validação de runtime cobre o **banco**, não os fluxos de app (que pertencem à Fase 2B, não iniciada). Nada foi inventado nem removido.

## Entrega 1 — Share funcional (2026-11-18)

Primeira entrega funcional do produto. Detalhes completos em `docs/RELATORIO-ENTREGA-1-SHARE-2026-11-18.md`.

- **O que foi entregue:** o **Share** deixou de ser shell estático e passou a **carregar e renderizar perfis publicados** por rota `/<slug>` (nome, bio, avatar/banner, seções e blocos, badges/raridades, molduras de avatar, tema/tipografia, links, player de música), com estados de `loading`/`erro`/`não encontrado`/`despublicado`, responsividade e acessibilidade.
- **Reúso de contratos:** `PublicProfileReadAdapter` (estendido como `ShareProfileSource`), `validatePublishableSnapshotContent` (mesmo validador do banco), tokens do Design System e `COLLECTIBLE_RARITIES`.
- **Fonte de dados:** **manifesto estático local** (`apps/share/public/share-data/`) com o **mesmo formato da view pública** `v_share_published_profiles`. **NÃO é o Supabase e NÃO são dados reais de produção**; o adapter Supabase permanece um stub que lança. A UI e o pipeline de renderização são reais e reutilizáveis.
- **Segurança de dados:** apenas conteúdo publicado/público é renderizado; o validador compartilhado rejeita chaves proibidas (`draft|admin|internal|private|…`); conteúdo inválido vira estado de erro (nunca renderização parcial).
- **Verificação no navegador (build de produção via `vite preview`):** `/alice`, `/bruno`, `/lena`, `/marina` (despublicado), `/ghost` e `/Alice` (não encontrado), `/` (home) — **0 erros de console**; requisições de dados/mídia OK; seção invisível não renderizada. Um bug real de runtime (`fetch` nativo perdendo o receptor `Window` → "Illegal invocation") foi encontrado e corrigido.
- **Limitações explícitas:** distinção "despublicado" vs "inexistente" só é possível com a fonte local (a view pública do Supabase não expõe não publicados); canal de moldura interino é `theme.avatarFrame` (catálogo por role pendente); badges vêm do snapshot (origem autoritativa `user_badges`/coleções pendente); normalização de slug (regra 8) e URL pública de mídia do Supabase permanecem decisão do Owner.

## Entrega 2 — Studio funcional (2026-11-18)

Segunda entrega funcional. Detalhes completos em `docs/RELATORIO-ENTREGA-2-STUDIO-2026-11-18.md`.

- **O que foi entregue:** o **Studio** deixou de ser uma base inerte e passou a **criar, editar e salvar perfis locais**: nome, bio, upload local de avatar/banner, tema (cores/fontes/estilo de fundo/raio/moldura/efeitos), SEO, **seções** (criar/tipo/remover/reordenar) e os **oito blocos aprovados** (`heading`, `text`, `link`, `links`, `image`, `badges`, `music`, `divider` — criar/editar/remover/reordenar), com **controle de visibilidade** por seção e bloco e **prévia ao vivo**.
- **Reúso do Share (sem duplicação):** o renderizador foi extraído para o pacote compartilhado **`@hattz/profile-view`**, consumido por **Share e Studio**. A prévia usa **o mesmo pipeline** do Share: `toSnapshotContent` → `validatePublishableSnapshotContent` → `parsePublishedSnapshot`. `useDocumentMeta` permaneceu só no Share.
- **Persistência (Dexie v2):** novo rascunho de trabalho mutável (`workingDrafts`) com **autosave** (debounce 700 ms, single-flight, flush em `visibilitychange`/`pagehide`) e **concorrência otimista** (`revision` → `StaleDraftError`; **sem sobrescrita silenciosa**); tabela `mediaAssets` para blobs locais; **migração v1→v2** semeando do snapshot mais recente. `saveDraftSnapshot` (checkpoints versionados) preservado. **Dexie preservada**.
- **Sem publicação automática:** a prévia é renderização local; não há publish/unpublish nem integração de backend nesta entrega. **Sem Supabase, sem credenciais.**
- **Verificação no navegador (dev server):** criar perfil, editar nome/bio → prévia atualiza e status **"Salvo às …"**; IndexedDB reflete `revision`/conteúdo; **reload completo** → perfil e edições **persistem** na lista e nos campos; adicionar seção + bloco refletido na prévia; **0 erros de console**.
- **Limitações explícitas:** publicação/snapshot e upload ao Storage **não** implementados; mídia local via `object URL` (sem Storage do Supabase); fila de sync sem drenagem; catálogo autoritativo de molduras/badges pendente; regras de slug (4/8) pendentes do Owner.

## Entrega 3 — Publicação local (2026-11-18)

Terceira entrega funcional. Detalhes completos em `docs/RELATORIO-ENTREGA-3-PUBLICACAO-LOCAL-2026-11-18.md`.

- **O que foi entregue:** fluxo **explícito** de **publicar/despublicar** no Studio, criando **snapshots imutáveis e versionados** (`v1`, `v2`, …) com **histórico de versões**, **identificação da versão publicada atual** e uma **prévia "publicada"** que lê **exclusivamente** o snapshot publicado (separada da prévia de edição, que mostra o rascunho).
- **Distinção local vs público (explícita na UI):** _publicação local_ **≠** _publicação pública_. O snapshot vive **apenas neste navegador (IndexedDB)**; nada é enviado à internet e o perfil **não** fica publicamente acessível. Aviso dedicado no painel de Publicação.
- **Persistência (Dexie v3):** nova tabela **`publications`** (`STUDIO_DB_VERSION = 3`, migração **apenas** via `.stores()`, sem transformação). `publishWorkingDraft` **valida antes de persistir** (`validatePublishableSnapshotContent` → `PublicationValidationError`), calcula `version = max+1` **dentro de uma transação `rw`**, clona o conteúdo (`structuredClone`) e troca a versão atual **atomicamente**. `unpublishProfile` marca a atual como `unpublished` sem apagar nada. Versão atual obtida por **índice composto** `[profileTechnicalId+state]` (**ordem-independente**). `expectedRevision` evita sobrescrita silenciosa sob concorrência. **Dexie preservada.**
- **Imutabilidade:** publicar uma nova versão **não modifica** as anteriores; editar o rascunho **não** altera snapshots já publicados; conteúdo validado antes de gravar; **blocos desconhecidos** não quebram a renderização; **campos internos/admin** nunca são expostos (whitelist).
- **UI:** 4ª aba **Publicação** (publicar/nova versão/despublicar + histórico + erros de validação + aviso local-vs-público); `PreviewPane` com alternância **Rascunho/Publicado** e indicador **"difere da versão publicada"**; `ProfileSidebar` com `publicado (local) vN`/`rascunho`.
- **Sem publicação automática:** salvar o rascunho **nunca** publica (testado e verificado).
- **Verificação no navegador (dev server):** criar → editar → publicar `v1` → editar rascunho (prévia publicada **congelada**, rascunho sinaliza divergência) → publicar `v2` (`v1 despublicada`) → IndexedDB preserva `v1` → **reload** persiste `publicado (local) v2` → despublicar → estado vazio claro → **reload** persiste `rascunho`; **0 erros de console**.
- **Limitações explícitas:** publicação é **local**, não pública; sem Supabase/Storage/backend; a fonte do Share continua o manifesto estático local; regras de slug (2/4/8) e catálogo autoritativo de molduras/badges pendentes do Owner.

## Entrega 4 — Integração local (Share ↔ Studio ↔ Control) (2026-11-18)

Quarta entrega funcional. Detalhes completos em `docs/RELATORIO-ENTREGA-4-INTEGRACAO-LOCAL-2026-11-18.md`.

- **O que foi entregue:** um **ambiente local integrado** em que o Owner abre **uma única URL** (`npm run dev:hub`, `http://localhost:5180/`) e usa as três apps integradas — **Share** (visão pública), **Studio** (edição + publicação local) e **Control** (fundação atual, para o Bloco 5) — com **fluxo de dados real do Studio para o Share**.
- **Arquitetura:** um **hub de desenvolvimento** na raiz (`vite.hub.config.ts`, porta fixa `5180` com `strictPort`) serve as três apps na **mesma origem** — requisito para o **IndexedDB compartilhado** (que é isolado por origem) sem Supabase/backend. Roteamento puro e testável em `hub/routing.ts`: `/` → landing do hub; `/studio`, `/control` → apps; **qualquer outro caminho → Share** (contrato público `/<slug>` preservado).
- **Base compartilhada:** novo pacote **`@hattz/local-store`** centraliza o schema IndexedDB (`hattz_studio`, Dexie v3) e as **leituras públicas** (`findPublishedPublicationBySlug`, `hasAnyPublicationWithSlug`, `listPublishedProfiles`). `publicationToSnapshot` foi **movido** para cá (o Studio reexporta). `apps/studio/src/persistence/db.ts` passou a reexportar o pacote — **sem** alterar contratos existentes.
- **Share lê o que o Studio publicou:** `apps/share/src/data/localPublicationSource.ts` (implementa `ShareDataSource`) lê **exclusivamente** `publications` com `state === 'published'`, projeta com a **mesma** `publicationToSnapshot` e **pré-resolve as mídias** locais (avatar/banner/imagens) como `blob:` URLs. **Nunca** lê rascunhos, **nunca** expõe campos internos (`publicationId`/`profileTechnicalId`/`state`), **nunca** usa dados de demonstração em runtime. Distingue **"despublicado"** (existe publicação mas nenhuma atual) de **"não encontrado"** (nunca publicado).
- **Hub:** landing com cards das três apps + **lista real de perfis publicados** (com link "Abrir no Share") e uma **navegação Hättz** (Liquid Glass: Hub/Studio/Control) injetada via `transformIndexHtml` — **apenas** no servidor do hub, de modo que os apps standalone e os builds individuais **permanecem inalterados**.
- **Verificação no navegador (hub):** fluxo obrigatório completo de ponta a ponta — abrir Studio → criar perfil → editar (nome/bio/avatar/banner/conteúdo) → salvar rascunho → Share **não** mostra o rascunho ("Perfil não encontrado") → publicar `v1` → Share renderiza `v1` → editar rascunho → Share **continua** em `v1` → publicar `v2` → Share mostra `v2` → despublicar → Share mostra **"Perfil despublicado"** → reload → **reinício do servidor** → persistência intacta (`v3`, hub lista o perfil). **0 erros de console em todas as etapas.**
- **Dois defeitos reais corrigidos na verificação:** (1) o entry script do Share (`./src/main.tsx`) era resolvido contra `/<slug>` e dava 404 (Share não montava) — corrigido reescrevendo o entry para `/apps/<app>/src/main.tsx`; (2) **corrida entre autosave e publicação** — `flush()` retornava cedo com um autosave em voo e a publicação falhava com `StaleDraftError`; corrigido fazendo `runSave` **aguardar a gravação em voo** (`savePromiseRef`), com **teste de regressão** (confirmado falhando sem a correção).
- **Limitações explícitas:** a integração depende da **mesma origem** (nos dev servers standalone, com portas separadas, o Share **não** enxerga a base do Studio); **sem backend** (fila de sync sem drenagem); slugs `studio`/`control`/`hub`/`apps` colidem com rotas reservadas do hub; **não é Bloco 4/5** (a administração real do Control permanece pendente).

## Revisão conjunta — correções da cópia revisada + identidade Liquid Glass + player (2026-11-18)

Rodada de revisão conjunta sobre as Entregas 1–4. Detalhes completos em `docs/RELATORIO-REVISAO-CONJUNTA-2026-11-18.md`. A cópia revisada do Owner foi usada **apenas como referência** (não substitui o projeto).

- **Comparação (byte a byte):** antes, a cópia revisada diferia do principal em **7 arquivos** (0 exclusivos de cada lado). **Todas as 7 correções foram adotadas** (4 de código + 3 de teste); após a adoção, os arquivos de correção ficaram idênticos ou diferem **só em comentário/ordem de import** (lógica idêntica).
- **Correções adotadas:** (1) `RESERVED_PUBLIC_SLUGS`/`isReservedPublicSlug` em `@hattz/shared-utils`; (2) validação de slug (formato/reservado/colisão) e `visibility` (`public_intent`/`unpublished`) em `publishWorkingDraft`/`unpublishProfile`; (3) guarda de propriedade de mídia em `LocalPublicationSource.loadMedia`; (4) roteamento de `/favicon.*` no hub; (5–7) os testes correspondentes.
- **Adaptação (além da cópia):** `slugForPreview` (`apps/studio/src/editor/content.ts`) completa com `padEnd(3, '0')` slugs curtos ("Jo" → `jo0`), porque o contrato de slug exige ≥ 3 caracteres e o `displayName` só exige não-vazio — evitando uma prévia impublicável. Teste de regressão adicionado.
- **Identidade visual (Liquid Glass):** tokens consolidados em `@hattz/design-system` (superfícies escuras semitransparentes, bordas finas, reflexos roxo-sutil/prata, sombras, `blur(16px) saturate(1.4)`, raios) com **fallback opaco legível** (`@supports not (backdrop-filter…)`) e `prefers-reduced-motion`. Aplicados a Share (`.share-section`), Studio (`.studio-sidebar`/`.studio-panel`/`.studio-preview__frame`), Control (`.panel`), cards do hub e à **pílula de navegação injetada** do hub. Verificado por estilos computados (blur real, translucidez, borda, raio); sem painéis opacos fingindo vidro, sem branco leitoso/rosa/roxo saturado/brilho excessivo.
- **Player de música (expandido + mini):** `MusicPlayer.tsx` reescrito — capa/título/artista, waveform determinística integrada ao progresso real, seek acessível, tempo/duração, play/pause, anterior/próxima (só quando há playlist de blocos `music`), volume/mudo, estados de carregando/erro/fim, **sem autoplay**, **sem favorito** (o modelo não tem o campo). Mini flutuante via `createPortal(document.body)` (o `backdrop-filter` recortaria `position: fixed`), com o **mesmo** `<audio>` mantido ao alternar. Suporte ao bloco `music` **preservado**; apenas mídia de teste autorizada (`tone.wav`, tom sintético).
- **Problemas reais resolvidos:** slug reservado/duplicado/inválido; mídia de outro perfil; favicon como slug; prévia com slug curto impublicável; erro de lint `react-hooks/set-state-in-effect` no player (padrão "ajustar estado durante a renderização").
- **Verificação no navegador (hub):** Hub landing (lista real de publicações), Control e Share renderizam; Share `/player-demo` com player expandido (play/pause aciona o áudio real, seek, próxima faixa, mini portalado, sem autoplay, sem favorito) e `/alice-andrade`; Studio com painéis e player na prévia; pílula de navegação com `aria-current` correto; estado "não encontrado"; **reinício do servidor** → publicações persistem e o Share volta a resolver a mídia. **0 erros de console.** Screenshot indisponível neste ambiente (sem janela visível) — verificação por DOM/estilos computados.
- **Limitações:** screenshot e emulação de viewport indisponíveis (responsividade verificada por CSS carregado + testes); Supabase real, fila de sync e catálogo de molduras/badges permanecem pendentes; política completa de slugs reservados/históricos/normalização continua decisão do Owner.

## Validação final e fechamento (2026-11-19)

Rodada de conclusão integral dos oito blocos, com correção das ressalvas da B4.2 e validação ponta a ponta. Fonte de verdade: o código e os contratos canônicos do repositório; o projeto antigo não foi usado como referência.

- **B4.2 (Control) — ressalvas corrigidas:** fonte estável do modelo com `useState` (não `useRef`, por regra do ESLint), imports consolidados em `controlModel.ts`, auditoria estática **recursiva** em `tests/control/read-only-audit.test.ts` e teste do caminho de produção em `tests/control/control-ui.test.tsx`. `tests/control`: **24/24**. A interface permanece **somente leitura** (0 botões, 0 formulários, 0 inputs); avisos explícitos de que não concessiona/revoga nada, não há sessão administrativa local e Owner público não confere acesso administrativo.
- **Share — hardening:** `useShareProfile` expõe somente mensagens públicas seguras; `useDocumentMeta` gerencia description/OG/Twitter/canonical/robots (sem `og:image` de `blob:`); `staticShareSource` passou a validar com `validatePublishableSnapshotContent`. `tests/share`: **44/44**.
- **Studio — lacunas implementadas:** `transfer.ts` (export/import/backup/restore locais), `repository.ts` (histórico/checkpoints, mídia referência-segura, slug e fila `pendingSyncOps`), `useStudioConnectivity` (online/offline), aba **Dados** (`DataPanel.tsx`) e SEO em `ProfileFields.tsx`. `tests/studio/studio-transfer.test.ts`: **10/10**. Tudo **local** — sem sync remoto nem publicação pública.
- **Banco/docs/CI:** `RLS_POLICIES.md` corrigido; `tests/integrity/migrations-0012-0013.test.ts` **3/3**; `00_preflight.sql` passou a ser executado por `run_validation.ps1`; CI ganhou auditoria estática explícita do Control e `npm audit --omit=dev`.
- **Defeito real corrigido — slug publicado:** a publicação usava `slugForPreview(displayName)` em vez do endereço editado. `useStudioPublication` passou a usar `publicSlugDraft` como fonte autoritativa; `Studio.tsx` injeta o valor. Teste de regressão `tests/studio/studio-publication-slug.test.tsx`. No navegador: v1 publicou `validacao-final`; após a correção, v2 publicou `validacao-final-v2` e v1 ficou `unpublished`.
- **SEO/robots:** o hub servia HTML em `/robots.txt` (Lighthouse SEO 0.8). Adicionados `public/robots.txt` (hub) e `apps/share/public/robots.txt` (build de produção), com `Allow: /` para perfis públicos e `Disallow` de `/studio/`, `/control/`, `/apps/`; teste de roteamento em `tests/hub/routing.test.ts`. Lighthouse repetido: **acessibilidade 1, boas práticas 1, SEO 1, sem falhas**.
- **Validação em navegador (hub `http://localhost:5180/`):** Hub (lista vazia antes da publicação), Studio (criar perfil, editar bio/SEO, rejeitar slug inválido, salvar `validacao-final-v2`, checkpoint, publicar v1/v2), Share (`/validacao-final-v2` com título/description/OG/Twitter/canonical e `robots=index, follow`; `/validacao-final` → "Perfil despublicado"; `/ghost` → "Perfil não encontrado"), Control (somente leitura). **0 erros de console** em todas as etapas. Screenshot do Share capturado e exibido no Review pane. Estilos computados confirmaram Liquid Glass (`blur(16px) saturate(1.4)`, `rgba(18,20,26,0.55)`, borda `rgba(199,204,214,0.18)`, raio `20px`/`999px`). Julgamento pixel-level não disponível neste ambiente.
- **Gates finais:** `npx vitest run` **42 arquivos / 249 testes** (exit 0); `npm run typecheck`, `npm run lint`, `npx prettier --check .`, `npm run build` (Share/Studio/Control) e `npm audit --omit=dev` / `npm audit` — todos **exit 0**, **0 vulnerabilidades**.

**Não alterado nesta rodada:** `assertAdminSession` (fail-closed), `TrustedAdminSession`/`TrustedOwnershipAuthority` (marcas opacas, não simuladas), RLS/grants/validações. Operações administrativas de escrita do Bloco 6 continuam bloqueadas por ausência de backend e sessão administrativa legitimamente autenticada.

## Auditoria corretiva integral (2026-11-19 — verificação do ZIP corrigido)

Segunda rodada, executada sobre o ZIP `Hattz-2.0-CORRIGIDO-PARCIAL-2026-11-19.zip` como fonte de verdade (baseline importado `2b78101f15bd80713525fbd6f98ba8de42341bdc`). Relatório completo: `docs/RELATORIO-AUDITORIA-CORRETIVA-INTEGRAL-2026-11-19.md`.

- **Share:** vazamento de mensagem de erro interna removido; object URLs com conjunto por leitura e `dispose()` público; sequência única de visita por requisição (A→B→A) sem acesso a ref durante render; slug divergente rejeitado na fonte estática; estados terminais com `role="status" aria-live="polite"`. `tests/share`: **11 arquivos / 52 testes**, exit 0.
- **Studio:** troca de perfil A→B com token de carga e espera do autosave; flush de publicação sem janela de corrida; upload entre perfis com remoção do asset órfão; abas com padrão ARIA (roving `tabIndex`, setas/Home/End, `aria-controls`/`tabpanel`); confirmação destrutiva consumida em `finally`; fila local rotulada explicitamente sem "Sincronizando"; restore sem perfil ativo limpa a seleção; object URLs revogadas com mapa limpo; `deleteMediaAsset` cobre `pendingSyncOps.payload`; export/import com slug canônico obrigatório, limites técnicos de mídia **antes** de `atob()`, export validado e backup em transação `r`; `db_schema_version` alinhado ao schema atual. `tests/studio` (regressões): **14 testes**, exit 0.
- **Banco/validação:** migration aditiva `0014` corrige `btrim` → Unicode White_Space e `schemaVersion: 1.0` → inteiro numérico, sem editar `0009`/`0013`; índice de `0013` verificado por definição; orquestrador captura exit code com `System.Diagnostics.Process`; `71_grants_audit.sql` inclui `PUBLIC` e restringe a auditoria ao schema `public`; gerador de paridade ganhou `--verify` e gate no CI/`npm test`.
- **Evidência final:** `npm run typecheck`/`lint`/`format`/`test`/`build`, `npm audit` e `npm audit --omit=dev` — todos **exit 0**; **46 arquivos / 272 testes**, **0 vulnerabilidades**; `build_parity.mjs --verify` exit 0 (**71 casos**); harness PostgreSQL 17.12 em banco **novo e descartável** `hattz_phase2b_validation_9_audit_20261119` — exit 0, **38 etapas / 0 falhas**, **27 execuções de concorrência**. Ambiente: Node **v26.13.0**, npm **11.20.0**.
- **Integração de 19/11/2026 (estado corrente):** mesmos gates **exit 0**, com **46 arquivos / 276 testes**; paridade **75 casos**; harness em banco novo `hattz_validation_disposable_finalrun_20261119` — **exit 0, 38 etapas / 0 falhas**; aborto de banco existente **exit 65** sem modificações; cenários de segurança do orquestrador **exit 64/65/66** conforme contrato, nenhum banco apagado. Detalhes no §9 do relatório de auditoria corretiva.
- **Inalterado:** `assertAdminSession`, `TrustedAdminSession`, `TrustedOwnershipAuthority`, RLS/grants/validações; nenhum `SECURITY DEFINER`, `BYPASSRLS` ou autoridade administrativa local. Nenhum push, deploy, conexão Supabase, migration remota ou operação destrutiva fora dos bancos descartáveis.

**Pendências que permanecem:** autenticação administrativa real e escrita do Bloco 6; projeto Supabase real (Auth/JWT/PostgREST/Storage); catálogo autoritativo remoto; sincronização remota; política de slugs históricos/`reserved`/normalização; cotas editoriais de mídia (os limites implementados são técnicos, não decisão de produto).

## Diferenciação dos testes

1. **Testes TypeScript (executados):** validação de conteúdo/limites/extensibilidade, contratos/boundaries, persistência e falhas IndexedDB, utilitários/autorização. **Não comprovam** RLS em Supabase.
2. **Testes estruturais das migrations (executados):** inspeção estática de SQL/migrations. **Não comprovam** comportamento em runtime.
3. **Testes de comportamento SQL (executados):** execução das migrations, transições, integridade e validador em PostgreSQL 17.12 local descartável.
4. **Testes reais de RLS (executados em PostgreSQL local):** asserções sob papéis `anon`/`authenticated`/`service_role` em banco real/efêmero. **Estes validam RLS/privileges em runtime local.** Permanece pendente a semântica específica do Supabase (JWT/PostgREST/Storage).

As categorias 1 e 2 **não** são apresentadas como comprovação das categorias 3 e 4; a categoria 3/4 foi executada localmente conforme acima.

## Verificações executadas (gates locais)

Comandos executados via `cmd /c npm ...` (todos com código de saída registrado):

- `npx prettier --check .` — **PASS (exit 0)** (Prettier; equivalente a `npm run format`)
- `npm run lint` — **PASS (exit 0)** (ESLint)
- `npm run typecheck` — **PASS (exit 0)** (workspaces + `infrastructure/adapters` + `tsconfig.hub.json` + `tsconfig.tests.json`)
- `npx vitest run --reporter=dot` — **PASS (exit 0)** — Vitest v4.1.12, **42 arquivos, 249 testes aprovados** (execute 1: 13/59; entrega 2: 17/90; entrega 3: 22/117; entrega 4: 25/133; revisão conjunta: 27/152; **validação final: 42/249**). A execução com `2>&1 | Select...` no PowerShell pode reportar `Exit code: 1` por stderr; as linhas resumo e o exit do `cmd /c` registram 0.
- `npm run build` — **PASS (exit 0)** — Vite v7.3.8 (`@hattz/control`, `@hattz/share`, `@hattz/studio`); `dist/` descartável, fora do ZIP
- `npm audit --omit=dev` — **PASS (exit 0)** — **found 0 vulnerabilities** (produção)
- `npm audit` — **PASS (exit 0)** — **found 0 vulnerabilities** (inclui devDependencies; o achado histórico de 11 `high` dev-only não se reproduz mais)

## Riscos e pendências restantes

- **Pendência de ambiente alvo:** semântica específica do Supabase (Auth/JWT/PostgREST/Storage) não exercitada; requer ambiente Supabase autorizado e descartável. A `0012` é idempotente e apenas **garante o mínimo**; no Supabase real o `service_role` pode já ter privilégios de tabela padrão mais amplos (caveat específico do Supabase).
- **`npm audit` — resolvido:** reexecutado em 2026-11-19 com **0 vulnerabilidades** tanto em produção (`--omit=dev`) quanto com devDependencies. O achado histórico de 11 `high` dev-only não se reproduz mais (locks/dependências atuais). Mantido o gate de produção no CI.
- **Unicidade de slug (§7):** a unicidade **global** do slug atual (case-insensitive) é garantida por `ux_profile_slugs_slug_current` (`lower(slug) WHERE is_current = true`, `0002`); a regra "**um slug atual por perfil**" agora é garantida por `ux_profile_slugs_current_per_profile` (`0013`, **resolvida e testada**). Permanecem **decisão pendente do Owner**: política de slugs **históricos** (regra 2), proteção de slugs **`reserved`** (regra 4 — hoje um `reserved` pode reutilizar um slug atual) e algoritmo de **normalização** de entrada (regra 8 — o DB só aceita a forma canônica; a transformação é app-side). Não implementadas (sem regra de negócio aprovada).
- **Privilégios do escritor confiável (§4) — resolvido:** a `0012` codifica os grants mínimos **por coluna** do `service_role` (BEFORE: `SELECT` em snapshots só quando `state → 'published'`; AFTER: `SELECT`+`UPDATE` em publicações, incl. `UPDATE(is_publicly_visible)`), escopo restrito a duas tabelas, sem `SECURITY DEFINER`/`BYPASSRLS`. Provado em `82` (positivos `W1–W9`, negativos `N1–N7`, sem over-grant `G2`, ACL preservada `G3`). Falta apenas a validação no Supabase real (ambiente autorizado).
- **Refs de mídia em `content` JSON** sem FK relacional (validadas por formato/limites no contrato de snapshot).
- Migrations não executadas remotamente; sem roles/policies de serviço/contexto administrativo do Control.

## Referências

- `docs/database/SCHEMA.md`
- `infrastructure/supabase/policies/RLS_POLICIES.md`
- `docs/database/RLS_RUNTIME_TEST_STRATEGY.md`
- `docs/architecture/FOUNDATION.md`
- `docs/adr/ADR-003-banco-supabase-rls-isolamento.md`
- `docs/adr/ADR-004-persistencia-local-studio-indexeddb.md`
- `docs/RELATORIO-RODADA-6-2026-11-17.md` (relatório da rodada 6)
- `docs/RELATORIO-ENTREGA-1-SHARE-2026-11-18.md` (relatório da entrega 1 — Share funcional)
- `docs/RELATORIO-ENTREGA-2-STUDIO-2026-11-18.md` (relatório da entrega 2 — Studio funcional)
- `docs/RELATORIO-ENTREGA-3-PUBLICACAO-LOCAL-2026-11-18.md` (relatório da entrega 3 — publicação local)
- `docs/RELATORIO-ENTREGA-4-INTEGRACAO-LOCAL-2026-11-18.md` (relatório da entrega 4 — integração local)
- `docs/RELATORIO-REVISAO-CONJUNTA-2026-11-18.md` (relatório da revisão conjunta — correções + Liquid Glass + player)
- `docs/RELATORIO-FINAL-22-ITENS-2026-11-19.md` (**relatório final atual** — 22 itens, com os hashes dos commits locais e a localização do ZIP)
- `infrastructure/supabase/validation/README.md` (harness de validação local)

**Relatórios históricos:** os documentos acima de 2026-11-17/18 permanecem preservados como registro histórico; o `docs/RELATORIO-FINAL-22-ITENS-2026-11-19.md` é a **fonte atual** de estado, evidências e classificação.

**Aguardando avaliação e autorização explícita do Owner.** As Entregas 1 (Share funcional), 2 (Studio funcional), 3 (publicação local) e 4 (integração local) usam **fonte de dados e persistência locais** e **não** iniciam integração externa nem Fase 2B. A revisão conjunta incorporou as correções da cópia revisada do Owner (adotadas com testes de regressão), consolidou a identidade **Liquid Glass** e implementou o **player de música** (expandido + mini). A validação final anterior corrigiu as ressalvas da B4.2, implementou as correções locais autorizadas nos oito blocos, mantendo explícitas as pendências de integração real, corrigiu o slug publicado e o `robots.txt`, e reportou 249 testes, builds, auditorias, validação SQL/RLS local e inspeção em navegador. A auditoria independente posterior adicionou um teste de regressão de concorrência de mídia, executado e aprovado na auditoria corretiva integral (272 testes no total); a integração posterior elevou o total para **276 testes**. **Classificação: preparado para a próxima etapa de integração; não pronto para lançamento público.** Foram feitos commits **locais** (sem push); nenhum deploy, publicação ou operação remota foi realizada.
