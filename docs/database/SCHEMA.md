# Esquema de Banco — Hättz 2.0 (Fase 2A + hardening/auditoria + fechamento de pendências)

**Alvo:** PostgreSQL (Supabase) **novo**. Migrations versionadas em `infrastructure/supabase/migrations/`. **Sem execução remota nesta etapa.** **RLS/comportamento SQL não validados em runtime** (sem instância PostgreSQL local isolada disponível neste ambiente).

## Migrations

- `0001_foundation_extensions.sql` — extensões, schemas `hattz_admin`/`hattz_audit`, enums, `set_updated_at()` hardened (`search_path`, `revoke/grant execute`).
- `0002_profiles_and_publications.sql` — perfis, slugs, publicações, snapshots públicos (conteúdo/SEO/visibilidade; `og_image_asset_id` com referência de integridade à mídia, aplicada em 0003).
- `0003_media_storage.sql` — assets, variantes e uso de armazenamento por perfil; garante FK de `profile_public_snapshots.og_image_asset_id -> media_assets(id) ON DELETE SET NULL`.
- `0004_roles_permissions_benefits.sql` — RBAC, overrides, benefícios e atribuições.
- `0005_collectibles_collections.sql` — catálogos, coleções, posse/progresso vinculados ao perfil.
- `0006_admin_audit_isolation.sql` — domínio administrativo/auditoria isolado (estruturas, sem auth própria).
- `0007_settings_sync_monitoring.sql` — configurações, flags, notificações, sync e status de serviços.
- `0008_rls_policies.sql` (audit-adjusted/fechamento) — RLS enable+force, revogações amplas (incl. `PUBLIC`), **grants mínimos de coluna** estritamente necessários às views públicas e **policies SELECT restritivas** para conteúdo publicado/público/ativo. Sem grant/policy pública em `profiles`.
- `0009_hardening_public_views_and_snapshot_validation.sql` (audit-adjusted/fechamento) — validação/trigger de snapshot publicável com limites explícitos e estruturas controladas/extensíveis (TS↔SQL), views públicas `v_share_published_profiles`/`v_share_public_media` com `security_invoker=true, security_barrier=true` e projeção explícita.

## Domínios e tabelas (resumo)

- **Perfis/publicações (`0002`):** `profiles` (`technical_id` único), `profile_slugs` (unicidade de slug atual), `profile_publications` (`unique(profile_id, version)`), `profile_public_snapshots` (conteúdo público versionado, SEO, `og_image_asset_id` nullable).
- **Mídia (`0003`):** `media_assets` (inclui colunas internas: `storage_bucket/path`, `checksum_sha256`, `metadata`), `media_variants`, `profile_storage_usage`.
- **RBAC/benefícios (`0004`), colecionáveis (`0005`), admin/auditoria (`0006`), config/sync/monitoramento (`0007`)** conforme modelagem Fase 2A.

## Integridade, histórico e exclusão

- IDs técnicos permanentes; versionamento/histórico em publicações/snapshots/config/auditoria/sync/posses. Unicidades conforme 0002–0007.
- Exclusão: `ON DELETE RESTRICT` predominante em vínculos críticos; cascades pontuais apropriados (ex.: variantes/uso conforme 0003). Sem remoção de histórico nesta fase.
- **`profile_public_snapshots.og_image_asset_id` (resolvido):** FK para `public.media_assets(id)` com **`ON DELETE SET NULL`** (aplicada em 0003).
  - **Comportamento:** preserva histórico de publicação/snapshot; evita referências inválidas a asset inexistente (coluna anulada se a mídia for removida/substituída por deleção); não utiliza cascata destrutiva no snapshot.
  - **Limitação:** referência de mídia em `content` JSON (ex.: ids em props/blocos) não possui FK relacional no banco (conteúdo flexível controlado) — validada por formato/limites no validador de snapshot; integridade semântica completa de assets referenciados no JSON depende de fluxo futuro autorizado.

## Exposição pública e acesso (fechamento)

- `anon/authenticated`: sem grants em schemas admin/audit e em domínios restritos; grants de **colunas mínimas** apenas nas tabelas base necessárias às views públicas, combinados com **RLS policies restritivas** (linhas publicadas/públicas/ativas).
  - Grants atuais: `profile_slugs(profile_id,slug,is_current)`, `profile_publications(id,state,published_at)`, `profile_public_snapshots(publication_id,profile_id,version,visibility,seo_title,seo_description,content)`, `media_assets(id,kind,mime_type,width,height,status,is_public)`, `media_variants(asset_id,variant,format,width,height)`.
  - **Sem grant/policy pública** em `public.profiles`; **sem** `profile_publications.profile_id` concedido. **Não concedido:** `technical_id`, `display_name`, `storage_path/bucket`, `checksum_sha256`, `metadata`, `manifest_*`, `failure_reason`, agregados de uso, domínios restritos/admin/audit.
  - **Justificativa de colunas residuais:** colunas de junção/filtro/identificação necessárias às views `security_invoker` (ex.: `profile_id`, `publication_id`, `id`, `status/is_public`) permanecem concedidas nas tabelas referenciadas; acesso direto, se tentado, fica limitado a essas colunas e às linhas permitidas por RLS/policy. Colunas internas/sensíveis permanecem inacessíveis.
- **Interfaces públicas:** `v_share_published_profiles` e `v_share_public_media` (`security_invoker=true, security_barrier=true`) com projeção explícita — interface canônica do Share.
- **Snapshot publicável:** validado recursivamente (app + trigger/função DB) com limites explícitos (tamanho total, profundidade, seções, blocos/seção, arrays, chaves, strings, formatos de ids/refs de mídia) e estruturas `props/theme/effects` controladas/extensíveis e tipadas.

## Limitações (não validadas em runtime)

- Sem instância PostgreSQL local isolada identificada neste ambiente (`psql/postgres/docker/pg_config` não disponíveis); **nenhum teste SQL/RLS real executado**. Comportamento efetivo de RLS/policies/grants/views sob `anon/authenticated/service_role` e semântica de `security_invoker` no PostgreSQL/Supabase real pendente de ambiente autorizado.
- Migrations não executadas remotamente.
- Sem roles/policies de serviço e sem contexto administrativo do Control (não implementados).
