const GIANHAP_URL_PATTERNS = [
  "https://gianhap.id.vn/*",
  "https://www.gianhap.id.vn/*",
  "http://localhost/*",
  "http://127.0.0.1/*"
];
const DRAFT_KEY = "gianhapPopupDraft";

async function queryTabs(queryInfo) {
  return chrome.tabs.query(queryInfo);
}

async function findGianhapTab() {
  for (const url of GIANHAP_URL_PATTERNS) {
    const tabs = await queryTabs({ url });
    const tab = tabs.find((item) => item.id && !item.discarded);
    if (tab) {
      return tab;
    }
  }

  return null;
}

function isInjectableUrl(url = "") {
  return /^https?:\/\//i.test(url);
}

function isMissingReceiverError(message = "") {
  return message.includes("Receiving end does not exist") || message.includes("Could not establish connection");
}

async function injectContentScript(tab, file) {
  if (!tab?.id || !isInjectableUrl(tab.url)) {
    return {
      ok: false,
      error: "Tab hien tai khong cho extension ket noi."
    };
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [file]
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Khong the gan extension vao tab."
    };
  }
}

async function sendToTab(tab, message, fallbackFile) {
  const sendPromise = (async () => {
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    if (fallbackFile && isMissingReceiverError(error.message || "")) {
      const injected = await injectContentScript(tab, fallbackFile);
      if (!injected.ok) {
        return injected;
      }

      try {
        return await chrome.tabs.sendMessage(tab.id, message);
      } catch (retryError) {
        return {
          ok: false,
          error: retryError.message || "Khong ket noi duoc tab sau khi gan extension."
        };
      }
    }

    return {
      ok: false,
      error: error.message || "Khong ket noi duoc tab."
    };
  }
  })();

  if (message?.type !== "GIANHAP_IMPORT") {
    return sendPromise;
  }

  return Promise.race([
    sendPromise,
    new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          ok: true,
          queued: true,
          timeout: true
        });
      }, 5000);
    })
  ]);
}

async function getActiveSelection() {
  const [activeTab] = await queryTabs({ active: true, currentWindow: true });
  if (!activeTab?.id) {
    return {
      ok: false,
      error: "Khong tim thay tab hien tai."
    };
  }

  if (!/zalo\.me/i.test(activeTab.url || "")) {
    return {
      ok: false,
      error: "Hay mo tab Zalo Web, boi den doan chat roi bam extension."
    };
  }

  return sendToTab(activeTab, { type: "ZALO_GET_SELECTION" }, "content/zalo.js");
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
    ...draft,
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

  return sendToTab(tab, { type: "ZALO_SET_PICK_MODE", enabled }, "content/zalo.js");
}

async function getGianhapState() {
  const tab = await findGianhapTab();
  if (!tab?.id) {
    return {
      ok: false,
      error: "Hay mo tab gianhap.id.vn va dang nhap truoc."
    };
  }

  const response = await sendToTab(tab, { type: "GIANHAP_GET_STATE" }, "content/gianhap.js");
  return {
    ...response,
    tabId: tab.id,
    tabUrl: tab.url
  };
}

