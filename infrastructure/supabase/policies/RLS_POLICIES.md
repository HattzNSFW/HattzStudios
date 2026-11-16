# RLS, grants e interfaces públicas — Hättz 2.0 (Fase 2A hardening, auditado)

> Projeto alvo: **Supabase (PostgreSQL) inteiramente novo**. Definições para aplicação futura em ambiente autorizado; **não executadas remotamente nesta etapa**. **RLS não validada em runtime** (ver `docs/database/RLS_RUNTIME_TEST_STRATEGY.md`).

## Princípios

- **Menor privilégio**: RLS **habilitado e forçado** nas tabelas modeladas; privilégios amplos revogados (incl. `PUBLIC`); acesso público somente por combinação de **grants mínimos de coluna + policies restritivas por linha + views security_invoker com projeção explícita**.
- **Isolamento de dados**: locais (Studio/IndexedDB) ≠ publicados (Share) ≠ administrativos/auditoria (Control).
- **Share nunca consulta rascunhos ou dados privados**: leitura pública limitada a conteúdo **efetivamente publicado/público/ativo** e a colunas explicitamente permitidas.
- **Owner público ≠ acesso ao Control**: `hattz_admin`/`hattz_audit` sem grants de schema/tabela e sem policies públicas; acesso administrativo futuro depende de contexto/claims/papéis dedicados e funções controladas com revisão de segurança (não implementado).
- **Defesa em profundidade**: validação de snapshot publicável em aplicação (`@hattz/validation`) e no banco (função/trigger).

## 0008 — RLS, revogações, grants mínimos e policies restritivas

- `ENABLE` + `FORCE ROW LEVEL SECURITY` em tabelas de `public` e em `hattz_admin.*`, `hattz_audit.*`.
- `REVOKE ALL` em tabelas base de `public, anon, authenticated`; `REVOKE ALL` em schemas `hattz_admin`, `hattz_audit`.
- **Grants mínimos de coluna** (somente o necessário para as views públicas em 0009):
  - `profiles(id, profile_id)`; `profile_slugs(profile_id, slug, is_current)`; `profile_publications(id, profile_id, state, published_at)`;
  - `profile_public_snapshots(publication_id, profile_id, version, visibility, seo_title, seo_description, content)`;
  - `media_assets(id, kind, mime_type, width, height, status, is_public)`; `media_variants(asset_id, variant, format, width, height)`.
  - **Não concedido** (exemplos): `technical_id`, `display_name`, `failure_reason`, `manifest_*`, `storage_bucket/path`, `checksum`, `metadata` de mídia, agregados de uso, domínios restritos/admin/audit.
- **Policies SELECT restritivas** (anon/authenticated) apenas para linhas publicáveis/publicadas/ativas:
  - snapshots: `visibility='public'` e publicação vinculada `state='published'`;
  - publicações/slugs/perfis: somente quando vinculados a snapshot/público publicado conforme condições;
  - mídia/variantes: `is_public=true` e `status='active'`.
- **Sem policies** para domínios restritos e para `hattz_admin`/`hattz_audit`; sem grants de escrita pública.

## 0009 — Views públicas (interface explícita) e validação de snapshot

### Views públicas

- `public.v_share_published_profiles` e `public.v_share_public_media` com `security_invoker = true, security_barrier = true` e `GRANT SELECT` a `anon, authenticated`.
- **Projeção explícita (Share):**
  - perfis publicados: `slug`, `profile_version`, `published_at`, `seo_title`, `seo_description`, `content`;
  - mídia pública: `asset_id`, `kind`, `mime_type`, `width`, `height`, `variant`, `format`, `variant_width`, `variant_height`.
- **Filtros de linha nas views:** publicados/visíveis e mídia ativa/pública (além das policies/grants de base).
- **Investigação (auditoria):** `security_invoker=true` exige que o invocador tenha privilégios nas relações subjacentes; por isso 0008 provê grants mínimos de coluna + policies restritivas. Isso evita `security_definer`/bypass de RLS e mantém menor privilégio, mas significa que colunas/linhas permitidas pelas policies são tecnicamente acessíveis via consulta direta às tabelas base **dentro desses limites** (interface recomendada continua sendo a view). Colunas internas sem grant permanecem inacessíveis. **Validação runtime obrigatória em ambiente autorizado.**

### Validação de conteúdo publicável (DB)

- `public.validate_publishable_snapshot_content(jsonb)`: recursiva, rejeita chaves proibidas (privado/admin/credenciais/rascunhos/interno/auditoria/sync/config sensível, paths/checksums/hashes etc., inclusive variantes com `_`), impõe chaves permitidas por nível, tipos/tamanhos básicos (alinhado ao validador TypeScript). `IMMUTABLE STRICT`, `search_path` fixo.
- `public.enforce_publishable_snapshot()` trigger `BEFORE INSERT OR UPDATE OF content, visibility` em `public.profile_public_snapshots`: bloqueia conteúdo/visibilidade inválidos.
- `REVOKE EXECUTE` de `public, anon, authenticated`; `GRANT EXECUTE` mínimo (`postgres, service_role`).

## Domínios negados ao público

- Escrita pública em todas as tabelas/views.
- Leitura/escrita pública em domínios restritos (RBAC/atribuições/overrides, benefícios, colecionáveis/posses/progresso, configurações/histórico, flags, notificações, sync, monitoramento, uso de armazenamento) e em tabelas base fora das colunas/linhas explicitamente permitidas.
- Qualquer acesso a `hattz_admin.*` e `hattz_audit.*`.

## Fronteira administrativa futura (Control)

- Autenticação/sessão administrativa isolada do Owner público; sem auth própria implementada; sem acesso administrativo genérico.
- Acesso futuro por papéis/claims/funções controladas com escopo mínimo, auditoria e revisão de segurança.

## Limitações conhecidas (auditoria)

- **Sem validação runtime de RLS/privileges/views no PostgreSQL/Supabase real** nesta etapa (ver estratégia).
- Policies RLS para Share dependem de subqueries entre tabelas publicáveis; correção/eficiência deve ser verificada em runtime.
- Sem policies/roles de serviço ou contexto administrativo implementados.
