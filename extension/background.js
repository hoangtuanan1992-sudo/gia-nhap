const DRAFT_KEY = "gianhapZaloDraft";

async function queryTabs(queryInfo) {
  return chrome.tabs.query(queryInfo);
}

function splitSegments(text) {
  return String(text || "")
    .split(/\n\s*---+\s*\n|\n(?=Doan\s+\d+:\n)/i)
    .map((segment) => segment.trim())
    .map((segment) => segment.replace(/^Doan\s+\d+:\s*/i, "").trim())
    .filter(Boolean);
}

function joinSegments(segments) {
  return segments.map((segment) => segment.trim()).join("\n\n---\n\n");
}

function isMissingReceiverError(message = "") {
  return message.includes("Receiving end does not exist") || message.includes("Could not establish connection");
}

async function injectZaloContentScript(tab) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/zalo.js"]
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Khong the gan extension vao Zalo Web."
    };
  }
}

async function sendToZaloTab(tab, message) {
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    if (!isMissingReceiverError(error.message || "")) {
      return {
        ok: false,
        error: error.message || "Khong ket noi duoc Zalo Web."
      };
    }

    const injected = await injectZaloContentScript(tab);
    if (!injected.ok) {
      return injected;
    }

    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (retryError) {
      return {
        ok: false,
        error: retryError.message || "Khong ket noi duoc Zalo Web."
      };
    }
  }
}

async function getActiveZaloTab() {
  const [activeTab] = await queryTabs({ active: true, currentWindow: true });
  if (activeTab?.id && /zalo\.me/i.test(activeTab.url || "")) {
    return activeTab;
  }

  const zaloTabs = await queryTabs({ url: ["https://chat.zalo.me/*", "https://*.zalo.me/*"] });
  return zaloTabs.find((tab) => tab.id && !tab.discarded) || null;
}

async function setZaloPickMode(enabled = true) {
  const tab = await getActiveZaloTab();
  if (!tab?.id) {
    return {
      ok: false,
      error: "Hay mo tab Zalo Web de bam chon tung doan chat."
    };
  }

  return sendToZaloTab(tab, { type: "ZALO_SET_PICK_MODE", enabled });
}

async function addDraftSegment(text, sender) {
  const segment = String(text || "").trim();
  if (!segment) {
    return {
      ok: false,
      error: "Tin nhan khong co noi dung."
    };
  }

  const stored = await chrome.storage.local.get(DRAFT_KEY);
  const draft = stored?.[DRAFT_KEY] || {};
  const segments = Array.isArray(draft.selectedSegments)
    ? draft.selectedSegments.filter(Boolean)
    : splitSegments(draft.text || "");
  const exists = segments.some((item) => item.trim() === segment);

  if (!exists) {
    segments.push(segment);
  }

  const nextDraft = {
    text: joinSegments(segments),
    selectedSegments: segments,
    savedAt: Date.now()
  };

  await chrome.storage.local.set({ [DRAFT_KEY]: nextDraft });
  chrome.runtime.sendMessage({
    type: "SIDE_PANEL_DRAFT_UPDATED",
    draft: nextDraft,
    added: !exists
  }).catch(() => {});

  if (sender?.tab?.windowId) {
    chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {});
  }

  return {
    ok: true,
    added: !exists,
    count: segments.length,
    text: nextDraft.text
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) {
    return false;
  }

  const handlers = {
    SIDE_PANEL_START_ZALO_PICK: () => setZaloPickMode(true),
    SIDE_PANEL_STOP_ZALO_PICK: () => setZaloPickMode(false),
    ZALO_CHAT_SEGMENT_SELECTED: () => addDraftSegment(message.text, sender)
  };

  const handler = handlers[message.type];
  if (!handler) {
    return false;
  }

  handler()
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error.message || "Extension bi loi."
      });
    });

  return true;
});

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
  if (/zalo\.me/i.test(tab.url || "")) {
    await setZaloPickMode(true);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
