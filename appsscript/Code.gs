// Dolci Dri — Apps Script (backend)
// 1. Acesse https://script.google.com e crie um novo projeto
// 2. Cole este código substituindo o conteúdo do arquivo Code.gs
// 3. Publicar > Implantar como app da web
//    - Executar como: Eu (dolcidri@gmail.com)
//    - Quem tem acesso: Qualquer pessoa
// 4. Copie a URL gerada e cole em siteConfig.appsScriptUrl (script.js) e em SCRIPT_URL (admin.html)
//
// IMPORTANTE: ao atualizar este arquivo, reimplante com "Gerenciar implantações > Editar > Nova versão".
//
// FRETE (taxa de entrega): para o cálculo funcionar, cadastre a chave da API Google em
//   Configurações do projeto (engrenagem) > Propriedades do script > Adicionar:
//     GOOGLE_MAPS_KEY = <sua chave da Google Distance Matrix API>
// A chave fica só aqui (servidor) — nunca aparece no site. Sem a chave, o site exibe
// "Taxa de entrega a confirmar pela Adriana" e o pedido segue normal.
//
// SEGURANÇA DO PAINEL (Fase 1): a listagem e as alterações de pedido exigem um TOKEN secreto.
//   Rode UMA VEZ a função `setupAdmin` no editor (selecione no seletor de função > Executar).
//   Ela cria, nas Propriedades do script, a senha do painel (ADMIN_SENHA) e o token (ADMIN_TOKEN),
//   e mostra os dois no registro de execução. A senha some do código-fonte: o admin faz login
//   pela senha e recebe o token do servidor. Sem token válido, ninguém lista nem altera pedidos.

var SHEET_NAME = 'Pedidos';

// Frete — base de saída fixa (Rua Pessegueiro, 44 — Carniel, Gramado/RS).
var FRETE_ORIGEM      = 'Rua Pessegueiro, 44, Carniel, Gramado, RS, Brasil';
var FRETE_BASE_CENT   = 700; // taxa de saída: R$ 7,00
var FRETE_POR_KM_CENT = 150; // R$ 1,50 por km rodado

// Índices base 1 (para getRange). Colunas novas vão sempre ao final (compatível com planilhas antigas).
var C = {
  ID: 1, ENVIADO: 2, NOME: 3, TELEFONE: 4, PRODUTO: 5,
  QUANTIDADE: 6, DATA: 7, ENTREGA: 8, DETALHES: 9,
  STATUS: 10, ATENDIDO_EM: 11,
  NUMERO: 12, VALOR: 13, CONFIRMADO_EM: 14, CANCELADO_EM: 15,
  ENTREGUE_EM: 16, FRETE: 17
};

var HEADERS = [
  'ID', 'Enviado em', 'Nome', 'Telefone', 'Produto',
  'Quantidade', 'Data desejada', 'Entrega', 'Detalhes',
  'Status', 'Atendido em',
  'Número', 'Valor (centavos)', 'Confirmado em', 'Cancelado em',
  'Entregue em (efetiva)', 'Frete (centavos)'
];

function agoraBR_() {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
}

// Script standalone: getActiveSpreadsheet() retorna null.
// Usamos PropertiesService para guardar o ID e criar a planilha na primeira chamada.
function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id    = props.getProperty('SHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) {}
  }
  var ss = SpreadsheetApp.create('Dolci Dri — Pedidos');
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function getSheet_() {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    return sh;
  }
  // Migração suave: garante que as colunas novas existam no cabeçalho.
  if (sh.getLastColumn() < HEADERS.length) {
    for (var col = sh.getLastColumn() + 1; col <= HEADERS.length; col++) {
      sh.getRange(1, col).setValue(HEADERS[col - 1]);
    }
  }
  return sh;
}

// Próximo número sequencial de pedido (#1, #2, ...).
function proximoNumero_(sh) {
  var rows = sh.getDataRange().getValues();
  var max  = 0;
  for (var i = 1; i < rows.length; i++) {
    var n = parseInt(rows[i][C.NUMERO - 1], 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max + 1;
}

function linhaPorId_(sh, id) {
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][C.ID - 1]) === String(id)) return i + 1; // linha base 1
  }
  return -1;
}

