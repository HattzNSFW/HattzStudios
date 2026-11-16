# Hättz 2.0 — Development Status

## Estado atual
- **Fase concluída (nesta entrega):** 0 e 1 (fundação), conforme aprovação
- **Data:** 2026-11-16
- **Branch:** `main`
- **Próxima etapa:** aguardar avaliação/aprovação para iniciar Fase 2+

## Decisões registradas (ajustes aprovados aplicados)
- Gerenciador: **npm workspaces** (`apps/*`, `packages/*`).
- Node.js de referência: **24 LTS** (`.nvmrc`, CI em Node 24, `engines` no root). Ambiente local detectado: **Node v26.13.0** (compatibilidade verificada na prática: typecheck/lint/test/build executados com sucesso no ambiente atual).
- Stack base: **TypeScript strict, React, Vite**.
- **Sem Fastify/infra backend adicional** nesta etapa (nenhuma necessidade justificada; sem custo/hospedagem/manutenção introduzidos).
- Auth do Control: **isolamento administrativo planejado** (conta administrativa != cargo público Owner). **Nenhuma autenticação própria implementada**; soluções seguras a avaliar antes de implementação futura (ver ADR-002).
- Supabase: **planejado** como banco, **sem criação/conexão de projeto externo** nesta etapa.

## Escopo executado (Fases 0-1)
- Organização do repositório e arquivos-base de configuração.
- Commit local inicial contendo **somente `.gitignore`** (arquivo-base conferido).
- Monorepo npm workspaces configurado.
- Configuração de **TypeScript strict**, **ESLint (flat config)**, **Prettier** e **Vitest**.
- Estrutura inicial das aplicações: **Share**, **Studio**, **Control** (React + Vite + TypeScript, shells de fundação sem funcionalidades completas dos 8 blocos).
- Pacotes compartilhados criados: **@hattz/core**, **@hattz/contracts**, **@hattz/design-system**, **@hattz/permissions**, **@hattz/validation**, **@hattz/shared-utils**.
- **Tokens iniciais do Design System** com identidade preta/grafite, prata, roxo suave e **Liquid Glass** (`tokens.ts`, `tokens.css`, utilitário `.hattz-liquid-glass`, suporte a `prefers-reduced-motion`).
- CI configurado (GitHub Actions: typecheck, lint, format, test, build em Node 24).
- Documentação técnica e ADRs criados/atualizados.
- Instalação de dependências, correção de vulnerabilidades por atualização de versões, auditoria de segurança e execução de verificações.

## Estrutura real de arquivos criada (exclui `node_modules/`, `.git/`, `dist/`)
- `.editorconfig`
- `.env.example`
- `.github/workflows/ci.yml`
- `.gitignore`
- `.nvmrc`
- `.prettierignore`
- `DEVELOPMENT_STATUS.md`
- `README.md`
- `apps/control/index.html`
- `apps/control/package.json`
- `apps/control/src/App.tsx`
- `apps/control/src/index.css`
- `apps/control/src/main.tsx`
- `apps/control/src/vite-env.d.ts`
- `apps/control/tsconfig.json`
- `apps/control/vite.config.ts`
- `apps/share/index.html`
- `apps/share/package.json`
- `apps/share/src/App.tsx`
- `apps/share/src/index.css`
- `apps/share/src/main.tsx`
- `apps/share/src/vite-env.d.ts`
- `apps/share/tsconfig.json`
- `apps/share/vite.config.ts`
- `apps/studio/index.html`
- `apps/studio/package.json`
- `apps/studio/src/App.tsx`
- `apps/studio/src/index.css`
- `apps/studio/src/main.tsx`
- `apps/studio/src/vite-env.d.ts`
- `apps/studio/tsconfig.json`
- `apps/studio/vite.config.ts`
- `docs/adr/ADR-001-fundacao-monorepo.md`
- `docs/adr/ADR-002-autenticacao-control-e-backend.md`
- `docs/architecture/FOUNDATION.md`
- `eslint.config.mjs`
- `package.json`
- `package-lock.json`
- `packages/contracts/package.json`
- `packages/contracts/src/index.ts`
- `packages/contracts/tsconfig.json`
- `packages/core/package.json`
- `packages/core/src/index.ts`
- `packages/core/tsconfig.json`
- `packages/design-system/package.json`
- `packages/design-system/src/index.ts`
- `packages/design-system/src/tokens.css`
- `packages/design-system/src/tokens.ts`
- `packages/design-system/tsconfig.json`
- `packages/permissions/package.json`
- `packages/permissions/src/index.ts`
- `packages/permissions/tsconfig.json`
- `packages/shared-utils/package.json`
- `packages/shared-utils/src/index.ts`
- `packages/shared-utils/src/shared-utils.test.ts`
- `packages/shared-utils/tsconfig.json`
- `packages/validation/package.json`
- `packages/validation/src/index.ts`
- `packages/validation/tsconfig.json`
- `prettier.config.mjs`
- `tsconfig.base.json`
- `vitest.config.ts`
- `vitest.setup.ts`

