const siteConfig = {
  whatsappNumber: "5554994047528",
  placeholderNumber: "5500000000000",
  email: "dolcidri@gmail.com"
};

const toastArea = document.querySelector("#toastArea");
const orderForm = document.querySelector("#orderForm");
const phoneInput = document.querySelector("#phone");
const productSelect = document.querySelector("#product");
const siteHeader = document.querySelector(".site-header");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelectorAll(".nav a");

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

function buildEmailSubject(data) {
  return `Encomenda — ${data.product} | Dolci Dri`;
}

function buildEmailBody(data) {
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
    "",
    "Detalhes:",
    data.notes || "Sem detalhes adicionais.",
    "",
    "───────────────────────",
    "Pedido enviado pelo site Dolci Dri."
  ].join("\n");
}

function buildMessage(data) {
  return [
    "Olá, Dolci Dri! Quero fazer uma encomenda.",
    "",
    `Nome: ${data.name}`,
    `Telefone: ${data.phone}`,
    `Produto: ${data.product}`,
    `Quantidade: ${data.quantity}`,
    `Data desejada: ${formatDateBR(data.date)}`,
    `Detalhes: ${data.notes || "Sem detalhes adicionais."}`
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

const emailBtn = document.querySelector("#emailBtn");

emailBtn.addEventListener("click", () => {
  const name = document.querySelector("#name").value.trim();
  const phone = document.querySelector("#phone").value.trim();
  const product = document.querySelector("#product").value;
  const quantity = document.querySelector("#quantity").value.trim();
  const date = document.querySelector("#date").value;

  if (!name || !phone || !product || !quantity || !date) {
    addToast("Preencha todos os campos obrigatórios antes de enviar.", "warning");
    return;
  }

  const formData = new FormData(orderForm);
  const data = Object.fromEntries(formData.entries());

  const subject = buildEmailSubject(data);
  const body = buildEmailBody(data);
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(siteConfig.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  window.open(gmailUrl, "_blank", "noopener,noreferrer");
  addToast("Abrindo Gmail com o pedido.", "info");
});

const nameInput = document.querySelector("#name");

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
  const formData = new FormData(orderForm);
  const data = Object.fromEntries(formData.entries());

  if (!onlyDigits(data.phone).length) {
    addToast("Informe um telefone válido para retorno.", "warning");
    phoneInput.focus();
    return;
  }

  const message = buildMessage(data);
  const target = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(message)}`;

  if (siteConfig.whatsappNumber === siteConfig.placeholderNumber) {
    addToast("O pedido foi montado. Substitua o WhatsApp placeholder para uso real.", "warning", 5200);
  } else {
    addToast("Pedido pronto para envio pelo WhatsApp.", "success");
  }

  window.open(target, "_blank", "noopener,noreferrer");
});