// ── Segurança do painel (token + senha em PropertiesService) ───────────────
// Rode UMA VEZ no editor. Cria senha e token se ainda não existirem e os mostra no log.
function setupAdmin() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_SENHA')) props.setProperty('ADMIN_SENHA', 'dolcidri2026');
  if (!props.getProperty('ADMIN_TOKEN')) {
    props.setProperty('ADMIN_TOKEN', (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''));
  }
  Logger.log('ADMIN_SENHA: ' + props.getProperty('ADMIN_SENHA'));
  Logger.log('ADMIN_TOKEN: ' + props.getProperty('ADMIN_TOKEN'));
  Logger.log('Pronto. A senha é a que a Adriana digita no painel; o token o painel recebe sozinho ao logar.');
}

function adminSenha_() { return PropertiesService.getScriptProperties().getProperty('ADMIN_SENHA'); }
function adminToken_() { return PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN'); }

// Confere o token recebido contra o guardado no servidor.
function tokenOk_(p) {
  var real = adminToken_();
  return !!real && p && String(p.token) === real;
}

function onlyDigits_(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

// ── Frete ──────────────────────────────────────────────────────────────────
// Calcula a taxa de entrega: taxa = BASE + (R$/km x km de estrada), km arredondado
// pra cima a cada 0,1 km, nunca abaixo da BASE. Distância real via Google Distance Matrix.
// Devolve { ok, km, taxaCentavos } ou { ok:false, msg } (sem chave / fora de área / erro).
function calcularFrete_(destino) {
  if (!destino) return { ok: false, msg: 'SEM_DESTINO' };
  var key = PropertiesService.getScriptProperties().getProperty('GOOGLE_MAPS_KEY');
  if (!key) return { ok: false, msg: 'SEM_CHAVE' };

  var url = 'https://maps.googleapis.com/maps/api/distancematrix/json'
    + '?origins='      + encodeURIComponent(FRETE_ORIGEM)
    + '&destinations=' + encodeURIComponent(destino)
    + '&mode=driving&units=metric&language=pt-BR&region=br&key=' + key;

  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var data = JSON.parse(resp.getContentText());
  if (data.status !== 'OK') return { ok: false, msg: data.status };

  var el = data.rows && data.rows[0] && data.rows[0].elements && data.rows[0].elements[0];
  if (!el || el.status !== 'OK') return { ok: false, msg: el ? el.status : 'SEM_ELEMENTO' };

  var km      = el.distance.value / 1000;       // metros -> km
  var kmArred = Math.ceil(km * 10) / 10;        // arredonda pra cima a cada 0,1 km
  var taxa    = FRETE_BASE_CENT + Math.round(FRETE_POR_KM_CENT * kmArred);
  if (taxa < FRETE_BASE_CENT) taxa = FRETE_BASE_CENT; // mínimo = a própria base
  return { ok: true, km: kmArred, taxaCentavos: taxa };
}

// ── Handlers (compartilhados por doGet e doPost) ─────────────────────────────

function handleLogin_(p) {
  var senha = adminSenha_();
  if (!senha) return { ok: false, msg: 'Painel não configurado. Rode setupAdmin() no editor.' };
  if (!p || String(p.senha) !== senha) return { ok: false, msg: 'Senha incorreta.' };
  return { ok: true, token: adminToken_() };
}

// Validação server-side do pedido novo (não confia só no front).
function validarNovoPedido_(p) {
  if (!p.nome || !String(p.nome).trim())             return 'Nome obrigatório.';
  if (onlyDigits_(p.telefone).length < 10)           return 'Telefone inválido (mínimo 10 dígitos).';
  if (!p.produto || !String(p.produto).trim())       return 'Produto obrigatório.';
  if (!p.quantidade || !String(p.quantidade).trim()) return 'Quantidade obrigatória.';
  if (!p.data || !String(p.data).trim())             return 'Data de entrega obrigatória.';
  return null;
}

// Dedup anti-duplo-clique: mesmo nome+telefone+produto+data enviados no MESMO minuto.
// Devolve o número do pedido já gravado, ou null se não houver duplicata.
function pedidoDuplicado_(sh, p) {
  var rows  = sh.getDataRange().getValues();
  var agora = agoraBR_(); // resolução de minuto
  var tel   = onlyDigits_(p.telefone);
  for (var i = rows.length - 1; i >= 1 && i >= rows.length - 30; i--) {
    var r = rows[i];
    if (String(r[C.ENVIADO - 1]) !== agora) continue;
    if (onlyDigits_(r[C.TELEFONE - 1]) === tel
        && String(r[C.PRODUTO - 1]) === String(p.produto)
        && String(r[C.DATA - 1])    === String(p.data)
        && String(r[C.NOME - 1])    === String(p.nome)) {
      return r[C.NUMERO - 1] || 0;
    }
  }
  return null;
}

function handleNovoPedido_(p) {
  var erro = validarNovoPedido_(p);
  if (erro) return { ok: false, msg: erro };

  // LockService serializa a numeração + gravação: sem corrida de número nem duplo append.
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); }
  catch (e) { return { ok: false, msg: 'Servidor ocupado, tente novamente.' }; }

  try {
    var sh  = getSheet_();
    var dup = pedidoDuplicado_(sh, p);
    if (dup !== null) return { ok: true, numero: dup, duplicado: true };

    var id     = String(new Date().getTime());
    var numero = proximoNumero_(sh);
    sh.appendRow([
      id, agoraBR_(),
      p.nome, p.telefone, p.produto, p.quantidade,
      p.data, p.entrega, p.detalhes || '',
      'Pendente', '',
      numero, '', '', '', '', (p.frete || '')
    ]);
    SpreadsheetApp.flush();
    return { ok: true, numero: numero };
  } finally {
    lock.releaseLock();
  }
}