## Dependências e versões (fixadas)
### Raiz (`devDependencies`)
- `@eslint/js`: **9.39.4**
- `@testing-library/jest-dom`: **6.9.1**
- `@testing-library/react`: **16.3.2**
- `@types/node`: **24.12.2**
- `@types/react`: **19.2.14**
- `@types/react-dom`: **19.2.3**
- `@vitejs/plugin-react`: **5.2.0**
- `eslint`: **9.39.4** (deprecation warning informado pelo npm sobre suporte da linha 9.x; versão fixada por estabilidade/compatibilidade nesta fundação)
- `eslint-config-prettier`: **10.1.8**
- `eslint-plugin-react-hooks`: **7.0.1**
- `eslint-plugin-react-refresh`: **0.4.26**
- `globals`: **16.5.0**
- `jsdom`: **27.4.0**
- `prettier`: **3.8.3**
- `typescript`: **5.9.3**
- `typescript-eslint`: **8.73.0**
- `vite`: **7.3.8**
- `vitest`: **4.1.12**

### Apps (`dependencies`)
- `@hattz/control`: `@hattz/contracts` 0.1.0, `@hattz/core` 0.1.0, `@hattz/design-system` 0.1.0, `@hattz/permissions` 0.1.0, `@hattz/shared-utils` 0.1.0, `react` **19.2.0**, `react-dom` **19.2.0**
- `@hattz/share`: `@hattz/contracts` 0.1.0, `@hattz/core` 0.1.0, `@hattz/design-system` 0.1.0, `@hattz/shared-utils` 0.1.0, `react` **19.2.0**, `react-dom` **19.2.0**
- `@hattz/studio`: `@hattz/contracts` 0.1.0, `@hattz/core` 0.1.0, `@hattz/design-system` 0.1.0, `@hattz/shared-utils` 0.1.0, `@hattz/validation` 0.1.0, `react` **19.2.0**, `react-dom` **19.2.0**

> Justificativa resumida: React/Vite/TypeScript conforme aprovação; ESLint/Prettier/Vitest/Testing Library para qualidade e testes; jsdom para ambiente de testes UI; plugins React para lint/build; workspaces internos para contratos e design system compartilhados. Versões fixadas em `package.json` e travadas em `package-lock.json`.

## Instalação e auditoria de segurança
- **Instalação inicial:** `cmd /c "npm install"` — concluída (305 pacotes adicionados, 315 auditados). **Auditoria inicial:** 10 vulnerabilidades (8 moderate, 1 high, 1 critical) em cadeias de `typescript-eslint` (via `minimatch`), `vite` e `vitest/@vitest/mocker`.
- **Correção aplicada:** atualização de versões fixadas para releases corrigidas no mesmo/compatível escopo (`typescript-eslint` 8.73.0, `vite` 7.3.8, `vitest` 4.1.12 e ajustes de tooling compatíveis), seguida de reinstalação.
- **Reinstalação:** `cmd /c "npm install"` — concluída (300 pacotes auditados). `npm audit` reportou **found 0 vulnerabilities**.
- **Auditoria final (executada):** `cmd /c "npm audit"` → **found 0 vulnerabilities**.
- **Avisos npm (não vulnerabilidades):** deprecation de `eslint@9.39.4`; aviso de install scripts não cobertos por allowScripts para `esbuild` (postinstall). Nenhum `npm audit fix --force` foi aplicado.

