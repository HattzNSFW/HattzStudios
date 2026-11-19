# Relatório — Hättz 2.0 (rodada 6, 2026-11-17)

> **Rodada 6 — "Resolução das pendências, hardening final e preparação para a próxima etapa".**
> Objetivo: resolver as pendências da auditoria anterior (grants do escritor confiável, integridade
> de slug, vulnerabilidades dev-only), executar a auditoria de segurança final das migrations
> `0001`–`0013` e a auditoria de aplicação (Share/Studio/Control), validar localmente, atualizar a
> documentação e entregar o relatório final.
>
> **Escopo respeitado:** sem commit, sem push, sem deploy, sem conexão ao Supabase, sem credenciais,
> sem `SECURITY DEFINER`, sem `BYPASSRLS`, sem dependências pagas/instalações globais, sem apagar/
> reconstruir o projeto, sem reduzir escopo/reescrever apps, sem iniciar a Fase 2B. Bancos de
> validação anteriores preservados; banco novo descartável (`hattz_phase2b_validation_6`).

Este relatório é **autossuficiente** e **substitui** a leitura isolada do relatório da rodada 5
(`docs/RELATORIO-CORRECOES-2026-11-17.md`), que permanece no repositório como histórico.

---

## A. Resumo

| Pendência da rodada 5                                | Situação nesta rodada                                                                                                                                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| §4 Grants do escritor confiável (`SECURITY INVOKER`) | **RESOLVIDO E TESTADO** — migration `0012` concede o conjunto mínimo **por coluna** ao papel server-side `service_role`; cada privilégio provado **necessário** por controle negativo. Supabase real permanece pendente. |
| §7 Unicidade de slug                                 | **Regra 1 (um slug atual por perfil) RESOLVIDA E TESTADA** (migration `0013`). Regras 2 (histórico), 4 (`reserved`) e 8 (normalização) — **PENDENTE DE DECISÃO DO OWNER** (documentadas, não implementadas).             |
| §F Vulnerabilidades dev-only                         | **NÃO RESOLVIDO (sem correção upstream)** — 11 `high` dev-only (`picomatch`); `--omit=dev` = **0**. Nenhuma correção segura existe; documentado.                                                                         |
| Auditoria de segurança final (`0001`–`0013`)         | **CONCLUÍDA (local)** — ver seção D. Sem novos privilégios sem justificativa.                                                                                                                                            |
| Auditoria de aplicação (Share/Studio/Control)        | **CONCLUÍDA (read-only)** — ver seção G. Nenhum backend ligado; apps são shells Fase 0–1.                                                                                                                                |

- **Validação local:** harness reproduzível aplicou as migrations `0001`–`0013` a um banco novo e
  descartável (`hattz_phase2b_validation_6`) e executou **35 passos / 0 falhas** (`=== ALL VALIDATION
STEPS PASSED ===`, exit 0).
- **Gates de aplicação:** `typecheck`, `lint`, `format`, `test` (38/38), `build` — **todos exit 0**;
  `npm audit --omit=dev` = 0; `npm audit` (full) = 11 `high` dev-only (sem correção).
- **Nenhuma Fase 2B iniciada.** Aguardando avaliação do Owner.

---

## B. Arquivos

### Criados nesta rodada

| Arquivo                                                                | Função                                                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `infrastructure/supabase/migrations/0012_trusted_writer_grants.sql`    | Grants mínimos (por coluna) do escritor confiável `service_role` para os triggers `SECURITY INVOKER`. |
| `infrastructure/supabase/migrations/0013_slug_current_per_profile.sql` | Índice único parcial: no máximo **um slug atual por perfil** (regra 1).                               |
| `infrastructure/supabase/validation/sql/82_trusted_writer_grants.sql`  | Teste formal positivo/negativo dos grants **aplicados** pela `0012`.                                  |
| `docs/RELATORIO-RODADA-6-2026-11-17.md`                                | Este relatório.                                                                                       |

### Alterados nesta rodada

