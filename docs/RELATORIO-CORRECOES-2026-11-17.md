# Relatório de Correções — Hättz 2.0 (rodada 5, revisão 2026-11-17)

Rodada final de correção/auditoria/validação sobre a árvore de trabalho atual, respondendo aos 12
itens da revisão técnica (§1–§12). Cada correção traz o problema, a correção, o teste que a prova, o
comando executado com o código de saída e a evidência relevante.

Este relatório **substitui** a versão anterior de mesmo nome (rodada 4 / banco `_4`).

Referências comparadas: `Hattz-2.0-correcoes-revisao.zip` e `Hattz-2.0-revisao-A1-ii.zip`.
As afirmações de "BLOCKED / NÃO EXECUTADO" do ZIP `corr` **não** foram adotadas (o ambiente possui
gates reais aprovados e validação de runtime real); apenas as correções técnicas válidas foram
aproveitadas (FK composta de identidade, guardas SRF, `\b`→`\y`, testes/docs).

---

## 1. Estado Git (inicial e final)

| Item                           | Inicial                                    | Final                                      |
| ------------------------------ | ------------------------------------------ | ------------------------------------------ |
| Branch                         | `main`                                     | `main`                                     |
| HEAD                           | `2ab007c08d88d5cb518c39db65736eaba32f86d8` | `2ab007c08d88d5cb518c39db65736eaba32f86d8` |
| Commits adicionados            | 0                                          | **0**                                      |
| Arquivos em stage              | 0                                          | **0**                                      |
| Arquivos modificados (tracked) | —                                          | **22**                                     |
| Arquivos novos (untracked)     | —                                          | **29**                                     |

Comando: `git rev-parse HEAD`, `git diff --cached --name-only | Measure-Object`, `git diff --name-only`,
`git ls-files --others --exclude-standard`. Nenhuma alteração preexistente da árvore de trabalho foi
sobrescrita, removida ou reformatada fora do necessário.

**Confirmação explícita:** nenhum `commit`, `push`, `deploy`, `reset`, `clean`, `rebase`, `amend` ou
`squash`; nenhuma conexão ao Supabase; nenhuma operação em bancos de validação anteriores; nenhuma
credencial criada/alterada; nenhuma Fase 2B iniciada.

## 2. Arquivos modificados e novos (exatos)

**Modificados (22):**

1. `DEVELOPMENT_STATUS.md`
2. `README.md`
3. `apps/studio/src/persistence/repository.ts`
4. `docs/adr/ADR-003-banco-supabase-rls-isolamento.md`
5. `docs/adr/ADR-004-persistencia-local-studio-indexeddb.md`
6. `docs/architecture/FOUNDATION.md`
7. `docs/database/RLS_RUNTIME_TEST_STRATEGY.md`
8. `docs/database/SCHEMA.md`
9. `infrastructure/supabase/migrations/0002_profiles_and_publications.sql`
10. `infrastructure/supabase/migrations/0003_media_storage.sql`
11. `infrastructure/supabase/migrations/0009_hardening_public_views_and_snapshot_validation.sql`
12. `infrastructure/supabase/policies/RLS_POLICIES.md`
13. `package-lock.json`
14. `package.json`
15. `packages/validation/src/index.ts`
16. `packages/validation/src/publishableSnapshot.ts`
17. `tests/authorization/authorization.test.ts`
18. `tests/integrity/schema.integrity.test.ts`
19. `tests/isolation/data-isolation.test.ts`
20. `tests/persistence/studio-idb.persistence.test.ts`
21. `tests/validation/publishable-snapshot.test.ts`
22. `vitest.config.ts`

**Novos (29):**

- Migrations: `infrastructure/supabase/migrations/0010_public_read_visibility_fix.sql`,
  `infrastructure/supabase/migrations/0011_snapshot_publication_identity_integrity.sql`
