# Painel de Pedidos (Admin) — Dolci Dri

Painel administrativo (`admin.html`) para acompanhar e gerenciar os pedidos que chegam pelo site. Lê e grava na planilha do Google via Apps Script (`appsscript/Code.gs`).

## O que faz

- Lista todos os pedidos cadastrados (mais recentes primeiro), com filtro por status.
- Permite avançar/recuar o status de cada pedido seguindo um fluxo de negócio definido.
- Cada pedido tem **número sequencial** (`#001`) e, quando confirmado, **valor de orçamento** e **data de entrega** em destaque.
- Acesso protegido por senha simples (gate client-side, `localStorage`).

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

## Ações do backend (`doPost` em `Code.gs`)

| `action` | Efeito |
|---|---|
| `novoPedido` | Acrescenta linha com `Pendente` + número sequencial |
| `atualizarStatus` | Grava status + carimbo da transição; ao Confirmar, grava o `valor`; ao voltar a Pendente, zera valor/carimbos |
| `definirValor` | Atualiza só o valor (Editar valor) |

`doGet?action=listar` devolve todos os campos (incl. `numero`, `valor`, `confirmadoEm`, `canceladoEm`).

## Comportamento da UI

- **Otimista**: a troca de status atualiza a tela na hora (com carimbo local) e dispara o POST `no-cors` em paralelo. Como `no-cors` não lê resposta, o número de novos pedidos só aparece após **Atualizar**.
- Feedback exclusivamente via **Toast** (sucesso/aviso/erro) e **modais** — sem `alert/confirm/prompt` nativos.
- Modais com estrutura header fixo + body rolável + footer fixo (`max-height: 90vh`), `z-index 10000`.
- Filtros sticky com contadores por status; título da aba mostra `(N)` pendentes.

## Configuração (`admin.html`)

```js
var SCRIPT_URL    = 'https://script.google.com/macros/s/.../exec';
var SENHA_CORRETA = 'dolcidri2026';   // gate client-side
var AUTH_KEY      = 'dolcidri_admin_ok';
```

## Troubleshooting

- **Pedidos sem número/valor após atualizar o `Code.gs`** → o Apps Script não atualiza sozinho. Reimplantar: `script.google.com` (conta `dolcidri@gmail.com`) → colar o `Code.gs` → **Gerenciar implantações → Editar → Nova versão → Implantar** (manter a mesma URL).
- **"Erro ao carregar"** → conferir `SCRIPT_URL` e se a implantação está com acesso "Qualquer pessoa".
- **Troca de status não persiste** → POST é `no-cors` (sem leitura de resposta); o toast de erro só dispara em falha de rede. Use **Atualizar** para conferir o estado real na planilha.
- **Data aparecendo um dia errado** → não deveria ocorrer: `soData()` fatia a porção de calendário. Se ocorrer, verificar o fuso da planilha em Arquivo → Configurações.

## Dependências externas

- **Google Apps Script** (planilha `Dolci Dri — Pedidos`) — backend serverless gratuito.
- O painel é estático; nenhum build. Deploy junto com o site (Vercel, auto no push ao `main`).
