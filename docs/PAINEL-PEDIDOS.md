# Painel de Pedidos (Admin) — Dolci Dri

Painel administrativo (`admin.html`) para acompanhar e gerenciar os pedidos que chegam pelo site. Lê e grava na planilha do Google via Apps Script (`appsscript/Code.gs`).

## O que faz

- Lista todos os pedidos cadastrados (mais recentes primeiro), com filtro por status.
- Permite avançar/recuar o status de cada pedido seguindo um fluxo de negócio definido.
- Cada pedido tem **número sequencial** (`#001`) e, quando confirmado, **valor de orçamento** e **data de entrega** em destaque.
- **Busca** por nome, telefone ou nº do pedido (varre todos os status) e **visões por data de entrega** (Hoje / Atrasados / 7 dias).
- **Editar dados** de qualquer pedido (nome, telefone, produto, quantidade, entrega, detalhes) — conserta cadastros errados.
- **Faturamento por período** (botão "📊 Caixa"): soma o que foi entregue e o que está a receber.
- **Taxa de entrega** calculada no site é **persistida** no pedido e exibida no card.
- Acesso protegido por **senha + token de servidor** (ver "Segurança" abaixo) — a listagem e as alterações exigem token válido.

## Fluxo de status (regra de negócio)

```
            ┌──────────────► Cancelado   (orçamento não aprovado)
Pendente ───┤
            └──► Confirmado ─┬──► Atendido    (orçamento aprovado e pedido entregue)
            (orçamento        └──► Cancelado  (desistência, mesmo após aprovação)
             aprovado)
```

| Status | Significado | Para onde pode ir |
|---|---|---|
| **Pendente** | Pedido entrou pelo site, aguardando análise/orçamento | Confirmado, Cancelado |
| **Confirmado** | Orçamento aprovado, na fila de produção. Tem **valor** e **data de entrega** | Atendido, Cancelado |
| **Atendido** | Orçamento aprovado e pedido entregue. Registra a **data de entrega efetiva** | Reabrir → Confirmado |
| **Cancelado** | Não aprovado, ou desistência após aprovação | Reabrir → Pendente |

### Confirmação de troca de status

Toda troca que **sai de** um estado já processado (`Confirmado`, `Atendido` ou `Cancelado`) exige **modal de confirmação** que nomeia o pedido (`#012`) e avisa o status atual. Sair de `Pendente` para `Cancelado` também pede confirmação (ação destrutiva). Confirmar um pedido (`Pendente → Confirmado`) abre o modal de **valor** em vez de uma confirmação simples.

## Valor do orçamento

- Definido pela Adriana ao **confirmar** o pedido (botão "Confirmar pedido") ou via "Editar" num pedido já confirmado.
- Input estilo **calculadora**: dígitos entram pela direita (`1` → `0,01`, `123456` → `1.234,56`).
- Armazenado sempre em **centavos** (inteiro) na planilha; a formatação `R$ 1.234,56` (pt-BR) é só na UI.

### Data de entrega editável

- O modal "Confirmar pedido" / "Editar" tem um `<input type="date">` pré-preenchido com a data atual; a Adriana pode ajustar antes de confirmar.
- Convertida de/para `YYYY-MM-DD` (`paraInputDate` / `inputDateParaBR`) e gravada na planilha no padrão `DD/MM/AAAA`. Persistida pelas ações `atualizarStatus` e `definirValor` (campo `data`).

### Data de entrega efetiva (confirmação de entrega)

- Ao marcar como **Entregue** (Confirmado → Atendido), abre o modal "Confirmar entrega" pedindo a **data da entrega efetiva** (`<input type="date">`, default = data prevista, ou hoje se vazia).
- Gravada na coluna 16 **`Entregue em (efetiva)`** (DD/MM/AAAA), separada de `Atendido em` (coluna 11), que continua sendo o timestamp da baixa no sistema.
- No card do pedido Atendido, o destaque mostra "Entregue em" usando a data efetiva (fallback para a prevista em registros antigos); a meta exibe "Baixa registrada em" com o timestamp.
- Enviada no payload `atualizarStatus` como campo `entregueEm`. Limpa ao reabrir/cancelar.

## Número do pedido

- Sequencial inteiro (`1, 2, 3...`), atribuído **no backend** (`proximoNumero_` lê o maior número existente + 1) no momento em que o pedido chega.
- Exibido com zero-padding de 3 dígitos: `#001`. Pedidos antigos sem número caem no fallback `#<últimos 4 dígitos do id>`.