| Arquivo                                                                                                                                                                                                                                     | Alteração                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `infrastructure/supabase/validation/sql/72_slug_integrity.sql`                                                                                                                                                                              | Reesrito: regra 1 agora **HARD** (índice `0013`); histórico/`reserved`/normalização marcados PENDING.      |
| `infrastructure/supabase/validation/sql/80_trusted_writer_privileges.sql`                                                                                                                                                                   | P10 agora compara a ACL pós-rollback com o **baseline da migration `0012`** (antes esperava "sem grants"). |
| `infrastructure/supabase/validation/sql/95_final_state.sql`                                                                                                                                                                                 | Novas asserções HARD de slug (`0002`+`0013`) e de grants do escritor (`0012`).                             |
| `infrastructure/supabase/validation/run_validation.ps1`                                                                                                                                                                                     | Rodada 6; `0001..0013`; DB/log `_6`; passos `99_reapply_0012/0013` e `82_trusted_writer_grants`.           |
| `infrastructure/supabase/validation/concurrency/90_concurrency.ps1`                                                                                                                                                                         | Padrão DB/log `_6`.                                                                                        |
| `DEVELOPMENT_STATUS.md`, `README.md`, `docs/database/SCHEMA.md`, `docs/database/RLS_RUNTIME_TEST_STRATEGY.md`, `infrastructure/supabase/policies/RLS_POLICIES.md`, `docs/adr/ADR-003-...md`, `infrastructure/supabase/validation/README.md` | Atualizados para a rodada 6.                                                                               |

> Os 22 arquivos modificados + untracked herdados da rodada 5 (incl. `0010`, `0011`, apps,
> `package-lock.json`, testes) foram **preservados sem alteração** por esta rodada.

---

## C. Migrations

Conjunto agora: **`0001`–`0013`** (todas aditivas; nenhuma migration anterior reescrita).

### `0012_trusted_writer_grants.sql` (nova)

- **Problema:** os triggers da `0010` são `SECURITY INVOKER`. No Supabase real, o escritor server-side
  (`service_role`) executaria `INSERT/UPDATE/DELETE` nas tabelas e as triggers só funcionariam se o
  **invocador** tivesse os privilégios de leitura/atualização cruzada exigidos. Nenhuma migration
  concedia isso.
- **Solução:** um bloco `DO` guardado por existência do papel (se `service_role` não existir, apenas
  emite `NOTICE` e não faz nada — ambiente sem Supabase não quebra). Concede:
  - `USAGE` no schema `public`;
  - **`profile_publications`** — `SELECT(id, profile_id, version, state, published_at, unpublished_at,
is_publicly_visible)`, `INSERT(id, profile_id, version, state, manifest_hash, manifest_ref,
published_at, unpublished_at, failure_reason)`, `UPDATE(profile_id, version, state, manifest_hash,
manifest_ref, published_at, unpublished_at, failure_reason, is_publicly_visible)`, `DELETE` (tabela);
  - **`profile_public_snapshots`** — `SELECT(id, publication_id, profile_id, version, visibility,
seo_title, seo_description, og_image_asset_id, content)`, `INSERT(…mesmas…)`,
    `UPDATE(publication_id, profile_id, version, visibility, seo_title, seo_description,
og_image_asset_id, content)`, `DELETE` (tabela).
- **Granularidade:** **por coluna** em tudo que o PostgreSQL permite; `DELETE` é concedido no nível da
  tabela (o PostgreSQL não tem `DELETE` por coluna). **Nenhum** privilégio de tabela inteira onde
  coluna basta. **Nenhum** privilégio em tabelas não relacionadas (provado: `G2`).
- **Garantias:** sem `SECURITY DEFINER`, sem `BYPASSRLS`, sem criar papéis, sem tocar
  `anon`/`authenticated`. Idempotente (GRANT é idempotente; reaplicação testada).
- **Comentário de coluna** registra que `is_publicly_visible` é derivada e só recebe `UPDATE` porque o
  trigger AFTER a recalcula.

### `0013_slug_current_per_profile.sql` (nova)

- **Problema:** não existia restrição de "um único slug atual por perfil".
- **Solução:** pré-checagem diagnóstica (falha com mensagem clara se já houver perfil com >1 slug
  atual; a migration roda em transação, então nada fica meio-aplicado) + índice único parcial
  `ux_profile_slugs_current_per_profile ON public.profile_slugs (profile_id) WHERE is_current = true`.
