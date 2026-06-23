# Taxa de Entrega (Frete) — Dolci Dri

Cálculo automático da taxa de entrega no formulário de encomenda, a partir da distância
de estrada entre o endereço-base da Dolci Dri e o endereço do cliente.

## Fórmula em vigor

```
taxa = BASE + (POR_KM × km)
```

| Parâmetro | Valor atual | Onde fica |
|---|---|---|
| **Endereço-base** | Rua Pessegueiro, 44 — Carniel, Gramado/RS | `FRETE_ORIGEM` em `appsscript/Code.gs` |
| **BASE (taxa de saída)** | **R$ 7,00** (`700` centavos) | `FRETE_BASE_CENT` em `Code.gs` |
| **POR_KM** | **R$ 1,50/km** (`150` centavos) | `FRETE_POR_KM_CENT` em `Code.gs` |
| **Arredondamento** | km arredondado **pra cima a cada 0,1 km** (`Math.ceil(km*10)/10`) | `calcularFrete_` |
| **Taxa mínima** | = a própria BASE (R$ 7,00) | `calcularFrete_` |

### Exemplos (com os valores atuais)

| Destino | km estrada | Taxa |
|---|---|---|
| Vizinhança / Centro Gramado | ~1,5 km | **R$ 9,25** |
| Bairro mais distante em Gramado | ~4,0 km | **R$ 13,00** |
| Avenida central de Canela | ~8,0 km | **R$ 19,00** |

> Valores monetários sempre em **centavos** internamente; a UI formata em pt-BR (`R$ 9,25`).

## Estudo de mercado (base da decisão — jun/2026)

Pesquisa de valores praticados no Brasil (2025/2026) e na região serrana RS:

| Componente | Faixa praticada | Fonte |
|---|---|---|
| Por km rodado | R$ 1,50 – 3,00/km (média atual R$ 1,50–2,30) | motoboy particular |
| Custo operacional real | ~R$ 0,70/km (combustível + manutenção) | base de cálculo |
| Taxa mínima de saída | R$ 8,00 – 10,00 (raio curto, até 3–5 km) | padrão delivery |
| iFood (referência) | R$ 6,50/rota + R$ 1,50/km | tabela iFood |

**Contexto Gramado/Canela:** distâncias curtas — dentro de Gramado ~1–6 km; Gramado ↔ Canela ~7–9 km
por estrada. Optou-se por **BASE R$ 7,00 + R$ 1,50/km** (estilo iFood) para **frear o teto** de Canela
(~R$ 19,00 em vez de ~R$ 23,00 com R$ 2,00/km), mantendo margem acima do custo operacional.

Fontes consultadas:
- https://55content.com.br/reportagem/quanto-cobrar-por-km-rodado-na-moto/
- https://controlenamao.com.br/blog/como-calcular-a-taxa-de-entrega-de-delivery-por-km/
- https://saipos.com/sistema/delivery/como-calcular-frete-delivery
- https://anota.ai/blog/como-calcular-a-taxa-de-entrega/

## Como atualizar os valores no futuro

Editar **apenas** as constantes no topo do `appsscript/Code.gs` e **reimplantar** o Apps Script
(Gerenciar implantações → Editar → Nova versão). O front não precisa de deploy para mudança de valor:

```js
var FRETE_BASE_CENT   = 700; // taxa de saída: R$ 7,00  → altere aqui
var FRETE_POR_KM_CENT = 150; // R$ 1,50 por km          → altere aqui
var FRETE_ORIGEM      = 'Rua Pessegueiro, 44, Carniel, Gramado, RS, Brasil';
```

Se mudar o endereço-base da confeitaria, atualize `FRETE_ORIGEM` (e o rodapé do `index.html`).

## Arquitetura (por que via Apps Script)

O site é estático. A Google Distance Matrix **não** pode ser chamada direto do navegador
(bloqueio CORS) e expor a chave no JS seria risco de segurança. Por isso:

```
Navegador (script.js)  --JSONP-->  Apps Script (?action=frete&destino=...)
                                        │  (chave escondida em PropertiesService)
                                        ▼
                                Google Distance Matrix
                                        │  km de estrada real
                                        ▼
                              { ok, km, taxaCentavos }  --> exibe ao cliente
```

- **Frontend** (`script.js`): `calcularFrete()` monta o destino (`logradouro, número, bairro, cidade/RS`),
  chama o backend via **JSONP** (`jsonp()` — contorna CORS do GET), exibe
  *"Taxa de entrega estimada: R$ X (Y km)"* abaixo do número do endereço.
  Dispara no evento `change` do campo número (1 chamada por preenchimento, não por tecla).
- **Backend** (`Code.gs`): `calcularFrete_(destino)` chama a Google com a chave guardada,
  aplica a fórmula e devolve centavos. Rota: `doGet` → `action === 'frete'`.
- A taxa estimada também entra na mensagem do **WhatsApp** e no **e-mail** do pedido
  (`getFreteTexto`), para a Adriana receber o valor junto com a encomenda.

## Configuração obrigatória — chave da API Google

A chave **nunca** fica no código. Cadastrar no Apps Script:

