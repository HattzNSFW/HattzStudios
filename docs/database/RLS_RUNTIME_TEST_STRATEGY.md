# Estratégia de testes de RLS em PostgreSQL real

> **Status:** **executada em PostgreSQL 17.12 local e descartável** (`hattz_phase2b_validation_6`). A semântica específica do Supabase (Auth/JWT/PostgREST/Storage) permanece pendente de ambiente autorizado. Harness reproduzível versionado em `infrastructure/supabase/validation/`.

## Categorias de teste (distinguir explicitamente)

1. **Testes automatizados TypeScript (executados):** validação de conteúdo publicável (`@hattz/validation`), limites/estrutura controlada, contratos/boundaries, persistência IndexedDB e falhas. **Não** comprovam RLS/privileges/views em PostgreSQL.
2. **Testes estruturais das migrations (executados):** inspeção estática de SQL (RLS/force, grants/revokes, policies, views, funções/triggers, projeções, limites, integridade/FK, `search_path`). **Não** comprovam comportamento em runtime.
3. **Testes de comportamento SQL (executados localmente):** execução das migrations `0001`–`0013`, transições, integridade e validador em PostgreSQL 17.12 descartável.
4. **Testes reais de RLS (executados localmente):** asserções como papéis `anon`/`authenticated`/`service_role` em banco real/efêmero. **Somente estes** validam RLS/privileges em runtime. Permanece pendente a semântica específica do Supabase (JWT/PostgREST/Storage).

## Procedimento controlado e descartável

> Executado **apenas** em instância PostgreSQL **nova, isolada e descartável** (`hattz_phase2b_validation_6`). **Bancos existentes preservados. Sem execução remota. Sem credenciais no repositório. Nenhum resultado simulado.**

1. Banco efêmero vazio criado (`hattz_phase2b_validation_6`, owner `hattz_pg_admin`).
2. Migrations aplicadas em ordem: `0001`→`0013` (`psql -v ON_ERROR_STOP=1 -f ...`), todas com exit 0.
3. Objetos verificados: tabelas, RLS/force, policies, grants, views, funções/trigger, FKs/constraints.
4. Seed mínimo controlado (somente no DB efêmero): perfis/publicações/snapshots publicados e não publicados/privados, mídia pública ativa e privada/inativa.
5. Asserções por papel/contexto executadas; saídas reais registradas em `%LOCALAPPDATA%\Hattz-2.0-postgres\logs\phase2b_validation_6`.
6. Banco descartável de pré-checagem removido; instância PostgreSQL encerrada de forma limpa ao final.

## Resultados obtidos (runtime local)

- **Migrations `0001`–`0013`:** exit 0 (35 passos / 0 falhas).
- **Estrutura:** 34 tabelas, 5 policies, 34/34 FORCE RLS; funções de sync `prosecdef=false`; **sem `SECURITY DEFINER`**.
- **Invariante do flag derivado:** 0 divergências (seed, transições e estado final).
- **Transições (T0–T12):** publicar/despublicar, visibilidade de snapshot, inserir/remover snapshot, mover publicação no mesmo perfil; **movimento cross-profile rejeitado por `0011`**; `DELETE` de publicação com snapshot rejeitado.
- **Integridade `0011` (N1–N6):** mismatch de `profile_id`/`version` rejeitado (insert e update); identidade preservada aceita. Pré-checagem bloqueia banco legado com dados divergentes (mensagem clara) e aplica após correção. Idempotência garantida por **definição** (colunas/constraint detectadas por catálogo, não por nome).
- **Validador:** `tokens` aceito, `token` rejeitado; guard `CASE` evita erro com escalares; **paridade SQL↔TS com 67 casos** (fixture única gerada por `parity/build_parity.mjs`).
- **`anon`/`authenticated`:** apenas conteúdo publicado/público visível; privados/admin/audit negados; escritas negadas; funções internas não executáveis; **sem recursão de RLS**.
- **`service_role`:** triggers como invocador; privilégios mínimos provados por controles negativos (BEFORE: `SELECT` em snapshots só quando `state → 'published'`; AFTER: `SELECT+UPDATE` em publicações); flag mantido e não forjável; ACL preservada (rollback). A `0012` **aplica** esse mínimo por coluna e o passo `82` prova: mínimo presente (`G1`), sem over-grant (`G2`), caminhos de escrita (`W1–W9`), cada grant necessário (`N1–N6`), papéis públicos sem escrita (`N7`), invariante (`I1`), ACL preservada (`G3`).
- **Unicidade de slug (`0013`):** global do slug atual garantida por `ux_profile_slugs_slug_current` e **um slug atual por perfil** por `ux_profile_slugs_current_per_profile`; troca atômica termina com exatamente um. Proteção de `reserved`, política de histórico e normalização são **decisão pendente do Owner** (§7).
- **Concorrência:** **27 execuções (9 cenários × 3)** consistentes, com overlap comprovado por traço e `pg_stat_activity`; inclui `INSERT`/`DELETE` de snapshot e mudança de `publication_id`.

