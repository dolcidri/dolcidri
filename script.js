const siteConfig = {
  whatsappNumber: "5554994047528",
  placeholderNumber: "5500000000000",
  email: "dolcidri@gmail.com",
  minDaysAhead: 3,
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbySJRsCP_uKNY5XgtdrP5KKY_e4hcNU-2Ka5D4XzJ4KKB6Z23hvM3eRBmJqTBYVl7ohbw/exec"
};

const CIDADES_ENTREGA = ["gramado", "canela"];

// Emojis via code points — evita problema de encoding do arquivo
const E = {
  cake:  "\u{1F370}", // 🍰
  clip:  "\u{1F4CB}", // 📋
  user:  "\u{1F464}", // 👤
  phone: "\u{1F4F1}", // 📱
  bday:  "\u{1F382}", // 🎂
  num:   "\u{1F522}", // 🔢
  cal:   "\u{1F4C5}", // 📅
  box:   "\u{1F4E6}", // 📦
  memo:  "\u{1F4DD}"  // 📝
};

const toastArea      = document.querySelector("#toastArea");
const orderForm      = document.querySelector("#orderForm");
const phoneInput     = document.querySelector("#phone");
const productSelect  = document.querySelector("#product");
const deliverySelect = document.querySelector("#delivery");
const addressField   = document.querySelector("#addressField");
const cepInput       = document.querySelector("#cep");
const cepStatus      = document.querySelector("#cepStatus");
const addressResult  = document.querySelector("#addressResult");
const addressStreet  = document.querySelector("#addressStreet");
const addressNumber  = document.querySelector("#addressNumber");
const freteResult    = document.querySelector("#freteResult");
const dateInput      = document.querySelector("#date");

// Taxa de entrega estimada (centavos) do último cálculo; null quando indisponível.
let freteCentavosAtual = null;
const siteHeader     = document.querySelector(".site-header");
const navToggle      = document.querySelector(".nav-toggle");
const navLinks       = document.querySelectorAll(".nav a");
const nameInput      = document.querySelector("#name");
const emailBtn       = document.querySelector("#emailBtn");

// A — Data mínima: hoje + 3 dias
(function setMinDate() {
  const d = new Date();
  d.setDate(d.getDate() + siteConfig.minDaysAhead);
  dateInput.min = d.toISOString().slice(0, 10);
})();

// C — Mostrar/ocultar bloco de CEP conforme escolha de entrega
deliverySelect.addEventListener("change", () => {
  const isDelivery = deliverySelect.value === "Entrega em endereço";
  addressField.style.display = isDelivery ? "" : "none";
  if (!isDelivery) resetAddressFields();
});

function resetAddressFields() {
  cepInput.value = "";
  cepStatus.textContent = "";
  cepStatus.className = "cep-status";
  addressResult.style.display = "none";
  addressStreet.value = "";
  addressNumber.value = "";
  addressNumber.required = false;
  esconderFrete();
}

function esconderFrete() {
  freteCentavosAtual = null;
  if (!freteResult) return;
  freteResult.style.display = "none";
  freteResult.textContent = "";
  freteResult.className = "frete-result";
}

// C — Formatar CEP e disparar busca ao completar 8 dígitos
function formatCEP(value) {
  const d = onlyDigits(value).slice(0, 8);
  return d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d;
}

cepInput.addEventListener("input", (event) => {
  event.target.value = formatCEP(event.target.value);
  addressResult.style.display = "none";
  addressNumber.required = false;
  addressStreet.value = "";
  cepStatus.textContent = "";
  cepStatus.className = "cep-status";
  esconderFrete();
  const digits = onlyDigits(event.target.value);
  if (digits.length === 8) buscarCEP(digits);
});

// JSONP: o Apps Script (doGet) responde com callback(...) — contorna o CORS do GET.
function jsonp(url, cb) {
  const name = "__freteCb" + Date.now();
  const script = document.createElement("script");
  window[name] = function (data) {
    delete window[name];
    script.remove();
    cb(data);
  };
  script.onerror = function () {
    delete window[name];
    script.remove();
    cb(null);
  };
  script.src = url + (url.indexOf("?") >= 0 ? "&" : "?") + "callback=" + name;
  document.body.appendChild(script);
}

