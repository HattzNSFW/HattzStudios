# Hättz 2.0 — Development Status

## Estado atual

- **Fases concluídas (base):** 0, 1 e **2A — preparação local da infraestrutura e dos dados** (hardening, auditoria crítica e **fechamento de pendências de segurança** concluídos localmente)
- **Data:** 2026-11-16
- **Branch:** `main`
- **Commits preservados:** `196c2a3`, `202b478` (base/hardening/auditoria anteriores). Esta etapa adiciona commit(s) local(is) de fechamento, preservando todo o histórico.
- **Próxima etapa:** aguardar avaliação/aprovação para iniciar **Fase 2B** (não iniciada)

## Restrições respeitadas

- Banco modelado para **Supabase (PostgreSQL) inteiramente novo**; migrations `0001`–`0009`. **Sem criação/conexão de projeto Supabase, sem credenciais, sem execução remota de migrations, sem acesso/modificação de bancos antigos, sem deploy/publicação/push, sem Fase 2B, sem auth própria, sem operações destrutivas.**
- **RLS/SQL não validados em runtime** em PostgreSQL/Supabase real: nenhuma instância PostgreSQL local isolada disponível neste ambiente (`psql/postgres/docker/pg_config` ausentes). **Nenhum resultado simulado.**

## Fechamento das pendências de segurança (esta etapa)

### 1) Exposição residual direta das tabelas-base (identificada e reduzida)

- **Identificado:** grants mínimos anteriores incluíam `public.profiles(id,profile_id)` + policy pública e `profile_publications.profile_id`, não necessários às views públicas atuais (e `profiles.profile_id` inconsistente com o schema), ampliando desnecessariamente a superfície direta.
- **Corrigido (0008):** removidos grant/policy pública em `public.profiles`; removido `profile_publications.profile_id` do grant. Grants finais restritos a colunas de junção/filtro/projeção indispensáveis às views `security_invoker`.
- **Grants/privilégios finais (anon, authenticated):**
  - `profile_slugs(profile_id, slug, is_current)`
  - `profile_publications(id, state, published_at)`
  - `profile_public_snapshots(publication_id, profile_id, version, visibility, seo_title, seo_description, content)`
  - `media_assets(id, kind, mime_type, width, height, status, is_public)`
  - `media_variants(asset_id, variant, format, width, height)`
  - `SELECT` nas views `v_share_published_profiles`, `v_share_public_media`. **Sem** grants em schemas/tabelas `hattz_admin`/`hattz_audit`, domínios restritos, escrita, funções de snapshot, ou colunas sensíveis/internas (`technical_id`, `display_name`, `storage_bucket/path`, `checksum_sha256`, `metadata`, `manifest_*`, `failure_reason`, agregados de uso).
- **Justificativa do residual:** colunas de junção/filtro/ids/flags são necessárias para execução de views `security_invoker` sem `SECURITY DEFINER`/bypass de RLS; acesso direto, se tentado, fica limitado a essas colunas e às linhas permitidas por RLS/policies (publicadas/públicas/ativas). Interface canônica: views com projeção explícita.
- **Avaliação:** eliminação total do acesso direto às tabelas-base não é compatível com `security_invoker` sem introduzir definer/bypass (não adotado). Exposição residual minimizada e justificada.

### 2) Limites definitivos e validação dos snapshots (TS ↔ PostgreSQL)

- **Implementado e alinhado:** `packages/validation/src/publishableSnapshot.ts` e `0009` `validate_publishable_snapshot_content`/trigger.
- **Limites explícitos:** tamanho total **262144 bytes**; profundidade **12**; seções **50**; blocos por seção **50**; elementos por array **100**; chaves por objeto **50**; string genérica **2000**; `displayName` **80**; `bio` **2000**; `seo.title` **120**; `seo.description` **300**; ids/tipos/refs de mídia com formato controlado `[a-zA-Z0-9_-]` e comprimentos limitados (id/asset **128**, type **64**).
- **Estruturas controladas e extensíveis:** `props`, `theme`, `effects` aceitam chaves seguras e valores tipados (null/boolean/número finito/string limitada/array/objeto) com os mesmos limites de profundidade/contagem/tamanho — extensibilidade preservada para futuras ferramentas do Studio, sem estruturas arbitrárias ilimitadas.
- **Mídia/refs:** `avatarAssetId`/`bannerAssetId` validados por formato/tamanho; `og_image_asset_id` tratado por integridade relacional (abaixo). Varredura recursiva de chaves proibidas mantida e endurecida.
- **Testes:** positivos e negativos adicionados para limites, formatos, extensibilidade controlada, profundidade, arrays/objetos, tamanho total e refs de mídia; equivalência estrutural TS↔SQL atualizada.

### 3) Integridade referencial e comportamento de exclusão

