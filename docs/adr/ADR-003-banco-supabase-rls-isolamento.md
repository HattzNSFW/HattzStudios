# ADR-003 — Modelagem PostgreSQL/Supabase, RLS e isolamento de domínios

- **Status:** Aceito (Fase 2A, modelagem local) — hardening, auditoria crítica e fechamento de pendências pré-2B aplicados
- **Data:** 2026-11-16

## Contexto

Modelar banco PostgreSQL para Supabase **novo** com RLS de menor privilégio, isolamento local/publicado/administrativo, snapshots publicáveis seguros e interfaces públicas sem exposição de colunas internas. Após auditoria crítica, foi necessária etapa de fechamento para reduzir exposição residual direta de base, definir limites/validação consistentes de snapshots e resolver integridade referencial.

## Decisão

- Migrations versionadas `0001`–`0009` (sem execução remota).
- Identidade técnica permanente (`profiles.technical_id`) e slugs versionáveis; conteúdo público separado em `profile_public_snapshots` vinculado a publicações publicadas.
- **Validação de snapshot publicável** (defesa em profundidade): validador TypeScript (`@hattz/validation`) e função/trigger no banco (`validate_publishable_snapshot_content` / `trg_validate_publishable_snapshot`) alinhados — varredura recursiva de chaves proibidas, schema explícito, limites explícitos (tamanho total, profundidade, seções, blocos/seção, arrays, chaves por objeto, strings, formatos de ids/refs de mídia) e estruturas `props/theme/effects` extensíveis porém tipadas/controladas.
- **Acesso público (fechado):** 0008 aplica `ENABLE/FORCE RLS`, revoga privilégios amplos (incl. `PUBLIC`), concede **grants mínimos de coluna** estritamente necessários às views públicas (sem grant/policy em `profiles`, sem `profile_publications.profile_id`) e define **policies SELECT restritivas** apenas para linhas publicadas/públicas/ativas. 0009 expõe **views `security_invoker=true, security_barrier=true` com projeção explícita** (`v_share_published_profiles`, `v_share_public_media`) como interface Share canônica.
  - **Justificativa:** evita `SECURITY DEFINER`/bypass de RLS; combina privilégios mínimos + RLS + projeção explícita. Colunas de junção/filtro/identificação necessárias ao `security_invoker` permanecem concedidas e, se consultadas diretamente, ficam limitadas a linhas permitidas por policy — colunas internas/sensíveis permanecem sem grant. **Comportamento real depende de validação runtime no ambiente alvo.**
- **Integridade referencial:** `profile_public_snapshots.og_image_asset_id` referencia `media_assets(id)` com `ON DELETE SET NULL` (histórico preservado, sem cascata destrutiva, sem FK quebrada).
- Schemas `hattz_admin`/`hattz_audit` isolados, sem grants/policies públicas; sem auth própria; Owner público ≠ acesso ao Control.
- Funções com `search_path` fixo e `REVOKE/GRANT EXECUTE` mínimos; sem `SECURITY DEFINER` introduzido.

## Consequências

- Superfície pública reduzida (grants/projeções/validação/limites/integridade) e explicitamente documentada.
- **Não comprovado em runtime:** execução de views security_invoker sob `anon/authenticated/service_role`, efetividade de policies/grants/subqueries e trigger/FK no PostgreSQL/Supabase real — requer testes em ambiente autorizado e descartável (estratégia documentada). Nenhuma instância local isolada disponível nesta etapa.
- Sem policies/roles de serviço/contexto administrativo implementados; evolução exige revisão de segurança.
