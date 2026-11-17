# Estratégia de testes de RLS em PostgreSQL real (sem conexão externa nesta etapa)

> **Status:** preparada (Fase 2A fechamento de pendências). **RLS/SQL não validados em runtime** nesta etapa: nenhuma instância PostgreSQL local isolada disponível (`psql`, `postgres`, `docker`, `pg_config` não encontrados no ambiente).

## Categorias de teste (distinguir explicitamente)

1. **Testes automatizados TypeScript (executados):** validação de conteúdo publicável (`@hattz/validation`), limites/estrutura controlada, contratos/boundaries, persistência IndexedDB e falhas. **Não** comprovam RLS/privileges/views em PostgreSQL.
2. **Testes estruturais das migrations (executados):** inspeção estática de SQL (RLS/force, grants/revokes, policies, views, funções/triggers, projeções, limites, integridade/FK, `search_path`). **Não** comprovam comportamento em runtime.
3. **Testes de comportamento SQL (preparados, não executados):** execução de SQL/consultas contra PostgreSQL real autorizado.
4. **Testes reais de RLS em PostgreSQL (preparados, não executados):** asserções como papéis `anon`/`authenticated`/`service_role` em banco real/efêmero autorizado. **Somente estes** validam RLS/privileges em runtime.

## Procedimento controlado e descartável (quando houver ambiente autorizado)

> Executar **apenas** em instância PostgreSQL **nova, isolada e descartável** (ex.: container/dev DB local autorizado). **Nunca reutilizar bancos existentes. Não executar remotamente. Sem credenciais no repositório. Não simular resultados.**

1. Criar banco efêmero vazio (ex.: `createdb hattz_phase2a_rls_test_<timestamp>` ou DB dedicado em container local já autorizado).
2. Aplicar migrations em ordem: `0001`→`0009` (ex.: `psql -v ON_ERROR_STOP=1 -d <db> -f infrastructure/supabase/migrations/0001_...sql` ...).
3. Verificar criação de objetos: tabelas, RLS/force, policies, grants, views, funções/trigger, FKs/constraints.
4. Seed mínimo controlado (somente no DB efêmero): perfis/publicações/snapshots publicados e não publicados/privados, mídia pública ativa e privada/inativa, assets para testar `og_image_asset_id ON DELETE SET NULL`.
5. Executar asserções por papel/contexto (SQL abaixo) e registrar saídas reais.
6. Descartar o banco/ambiente efêmero.

## Casos mínimos (runtime a executar)

- **Grants/revokes/visibilidade:** `SELECT` em tabelas restritas/admin/audit e em colunas sem grant como `anon/authenticated` → negado/erro de permissão. `USAGE`/acesso a `hattz_admin`,`hattz_audit` → negado.
- **Views públicas (`security_invoker`):** `SET ROLE anon`/`authenticated`; `SELECT` em `v_share_published_profiles`/`v_share_public_media` → retorna somente publicados/públicos/ativos e colunas projetadas.
- **Acesso direto limitado à base:** `SELECT` direto nas tabelas com grant mínimo como `anon/authenticated` → apenas colunas concedidas e linhas permitidas por policy/RLS; tentativa de colunas internas (`storage_path`, `storage_bucket`, `checksum_sha256`, `metadata`, `technical_id`, `display_name`, `manifest_ref`, `failure_reason`) → negado.
- **Exclusões de conteúdo:** perfis/snapshots não publicados ou privados e mídia privada/inativa → ausentes nas views e inacessíveis por policy.
- **Funções/triggers/validação:** `INSERT/UPDATE` em `profile_public_snapshots` com conteúdo proibido/aninhado, chaves desconhecidas, limites excedidos (tamanho/profundidade/arrays/contagens/strings/formatos) ou `props/theme/effects` inválidos → falha por trigger; conteúdo válido → aceito (como papel autorizado de escrita, se aplicável).
- **Integridade referencial:** `og_image_asset_id` inválido → falha de FK; remoção do asset referenciado → `og_image_asset_id` torna-se `NULL` (histórico preservado).
- **RLS/FORCE e policies+subqueries:** confirmar comportamento sob `FORCE ROW LEVEL SECURITY` para papéis públicos e `service_role` conforme modelo; verificar que subqueries em policies não expõem linhas indevidas.
- **Admin boundary:** nenhuma elevação/admin indireta para papéis públicos.

## Esboço de comandos (referência, não executados)

```sql
-- como superuser/owner no DB efêmero após migrations+seed
set role anon;
select * from public.v_share_published_profiles;
select * from public.v_share_public_media;
select storage_path from public.media_assets; -- deve falhar (sem grant)
select * from public.profile_publications;    -- deve respeitar grant+RLS
reset role;
```

## Limitação atual

- **Não executado:** comportamento SQL real, RLS runtime, semântica/execução de views `security_invoker` com policies+grants no ambiente alvo (incl. Supabase), papéis `anon/authenticated/service_role/owner`, e integridade/trigger em runtime. Categorias 1 e 2 executadas localmente. Nenhuma instalação/download/infra externa realizada.
