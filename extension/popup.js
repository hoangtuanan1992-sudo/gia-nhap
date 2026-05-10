const DRAFT_KEY = "gianhapPopupDraft";

const elements = {
  statusText: document.getElementById("statusText"),
  refreshButton: document.getElementById("refreshButton"),
  pickButton: document.getElementById("pickButton"),
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
  isSending: false,
  selectedSegments: []
};

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
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

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
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

async function loadDraft() {
  const stored = await chrome.storage.local.get(DRAFT_KEY);
  const draft = stored?.[DRAFT_KEY];
  if (!draft) {
    return;
  }

  elements.chatText.value = draft.text || "";
  state.selectedSegments = Array.isArray(draft.selectedSegments)
    ? draft.selectedSegments.filter(Boolean)
    : splitSegments(draft.text || "");
  state.selectedSupplierId = draft.supplierId || "";
  state.selectedSupplierName = draft.supplierName || "";
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

function joinSegments(segments) {
  return segments.map((segment) => segment.trim()).join("\n\n---\n\n");
}

function addChatSegment(text) {
  const segment = String(text || "").trim();
  if (!segment) {
    return false;
  }

  syncSegmentsFromText();
  const exists = state.selectedSegments.some((item) => item.trim() === segment);
  if (!exists) {
    state.selectedSegments.push(segment);
  }

  elements.chatText.value = joinSegments(state.selectedSegments);
  saveDraft();
  return !exists;
}

function renderSuppliers() {
  const search = normalizeSearch(elements.supplierSearch.value);
  const filtered = state.suppliers.filter((supplier) => {
    return !search || normalizeSearch(supplier.name).includes(search);
  });

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
      elements.chatText.placeholder = `Dan tin nhan hoac bang gia tu ${supplier.name}...`;
      renderSuppliers();
      saveDraft();
    });
    elements.supplierList.append(button);
  }
}

async function refreshGianhapState() {
  setStatus("Dang ket noi tab gianhap.id.vn...");
  const response = await sendRuntimeMessage({ type: "POPUP_GET_GIANHAP_STATE" });
  if (!response?.ok) {
    state.suppliers = [];
    renderSuppliers();
    setStatus(response?.error || "Khong tim thay tab gianhap.id.vn.");
    return;
  }

  state.suppliers = Array.isArray(response.suppliers) ? response.suppliers : [];
  const activeSupplier = state.suppliers.find((supplier) => supplier.id === response.activeSupplierId);
  const savedSupplier = state.suppliers.find((supplier) => supplier.id === state.selectedSupplierId);
  const byName = state.suppliers.find((supplier) => supplier.name === state.selectedSupplierName);
  const nextSupplier = savedSupplier || byName || activeSupplier || state.suppliers[0] || null;

  state.selectedSupplierId = nextSupplier?.id || "";
  state.selectedSupplierName = nextSupplier?.name || "";
  elements.chatText.placeholder = nextSupplier
    ? `Dan tin nhan hoac bang gia tu ${nextSupplier.name}...`
    : "Chon NCC truoc khi dan du lieu...";
  renderSuppliers();

  if (!response.loggedIn) {
    setStatus("Tab gianhap.id.vn chua dang nhap xong.");
    return;
  }

  setStatus("San sang chon doan chat tu Zalo Web.");
}

async function pickSelection() {
  setStatus("Dang lay doan chat dang boi den...");
  const response = await sendRuntimeMessage({ type: "POPUP_GET_SELECTION" });
  if (!response?.ok || !response.text) {
    setStatus(response?.error || "Hay boi den doan chat tren Zalo Web truoc.");
    return;
  }

  const added = addChatSegment(response.text);
  const total = state.selectedSegments.length;
  const sourceText =
    response.source === "last-selection"
      ? "Da lay doan chat vua chon gan nhat."
      : "Da lay doan chat dang chon.";
  setStatus(added ? `${sourceText} Dang gom ${total} doan.` : `Doan nay da co san. Dang gom ${total} doan.`);
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
  elements.sendButton.disabled = true;
  setStatus("Dang day du lieu vao gianhap.id.vn...");

  const response = await sendRuntimeMessage({
    type: "POPUP_IMPORT_TO_GIANHAP",
    text,
    supplierId: state.selectedSupplierId,
    supplierName: state.selectedSupplierName
  });

  state.isSending = false;
  elements.sendButton.disabled = false;

  if (!response?.ok) {
    setStatus(response?.error || "Khong gui duoc du lieu.");
    return;
  }

  chrome.storage.local.remove(DRAFT_KEY);
  elements.chatText.value = "";
  state.selectedSegments = [];
  setStatus(`Da gui du lieu cho ${response.supplierName || state.selectedSupplierName}.`);
}

function clearDraft() {
  elements.chatText.value = "";
  state.selectedSegments = [];
  chrome.storage.local.remove(DRAFT_KEY);
  setStatus("Da xoa noi dung dang nhap.");
}

elements.refreshButton.addEventListener("click", refreshGianhapState);
elements.pickButton.addEventListener("click", pickSelection);
elements.clearButton.addEventListener("click", clearDraft);
elements.sendButton.addEventListener("click", sendToGianhap);
elements.supplierSearch.addEventListener("input", renderSuppliers);
elements.chatText.addEventListener("input", () => {
  syncSegmentsFromText();
  saveDraft();
});

loadDraft().then(() => {
  refreshGianhapState();
});
