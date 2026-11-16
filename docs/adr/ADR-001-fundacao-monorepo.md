# ADR-001 — Fundação do monorepo e stack base

- **Status:** Aceito
- **Data:** 2026-11-16
- **Fase:** 0-1

## Contexto

O Hättz 2.0 exige três aplicações integradas (Share, Studio, Control), pacotes compartilhados, qualidade de produção e evolução incremental por fases aprovadas.

## Decisão

- Adotar **npm workspaces** como gerenciador de pacotes.
- Padronizar **Node.js 24 LTS** como referência para desenvolvimento e CI, verificando compatibilidade com o ambiente local atual.
- Utilizar **TypeScript (strict)**, **React** e **Vite** como base de frontend/tooling.
- Organizar o repositório em `apps/*` e `packages/*` com contratos e utilitários compartilhados.
- Manter dependências justificadas, com versões fixadas e auditoria de segurança.

## Consequências

- Base consistente para evolução modular.
- Overhead inicial de configuração compensado por padronização, tipagem e CI.
- Compatibilidade deve ser monitorada em ambientes fora da referência LTS.