1. `script.google.com` (conta `dolcidri@gmail.com`) → projeto Dolci Dri
2. **Configurações do projeto** (engrenagem) → **Propriedades do script** → Adicionar:
   - Propriedade: `GOOGLE_MAPS_KEY`
   - Valor: a chave da **Distance Matrix API** (Google Cloud → APIs e serviços → Credenciais)
3. No Google Cloud, **ativar a Distance Matrix API** e (recomendado) restringir a chave por API.

Sem a chave cadastrada, o site exibe *"Taxa de entrega a confirmar pela Adriana"* e o
pedido segue normalmente — não trava o fluxo.

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| Sempre "a confirmar" p/ **todos** os endereços (inclusive os próprios) | escopo `script.external_request` **não autorizado** — reimplantar **não** concede autorização (ver "Autorização do UrlFetchApp" abaixo) | rodar uma função no editor e aceitar a permissão "Conectar-se a serviço externo" |
| Sempre "a confirmar pela Adriana" | `GOOGLE_MAPS_KEY` ausente ou Distance Matrix API desativada | cadastrar a chave / ativar a API |
| "a confirmar" só p/ alguns endereços | endereço não geocodificado (`ZERO_RESULTS`/`NOT_FOUND`) | conferir CEP/número; é fallback seguro |
| Taxa não aparece após mudar valor no `Code.gs` | Apps Script não reimplantado | Gerenciar implantações → Nova versão |
| Taxa não recalcula ao trocar número | gatilho é `change` (blur) | clicar fora do campo número |

### ⚠️ Autorização do `UrlFetchApp` (pegadinha — resolvido em 22/06/2026)

O frete foi o **primeiro** recurso a fazer chamada HTTP externa (`UrlFetchApp.fetch`). Isso exige
um **escopo OAuth novo** (`https://www.googleapis.com/auth/script.external_request`) que o projeto
nunca tinha. **Reimplantar não concede esse escopo** — ele só é concedido quando se **executa uma
função no editor** e se aceita a tela "Autorização necessária".

Sintoma exato: bater no endpoint retornava **HTML de erro** (não JSON):
`Exception: Você não tem permissão para chamar UrlFetchApp.fetch` — e o site, recebendo lixo no
lugar de JSON, caía no fallback *"a confirmar pela Adriana"* para **todos** os endereços.

**Como conceder a autorização** (só precisa uma vez por projeto):
1. Editor do Apps Script → criar/usar uma função **sem** underscore que chame o frete (o editor
   novo **esconde do seletor** funções terminadas em `_`, como `calcularFrete_`):
   ```javascript
   function testarFrete() {
     Logger.log(calcularFrete_('Avenida Borges de Medeiros, 1000, Centro, Gramado, RS, Brasil'));
   }
   ```
2. Salvar → selecionar `testarFrete` no seletor → **Executar**.
3. **"Autorização necessária"** → Revisar permissões → conta `dolcidri@gmail.com` → Avançado →
   "Acessar Dolci Dri (não seguro)" → **Permitir**.
4. O registro deve mostrar `{ok=true, km=..., taxaCentavos=...}`. Pronto — vale para a URL pública
   na hora (web app roda "como eu"), sem reimplantar.

## Custo da API Google (na prática: R$ 0 para a Dolci Dri)

O Google cobra por **element** = 1 origem × 1 destino. No nosso uso **cada cálculo de
frete = 1 element** (a base × 1 endereço do cliente).

| Faixa mensal | Preço |
|---|---|
| **Até 5.000 elements/mês** | **Grátis** (cota mensal gratuita) |
| 5.001 – 100.000 | US$ 10,00 / 1.000 elements |
| Acima de 100.000 | US$ 8,00 / 1.000 elements |

Além da cota gratuita, contas Google Maps Platform ainda têm um **crédito mensal de
US$ 200** que abate o uso.

**Dimensionamento Dolci Dri:** mesmo num cenário folgado de ~300 pedidos/mês, isso é ~6%
da cota gratuita (300 de 5.000) → **fica de graça, sem encostar no crédito de US$ 200**.
Só passaria a custar acima de 5.000 cálculos/mês — irreal para a confeitaria.

⚠️ **Dois cuidados ao ativar:**
1. **Exige cartão de crédito** cadastrado no Google Cloud para habilitar a API (mesmo no
   tier gratuito). Dentro da cota não cobra nada, mas o billing precisa existir.
2. **Restringir a chave** (Google Cloud → Credenciais → restringir por API: só Distance
   Matrix). A chave já fica escondida no Apps Script (`PropertiesService`), mas restringir
   evita surpresa caso vaze.

> **Nota de futuro:** o Google marcou a Distance Matrix como **Legacy** e recomenda migrar
> para a **Routes API** (Compute Route Matrix). Por ora a Distance Matrix funciona normalmente
> e é mais simples; migração fica como ajuste futuro do `Code.gs`, sem pressa.

## Dependências

- **Google Distance Matrix API** (Google Cloud, cobrança por uso — cota gratuita mensal de
  5.000 elements; ver seção "Custo da API Google" acima).
- **Apps Script** (mesmo backend dos pedidos) — ver `docs/PAINEL-PEDIDOS.md`.
- Front estático no Vercel (deploy automático no push ao `main`).