## Datas

- **Data de entrega / pedido em**: exibidas em `DD/MM/AAAA`. O helper `soData()` fatia a porção de calendário de qualquer valor (ISO `2026-06-26T03:00:00.000Z`, `YYYY-MM-DD` ou já em BR), garantindo que a data **nunca cruze de dia por fuso** (padrão UTC-3 / `T12:00:00Z`).
- **Carimbos de tempo** (confirmado/atendido/cancelado em): `DD/MM/AAAA HH:MM` via `dataHora()`, com `timeZone: "America/Belem"`.

## Modelo de dados (planilha `Pedidos`)

Colunas (na ordem da planilha). As 4 últimas foram **acrescentadas ao fim** — migração suave em `getSheet_()` preenche o cabeçalho em planilhas antigas sem desalinhar dados existentes.

| # | Coluna | Origem |
|---|---|---|
| 1 | ID | timestamp (ms) gerado no `novoPedido` |
| 2 | Enviado em | `dd/MM/yyyy HH:mm` (America/Sao_Paulo) |
| 3–9 | Nome, Telefone, Produto, Quantidade, Data desejada, Entrega, Detalhes | formulário do site |
| 10 | Status | `Pendente` na entrada |
| 11 | Atendido em | carimbo ao marcar Atendido |
| 12 | Número | sequencial, atribuído no backend |
| 13 | Valor (centavos) | definido ao confirmar |
| 14 | Confirmado em | carimbo ao confirmar |
| 15 | Cancelado em | carimbo ao cancelar |
| 16 | Entregue em (efetiva) | data da entrega efetiva (DD/MM/AAAA) |
| 17 | Frete (centavos) | taxa de entrega estimada no momento do pedido (vazio em retirada) |

## Segurança (Fase 1)

> **Princípio:** acesso o mais seguro possível dentro de um site estático + Apps Script. Listagem e mutações exigem um **token secreto** guardado **só no servidor** (PropertiesService); a senha **saiu do código-fonte**.

- **Sem senha no código.** A Adriana digita a senha no painel; ela é enviada ao backend (`action=login`), que compara com `ADMIN_SENHA` e devolve o **`ADMIN_TOKEN`**. O painel guarda o token no `localStorage` e o envia em toda listagem/mutação. Quem não tem a senha não obtém o token e não lista/altera nada.
- **`listar`, `atualizarStatus`, `definirValor` exigem `token`** válido — sem ele o backend responde `{ ok:false, erro:'NAO_AUTORIZADO' }` e o painel volta ao login. (`frete`, `novoPedido` e `login` seguem públicos — são do site do cliente.)
- **Gravação confirmável (fim do silent-failure):** tudo passa por **GET + JSONP**, que **lê a resposta** (o POST `no-cors` antigo não lia). Se o servidor recusar/falhar, o painel mostra erro e **re-sincroniza** (`carregarPedidos()`) — nada some com toast verde mentiroso.
- **`LockService` + dedup:** `novoPedido` roda sob trava de script (sem corrida de número) e ignora duplo-clique (mesmo nome+telefone+produto+data no mesmo minuto → devolve o nº já gravado).
- **Validação server-side:** `validarNovoPedido_` rejeita nome/telefone(<10 díg.)/produto/quantidade/data ausentes — não confia só no front.

### Setup do token (uma vez, no editor do Apps Script)

1. `script.google.com` (conta `dolcidri@gmail.com`) → projeto Dolci Dri.
2. Selecione a função **`setupAdmin`** no seletor → **Executar** (aceite a autorização se pedir).
3. O **registro de execução** mostra `ADMIN_SENHA` e `ADMIN_TOKEN`. A senha padrão é `dolcidri2026` — troque depois em **Propriedades do script** se quiser. O token o painel obtém sozinho ao logar; não precisa copiá-lo.
4. **Reimplante** o `Code.gs` (Nova versão) — necessário porque o front novo chama `action=login`, que o backend antigo não tem.

## Ações do backend (`doGet` + JSONP em `Code.gs`)

