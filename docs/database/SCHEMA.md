# Esquema de Banco — Hättz 2.0 (Fase 2A + hardening, modelagem)

**Alvo:** PostgreSQL (Supabase) **novo**. Migrations versionadas em `infrastructure/supabase/migrations/`. **Sem execução remota nesta etapa.**

## Migrations

- `0001_foundation_extensions.sql` — extensões, schemas `hattz_admin`/`hattz_audit`, enums, `set_updated_at()` (hardened: `search_path` fixo, `revoke/grant execute`).
- `0002_profiles_and_publications.sql` — perfis, slugs, publicações, snapshots públicos.
- `0003_media_storage.sql` — assets, variantes e uso de armazenamento por perfil.
- `0004_roles_permissions_benefits.sql` — RBAC, overrides, benefícios e atribuições.
- `0005_collectibles_collections.sql` — catálogos, coleções, posse/progresso vinculados ao perfil.
- `0006_admin_audit_isolation.sql` — domínio administrativo/auditoria isolado (estruturas, sem auth própria).
- `0007_settings_sync_monitoring.sql` — configurações, flags, notificações, sync e status de serviços.
- `0008_rls_policies.sql` — RLS enable+force e revogações de privilégios diretos (anon/authenticated) em tabelas base/schemas sensíveis; sem policies públicas diretas.
- `0009_hardening_public_views_and_snapshot_validation.sql` — views públicas seguras com colunas explícitas (`v_share_published_profiles`, `v_share_public_media`), validação/trigger de snapshot publicável, grants mínimos.

## Domínios e tabelas (resumo)

### Fundação (`0001`)

- Extensão `pgcrypto`.
- Schemas: `hattz_admin`, `hattz_audit`.
- Enums: `publication_state`, `sync_state`, `profile_visibility`, `collectible_rarity`, `benefit_validity_type`, `grant_source_type`.
- Função `public.set_updated_at()` com `set search_path = pg_catalog, public`.

### Perfis e publicações (`0002`)

- `public.profiles`: identidade técnica permanente (`technical_id` único), `display_name`, status/oficialidade.
- `public.profile_slugs`: slugs versionáveis por perfil (`is_current`), unicidade de slug atual, `on delete restrict`.
- `public.profile_publications`: histórico/versionamento por perfil (`unique(profile_id, version)`, estado, hashes/refs/falhas).
- `public.profile_public_snapshots`: conteúdo **público** versionado para exposição (`visibility`, SEO, `content` jsonb). `on delete restrict` em vínculos; **trigger de validação publicável** (`0009`) em insert/update.

### Mídia e armazenamento (`0003`)

- `public.media_assets`: metadados por perfil/categoria/tipo, `storage_bucket/path` (internos), status, `is_public`, checksum/dimensões/metadata.
- `public.media_variants`: original/thumbnail/optimized/preview (`on delete cascade` do asset).
- `public.profile_storage_usage`: agregados por perfil (`on delete cascade` do perfil).

### Cargos, permissões e benefícios (`0004`)

- `public.roles`, `public.permissions` (IDs permanentes), `public.role_permissions`, `public.user_role_assignments`, `public.user_permission_overrides`.
- `public.benefits_catalog`, `public.role_benefits`, `public.user_benefits`.
- `assigned_by_admin`/referências administrativas são campos lógicos (sem FK para schema admin) para manter isolamento de domínio; integridade de ator/admin será tratada por fluxos/serviços controlados futuros.

### Colecionáveis e coleções (`0005`)

- `public.badges_catalog`, `public.frames_catalog`, `public.collections`, `public.collection_items`.
- `public.user_badges` (índice único de posse ativa), `public.user_frames`, `public.user_collection_progress` (`unique(profile_id, collection_id)`).

### Administração e auditoria (`0006`)

- `hattz_admin.admin_accounts`, `admin_credentials`, `admin_recovery_keys`, `admin_sessions`, `admin_access_logs`.
- `hattz_audit.audit_logs` (append-only lógico; sem policies públicas).
- Estruturas planejadas (hashes/fingerprints), **sem implementação de auth própria**.

### Configurações, sync e monitoramento (`0007`)

- `public.global_settings` (`unique(scope, setting_key)`), `public.settings_history`, `public.feature_flags`, `public.notifications`, `public.sync_operations` (`operation_id` único/idempotência), `public.service_status_snapshots`.

## Integridade, histórico e exclusão (revisão)

- **IDs técnicos permanentes:** `profiles.technical_id` único e independente de nome/slug.
- **Histórico/versionamento:** `profile_publications` (por versão), `profile_public_snapshots` (conteúdo versionado), `settings_history`, `audit_logs` (append-only lógico), catálogos/posses com datas/estado.
- **Unicidade relevante:** `technical_id`, slug atual único (índice parcial), `(profile_id, version)` em publicações, `permission_id/key`, chaves de catálogos/flags/operação de sync, posse ativa de badge, progresso por coleção.
- **Exclusão:** vínculos críticos usam `ON DELETE RESTRICT` para preservar integridade/histórico (ex.: perfis/slugs/publicações/snapshots, referências de posse/atribuição); cascades limitados onde apropriado (variantes de mídia, itens de coleção, progresso/uso agregados, tabelas filhas administrativas internas). Remoção física de histórico sensível não é objetivo desta fase.
- **Nota:** `profile_public_snapshots.og_image_asset_id` permanece sem FK explícita nesta modelagem (pode referenciar asset público futuro); validar/restringir em evolução autorizada se necessário.

## Exposição pública (hardening)

- **Nenhum acesso direto** de anon/authenticated a tabelas base (0008).
- **Leitura pública apenas por views explícitas** (0009): `v_share_published_profiles`, `v_share_public_media` com colunas mínimas permitidas e filtros de publicação/visibilidade/status.
- **Snapshot publicável** validado recursivamente (chaves proibidas/estrutura) por trigger no banco e por `@hattz/validation` na aplicação.

## Garantias de isolamento

- **Local (Studio):** rascunhos/edições offline em IndexedDB (Dexie), sem conexão remota.
- **Publicado (Share):** interfaces públicas explícitas e filtradas; sem rascunhos/dados privados/admin.
- **Administrativo/Auditoria:** schemas isolados, sem acesso público; fronteira Control documentada e não implementada.
- **Cargo público Owner:** domínio público; **não** concede acesso ao Control.
