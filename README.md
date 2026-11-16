# Hättz 2.0

Monorepo em fundação (Fases 0-1 aprovadas) para as aplicações **Share**, **Studio** e **Control**.

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