- **Escopo mínimo deliberado:** implementa **apenas** a regra 1. **Não** implementa histórico
  (regra 2), `reserved` (regra 4) nem transformação de normalização (regra 8) — decisões de negócio
  pendentes do Owner. Não altera policies/RLS/grants/triggers.

### Idempotência e reaplicação

O orquestrador reaplica `0012` e `0013` (`99_reapply_*`) num banco já migrado: **ambos exit 0**.
A `0011` continua com pré-checagem/idempotência por **definição** (`20`/`21`/`22`/`23`).

---

## D. Segurança

### D.1 Auditoria de segurança final das migrations `0001`–`0013` (local)

Verificado por catálogo/execução real (passos `70`, `71`, `40`, `95`, `82`):

- **RLS:** `ENABLE` + **`FORCE ROW LEVEL SECURITY`** em **34/34** tabelas de domínio (`public`,
  `hattz_admin`, `hattz_audit`). **5 policies** no total, todas restritivas e somente de `SELECT`
  pública.
- **Privilégios de tabela/coluna/schema/função para `anon`/`authenticated`:** apenas os **grants
  mínimos de coluna** exigidos pelas views `security_invoker` da `0009`; **nenhum** privilégio de
  escrita; `USAGE`/acesso a `hattz_admin`/`hattz_audit` negado; `EXECUTE` de funções internas negado
  (incl. validador). Auditoria de catálogo (`71`) reprova qualquer privilégio inesperado (HARD).
- **Views públicas:** `v_share_published_profiles`, `v_share_public_media` com
  `security_invoker=true, security_barrier=true` e projeção explícita; sob `anon`/`authenticated`
  retornam **somente** conteúdo publicado/público/ativo (só Alice no seed).
- **Triggers:** `0010` `SECURITY INVOKER` (`prosecdef=false`), `search_path` fixo
  (`pg_catalog, public`); `BEFORE`/`AFTER` validados em runtime; o flag derivado **não é forjável**
  (tentativa direta é sobrescrita pela trigger — `W8`).
- **Ausência de ciclo de policies:** grafo acíclico (flag derivado); confirmado em runtime sem
  `infinite recursion`.
- **Proteção do perfil oficial:** `profiles.is_official` sem grant público e sem policy que o exponha;
  nenhuma elevação/admin indireta para papéis públicos.
- **Sem bypass `PUBLIC`:** revogações amplas da `0008` (incl. `PUBLIC`) mantidas; nenhum privilégio
  público novo além do estritamente necessário às views.
- **`0012` não introduz risco:** escopo restrito a duas tabelas (`G2`), sem `SECURITY DEFINER`, sem
  `BYPASSRLS`, sem tocar papéis públicos; cada privilégio provado necessário (`N1`–`N6`).
- **Integridade:** FK composta `0011` presente (`95`); `og_image_asset_id` → `media_assets(id)` com
  `ON DELETE SET NULL`; invariante do flag derivado = **0 divergências**.

> **Caveat Supabase-específico:** `service_role` local é um **stand-in** com `BYPASSRLS`. No Supabase
> real, o `service_role` é pré-existente e pode já ter privilégios de tabela padrão mais amplos que os
> concedidos aqui; a `0012` apenas **garante o mínimo** e é idempotente. A semântica real (Auth/JWT/
> PostgREST/Storage) permanece **não validada** (requer ambiente autorizado).

### D.2 Decisão sobre o papel do escritor confiável

- Adotado `service_role` (papel **pré-existente** do Supabase; `BYPASSRLS` é decisão do Supabase, não
  introduzida por esta rodada). **Nenhuma migration cria papéis.**
- **Mínimo necessário** (provado): `SELECT` em `profile_public_snapshots` (só quando
  `state → 'published'`, por curto-circuito do `AND`) e `SELECT`+`UPDATE` em `profile_publications`
  (`FOR UPDATE` + `UPDATE(is_publicly_visible)`), **além** dos DML próprios. Preferido **por coluna**.
- **`anon`/`authenticated` não ganharam nenhum privilégio** (`N7`). Falhas não são mascaradas por
  superusuário: os testes negativos removem o grant e exigem `insufficient_privilege` real.

### D.3 Modelo de privilégio (evidência)