async function diagnoseGianhap() {
  const tab = await findGianhapTab();
  if (!tab?.id) {
    return {
      ok: false,
      error: "Khong tim thay tab gianhap.id.vn dang mo."
    };
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        function requestBridge(action, payload = {}, timeoutMs = 2500) {
          const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const requestType = "__GIANHAP_EXTENSION_REQUEST__";
          const responseType = "__GIANHAP_EXTENSION_RESPONSE__";

          return new Promise((resolve) => {
            const timeout = setTimeout(() => {
              window.removeEventListener("message", handleMessage);
              resolve({
                ok: false,
                error: "Bridge khong phan hoi trong thoi gian cho."
              });
            }, timeoutMs);

            function handleMessage(event) {
              if (event.source !== window) {
                return;
              }

              const data = event.data || {};
              if (data.type !== responseType || data.id !== id) {
                return;
              }

              clearTimeout(timeout);
              window.removeEventListener("message", handleMessage);
              resolve(data);
            }

            window.addEventListener("message", handleMessage);
            window.postMessage(
              {
                type: requestType,
                id,
                action,
                ...payload
              },
              window.location.origin
            );
          });
        }

        const composer = document.querySelector(".chat-composer");
        const textarea = composer?.querySelector("textarea") || null;
        const sendButton = composer?.querySelector(".send-button") || null;
        const bridge = await requestBridge("getState", {}, 2500);
        const composerChips = [...(composer?.querySelectorAll(".supplier-chip") || [])].map((chip) => ({
          text: chip.textContent.trim(),
          active: chip.classList.contains("active"),
          disabled: Boolean(chip.disabled),
          className: String(chip.className || "")
        }));
        const allChips = [...document.querySelectorAll(".supplier-chip")].map((chip) => chip.textContent.trim()).slice(0, 30);

        return {
          href: location.href,
          title: document.title,
          readyState: document.readyState,
          hasLoginCard: Boolean(document.querySelector(".login-card")),
          hasComposer: Boolean(composer),
          hasTextarea: Boolean(textarea),
          textareaPlaceholder: textarea?.placeholder || "",
          textareaLength: textarea?.value?.length || 0,
          hasSendButton: Boolean(sendButton),
          sendButtonDisabled: sendButton ? Boolean(sendButton.disabled) : null,
          sendButtonText: sendButton?.textContent?.trim() || "",
          composerSupplierCount: composerChips.length,
          composerSuppliers: composerChips,
          allSupplierCount: document.querySelectorAll(".supplier-chip").length,
          allSuppliersPreview: allChips,
          bridge
        };
      }
    });

    return {
      ok: true,
      tabId: tab.id,
      tabUrl: tab.url,
      diagnostics: results?.[0]?.result || {}
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Khong the kiem tra tab gianhap.id.vn."
    };
  }
}

