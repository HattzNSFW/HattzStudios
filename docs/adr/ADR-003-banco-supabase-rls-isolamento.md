# ADR-003 — Modelagem PostgreSQL/Supabase, RLS e isolamento de domínios

- **Status:** Aceito (Fase 2A, modelagem local) — hardening e auditoria crítica pré-2B aplicados
- **Data:** 2026-11-16

## Contexto

Modelar banco PostgreSQL para Supabase **novo** com RLS de menor privilégio, isolamento local/publicado/administrativo, snapshots publicáveis seguros e interfaces públicas sem exposição de colunas internas. Auditoria crítica pré-2B exigiu validar se as correções realmente funcionam em princípio e não introduzem inconsistências (especialmente views/privileges/RLS e equivalência de validadores).

## Decisão

- Migrations versionadas `0001`–`0009` (sem execução remota).
- Identidade técnica permanente (`profiles.technical_id`) e slugs versionáveis; conteúdo público separado em `profile_public_snapshots` vinculado a publicações publicadas.
- **Validação de snapshot publicável** (defesa em profundidade): validador TypeScript (`@hattz/validation`) e função/trigger no banco (`validate_publishable_snapshot_content` / `trg_validate_publishable_snapshot`) com varredura recursiva de chaves proibidas, schema explícito e checks de tipo/tamanho (alinhados por auditoria).
- **Acesso público (auditado):** 0008 aplica `ENABLE/FORCE RLS`, revoga privilégios amplos (incl. `PUBLIC`), concede **grants mínimos de coluna** e define **policies SELECT restritivas** apenas para linhas publicadas/públicas/ativas nas tabelas necessárias. 0009 expõe **views `security_invoker=true, security_barrier=true` com projeção explícita** (`v_share_published_profiles`, `v_share_public_media`) como interface Share.
  - **Justificativa:** evita `SECURITY DEFINER`/bypass de RLS; combina privilégios mínimos + RLS + projeção explícita. Reconhece-se que, por grants/policies, acesso direto limitado a colunas/linhas permitidas pode ser tecnicamente possível — colunas internas sem grant permanecem inacessíveis; a view é a interface canônica. **Comportamento real depende de validação runtime no ambiente alvo.**
- Schemas `hattz_admin`/`hattz_audit` isolados, sem grants/policies públicas; sem auth própria; Owner público ≠ acesso ao Control.
- Funções com `search_path` fixo e `REVOKE/GRANT EXECUTE` mínimos; sem `SECURITY DEFINER` introduzido.

## Consequências

- Superfície pública reduzida e explicitamente modelada (colunas/linhas/validação).
- **Não comprovado em runtime:** execução de views security_invoker sob `anon/authenticated`, efetividade das policies/grants no PostgreSQL/Supabase real, e casos de `service_role`/owner — requer testes em ambiente autorizado (estratégia documentada).
- Sem policies/roles de serviço/contexto administrativo implementados; evolução exige revisão de segurança.