Passo `80` (modelo, grants temporários + rollback) e passo `82` (grants **aplicados** pela `0012`),
ambos **exit 0**:
`G1` grants mínimos presentes · `G2` sem over-grant · `W1–W9` todos os caminhos de escrita ·
`N1–N6` cada grant necessário · `N7` papéis públicos sem escrita · `I1` invariante ·
`G3` rollback restaura dados e preserva a ACL da `0012`.

---

## E. Slugs

Regras aprovadas e seu estado:

| Regra                                             | Estado nesta rodada                                                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1. Um slug atual por perfil                       | **IMPLEMENTADO E TESTADO** (`0013`; `72` HARD).                                                                |
| Unicidade **global** do slug atual (case-insens.) | Já garantida por `ux_profile_slugs_slug_current` (`0002`); reconfirmada (`72` HARD).                           |
| 2. Política de slugs **históricos**               | **PENDENTE DE DECISÃO DO OWNER** — não implementado (sem regra aprovada).                                      |
| 4. Proteção de slugs **`reserved`**               | **PENDENTE DE DECISÃO DO OWNER** — `72` demonstra que hoje um `reserved` pode reutilizar um slug atual.        |
| 8. **Normalização** de entrada                    | **PENDENTE DE DECISÃO DO OWNER** — o banco só **aceita** a forma canônica; transformar input bruto é app-side. |
| 3/5/6/7/9/10                                      | Verificadas como já cobertas pelo modelo (`0002`) / não aplicáveis.                                            |

**Evidência (`72`, exit 0):** índices presentes (`0002`+`0013`); slug atual duplicado **rejeitado**
(`unique_violation`); segundo slug atual para o mesmo perfil **rejeitado** (regra 1); troca atômica
(aposentar + ativar na mesma transação) termina com **exatamente um** slug atual; `reserved` reusando
slug atual **aceito** (PENDING documentado); rollback restaura o seed.

**Consequências das regras pendentes** (para decisão do Owner):

- _Histórico (regra 2):_ definir se slugs aposentados ficam permanentemente indisponíveis (evita
  "roubo" de links antigos) ou podem ser reutilizados após N dias; impacta unicidade global e UX.
- _`reserved` (regra 4):_ definir se `reserved` bloqueia o slug globalmente (impede que outro perfil o
  use) ou é apenas um marcador; hoje o índice parcial **não** cobre `reserved`.
- _Normalização (regra 8):_ definir o algoritmo de conversão de input bruto → forma canônica
  (minúsculas, transliteração, colapso de separadores); hoje o DB rejeita formas não canônicas e a
  transformação é responsabilidade da aplicação (ainda não implementada).

---

## F. Dependências (vulnerabilidades dev-only)

- `npm audit` (full) → **11 `high`**, **todas dev-only**; `npm audit --omit=dev` → **found 0
  vulnerabilities** (produção limpa).
- **Causa raiz única:** `picomatch` (GHSA-fc5q-39xc-vjpf, ReDoS), faixa vulnerável `<= 4.0.7`;
  instalado **4.0.7**. A **última versão publicada é 4.0.7** — ou seja, a versão vulnerável **é** a
  mais recente; **não existe 4.0.8**. **Não há correção upstream.**
- **Cadeias:** `vite@7.3.8` → `fdir`/`tinyglobby`/`picomatch`; `vitest@4.1.12` → `picomatch`/
  `tinyglobby`; `typescript-eslint@8.73.0` → `@typescript-eslint/*` → `typescript-estree` →
  `tinyglobby`. Todas ferramentas de build/teste (não enviadas à produção).
- **Ações rejeitadas e por quê:** `npm audit fix --force` instalaria `vite@6.2.7` (downgrade
  **major**); os `fixAvailable` apontam para versões **antigas/major**. Não foi aplicado force, não
  houve downgrade major, não se removeu ferramenta para "zerar" o audit.
- **Conclusão:** **NÃO RESOLVIDO — sem correção disponível**; risco restrito ao ambiente de
  desenvolvimento (ReDoS em globbing de ferramentas), **sem impacto em produção**.

---

## G. Aplicações (auditoria read-only — Share / Studio / Control)

> Auditoria de leitura contra os checklists das respectivas aplicações. Nenhuma alteração de código
> de app nesta rodada.

