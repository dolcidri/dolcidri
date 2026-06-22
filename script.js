const siteConfig = {
  whatsappNumber: "5554994047528",
  placeholderNumber: "5500000000000",
  email: "dolcidri@gmail.com",
  minDaysAhead: 3
};

const toastArea = document.querySelector("#toastArea");
const orderForm = document.querySelector("#orderForm");
const phoneInput = document.querySelector("#phone");
const productSelect = document.querySelector("#product");
const deliverySelect = document.querySelector("#delivery");
const addressField = document.querySelector("#addressField");
const addressInput = document.querySelector("#address");
const dateInput = document.querySelector("#date");
const siteHeader = document.querySelector(".site-header");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelectorAll(".nav a");

// A — Data mínima: hoje + 3 dias
(function setMinDate() {
  const d = new Date();
  d.setDate(d.getDate() + siteConfig.minDaysAhead);
  dateInput.min = d.toISOString().slice(0, 10);
})();

// C — Mostrar/ocultar campo de endereço conforme escolha de entrega
deliverySelect.addEventListener("change", () => {
  const isDelivery = deliverySelect.value === "Entrega em endereço";
  addressField.style.display = isDelivery ? "" : "none";
  addressInput.required = isDelivery;
  if (!isDelivery) addressInput.value = "";
});

function addToast(message, type = "info", duration = 3600) {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastArea.appendChild(toast);

  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    window.setTimeout(() => toast.remove(), 180);
  }, duration);
}

function onlyDigits(value) {
  return value.replace(/\D/g, "");
}

function formatPhoneBR(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  const ddd = digits.slice(0, 2);
  if (digits.length <= 6) return `(${ddd}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${ddd}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${ddd}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function formatDateBR(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

// D — Telefone válido: mínimo 10 dígitos
function validatePhone(phone) {
  return onlyDigits(phone).length >= 10;
}

function collectFormData() {
  return Object.fromEntries(new FormData(orderForm).entries());
}

// B — Limpar formulário após envio
function resetForm() {
  orderForm.reset();
  addressField.style.display = "none";
  addressInput.required = false;
}

// E — Mensagem WhatsApp com formatação rica
function buildMessage(data) {
  const entrega = data.delivery === "Entrega em endereço" && data.address
    ? `Entrega em: ${data.address}`
    : data.delivery || "Não informado";

  return [
    "Olá, Dolci Dri! 🍰 Quero fazer uma encomenda.",
    "",
    "📋 *DADOS DO PEDIDO*",
    `👤 Nome: ${data.name}`,
    `📱 Telefone: ${data.phone}`,
    `🎂 Produto: ${data.product}`,
    `🔢 Quantidade: ${data.quantity}`,
    `📅 Data desejada: ${formatDateBR(data.date)}`,
    `📦 ${entrega}`,
    "",
    `📝 Detalhes: ${data.notes || "Sem detalhes adicionais."}`,
    "",
    "─────────────────────",
    "Pedido via dolcidri.vercel.app"
  ].join("\n");
}

function buildEmailSubject(data) {
  return `Encomenda — ${data.product} | Dolci Dri`;
}

function buildEmailBody(data) {
  const entrega = data.delivery === "Entrega em endereço" && data.address
    ? `Entrega em: ${data.address}`
    : data.delivery || "Não informado";

  return [
    "Olá!",
    "",
    "Gostaria de fazer uma encomenda pela Dolci Dri.",
    "",
    "DADOS DO PEDIDO",
    "───────────────────────",
    `Nome:          ${data.name}`,
    `Telefone:      ${data.phone}`,
    `Produto:       ${data.product}`,
    `Quantidade:    ${data.quantity}`,
    `Data desejada: ${formatDateBR(data.date)}`,
    `Entrega:       ${entrega}`,
    "",
    "Detalhes:",
    data.notes || "Sem detalhes adicionais.",
    "",
    "───────────────────────",
    "Pedido enviado pelo site dolcidri.vercel.app"
  ].join("\n");
}

phoneInput.addEventListener("input", (event) => {
  event.target.value = formatPhoneBR(event.target.value);
});

navToggle.addEventListener("click", () => {
  const isOpen = siteHeader.classList.toggle("nav-open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
  navToggle.setAttribute("aria-label", isOpen ? "Fechar menu" : "Abrir menu");
});

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    siteHeader.classList.remove("nav-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Abrir menu");
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    siteHeader.classList.remove("nav-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Abrir menu");
  }
});

const nameInput = document.querySelector("#name");
const emailBtn = document.querySelector("#emailBtn");

emailBtn.addEventListener("click", () => {
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

  if (data.delivery === "Entrega em endereço" && !data.address?.trim()) {
    addToast("Informe o endereço de entrega.", "warning");
    addressInput.focus();
    return;
  }

  const subject = buildEmailSubject(data);
  const body = buildEmailBody(data);
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(siteConfig.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  window.open(gmailUrl, "_blank", "noopener,noreferrer");
  addToast("Abrindo Gmail com o pedido.", "info");
  resetForm();
});

document.querySelectorAll("[data-product]").forEach((link) => {
  link.addEventListener("click", () => {
    const product = link.dataset.product;
    productSelect.value = product;
    addToast(`Produto selecionado: ${product}`, "info", 2400);
    window.setTimeout(() => nameInput.focus(), 420);
  });
});

orderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = collectFormData();

  if (!validatePhone(data.phone)) {
    addToast("Informe um telefone válido (mínimo 10 dígitos).", "warning");
    phoneInput.focus();
    return;
  }

  if (data.delivery === "Entrega em endereço" && !data.address?.trim()) {
    addToast("Informe o endereço de entrega.", "warning");
    addressInput.focus();
    return;
  }

  const message = buildMessage(data);
  const target = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(message)}`;

  if (siteConfig.whatsappNumber === siteConfig.placeholderNumber) {
    addToast("O pedido foi montado. Substitua o WhatsApp placeholder para uso real.", "warning", 5200);
  } else {
    addToast("Pedido enviado para o WhatsApp!", "success");
  }

  window.open(target, "_blank", "noopener,noreferrer");
  resetForm();
});
