# ADR-002 — Isolamento administrativo do Control e postura de backend (Fases 0-1)

- **Status:** Aceito (planejamento de fundação)
- **Data:** 2026-11-16
- **Fase:** 0-1

## Contexto

O Hättz Control é um painel privado e exclusivo do administrador. A especificação exige autenticação administrativa independente e separação do cargo público Owner.

## Decisão

- **Não confundir** conta administrativa do Control com cargo público Owner.
- **Não implementar autenticação própria** nas Fases 0-1; avaliar soluções seguras antes de implementação futura.
- **Não adicionar Fastify ou infraestrutura adicional de backend** sem justificativa explícita de necessidade, custo, hospedagem e manutenção.
- Manter **Supabase planejado** como banco, sem criar/conectar projeto externo nesta etapa.

## Consequências

- Fundação prepara contratos, permissões e estrutura sem introduzir superfícies sensíveis prematuras.
- Decisões de auth/backend serão retomadas com análise de segurança e aprovação antes da Fase 2+.
