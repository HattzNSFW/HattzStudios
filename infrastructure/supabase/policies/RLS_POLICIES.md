# RLS, grants e interfaces públicas — Hättz 2.0 (Fase 2A fechamento de pendências)

> Projeto alvo: **Supabase (PostgreSQL) inteiramente novo**. Definições para aplicação futura em ambiente autorizado; **não executadas remotamente nesta etapa**. **RLS/SQL não validados em runtime** (sem instância PostgreSQL local isolada disponível).

## Princípios

- **Menor privilégio**: RLS **habilitado e forçado** nas tabelas modeladas; privilégios amplos revogados (incl. `PUBLIC`); acesso público somente por combinação de **grants mínimos de coluna + policies restritivas por linha + views security_invoker com projeção explícita**.
- **Isolamento de dados**: locais (Studio/IndexedDB) ≠ publicados (Share) ≠ administrativos/auditoria (Control).
- **Share nunca consulta rascunhos ou dados privados**: leitura pública limitada a conteúdo **efetivamente publicado/público/ativo** e a colunas explicitamente permitidas.
- **Owner público ≠ acesso ao Control**: `hattz_admin`/`hattz_audit` sem grants de schema/tabela e sem policies públicas.
- **Defesa em profundidade**: validação de snapshot publicável em aplicação (`@hattz/validation`) e no banco (função/trigger).

## 0008 — RLS, revogações, grants mínimos e policies restritivas

- `ENABLE` + `FORCE ROW LEVEL SECURITY` em tabelas de `public` e em `hattz_admin.*`, `hattz_audit.*`.
- `REVOKE ALL` em tabelas base e schemas sensíveis de `public, anon, authenticated`.
- **Grants mínimos de coluna** (somente o necessário para as views públicas em 0009):
  - `profile_slugs(profile_id, slug, is_current)`
  - `profile_publications(id, state, published_at)`
  - `profile_public_snapshots(publication_id, profile_id, version, visibility, seo_title, seo_description, content)`
  - `media_assets(id, kind, mime_type, width, height, status, is_public)`
  - `media_variants(asset_id, variant, format, width, height)`
- **Exposição residual identificada e reduzida:** removidos grant/policy pública em `public.profiles` e grant de `profile_publications.profile_id` (não requeridos pelas views atuais). Permanecem concedidas apenas colunas de junção/filtro/projeção indispensáveis às views `security_invoker`.
  - **Justificativa individual (residual):** `profile_id`/`publication_id`/`id` e flags de estado/visibilidade/atividade são necessários para joins, filtros e avaliação de RLS/policies nas views `security_invoker`; sem `SECURITY DEFINER`/bypass de RLS, o invocador precisa desses privilégios mínimos. Acesso direto à base, se tentado, fica restrito a essas colunas e às linhas publicadas/públicas/ativas permitidas.
  - **Não concedido:** `technical_id`, `display_name`, `storage_bucket`, `storage_path`, `checksum_sha256`, `metadata`, `manifest_*`, `failure_reason`, agregados de uso, colunas/tabelas de domínios restritos, `hattz_admin.*`, `hattz_audit.*`.
- **Policies SELECT restritivas** (anon/authenticated): slugs atuais vinculados a snapshot público publicado; publicações publicadas com snapshot público; snapshots públicos vinculados a publicação publicada; mídia/variantes apenas públicas e ativas. **Sem policies** em `profiles` (sem grant), domínios restritos e admin/auditoria; sem grants de escrita pública.

## 0009 — Views públicas (interface explícita) e validação de snapshot

### Views públicas

- `public.v_share_published_profiles` e `public.v_share_public_media` com `security_invoker = true, security_barrier = true` e `GRANT SELECT` a `anon, authenticated`.
- **Projeção explícita (Share):**
  - perfis publicados: `slug`, `profile_version`, `published_at`, `seo_title`, `seo_description`, `content`
  - mídia pública: `asset_id`, `kind`, `mime_type`, `width`, `height`, `variant`, `format`, `variant_width`, `variant_height`
- **Filtros de linha nas views:** publicados/visíveis e mídia ativa/pública (defesa em profundidade com policies/grants).

### Validação de conteúdo publicável (DB, alinhada ao TS)

- `public.validate_publishable_snapshot_content(jsonb)`: recursiva; rejeita chaves proibidas; impõe schema/whitelist por nível; aplica limites explícitos — tamanho total (262144 bytes), profundidade (12), seções (50), blocos/seção (50), arrays (100), chaves por objeto (50), strings (2000), formatos de ids/tipos/refs de mídia (`[a-zA-Z0-9_-]` com limites), tamanhos de campos SEO/bio/nome; `props/theme/effects` extensíveis porém tipados/controlados (JSON primitives/objects/arrays com chaves e tipos seguros) e sem estruturas arbitrárias ilimitadas. `IMMUTABLE STRICT`, `search_path` fixo.
- `public.enforce_publishable_snapshot()` trigger `BEFORE INSERT OR UPDATE OF content, visibility` em `public.profile_public_snapshots`.
- `REVOKE EXECUTE` de `public, anon, authenticated`; `GRANT EXECUTE` mínimo (`postgres, service_role`).

## Domínios negados ao público

- Escrita pública em todas as tabelas/views.
- Leitura/escrita pública em domínios restritos e em `hattz_admin.*` / `hattz_audit.*`.
- Acesso direto a colunas internas sem grant e a linhas não permitidas por RLS/policy.

## Validação PostgreSQL local e limitações

- **Nenhuma instância PostgreSQL local isolada disponível** neste ambiente (ferramentas `psql/postgres/docker/pg_config` ausentes). **Nenhuma migration executada, nenhum resultado simulado.**
- **Não validado em runtime:** grants/revokes efetivos, `security_invoker` sob `anon/authenticated/service_role`, leitura de publicados vs bloqueio de privados/não publicados/inativos, bloqueio de colunas internas, funções/triggers, interação policies+subqueries, RLS com `FORCE`. Execução deve ocorrer apenas em PostgreSQL/Supabase **novo e descartável** autorizado (ver `docs/database/RLS_RUNTIME_TEST_STRATEGY.md`).