async function executeGianhapDomImport(tab, payload) {
  try {
    const executePromise = chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [payload],
      func: async (payload) => {
        function requestPageBridge(action, payload = {}, timeoutMs = 2500) {
          const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const requestType = "__GIANHAP_EXTENSION_REQUEST__";
          const responseType = "__GIANHAP_EXTENSION_RESPONSE__";

          return new Promise((resolve) => {
            const timeout = setTimeout(() => {
              window.removeEventListener("message", handleMessage);
              resolve({
                ok: false,
                error: "Bridge tren gianhap.id.vn chua phan hoi."
              });
            }, timeoutMs);

            function handleMessage(event) {
              if (event.source !== window) {
                return;
              }

              const data = event.data || {};
              if (data.type !== responseType || data.id !== id) {
                return;
              }

              clearTimeout(timeout);
              window.removeEventListener("message", handleMessage);
              resolve(data);
            }

            window.addEventListener("message", handleMessage);
            window.postMessage(
              {
                type: requestType,
                id,
                action,
                ...payload
              },
              window.location.origin
            );
          });
        }

        function wait(ms) {
          return new Promise((resolve) => setTimeout(resolve, ms));
        }

        async function waitForFrame() {
          return new Promise((resolve) => requestAnimationFrame(resolve));
        }

        async function waitUntil(predicate, timeoutMs = 3500, intervalMs = 80) {
          const startedAt = Date.now();
          while (Date.now() - startedAt < timeoutMs) {
            if (predicate()) {
              return true;
            }
            await wait(intervalMs);
          }
          return Boolean(predicate());
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
          const setter =
            Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set ||
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;

          if (setter) {
            setter.call(element, value);
          } else {
            element.value = value;
          }

          element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        }

        const text = String(payload.text || "").trim();
        if (!text) {
          return { ok: false, error: "Chua co noi dung chat de gui." };
        }

        const bridgeState = await requestPageBridge("getState", {}, 2500);
        if (!bridgeState?.ok) {
          return {
            ok: false,
            error: "Tab gianhap.id.vn chua co bridge moi. Hay deploy ban web moi roi refresh tab gianhap.id.vn.",
            diagnostics: bridgeState
          };
        }

        if (!bridgeState.supportsDetachedImport) {
          return {
            ok: false,
            error: "gianhap.id.vn dang chay bridge cu, chua ho tro nhan du lieu tu side panel. Hay deploy ban web moi roi refresh tab.",
            diagnostics: {
              bridgeVersion: bridgeState.bridgeVersion || 1,
              activeSupplierName: bridgeState.activeSupplierName || "",
              supplierCount: Array.isArray(bridgeState.suppliers) ? bridgeState.suppliers.length : 0
            }
          };
        }

        const bridgeResponse = await requestPageBridge("importChatDetached", payload, 5000);
        return bridgeResponse?.ok
          ? {
              ok: true,
              usedBridge: true,
              supplierId: bridgeResponse.supplierId || payload.supplierId || "",
              supplierName: bridgeResponse.supplierName || payload.supplierName || ""
            }
          : {
              ok: false,
              error: bridgeResponse?.error || "Bridge gianhap.id.vn khong nhan duoc du lieu.",
              diagnostics: bridgeResponse
            };

        const composer = document.querySelector(".chat-composer");
        if (!composer) {
          return { ok: false, error: "Khong tim thay khung chat tren gianhap.id.vn." };
        }

        const supplierKey = normalizeSearch(payload.supplierName || "");
        const supplierId = String(payload.supplierId || "");
        const chips = [...composer.querySelectorAll(".supplier-chip"), ...document.querySelectorAll(".supplier-chip")];
        const uniqueChips = [...new Set(chips)];
        const supplierChip =
          uniqueChips.find((chip) => chip.dataset?.supplierId === supplierId) ||
          uniqueChips.find((chip) => normalizeSearch(chip.textContent) === supplierKey) ||
          uniqueChips.find((chip) => supplierKey && normalizeSearch(chip.textContent).includes(supplierKey));

        if (supplierChip) {
          supplierChip.click();
          await waitForFrame();
          await wait(350);
        }

        const textarea = composer.querySelector("textarea");
        if (!textarea) {
          return { ok: false, error: "Khong tim thay o nhap chat tren gianhap.id.vn." };
        }

        textarea.focus();
        setNativeValue(textarea, text);
        await waitForFrame();
        await wait(250);

        if (textarea.value.trim() !== text) {
          setNativeValue(textarea, text);
          await wait(250);
        }

        const sendButton = composer.querySelector(".send-button");
        if (!sendButton) {
          return { ok: false, error: "Khong tim thay nut Gui tren gianhap.id.vn." };
        }

        await waitUntil(() => !sendButton.disabled, 3000, 80);
        if (sendButton.disabled && supplierChip) {
          supplierChip.click();
          await wait(350);
          setNativeValue(textarea, text);
          await waitUntil(() => !sendButton.disabled, 2500, 80);
        }

        if (sendButton.disabled) {
          return {
            ok: false,
            error: "Da dien du lieu nhung nut Gui cua gianhap.id.vn van bi khoa. Hay chon NCC trong web chinh roi thu lai."
          };
        }

        sendButton.click();
        return {
          ok: true,
          supplierId,
          supplierName: supplierChip?.textContent?.trim() || payload.supplierName || ""
        };
      }
    });

    const results = await Promise.race([
      executePromise,
      new Promise((resolve) => {
        setTimeout(() => {
          resolve([
            {
              result: {
                ok: false,
                error: "Qua 25 giay van chua thao tac xong tren gianhap.id.vn. Bam nut kiem tra ket noi de lay debug."
              }
            }
          ]);
        }, 25000);
      })
    ]);

    return results?.[0]?.result || {
      ok: false,
      error: "Khong nhan duoc ket qua tu tab gianhap.id.vn."
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Khong the thao tac tren tab gianhap.id.vn."
    };
  }
}

async function importToGianhap(payload) {
  const tab = await findGianhapTab();
  if (!tab?.id) {
    return {
      ok: false,
      error: "Hay mo tab gianhap.id.vn va dang nhap truoc."
    };
  }

  const response = await executeGianhapDomImport(tab, payload);

  if (response?.ok) {
    await chrome.tabs.update(tab.id, { active: true });
  }

  return response;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) {
    return false;
  }

  const handlers = {
    POPUP_GET_SELECTION: getActiveSelection,
    POPUP_GET_GIANHAP_STATE: getGianhapState,
    POPUP_IMPORT_TO_GIANHAP: () => importToGianhap(message),
    SIDE_PANEL_GET_GIANHAP_STATE: getGianhapState,
    SIDE_PANEL_DIAGNOSE_GIANHAP: diagnoseGianhap,
    SIDE_PANEL_IMPORT_TO_GIANHAP: () => importToGianhap(message),
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
