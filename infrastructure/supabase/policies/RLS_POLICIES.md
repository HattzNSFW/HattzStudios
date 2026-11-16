# RLS Policies — Hättz 2.0 (Fase 2A)

> Projeto alvo: **Supabase (PostgreSQL) inteiramente novo**. Políticas definidas para aplicação futura em ambiente autorizado; **não executadas remotamente nesta etapa**.

## Princípios

- **Menor privilégio**: RLS habilitado em tabelas dos domínios modelados; sem policies permissivas genéricas.
- **Isolamento de dados**: locais (Studio/IndexedDB) ≠ publicados (Share) ≠ administrativos/auditoria (Control).
- **Share nunca consulta rascunhos ou dados privados**: acesso anônimo/autenticado público restrito a snapshots/publicações com estado publicado e visibilidade pública.
- **Cargo público Owner ≠ acesso ao Control**: tabelas de `hattz_admin` e `hattz_audit` não possuem policies públicas; acesso administrativo futuro dependerá de contexto/claims dedicados e funções controladas com revisão de segurança.

## Policies definidas (0008)

### Leitura pública (anon, authenticated)

- `public.profile_public_snapshots` (`share_read_public_snapshots`, SELECT): apenas `visibility='public'` e publicação vinculada `state='published'`.
- `public.profiles` (`share_read_published_profiles`, SELECT): apenas perfis com snapshot publicado público existente.
- `public.profile_slugs` (`share_read_current_public_slugs`, SELECT): apenas slugs atuais de perfis com snapshot publicado público.
- `public.profile_publications` (`share_read_published_publications`, SELECT): apenas registros `state='published'`.
- `public.media_assets` (`share_read_public_media_assets`, SELECT): apenas `is_public=true` e `status='active'`.
- `public.media_variants` (`share_read_public_media_variants`, SELECT): apenas variantes de assets públicos/ativos.

### Negado por padrão (sem policy para público)

- Escrita pública em todas as tabelas.
- Leitura pública de: uso de armazenamento, cargos/permissões/atribuições/overrides, benefícios (catálogo e concessões), catálogos e posses/progresso de colecionáveis, configurações globais/histórico, feature flags, notificações, operações de sync, snapshots de status de serviços.
- Qualquer acesso público a `hattz_admin.*` e `hattz_audit.*`.

## Próximas evoluções (fases autorizadas)

- Policies/roles dedicados para serviços de publicação/sincronização (identidade de serviço, escopo mínimo).
- Policies administrativas baseadas em contexto de sessão administrativa isolada (após decisão arquitetural e revisão de segurança).
- Testes de RLS executados contra banco de desenvolvimento/staging quando houver autorização de conexão.
