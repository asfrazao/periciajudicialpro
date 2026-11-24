/**
 * Endpoint seguro e mínimo para a landing page /live/.
 * 1. Cole este arquivo em uma implantação do Google Apps Script.
 * 2. Preencha SHEET_ID com o ID da planilha (somente aqui, nunca no frontend).
 * 3. Implante como Web app: executar como você; acesso: qualquer pessoa.
 */
const SHEET_ID = "COLE_O_ID_DA_PLANILHA_AQUI";
const SHEET_NAME = "Inscricoes";
const HEADERS = [
  "Data/hora do cadastro",
  "Nome",
  "WhatsApp",
  "Origem da campanha",
  "UTM Source",
  "UTM Medium",
  "UTM Campaign",
  "UTM Content",
  "Consentimento",
  "Status da inscrição"
];

function doGet() {
  return output_({ ok: true, service: "pericia-judicial-pro-live" });
}

function doPost(event) {
  try {
    const params = event && event.parameter ? event.parameter : {};
    if (params.website) return output_({ ok: false, message: "Spam detectado." });

    const name = clean_(params.nome);
    const phone = normalizePhone_(params.whatsapp);
    const consent = String(params.consentimento || "").toLowerCase() === "true";
    if (name.length < 3 || !phone || !consent) {
      return output_({ ok: false, message: "Dados obrigatórios inválidos." });
    }

    const cache = CacheService.getScriptCache();
    const phoneKey = "lead-phone-" + phone;
    const idempotencyKey = clean_(params.idempotency_key).slice(0, 100);
    const requestKey = idempotencyKey ? "lead-request-" + idempotencyKey : phoneKey;
    if (cache.get(requestKey) || cache.get(phoneKey)) {
      return output_({ ok: true, duplicate: true });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try {
      const sheet = getSheet_();
      ensureHeaders_(sheet);
      if (cache.get(requestKey) || cache.get(phoneKey)) {
        return output_({ ok: true, duplicate: true });
      }

      sheet.appendRow([
        new Date(),
        safeCell_(name),
        phone,
        clean_(params.origem).slice(0, 200),
        clean_(params.utm_source).slice(0, 200),
        clean_(params.utm_medium).slice(0, 200),
        clean_(params.utm_campaign).slice(0, 200),
        clean_(params.utm_content).slice(0, 200),
        "Sim",
        "Recebida"
      ]);
      cache.put(phoneKey, "1", 3600);
      if (idempotencyKey) cache.put(requestKey, "1", 3600);
      return output_({ ok: true, duplicate: false });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error(error);
    return output_({ ok: false, message: "Não foi possível registrar a inscrição." });
  }
}

function getSheet_() {
  if (!SHEET_ID || SHEET_ID === "COLE_O_ID_DA_PLANILHA_AQUI") {
    throw new Error("Configure SHEET_ID antes de implantar.");
  }
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function normalizePhone_(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.indexOf("55") === 0 && digits.length > 11) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) return "";
  if (/^(\d)\1+$/.test(digits)) return "";
  return "55" + digits;
}

function clean_(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function safeCell_(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function output_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
