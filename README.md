# Hättz — plataforma integrada de perfis

O Hättz Share continua sendo o produto principal. O Studio é a experiência de edição integrada ao Share; o Core reúne contratos e utilitários compartilhados; o Control administra perfis, catálogo e benefícios. Share e Studio funcionam **sem login**; a autenticação administrativa permanece apenas no Control. A aplicação dos oito blocos está documentada em `docs/8-BLOCOS.md`.

## Executar localmente (recomendado)

Não é preciso Worker, D1, Supabase nem secrets. Com Node 18+ na pasta do projeto:

```bash
node server.mjs
```

Ou, no Windows, dê duplo clique em `iniciar.bat`.

| Página | URL |
| --- | --- |
| Share | http://127.0.0.1:4173/ |
| Studio (sem login) | http://127.0.0.1:4173/studio.html |
| Control (login admin) | http://127.0.0.1:4173/control.html |

Na primeira execução o servidor gera uma **chave administrativa** e a mostra no terminal. Ela também fica em `data/admin-key.txt`; use-a no campo “Chave administrativa” do Control. Para trocá-la, use a aba **Segurança** do Control (`PUT /api/admin/credential`, com confirmação `TROCAR`) ou edite o arquivo e reinicie. As duas formas revogam as sessões administrativas antigas e registram a rotação na auditoria. Em localhost isso não altera o Worker remoto; no remoto, a credencial ativa está em `admin_credential` (D1) e `HATTZ_ADMIN_PASSWORD` foi removido.

`share-config.js` detecta `localhost`/IP privado e aponta a API para `window.location.origin`; em domínio público, mantém o Worker remoto original.

O runtime local (`server.mjs`) usa apenas módulos nativos do Node e implementa: publicação/edição de perfis, mídias com Range, catálogo, VIP, cargos, tags, molduras, manutenção com upload de imagem/vídeo, storage, auditoria, eventos de IP, autenticação administrativa por sessão e o painel analítico agregado em `GET /api/admin/dashboard`. Os dados ficam em `data/local-state.json` e as mídias em `data/media/` — ambos preservados entre execuções e **nunca incluídos no ZIP**. `data/state.json` (legado) permanece intacto.

Para usar outra porta: `HATTZ_PORT=4300 node server.mjs`.

## Estrutura

- `index.html`, `style.css`, `script.js`, `share-config.js`: aplicação de perfis e editor original.
- `studio.html`, `studio.css`, `studio.js`: Hättz Studio com Card Lab, Avatar Lab, prévia ao vivo e catálogo.
- `control.html`, `control.css`, `control.js`: painel administrativo com visão geral analítica (6 KPIs, 4 gráficos SVG e 4 tabelas), perfis, armazenamento, manutenção, auditoria em tabela, VIP, cargos, tags e troca de credencial.
- `core/hattz-core.js`: contrato comum para API, validação e armazenamento local.
- `core/blocks.js`: camada dos 8 blocos — identidade local, coleções e estados salvo/sincronizado/publicado.
- `core/design-tokens.css`: tokens visuais compartilhados.
- `server.mjs`: runtime local — servidor estático + API Share/Control com persistência JSON e chave admin gerada.
- `backend/`: Cloudflare Worker, D1, Supabase Storage, migrações e testes (referência de produção).
- `docs/`: auditoria, roadmap e checklist de implantação.

## Arquitetura confirmada

- Frontend estático compatível com GitHub Pages e com o runtime local.
- API em Cloudflare Workers.
- Banco de dados em Cloudflare D1.
- Mídias compartilhadas em Supabase Storage (não R2).
- Configurações locais em `localStorage`; mídias locais em IndexedDB `MeuPainelDB` (versão 1, store `imagens`).
- Os perfis locais são identificados por `perfil-1` e `perfil-2`.

## Preservação dos perfis locais

O Studio grava apenas o objeto de configuração no slot já existente (`meuPerfil:perfil-1` ou `meuPerfil:perfil-2`). Não altera a versão do IndexedDB nem o store de mídias. A prévia ao vivo lê o mesmo armazenamento local.

Antes de substituir os arquivos publicados, abra a versão original no navegador que contém os perfis e exporte um backup individual de cada um. Os backups podem conter credenciais privadas de compartilhamento; mantenha-os em local privado. Não mude a origem/domínio do site, não limpe os dados do navegador e não use janela anônima para a migração.

## Hättz Studio

- Card Lab: Liquid Glass global e sobrescritas individuais por cartão.
- Avatar Lab: tamanho, espessura, deslocamento e iluminação.
- Hättz Frames: moldura Amethyst vetorial integrada e molduras preexistentes do editor.
- Catálogo de insígnias consultado pela API.
- As configurações novas são persistidas dentro de `profile.studio`, sem substituir os campos antigos do perfil.
- A moldura Amethyst exige concessão ao perfil no Control; o Worker valida isso antes de aceitar uma atualização publicada.