function handleAtualizarStatus_(p) {
  var sh = getSheet_();
  var r  = linhaPorId_(sh, p.id);
  if (r <= 0) return { ok: false, msg: 'Pedido não encontrado.' };

  var st  = p.status;
  var now = agoraBR_();
  sh.getRange(r, C.STATUS).setValue(st);
  if (p.data) sh.getRange(r, C.DATA).setValue(p.data);

  if (st === 'Confirmado') {
    sh.getRange(r, C.CONFIRMADO_EM).setValue(now);
    sh.getRange(r, C.ATENDIDO_EM).setValue('');
    sh.getRange(r, C.CANCELADO_EM).setValue('');
    sh.getRange(r, C.ENTREGUE_EM).setValue('');
    if (p.valor !== undefined && p.valor !== null && p.valor !== '') {
      sh.getRange(r, C.VALOR).setValue(p.valor);
    }
  } else if (st === 'Atendido') {
    sh.getRange(r, C.ATENDIDO_EM).setValue(now);
    sh.getRange(r, C.CANCELADO_EM).setValue('');
    sh.getRange(r, C.ENTREGUE_EM).setValue(p.entregueEm || '');
  } else if (st === 'Cancelado') {
    sh.getRange(r, C.CANCELADO_EM).setValue(now);
    sh.getRange(r, C.ATENDIDO_EM).setValue('');
    sh.getRange(r, C.ENTREGUE_EM).setValue('');
  } else if (st === 'Pendente') {
    sh.getRange(r, C.CONFIRMADO_EM).setValue('');
    sh.getRange(r, C.ATENDIDO_EM).setValue('');
    sh.getRange(r, C.CANCELADO_EM).setValue('');
    sh.getRange(r, C.ENTREGUE_EM).setValue('');
    sh.getRange(r, C.VALOR).setValue('');
  }
  SpreadsheetApp.flush();
  return { ok: true };
}

function handleDefinirValor_(p) {
  var sh = getSheet_();
  var rv = linhaPorId_(sh, p.id);
  if (rv <= 0) return { ok: false, msg: 'Pedido não encontrado.' };
  sh.getRange(rv, C.VALOR).setValue(p.valor || '');
  if (p.data) sh.getRange(rv, C.DATA).setValue(p.data);
  SpreadsheetApp.flush();
  return { ok: true };
}

// Edição dos dados do pedido (nome, telefone, produto, quantidade, entrega, detalhes).
// Conserta cadastros errados que antes ficavam travados (só valor/data eram editáveis).
function validarEdicao_(p) {
  if (!p.nome || !String(p.nome).trim())             return 'Nome obrigatório.';
  if (onlyDigits_(p.telefone).length < 10)           return 'Telefone inválido (mínimo 10 dígitos).';
  if (!p.produto || !String(p.produto).trim())       return 'Produto obrigatório.';
  if (!p.quantidade || !String(p.quantidade).trim()) return 'Quantidade obrigatória.';
  return null;
}

