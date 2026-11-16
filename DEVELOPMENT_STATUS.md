# Hättz 2.0 — Development Status

## Estado atual

- **Fases concluídas (nesta entrega):** 0, 1 e **2A — preparação local da infraestrutura e dos dados** (conforme aprovação)
- **Etapa complementar concluída (nesta entrega):** **Hardening/revisão da Fase 2A (pré-2B)** — revisão de segurança de leitura pública, snapshots, migrations/RLS, isolamento administrativo, testes e documentação
- **Data:** 2026-11-16
- **Branch:** `main`
- **Próxima etapa:** aguardar avaliação/aprovação para iniciar **Fase 2B** (não iniciada)

## Decisões e restrições respeitadas (Fase 2A + hardening)

- Banco modelado para **projeto Supabase (PostgreSQL) inteiramente novo**; migrations SQL versionadas em `infrastructure/supabase/migrations/` (`0001`–`0009`).
- **Sem criação/conexão de projeto Supabase**, sem execução de migrations em bancos remotos, sem credenciais externas, sem deploy/publicação/serviços externos, sem acesso a bancos/projetos antigos.
- **Cargo público Owner não concede acesso automático ao Hättz Control** (domínios/admin isolados; sem implementação de autenticação administrativa própria).
- **Isolamento:** dados locais (Studio/IndexedDB) ≠ publicados (Share/interfaces públicas) ≠ administrativos/auditoria (`hattz_admin`, `hattz_audit`).
- **Share nunca consulta rascunhos ou dados privados**: sem acesso direto a tabelas base para anon/authenticated; leitura pública somente via **views seguras com campos explicitamente permitidos** e filtros de conteúdo efetivamente publicado.
- **Studio funciona localmente sem conta ou conexão** (base Dexie/IndexedDB).
- **IDs técnicos permanentes e independentes** de nomes/slugs públicos.
- Sem dados fictícios apresentados como dados reais; sem tabelas/permissões sem finalidade documentada; sem policies RLS permissivas para facilitar testes.

## Hardening Fase 2A — problemas encontrados e correções

1. **Leitura pública direta em tabelas base (exposição potencial de colunas internas)**
   - **Problema:** `0008` anterior concedia SELECT público direto em `profile_public_snapshots`, `profiles`, `profile_slugs`, `profile_publications`, `media_assets`, `media_variants` com policies, o que podia expor colunas internas/administrativas/técnicas desnecessárias.
   - **Correção:** `0008` reescrita para **habilitar e forçar RLS** em todas as tabelas modeladas, **revogar privilégios diretos** de `anon/authenticated` em tabelas base e revogar `USAGE` em `hattz_admin`/`hattz_audit`, sem policies públicas diretas. `0009` introduz **views seguras explícitas** `v_share_published_profiles` e `v_share_public_media` (apenas campos permitidos, filtros `published/public/active`, `security_barrier`, grants SELECT mínimos). Share passa a consumir interfaces públicas mínimas.

2. **Snapshot publicável sem schema/validação explícita e recursiva no banco**
   - **Problema:** `content jsonb` aceitava estrutura arbitrária; risco de campos privados/admin/credenciais/rascunhos/internos chegarem à camada pública.
   - **Correção:** criado `packages/validation/src/publishableSnapshot.ts` (schema explícito + varredura recursiva de chaves proibidas/desconhecidas) e exportado em `@hattz/validation`. `0009` adiciona `public.validate_publishable_snapshot_content(jsonb)` e trigger `trg_validate_publishable_snapshot` (`BEFORE INSERT/UPDATE` em `public.profile_public_snapshots`) para bloquear conteúdo/visibilidade inválidos no banco.

3. **Higiene de funções e privilégios de execução**
   - **Problema:** funções sem hardening explícito de `search_path`/EXECUTE.
   - **Correção:** `0001` hardenada (`set_updated_at` com `set search_path = pg_catalog, public`, `REVOKE/GRANT EXECUTE` mínimos). Funções de validação/enforcement em `0009` com `search_path` fixo e privilégios revogados de `public`.

4. **Contratos/adapters alinhados ao modelo público anterior**
   - **Problema:** contrato público expunha `profileTechnicalId` e leitura direta presumida.
   - **Correção:** `PublishedProfileSnapshotContract` ajustado para campos explícitos da view pública (slug, versão, datas/SEO, content) sem IDs internos sensíveis; adicionado contrato de mídia pública mínima e adapter boundary planejado correspondente (ainda sem conexão).

5. **Testes insuficientes para exposição indevida, snapshot inválido e falhas de IndexedDB**
   - **Correção:** atualizados `tests/isolation/data-isolation.test.ts` e `tests/integrity/schema.integrity.test.ts` para o modelo hardened (RLS/force/revokes/views/trigger/sem policies públicas). Adicionados `tests/validation/publishable-snapshot.test.ts` (negativos recursivos: chaves proibidas/privadas/admin/credenciais/draft/internas, chaves desconhecidas/estrutura inválida) e `tests/persistence/studio-idb-failure.test.ts` (duplicidade/idempotência, meta ausente/stale, falha com DB fechado).

## Migrations alteradas/criadas (hardening)