- **`apps/share`:** shell **estático** (Fase 0–1). Sem acesso a dados, sem roteamento, sem resolução
  de slug, sem mídia, sem estados de loading/erro. `@hattz/contracts`/`@hattz/core` declarados mas
  **não usados**; o adapter Supabase é um **stub que lança**. Tem apenas CSS responsivo e o shell.
- **`apps/studio`:** possui uma biblioteca de persistência local **real e testada** com Dexie
  (`createLocalDraftProfile`, `saveDraftSnapshot` com incremento atômico de versão,
  `enqueuePendingSyncOperation`), **porém não ligada à UI**. Sem publish/unpublish, sem wiring de
  validação, sem drenagem de fila de sync, sem editor.
- **`apps/control`:** placeholder **estático**, com **zero** lógica administrativa/auth/backend.

**Consequência:** nenhum app tem backend ligado; a validação de runtime cobre o **banco**, não os
fluxos de app (que pertencem à Fase 2B, não iniciada). Nada foi inventado nem removido.

---

## H. Testes

### H.1 Harness SQL (PostgreSQL 17.12 local, descartável)

- **Comando:** `powershell -ExecutionPolicy Bypass -File infrastructure/supabase/validation/run_validation.ps1 -Recreate`
- **Banco:** `hattz_phase2b_validation_6` (novo; `_`, `_2`, `_3`, `_4`, `_5` **preservados** — ver
  `95` listando os 6 bancos).
- **Resultado:** `=== 35 steps, 0 failed ===` / `=== ALL VALIDATION STEPS PASSED ===`;
  **ExitCode do orquestrador = 0**.