## Resultado de typecheck, lint, testes e build (executados)
- `cmd /c "npm run format:write"` — **executado com sucesso** (arquivos normalizados quando necessário).
- `cmd /c "npm run lint:fix"` — **executado com sucesso**.
- `cmd /c "npm run typecheck"` — **APROVADO** (workspaces: control, share, studio, contracts, core, design-system, permissions, shared-utils, validation).
- `cmd /c "npm run lint"` — **APROVADO**.
- `cmd /c "npm run format"` — **APROVADO** (`All matched files use Prettier code style!`).
- `cmd /c "npm run test"` — **APROVADO** (Vitest v4.1.12: 1 arquivo de teste, 4 testes aprovados).
- `cmd /c "npm run build"` — **APROVADO** após correção (Vite v7.3.8; builds de `@hattz/control`, `@hattz/share`, `@hattz/studio` concluídos com artefatos em `dist/`).

## Commits locais realizados
- `0fc9df2` — `chore: add base gitignore` (commit inicial com arquivo-base conferido)
- `1316604` — `chore: bootstrap phases 0-1 foundation (workspaces, tooling, apps, packages, docs, ci)` (estrutura, tooling, apps, pacotes, CI, docs, lockfile e status da fundação)

## Problemas encontrados e respectivas correções
1. **`npm` bloqueado no PowerShell por ExecutionPolicy (`npm.ps1`)**: contornado executando via `cmd /c "npm ..."`.
2. **Commit inicial falhou por separador `&&` no PowerShell e ausência de identidade git local**: configurada identidade local do repositório (`Hattz Builder <builder@hattz.local>`) e commit realizado com comandos compatíveis.
3. **Vulnerabilidades na instalação inicial (10)**: dependências de tooling atualizadas para versões corrigidas (vite/vitest/typescript-eslint e relacionadas), reinstalação e auditoria final com **0 vulnerabilidades**.
4. **Falha de build (Vite) ao importar `@hattz/design-system/tokens.css`**: alias do pacote apontava para `index.ts`, gerando resolução inválida (`.../index.ts/tokens.css`). **Correção:** adicionado alias explícito `@hattz/design-system/tokens.css` para `packages/design-system/src/tokens.css` nos `vite.config.ts` das apps e no `vitest.config.ts`; build passou.

## Pendências e limitações (Fases 0-1)
- **Fase 2+ não iniciada** (migrations/Supabase, persistência local completa, publicação/sync, funcionalidades dos 8 blocos, etc.) — aguarda aprovação.
- **Sem backend/Fastify e sem autenticação própria do Control** nesta etapa (conforme decisão); auth administrativa isolada permanece em planejamento/avaliação.
- **Supabase não conectado/criado**; `.env.example` contém apenas placeholders.
- Ambiente local em **Node v26.13.0** (referência definida: 24 LTS/CI) — validado aqui, mas recomenda-se alinhar ao LTS em desenvolvimento contínuo.
- `eslint@9.39.4` possui aviso de depreciação da linha 9.x (sem vulnerabilidade reportada pelo audit); migração para linha suportada pode ser avaliada futuramente com cuidado de compatibilidade.
- Testes atuais cobrem fundação mínima (`shared-utils`); suíte abrangente (API, permissões/RLS, sync/publicação, UI/e2e, acessibilidade, segurança) será desenvolvida nas fases futuras.

## Restrições respeitadas
- Nenhum projeto externo/banco/conta/serviço criado ou conectado; nenhum deploy/publicação; sem credenciais/segredos no código.
- Nenhum acesso/alteração/exclusão de projetos, bancos ou serviços antigos.
- Sem repositório remoto e sem `git push`.
- Sem dados fictícios apresentados como dados reais.
- Nenhum teste declarado como aprovado sem execução.
- Funcionalidades completas dos oito blocos não implementadas nesta etapa.
