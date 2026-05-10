const DRAFT_KEY = "gianhapPopupDraft";
const IMPORT_JOB_STORAGE_KEY = "gianhapLastImportJob";
const IMPORT_RESPONSE_TIMEOUT = 30000;

const elements = {
  statusText: document.getElementById("statusText"),
  debugOutput: document.getElementById("debugOutput"),
  diagnoseButton: document.getElementById("diagnoseButton"),
  refreshButton: document.getElementById("refreshButton"),
  clearButton: document.getElementById("clearButton"),
  sendButton: document.getElementById("sendButton"),
  chatText: document.getElementById("chatText"),
  supplierSearch: document.getElementById("supplierSearch"),
  supplierList: document.getElementById("supplierList"),
  giftPrompt: document.getElementById("giftPrompt"),
  giftSupplierName: document.getElementById("giftSupplierName"),
  giftCode: document.getElementById("giftCode"),
  giftValue: document.getElementById("giftValue"),
  giftSkipButton: document.getElementById("giftSkipButton")
};

const state = {
  suppliers: [],
  selectedSupplierId: "",
  selectedSupplierName: "",
  selectedSegments: [],
  isSending: false,
  pendingGift: null
};

function sendRuntimeMessage(message, timeoutMs = IMPORT_RESPONSE_TIMEOUT, timeoutFallback = null) {
  return new Promise((resolve) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(
        timeoutFallback || {
          ok: false,
          timeout: true,
          error: "Extension khong nhan duoc phan hoi kip thoi."
        }
      );
    }, timeoutMs);

    chrome.runtime.sendMessage(message, (response) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeout);

      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error: chrome.runtime.lastError.message
        });
        return;
      }

      resolve(response || { ok: false, error: "Khong co phan hoi tu extension." });
    });
  });
}

function setStatus(message) {
  elements.statusText.textContent = message;
}

function updateSendButtonState() {
  elements.sendButton.disabled = state.isSending || !state.selectedSupplierId;
}

function renderGiftPrompt() {
  if (!elements.giftPrompt) {
    return;
  }

  if (!state.pendingGift) {
    elements.giftPrompt.hidden = true;
    elements.giftValue.value = "";
    return;
  }

  elements.giftSupplierName.textContent = state.pendingGift.supplierName || state.selectedSupplierName || "";
  elements.giftCode.textContent = state.pendingGift.giftCode || "";
  elements.giftPrompt.hidden = false;
  elements.giftValue.focus();
}

function clearPendingGift() {
  state.pendingGift = null;
  renderGiftPrompt();
}

