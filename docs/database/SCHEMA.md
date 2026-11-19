# Esquema de Banco — Hättz 2.0 (Fase 2A + hardening/auditoria + fechamento de pendências)

**Alvo:** PostgreSQL (Supabase) **novo**. Migrations versionadas em `infrastructure/supabase/migrations/`. **Sem execução remota nesta etapa.** **RLS/comportamento SQL validados em runtime local** em PostgreSQL 17.12 descartável (`hattz_phase2b_validation_6`); a semântica específica do Supabase (Auth/JWT/PostgREST/Storage) permanece pendente de ambiente autorizado.

## Migrations

- `0001_foundation_extensions.sql` — extensões, schemas `hattz_admin`/`hattz_audit`, enums, `set_updated_at()` hardened (`search_path`, `revoke/grant execute`).
- `0002_profiles_and_publications.sql` — perfis, slugs, publicações, snapshots públicos (conteúdo/SEO/visibilidade; `og_image_asset_id` com referência de integridade à mídia, aplicada em 0003).
- `0003_media_storage.sql` — assets, variantes e uso de armazenamento por perfil; garante FK de `profile_public_snapshots.og_image_asset_id -> media_assets(id) ON DELETE SET NULL`.
- `0004_roles_permissions_benefits.sql` — RBAC, overrides, benefícios e atribuições.
- `0005_collectibles_collections.sql` — catálogos, coleções, posse/progresso vinculados ao perfil.
- `0006_admin_audit_isolation.sql` — domínio administrativo/auditoria isolado (estruturas, sem auth própria).
- `0007_settings_sync_monitoring.sql` — configurações, flags, notificações, sync e status de serviços.
- `0008_rls_policies.sql` (audit-adjusted/fechamento) — RLS enable+force, revogações amplas (incl. `PUBLIC`), **grants mínimos de coluna** estritamente necessários às views públicas e **policies SELECT restritivas** para conteúdo publicado/público/ativo. Sem grant/policy pública em `profiles`.
- `0009_hardening_public_views_and_snapshot_validation.sql` (audit-adjusted/fechamento) — validação/trigger de snapshot publicável com limites explícitos e estruturas controladas/extensíveis (TS↔SQL), views públicas `v_share_published_profiles`/`v_share_public_media` com `security_invoker=true, security_barrier=true` e projeção explícita. Revisão de correções: SRFs de JSON protegidos por `CASE` (evita erro em escalares) e fronteira de palavra corrigida para `\y` (PostgreSQL não trata `\b` como fronteira), alinhando o validador SQL ao TS para a chave `tokens`.
- `0010_public_read_visibility_fix.sql` — corrige a recursão de RLS do A1-ii: adiciona a coluna derivada `profile_publications.is_publicly_visible` (mantida por triggers em publicações e snapshots) e reescreve a policy pública `share_select_published_publications` como `USING (is_publicly_visible)`, tornando-a autocontida. As policies de `profile_public_snapshots` e `profile_slugs` passam a depender do flag derivado, quebrando o ciclo sem `SECURITY DEFINER`/bypass.
- `0011_snapshot_publication_identity_integrity.sql` — integridade de identidade do snapshot: chave candidata `unique (id, profile_id, version)` em `profile_publications` e FK composta `(publication_id, profile_id, version)` em `profile_public_snapshots` (substitui a FK simples de `publication_id`), impedindo que um snapshot combine a publicação de um perfil com `profile_id`/`version` de outro. Inclui pré-checagem diagnóstica para bancos legados com dados divergentes. Aditiva/preservadora (`ON DELETE RESTRICT`, sem cascata destrutiva).
- `0012_trusted_writer_grants.sql` — grants mínimos do escritor confiável server-side (`service_role`) exigidos pelos triggers `SECURITY INVOKER` da `0010` e pelos DML do próprio escritor. **Por coluna** (SELECT/INSERT/UPDATE) e `DELETE` no nível da tabela em `profile_publications` e `profile_public_snapshots`; `USAGE` no schema `public`. Guardado por existência do papel (NOTICE se ausente), **sem** `SECURITY DEFINER`/`BYPASSRLS`/novos papéis, **sem** over-grant, idempotente.
- `0013_slug_current_per_profile.sql` — regra 1: índice único parcial `ux_profile_slugs_current_per_profile ON (profile_id) WHERE is_current = true` (no máximo **um slug atual por perfil**), com pré-checagem diagnóstica. Não altera policies/RLS/grants/triggers.

## Domínios e tabelas (resumo)

- **Perfis/publicações (`0002`):** `profiles` (`technical_id` único), `profile_slugs` (unicidade de slug atual **global** em `0002` + **um slug atual por perfil** em `0013`), `profile_publications` (`unique(profile_id, version)`; flag derivado `is_publicly_visible` a partir de `0010`), `profile_public_snapshots` (conteúdo público versionado, SEO, `og_image_asset_id` nullable).
- **Mídia (`0003`):** `media_assets` (inclui colunas internas: `storage_bucket/path`, `checksum_sha256`, `metadata`), `media_variants`, `profile_storage_usage`.
- **RBAC/benefícios (`0004`), colecionáveis (`0005`), admin/auditoria (`0006`), config/sync/monitoramento (`0007`)** conforme modelagem Fase 2A.

## Integridade, histórico e exclusão

