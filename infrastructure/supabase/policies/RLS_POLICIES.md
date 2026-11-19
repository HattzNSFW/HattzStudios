# RLS, grants e interfaces públicas — Hättz 2.0 (Fase 2A fechamento de pendências)

> Projeto alvo: **Supabase (PostgreSQL) inteiramente novo**. Definições para aplicação futura em ambiente autorizado; **não executadas remotamente nesta etapa**. **RLS/SQL validados em runtime local** em PostgreSQL 17.12 descartável; a semântica específica do Supabase (Auth/JWT/PostgREST/Storage) permanece pendente.

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
  - `profile_publications(id, state, published_at)` (a coluna derivada `is_publicly_visible` só é concedida em `0010`)
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

## 0010 — Correção da recursão de RLS (flag derivado de visibilidade)

- A policy pública de `profile_publications` referenciava `profile_public_snapshots`, cuja policy referencia `profile_publications` → **recursão de RLS** (erro `infinite recursion detected in policy`).
- Correção sem `SECURITY DEFINER`/bypass: adiciona a coluna derivada **`profile_publications.is_publicly_visible boolean NOT NULL DEFAULT false`**, mantida por triggers:
  - `sync_publication_visibility()` (`BEFORE INSERT OR UPDATE` em `profile_publications`) — recalcula o flag a partir de `state='published' AND EXISTS(snapshot público)`.
  - `sync_snapshot_parent_visibility()` (`AFTER INSERT/DELETE/UPDATE OF visibility, publication_id` em `profile_public_snapshots`) — recalcula o flag do(s) pai(s) afetado(s), inclusive no movimento entre publicações.
- A policy `share_select_published_publications` passa a ser `USING (is_publicly_visible)` (**autocontida**). As policies de `profile_public_snapshots` e `profile_slugs` dependem do flag derivado, o que torna o grafo **acíclico**.
- Os triggers executam como **invocador** (sem `SECURITY DEFINER`) e sobrescrevem qualquer tentativa de forjar `is_publicly_visible` (validado em runtime).
- **Privilégios do escritor confiável (`0012`, resolvido):** como os triggers são `SECURITY INVOKER`, o escritor server-side precisa de `SELECT` em `profile_public_snapshots` (somente avaliado quando `state → 'published'`, por curto-circuito do `AND`) e de `SELECT + UPDATE` em `profile_publications` (`FOR UPDATE` + `UPDATE(is_publicly_visible)`), além dos seus próprios DML. A migration `0012` **codifica esse mínimo por coluna** para `service_role` (ver seção 0012).

## 0011 — Integridade de identidade do snapshot (não altera policies)

- Adiciona chave candidata `unique (id, profile_id, version)` em `profile_publications` e FK composta `(publication_id, profile_id, version)` em `profile_public_snapshots` (`ON DELETE RESTRICT`), substituindo a FK simples de `publication_id`.
- Não introduz/afrouxa grants nem policies; apenas reforça integridade referencial (impede identidade cross-profile).

## 0012 — Grants do escritor confiável (não altera policies nem papéis públicos)

- Concede ao papel server-side **`service_role`** o conjunto **mínimo por coluna** exigido pelos triggers `SECURITY INVOKER` da `0010` e pelos DML do próprio escritor:
  - `USAGE` no schema `public`;
  - `profile_publications`: `SELECT(id, profile_id, version, state, published_at, unpublished_at, is_publicly_visible)`, `INSERT(...)`, `UPDATE(...incl. is_publicly_visible)`, `DELETE` (tabela);
  - `profile_public_snapshots`: `SELECT(id, publication_id, profile_id, version, visibility, seo_title, seo_description, og_image_asset_id, content)`, `INSERT(...)`, `UPDATE(...incl. publication_id, visibility)`, `DELETE` (tabela).
- **Por coluna** onde o PostgreSQL permite; `DELETE` só no nível da tabela. **Sem** privilégio de tabela inteira onde coluna basta; **sem** over-grant em tabelas não relacionadas.
- Guardado por existência do papel (NOTICE e no-op se ausente); **sem** `SECURITY DEFINER`, **sem** `BYPASSRLS`, **sem** criar papéis, **sem** tocar `anon`/`authenticated`; idempotente.
- Não altera policies, RLS, views ou a superfície pública.

## 0013 — Regra 1 de slug (não altera policies/RLS/grants)

- Índice único parcial `ux_profile_slugs_current_per_profile ON public.profile_slugs (profile_id) WHERE is_current = true`: no máximo **um slug atual por perfil**.
- Pré-checagem diagnóstica (transacional). Não introduz/afrouxa grants nem policies; a unicidade global já vinha da `0002`.
- **Pendente do Owner:** slugs históricos (regra 2), proteção de `reserved` (regra 4) e normalização (regra 8).

## Domínios negados ao público

- Escrita pública em todas as tabelas/views.
- Leitura/escrita pública em domínios restritos e em `hattz_admin.*` / `hattz_audit.*`.
- Acesso direto a colunas internas sem grant e a linhas não permitidas por RLS/policy.

## Validação PostgreSQL local (executada) e limitações

- **Validado em runtime local** em PostgreSQL 17.12 descartável (`hattz_phase2b_validation_6`, owner `hattz_pg_admin`), com migrations `0001`–`0013` aplicadas por `psql -v ON_ERROR_STOP=1` (35 passos / 0 falhas):
  - **FORCE RLS:** 34/34 tabelas de domínio; **5 policies**; sem `SECURITY DEFINER`.
  - **Matriz de acesso `anon` e `authenticated`:** apenas o perfil publicado/público visível nas views e nas tabelas com grant; leituras de `profiles`/admin/audit/agregados negadas; escritas negadas (incl. forjar o flag derivado); funções internas não executáveis; **sem recursão de RLS**.
  - **Contexto `service_role` (BYPASSRLS):** triggers executam como invocador; privilégios mínimos e controles negativos provam que o BEFORE precisa de `SELECT` em snapshots (só quando `state → 'published'`) e o AFTER precisa de `SELECT+UPDATE` em publicações; mantêm o flag e sobrepõem tentativas de forjar `is_publicly_visible`; grants de teste revertidos (ACL preservada).
  - **Grants aplicados (`0012`, passo `82`):** mínimo presente (`G1`), sem over-grant (`G2`), todos os caminhos de escrita (`W1–W9`), cada grant necessário (`N1–N6`), papéis públicos sem escrita (`N7`), invariante (`I1`), rollback preserva a ACL (`G3`).
  - **Invariante do flag derivado:** 0 divergências; concorrência (**27 execuções: 9 cenários × 3**) consistente.
  - **Integridade `0011`:** identidade cross-profile/version rejeitada por FK; idempotência por definição (não por nome); pré-checagem bloqueia banco legado divergente.
  - **Unicidade de slug (`0013`, passo `72`):** global do slug atual + **um slug atual por perfil** garantidos; troca atômica termina com exatamente um; `reserved`/histórico/normalização permanecem **decisão pendente do Owner** (§7).
- **Limitações:** instância local; papéis `anon`/`authenticated`/`service_role` são stand-ins, **não** equivalentes a Supabase Auth/JWT/PostgREST/Storage. A semântica específica do Supabase permanece pendente de ambiente autorizado e descartável (ver `docs/database/RLS_RUNTIME_TEST_STRATEGY.md`). A `0012` garante apenas o **mínimo**; no Supabase real o `service_role` pode já ter privilégios de tabela padrão mais amplos (caveat específico do Supabase).