- **`profile_public_snapshots.og_image_asset_id`:** FK para `public.media_assets(id)` com **`ON DELETE SET NULL`** (0002/0003). Preserva histórico do snapshot, impede referência quebrada a asset inexistente, evita cascata destrutiva (não adotado `CASCADE`). Substituição/remoção de mídia não apaga histórico publicado.
- **Referências de mídia em conteúdo JSON:** validadas por formato/limites (sem FK relacional no conteúdo flexível controlado); integridade semântica completa de refs dentro de blocos/props depende de fluxo futuro autorizado.
- **Histórico/órfãos:** políticas de exclusão restritivas predominantes mantidas; sem remoção de histórico.

### 4) Validação PostgreSQL local

- **Disponibilidade:** não identificada instância PostgreSQL local isolada (`psql`, `postgres`, `docker`, `pg_config` ausentes). **Nenhuma instalação/download/infra externa realizada.**
- **Execução:** não realizada; **nenhum resultado simulado**. Procedimentos e casos (migrations 0001–0009 em DB efêmero descartável, grants/revokes, `security_invoker`, `anon/authenticated/service_role`, publicados vs privados/não publicados/inativos, colunas internas, funções/triggers, policies+subqueries, RLS+`FORCE`, FK/`ON DELETE SET NULL`) documentados em `docs/database/RLS_RUNTIME_TEST_STRATEGY.md`.

## Migrations/documentação alteradas nesta etapa

- **Alteradas:** `0002_profiles_and_publications.sql` (referência/nota de integridade OG), `0003_media_storage.sql` (FK `og_image_asset_id` `ON DELETE SET NULL`), `0008_rls_policies.sql` (grants/policies mínimos finais), `0009_hardening_public_views_and_snapshot_validation.sql` (limites e validação controlada/extensível TS↔SQL).
- **Atualizadas:** `packages/validation/src/publishableSnapshot.ts`, `packages/validation/src/index.ts` (export), testes de isolamento/integridade/validação, `DEVELOPMENT_STATUS.md`, `infrastructure/supabase/policies/RLS_POLICIES.md`, `docs/database/SCHEMA.md`, `docs/database/RLS_RUNTIME_TEST_STRATEGY.md`, `docs/adr/ADR-003-banco-supabase-rls-isolamento.md`, `docs/adr/ADR-004-persistencia-local-studio-indexeddb.md`.

## Testes e resultados reais

**Categorias:**

1. **Automatizados TypeScript (executados):** validação/limites/extensibilidade controlada, contratos/boundaries, persistência/falhas IndexedDB, utilitários.
2. **Estruturais das migrations/SQL por inspeção (executados):** RLS/force, grants/revokes/policies finais, views (`security_invoker/barrier`, projeção/filtros), funções/triggers/EXECUTE/`search_path`, limites/validação, integridade FK/`ON DELETE SET NULL`, equivalência TS↔SQL.
3. **Comportamento SQL (não executados):** sem PostgreSQL local isolado.
4. **RLS real em PostgreSQL (não executados):** sem ambiente autorizado.

**Resultados reais (fechamento):**

- `cmd /c "npm run format:write"` — **PASS**
- `cmd /c "npm run lint"` — **PASS**
- `cmd /c "npm run typecheck"` — **PASS** (workspaces + `infrastructure/adapters`)
- `cmd /c "npm run test"` — **PASS** — Vitest v4.1.12, **7 arquivos, 26 testes aprovados**
- `cmd /c "npm run build"` — **PASS** — Vite v7.3.8 (`@hattz/control`, `@hattz/share`, `@hattz/studio`)
- `cmd /c "npm audit"` — **PASS** — **found 0 vulnerabilities**

## Riscos e limitações restantes

- **Sem validação runtime** de RLS/privileges/views/policies/triggers/FKs no PostgreSQL/Supabase real (`anon/authenticated/service_role`, owner, `security_invoker` com policies+subqueries em Supabase).
- Acesso direto residual limitado a colunas/linhas permitidas (necessário para `security_invoker`) — colunas internas e domínios sensíveis sem grant/policy.
- Refs de mídia dentro do `content` JSON sem FK relacional (validadas por formato/limites).
- Migrations não executadas remotamente; sem roles/policies de serviço/contexto administrativo Control/auth própria.
- Ambiente/avisos: Node local v26.13.0 (ref. 24 LTS), `eslint@9.39.4` deprecado, install scripts `esbuild`/`fake-indexeddb`.

## Histórico

- `196c2a3` chore(phase-2a): hardening inicial
- `202b478` chore(phase-2a): auditoria crítica/correções
- Commit local desta etapa: fechamento de pendências (ver `git log`)

**Aguardando avaliação antes de qualquer integração externa ou início da Fase 2B.**