function handleEditarPedido_(p) {
  var sh = getSheet_();
  var r  = linhaPorId_(sh, p.id);
  if (r <= 0) return { ok: false, msg: 'Pedido não encontrado.' };
  var erro = validarEdicao_(p);
  if (erro) return { ok: false, msg: erro };
  sh.getRange(r, C.NOME).setValue(p.nome);
  sh.getRange(r, C.TELEFONE).setValue(p.telefone);
  sh.getRange(r, C.PRODUTO).setValue(p.produto);
  sh.getRange(r, C.QUANTIDADE).setValue(p.quantidade);
  if (p.entrega  !== undefined) sh.getRange(r, C.ENTREGA).setValue(p.entrega);
  if (p.detalhes !== undefined) sh.getRange(r, C.DETALHES).setValue(p.detalhes);
  SpreadsheetApp.flush();
  return { ok: true };
}

function handleListar_() {
  var sh   = getSheet_();
  var rows = sh.getDataRange().getValues();
  var pedidos = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[C.ID - 1]) continue;
    pedidos.push({
      id:           String(r[C.ID - 1]),
      numero:       r[C.NUMERO - 1],
      enviado:      r[C.ENVIADO - 1],
      nome:         r[C.NOME - 1],
      telefone:     r[C.TELEFONE - 1],
      produto:      r[C.PRODUTO - 1],
      quantidade:   r[C.QUANTIDADE - 1],
      data:         r[C.DATA - 1],
      entrega:      r[C.ENTREGA - 1],
      detalhes:     r[C.DETALHES - 1],
      status:       r[C.STATUS - 1],
      valor:        r[C.VALOR - 1],
      confirmadoEm: r[C.CONFIRMADO_EM - 1],
      atendidoEm:   r[C.ATENDIDO_EM - 1],
      canceladoEm:  r[C.CANCELADO_EM - 1],
      entregueEm:   r[C.ENTREGUE_EM - 1],
      frete:        r[C.FRETE - 1]
    });
  }
  pedidos.reverse(); // mais recente primeiro
  return { ok: true, pedidos: pedidos };
}

// ── Roteamento ───────────────────────────────────────────────────────────────
// Tudo passa por GET + JSONP para que o front consiga LER a resposta (Apps Script não
// expõe CORS p/ POST). Assim toda gravação é confirmável — fim do "salvou?" no escuro.

function responder_(result, callback) {
  var json = JSON.stringify(result);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var p      = (e && e.parameter) || {};
  var action = p.action;
  var result;

  if (action === 'frete') {
    result = calcularFrete_(p.destino);          // público (site do cliente)
  } else if (action === 'novoPedido') {
    result = handleNovoPedido_(p);               // público (site do cliente)
  } else if (action === 'login') {
    result = handleLogin_(p);                     // público: troca senha por token
  } else if (action === 'listar') {
    result = tokenOk_(p) ? handleListar_()           : { ok: false, erro: 'NAO_AUTORIZADO' };
  } else if (action === 'atualizarStatus') {
    result = tokenOk_(p) ? handleAtualizarStatus_(p) : { ok: false, erro: 'NAO_AUTORIZADO' };
  } else if (action === 'definirValor') {
    result = tokenOk_(p) ? handleDefinirValor_(p)    : { ok: false, erro: 'NAO_AUTORIZADO' };
  } else if (action === 'editarPedido') {
    result = tokenOk_(p) ? handleEditarPedido_(p)    : { ok: false, erro: 'NAO_AUTORIZADO' };
  } else {
    result = { ok: false, msg: 'Ação desconhecida.' };
  }

  return responder_(result, p.callback);
}

// Compatibilidade: clientes antigos que ainda mandam POST (no-cors, resposta opaca).
// novoPedido segue aberto; mutações do painel exigem token.
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action === 'novoPedido') {
      handleNovoPedido_(data);
    } else if (data.action === 'atualizarStatus') {
      if (tokenOk_(data)) handleAtualizarStatus_(data);
    } else if (data.action === 'definirValor') {
      if (tokenOk_(data)) handleDefinirValor_(data);
    } else if (data.action === 'editarPedido') {
      if (tokenOk_(data)) handleEditarPedido_(data);
    }
    return ContentService.createTextOutput('ok')
      .setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput('erro: ' + err.message)
      .setMimeType(ContentService.MimeType.TEXT);
  }
}