- IDs técnicos permanentes; versionamento/histórico em publicações/snapshots/config/auditoria/sync/posses. Unicidades conforme 0002–0007.
- Exclusão: `ON DELETE RESTRICT` predominante em vínculos críticos; cascades pontuais apropriados (ex.: variantes/uso conforme 0003). Sem remoção de histórico nesta fase.
- **`profile_public_snapshots.og_image_asset_id` (resolvido):** FK para `public.media_assets(id)` com **`ON DELETE SET NULL`** (aplicada em 0003).
  - **Comportamento:** preserva histórico de publicação/snapshot; evita referências inválidas a asset inexistente (coluna anulada se a mídia for removida/substituída por deleção); não utiliza cascata destrutiva no snapshot.
  - **Limitação:** referência de mídia em `content` JSON (ex.: ids em props/blocos) não possui FK relacional no banco (conteúdo flexível controlado) — validada por formato/limites no validador de snapshot; integridade semântica completa de assets referenciados no JSON depende de fluxo futuro autorizado.
- **Identidade do snapshot (`0011`, resolvido):** FK composta `profile_public_snapshots(publication_id, profile_id, version)` → `profile_publications(id, profile_id, version)` (`ON DELETE RESTRICT`), com chave candidata correspondente. Garante que o snapshot pertença exatamente à publicação referenciada; movimento cross-profile é rejeitado. Validado em runtime (N1–N6) e por pré-checagem em banco legado.

## Exposição pública e acesso (fechamento)

- `anon/authenticated`: sem grants em schemas admin/audit e em domínios restritos; grants de **colunas mínimas** apenas nas tabelas base necessárias às views públicas, combinados com **RLS policies restritivas** (linhas publicadas/públicas/ativas).
  - Grants atuais: `profile_slugs(profile_id,slug,is_current)`, `profile_publications(id,state,published_at,is_publicly_visible)`, `profile_public_snapshots(publication_id,profile_id,version,visibility,seo_title,seo_description,content)`, `media_assets(id,kind,mime_type,width,height,status,is_public)`, `media_variants(asset_id,variant,format,width,height)`.
  - `is_publicly_visible` (coluna derivada, `0010`) é concedida porque colunas referenciadas em qualificadores de policy estão sujeitas à verificação de privilégio de coluna; sem esse grant a leitura via view falharia.
  - **Sem grant/policy pública** em `public.profiles`; **sem** `profile_publications.profile_id` concedido. **Não concedido:** `technical_id`, `display_name`, `storage_path/bucket`, `checksum_sha256`, `metadata`, `manifest_*`, `failure_reason`, agregados de uso, domínios restritos/admin/audit.
  - **Justificativa de colunas residuais:** colunas de junção/filtro/identificação necessárias às views `security_invoker` (ex.: `profile_id`, `publication_id`, `id`, `status/is_public`) permanecem concedidas nas tabelas referenciadas; acesso direto, se tentado, fica limitado a essas colunas e às linhas permitidas por RLS/policy. Colunas internas/sensíveis permanecem inacessíveis.
- **Interfaces públicas:** `v_share_published_profiles` e `v_share_public_media` (`security_invoker=true, security_barrier=true`) com projeção explícita — interface canônica do Share.
- **Snapshot publicável:** validado recursivamente (app + trigger/função DB) com limites explícitos (tamanho total, profundidade, seções, blocos/seção, arrays, chaves, strings, formatos de ids/refs de mídia) e estruturas `props/theme/effects` controladas/extensíveis e tipadas.

## Limitações (validação local; Supabase pendente)

- **Validado em runtime local** (PostgreSQL 17.12 descartável, `hattz_phase2b_validation_6`): aplicação das migrations `0001`–`0013`, FORCE RLS, policies, grants/revokes, views `security_invoker`, funções/triggers, FK composta de identidade, grants do escritor confiável (`0012`), integridade de slug (`0013`), matriz de acesso `anon`/`authenticated`/`service_role` e concorrência (9 cenários × 3). Papéis locais são stand-ins; **não** equivalentes a Supabase Auth/JWT/PostgREST/Storage.
- **Pendente de ambiente autorizado:** semântica específica do Supabase (RLS via JWT, PostgREST, Storage policies).
- Migrations não executadas remotamente.
- Sem roles/policies de serviço e sem contexto administrativo do Control (não implementados).
- **Privilégios do escritor confiável (`0012`, resolvido):** os triggers `0010` são `SECURITY INVOKER`; a `0012` concede ao escritor server-side (`service_role`) o mínimo **por coluna** — `SELECT` em `profile_public_snapshots` (só quando `state → 'published'`), `SELECT+UPDATE` em `profile_publications` (incl. `is_publicly_visible`) — além dos DML próprios. Sem `SECURITY DEFINER`/`BYPASSRLS`; sem tocar papéis públicos. Falta apenas validação no Supabase real.
- **Unicidade de slug (§7):** a unicidade **global** do slug atual é garantida por `ux_profile_slugs_slug_current` (`lower(slug) WHERE is_current = true`); **um único slug atual por perfil** é garantido por `ux_profile_slugs_current_per_profile` (`0013`, resolvido). Permanecem **decisão pendente do Owner**: política de slugs históricos (regra 2), proteção de `reserved` (regra 4) e algoritmo de normalização (regra 8).
