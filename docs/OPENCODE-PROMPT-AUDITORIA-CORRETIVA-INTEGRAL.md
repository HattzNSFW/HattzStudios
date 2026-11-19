# OpenCode — auditoria corretiva integral do Hättz 2.0

Você recebeu uma exportação corrigida do Hättz 2.0. Sua tarefa é continuar a auditoria e corrigir, no próprio repositório, todos os defeitos que conseguir reproduzir. Não trate relatórios anteriores como prova: inspecione o código e gere evidências novas.

## Regras obrigatórias

1. Leia primeiro `docs/AUDITORIA-INDEPENDENTE-CORRECOES-2026-11-19.md`, `docs/RELATORIO-FINAL-22-ITENS-2026-11-19.md`, `DEVELOPMENT_STATUS.md`, `README.md`, os quatro ADRs e a documentação de banco/RLS.
2. Os nomes canônicos dos oito blocos são os da seção 2 do relatório final. Não renomeie nem substitua a estrutura por uma lista genérica.
3. Faça inventário antes de alterar arquivos. Preserve o histórico Git existente; não use reset, rebase, amend, squash ou force push.
4. Não faça push, deploy, publicação remota, criação de projeto Supabase, conexão com banco antigo, nem execução de migrations remotas.
5. Não grave credenciais, tokens, service-role keys, senhas ou arquivos `.env` reais no repositório, logs, relatório ou ZIP.
6. Não enfraqueça RLS, grants, validações, `assertAdminSession`, `TrustedAdminSession` ou `TrustedOwnershipAuthority`. Não introduza `SECURITY DEFINER`, `BYPASSRLS` ou autoridade administrativa baseada em cargo público/local.
7. Não simule autenticação administrativa, catálogo autoritativo remoto, sincronização remota ou publicação pública. Se depender de credenciais, ambiente externo ou decisão do Owner, deixe bloqueado e documente exatamente o motivo.
8. Não declare uma etapa concluída só porque os comandos foram iniciados. Registre código de saída, versão das ferramentas, contagem real de testes e limitações.
9. Corrija diretamente os defeitos reproduzíveis. Não entregue apenas documentação ou uma lista de sugestões.
10. Antes de qualquer operação destrutiva, pare e peça autorização. Para testes PostgreSQL, use somente banco novo, descartável e com nome exclusivo; nunca apague nem reutilize bancos existentes.

## Etapa 1 — baseline e ambiente

- Confirme branch, HEAD, status do working tree e commits. Preserve tudo.
- Confirme que o ZIP/repositório corresponde à versão recebida; não suponha que hash declarado em relatório corresponda ao arquivo.
- Use Node 24 LTS (ou Node 26 suportado pelo `engines`) e npm >= 11. No Windows, se PowerShell bloquear `npm.ps1`, execute via `cmd /c npm ...`.
- Instale dependências exatamente pelo lockfile (`npm ci`), sem atualizar versões nem regenerar lockfile sem causa demonstrada.
- Se o ambiente não conseguir instalar dependências, não simule testes: informe o erro exato e continue com análise estática.

## Etapa 2 — reproduzir e corrigir qualidade

Execute e corrija até passar:

- `npm run typecheck`
- `npm run lint`
- `npm run format`
- `npm run test`
- `npm run build`
- `npm audit` e `npm audit --omit=dev`

Revise especialmente o novo teste de corrida de mídia em `tests/share/localPublicationSource.test.ts` e a invalidação por geração em `apps/share/src/data/localPublicationSource.ts`. Confirme que navegações concorrentes e respostas fora de ordem não deixam URLs de mídia obsoletas, não revogam URLs ainda usadas e não resolvem mídia de outro perfil. Se o teste revelar falha, corrija a implementação e acrescente regressões.

Faça uma revisão manual adicional de:

- autosave, concorrência otimista e transações Dexie;
- publicação/despublicação, histórico e snapshots imutáveis;
- export/import/backup/restore, limites de tamanho e validação de mídia;
- rotas e estados do Share, SEO/OG/canonical/robots;
- segurança de URLs, mídia, HTML e conteúdo extensível;
- estados de erro, retry, unmount, navegação rápida e múltiplas abas;
- acessibilidade, responsividade e identidade Liquid Glass;
- boundaries de Control, permissões, roles, benefícios e colecionáveis.

## Etapa 3 — revisar os oito blocos canônicos

### BLOCO 1 — FUNDAÇÃO E ARQUITETURA

Verifique estrutura, contratos, imports, aliases, design system, acessibilidade, responsividade, compatibilidade e CI. Corrija inconsistências sem introduzir dependências pagas ou desnecessárias.