function centavosParaBR(cent) {
  const v = (cent / 100).toFixed(2).replace(".", ",");
  return v.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// Pede a taxa ao backend (Google Distance Matrix roda lá, com a chave escondida).
function calcularFrete() {
  if (!siteConfig.appsScriptUrl || !freteResult) return;
  const rua    = addressStreet.value;
  const numero = (addressNumber.value || "").trim();
  if (!rua || !numero) { esconderFrete(); return; }

  // Insere o número logo após o logradouro: "Rua X, 44, Bairro, Cidade/RS".
  const partes = rua.split(", ");
  partes.splice(1, 0, numero);
  const destino = partes.join(", ");

  freteResult.style.display = "";
  freteResult.className = "frete-result loading";
  freteResult.textContent = "Calculando taxa de entrega...";

  const url = siteConfig.appsScriptUrl + "?action=frete&destino=" + encodeURIComponent(destino);
  jsonp(url, function (data) {
    if (!data || !data.ok) {
      freteCentavosAtual = null;
      freteResult.className = "frete-result info";
      freteResult.textContent = "Taxa de entrega a confirmar pela Adriana.";
      return;
    }
    freteCentavosAtual = data.taxaCentavos;
    const km = String(data.km).replace(".", ",");
    freteResult.className = "frete-result ok";
    freteResult.textContent = "Taxa de entrega estimada: R$ " + centavosParaBR(data.taxaCentavos) + " (" + km + " km)";
  });
}

// Recalcula quando o número é preenchido/alterado (blur), evitando 1 chamada por tecla.
addressNumber.addEventListener("change", calcularFrete);

// Consulta ViaCEP; se falhar ou retornar erro, cai para a BrasilAPI.
// Devolve { logradouro, bairro, localidade, uf } ou null (CEP inexistente nos dois).
async function consultarCEP(digits) {
  try {
    const res  = await fetch("https://viacep.com.br/ws/" + digits + "/json/");
    if (res.ok) {
      const data = await res.json();
      if (!data.erro) {
        return {
          logradouro: data.logradouro || "",
          bairro:     data.bairro || "",
          localidade: data.localidade || "",
          uf:         data.uf || ""
        };
      }
    }
  } catch (_) { /* tenta o fallback abaixo */ }

  const res2  = await fetch("https://brasilapi.com.br/api/cep/v2/" + digits);
  if (!res2.ok) return null; // 404 = CEP inexistente
  const data2 = await res2.json();
  return {
    logradouro: data2.street || "",
    bairro:     data2.neighborhood || "",
    localidade: data2.city || "",
    uf:         data2.state || ""
  };
}

async function buscarCEP(digits) {
  cepStatus.textContent = "Buscando...";
  cepStatus.className = "cep-status loading";
  try {
    const data = await consultarCEP(digits);
    if (!data) {
      cepStatus.textContent = "CEP não encontrado.";
      cepStatus.className   = "cep-status error";
      return;
    }
    const cidade = (data.localidade || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    if (!CIDADES_ENTREGA.includes(cidade) || data.uf !== "RS") {
      cepStatus.textContent = "Só entregamos em Gramado e Canela/RS.";
      cepStatus.className   = "cep-status error";
      return;
    }
    const rua = [data.logradouro, data.bairro, data.localidade + "/RS"]
      .filter(Boolean).join(", ");
    addressStreet.value        = rua;
    addressResult.style.display = "";
    addressNumber.required      = true;
    cepStatus.textContent       = "CEP encontrado.";
    cepStatus.className         = "cep-status ok";
    addressNumber.focus();
  } catch (_) {
    cepStatus.textContent = "Erro ao buscar CEP. Tente novamente.";
    cepStatus.className   = "cep-status error";
  }
}

function addToast(message, type, duration) {
  type     = type     || "info";
  duration = duration || 3600;
  const toast = document.createElement("div");
  toast.className  = "toast " + type;
  toast.textContent = message;
  toastArea.appendChild(toast);
  window.setTimeout(function () {
    toast.style.opacity   = "0";
    toast.style.transform = "translateY(8px)";
    window.setTimeout(function () { toast.remove(); }, 180);
  }, duration);
}

function onlyDigits(value) {
  return value.replace(/\D/g, "");
}

function formatPhoneBR(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  const ddd = digits.slice(0, 2);
  if (digits.length <= 6)  return "(" + ddd + ") " + digits.slice(2);
  if (digits.length <= 10) return "(" + ddd + ") " + digits.slice(2, 6) + "-" + digits.slice(6);
  return "(" + ddd + ") " + digits.slice(2, 3) + " " + digits.slice(3, 7) + "-" + digits.slice(7);
}

function formatDateBR(value) {
  if (!value) return "";
  const parts = value.split("-");
  if (parts.length < 3) return value;
  return parts[2] + "/" + parts[1] + "/" + parts[0];
}

// D — Mínimo 10 dígitos
function validatePhone(phone) {
  return onlyDigits(phone).length >= 10;
}

function collectFormData() {
  return Object.fromEntries(new FormData(orderForm).entries());
}

function getAddressLine(data) {
  if (data.delivery !== "Entrega em endereço") return data.delivery || "Não informado";
  const street = addressStreet.value;
  const number = (data.addressNumber || "").trim();
  const cep    = formatCEP(data.cep || "");
  if (street && number) return street + ", " + number + " (CEP " + cep + ")";
  return "Entrega em endereço";
}

// Texto da taxa estimada para anexar ao pedido (só quando há entrega com valor calculado).
function getFreteTexto(data) {
  if (data.delivery !== "Entrega em endereço" || freteCentavosAtual == null) return "";
  return "R$ " + centavosParaBR(freteCentavosAtual) + " (estimada)";
}

// Salvar pedido no Google Sheets via Apps Script.
// Usa JSONP (GET) para LER a resposta — gravação confirmável (fim do "salvou?" no escuro).
let salvandoPedido = false;
function saveOrder(data) {
  if (!siteConfig.appsScriptUrl) return;
  if (salvandoPedido) return; // trava anti-duplo-envio (o backend ainda deduplica por segurança)
  salvandoPedido = true;

  const params = {
    action:     "novoPedido",
    nome:       data.name,
    telefone:   data.phone,
    produto:    data.product,
    quantidade: data.quantity,
    data:       formatDateBR(data.date),
    entrega:    getAddressLine(data),
    detalhes:   data.notes || "",
    // Taxa de entrega estimada (centavos) calculada no momento do pedido — antes era descartada.
    frete:      (data.delivery === "Entrega em endereço" && freteCentavosAtual != null) ? freteCentavosAtual : ""
  };
  const qs = Object.keys(params)
    .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(params[k]))
    .join("&");

  jsonp(siteConfig.appsScriptUrl + "?" + qs, function (res) {
    salvandoPedido = false;
    if (res && res.ok) {
      const num = res.numero ? " (#" + String(res.numero).padStart(3, "0") + ")" : "";
      addToast("Pedido registrado com a Adriana" + num + ".", "success", 4200);
    } else {
      addToast("Não consegui registrar o pedido aqui — finalize pelo WhatsApp/e-mail aberto.", "warning", 6000);
    }
  });
}

// B — Limpar formulário após envio
function resetForm() {
  orderForm.reset();
  addressField.style.display = "none";
  resetAddressFields();
  const d = new Date();
  d.setDate(d.getDate() + siteConfig.minDaysAhead);
  dateInput.min = d.toISOString().slice(0, 10);
}


// E — Mensagem WhatsApp com emojis via code points
function buildMessage(data) {
  const entrega = getAddressLine(data);
  const frete   = getFreteTexto(data);
  return [
    "Olá, Dolci Dri! " + E.cake + " Quero fazer uma encomenda.",
    "",
    E.clip + " *DADOS DO PEDIDO*",
    E.user  + " Nome:          " + data.name,
    E.phone + " Telefone:      " + data.phone,
    E.bday  + " Produto:       " + data.product,
    E.num   + " Quantidade:    " + data.quantity,
    E.cal   + " Data desejada: " + formatDateBR(data.date),
    E.box   + " Entrega:       " + entrega,
    frete ? (E.box + " Taxa entrega:  " + frete) : null,
    "",
    E.memo  + " Detalhes: " + (data.notes || "Sem detalhes adicionais."),
    "",
    "─────────────────────",
    "Pedido via dolcidri.vercel.app"
  ].filter(function (l) { return l !== null; }).join("\n");
}

function buildEmailSubject(data) {
  return "Encomenda — " + data.product + " | Dolci Dri";
}

function buildEmailBody(data) {
  const entrega = getAddressLine(data);
  const frete   = getFreteTexto(data);
  return [
    "Olá!",
    "",
    "Gostaria de fazer uma encomenda pela Dolci Dri.",
    "",
    "DADOS DO PEDIDO",
    "───────────────────────",
    "Nome:          " + data.name,
    "Telefone:      " + data.phone,
    "Produto:       " + data.product,
    "Quantidade:    " + data.quantity,
    "Data desejada: " + formatDateBR(data.date),
    "Entrega:       " + entrega,
    frete ? ("Taxa entrega:  " + frete) : null,
    "",
    "Detalhes:",
    data.notes || "Sem detalhes adicionais.",
    "",
    "───────────────────────",
    "Pedido enviado pelo site dolcidri.vercel.app"
  ].filter(function (l) { return l !== null; }).join("\n");
}

function validateDelivery(data) {
  if (data.delivery !== "Entrega em endereço") return null;
  if (!addressStreet.value) return "Informe um CEP válido de Gramado ou Canela/RS.";
  if (!(data.addressNumber || "").trim()) return "Informe o número e complemento do endereço.";
  return null;
}

phoneInput.addEventListener("input", function (event) {
  event.target.value = formatPhoneBR(event.target.value);
});

navToggle.addEventListener("click", function () {
  const isOpen = siteHeader.classList.toggle("nav-open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
  navToggle.setAttribute("aria-label", isOpen ? "Fechar menu" : "Abrir menu");
});

navLinks.forEach(function (link) {
  link.addEventListener("click", function () {
    siteHeader.classList.remove("nav-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Abrir menu");
  });
});

document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    siteHeader.classList.remove("nav-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Abrir menu");
  }
});

