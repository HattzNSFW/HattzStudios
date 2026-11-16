# RLS, grants e interfaces públicas — Hättz 2.0 (Fase 2A hardening)

> Projeto alvo: **Supabase (PostgreSQL) inteiramente novo**. Definições para aplicação futura em ambiente autorizado; **não executadas remotamente nesta etapa**. **RLS não validada em runtime** (ver `docs/database/RLS_RUNTIME_TEST_STRATEGY.md`).

## Princípios

- **Menor privilégio**: RLS **habilitado e forçado** nas tabelas modeladas; **sem policies públicas diretas** em tabelas base; privilégios diretos de `anon`/`authenticated` revogados em tabelas/schemas sensíveis.
- **Isolamento de dados**: locais (Studio/IndexedDB) ≠ publicados (Share) ≠ administrativos/auditoria (Control).
- **Share nunca consulta rascunhos ou dados privados**: leitura pública **somente** via **views seguras com campos explicitamente permitidos**, filtradas para conteúdo efetivamente publicado e visibilidade pública.
- **Owner público ≠ acesso ao Control**: tabelas de `hattz_admin` e `hattz_audit` sem acesso público; sem grants de schema; acesso administrativo futuro dependerá de contexto/claims/papéis dedicados e funções controladas com revisão de segurança (não implementado).
- **Defesa em profundidade**: validação de snapshot publicável em aplicação (`@hattz/validation`) e no banco (função/trigger em `profile_public_snapshots`).

## 0008 — RLS e revogações (hardened)

- `ENABLE` + `FORCE ROW LEVEL SECURITY` em tabelas de `public` (domínios modelados) e em `hattz_admin.*`, `hattz_audit.*`.
- `REVOKE ALL` em tabelas base de `anon, authenticated`; `REVOKE USAGE` nos schemas `hattz_admin`, `hattz_audit`.
- **Nenhuma policy SELECT/INSERT/UPDATE/DELETE para anon/authenticated** em tabelas base. Acesso público não ocorre por tabela.

## 0009 — Interfaces públicas seguras e validação de snapshot

### Views públicas (campos explicitamente permitidos, grants mínimos)

- `public.v_share_published_profiles` (SELECT para `anon, authenticated`, `security_barrier=true`)
  - **Fonte/condição:** `profile_public_snapshots` + `profile_publications` + `profile_slugs` atuais, apenas `s.visibility='public'` e `pub.state='published'`.
  - **Colunas expostas:** `slug`, `profile_version`, `published_at`, `seo_title`, `seo_description`, `content`.
  - **Não exposto:** IDs internos (`profile_id`, `publication_id`), `technical_id`, `failure_reason`, `manifest_*`, `storage_*`, metadados administrativos/internos.
- `public.v_share_public_media` (SELECT para `anon, authenticated`, `security_barrier=true`)
  - **Fonte/condição:** `media_assets` + `media_variants`, apenas `is_public=true` e `status='active'`.
  - **Colunas expostas:** `asset_id`, `kind`, `mime_type`, `width`, `height`, `variant`, `format`, `variant_width`, `variant_height`.
  - **Não exposto:** `profile_id`, `storage_bucket`, `storage_path`, `checksum_sha256`, `metadata`, status interno, agregados de uso.

> Observação: com revogação de privilégios diretos nas tabelas base (0008), as views são definidas como interface pública mínima; execução/ownership deve ser validada em runtime no ambiente alvo autorizado. Acesso direto às tabelas base permanece bloqueado para anon/authenticated.

### Validação de conteúdo publicável (DB)

- `public.validate_publishable_snapshot_content(jsonb)`: rejeita estrutura/chaves fora do schema permitido e chaves proibidas recursivamente (privado, admin, credenciais, rascunhos, interno/auditoria/sync/config sensível, paths/checksums, etc.). `IMMUTABLE STRICT`, `search_path` fixo.
- `public.enforce_publishable_snapshot()` trigger `BEFORE INSERT OR UPDATE OF content, visibility` em `public.profile_public_snapshots`: bloqueia conteúdo não publicável/visibilidade inválida.
- `REVOKE EXECUTE` das funções de `public`; grants apenas para papéis de manutenção/serviço conforme modelo futuro.

## Domínios negados ao público (sem acesso direto)

- Escrita pública em todas as tabelas/views.
- Leitura/escrita pública em: perfis/slugs/publicações/snapshots/mídia/variantes/uso (tabelas base), cargos/permissões/atribuições/overrides, benefícios, catálogos e posses/progresso de colecionáveis, configurações/histórico, feature flags, notificações, operações de sync, snapshots de status de serviços.
- Qualquer acesso a `hattz_admin.*` e `hattz_audit.*`.

## Fronteira administrativa futura (Control) — documentada, não implementada

- Autenticação/sessão administrativa **isolada** do fluxo público de Owner; credenciais/sessões/recovery apenas como estruturas planejadas (hashes/fingerprints), sem auth própria implementada.
- Nenhuma concessão administrativa genérica para facilitar desenvolvimento.
- Acesso admin/serviço futuro: papéis/claims dedicados, funções controladas, escopo mínimo, auditoria e revisão de segurança prévia.

## Próximas evoluções (fases autorizadas)

- Roles/policies/funções de serviço para publicação/sync (identidade de serviço, mínimo privilégio).
- Contexto de sessão administrativa isolada para Control.
- Execução e evidência de **testes de RLS em PostgreSQL real** (estratégia preparada em `docs/database/RLS_RUNTIME_TEST_STRATEGY.md`).
