/* Lógica de interface e envio. Configurações públicas ficam em config.js. */
const LIVE_CONFIG = window.LIVE_CONFIG || {
  googleAppsScriptEndpoint: "",
  metaPixelId: "",
  videoSrc: "",
  videoType: "mp4",
  whatsappGroupUrl: "https://chat.whatsapp.com/EHW8C2A8uGyKtYnu91mdru?s=cl&p=a&iam=2"
};

(function () {
  "use strict";

  const form = document.querySelector("#lead-form");
  const statusElement = document.querySelector("#form-status");
  const submitButton = document.querySelector("#submit-button");
  const successPanel = document.querySelector("#success-panel");
  const whatsappLink = document.querySelector("#whatsapp-link");
  const phoneInput = document.querySelector("#whatsapp");
  const yearElement = document.querySelector("#current-year");
  const videoFrame = document.querySelector("#video-frame");
  const videoPlaceholder = document.querySelector("#video-placeholder");
  const attributionKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "fbclid"];

  if (!form) return;

  if (yearElement) yearElement.textContent = String(new Date().getFullYear());
  if (whatsappLink && LIVE_CONFIG.whatsappGroupUrl) whatsappLink.href = LIVE_CONFIG.whatsappGroupUrl;

  const params = new URLSearchParams(window.location.search);
  const attribution = {};
  attributionKeys.forEach((key) => {
    attribution[key] = (params.get(key) || "").trim().slice(0, 500);
    const field = form.querySelector(`[data-attribution="${key}"]`);
    if (field) field.value = attribution[key];
  });

  const originField = form.querySelector('[data-attribution="origem"]');
  if (originField) {
    originField.value = attribution.utm_source || (document.referrer ? getReferrerHost(document.referrer) : "direto");
  }

  setupVideo();
  phoneInput.addEventListener("input", handlePhoneInput);
  form.addEventListener("submit", handleSubmit);

  function getReferrerHost(referrer) {
    try { return new URL(referrer).hostname.slice(0, 200); } catch (error) { return "referencia-desconhecida"; }
  }

  function setupVideo() {
    if (!videoFrame || !LIVE_CONFIG.videoSrc) return;
    const type = LIVE_CONFIG.videoType === "external" ? "external" : "mp4";
    const media = document.createElement(type === "external" ? "iframe" : "video");
    media.src = LIVE_CONFIG.videoSrc;
    media.title = "Vídeo de apresentação da Perícia Judicial Pro";
    if (type === "external") {
      media.loading = "lazy";
      media.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      media.allowFullscreen = true;
      media.referrerPolicy = "strict-origin-when-cross-origin";
    } else {
      media.controls = true;
      media.preload = "metadata";
      media.playsInline = true;
    }
    if (videoPlaceholder) videoPlaceholder.replaceWith(media);
  }

  function handlePhoneInput(event) {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 13);
    const withoutCountry = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
    if (withoutCountry.length <= 10) {
      event.target.value = withoutCountry.replace(/(\d{2})(\d{0,4})(\d{0,4})/, function (_, ddd, first, last) {
        return [ddd && `(${ddd}`, ddd && ")", first, last && `-${last}`].join("");
      });
    } else {
      event.target.value = withoutCountry.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
    }
  }

  function normalizePhone(value) {
    let digits = value.replace(/\D/g, "");
    if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
    if (digits.length !== 10 && digits.length !== 11) return null;
    if (/^(\d)\1+$/.test(digits)) return null;
    return `55${digits}`;
  }

  function showFieldError(name, message) {
    const element = form.querySelector(`[data-error-for="${name}"]`);
    if (element) element.textContent = message;
    const control = form.elements[name];
    if (control) control.setAttribute("aria-invalid", "true");
  }

  function clearErrors() {
    form.querySelectorAll(".field-error").forEach((element) => { element.textContent = ""; });
    form.querySelectorAll("[aria-invalid='true']").forEach((element) => { element.removeAttribute("aria-invalid"); });
  }

  function validate() {
    clearErrors();
    const name = form.elements.nome.value.trim().replace(/\s+/g, " ");
    const phone = normalizePhone(form.elements.whatsapp.value);
    let valid = true;

    if (name.length < 3 || !/[A-Za-zÀ-ÿ]/.test(name)) {
      showFieldError("nome", "Informe seu nome completo.");
      valid = false;
    }
    if (!phone) {
      showFieldError("whatsapp", "Informe um WhatsApp válido com DDD.");
      valid = false;
    }
    if (!form.elements.consentimento.checked) {
      showFieldError("consentimento", "Marque o consentimento para continuar.");
      valid = false;
    }
    return { valid, name, phone };
  }

  function setStatus(message, kind) {
    statusElement.textContent = message;
    statusElement.className = `form-status${kind ? ` ${kind}` : ""}`;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("");
    const result = validate();
    if (!result.valid) return;

    if (form.elements.website.value) {
      setStatus("Não foi possível processar este envio. Tente novamente.");
      return;
    }
    if (!LIVE_CONFIG.googleAppsScriptEndpoint) {
      setStatus("A inscrição está temporariamente indisponível porque a integração ainda não foi configurada. Tente novamente mais tarde.");
      return;
    }

    submitButton.disabled = true;
    submitButton.classList.add("is-submitting");
    setStatus("Enviando seus dados…");

    const payload = new URLSearchParams(new FormData(form));
    payload.set("nome", result.name);
    payload.set("whatsapp", result.phone);
    payload.set("consentimento", "true");
    payload.set("idempotency_key", createIdempotencyKey());
    payload.set("landing_page", window.location.href.split("?")[0]);

    try {
      const response = await fetch(LIVE_CONFIG.googleAppsScriptEndpoint, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: payload.toString()
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data || data.ok !== true) throw new Error(data && data.message ? data.message : "Resposta inválida do servidor");
      showSuccess();
    } catch (error) {
      console.error("Falha ao registrar inscrição:", error);
      setStatus("Não foi possível confirmar seu cadastro agora. Verifique sua conexão e tente novamente.");
      submitButton.disabled = false;
      submitButton.classList.remove("is-submitting");
    }
  }

  function createIdempotencyKey() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function showSuccess() {
    form.hidden = true;
    successPanel.hidden = false;
    successPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    trackLeadOnce();
  }

  function trackLeadOnce() {
    if (!LIVE_CONFIG.metaPixelId) return;
    const key = "pericia-judicial-pro-live-lead";
    if (window.sessionStorage.getItem(key) === "1") return;
    initializeMetaPixel();
    window.fbq("track", "Lead");
    window.sessionStorage.setItem(key, "1");
  }

  function initializeMetaPixel() {
    if (typeof window.fbq === "function") return;
    const pixelId = LIVE_CONFIG.metaPixelId;
    const script = document.createElement("script");
    window.fbq = function () {
      window.fbq.callMethod ? window.fbq.callMethod.apply(window.fbq, arguments) : window.fbq.queue.push(arguments);
    };
    if (!window._fbq) window._fbq = window.fbq;
    window.fbq.push = window.fbq;
    window.fbq.loaded = true;
    window.fbq.version = "2.0";
    window.fbq.queue = [];
    window.fbq("init", pixelId);
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }
})();
