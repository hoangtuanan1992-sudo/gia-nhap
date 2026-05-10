const DRAFT_KEY = "gianhapZaloDraft";

const elements = {
  statusText: document.getElementById("statusText"),
  refreshButton: document.getElementById("refreshButton"),
  clearButton: document.getElementById("clearButton"),
  copyButton: document.getElementById("copyButton"),
  chatText: document.getElementById("chatText")
};

const state = {
  selectedSegments: []
};

function sendRuntimeMessage(message, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        ok: false,
        timeout: true,
        error: "Extension khong nhan duoc phan hoi kip thoi."
      });
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

function updateCopyButtonState() {
  elements.copyButton.disabled = !elements.chatText.value.trim();
}

function saveDraft() {
  chrome.storage.local.set({
    [DRAFT_KEY]: {
      text: elements.chatText.value,
      selectedSegments: state.selectedSegments,
      savedAt: Date.now()
    }
  });
}

function applyDraft(draft = {}) {
  elements.chatText.value = draft.text || "";
  state.selectedSegments = Array.isArray(draft.selectedSegments)
    ? draft.selectedSegments.filter(Boolean)
    : splitSegments(draft.text || "");
  updateCopyButtonState();
}

async function loadDraft() {
  const stored = await chrome.storage.local.get(DRAFT_KEY);
  if (stored?.[DRAFT_KEY]) {
    applyDraft(stored[DRAFT_KEY]);
  }
}

async function startZaloPick() {
  const response = await sendRuntimeMessage({ type: "SIDE_PANEL_START_ZALO_PICK" });
  if (!response?.ok) {
    setStatus(response?.error || "Chua bat duoc che do chon tin nhan Zalo.");
    return;
  }

  setStatus("Bam truc tiep tung tin nhan lon tren Zalo Web de them vao o chat.");
}

async function copyChatText() {
  const text = elements.chatText.value.trim();
  if (!text) {
    setStatus("Chua co noi dung de copy.");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setStatus(`Da copy ${state.selectedSegments.length || 1} doan chat. Hay dan vao gianhap.id.vn.`);
  } catch {
    elements.chatText.focus();
    elements.chatText.select();
    const copied = document.execCommand("copy");
    setStatus(copied ? "Da copy noi dung." : "Khong copy duoc. Hay chon text va copy thu cong.");
  }
}

function clearDraft() {
  elements.chatText.value = "";
  state.selectedSegments = [];
  chrome.storage.local.remove(DRAFT_KEY);
  updateCopyButtonState();
  setStatus("Da xoa noi dung dang nhap.");
}

elements.refreshButton.addEventListener("click", startZaloPick);
elements.clearButton.addEventListener("click", clearDraft);
elements.copyButton.addEventListener("click", copyChatText);
elements.chatText.addEventListener("input", () => {
  syncSegmentsFromText();
  updateCopyButtonState();
  saveDraft();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes[DRAFT_KEY]?.newValue) {
    applyDraft(changes[DRAFT_KEY].newValue);
    const count = state.selectedSegments.length;
    setStatus(count ? `Da chon ${count} doan chat.` : "Dang san sang chon tin nhan tren Zalo Web.");
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "SIDE_PANEL_DRAFT_UPDATED") {
    return false;
  }

  applyDraft(message.draft || {});
  setStatus(message.added ? `Da them ${state.selectedSegments.length} doan chat.` : "Doan chat nay da co trong o nhap.");
  return false;
});

loadDraft().then(async () => {
  await startZaloPick();
  updateCopyButtonState();
});