function setDebugOutput(value) {
  if (!elements.debugOutput) {
    return;
  }

  if (!value) {
    elements.debugOutput.hidden = true;
    elements.debugOutput.textContent = "";
    return;
  }

  elements.debugOutput.hidden = false;
  elements.debugOutput.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
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

const giftPhrasePatterns = [
  { code: "KM kem theo", pattern: /\bkm\s*kem\s*theo\b/ },
  { code: "KM dac biet", pattern: /\bkm\s*dac\s*biet\b/ },
  { code: "Xuat kich", pattern: /\bxuat\s*kich\b/ },
  { code: "Tang kem", pattern: /\btang\s*kem\b/ },
  { code: "KM", pattern: /\bkm\b(?!\s*(?:kem\s*theo|dac\s*biet))/ },
  { code: "Qua", pattern: /\bqua\b/ },
  { code: "XK", pattern: /\bxk\b/ },
  { code: "FT", pattern: /\bft\b/ }
];

function normalizeGiftCode(value = "") {
  return normalizeSearch(value).replace(/\s+/g, "").toUpperCase();
}

function addGiftCandidate(codes, seen, code = "") {
  const displayCode = String(code || "").trim();
  const key = normalizeGiftCode(displayCode);
  if (!displayCode || !key || seen.has(key)) {
    return;
  }

  seen.add(key);
  codes.push(displayCode);
}

function findGiftCodeInText(text = "") {
  const codes = [];
  const seen = new Set();
  const pricePattern = /(?:^|[\s:])(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(?=\s|$|[+-])/g;
  const codePattern = /(?:^|[\s,+-])([A-Za-z]{1,8}\d{1,5}[A-Za-z0-9]*)\b/g;

  for (const line of String(text || "").split(/\n+/)) {
    const firstPrice = [...line.matchAll(pricePattern)][0];
    if (!firstPrice) {
      continue;
    }

    const tail = line.slice(firstPrice.index + firstPrice[0].length);
    const normalizedTail = normalizeSearch(tail);

    for (const item of giftPhrasePatterns) {
      if (item.pattern.test(normalizedTail)) {
        addGiftCandidate(codes, seen, item.code);
      }
    }

    for (const match of tail.matchAll(codePattern)) {
      addGiftCandidate(codes, seen, match[1].toUpperCase());
    }
  }

  return codes[0] || "";
}

function splitSegments(text) {
  return String(text || "")
    .split(/\n\s*---+\s*\n|\n(?=Doan\s+\d+:\n)/i)
    .map((segment) => segment.trim())
    .map((segment) => segment.replace(/^Doan\s+\d+:\s*/i, "").trim())
    .filter(Boolean);
}

function syncSegmentsFromText() {
  state.selectedSegments = splitSegments(elements.chatText.value);
}

function saveDraft() {
  chrome.storage.local.set({
    [DRAFT_KEY]: {
      text: elements.chatText.value,
      selectedSegments: state.selectedSegments,
      supplierId: state.selectedSupplierId,
      supplierName: state.selectedSupplierName,
      savedAt: Date.now()
    }
  });
}

function applyDraft(draft = {}) {
  elements.chatText.value = draft.text || "";
  state.selectedSegments = Array.isArray(draft.selectedSegments)
    ? draft.selectedSegments.filter(Boolean)
    : splitSegments(draft.text || "");
  state.selectedSupplierId = draft.supplierId || state.selectedSupplierId;
  state.selectedSupplierName = draft.supplierName || state.selectedSupplierName;
}

function syncSelectedSupplierWithList() {
  if (!state.suppliers.length) {
    state.selectedSupplierId = "";
    state.selectedSupplierName = "";
    updateSendButtonState();
    return null;
  }

  const savedById = state.suppliers.find((supplier) => supplier.id === state.selectedSupplierId);
  const savedByName = state.suppliers.find((supplier) => supplier.name === state.selectedSupplierName);
  const nextSupplier = savedById || savedByName || null;

  if (!nextSupplier) {
    state.selectedSupplierId = "";
    state.selectedSupplierName = "";
    elements.chatText.placeholder = "Chon NCC truoc khi gui du lieu...";
    updateSendButtonState();
    return null;
  }

  state.selectedSupplierId = nextSupplier.id;
  state.selectedSupplierName = nextSupplier.name;
  elements.chatText.placeholder = `Bam tung doan chat tren Zalo Web de gui cho ${nextSupplier.name}...`;
  updateSendButtonState();
  return nextSupplier;
}

async function loadDraft() {
  const stored = await chrome.storage.local.get(DRAFT_KEY);
  if (stored?.[DRAFT_KEY]) {
    applyDraft(stored[DRAFT_KEY]);
  }
}

function renderSuppliers() {
  const search = normalizeSearch(elements.supplierSearch.value);
  const filtered = state.suppliers.filter((supplier) => !search || normalizeSearch(supplier.name).includes(search));

  elements.supplierList.replaceChildren();

  if (!filtered.length) {
    const empty = document.createElement("span");
    empty.className = "supplier-empty";
    empty.textContent = "Khong co NCC phu hop";
    elements.supplierList.append(empty);
    return;
  }

  for (const supplier of filtered) {
    const button = document.createElement("button");
    button.className = `supplier-chip ${supplier.id === state.selectedSupplierId ? "active" : ""}`;
    button.type = "button";
    button.textContent = supplier.name;
    button.addEventListener("click", () => {
      state.selectedSupplierId = supplier.id;
      state.selectedSupplierName = supplier.name;
      clearPendingGift();
      elements.chatText.placeholder = `Bam tung doan chat tren Zalo Web de gui cho ${supplier.name}...`;
      renderSuppliers();
      updateSendButtonState();
      saveDraft();
    });
    elements.supplierList.append(button);
  }
}

async function refreshGianhapState() {
  setStatus("Dang ket noi gianhap.id.vn...");
  const response = await sendRuntimeMessage({ type: "SIDE_PANEL_GET_GIANHAP_STATE" });
  if (!response?.ok) {
    state.suppliers = [];
    renderSuppliers();
    setStatus(response?.error || "Khong tim thay tab gianhap.id.vn.");
    return;
  }

  state.suppliers = Array.isArray(response.suppliers) ? response.suppliers : [];
  syncSelectedSupplierWithList();
  renderSuppliers();
  saveDraft();

  if (!response.loggedIn) {
    setStatus("Tab gianhap.id.vn chua dang nhap xong.");
    updateSendButtonState();
    return;
  }

  setStatus("Bam truc tiep tung tin nhan tren Zalo Web de them vao o chat.");
  updateSendButtonState();
}

async function startZaloPick() {
  const response = await sendRuntimeMessage({ type: "SIDE_PANEL_START_ZALO_PICK" });
  if (!response?.ok) {
    setStatus(response?.error || "Chua bat duoc che do chon tin nhan Zalo.");
    return;
  }

  setStatus("Che do chon tin nhan Zalo dang bat.");
}

async function diagnoseGianhap() {
  setStatus("Dang kiem tra ket noi gianhap.id.vn...");
  setDebugOutput("");
  const response = await sendRuntimeMessage({ type: "SIDE_PANEL_DIAGNOSE_GIANHAP" }, 12000);
  if (!response?.ok) {
    setStatus(response?.error || "Khong kiem tra duoc gianhap.id.vn.");
    setDebugOutput({
      panel: {
        selectedSupplierId: state.selectedSupplierId,
        selectedSupplierName: state.selectedSupplierName,
        chatTextLength: elements.chatText.value.trim().length,
        selectedSegmentCount: state.selectedSegments.length,
        sendButtonDisabled: elements.sendButton.disabled
      },
      response: response || {}
    });
    return;
  }

  setStatus("Da kiem tra xong. Gui minh noi dung debug ben duoi neu van loi.");
  setDebugOutput({
    panel: {
      selectedSupplierId: state.selectedSupplierId,
      selectedSupplierName: state.selectedSupplierName,
      chatTextLength: elements.chatText.value.trim().length,
      selectedSegmentCount: state.selectedSegments.length,
      sendButtonDisabled: elements.sendButton.disabled
    },
    gianhap: response.diagnostics || response
  });
}

async function sendToGianhap(options = {}) {
  const text = elements.chatText.value.trim();
  if (!text) {
    setStatus("Chua co noi dung chat de gui.");
    return;
  }

  if (!state.selectedSupplierId && !state.selectedSupplierName) {
    setStatus("Chua chon nha cung cap.");
    return;
  }

  if (state.pendingGift && !options.giftResolution) {
    setStatus("Nhap gia tri qua tang hoac bam Bo Qua trong extension.");
    renderGiftPrompt();
    return;
  }

  const localGiftCode = !options.giftResolution ? findGiftCodeInText(text) : "";
  if (localGiftCode) {
    state.pendingGift = {
      giftCode: localGiftCode,
      supplierId: state.selectedSupplierId,
      supplierName: state.selectedSupplierName
    };
    renderGiftPrompt();
    setStatus(`Can khai bao ma qua tang ${localGiftCode} truoc khi gui.`);
    setDebugOutput("");
    return;
  }

  state.isSending = true;
  updateSendButtonState();
  setStatus("Dang day du lieu vao gianhap.id.vn...");

  const response = await sendRuntimeMessage({
    type: "SIDE_PANEL_IMPORT_TO_GIANHAP",
    text,
    supplierId: state.selectedSupplierId,
    supplierName: state.selectedSupplierName,
    giftResolution: options.giftResolution || null
  }, IMPORT_RESPONSE_TIMEOUT);

  state.isSending = false;
  updateSendButtonState();

  if (response?.needsGiftCode) {
    state.pendingGift = {
      giftCode: response.giftCode || "",
      supplierId: response.supplierId || state.selectedSupplierId,
      supplierName: response.supplierName || state.selectedSupplierName
    };
    renderGiftPrompt();
    setStatus(`Can khai bao ma qua tang ${state.pendingGift.giftCode} truoc khi gui.`);
    setDebugOutput("");
    return;
  }

  if (!response?.ok) {
    setStatus(response?.error || "Khong gui duoc du lieu.");
    setDebugOutput({
      sendError: response || null,
      panel: {
        selectedSupplierId: state.selectedSupplierId,
        selectedSupplierName: state.selectedSupplierName,
        chatTextLength: text.length,
        selectedSegmentCount: state.selectedSegments.length,
        sendButtonDisabled: elements.sendButton.disabled
      }
    });
    return;
  }

  chrome.storage.local.remove(DRAFT_KEY);
  elements.chatText.value = "";
  state.selectedSegments = [];
  clearPendingGift();
  setStatus(
    response.usedQueue
      ? `Da chuyen vao hang doi gianhap.id.vn cho ${response.supplierName || state.selectedSupplierName}.`
      : response.usedBridge
      ? `Da gui qua bridge gianhap.id.vn cho ${response.supplierName || state.selectedSupplierName}.`
      : `Da bam Gui tren gianhap.id.vn cho ${response.supplierName || state.selectedSupplierName}.`
  );
}

function clearDraft() {
  elements.chatText.value = "";
  state.selectedSegments = [];
  clearPendingGift();
  chrome.storage.local.remove(DRAFT_KEY);
  setStatus("Da xoa noi dung dang nhap.");
  updateSendButtonState();
}

async function submitGiftValue(event) {
  event.preventDefault();
  if (!state.pendingGift) {
    return;
  }

  const value = elements.giftValue.value.trim();
  if (!value) {
    setStatus("Nhap gia tri cho ma qua tang moi.");
    elements.giftValue.focus();
    return;
  }

  await sendToGianhap({
    giftResolution: {
      code: state.pendingGift.giftCode,
      value
    }
  });
}

async function skipGiftValue() {
  if (!state.pendingGift) {
    return;
  }

  await sendToGianhap({
    giftResolution: {
      code: state.pendingGift.giftCode,
      skip: true
    }
  });
}

elements.refreshButton.addEventListener("click", () => {
  refreshGianhapState();
  startZaloPick();
});
elements.diagnoseButton.addEventListener("click", diagnoseGianhap);
elements.clearButton.addEventListener("click", clearDraft);
elements.sendButton.addEventListener("click", sendToGianhap);
elements.giftPrompt.addEventListener("submit", submitGiftValue);
elements.giftSkipButton.addEventListener("click", skipGiftValue);
elements.supplierSearch.addEventListener("input", renderSuppliers);
elements.chatText.addEventListener("input", () => {
  syncSegmentsFromText();
  clearPendingGift();
  saveDraft();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes[DRAFT_KEY]?.newValue) {
    applyDraft(changes[DRAFT_KEY].newValue);
    clearPendingGift();
    renderSuppliers();
    const count = state.selectedSegments.length;
    if (count) {
      setStatus(`Da chon ${count} doan chat.`);
    }
  }

  if (changes[IMPORT_JOB_STORAGE_KEY]?.newValue) {
    const job = changes[IMPORT_JOB_STORAGE_KEY].newValue;
    setStatus(
      job.ok
        ? `gianhap.id.vn da nhan lenh gui cho ${job.supplierName || state.selectedSupplierName}.`
        : job.error || "gianhap.id.vn chua nhan duoc du lieu."
    );
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "SIDE_PANEL_DRAFT_UPDATED") {
    return false;
  }

  applyDraft(message.draft || {});
  renderSuppliers();
  setStatus(message.added ? `Da them ${state.selectedSegments.length} doan chat.` : "Doan chat nay da co trong o nhap.");
  return false;
});

loadDraft().then(async () => {
  await refreshGianhapState();
  await startZaloPick();
  updateSendButtonState();
});