- Harness reproduzível: `infrastructure/supabase/validation/README.md`,
  `run_validation.ps1`, `concurrency/90_concurrency.ps1`, `parity/build_parity.mjs`,
  `sql/{00_preflight,20_verify_0011,21_0011_precheck_setup,22_0011_precheck_after_failure,23_0011_idempotency,30_validator_parity,40_verify_0010_triggers,50_seed,60_matrix_transitions,70_access_matrix,71_grants_audit,72_slug_integrity,80_trusted_writer_privileges,95_final_state}.sql`,
  `workers/{81_worker_state,82_worker_vis,83_worker_insert_snapshot,84_worker_delete_snapshot,85_worker_move_publication}.sql`
- Testes/paridade: `tests/fixtures/publishable-snapshot-parity.json`,
  `tests/validation/publishable-snapshot-parity.test.ts`, `tsconfig.tests.json`
- Este relatório: `docs/RELATORIO-CORRECOES-2026-11-17.md`

## 3. Problemas e correções por item da revisão

### §1 — Preservação e restrições

**Problema:** risco de sobrescrever alterações preexistentes da árvore.
**Correção:** inspeção de `git status`/`git diff`/HEAD e dos arquivos envolvidos **antes** de editar;
edições cirúrgicas; alterações preexistentes (ex.: `0002`/`0003`/`0009`, `repository.ts`, testes)
preservadas.
**Prova:** `git diff` final contém as correções da revisão **mais** o trabalho anterior, sem remoções
indevidas. **Comando:** `git status --short`; `git diff --stat` → exit 0.

### §2 — Driver de concorrência (falso positivo)

**Problema:** o driver anterior podia reportar PASS sem de fato observar sobreposição nem conferir os
estados finais, e não checava o código de saída de cada processo.
**Correção** (`infrastructure/supabase/validation/concurrency/90_concurrency.ps1`):

- verifica **cada** exit code dos workers; falha (e o script sai não-zero) em qualquer
  falha/timeout/estado errado;
- redireciona **stdout e stderr separadamente** por worker;
- **prova** a sobreposição (traço com intervalos `begin/end` por transação **e** amostragem de
  `pg_stat_activity`);
- compara o estado final de `profile_publications.state` **e** de
  `profile_public_snapshots.visibility` aos alvos do cenário;
- compara o flag derivado ao alvo **e** ao predicado recomputado;
- mantém os **6 cenários originais** e adiciona **INSERT / DELETE de snapshot** e **mudança de
  `publication_id`** (9 cenários), repetindo com **ordem alternada**.

**Prova / evidência:** `90_concurrency_summary.log` — **27 execuções (9 cenários × 3), todas PASS**;
exemplo: `S7_r1 order=A,B exitA=0 exitB=0 overlap=True maxBoth=2 maxConc=2 lockWait=True
state=published vis=public pred=t ... result=PASS`. Traço de sobreposição real
(`90_conc_S1_r1_trace.log`): `A|1794966161.455781|1794966163.498169` e
`B|1794966162.081962|1794966165.546846` — intervalos **se sobrepõem** (A e B ativos simultaneamente).
**Comando:** `run_validation.ps1 -Recreate` (passo `90_concurrency`) → exit 0.

### §3 — Integridade de identidade (`0011`)

**Problema:** `profile_public_snapshots` tinha apenas FK simples de `publication_id`; um snapshot podia
combinar a publicação de um perfil com `profile_id`/`version` de outro.
**Correção** (`0011_snapshot_publication_identity_integrity.sql`): chave candidata
`unique (id, profile_id, version)` em `profile_publications` + FK composta
`(publication_id, profile_id, version) → (id, profile_id, version)` `ON DELETE RESTRICT`; a FK simples
legada é removida **por definição** (detecção por catálogo); pré-checagem diagnóstica para bancos
legados; idempotência por **definição**, não por nome.
**Prova (hard-fail, só `foreign_key_violation` conta como rejeição esperada):**
`20_verify_0011.err.log`:

```
0011: candidate key (id, profile_id, version): OK
0011: composite identity FK exact match: OK
0011: legacy single-column FK absent: OK
0011: identity columns NOT NULL: OK
N1 OK: valid identity insert persisted
N2 OK: cross-profile snapshot rejected by identity FK
N3 OK: wrong-version snapshot rejected by identity FK
N4 OK: snapshot profile_id mismatch rejected by identity FK
N5 OK: snapshot version mismatch rejected by identity FK
N5b OK: snapshot publication_id mismatch rejected by identity FK
N7 OK: publication version change inconsistent with snapshot rejected by identity FK
N7b OK: publication profile_id change inconsistent with snapshot rejected by identity FK
N8 OK: NULL publication_id/profile_id/version rejected (not_null_violation)
N6 OK: identity-preserving update persisted
20_verify_0011: all identity-integrity expectations met
```

As três colunas de identidade são **`NOT NULL`** → a FK composta **não** pode ser burlada via NULL
(N8 prova `not_null_violation`). Pré-checagem: `21_0011_precheck_setup.err.log` → "legacy-like state
with 1 mismatched snapshot ready: OK"; aplicação com dados divergentes **falha** (exit 3 registrado
como esperado em `results.csv`: `"99_precheck_apply_0011 (expect non-zero)","3","True"`); após limpeza
aplica com exit 0; `22_0011_precheck_after_failure.err.log` → "failed migration rolled back cleanly:
OK". Idempotência: `23_0011_idempotency_{before,after}.err.log` → "candidate key = 1, identity FK = 1:
OK" (mesma definição antes/depois). **Comando:** `run_validation.ps1 -Recreate` → exit 0.

### §4 — Triggers `0010` e privilégios do escritor confiável