## Casos mínimos (runtime)

- **Grants/revokes/visibilidade:** `SELECT` em tabelas restritas/admin/audit e em colunas sem grant como `anon/authenticated` → negado/erro de permissão. `USAGE`/acesso a `hattz_admin`,`hattz_audit` → negado.
- **Views públicas (`security_invoker`):** `SET ROLE anon`/`authenticated`; `SELECT` em `v_share_published_profiles`/`v_share_public_media` → retorna somente publicados/públicos/ativos e colunas projetadas.
- **Acesso direto limitado à base:** `SELECT` direto nas tabelas com grant mínimo como `anon/authenticated` → apenas colunas concedidas e linhas permitidas por policy/RLS; tentativa de colunas internas (`storage_path`, `storage_bucket`, `checksum_sha256`, `metadata`, `technical_id`, `display_name`, `manifest_ref`, `failure_reason`) → negado.
- **Exclusões de conteúdo:** perfis/snapshots não publicados ou privados e mídia privada/inativa → ausentes nas views e inacessíveis por policy.
- **Funções/triggers/validação:** `INSERT/UPDATE` em `profile_public_snapshots` com conteúdo proibido/aninhado, chaves desconhecidas, limites excedidos (tamanho/profundidade/arrays/contagens/strings/formatos) ou `props/theme/effects` inválidos → falha por trigger; conteúdo válido → aceito.
- **Integridade referencial:** `og_image_asset_id` inválido → falha de FK; remoção do asset referenciado → `og_image_asset_id` torna-se `NULL`. FK composta de identidade (`0011`) rejeita `profile_id`/`version` divergentes.
- **Integridade de slug (`0013`):** segundo slug atual para o mesmo perfil → `unique_violation`; slug atual global duplicado → `unique_violation`; troca atômica (aposentar+ativar) termina com exatamente um slug atual. `reserved` reutilizando slug atual → aceito (PENDING, sem regra aprovada).
- **RLS/FORCE e policies+subqueries:** comportamento sob `FORCE ROW LEVEL SECURITY` para papéis públicos e `service_role` conforme modelo; subqueries em policies não expõem linhas indevidas; **ausência de recursão** confirmada.
- **Admin boundary:** nenhuma elevação/admin indireta para papéis públicos.

## Esboço de comandos (referência executada)

```sql
-- como superuser/owner no DB efêmero após migrations+seed
set role anon;
select * from public.v_share_published_profiles;
select * from public.v_share_public_media;
select storage_path from public.media_assets; -- falha (sem grant)
select * from public.profile_publications;    -- respeita grant+RLS
reset role;
```

## Limitação atual

- **Executado localmente:** comportamento SQL, RLS runtime, semântica/execução das views `security_invoker` com policies+grants, papéis `anon/authenticated/service_role`, e integridade/trigger em runtime. Categorias 1 e 2 executadas localmente; 3 e 4 executadas em PostgreSQL local descartável.
- **Pendente:** semântica específica do **Supabase** (Auth/JWT/PostgREST/Storage) e execução em ambiente alvo autorizado. Papéis locais são stand-ins.
