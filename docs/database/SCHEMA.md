# Esquema de Banco — Hättz 2.0 (Fase 2A + hardening auditado)

**Alvo:** PostgreSQL (Supabase) **novo**. Migrations versionadas em `infrastructure/supabase/migrations/`. **Sem execução remota nesta etapa.** **RLS não validada em runtime.**

## Migrations

- `0001_foundation_extensions.sql` — extensões, schemas `hattz_admin`/`hattz_audit`, enums, `set_updated_at()` hardened (`search_path`, `revoke/grant execute`).
- `0002_profiles_and_publications.sql` — perfis, slugs, publicações, snapshots públicos.
- `0003_media_storage.sql` — assets, variantes e uso de armazenamento por perfil.
- `0004_roles_permissions_benefits.sql` — RBAC, overrides, benefícios e atribuições.
- `0005_collectibles_collections.sql` — catálogos, coleções, posse/progresso vinculados ao perfil.
- `0006_admin_audit_isolation.sql` — domínio administrativo/auditoria isolado (estruturas, sem auth própria).
- `0007_settings_sync_monitoring.sql` — configurações, flags, notificações, sync e status de serviços.
- `0008_rls_policies.sql` (audit-adjusted) — RLS enable+force, revogações amplas (incl. `PUBLIC`), **grants mínimos de coluna** e **policies SELECT restritivas** para conteúdo publicado/público/ativo (suporte a views security_invoker).
- `0009_hardening_public_views_and_snapshot_validation.sql` (audit-adjusted) — validação/trigger de snapshot publicável alinhada ao validador TS, views públicas `v_share_published_profiles`/`v_share_public_media` com `security_invoker=true, security_barrier=true` e projeção explícita, grants mínimos.

## Domínios e tabelas (resumo)

### Fundação (`0001`)

- Extensão `pgcrypto`, schemas `hattz_admin`/`hattz_audit`.
- Enums: `publication_state`, `sync_state`, `profile_visibility`, `collectible_rarity`, `benefit_validity_type`, `grant_source_type`.
- `public.set_updated_at()` com `set search_path = pg_catalog, public`.

### Perfis e publicações (`0002`)

- `public.profiles` (`technical_id` único permanente), `public.profile_slugs` (unicidade de slug atual), `public.profile_publications` (`unique(profile_id, version)`), `public.profile_public_snapshots` (conteúdo público versionado, SEO, trigger de validação em 0009).

### Mídia e armazenamento (`0003`)

- `public.media_assets` (inclui colunas internas: `storage_bucket/path`, `checksum_sha256`, `metadata`), `public.media_variants`, `public.profile_storage_usage`.

### Cargos, permissões e benefícios (`0004`)

- `roles`, `permissions` (IDs permanentes), `role_permissions`, `user_role_assignments`, `user_permission_overrides`, `benefits_catalog`, `role_benefits`, `user_benefits`.
- Referências administrativas lógicas (sem FK cross-schema) para isolamento.

### Colecionáveis e coleções (`0005`)

- Catálogos, coleções/itens, posses (`user_badges` com unicidade de posse ativa), `user_frames`, progresso.

### Administração e auditoria (`0006`)

- `hattz_admin.admin_accounts/credentials/recovery_keys/sessions/access_logs`, `hattz_audit.audit_logs` (estruturas planejadas, sem auth própria).

### Configurações, sync e monitoramento (`0007`)

- `global_settings`, `settings_history`, `feature_flags`, `notifications`, `sync_operations` (idempotência), `service_status_snapshots`.

## Integridade, histórico e exclusão (revisão)

- IDs técnicos permanentes; versionamento/histórico em publicações/snapshots/config/auditoria/sync/posses.
- Unicidades: `technical_id`, slug atual, `(profile_id,version)`, permission IDs/chaves, catálogos/flags/operação, posse ativa badge, progresso por coleção.
- Exclusão: `ON DELETE RESTRICT` predominante em vínculos críticos; cascades pontuais apropriados. Sem remoção de histórico nesta fase.
- **Nota:** `profile_public_snapshots.og_image_asset_id` sem FK explícita (reavaliar em evolução autorizada).

## Exposição pública e acesso (auditado)

- `anon/authenticated`: sem grants em schemas admin/audit e em domínios restritos; grants de **colunas mínimas** apenas nas tabelas base necessárias às views públicas, combinados com **RLS policies restritivas** (linhas publicadas/públicas/ativas).
- **Interfaces públicas:** views `security_invoker=true` com projeção explícita (`v_share_published_profiles`, `v_share_public_media`) — leitura recomendada para Share. Colunas internas sem grant permanecem inacessíveis; acesso direto às tabelas base, se tentado, fica limitado a colunas/linhas permitidas (validar runtime).
- **Snapshot publicável:** validado recursivamente (app + trigger/função DB) antes de persistir conteúdo/visibilidade publicável.

## Limitações (não validadas em runtime)

- Correção efetiva de RLS/policies/grants/views sob papéis `anon/authenticated/service_role` no PostgreSQL/Supabase real.
- Desempenho/semântica das policies com subqueries.
- Contexto/roles de serviço e fronteira administrativa do Control (não implementados).