**Investigação:** os dois triggers (`sync_publication_visibility`, `sync_snapshot_parent_visibility`)
são `SECURITY INVOKER` (verificado: `40_verify_0010_triggers.err.log` → "trigger functions are
SECURITY INVOKER with search_path: OK"). Em runtime foi **provado** o modelo de privilégios do
escritor confiável com privilégios mínimos e controles negativos (`80_trusted_writer_privileges`):

- trigger **BEFORE** `sync_publication_visibility` precisa de **`SELECT` em
  `profile_public_snapshots`** — e **somente** quando `state → 'published'` (o predicado é
  `(state='published') AND EXISTS(...)`, com curto-circuito do `AND`):
  `P0 OK: BEFORE trigger correctly requires invoker SELECT on snapshots (state -> published)`;
  `P0c OK: state -> draft did not read snapshots (AND short-circuit)`.
- trigger **AFTER** `sync_snapshot_parent_visibility` precisa de **`SELECT + UPDATE` em
  `profile_publications`** (`FOR UPDATE`): `P0b OK: AFTER trigger correctly requires invoker UPDATE on
publications`.
- o flag é mantido em **todos** os caminhos (INSERT/UPDATE/DELETE de snapshot e mudança de
  `publication_id`): `P1..P8 OK`, `P9 OK: flag invariant holds under the minimally-privileged trusted
writer`; ACL inalterada (`P10 OK: ACL unchanged after rollback`).
- `anon`/`authenticated` **não** executam os triggers nem forjam o flag
  (`70_access_matrix_*.err.log`: `EXEC_sync_publication_visibility: denied (OK)`,
  `WRITE_derived_flag: denied (OK)`).
- sem `SECURITY DEFINER` e sem bypass de RLS (`40_verify_0010_triggers.err.log`).

**Não foi adicionada nenhuma migration de grants** (não introduzimos bypass). Codificar os privilégios
do escritor confiável numa migration é **decisão pendente do Owner** (§8).

> **Limitação declarada:** a validação usou o papel local `service_role` como _stand-in_ do escritor
> server-side. Isso **não** prova equivalência com o Supabase real (Auth/JWT/PostgREST/Storage), cuja
> semântica permanece pendente de ambiente autorizado.

### §5 — Validador `0009` (paridade SQL↔TS)

**Problema:** divergências TS↔SQL (fronteira de palavra `\b`, profundidade de `props`, limite de
`schemaVersion`, contagem de comprimento de string) e ausência de prova de equivalência.
**Correção:**

- `0009`: padrão `token(?!s\b)` → `token(?!s\y)` (`\b` em PostgreSQL é _backspace_, não fronteira);
  chamadas de SRF de JSON protegidas por `CASE when jsonb_typeof(...) = 'object'/'array' ...`;
  `enforce_publishable_snapshot()` agora rejeita explicitamente qualquer coisa que não seja `true`
  (`if ... is not true then raise`) — defensivo mesmo que a coluna venha a ser `NOT NULL`;
  `schemaVersion` limitado a `::numeric` 1..9007199254740991.
- `packages/validation/src/publishableSnapshot.ts`: `charLength()` conta **code points** (igual a
  `length()` do PG); `schemaVersion` validado com `Number.isSafeInteger`; profundidade de `props`
  alinhada ao SQL (origem 1→5).

**Prova (paridade real):** `infrastructure/supabase/validation/parity/build_parity.mjs` gera **uma
única** fixture (`tests/fixtures/publishable-snapshot-parity.json`, 67 casos) consumida pelos dois
lados: TS (`tests/validation/publishable-snapshot-parity.test.ts`) e SQL
(`sql/30_validator_parity.sql`). Evidência SQL: `30_validator_parity.err.log` →
`PARITY OK: 67 cases matched expected result`. Evidência TS: `npm run test` inclui
`publishable-snapshot-parity.test.ts` (PASS). **Comando:** `node .../build_parity.mjs` (regenera) +
`npm run test` + passo `30_validator_parity` → exit 0.

**Sobre `new.content` NULL:** a coluna de conteúdo é tratada pelo validador/trigger; se vier `NULL`, o
trigger `enforce_publishable_snapshot()` rejeita (não é `true`), e o validador TS rejeita entrada não
objeto. (A coluna `NOT NULL` estrutural é documentada onde aplicável; o trigger permanece defensivo.)

### §6 — Grants / RLS / views

**Auditoria efetiva** (`71_grants_audit.err.log`), não apenas consultas de superusuário:

```
grants: no table-level write grants: OK
grants: no column-level write grants: OK
grants: table-level SELECT = the two public views: OK
grants: column-level SELECT set exact: OK
grants: admin/audit schemas not usable by public roles: OK
grants: internal functions not executable by public roles: OK
grants: no privileged memberships: OK
grants: public views are security_invoker + security_barrier: OK
grants: public view projections exact: OK
grants: is_publicly_visible is read-only for public roles: OK
```

Matriz de acesso **executada de verdade** como `anon` e `authenticated`
(`70_access_matrix_anon.err.log` / `..._authenticated.err.log`): apenas o perfil publicado/público
(Alice) é visível nas views e nas tabelas com grant; leituras de `profiles`/admin/audit/agregados
negadas; escritas negadas (incl. tentar forjar `is_publicly_visible`); funções internas não
executáveis; **sem recursão de RLS** (`A1..A7 OK`, `READ_*: denied`, `WRITE_*: denied`, `EXEC_*:
denied`). Views `v_share_published_profiles` e `v_share_public_media`: `security_invoker=true`,
`security_barrier=true`, projeção explícita sem campos internos. **Comando:**
`run_validation.ps1 -Recreate` (passos `70`, `71`) → exit 0.

### §7 — Integridade de slug (decisão pendente)

**Investigação** (`72_slug_integrity.err.log`): a unicidade **global** do slug atual (case-insensitive)
é garantida por `ux_profile_slugs_slug_current` (`lower(slug) WHERE is_current = true`) →
`slug: duplicate current slug rejected (global uniqueness enforced): OK`. Porém:

- **`slug PENDING: a second current slug for profile Dave was ACCEPTED`** — não existe restrição de
  **um único slug atual por perfil**;
- **`slug PENDING: a reserved row reusing an existing current slug was ACCEPTED`** — slugs `reserved`
  **não** são cobertos pelo índice parcial (apesar do comentário "atual/reservado" em `0002`).

Nenhuma regra de domínio aprovada define essas restrições → **não implementadas**; apresentadas como
**decisão pendente do Owner**. (A policy usa `EXISTS`, então não há exposição indevida.)

### §8 — Testes e gates

Correções de teste para que falhas reais **falhem o processo** (sem falso-positivo):

- `tests/integrity/schema.integrity.test.ts` — atualizado para o `0011` baseado em definição, com
  asserções de `NOT NULL` e da pré-checagem;
- `tests/authorization/authorization.test.ts` — asserção real (não tautológica);
- `tests/isolation/data-isolation.test.ts`, `tests/persistence/studio-idb.persistence.test.ts`,
  `tests/validation/publishable-snapshot.test.ts` — endurecidos;
- `tests/validation/publishable-snapshot-parity.test.ts` — guarda anti-fixture-vazia (exige >50 casos
  e ids únicos).

**Resultados reais dos gates (comandos executados nesta rodada):**

| Gate             | Comando                | Resultado                                                                 | Exit |
| ---------------- | ---------------------- | ------------------------------------------------------------------------- | ---- |
| Formatação       | `npm run format`       | **PASS** — "All matched files use Prettier code style!"                   | 0    |
| Lint             | `npm run lint`         | **PASS**                                                                  | 0    |
| Typecheck        | `npm run typecheck`    | **PASS** — workspaces + `infrastructure/adapters` + `tsconfig.tests.json` | 0    |
| Testes           | `npm run test`         | **PASS** — Vitest v4.1.12, **8 arquivos, 38 testes**                      | 0    |
| Build            | `npm run build`        | **PASS** — Vite v7.3.8 (`control`, `share`, `studio`)                     | 0    |
| Auditoria (prod) | `npm audit --omit=dev` | **PASS** — **0 vulnerabilidades**                                         | 0    |
| Auditoria (dev)  | `npm audit`            | 11 `high` (tooling dev-only) — não corrigido (ver §8/limitações)          | 1    |

### §9 — Migrations / PostgreSQL

Validação em **nova** instância descartável: banco `hattz_phase2b_validation_5` (owner
`hattz_pg_admin`), migrations `0001`→`0011` aplicadas **em ordem** com `psql -v ON_ERROR_STOP=1`.
Bancos `hattz_phase2b_validation`, `_2`, `_3`, `_4` **preservados**.

**Resultado:** `results.csv` → **30 passos, 0 falhas**; `orchestrator_console.log` →
`=== ALL VALIDATION STEPS PASSED ===`; **exit 0**. Cobriu: aplicação sequencial; FORCE RLS (34/34);
matriz `anon`/`authenticated`/`service_role`; policies/grants; views; triggers; FK composta; integridade
de slug; transições de publicação; concorrência; rejeição de operações indevidas; ausência de recursão.

Nenhuma falha exigiu auto-correção do banco para "fazer os testes passarem".

### §10 — Documentação

Ambiguidade eliminada entre (a) validação de runtime em PostgreSQL local, (b) status formal da Fase 2A
e (c) validação no Supabase real (ainda pendente):

- `DEVELOPMENT_STATUS.md`, `README.md`, `docs/architecture/FOUNDATION.md`,
  `docs/database/SCHEMA.md`, `docs/database/RLS_RUNTIME_TEST_STRATEGY.md`,
  `infrastructure/supabase/policies/RLS_POLICIES.md`, `docs/adr/ADR-003-...md` — atualizados para
  `hattz_phase2b_validation_5`, 9 cenários × 3 (27 execuções), 8 arquivos/38 testes, e as decisões
  pendentes de §4 e §7; deixam explícito que **a semântica do Supabase real permanece pendente**.
- Novo `infrastructure/supabase/validation/README.md` — pré-requisitos, uso, estrutura, cobertura por
  item e armadilhas (PowerShell 5.1, `Start-Process -PassThru`, `\b` vs `\y`).

### §11 — Encerramento

Nenhum critério de bloqueio se mantém em aberto de forma não declarada: testes não falseiam
(§2/§8); a FK composta **não** é burlável por NULL (§3, colunas `NOT NULL`); o modelo de privilégios
dos triggers está **provado** e os grants não codificados são **decisão pendente declarada** (§4); a
matriz de grants foi auditada (§6); a paridade SQL↔TS está **provada** (§5); as migrations aplicam
limpo (§9); os gates de app passam (§8).

---

## 4. Classificação das correções

### 4.1 Corrigidas **e validadas em runtime** (PostgreSQL local descartável)

- §2 Driver de concorrência (27/27, overlap provado).
- §3 Integridade de identidade `0011` (N1–N8, pré-checagem, idempotência por definição).
- §4 Modelo de privilégios dos triggers `0010` (privilégios mínimos + controles negativos).
- §5 Paridade SQL↔TS do validador (67 casos, TS + SQL).
- §6 Grants/RLS/views (matriz `anon`/`authenticated`, auditoria de catálogo, views).
- §8 Testes endurecidos + gates de app.

### 4.2 Corrigidas **sem** validação de runtime

- Ajustes de documentação (§10) — verificados apenas por leitura/consistência.
- Alterações preexistentes preservadas em `0002`/`0003`/`repository.ts`/testes — não re-executadas
  isoladamente nesta rodada (cobertas indiretamente pelo harness e pelos gates).

### 4.3 Pendentes de decisão do Owner

- **§4** — codificar numa migration os grants do escritor confiável (`SELECT` em
  `profile_public_snapshots`; `SELECT + UPDATE` em `profile_publications`), em vez de depender de
  provisionamento externo.
- **§7** — restrição de **um único slug atual por perfil** e proteção de slugs `reserved`.

### 4.4 Não corrigidas (com justificativa)

- **§7** (regras de slug acima) — nenhuma regra de domínio aprovada as define; inventar regra é
  proibido.
- **`npm audit` dev-only (11 `high`)** — exigem downgrades semver-major em tooling de build/teste;
  produção = 0; não forçado.
- **Semântica Supabase real (Auth/JWT/PostgREST/Storage)** — sem ambiente/credenciais autorizados.

---

## 5. Limitações e riscos residuais

- **Local vs Supabase real:** toda a validação de runtime usou PostgreSQL 17.12 **local**; os papéis
  `anon`/`authenticated`/`service_role` são _stand-ins_ e **não** são equivalentes ao Supabase
  Auth/JWT/PostgREST/Storage. Isso **não** prova o comportamento do Supabase real.
- **`npm audit` (dev-only):** 11 `high` em tooling (`picomatch`, `tinyglobby`, `fdir`,
  `@typescript-eslint/*` via vite/vitest); produção = 0; não forçado (downgrades major).
- **Slug (§7):** unicidade global do slug atual garantida; um-por-perfil e `reserved` pendentes.
- **Privilégios do escritor confiável (§4):** dependem de provisionamento; codificação pendente.
- **Refs de mídia em `content` JSON** validadas por formato/limites, sem FK relacional.

## 6. Confirmação final

- **Sem commit / push / deploy / conexão externa** nesta rodada.
- HEAD permanece `2ab007c08d88d5cb518c39db65736eaba32f86d8`; branch `main`; **0 commits**; **0** em
  stage.
- Bancos de validação anteriores (`hattz_phase2b_validation`, `_2`, `_3`, `_4`) **preservados**;
  validação feita em `hattz_phase2b_validation_5`.
- Nenhum `SECURITY DEFINER`, nenhum `BYPASSRLS` extra, nenhum bypass de RLS introduzido (ADR-003
  respeitado).

**Aguardando avaliação e autorização explícita do Owner. Nenhuma integração externa ou Fase 2B foi
iniciada.**
