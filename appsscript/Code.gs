// Dolci Dri — Apps Script (backend)
// 1. Acesse https://script.google.com e crie um novo projeto
// 2. Cole este código substituindo o conteúdo do arquivo Code.gs
// 3. Publicar > Implantar como app da web
//    - Executar como: Eu (dolcidri@gmail.com)
//    - Quem tem acesso: Qualquer pessoa
// 4. Copie a URL gerada e cole em siteConfig.appsScriptUrl (script.js) e em SCRIPT_URL (admin.html)

var SHEET_NAME = 'Pedidos';

// Índices base 1 (para getRange)
var C = {
  ID: 1, ENVIADO: 2, NOME: 3, TELEFONE: 4, PRODUTO: 5,
  QUANTIDADE: 6, DATA: 7, ENTREGA: 8, DETALHES: 9,
  STATUS: 10, ATENDIDO_EM: 11
};

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow([
      'ID', 'Enviado em', 'Nome', 'Telefone', 'Produto',
      'Quantidade', 'Data desejada', 'Entrega', 'Detalhes',
      'Status', 'Atendido em'
    ]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sh   = getSheet_();

    if (data.action === 'novoPedido') {
      var id    = String(new Date().getTime());
      var agora = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
      sh.appendRow([
        id, agora,
        data.nome, data.telefone, data.produto, data.quantidade,
        data.data, data.entrega, data.detalhes || '',
        'Pendente', ''
      ]);

    } else if (data.action === 'atualizarStatus') {
      var rows = sh.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][C.ID - 1]) === String(data.id)) {
          sh.getRange(i + 1, C.STATUS).setValue(data.status);
          sh.getRange(i + 1, C.ATENDIDO_EM).setValue(
            data.status === 'Atendido'
              ? Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm')
              : ''
          );
          break;
        }
      }
    }

    return ContentService.createTextOutput('ok')
      .setMimeType(ContentService.MimeType.TEXT);

  } catch (err) {
    return ContentService.createTextOutput('erro: ' + err.message)
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

function doGet(e) {
  var action   = e.parameter.action;
  var callback = e.parameter.callback;
  var result   = {};

  if (action === 'listar') {
    var sh   = getSheet_();
    var rows = sh.getDataRange().getValues();
    var pedidos = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r[C.ID - 1]) continue;
      pedidos.push({
        id:         String(r[C.ID - 1]),
        enviado:    r[C.ENVIADO - 1],
        nome:       r[C.NOME - 1],
        telefone:   r[C.TELEFONE - 1],
        produto:    r[C.PRODUTO - 1],
        quantidade: r[C.QUANTIDADE - 1],
        data:       r[C.DATA - 1],
        entrega:    r[C.ENTREGA - 1],
        detalhes:   r[C.DETALHES - 1],
        status:     r[C.STATUS - 1],
        atendidoEm: r[C.ATENDIDO_EM - 1]
      });
    }
    pedidos.reverse(); // mais recente primeiro
    result = { pedidos: pedidos };
  }

  var json = JSON.stringify(result);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