## Hättz Control e benefícios

- Catálogo com 11 insígnias e 10 cargos administráveis pelo Control, incluindo insígnias automáticas por marco e manualmente concedidas. O administrador pode editar/desativar os itens disponíveis.
- Concessão e revogação individual de cargos, insígnias e molduras, com listagem dos perfis que receberam cada cargo/insígnia.
- VIP individual com validade opcional e registro de auditoria.
- Benefício VIP implementado no backend: cota de mídia do perfil passa de 250 MiB para 500 MiB enquanto o VIP estiver ativo. O limite global lógico continua sendo 900.000.000 bytes.
- `Gênese` é concedida automaticamente na criação do perfil; `Conectado`, `Resonância` e `Pulso` seguem critérios automáticos. Insígnias do JSON editável do perfil são ignoradas; as demais vêm das concessões feitas no Control.
- Restaurar o perfil padrão apaga personalizações e mídias do perfil, mas preserva VIP, cargos, tags e molduras gerenciados separadamente pelo Control.

O monitoramento de armazenamento é baseado nos bytes e metadados registrados no D1 durante os uploads gerenciados pelo Worker. Não é uma varredura independente de todo o bucket Supabase; confira também o painel do Supabase para uso externo ou alterações manuais.

## Painel analítico do Control e credencial administrativa

A visão geral do Control é alimentada por `GET /api/admin/dashboard`, que agrega em uma única resposta autenticada:

- armazenamento (capacidade, uso, maior perfil, estimativa de novos perfis e maiores consumidores);
- perfis (total, oficiais, VIP ativos e contagem por status);
- mídias (total e distribuição por tipo/chave em bytes e quantidade);
- ecossistema (insígnias, molduras e cargos ativos e concessões) e acesso ao tema do Studio;
- atividade dos últimos 14 dias (auditoria, logins, falhas e eventos de IP) em série temporal;
- segurança (sessões ativas, limites de login bloqueados, eventos de IP e manutenção).

Os gráficos são SVG gerados no frontend, sem dependências externas. As rotas `GET`/`PUT /api/admin/credential` informam a origem da senha e permitem rotacioná-la; a troca exige `confirmation: "TROCAR"`, no mínimo 16 caracteres e revoga todas as sessões. No runtime local a chave é gravada em `data/admin-key.txt`; no Worker, em `admin_credential` (D1).

**Estado desta entrega:** dashboard, rotação e credencial no D1 estão aplicados no Worker público. A migration 0014 foi executada no D1 remoto, o Worker foi publicado e `HATTZ_ADMIN_PASSWORD` foi removido; a senha ativa é a gravada em `admin_credential`. O frontend do Control foi publicado no GitHub Pages preservando coleções, benefícios e o status de conexão já existentes.

- Worker: `https://hattz-share-api.kl-santdev.workers.dev`
- Site: `https://hattznsfw.github.io/HattzStudios/`

A camada visual premium (liquid glass, ícones SVG e acabamento estilo iPhone) está aplicada ao Studio e ao Control na build publicada (`0d5a61d`). Se o navegador mostrar o layout antigo, use um hard refresh (Ctrl+F5) para renovar o cache do GitHub Pages.

### Liquid Glass personalizável

Cada tela tem **seu próprio tema**: Share, Studio e Control são independentes. Use o pequeno botão glass com ícone de ajustes no canto inferior direito; o selo no topo do painel mostra qual tela está sendo editada. O painel é um cartão de vidro escuro com 4 presets em swatches, 10 sliders com trilha preenchida (opacidade, desfoque, saturação, arredondamento, borda, reflexo, brilho, glow, sombra e velocidade), 9 cores em swatches, JSON em “Código do tema”, reset e **“Aplicar a todos”** para igualar as três telas quando desejado.

O botão e o painel desaparecem automaticamente no **modo captura** do Share (`body.capture-mode`). As preferências ficam em `localStorage` (`hattz_liquid_glass_v2`, com migração automática do tema único `v1`) e não são enviadas ao servidor nem exigem login. A API `window.HattzLiquidGlass` expõe `scope`, `get(scope?)`, `getStore()`, `set(partial, scope?)`, `reset(scope?)`, `apply()` e `applyToAll()`.

Tudo passa pelos tokens `--lg-*` em `core/design-tokens.css`; o personalizador injeta uma ponte de tema em runtime que aplica um acabamento de vidro escuro (blur, saturação, brilho interno e sombra suave) a superfícies, botões, campos e acentos das três aplicações, sem quadrados duros nos itens ativos, além de atualizar os aliases legados (`--hattz-color-accent`, `--hattz-glass-bg`, `--hattz-radius-lg` etc.) para manter compatibilidade com o Share original.

