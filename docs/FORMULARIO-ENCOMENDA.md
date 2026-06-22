# Formulário de Encomenda — Dolci Dri

Fluxo de pedido integrado ao WhatsApp e Gmail, com busca de CEP via ViaCEP e restrição geográfica.

## O que faz

O visitante preenche o formulário na seção `#encomenda` e envia o pedido de duas formas:
- **WhatsApp** (botão principal) — abre `wa.me/5554994047528` com a mensagem já montada.
- **E-mail** (botão secundário) — abre o Gmail Compose com assunto e corpo preenchidos.

## Campos do formulário

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| Nome | texto | sim | |
| Telefone | tel | sim | Mínimo 10 dígitos; auto-formatado `(XX) X XXXX-XXXX` |
| Produto | select | sim | Pré-selecionado ao clicar em "Encomendar" nos cards |
| Quantidade | texto | sim | Livre (ex.: "1 bolo / 50 doces") |
| Data desejada | date | sim | Mínimo: hoje + 3 dias (`siteConfig.minDaysAhead`); validado tanto no picker quanto ao digitar |
| Retirada ou Entrega | select | sim | "Retirada no local" ou "Entrega em endereço" |
| CEP de entrega | numeric | condicional | Aparece só se "Entrega em endereço"; busca ViaCEP ao completar 8 dígitos |
| Endereço (readonly) | texto | — | Preenchido automaticamente pela busca de CEP |
| Número e complemento | texto | condicional | Obrigatório quando entrega; ex.: "44, Apto 2" |
| Detalhes | textarea | não | Tema, pessoas, endereço livre |

## Fluxo de CEP

1. Usuário seleciona "Entrega em endereço" → bloco de CEP aparece.
2. Digita o CEP (auto-formatado `00000-000`).
3. Ao completar 8 dígitos → `fetch("https://viacep.com.br/ws/{cep}/json/")`.
4. Validação de cidade:
   - Cidades aceitas: **Gramado** e **Canela** (estado RS).
   - Fora da lista → toast de erro "Só entregamos em Gramado e Canela/RS."
5. CEP válido → preenche campo readonly com `"Rua, Bairro, Cidade/RS"` e foca em "Número e complemento".
6. Mensagem final inclui: `Entrega: Rua X, 44, Bairro Y, Gramado/RS (CEP 95670-000)`.

## Mensagem WhatsApp

Emojis renderizados via `String.fromCodePoint` (evita problema de encoding de arquivo):

```
Olá, Dolci Dri! 🍰 Quero fazer uma encomenda.

📋 *DADOS DO PEDIDO*
👤 Nome:          ...
📱 Telefone:      ...
🎂 Produto:       ...
🔢 Quantidade:    ...
📅 Data desejada: DD/MM/AAAA
📦 Entrega:       ...

📝 Detalhes: ...

─────────────────────
Pedido via dolcidri.vercel.app
```

## Configuração (`siteConfig` em `script.js`)

```js
const siteConfig = {
  whatsappNumber: "5554994047528",  // número real da Adriana
  email:          "dolcidri@gmail.com",
  minDaysAhead:   3                 // dias mínimos de antecedência
};
```

## Comportamento pós-envio

- Formulário é limpo automaticamente após abrir WhatsApp ou Gmail.
- `min` do campo de data é re-setado após o reset do form (evita que `reset()` apague o atributo).

## Dependências externas

- **ViaCEP** (`https://viacep.com.br`) — gratuito, sem chave de API, limitado a ~3 req/s. Falha silenciosa com toast de erro.
- **WhatsApp** — link `wa.me` (não requer conta Business).
- **Gmail Compose** — `mail.google.com/mail/?view=cm` (requer usuário logado no Gmail).
