# Hättz 2.0 — Development Status

## Estado atual

- **Fases concluídas (base):** 0, 1 e **2A — preparação local da infraestrutura e dos dados**
- **Etapas complementares (pré-2B):** Hardening/revisão da Fase 2A (commit `196c2a3`) e **auditoria técnica crítica/validação de consistência** (esta entrega)
- **Data:** 2026-11-16
- **Branch:** `main`
- **Próxima etapa:** aguardar avaliação/aprovação para iniciar **Fase 2B** (não iniciada)

## Restrições respeitadas

- Banco modelado para **Supabase (PostgreSQL) inteiramente novo**; migrations `0001`–`0009`. **Sem criação/conexão de projeto Supabase, sem credenciais, sem execução remota de migrations, sem acesso/modificação de bancos antigos, sem deploy/publicação/push, sem Fase 2B, sem auth própria, sem operações destrutivas.**
- **RLS não validada em runtime** em PostgreSQL/Supabase real (apenas revisão estática + testes locais).

## Auditoria técnica crítica — problemas identificados e correções

### 1) Views públicas e `security_invoker` (prioridade máxima)

- **Problema identificado:** em `196c2a3`, 0009 definia views com `security_barrier` mas **sem `security_invoker=true` explícito** (comentário indicava intenção definer) e 0008 revogava privilégios das tabelas base sem policies/grants compensatórios. Em PostgreSQL, views sem `security_invoker=true` executam com privilégios do owner (definer) mas **`FORCE ROW LEVEL SECURITY` + ausência de policies** pode bloquear até o owner, tornando incerto/inviável o acesso; com `security_invoker=true` (exigência correta para não bypass) o invocador `anon/authenticated` **não teria privilégios** nas tabelas base. Ou seja, a combinação anterior não era comprovadamente funcional/segura em runtime.
- **Correção (arquitetural, menor privilégio):** 0008 (audit-adjusted) passou a **revogar privilégios amplos (incl. `PUBLIC`)**, conceder **grants mínimos de coluna** apenas nas tabelas/colunas necessárias às views públicas e criar **policies SELECT restritivas** somente para linhas publicadas/públicas/ativas. 0009 (audit-adjusted) passou a definir `v_share_published_profiles` e `v_share_public_media` como `security_invoker=true, security_barrier=true` com projeção explícita e grants de SELECT nas views.
  - **Efeito:** sem `SECURITY DEFINER`/bypass de RLS; colunas internas sem grant permanecem inacessíveis; linhas não publicadas/privadas/inativas excluídas por policies/filtros. Reconhece-se que acesso direto às tabelas base, se tentado, fica limitado ao subconjunto de colunas/linhas permitido (interface canônica: views). **Runtime não validado.**

### 2) Auditoria de validadores de snapshot (TS vs PostgreSQL)

- **Divergências encontradas:** padrões de chave proibida no SQL não cobriam variantes com `_` da mesma forma que TS em todos os tokens; SQL não impunha alguns limites de tamanho/tipo presentes no TS (bio/avatar/banner/SEO, comprimentos de ids/tipos).
- **Correção:** `packages/validation/src/publishableSnapshot.ts` e `public.validate_publishable_snapshot_content(jsonb)` alinhados (regex tolerante a `_` onde aplicável, checks de tamanho/tipo/estrutura para campos-chave, varredura recursiva preservada, schema explícito). Validação permanece estrita (sem enfraquecimento).
- **Limites residuais:** validação limita estrutura/tipos/tamanhos definidos; `props/theme/effects` permanecem objetos livres de chaves arbitrárias não-proibidas (por contrato) — chaves proibidas são bloqueadas recursivamente. Profundidade/tamanho total do JSON não possuem limite explícito adicional além do modelo (risco residual baixo, a calibrar em evolução autorizada).

### 3) Auditoria de privilégios e funções (0001–0009)

- **Verificado:** `ENABLE/FORCE RLS` nas tabelas modeladas; `REVOKE ALL` de tabelas/schemas sensíveis de `public, anon, authenticated`; grants mínimos de coluna e policies restritivas apenas para leitura pública necessária; views `security_invoker+security_barrier` com projeção explícita; funções com `search_path` fixo e `REVOKE/GRANT EXECUTE` mínimos; **nenhum `SECURITY DEFINER` introduzido**; sem policies/grants para `hattz_admin`/`hattz_audit` e domínios restritos; sem grants de escrita pública.
- **Risco residual:** comportamento efetivo de privilégios/policies/views/owner/roles (`anon, authenticated, service_role`) no Supabase/PostgreSQL real **não validado em runtime**.

