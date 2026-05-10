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
  supplierList: document.getElementById("supplierList")
};

const state = {
  suppliers: [],
  selectedSupplierId: "",
  selectedSupplierName: "",
  selectedSegments: [],
  isSending: false
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
    setDebugOutput(response || {});
    return;
  }

  setStatus("Da kiem tra xong. Gui minh noi dung debug ben duoi neu van loi.");
  setDebugOutput(response.diagnostics || response);
}

async function sendToGianhap() {
  const text = elements.chatText.value.trim();
  if (!text) {
    setStatus("Chua co noi dung chat de gui.");
    return;
  }

  if (!state.selectedSupplierId && !state.selectedSupplierName) {
    setStatus("Chua chon nha cung cap.");
    return;
  }

  state.isSending = true;
  updateSendButtonState();
  setStatus("Dang day du lieu vao gianhap.id.vn...");

  const response = await sendRuntimeMessage({
    type: "SIDE_PANEL_IMPORT_TO_GIANHAP",
    text,
    supplierId: state.selectedSupplierId,
    supplierName: state.selectedSupplierName
  }, IMPORT_RESPONSE_TIMEOUT);

  state.isSending = false;
  updateSendButtonState();

  if (!response?.ok) {
    setStatus(response?.error || "Khong gui duoc du lieu.");
    return;
  }

  chrome.storage.local.remove(DRAFT_KEY);
  elements.chatText.value = "";
  state.selectedSegments = [];
  setStatus(
    response.usedBridge
      ? `Da gui qua bridge gianhap.id.vn cho ${response.supplierName || state.selectedSupplierName}.`
      : `Da bam Gui tren gianhap.id.vn cho ${response.supplierName || state.selectedSupplierName}.`
  );
}

function clearDraft() {
  elements.chatText.value = "";
  state.selectedSegments = [];
  chrome.storage.local.remove(DRAFT_KEY);
  setStatus("Da xoa noi dung dang nhap.");
  updateSendButtonState();
}

elements.refreshButton.addEventListener("click", () => {
  refreshGianhapState();
  startZaloPick();
});
elements.diagnoseButton.addEventListener("click", diagnoseGianhap);
elements.clearButton.addEventListener("click", clearDraft);
elements.sendButton.addEventListener("click", sendToGianhap);
elements.supplierSearch.addEventListener("input", renderSuppliers);
elements.chatText.addEventListener("input", () => {
  syncSegmentsFromText();
  saveDraft();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes[DRAFT_KEY]?.newValue) {
    applyDraft(changes[DRAFT_KEY].newValue);
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
