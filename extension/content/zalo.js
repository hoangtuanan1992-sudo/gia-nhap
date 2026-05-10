(() => {
if (window.__gianhapZaloContentScriptReady) {
  return;
}
window.__gianhapZaloContentScriptReady = true;

const STORAGE_KEY = "gianhapLastZaloSelection";
const HISTORY_KEY = "gianhapZaloSelectionHistory";
const PICKER_CLASS = "gianhap-zalo-pickable";
const SELECTED_CLASS = "gianhap-zalo-picked";
let pickModeEnabled = false;
let hoveredCandidate = null;

function isExtensionContextAlive() {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
}

function safeRuntimeSendMessage(message) {
  if (!isExtensionContextAlive()) {
    return;
  }

  try {
    chrome.runtime.sendMessage(message).catch(() => {});
  } catch {
    // Happens when Chrome reloads the extension while this old content script is still in the Zalo tab.
  }
}

function safeStorageGet(key, callback) {
  if (!isExtensionContextAlive()) {
    return;
  }

  try {
    chrome.storage.local.get(key).then(callback).catch(() => {});
  } catch {
    // Old content scripts can outlive the extension context until the tab is refreshed.
  }
}

function safeStorageSet(value) {
  if (!isExtensionContextAlive()) {
    return;
  }

  try {
    chrome.storage.local.set(value).catch(() => {});
  } catch {
    // Ignore invalidated extension contexts.
  }
}

const style = document.createElement("style");
style.textContent = `
  .${PICKER_CLASS} {
    outline: 2px solid #0f766e !important;
    outline-offset: 2px !important;
    cursor: copy !important;
    border-radius: 8px !important;
  }
  .${SELECTED_CLASS} {
    outline: 2px solid #c85f4a !important;
    outline-offset: 2px !important;
    border-radius: 8px !important;
  }
`;
document.documentElement.append(style);

function normalizeSelection(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readSelection() {
  return normalizeSelection(window.getSelection()?.toString() || "");
}

function readElementText(element) {
  return normalizeSelection(element?.innerText || element?.textContent || "");
}

function findZaloMessageTextContent(target) {
  const element = target instanceof Element ? target : target?.parentElement;
  return element?.closest?.('[data-component="message-text-content"]') || null;
}

function isBadCandidate(element, text) {
  if (!element || !text || text.length < 2) {
    return true;
  }

  if (element.closest("button, input, textarea, select, a, [contenteditable='true']")) {
    return true;
  }

  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return true;
  }

  if (rect.width > window.innerWidth * 0.86 || rect.height > window.innerHeight * 0.82) {
    return true;
  }

  const lower = text.toLowerCase();
  return lower.includes("zalo") && text.length < 8;
}

function getVisibleStyle(element) {
  try {
    return window.getComputedStyle(element);
  } catch {
    return null;
  }
}

function hasBubbleLikePaint(element) {
  const style = getVisibleStyle(element);
  if (!style) {
    return false;
  }

  const background = style.backgroundColor || "";
  const radius = Number.parseFloat(style.borderRadius) || 0;
  const shadow = style.boxShadow || "";
  const border = style.borderColor || "";
  return (
    radius >= 4 ||
    (background && background !== "rgba(0, 0, 0, 0)" && background !== "transparent") ||
    (shadow && shadow !== "none") ||
    (border && border !== "rgba(0, 0, 0, 0)")
  );
}

function scoreCandidate(element, text, baseTextLength = 0, depth = 0) {
  const className = String(element.className || "").toLowerCase();
  const role = String(element.getAttribute("role") || "").toLowerCase();
  const rect = element.getBoundingClientRect();
  const style = getVisibleStyle(element);
  let score = Math.min(text.length, 2200) * 1.8;

  if (/message|msg|chat|bubble|text|conv|item/.test(className)) {
    score += 400;
  }
  if (role === "listitem" || role === "article") {
    score += 160;
  }
  if (text.length > 8 && text.length < 1200) {
    score += 120;
  }
  if (text.length > baseTextLength + 24) {
    score += 260;
  }
  if (rect.width >= 140 && rect.width <= Math.min(560, window.innerWidth * 0.78)) {
    score += 240;
  }
  if (rect.height >= 44) {
    score += 220;
  }
  if (rect.height >= 120) {
    score += 260;
  }
  if (rect.width < window.innerWidth * 0.72) {
    score += 80;
  }
  if (hasBubbleLikePaint(element)) {
    score += 320;
  }
  if (style?.display === "inline" || style?.display === "inline-block") {
    score -= 380;
  }
  score += Math.min(depth, 6) * 85;

  return score;
}

function findChatCandidate(target) {
  const zaloMessageTextContent = findZaloMessageTextContent(target);
  if (zaloMessageTextContent) {
    const text = readElementText(zaloMessageTextContent);
    if (text) {
      return {
        element: zaloMessageTextContent,
        text,
        rect: zaloMessageTextContent.getBoundingClientRect(),
        score: Number.POSITIVE_INFINITY
      };
    }
  }

  const candidates = [];
  let element = target instanceof Element ? target : target?.parentElement;
  const baseText = readElementText(element);
  const baseTextLength = baseText.length;

  for (let depth = 0; element && depth < 14; depth += 1, element = element.parentElement) {
    const text = readElementText(element);
    if (!isBadCandidate(element, text)) {
      const rect = element.getBoundingClientRect();
      const parent = element.parentElement;
      const parentText = readElementText(parent);
      const parentRect = parent?.getBoundingClientRect?.();
      const parentLooksLikeThread =
        parentText.length > Math.max(text.length * 2.4, text.length + 1200) ||
        (parentRect && parentRect.width > window.innerWidth * 0.86) ||
        (parentRect && parentRect.height > window.innerHeight * 0.82);

      candidates.push({
        element,
        text,
        rect,
        score: scoreCandidate(element, text, baseTextLength, depth) + (parentLooksLikeThread ? 180 : 0)
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

function setHoveredCandidate(candidate) {
  if (hoveredCandidate === candidate?.element) {
    return;
  }

  hoveredCandidate?.classList.remove(PICKER_CLASS);
  hoveredCandidate = candidate?.element || null;
  hoveredCandidate?.classList.add(PICKER_CLASS);
}

function handlePickerMove(event) {
  if (!pickModeEnabled) {
    return;
  }

  setHoveredCandidate(findChatCandidate(event.target));
}

function handlePickerClick(event) {
  if (!pickModeEnabled) {
    return;
  }

  const candidate = findChatCandidate(event.target);
  if (!candidate?.text) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  candidate.element.classList.add(SELECTED_CLASS);
  safeRuntimeSendMessage({
    type: "ZALO_CHAT_SEGMENT_SELECTED",
    text: candidate.text,
    url: window.location.href
  });
}

function setPickMode(enabled) {
  pickModeEnabled = Boolean(enabled);
  document.documentElement.dataset.gianhapZaloPickMode = pickModeEnabled ? "true" : "false";
  if (!pickModeEnabled) {
    setHoveredCandidate(null);
  }

  return {
    ok: true,
    enabled: pickModeEnabled
  };
}

function rememberSelection() {
  const text = readSelection();
  if (!text) {
    return;
  }

  safeStorageGet(HISTORY_KEY, (stored) => {
    const history = Array.isArray(stored?.[HISTORY_KEY]) ? stored[HISTORY_KEY] : [];
    const nextItem = {
      text,
      url: window.location.href,
      savedAt: Date.now()
    };
    const nextHistory = [nextItem, ...history.filter((item) => item?.text !== text)].slice(0, 20);
    safeStorageSet({
      [STORAGE_KEY]: nextItem,
      [HISTORY_KEY]: nextHistory
    });
  });
}

document.addEventListener("mouseup", rememberSelection, true);
document.addEventListener("keyup", rememberSelection, true);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "ZALO_SET_PICK_MODE") {
    sendResponse(setPickMode(message.enabled));
    return false;
  }

  if (message?.type !== "ZALO_GET_SELECTION") {
    return false;
  }

  const selectedText = readSelection();
  if (selectedText) {
    const item = {
        text: selectedText,
        url: window.location.href,
        savedAt: Date.now()
      };
    safeStorageGet(HISTORY_KEY, (stored) => {
      const history = Array.isArray(stored?.[HISTORY_KEY]) ? stored[HISTORY_KEY] : [];
      safeStorageSet({
        [STORAGE_KEY]: item,
        [HISTORY_KEY]: [item, ...history.filter((entry) => entry?.text !== selectedText)].slice(0, 20)
      });
    });
    sendResponse({ ok: true, text: selectedText, source: "selection" });
    return false;
  }

  safeStorageGet(STORAGE_KEY, (stored) => {
    const item = stored?.[STORAGE_KEY];
    sendResponse({
      ok: Boolean(item?.text),
      text: item?.text || "",
      source: item?.text ? "last-selection" : "",
      error: item?.text ? "" : "Hay boi den doan chat tren Zalo Web truoc."
    });
  });

  return true;
});

document.addEventListener("mousemove", handlePickerMove, true);
document.addEventListener("click", handlePickerClick, true);
})();