As insígnias são exibidas como **emoji** (chips circulares de vidro) no Share e no Studio. `window.HattzEmoji.badge(item)` escolhe o emoji pelo ícone/nome/id do catálogo, com fallback para `✦`; o Control mantém seus próprios ícones.

## Configuração do backend

Entre em `backend/`:

```bash
npm install
npm test
```

Configure os secrets do Worker (nunca no frontend):

- `HATTZ_ADMIN_PASSWORD` (opcional; no remoto foi removido — a credencial do D1 passa a ser usada quando o secret não existe)
- `HATTZ_ADMIN_SESSION_SECRET` (obrigatório para emitir sessões)
- `HATTZ_IP_ENCRYPTION_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (legada) ou `SUPABASE_SECRET_KEY` (`sb_secret_*`)
- `IPQS_API_KEY` (opcional)

O `backend/wrangler.jsonc` contém a referência atual do D1 e a URL/bucket do Supabase. Confirme que a conta Cloudflare e o projeto Supabase correspondem ao ambiente desejado antes de usar Wrangler.

## Banco D1 — migrações 0005 e 0008

A migração `0005_ecosystem_catalogs.sql` cria catálogos, inventários por perfil e concessões VIP; também altera a regra de limite por perfil para 250 MiB (padrão) ou 500 MiB (VIP ativo). A migração `0008_empty_user_managed_catalogs.sql` limpa os cargos, tags, molduras e atribuições predefinidos para iniciar os catálogos vazios. Ela **não apaga `profile_entitlements`**, portanto preserva VIP e validade já concedidos. O teto global permanece igual.

**Não aplique remotamente sem backup e autorização.** Primeiro confira o estado real:

```bash
npx wrangler d1 migrations list hattz-share --remote
```

O backup do D1 e a aplicação das migrações no remoto foram executados nesta entrega. Revise `docs/DEPLOYMENT-CHECKLIST.md` antes de repetir qualquer mudança.

## Banco D1 — migração 0014 (credencial administrativa)

`backend/migrations/0014_admin_credential.sql` cria a tabela `admin_credential` (salt, hash PBKDF2-SHA256 e `updated_at`). Quando `HATTZ_ADMIN_PASSWORD` não está definido, `adminLogin()` valida a senha contra esse registro; a rotação via `PUT /api/admin/credential` atualiza o hash e apaga `admin_sessions`. A migration foi **aplicada ao D1 remoto**, a credencial foi gravada e validada, e o secret `HATTZ_ADMIN_PASSWORD` foi removido. A sequência correta é backup → migration → gravação da credencial → remoção do secret; removê-lo antes da gravação deixaria o login indisponível.

## Banco D1 — migração 0015 (cargos e insígnias estilo servidor)

`backend/migrations/0015_discord_style_catalog.sql` semeia o catálogo com cargos comunitários (Membro, Apoiador, Colaborador, Designer, Artista, Booster, Veterano e Parceiro) e insígnias colecionáveis por categoria/raridade. É aditiva: usa `INSERT OR IGNORE`, não apaga perfis nem atribuições e pode ser editada ou desativada pelo Control. A migration foi aplicada ao D1 remoto após backup e validada por consulta direta e por `/api/catalog`.

## Testes locais executados

```bash
npm test --prefix backend
node --check script.js
node --check control.js
node --check studio.js
node --check maintenance.js
node --check backend/src/index.js
node --check backend/tests/worker.test.js
```

A suíte local cobre o contrato compartilhado de perfil, limites dos ajustes de avatar/moldura, IDs dinâmicos, estrutura CSS/HTML, segurança do Worker, mídia, catálogos, permissões e proteções dos perfis oficiais, além do runtime local (login, rotação de chave, dashboard, credencial, sessões, manutenção, upload, publicação e estáticos). Nesta revisão, `npm test --prefix backend` executa **135 testes, todos aprovados**. As 17 migrações estão presentes no pacote; a 0014, a 0015 e a 0017 foram aplicadas ao D1 remoto. O texto não comprova comportamento visual em todos os navegadores nem disponibilidade do Supabase real. Consulte `docs/TEST-REPORT-v12.md` para os resultados e limites da base v12.

## Implantação e segurança

- Não exponha chaves Supabase ou tokens administrativos no frontend.
- Restrinja `ALLOWED_ORIGINS` às origens efetivas do site.
- Faça backup dos dois perfis locais e do D1 antes de atualizar.
- Não execute os scripts `.cjs` de reparação sem revisar seu diff.
- Não publique uma nova origem/domínio sem estratégia de migração de `localStorage` e IndexedDB.
- O deploy remoto, a migration 0014 e a remoção de `HATTZ_ADMIN_PASSWORD` foram executados manualmente nesta entrega; o pacote, por si só, não repete essas ações.

Consulte `docs/TECHNICAL-AUDIT.md`, `docs/ROADMAP.md` e `docs/DEPLOYMENT-CHECKLIST.md` para limites e tarefas restantes.


## Privacidade e IP Intelligence

O painel administrativo exibe somente sinais técnicos úteis para segurança: endereço IP sob acesso restrito, geolocalização aproximada fornecida pela Cloudflare (país/região/cidade), ASN/organização de rede, navegador, sistema operacional, tipo geral de dispositivo e sinais de VPN/proxy/Tor quando o provedor opcional estiver habilitado. O navegador/sistema/dispositivo são resumidos do User-Agent já recebido; o User-Agent bruto não é devolvido pela API administrativa.

O projeto não tenta inferir nome civil, endereço residencial, telefone, contas pessoais, identidade real, localização GPS ou deanonymizar visitantes. IP é dado pessoal e deve permanecer protegido, com acesso limitado e retenção mínima. A consulta IPQualityScore continua opt-in e restrita a eventos de segurança definidos no Worker.


## Histórico — Studio e raridades (v11)

- O Hättz Control permite selecionar vários cargos que liberam a edição do tema exclusivo no Studio.
- O servidor valida o cargo ativo e a chave privada do próprio perfil antes de salvar o tema. Um usuário não pode editar o tema de outro perfil.
- A v11 introduziu oito níveis de raridade; a v12 normaliza os catálogos para cinco níveis por meio da migration 0013.
- O Control aceita ícones PNG (até 128 KB) e molduras PNG (até 2 MB), além de emoji. Os ajustes de escala e posição mostram uma referência vazia da foto do perfil.
- O Studio oferece escala e deslocamento da moldura PNG sobre o avatar.

## Estado atual — v12

- Raridades: Comum, Rara, Épica, Lendária e Limitada.
- Insígnias podem ser públicas ou ocultas, com administração autenticada.
- Desativação de insígnias, molduras e cargos preserva as concessões históricas.
- O cron concede automaticamente insígnias elegíveis e exclui os dois perfis oficiais.
- O VIP dos perfis oficiais é protegido contra alterações administrativas comuns; a expiração automática de cargos também os exclui.
- Consulte `docs/RELEASE-NOTES-v12.md` e `docs/DEPLOYMENT-CHECKLIST-v12.md` antes de qualquer atualização.
- A migração `0009_studio_access_and_rarity.sql` é necessária antes de publicar a nova versão do Worker.


## Revisão v8 — integridade de armazenamento

A revisão v8 corrige a origem dos números de armazenamento do Control. A API soma os bytes registrados em `profile_media`, mostra a divergência do contador auxiliar e lista o consumo por perfil a partir dos próprios registros de mídia. A migration `backend/migrations/0010_reconcile_storage_counters.sql` repara os contadores derivados.

**Importante:** o painel mede mídias registradas no D1; não é uma leitura direta da ocupação física do bucket Supabase e não detecta objetos órfãos sem metadados. Nenhuma ação remota é executada automaticamente pelo pacote; a publicação desta revisão foi feita manualmente.

## Release v9
Veja `docs/RELEASE-NOTES-v9-tags-maintenance.md` para as tags iniciais por raridade, concessões automáticas/manuais e a correção do acesso aos perfis oficiais durante a manutenção.


## Revisão v10 — contrato de perfil e integridade do projeto

- `core/profile-contract.js` centraliza a normalização do Studio no frontend Share e Studio.
- Ajustes PNG `frameScale`, `frameX` e `frameY` agora são preservados ao normalizar e recarregar um perfil.
- IDs seguros de molduras cadastradas no Control deixam de ser reduzidos indevidamente à moldura Celestial no carregamento do perfil. A validação de concessão continua no Worker.
- O Studio usa o mesmo contrato de normalização e limita valores e sobrescritas de cartões.
- Testes de integridade verificam sintaxe JavaScript, equilíbrio estrutural CSS, IDs HTML, assets locais e ordem de carregamento dos scripts.
- Nenhuma migration foi adicionada nesta revisão; nenhuma alteração remota é necessária para os ajustes de frontend/contrato.


## Hättz Badges v11
As 12 insígnias iniciais usam artes PNG originais em `assets/badges/`. A migration `0012_badge_png_defaults.sql` associa cada item à sua imagem. Publique a pasta `assets/badges/` no Pages e aplique a migration no D1 após backup e autorização.


## Hättz v12
Consulte `docs/RELEASE-NOTES-v12.md` e `docs/DEPLOYMENT-CHECKLIST-v12.md` antes de qualquer publicação. A v12 inclui a migração aditiva 0013; nesta entrega, a migração 0014 e o deploy remoto foram aplicados e validados.
