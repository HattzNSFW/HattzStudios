# Esquema de Banco — Hättz 2.0 (Fase 2A, modelagem)

**Alvo:** PostgreSQL (Supabase) **novo**. Migrations versionadas em `infrastructure/supabase/migrations/`. **Sem execução remota nesta etapa.**

## Domínios e tabelas

### 1) Fundação (`0001_foundation_extensions.sql`)

- Extensão `pgcrypto`.
- Schemas: `hattz_admin`, `hattz_audit`.
- Enums: `publication_state`, `sync_state`, `profile_visibility`, `collectible_rarity`, `benefit_validity_type`, `grant_source_type`.
- Função `public.set_updated_at()`.

### 2) Perfis e publicações (`0002_profiles_and_publications.sql`)

- `public.profiles`: identidade técnica permanente (`technical_id` único), `display_name`, status/oficialidade, timestamps.
- `public.profile_slugs`: slugs públicos versionáveis por perfil (`is_current`), unicidade de slug atual, proteção de reaproveitamento.
- `public.profile_publications`: histórico/versionamento de publicação por perfil (`version`, `state`, hashes/refs, datas, falhas).
- `public.profile_public_snapshots`: conteúdo **público** versionado e validado para exposição (`visibility`, SEO, `content` jsonb). Separado de rascunhos locais.

### 3) Mídia e armazenamento (`0003_media_storage.sql`)

- `public.media_assets`: metadados de mídia por perfil/categoria/tipo, status, visibilidade pública, dimensões/checksum.
- `public.media_variants`: original/thumbnail/optimized/preview.
- `public.profile_storage_usage`: agregados de consumo por perfil.

### 4) Cargos, permissões e benefícios (`0004_roles_permissions_benefits.sql`)

- `public.roles`: cargos (inclui base Member/VIP/Owner como chaves de sistema futuras), hierarquia, metadados.
- `public.permissions`: IDs permanentes (`permission_id`), chaves, categorias, sensibilidade.
- `public.role_permissions`: RBAC (allow/deny + constraints).
- `public.user_role_assignments`: atribuições (manual/automática/evento/cargo), validade, auditoria de origem.
- `public.user_permission_overrides`: permissões individuais/contextuais.
- `public.benefits_catalog`, `public.role_benefits`, `public.user_benefits`: catálogo e concessões (permanente/temporário/evento/vinculado a cargo).

### 5) Colecionáveis e coleções (`0005_collectibles_collections.sql`)

- `public.badges_catalog`, `public.frames_catalog`: catálogos com raridade (7 níveis), regras/compatibilidade/disponibilidade.
- `public.collections`, `public.collection_items`: coleções temáticas, condições e recompensas.
- `public.user_badges`, `public.user_frames`: posse vinculada ao perfil, origem, datas, equipar/favorito/ordem, revogação rastreável; índice único para posse ativa de badge.
- `public.user_collection_progress`: progresso e conclusão/recompensa.

### 6) Administração e auditoria (`0006_admin_audit_isolation.sql`)

- `hattz_admin.admin_accounts`: contas administrativas isoladas.
- `hattz_admin.admin_credentials`, `hattz_admin.admin_recovery_keys`, `hattz_admin.admin_sessions`, `hattz_admin.admin_access_logs`: estruturas planejadas (hashes/fingerprints/metadados), **sem implementação de auth própria nesta fase**.
- `hattz_audit.audit_logs`: trilha append-only lógica de ações (ator, recurso, antes/depois, motivo, resultado, correlação).

### 7) Configurações, sync e monitoramento (`0007_settings_sync_monitoring.sql`)

- `public.global_settings`, `public.settings_history`: versionamento e histórico de alterações.
- `public.feature_flags`.
- `public.notifications`: audiência/severidade/categoria/estado.
- `public.sync_operations`: metadados de sincronização/idempotência/conflitos/estado.
- `public.service_status_snapshots`: observabilidade de serviços.

### 8) RLS (`0008_rls_policies.sql`)

- RLS habilitado nas tabelas modeladas; leitura pública apenas para conteúdo publicado público e mídia pública ativa; domínios restritos e schemas admin/audit sem acesso público.

## Garantias de isolamento (modelagem)

- **Local (Studio):** rascunhos/edições offline em IndexedDB (não modelados como tabelas públicas de rascunho nesta fase).
- **Publicado (Share):** `profile_public_snapshots` + metadados mínimos necessários.
- **Administrativo/Auditoria:** schemas `hattz_admin`/`hattz_audit` separados, sem policies públicas.
- **Cargo público Owner:** modelado no domínio de papéis/perfis públicos; **não** concede acesso ao Control.
