# Hättz 2.0

Monorepo do ecossistema **Share**, **Studio** e **Control**. Fase 2A classificada como **CONCLUÍDA — PREPARAÇÃO TÉCNICA LOCAL** (sem validação de RLS/PostgreSQL em runtime real).

## Requisitos

- Node.js **24 LTS** (referência para desenvolvimento/CI)
- npm **>= 11**

## Estrutura

- `apps/share` — visualização pública de perfis (base)
- `apps/studio` — editor local-first (base)
- `apps/control` — painel administrativo privado (base)
- `packages/*` — core, contracts, design-system, permissions, validation, shared-utils
- `docs/adr` — decisões arquiteturais
- `docs/architecture` — documentação técnica de fundação

## Scripts (raiz)

- `npm run typecheck`
- `npm run lint`
- `npm run format`
- `npm run test`
- `npm run build`

## Status

Consulte `DEVELOPMENT_STATUS.md` para progresso, testes executados, pendências e limitações.