### BLOCO 2 — BANCO DE DADOS E PERSISTÊNCIA

Revise migrations `0001`–`0013`, grants, RLS, views públicas, triggers, constraints, `search_path`, privilégios por coluna, paridade TS↔SQL e harness.
Se PostgreSQL local estiver disponível, rode o harness em banco descartável novo. Preserve todos os bancos anteriores. Não use Supabase remoto.
Aponte explicitamente o que só pode ser validado em Auth/JWT/PostgREST/Storage reais.

### BLOCO 3 — HÄTTZ SHARE

Garanta que só snapshots publicados/públicos/ativos sejam expostos, com projeção explícita e sem campos internos. Fixtures de demonstração devem ser claramente identificados e nunca confundidos com dados reais. Corrija falhas de mídia, rotas, metadados e mensagens públicas.

### BLOCO 4 — HÄTTZ STUDIO

Verifique todos os oito blocos do editor, persistência local, autosave, concorrência, mídia, publicação local, histórico, import/export/backup/restore e acessibilidade. Importação deve regenerar IDs, validar payloads e limitar tamanho/recursos para evitar abuso ou corrupção.

### BLOCO 5 — COLECIONÁVEIS, CARGOS E PERMISSÕES

Revise raridades, disponibilidades, coleções, conclusão de sets, badges especiais, frames e herança de benefícios. Mantenha cargos privados fora da seleção pública. Posse local não é autoridade. Só Owner por autoridade confiável pode conceder/revogar benefícios.
Implemente catálogo local somente quando as definições e regras aprovadas estiverem documentadas. Não invente itens, disponibilidade ou privilégios. O catálogo remoto autoritativo depende de backend confiável e permanece bloqueado sem ele.

### BLOCO 6 — HÄTTZ CONTROL

O Control atual é somente leitura. Preserve isso enquanto não houver autenticação administrativa real e backend confiável.
Não adicione botões de concessão/revogação que não funcionem. Não crie sessão Owner por role pública, localStorage, IndexedDB, flag ou parâmetro de URL.
Prepare apenas contratos/adapters fail-closed e testes de negação se isso for seguro. Operações de escrita reais dependem de identidade autenticada e autorização server-side.

### BLOCO 7 — INTEGRAÇÕES E SINCRONIZAÇÃO

Revise contratos, fila `pendingSyncOps`, idempotência, retry/backoff, conflitos, cancelamento e reconciliação. Não marque a fila como sincronizada sem confirmação do servidor. Se não houver backend real, implemente apenas partes locais testáveis e mantenha status remoto como pendente.

### BLOCO 8 — INFRAESTRUTURA, OPERAÇÕES E LANÇAMENTO

Revise CI, scripts, auditorias, documentação, builds e instruções Windows. Não configure domínio, HTTPS, produção, deploy ou secrets sem autorização explícita.
Corrija a linguagem dos documentos: o projeto está preparado para a próxima etapa de integração, não pronto para lançamento público enquanto Supabase real, Control administrativo, sync remoto e catálogo autoritativo estiverem pendentes.

## Etapa 4 — correções e evidências

- Corrija todos os defeitos reproduzíveis que não dependam de decisões/credenciais.
- Adicione testes de regressão para cada correção.
- Não reduza cobertura, não remova testes para obter PASS e não altere expectativas só para mascarar falhas.
- Não atualize dependências por conveniência; atualize apenas se houver vulnerabilidade/bug confirmado e explique a alteração.
- Não modifique migrations já aplicadas em ambientes existentes de forma destrutiva. Se uma correção de schema for necessária, crie migration nova e teste em banco descartável.
- Faça revisão final de diff, segredos, arquivos gerados, `git status` e `git diff --check`.

## Etapa 5 — entrega

Entregue:

1. resumo dos defeitos encontrados, severidade e causa;
2. lista de arquivos corrigidos;
3. testes executados com versões, contagens e códigos de saída;
4. itens que continuam bloqueados e dependência exata (credencial, serviço, decisão do Owner ou autorização);
5. decisões de negócio que você não inventou;
6. novo ZIP limpo do HEAD final, sem `.git`, `node_modules`, `dist`, caches, logs ou `.env` real;
7. SHA-256 calculado do ZIP;
8. confirmação de que não houve push, deploy, conexão remota nem operação destrutiva.

**Critério de conclusão:** “corrigido” significa alteração real + teste de regressão + validação executada. O que não puder ser validado deve ser rotulado como pendente, nunca como concluído.
