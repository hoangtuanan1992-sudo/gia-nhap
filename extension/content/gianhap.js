(() => {
if (window.__gianhapContentScriptReady) {
  return;
}
window.__gianhapContentScriptReady = true;

const REQUEST_TYPE = "__GIANHAP_EXTENSION_REQUEST__";
const RESPONSE_TYPE = "__GIANHAP_EXTENSION_RESPONSE__";
const REQUEST_TIMEOUT = 120000;
const BRIDGE_CHECK_TIMEOUT = 1500;
const IMPORT_JOB_STORAGE_KEY = "gianhapLastImportJob";

function makeRequestId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function requestPage(action, payload = {}, timeoutMs = REQUEST_TIMEOUT) {
  const id = makeRequestId();

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      resolve({
        ok: false,
        error: "Tab gianhap.id.vn chua san sang nhan du lieu."
      });
    }, timeoutMs);

    function handleMessage(event) {
      if (event.source !== window) {
        return;
      }

      const data = event.data || {};
      if (data.type !== RESPONSE_TYPE || data.id !== id) {
        return;
      }

      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
      resolve(data);
    }

    window.addEventListener("message", handleMessage);
    window.postMessage(
      {
        type: REQUEST_TYPE,
        id,
        action,
        ...payload
      },
      window.location.origin
    );
  });
}

function scrapeSupplierState() {
  const composer = document.querySelector(".chat-composer");
  const chips = [...(composer?.querySelectorAll(".supplier-chip") || [])];
  const suppliers = chips
    .map((chip, index) => ({
      id: chip.dataset?.supplierId || `dom-supplier-${index + 1}`,
      name: chip.textContent.trim()
    }))
    .filter((supplier) => supplier.name);
  const active = chips.find((chip) => chip.classList.contains("active"));

  return {
    ok: suppliers.length > 0,
    loggedIn: !document.querySelector(".login-card"),
    suppliers,
    activeSupplierName: active?.textContent.trim() || "",
    activeSupplierId: active?.dataset?.supplierId || ""
  };
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function setNativeValue(element, value) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  const ownDescriptor = Object.getOwnPropertyDescriptor(element, "value");
  const setter = descriptor?.set || ownDescriptor?.set;

  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

async function waitForFrame() {
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
}

async function wait(ms) {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitUntil(predicate, timeoutMs = 2500, intervalMs = 80) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return true;
    }
    await wait(intervalMs);
  }

  return Boolean(predicate());
}

function findChatComposer() {
  return document.querySelector(".chat-composer");
}

function findSupplierChips() {
  const composer = findChatComposer();
  const scoped = [...(composer?.querySelectorAll(".supplier-chip") || [])];
  return scoped.length ? scoped : [...document.querySelectorAll(".supplier-chip")];
}

async function importByDom(payload) {
  const text = String(payload.text || "").trim();
  if (!text) {
    return {
      ok: false,
      error: "Chua co noi dung chat de gui."
    };
  }

  const supplierKey = normalizeSearch(payload.supplierName || "");
  const supplierId = String(payload.supplierId || "");
  const chips = findSupplierChips();
  const supplierChip =
    chips.find((chip) => chip.dataset?.supplierId === supplierId) ||
    chips.find((chip) => normalizeSearch(chip.textContent) === supplierKey) ||
    chips.find((chip) => normalizeSearch(chip.textContent).includes(supplierKey));

  if (supplierChip) {
    supplierChip.click();
    await waitForFrame();
    await wait(260);
  }

  const composer = findChatComposer();
  const textarea = composer?.querySelector("textarea") || document.querySelector(".chat-composer textarea");
  if (!textarea) {
    return {
      ok: false,
      error: "Khong tim thay o chat tren gianhap.id.vn."
    };
  }

  textarea.focus();
  setNativeValue(textarea, text);
  await waitForFrame();
  await waitUntil(() => textarea.value.trim() === text, 1200, 60);
  await wait(180);

  const sendButton = composer?.querySelector(".send-button") || document.querySelector(".chat-composer .send-button");
  if (!sendButton) {
    return {
      ok: false,
      error: "Khong tim thay nut Gui tren gianhap.id.vn."
    };
  }

  await waitUntil(() => !sendButton.disabled, 2200, 80);
  if (sendButton.disabled && supplierChip) {
    supplierChip.click();
    await waitForFrame();
    await wait(260);
    setNativeValue(textarea, text);
    await waitUntil(() => !sendButton.disabled, 1800, 80);
  }

  if (sendButton.disabled) {
    return {
      ok: false,
      error: "Da dien du lieu nhung nut Gui tren gianhap.id.vn van dang bi khoa. Hay kiem tra NCC dang chon."
    };
  }

  sendButton.click();
  return {
    ok: true,
    supplierId,
    supplierName: supplierChip?.textContent.trim() || payload.supplierName || ""
  };
}

function rememberImportJob(job) {
  chrome.storage.local.set({
    [IMPORT_JOB_STORAGE_KEY]: {
      ...job,
      savedAt: Date.now()
    }
  }).catch(() => {});
}

async function runImportJob(payload) {
  try {
    const response = await importByDom(payload);
    rememberImportJob({
      ok: Boolean(response?.ok),
      error: response?.error || "",
      supplierName: response?.supplierName || payload.supplierName || ""
    });
    return response;
  } catch (error) {
    const response = {
      ok: false,
      error: error.message || "Khong day duoc du lieu vao gianhap.id.vn."
    };
    rememberImportJob(response);
    return response;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GIANHAP_GET_STATE") {
    requestPage("getState", {}, BRIDGE_CHECK_TIMEOUT).then((response) => {
      sendResponse(response?.ok ? response : scrapeSupplierState());
    });
    return true;
  }

  if (message?.type === "GIANHAP_IMPORT") {
    sendResponse({
      ok: true,
      queued: true,
      supplierName: message.supplierName || ""
    });
    runImportJob(message);
    return false;
  }

  return false;
});
})();