- **Logs:** `%LOCALAPPDATA%\Hattz-2.0-postgres\logs\phase2b_validation_6\` (`results.csv`,
  `*.out.log`/`*.err.log`, artefatos `90_conc_*`).

Passos com ExitCode (de `results.csv`):

| Passo                                      | ExitCode         | Passo                            | ExitCode |
| ------------------------------------------ | ---------------- | -------------------------------- | -------- |
| `00_createdb`                              | 0                | `30_validator_parity`            | 0        |
| `10_migration_0001..0013` (13)             | 0 (todos)        | `40_verify_0010_triggers`        | 0        |
| `99_reapply_0012`                          | 0                | `50_seed`                        | 0        |
| `99_reapply_0013`                          | 0                | `60_matrix_transitions`          | 0        |
| `20_verify_0011`                           | 0                | `70_access_matrix_anon`          | 0        |
| `23_0011_idempotency_before`               | 0                | `70_access_matrix_authenticated` | 0        |
| `21_0011_precheck_setup`                   | 0                | `71_grants_audit`                | 0        |
| `99_precheck_apply_0011 (expect non-zero)` | **3** (esperado) | `72_slug_integrity`              | 0        |
| `22_0011_precheck_after_failure`           | 0                | `80_trusted_writer_privileges`   | 0        |
| `99_precheck_apply_0011 (after cleanup)`   | 0                | `82_trusted_writer_grants`       | 0        |
| `23_0011_idempotency_after`                | 0                | `90_concurrency`                 | 0        |
|                                            |                  | `95_final_state`                 | 0        |

**Evidência-chave (NOTICEs):**

- `82`: `G1 OK`, `G2 OK`, `W2/W3/W4/W6/W8/W9 OK`, `N1..N7 OK`, `I1 OK`, `G3 OK`.
- `72`: índices OK; duplicado global rejeitado; regra 1 rejeitada; swap OK; `reserved` PENDING; seed
  restaurado.
- `95`: invariante do flag OK; `0011` presente; índices de slug OK; grants `0012` presentes;
  **34 tabelas / 5 policies / 34 FORCE RLS**.
- `90_concurrency`: **27 execuções (9 cenários × 3), 0 FAIL**; overlap comprovado por traço +
  `pg_stat_activity`; estado/flag conferidos contra alvo e predicado.
- Testes **falham de verdade** em condições inválidas: as asserções são `raise exception` (não
  dependem de texto de `NOTICE`), e os controles negativos exigem `insufficient_privilege`/
  `unique_violation`/`foreign_key_violation` reais. A pré-checagem da `0011` retorna exit 3 num banco
  legado divergente (comportamento esperado e verificado).

### H.2 Gates de aplicação

| Comando                | ExitCode | Evidência                                                       |
| ---------------------- | -------- | --------------------------------------------------------------- |
| `npm run typecheck`    | **0**    | workspaces + `infrastructure/adapters` + `tsconfig.tests.json`  |
| `npm run lint`         | **0**    | ESLint, sem erros                                               |
| `npm run format`       | **0**    | Prettier: "All matched files use Prettier code style!"          |
| `npm run test`         | **0**    | Vitest v4.1.12 — **8 arquivos, 38 testes aprovados**            |
| `npm run build`        | **0**    | Vite v7.3.8 — `@hattz/share`, `@hattz/studio`, `@hattz/control` |
| `npm audit --omit=dev` | **0**    | **found 0 vulnerabilities**                                     |
| `npm audit`            | **1**    | 11 `high` dev-only (`picomatch`); sem correção — ver seção F    |

---

## I. Git

| Item                                    | Inicial                                    | Final                                                                                 |
| --------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| HEAD                                    | `2ab007c08d88d5cb518c39db65736eaba32f86d8` | `2ab007c08d88d5cb518c39db65736eaba32f86d8` (**inalterado**)                           |
| Branch                                  | `main`                                     | `main`                                                                                |
| Commits por esta rodada                 | —                                          | **0** (sem commit/push)                                                               |
| Arquivos alterados                      | 22 modificados + untracked                 | 22 modificados + untracked (herdados) + **4 novos** (`0012`, `0013`, `82`, relatório) |
| `git reset --hard` / `clean` / `rebase` | —                                          | **não executados**                                                                    |

Todo o trabalho da rodada 5 foi **preservado**. Nenhum banco de validação anterior foi tocado. Nenhum
deploy/push/publicação.

---

## J. Conclusão

Classificação por item (com evidência; **sem** afirmação de sucesso sem prova):

| Item                                                | Classificação                                                                                                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **§4 Grants do escritor confiável (`0012`)**        | **RESOLVIDO E TESTADO** (local): grants mínimos por coluna, cada um provado necessário, escopo restrito, sem `SECURITY DEFINER`/`BYPASSRLS`, idempotente. |
| **§7 Regra 1 de slug (`0013`)**                     | **RESOLVIDO E TESTADO** (local).                                                                                                                          |
| **§7 Regras 2/4/8 de slug**                         | **PENDENTE DE DECISÃO DO OWNER** (documentadas; não implementadas).                                                                                       |
| **§F Vulnerabilidades dev-only**                    | **NÃO RESOLVIDO** (sem correção upstream; produção = 0).                                                                                                  |
| **Auditoria de segurança final (`0001`–`0013`)**    | **RESOLVIDO E TESTADO** (local); Supabase real **não validado**.                                                                                          |
| **Auditoria de aplicação (Share/Studio/Control)**   | **CONCLUÍDA** (read-only); apps são shells Fase 0–1 — implementação de fluxos **NÃO APLICÁVEL** nesta fase.                                               |
| **Validação local (migrations + harness + gates)**  | **RESOLVIDO E TESTADO** (35/35 passos; gates exit 0).                                                                                                     |
| **Semântica Supabase (Auth/JWT/PostgREST/Storage)** | **IMPLEMENTADO MAS NÃO VALIDADO** — requer ambiente autorizado e descartável.                                                                             |
| **Fase 2B**                                         | **NÃO INICIADA** (não concluída).                                                                                                                         |

**Resumo final:** as pendências que dependiam de decisão técnica inequívoca (grants mínimos do
escritor confiável; regra 1 de slug) foram **resolvidas, codificadas em migrations aditivas e
provadas** em PostgreSQL 17.12 local descartável, sem violar as restrições (sem `SECURITY DEFINER`,
sem `BYPASSRLS` introduzido, sem novas permissões públicas, sem conexão ao Supabase). As pendências
que dependem de **regra de negócio** (slugs histórico/`reserved`/normalização) foram **documentadas
como decisão do Owner**, não implementadas. As vulnerabilidades dev-only não têm correção upstream
segura. A validação específica do Supabase permanece pendente. **A Fase 2B não foi iniciada e a
classificação da Fase 2A não foi promovida.**

**Aguardando avaliação do Owner.** Nenhuma nova fase será iniciada automaticamente.