- **Alterada:** `infrastructure/supabase/migrations/0001_foundation_extensions.sql` — hardening de `set_updated_at()` (`search_path`, `revoke/grant execute`).
- **Alterada (reescrita):** `infrastructure/supabase/migrations/0008_rls_policies.sql` — RLS enable+force, revogações de privilégios diretos em tabelas/schemas, sem policies públicas diretas.
- **Criada:** `infrastructure/supabase/migrations/0009_hardening_public_views_and_snapshot_validation.sql` — `validate_publishable_snapshot_content`, `enforce_publishable_snapshot` + trigger, views seguras `v_share_published_profiles`/`v_share_public_media`, grants mínimos.
- **Revisadas (sem alteração de DDL nesta etapa):** `0002`–`0007` — relacionamentos, constraints, unicidade, índices, histórico e comportamento de exclusão avaliados; padrão predominante `ON DELETE RESTRICT` para integridade/histórico com cascades pontuais apropriados; referências administrativas lógicas mantêm isolamento de schema. Observação: `og_image_asset_id` sem FK explícita (risco/ajuste fino futuro). **Nenhuma migration executada remotamente.**

## Segurança das migrations e RLS (revisão)

- Grants/schemas/tabelas/funções/triggers/views revisados: funções com `search_path` fixo e EXECUTE restrito; `anon/authenticated` sem privilégios diretos em tabelas base e sem acesso a `hattz_admin`/`hattz_audit`.
- **SECURITY DEFINER:** não introduzido explicitamente; views públicas definidas como interface mínima com `security_barrier` e grants restritos. Comportamento exato de owner/definer/invoker e RLS sob papéis Supabase deve ser **validado em runtime** no ambiente alvo autorizado (estratégia preparada).
- Nenhuma permissão excessiva identificada nas definições estáticas revisadas; acesso admin/serviço permanece não concedido.

## Isolamento administrativo (Control)

- Owner público permanece separado da autenticação administrativa; fronteira Control documentada em `RLS_POLICIES.md`/`SCHEMA.md`/ADR-003.
- **Não implementada autenticação própria**; sem acesso administrativo genérico; estruturas admin/recovery/sessão permanecem planejadas (hashes/fingerprints).

## Persistência IndexedDB — revisão de falhas

- Verificados/versionados: schema/meta `db_schema_version`, stores v1 e operações transacionais de snapshot.
- Cenários de falha cobertos por testes: duplicidade de operação (idempotência/erro explícito), meta de migração ausente/stale (`isReady=false`), operação com DB fechado (falha explícita). Sem sobrescrita silenciosa observada nos fluxos cobertos.

## Estratégia de testes RLS em PostgreSQL real (preparada, não executada)

- Documentada em `docs/database/RLS_RUNTIME_TEST_STRATEGY.md`: banco efêmero autorizado, aplicação de migrations `0001`–`0009`, asserções como `anon/authenticated` (negação em tabelas base/schemas, leitura apenas via views filtradas), validação de trigger de snapshot e casos de não exposição. **Não afirmar validação runtime enquanto não executada.**

## Testes novos/atualizados e resultados reais (hardening)

- **Atualizados:** `tests/isolation/data-isolation.test.ts`, `tests/integrity/schema.integrity.test.ts`, `tests/authorization/authorization.test.ts` (inalterado em comportamento, mantido), `tests/persistence/studio-idb.persistence.test.ts` (mantido).
- **Novos:** `tests/validation/publishable-snapshot.test.ts`, `tests/persistence/studio-idb-failure.test.ts`.
- **Resultados reais (executados):**
  - `cmd /c "npm run format:write"` — **APROVADO** (arquivos formatados conforme padrão).
  - `cmd /c "npm run lint"` — **APROVADO**.
  - `cmd /c "npm run typecheck"` — **APROVADO** (workspaces + `infrastructure/adapters`).
  - `cmd /c "npm run test"` — **APROVADO** — Vitest v4.1.12: **7 arquivos**, **23 testes aprovados**.
  - `cmd /c "npm run build"` — **APROVADO** — Vite v7.3.8: builds de `@hattz/control`, `@hattz/share`, `@hattz/studio`.
  - `cmd /c "npm audit"` — **APROVADO** — **`found 0 vulnerabilities`**.

## Documentação e ADRs atualizados

- `infrastructure/supabase/policies/RLS_POLICIES.md` — modelo hardened (revokes, sem policies diretas, views explícitas, grants, trigger, fronteira Control).
- `docs/database/SCHEMA.md` — migrations 0001–0009, integridade/histórico/exclusão, exposição pública.
- `docs/database/RLS_RUNTIME_TEST_STRATEGY.md` — estratégia preparada (nova).
- `docs/adr/ADR-003-banco-supabase-rls-isolamento.md` — decisão hardened e limitações runtime.
- `docs/adr/ADR-004-persistencia-local-studio-indexeddb.md` — cenários de falha/testes.

## Limitações e riscos remanescentes

- **RLS não validada em runtime** contra PostgreSQL/Supabase real; comportamento de views/grants/owner em ambiente Supabase alvo deve ser confirmado quando autorizado.
- **Migrations não executadas** em banco real; ajustes finos possíveis na aplicação autorizada.
- **`og_image_asset_id` sem FK** em `profile_public_snapshots` (decisão de modelagem a reavaliar).
- Acesso admin/serviço/sync/publicação não implementado (por desenho e restrição).
- Avisos npm não-vulnerabilidade: `eslint@9.39.4` deprecado; install scripts `esbuild`, `fake-indexeddb`.

## Restrições ativas

- **Não avançar para Fase 2B sem autorização.**
- Não criar/conectar Supabase, não executar migrations remotamente, não acessar/modificar bancos antigos, não publicar/deploy, não implementar auth própria sem decisão/revisão.