emailBtn.addEventListener("click", function () {
  const data = collectFormData();
  if (!data.name || !data.phone || !data.product || !data.quantity || !data.date || !data.delivery) {
    addToast("Preencha todos os campos obrigatórios antes de enviar.", "warning");
    return;
  }
  if (!validatePhone(data.phone)) {
    addToast("Informe um telefone válido (mínimo 10 dígitos).", "warning");
    phoneInput.focus();
    return;
  }
  if (data.date < dateInput.min) {
    addToast("Data mínima: " + formatDateBR(dateInput.min) + ".", "warning");
    dateInput.focus();
    return;
  }
  const deliveryError = validateDelivery(data);
  if (deliveryError) {
    addToast(deliveryError, "warning");
    return;
  }
  const subject  = buildEmailSubject(data);
  const body     = buildEmailBody(data);
  const gmailUrl = "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(siteConfig.email) +
                   "&su=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  window.open(gmailUrl, "_blank", "noopener,noreferrer");
  addToast("Abrindo Gmail com o pedido.", "info");
  saveOrder(data);
  resetForm();
});

document.querySelectorAll("[data-product]").forEach(function (link) {
  link.addEventListener("click", function () {
    const product = link.dataset.product;
    productSelect.value = product;
    addToast("Produto selecionado: " + product, "info", 2400);
    window.setTimeout(function () { nameInput.focus(); }, 420);
  });
});

