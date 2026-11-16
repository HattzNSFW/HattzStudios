# Fundação Hättz 2.0 (Fases 0-1)

## Escopo implementado

- Monorepo com npm workspaces (`apps/*`, `packages/*`).
- Aplicações base: **Share**, **Studio**, **Control** (React + Vite + TypeScript strict).
- Pacotes compartilhados: **core**, **contracts**, **design-system**, **permissions**, **validation**, **shared-utils**.
- Design System inicial com tokens de identidade: preto/grafite, prata, roxo suave e estilo **Liquid Glass**.
- Tooling de qualidade: TypeScript strict, ESLint, Prettier, Vitest.
- CI (GitHub Actions) para typecheck, lint, format, test e build (Node 24).

## Fora de escopo nesta etapa

- Funcionalidades completas dos oito blocos.
- Criação/conexão de projetos externos, bancos, contas, serviços, deploy/publicação.
- Implementação de autenticação própria do Control e backend adicional não justificado.
- Dados fictícios apresentados como dados reais.

## Observações

- Node.js de referência: **24 LTS**. Ambiente local detectado pode diferir; compatibilidade deve ser validada por execução real dos comandos.
- Supabase permanece planejado; nenhuma conexão externa realizada nas Fases 0-1.