| `action` | Token? | Efeito |
|---|---|---|
| `login` | — | Troca senha por token (`{ ok, token }` ou `{ ok:false, msg }`) |
| `listar` | ✅ | Devolve todos os campos (incl. `numero`, `valor`, `confirmadoEm`, `canceladoEm`, `entregueEm`) |
| `novoPedido` | — | Valida → LockService → dedup → acrescenta linha `Pendente` + número sequencial; devolve `{ ok, numero }` |
| `atualizarStatus` | ✅ | Grava status + carimbo da transição; ao Confirmar grava o `valor`; ao voltar a Pendente zera valor/carimbos |
| `definirValor` | ✅ | Atualiza só o valor (Editar valor) |
| `editarPedido` | ✅ | Atualiza nome, telefone, produto, quantidade, entrega e detalhes (com validação server-side) |
| `frete` | — | Taxa de entrega (ver `docs/TAXA-ENTREGA.md`) |

## Faturamento (Fase 3)

Botão **"📊 Caixa"** no cabeçalho abre o modal de faturamento, com dois `<input type="date">` (De / Até, padrão = mês corrente):

- **Faturado (entregue):** soma do **valor do orçamento** dos pedidos **Atendidos** cuja **data de entrega efetiva** (coluna 16, com fallback para a prevista) cai no período. Mostra nº de pedidos e **ticket médio**.
- **A receber (confirmado):** soma do valor dos pedidos **Confirmados** com data de entrega no período (fila de produção).
- Lista os pedidos faturados (nº · nome · data · valor), ordenados por data de entrega.
- O **frete não entra** no faturamento — é informativo no card; a receita é o orçamento.

## Editar dados do pedido (Fase 3)

O botão **✎** no topo de cada card abre "Editar dados" (nome, telefone, produto, quantidade, entrega/retirada, detalhes). Atualização otimista + `editarPedido` confirmável; validação no backend (`validarEdicao_`: nome/produto/quantidade obrigatórios, telefone ≥ 10 dígitos). Resolve o antigo problema de telefone/produto errados ficarem travados (só valor/data eram editáveis).

`doPost` permanece como **compatibilidade** (clientes antigos em `no-cors`): `novoPedido` aberto, mutações exigem token.

## Comportamento da UI

- **Otimista + confirmado:** a troca de status atualiza a tela na hora e dispara o JSONP em paralelo; se o servidor recusar, mostra erro e recarrega a verdade. Novos pedidos do site aparecem após **Atualizar**.
- Feedback exclusivamente via **Toast** (sucesso/aviso/erro) e **modais** — sem `alert/confirm/prompt` nativos.
- Modais com estrutura header fixo + body rolável + footer fixo (`max-height: 90vh`), `z-index 10000`.
- Filtros sticky (com **quebra de linha** — todos os chips sempre visíveis) e contadores por status; título da aba mostra `(N)` pendentes / `⚠️` atrasados.

## Configuração (`admin.html`)

```js
var SCRIPT_URL = 'https://script.google.com/macros/s/.../exec';
var AUTH_KEY   = 'dolcidri_admin_ok';   // flag "logado" no localStorage
var TOKEN_KEY  = 'dolcidri_token';      // token recebido do servidor no login
// A senha NÃO fica aqui — vive em PropertiesService (ADMIN_SENHA), conferida no backend.
```

## Troubleshooting

- **Não loga / "Não foi possível verificar a senha"** → rodar `setupAdmin` no editor e **reimplantar** o `Code.gs` (o backend precisa ter a ação `login`).
- **"Sessão expirada. Entre novamente."** → o token guardado não bate com o do servidor (token regenerado, ou backend não reimplantado). Logar de novo; se persistir, conferir `ADMIN_TOKEN` nas Propriedades do script.
- **Pedidos sem número/valor após atualizar o `Code.gs`** → o Apps Script não atualiza sozinho. Reimplantar: `script.google.com` → colar o `Code.gs` → **Gerenciar implantações → Editar → Nova versão → Implantar** (manter a mesma URL).
- **"Erro ao carregar"** → conferir `SCRIPT_URL`, se a implantação está com acesso "Qualquer pessoa" e se há token (logar de novo).
- **Alteração não persiste** → agora o painel **avisa** em caso de falha e recarrega; conferir na planilha. Falha recorrente = backend não reimplantado ou token inválido.
- **Data aparecendo um dia errado** → não deveria ocorrer: `soData()` fatia a porção de calendário. Se ocorrer, verificar o fuso da planilha em Arquivo → Configurações.

## Dependências externas

- **Google Apps Script** (planilha `Dolci Dri — Pedidos`) — backend serverless gratuito.
- O painel é estático; nenhum build. Deploy junto com o site (Vercel, auto no push ao `main`).