orderForm.addEventListener("submit", function (event) {
  event.preventDefault();
  const data = collectFormData();
  if (!validatePhone(data.phone)) {
    addToast("Informe um telefone válido (mínimo 10 dígitos).", "warning");
    phoneInput.focus();
    return;
  }
  // A — bloquear data digitada manualmente fora do prazo
  if (data.date < dateInput.min) {
    addToast("Data mínima: " + formatDateBR(dateInput.min) + ".", "warning");
    dateInput.focus();
    return;
  }
  const deliveryError = validateDelivery(data);
  if (deliveryError) {
    addToast(deliveryError, "warning");
    return;
  }

  const message = buildMessage(data);

  if (siteConfig.whatsappNumber === siteConfig.placeholderNumber) {
    addToast("O pedido foi montado. Substitua o WhatsApp placeholder para uso real.", "warning", 5200);
    return;
  }

  // Abre WhatsApp direto no número certo (sem ?text= para evitar corrupção de emoji via URL)
  window.open("https://wa.me/" + siteConfig.whatsappNumber, "_blank", "noopener,noreferrer");

  // Copia a mensagem com emoji para a área de transferência
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(message)
      .then(function () {
        addToast("Mensagem copiada! Cole no chat da Dolci Dri no WhatsApp.", "success", 6000);
      })
      .catch(function () {
        addToast("WhatsApp aberto!", "success");
      });
  } else {
    addToast("WhatsApp aberto!", "success");
  }

  saveOrder(data);
  resetForm();
});