### 4) Compatibilidade e integridade (sem Fase 2B)

- Contratos/adapters/Share/Studio/Control/persistência IndexedDB/publicação/histórico/versionamento revisados: boundaries permanecem sem conexão externa; interfaces públicas explícitas no contrato; limites entre apps preservados; sem implementação de funcionalidades da Fase 2B.

## Migrations alteradas nesta auditoria

- **Alterada:** `infrastructure/supabase/migrations/0008_rls_policies.sql` — grants mínimos de coluna + policies restritivas publicadas/públicas/ativas; revogações amplas (incl. `PUBLIC`); remoção da abordagem sem policies/grants.
- **Alterada:** `infrastructure/supabase/migrations/0009_hardening_public_views_and_snapshot_validation.sql` — views `security_invoker=true, security_barrier=true`; alinhamento da validação DB com TS (chaves `_`, tamanhos/tipos); hardening de EXECUTE.
- **Revisadas sem alteração:** `0001`–`0007`.

## Testes novos/atualizados e resultados reais (auditoria)

**Categorias (distinguidas):**

1. **Automatizados TypeScript (executados):** validação `@hattz/validation`, contratos/boundaries, persistência/falhas IndexedDB.
2. **Estruturais das migrations/SQL por inspeção (executados):** RLS/force, grants/revokes/policies, views (`security_invoker/barrier`, projeção/filtros), funções/triggers/search_path/EXECUTE, equivalência estrutural TS↔SQL.
3. **Comportamento SQL (não executados):** requer PostgreSQL real autorizado.
4. **RLS real em PostgreSQL (não executados):** requer ambiente autorizado.

**Suítes:** `tests/isolation/data-isolation.test.ts`, `tests/integrity/schema.integrity.test.ts`, `tests/authorization/authorization.test.ts`, `tests/persistence/studio-idb.persistence.test.ts`, `tests/persistence/studio-idb-failure.test.ts`, `tests/validation/publishable-snapshot.test.ts`, `packages/shared-utils/src/shared-utils.test.ts`.

**Resultados reais (executados):**

- `cmd /c "npm run format:write"` — **PASS**
- `cmd /c "npm run lint"` — **PASS**
- `cmd /c "npm run typecheck"` — **PASS** (workspaces + `infrastructure/adapters`)
- `cmd /c "npm run test"` — **PASS** — Vitest v4.1.12, **7 arquivos, 26 testes aprovados**
- `cmd /c "npm run build"` — **PASS** — Vite v7.3.8 (`@hattz/control`, `@hattz/share`, `@hattz/studio`)
- `cmd /c "npm audit"` — **PASS** — **found 0 vulnerabilities**

## Riscos e limitações restantes

- **Sem validação runtime** de RLS/privileges/views/policies no PostgreSQL/Supabase real (incl. `anon/authenticated/service_role`, owner, semântica de `security_invoker` com policies em Supabase, desempenho de subqueries).
- Migrations não executadas remotamente (ajustes finos possíveis).
- Grants de coluna + policies permitem, em princípio, leitura direta limitada a colunas/linhas permitidas (além da view); colunas internas e domínios sensíveis permanecem bloqueados por ausência de grant/policy.
- `og_image_asset_id` sem FK explícita.
- Sem roles/policies de serviço, sem contexto administrativo Control, sem auth própria.
- Avisos npm não-vulnerabilidade: `eslint@9.39.4` deprecado; install scripts `esbuild`, `fake-indexeddb`.

## Documentação atualizada

- `DEVELOPMENT_STATUS.md`, `infrastructure/supabase/policies/RLS_POLICIES.md`, `docs/database/SCHEMA.md`, `docs/database/RLS_RUNTIME_TEST_STRATEGY.md`, `docs/adr/ADR-003-banco-supabase-rls-isolamento.md`, `docs/adr/ADR-004-persistencia-local-studio-indexeddb.md`.

## Histórico

- `264945b` feat(phase-2a): base Fase 2A
- `196c2a3` chore(phase-2a): hardening inicial
- (esta auditoria): commit local adicional com correções, testes e documentação (ver relatório/`git log`)

**Aguardando avaliação antes de qualquer integração externa ou início da Fase 2B.**
