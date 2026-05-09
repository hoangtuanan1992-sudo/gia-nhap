import {
  AlertCircle,
  ArrowLeft,
  Bot,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Cpu,
  Database,
  Eye,
  ExternalLink,
  ImagePlus,
  KeyRound,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Trash2,
  Undo2,
  UserCog,
  UserPlus,
  Users,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const outputColumns = [
  {
    id: "productCode",
    label: "Mã sản phẩm",
    rule:
      "Lấy từ SKU, MODEL, mã, code hoặc ô đầu tiên của dòng bảng giá. Nếu ô đầu là tên đầy đủ không có mã rõ ràng thì để trống mã."
  },
  {
    id: "productName",
    label: "Tên sản phẩm",
    rule:
      "Nếu dòng chỉ có mã, ghép với tiêu đề nhóm đang đứng trước, ví dụ Điều hoà Panasonic N9AKH-8. Nếu vẫn thiếu và bật tra web, tìm theo mã sản phẩm trên Internet."
  },
  {
    id: "purchasePrice",
    label: "Giá NCC",
    rule: "Với bảng giá NCC, cột giá ngay sau mã/tên là giá nhà cung cấp. Giá 4,250 hiểu là 4.250.000 đ; giá 250 hiểu là 250.000 đ."
  },
  {
    id: "minPrice",
    label: "Giá min",
    rule:
      "Giá thấp nhất được phép bán hoặc giá thấp nhất sau khi so sánh cùng mã sản phẩm. Nếu dữ liệu đầu vào không có giá min thì để trống để bảng tự tính từ giá NCC thấp nhất khi có nhiều nhà cung cấp."
  },
  {
    id: "salePrice",
    label: "Giá bán",
    rule: "Chỉ điền khi dữ liệu ghi rõ giá bán. Bảng giá nhà cung cấp thông thường không có giá bán thì để trống."
  },
  {
    id: "webLink",
    label: "Link web",
    rule:
      "Ưu tiên link sản phẩm tra được theo mã; có thể lấy từ bất kỳ website phù hợp. Nếu không tra được thì ghi chưa có."
  },
  {
    id: "supplier",
    label: "Nhà cung cấp",
    rule:
      "Lấy theo nhà cung cấp đang được chọn trước khi gửi tin nhắn. Nếu dữ liệu ghi rõ nhà cung cấp khác thì ưu tiên dữ liệu đầu vào."
  },
  {
    id: "supplierStock",
    label: "Kho NCC",
    rule:
      "Nếu dữ liệu không ghi gì thì hiểu là còn nhiều. Nếu ghi 1c, 2c hoặc Có 1c thì hiểu là còn 1 sản phẩm, 2 sản phẩm."
  },
  {
    id: "notes",
    label: "Ghi chú",
    rule:
      "Ghi quà, XK -100K, xuất kích, hết VIP, còn kích hoạt, tháng kích, bảo hành, tặng kèm, combo hoặc điều kiện đặc biệt."
  }
];

const defaultColumnRules = Object.fromEntries(
  outputColumns.map((column) => [column.id, column.rule])
);

const settingsVersion = 6;
const defaultProductCatalogUrl =
  "https://checkgia.id.vn/san-pham-full?website_url=https://dienmaytienphong.com/&format=json";
const apiRetryDelays = [600, 1200, 2400];

const supplierNamesFromWorkbook = [
  "Tân Thủy",
  "Kho Tiên Phong",
  "Thành Phát T&T",
  "Thăng Long",
  "Green Air",
  "Văn quân",
  "Hà Trì",
  "Nhân Việt",
  "Điện tử 179",
  "Tuấn Ngoan",
  "Thịnh Phát (MR Thiệu)",
  "Đất Việt",
  "An Phát",
  "Trung xuân",
  "Thông Linh",
  "Tuyến Dũng",
  "Thiết bị số",
  "Việt Hải",
  "Gia Hân",
  "Hưng Thịnh",
  "Minh Long",
  "Denver",
  "Quốc Anh",
  "Hoàng Vinh",
  "Faster",
  "Latino",
  "Canzy",
  "Gia Dụng Nagakawa",
  "Lorca",
  "EUI",
  "Malloca",
  "MEEG",
  "Mi-Lux",
  "Giler",
  "Minh Anh Geyser",
  "Kitchentcare",
  "Dmestic",
  "Spelier",
  "KAFF",
  "Boneco",
  "Hợp Long",
  "Kluger",
  "Acnos",
  "Lux Audio",
  "SNK",
  "Kieler",
  "Vinadu",
  "Long Sunhouse",
  "An Tài Phát",
  "Hương Thủy",
  "Ánh Chinh",
  "Tân Hưng Phát",
  "Dalton",
  "Fujie",
  "Eurokit",
  "Tuấn Sơn",
  "Lân hương",
  "Thịnh phát (A Quý)",
  "Hòa Phát Minh Anh",
  "HMH",
  "Cường Phát",
  "G7",
  "Kosmen",
  "Cảnh Cadima",
  "Khương Bếp Đại Phong",
  "Anh Ngọc (Gree)",
  "AKT Home",
  "Quyết EU",
  "Nobinox - Thắng Latino",
  "Eurocook",
  "Việt Hàn (tivi)",
  "Việt Hàn (điện lạnh Samsung)",
  "Khang Việt",
  "Hoàn Kiếm",
  "Bếp Đức",
  "Nguyễn Hoàng Bosch",
  "Đại Quang Minh",
  "Chí Cường",
  "BPS (A Trung)",
  "Nam Đồng (Hòa Phát)",
  "Amare",
  "Trình Speedqueen",
  "Rapido (Hằng)",
  "GUME",
  "Luận Thơm - Trần Thơm",
  "Bếp Hùng Phát",
  "TTA",
  "Mutoshi",
  "Bá Bình",
  "CASV",
  "Steiger",
  "Phú Sunhouse"
];

function normalizeSupplierShape(supplier = {}, fallbackId = "") {
  return {
    id: supplier.id || fallbackId,
    name: supplier.name || "",
    updateMode: supplier.updateMode === "full" ? "full" : "partial",
    workflowRule: supplier.workflowRule || "",
    giftRule: supplier.giftRule || "",
    productMatchRules: compactProductMatchRules(supplier.productMatchRules || "")
  };
}

const supplierUpdateModes = [
  { id: "partial", label: "Cập nhật một phần" },
  { id: "full", label: "Cập nhật toàn bộ" }
];

const defaultSuppliers = supplierNamesFromWorkbook.map((name, index) =>
  normalizeSupplierShape(
    {
      id: `supplier-${index + 1}`,
      name
    },
    `supplier-${index + 1}`
  )
);

const defaultSettings = {
  settingsVersion,
  role: "Bạn là trợ lý nhập liệu sản phẩm cho đội mua hàng.",
  rules:
    "Dữ liệu thường là bảng giá nhà cung cấp điện máy. Bỏ qua tiêu đề nhóm, dòng trống, dòng ***; dùng tiêu đề nhóm làm ngữ cảnh ngành hàng/thương hiệu. Không tự bịa giá.",
  columnRules: defaultColumnRules,
  marginRules: "",
  referenceWebsites: "",
  productCatalogUrl: defaultProductCatalogUrl,
  productCatalogMatchMode: "manual",
  suppliers: defaultSuppliers,
  activeSupplierId: "",
  webSearchEnabled: true
};

const providerOptions = [
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Gemini" },
  { id: "grok", label: "Grok" }
];

const defaultModelOptionsByProvider = {
  openai: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"],
  grok: ["grok-4.20-reasoning", "grok-4", "grok-4-fast", "grok-code-fast-1"]
};

const defaultProvider = "openai";
const defaultChatPanelWidth = 46;
const minChatPanelWidth = 28;
const maxChatPanelWidth = 72;
const appShellWidthStorageKey = "app-shell-chat-width";
const tableColumnWidthStorageKey = "product-table-column-widths";
const chatMessagesStorageKey = "ai-product-chat-messages";
const lastSubmissionStorageKey = "ai-product-last-submission";
const authStorageKey = "ai-product-auth-session";
const activeShopContextStorageKey = "ai-product-active-shop-context";
const minTableColumnWidth = 110;
const maxTableColumnWidth = 520;
const defaultTableColumnWidths = {
  productCode: 140,
  productName: 220,
  purchasePrice: 140,
  minPrice: 140,
  salePrice: 140,
  webLink: 140,
  supplier: 180,
  supplierStock: 130,
  notes: 220,
  actions: 88
};

function normalizeSavedSettings(saved = {}) {
  const savedSuppliers = Array.isArray(saved.suppliers)
    ? saved.suppliers
        .map((supplier, index) =>
          normalizeSupplierShape(supplier, supplier?.id || `saved-supplier-${index + 1}`)
        )
        .filter((supplier) => supplier.id && supplier.name)
    : [];
  const suppliers = Array.isArray(saved.suppliers) ? savedSuppliers : [];
  const activeSupplierId = "";
  const savedColumnRules =
    saved && typeof saved.columnRules === "object" && !Array.isArray(saved.columnRules)
      ? saved.columnRules
      : {};

  return {
    ...defaultSettings,
    ...saved,
    settingsVersion,
    referenceWebsites: "",
    productCatalogUrl: saved.productCatalogUrl || defaultSettings.productCatalogUrl,
    productCatalogMatchMode: saved.productCatalogMatchMode === "ai" ? "ai" : "manual",
    suppliers,
    activeSupplierId,
    webSearchEnabled: saved.webSearchEnabled ?? defaultSettings.webSearchEnabled,
    marginRules: saved.marginRules || defaultSettings.marginRules,
    columnRules: {
      ...defaultColumnRules,
      ...savedColumnRules
    }
  };
}

function blankShopSettings() {
  return normalizeSavedSettings({
    settingsVersion,
    role: "",
    rules: "",
    columnRules: defaultColumnRules,
    marginRules: "",
    referenceWebsites: "",
    productCatalogUrl: "",
    productCatalogMatchMode: "manual",
    suppliers: [],
    activeSupplierId: "",
    webSearchEnabled: false
  });
}

function loadSavedSettings() {
  try {
    return normalizeSavedSettings(JSON.parse(localStorage.getItem("ai-product-settings") || "{}"));
  } catch {
    return defaultSettings;
  }
}

function defaultChatMessages() {
  return [
    {
      id: crypto.randomUUID(),
      role: "assistant",
      text: "Sẵn sàng chuẩn hóa dữ liệu sản phẩm."
    }
  ];
}

function loadSavedChatMessages() {
  if (typeof window === "undefined") {
    return defaultChatMessages();
  }

  try {
    const saved = JSON.parse(window.localStorage.getItem(chatMessagesStorageKey) || "[]");
    const messages = Array.isArray(saved)
      ? saved
          .map((message) => ({
            id: message.id || crypto.randomUUID(),
            role: message.role === "user" ? "user" : "assistant",
            text: String(message.text || ""),
            meta: String(message.meta || ""),
            supplier: String(message.supplier || "")
          }))
          .filter((message) => message.text || message.meta)
      : [];

    return messages.length ? messages : defaultChatMessages();
  } catch {
    return defaultChatMessages();
  }
}

function loadSavedLastSubmission() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const saved = JSON.parse(window.localStorage.getItem(lastSubmissionStorageKey) || "null");
    return saved?.batchId
      ? {
          batchId: String(saved.batchId),
          message: String(saved.message || "")
        }
      : null;
  } catch {
    return null;
  }
}

function normalizeProvider(value) {
  if (value === "gemini" || value === "grok") {
    return value;
  }

  return "openai";
}

function clampPanelWidth(value) {
  return Math.min(maxChatPanelWidth, Math.max(minChatPanelWidth, value));
}

function clampTableColumnWidth(value) {
  return Math.min(maxTableColumnWidth, Math.max(minTableColumnWidth, value));
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isApiRequest(url) {
  return String(url || "").startsWith("/api/");
}

function shouldRetryApiResponse(response, url) {
  if (!isApiRequest(url)) {
    return false;
  }

  const retryableStatusCodes = new Set([408, 425, 429, 500, 502, 503, 504]);
  if (retryableStatusCodes.has(response.status)) {
    return true;
  }

  const contentType = response.headers.get("content-type") || "";
  return !contentType.toLowerCase().includes("application/json");
}

async function fetchApiWithRetry(url, options = {}, extraHeaders = {}) {
  let lastError;

  for (let attempt = 0; attempt <= apiRetryDelays.length; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...(options.headers || {}),
          ...extraHeaders
        }
      });

      if (attempt < apiRetryDelays.length && shouldRetryApiResponse(response, url)) {
        await sleep(apiRetryDelays[attempt]);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= apiRetryDelays.length || !isApiRequest(url)) {
        throw error;
      }

      await sleep(apiRetryDelays[attempt]);
    }
  }

  throw lastError || new Error("Khong ket noi duoc server.");
}

async function parseResponsePayload(response) {
  const contentType = response.headers.get("content-type") || "";
  const rawText = await response.text();

  if (!rawText) {
    if (response.ok) {
      return {};
    }

    throw new Error(`Server khong tra ve noi dung. HTTP ${response.status}.`);
  }

  try {
    return JSON.parse(rawText);
  } catch {
    const compactText = rawText
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const preview = compactText.slice(0, 180);
    const detail = preview ? ` Noi dung nhan duoc: ${preview}` : "";
    const typeDetail = contentType ? ` (${contentType})` : "";

    throw new Error(`API khong tra ve JSON hop le. HTTP ${response.status}${typeDetail}.${detail}`);
  }
}

function humanizeApiError(message, provider = "openai") {
  const text = String(message || "").trim();
  const lower = text.toLowerCase();
  const isGrokCreditError =
    lower.includes("credits or licenses") ||
    lower.includes("doesn't have any credits") ||
    lower.includes("permissiondenied");

  if (isGrokCreditError) {
    return "Tai khoan Grok chua co credit/license. Vui long nap credit tai console.x.ai roi thu lai.";
  }

  if (provider === "grok") {
    if (
      isGrokCreditError ||
      lower.includes("403")
    ) {
      return "Tai khoan Grok chua co credit/license. Vui long nap credit tai console.x.ai roi thu lai.";
    }

    if (lower.includes("incorrect api key") || lower.includes("invalid api key") || lower.includes("401")) {
      return "xAI API key khong hop le hoac da het hieu luc.";
    }
  }

  if (lower.includes("api khong tra ve json") || lower.includes("server khong tra ve noi dung")) {
    return text;
  }

  return text || "Da co loi xay ra. Vui long thu lai.";
}

function canManageAccountsUi(account = {}) {
  return account?.role === "admin" || account?.role === "shop";
}

function accountRoleLabel(role) {
  if (role === "admin") {
    return "Admin";
  }

  if (role === "shop") {
    return "Shop";
  }

  return "Tài khoản con";
}

function loadSavedTableColumnWidths() {
  try {
    const saved = JSON.parse(localStorage.getItem(tableColumnWidthStorageKey) || "{}");
    return Object.fromEntries(
      Object.entries(defaultTableColumnWidths).map(([columnId, width]) => [
        columnId,
        clampTableColumnWidth(Number(saved?.[columnId]) || width)
      ])
    );
  } catch {
    return defaultTableColumnWidths;
  }
}

function makeSupplierId(name) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "supplier"}-${Date.now()}`;
}

function parsePriceValue(value) {
  const text = String(value || "").replace(/[^\d]/g, "");
  return text ? Number(text) : Number.POSITIVE_INFINITY;
}

function parseCurrencyToNumber(value, { assumeThousands = false } = {}) {
  const text = String(value || "").trim();
  if (!text) {
    return Number.NaN;
  }

  const compact = text.replace(/\s+/g, "");
  const numberMatch = compact.match(/(\d[\d.,]*)/);
  if (!numberMatch) {
    return Number.NaN;
  }

  let numericText = numberMatch[1].replace(/[.,]/g, "");
  if (!numericText) {
    return Number.NaN;
  }

  let numeric = Number(numericText);
  if (!Number.isFinite(numeric)) {
    return Number.NaN;
  }

  if (/k$/i.test(compact) || (assumeThousands && numeric > 0 && numeric < 100000)) {
    numeric *= 1000;
  }

  return numeric;
}

function formatCurrency(value) {
  return Number.isFinite(value) ? value.toLocaleString("vi-VN") : "";
}

function displayCurrency(value) {
  const numeric = parseCurrencyToNumber(value);
  return Number.isFinite(numeric) ? formatCurrency(numeric) : value || "";
}

function isValidWebLink(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function isLikelyLookupCode(value) {
  const text = String(value || "").trim();
  return /^(?=.*[0-9])(?=.*[A-Za-z])[A-Za-z0-9][A-Za-z0-9/_().+-]{2,}$/.test(text);
}

function rowNeedsLookup(row = {}) {
  const code = String(row.productCode || "").trim();
  if (!isLikelyLookupCode(code)) {
    return false;
  }

  const codeKey = normalizeProductCodeRule(code);
  const nameKey = normalizeProductCodeRule(row.productName);
  return !nameKey || nameKey === codeKey || !isValidWebLink(row.webLink);
}

function normalizeProductCodeRule(value) {
  return String(value || "")
    .trim()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function parseMarginRules(value) {
  const rules = new Map();
  const lines = String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match =
      line.match(/^\[([^\]]+)\]\s*(?:=|:|=>|->)\s*(.+)$/) ||
      line.match(/^([^\s\[\]=:>]+)\s*(?:=|:|=>|->)\s*(.+)$/) ||
      line.match(/^([^\s\[\]=:>]+)\s+(.+)$/);
    if (!match) {
      continue;
    }

    const code = normalizeProductCodeRule(match[1]);
    const marginValue = parseCurrencyToNumber(match[2], { assumeThousands: true });
    if (!code || !Number.isFinite(marginValue)) {
      continue;
    }

    rules.set(code, marginValue);
  }

  return rules;
}

function parseMarginRuleLabels(value) {
  const labels = new Map();
  const lines = String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match =
      line.match(/^\[([^\]]+)\]\s*(?:=|:|=>|->)\s*(.+)$/) ||
      line.match(/^([^\s\[\]=:>]+)\s*(?:=|:|=>|->)\s*(.+)$/) ||
      line.match(/^([^\s\[\]=:>]+)\s+(.+)$/);
    const rawCode = match?.[1] || "";
    const code = normalizeProductCodeRule(rawCode);
    if (code && rawCode.trim()) {
      labels.set(code, rawCode.trim());
    }
  }

  return labels;
}

function parseProductMatchRules(value = "") {
  const rules = new Map();
  const lines = String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match =
      line.match(/^\[?([^\]=:>]+?)\]?\s*(?:=|:|=>|->)\s*\[?([^\]]+?)\]?$/) ||
      line.match(/^([^\s=:\]]+)\s+(.+)$/);
    const sourceCode = normalizeProductCodeRule(match?.[1] || "");
    const targetCode = normalizeProductCodeRule(match?.[2] || "");
    if (sourceCode && targetCode) {
      rules.set(sourceCode, targetCode);
    }
  }

  return rules;
}

function productMatchRuleText(sourceCode, targetCode) {
  return `${String(sourceCode || "").trim()} = ${String(targetCode || "").trim()}`;
}

function compactProductMatchRules(value = "") {
  const lines = String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const bySource = new Map();

  for (const line of lines) {
    const parsed = parseProductMatchRules(line);
    for (const [sourceCode, targetCode] of parsed) {
      bySource.set(sourceCode, {
        sourceCode,
        targetCode,
        line
      });
    }
  }

  return [...bySource.values()].map((item) => item.line).join("\n");
}

function appendProductMatchRule(existing = "", sourceCode = "", targetCode = "") {
  const sourceKey = normalizeProductCodeRule(sourceCode);
  const targetKey = normalizeProductCodeRule(targetCode);
  if (!sourceKey || !targetKey) {
    return compactProductMatchRules(existing);
  }

  const nextRule = productMatchRuleText(sourceCode, targetCode);
  const lines = String(existing || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !parseProductMatchRules(line).has(sourceKey));

  return compactProductMatchRules([...lines, nextRule].join("\n"));
}

function giftCodesFromRule(value = "") {
  const codes = new Set();
  const lines = String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match =
      line.match(/^\[?([A-Za-z]{1,8}\d{1,5}[A-Za-z0-9]*)\]?\s*(?:=|:|=>|->)\s*(.+)$/) ||
      line.match(/^([A-Za-z]{1,8}\d{1,5}[A-Za-z0-9]*)\b/);
    if (match?.[1]) {
      codes.add(match[1].toUpperCase());
    }
  }

  return codes;
}

function giftCodesFromMessage(message = "") {
  const codes = [];
  const seen = new Set();
  const pricePattern = /(?:^|[\s:])(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(?=\s|$|[+-])/g;
  const codePattern = /(?:^|[\s,+-])([A-Za-z]{1,8}\d{1,5}[A-Za-z0-9]*)\b/g;

  for (const line of String(message || "").split(/\n+/)) {
    let lastPriceEnd = -1;
    for (const match of line.matchAll(pricePattern)) {
      lastPriceEnd = match.index + match[0].length;
    }

    if (lastPriceEnd < 0) {
      continue;
    }

    const tail = line.slice(lastPriceEnd);
    for (const match of tail.matchAll(codePattern)) {
      const code = match[1].toUpperCase();
      if (!seen.has(code)) {
        seen.add(code);
        codes.push(code);
      }
    }
  }

  return codes;
}

function findUnknownGiftCode(message, supplier, ignoredCodes = []) {
  const declaredCodes = giftCodesFromRule(supplier?.giftRule);
  const ignored = new Set(ignoredCodes.map((code) => String(code).toUpperCase()));

  return giftCodesFromMessage(message).find(
    (code) => !declaredCodes.has(code) && !ignored.has(code)
  );
}

function supplierWithGiftCode(supplier, code, value) {
  const nextRule = `${String(code || "").toUpperCase()} = ${String(value || "").trim()}`;
  return {
    ...supplier,
    giftRule: [supplier?.giftRule || "", nextRule].filter(Boolean).join("\n")
  };
}

function productKey(row) {
  return (row.productCode || row.productName || "").trim().toLowerCase();
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function rowMatchesTableSearch(row = {}, query = "") {
  if (!query) {
    return true;
  }

  return [
    row.productCode,
    row.productName,
    row.purchasePrice,
    row.minPrice,
    row.salePrice,
    row.webLink,
    row.supplier,
    row.supplierStock,
    row.notes
  ].some((value) => normalizeSearch(value).includes(query));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Khong doc duoc anh."));
    reader.readAsDataURL(file);
  });
}

function parseMarginRuleLine(line = "") {
  const match =
    line.match(/^\[([^\]]+)\]\s*(?:=|:|=>|->)\s*(.+)$/) ||
    line.match(/^([^\s\[\]=:>]+)\s*(?:=|:|=>|->)\s*(.+)$/) ||
    line.match(/^([^\s\[\]=:>]+)\s+(.+)$/);

  return {
    code: match?.[1] || "",
    value: match?.[2] || "",
    line
  };
}

function scoreMarginRuleSearch(line = "", query = "") {
  const search = query.trim();
  if (!search) {
    return 0;
  }

  const { code, value } = parseMarginRuleLine(line);
  const searchCode = normalizeProductCodeRule(search);
  const codeKey = normalizeProductCodeRule(code);
  const normalizedLine = normalizeSearch(line);
  const normalizedSearch = normalizeSearch(search);
  const searchDigits = search.replace(/\D/g, "");
  const valueDigits = value.replace(/\D/g, "");
  const codeDigits = code.replace(/\D/g, "");
  const looksLikeCode = /[a-zA-Z/-]/.test(search);
  const looksLikeMoney = searchDigits.length > 0 && !looksLikeCode;

  if (looksLikeMoney) {
    if (valueDigits === searchDigits) return 120;
    if (valueDigits.startsWith(searchDigits)) return 100;
    if (valueDigits.includes(searchDigits)) return 80;
    if (codeDigits === searchDigits) return 25;
    if (codeDigits.includes(searchDigits)) return 15;
    return 0;
  }

  if (searchCode && codeKey === searchCode) return 120;
  if (searchCode && codeKey.startsWith(searchCode)) return 105;
  if (searchCode && codeKey.includes(searchCode)) return 90;
  if (normalizedLine.includes(normalizedSearch)) return 45;

  return 0;
}

function findMarginRuleMatchRange(value = "", query = "") {
  const search = query.trim();
  if (!search) {
    return null;
  }

  let offset = 0;
  let bestMatch = null;

  for (const [lineIndex, line] of value.split(/\r?\n/).entries()) {
    const score = scoreMarginRuleSearch(line, search);
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = {
        start: offset,
        end: offset + line.length,
        lineIndex,
        score
      };
    }

    offset += line.length + 1;
  }

  return bestMatch;
}

function getMarginRuleSearchMatches(value = "", query = "") {
  const search = query.trim();
  if (!search) {
    return [];
  }

  let offset = 0;
  return value
    .split(/\r?\n/)
    .map((line, lineIndex) => {
      const score = scoreMarginRuleSearch(line, search);
      const match = {
        line,
        lineIndex,
        score,
        start: offset,
        end: offset + line.length
      };
      offset += line.length + 1;
      return match;
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.lineIndex - b.lineIndex);
}

function findHighlightRange(text = "", query = "") {
  const search = query.trim();
  if (!search) {
    return null;
  }

  const directIndex = text.toLowerCase().indexOf(search.toLowerCase());
  if (directIndex >= 0) {
    return {
      start: directIndex,
      end: directIndex + search.length
    };
  }

  const searchDigits = search.replace(/\D/g, "");
  if (!searchDigits) {
    return null;
  }

  let digits = "";
  const positions = [];
  for (let index = 0; index < text.length; index += 1) {
    if (/\d/.test(text[index])) {
      digits += text[index];
      positions.push(index);
    }
  }

  const digitIndex = digits.indexOf(searchDigits);
  if (digitIndex < 0) {
    return null;
  }

  return {
    start: positions[digitIndex],
    end: positions[digitIndex + searchDigits.length - 1] + 1
  };
}

function highlightMarginRuleText(text = "", query = "") {
  const range = findHighlightRange(text, query);
  if (!range) {
    return text;
  }

  return (
    <>
      {text.slice(0, range.start)}
      <mark>{text.slice(range.start, range.end)}</mark>
      {text.slice(range.end)}
    </>
  );
}

function cheapestRows(sourceRows) {
  const byProduct = new Map();

  for (const [index, row] of sourceRows.entries()) {
    const key = productKey(row) || `row-${row.rowId || row.batchId || index}`;

    const current = byProduct.get(key);
    if (!current || parsePriceValue(row.purchasePrice) < parsePriceValue(current.purchasePrice)) {
      byProduct.set(key, row);
    }
  }

  return [...byProduct.values()];
}

function App() {
  const [view, setView] = useState("chat");
  const [auth, setAuth] = useState(() => {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      const saved = JSON.parse(window.localStorage.getItem(authStorageKey) || "null");
      return saved?.token && saved?.account ? saved : null;
    } catch {
      return null;
    }
  });
  const [activeShopContext, setActiveShopContext] = useState(() => {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      const saved = JSON.parse(window.localStorage.getItem(activeShopContextStorageKey) || "null");
      return saved?.shopId ? saved : null;
    } catch {
      return null;
    }
  });
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginStatus, setLoginStatus] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [accountStatus, setAccountStatus] = useState("");
  const [accountDraft, setAccountDraft] = useState({
    id: "",
    username: "",
    displayName: "",
    password: "",
    role: "shop",
    active: true
  });
  const [viewedAccount, setViewedAccount] = useState(null);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [settings, setSettings] = useState(loadSavedSettings);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [sheetConfigDraft, setSheetConfigDraft] = useState({
    sheetId: "",
    sheetTab: "Products",
    serviceAccountEmail: "",
    privateKey: ""
  });
  const [selectedProvider, setSelectedProvider] = useState(defaultProvider);
  const [selectedModel, setSelectedModel] = useState(defaultModelOptionsByProvider[defaultProvider][0]);
  const [selectedColumn, setSelectedColumn] = useState(outputColumns[0].id);
  const [modelOptions, setModelOptions] = useState(defaultModelOptionsByProvider[defaultProvider]);
  const [settingsStatus, setSettingsStatus] = useState("");
  const [sheetSettingsStatus, setSheetSettingsStatus] = useState("");
  const [supplierDraft, setSupplierDraft] = useState({
    name: ""
  });
  const [supplierSearch, setSupplierSearch] = useState("");
  const [settingsSupplierSearch, setSettingsSupplierSearch] = useState("");
  const [marginRuleSearch, setMarginRuleSearch] = useState("");
  const [selectedMatchSupplierId, setSelectedMatchSupplierId] = useState("total");
  const [selectedSettingsSupplierId, setSelectedSettingsSupplierId] = useState("");
  const [draggedSettingsSupplierId, setDraggedSettingsSupplierId] = useState("");
  const [supplierDropTargetId, setSupplierDropTargetId] = useState("");
  const [lastSubmission, setLastSubmission] = useState(loadSavedLastSubmission);
  const [activeTableTab, setActiveTableTab] = useState("cheapest");
  const [tableSearch, setTableSearch] = useState("");
  const [tableSearchScope, setTableSearchScope] = useState("current");
  const [messages, setMessages] = useState(loadSavedChatMessages);
  /*
  const [messagesLegacy, setMessagesLegacy] = useState([
    {
      id: crypto.randomUUID(),
      role: "assistant",
      text: "Sẵn sàng chuẩn hóa dữ liệu sản phẩm."
    }
  ]);
  */
  const [input, setInput] = useState("");
  const [attachedImages, setAttachedImages] = useState([]);
  const [rows, setRows] = useState([]);
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState("Đang kết nối");
  const [isSending, setIsSending] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isScanningModels, setIsScanningModels] = useState(false);
  const [isClearingData, setIsClearingData] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [deletingRowId, setDeletingRowId] = useState("");
  const [showSupplierRequiredError, setShowSupplierRequiredError] = useState(false);
  const [pendingGiftCode, setPendingGiftCode] = useState("");
  const [giftValueDraft, setGiftValueDraft] = useState("");
  const [pendingSubmission, setPendingSubmission] = useState(null);
  const [pendingProductMatch, setPendingProductMatch] = useState(null);
  const [settingsSyncReady, setSettingsSyncReady] = useState(false);
  const [collapsedSettingsCards, setCollapsedSettingsCards] = useState({
    api: true,
    sheets: true,
    catalog: true,
    training: false
  });
  const [chatPanelWidth, setChatPanelWidth] = useState(() => {
    if (typeof window === "undefined") {
      return defaultChatPanelWidth;
    }

    const savedWidth = Number(window.localStorage.getItem(appShellWidthStorageKey));
    return Number.isFinite(savedWidth) ? clampPanelWidth(savedWidth) : defaultChatPanelWidth;
  });
  const [isResizingPanels, setIsResizingPanels] = useState(false);
  const [tableColumnWidths, setTableColumnWidths] = useState(() => {
    if (typeof window === "undefined") {
      return defaultTableColumnWidths;
    }

    return loadSavedTableColumnWidths();
  });
  const [resizingColumnId, setResizingColumnId] = useState("");
  const appShellRef = useRef(null);
  const tableWrapRef = useRef(null);
  const columnResizeRef = useRef({
    columnId: "",
    startX: 0,
    startWidth: 0
  });
  const messagesEndRef = useRef(null);
  const imageInputRef = useRef(null);
  const marginRulesTextareaRef = useRef(null);
  const settingsSyncTimerRef = useRef(null);
  const productRecalcTimerRef = useRef(null);
  const productRecalcSignatureRef = useRef("");

  const activeShopId = auth?.account?.role === "admin" ? activeShopContext?.shopId || "" : "";
  const authHeaders = auth?.token
    ? {
        Authorization: `Bearer ${auth.token}`,
        ...(activeShopId ? { "X-Shop-Id": activeShopId } : {})
      }
    : {};

  async function authFetch(url, options = {}) {
    return fetchApiWithRetry(url, options, authHeaders);
  }

  function persistAuth(nextAuth) {
    setAuth(nextAuth);
    if (typeof window === "undefined") {
      return;
    }

    if (nextAuth) {
      window.localStorage.setItem(authStorageKey, JSON.stringify(nextAuth));
    } else {
      window.localStorage.removeItem(authStorageKey);
      window.localStorage.removeItem(activeShopContextStorageKey);
      setActiveShopContext(null);
    }
  }

  function persistActiveShopContext(nextContext) {
    setActiveShopContext(nextContext);
    if (typeof window === "undefined") {
      return;
    }

    if (nextContext?.shopId) {
      window.localStorage.setItem(activeShopContextStorageKey, JSON.stringify(nextContext));
    } else {
      window.localStorage.removeItem(activeShopContextStorageKey);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoginStatus("");

    try {
      const response = await fetchApiWithRetry("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm)
      });
      const payload = await parseResponsePayload(response);
      persistAuth(payload);
      persistActiveShopContext(null);
      setLoginForm({ username: "", password: "" });
      setView("chat");
    } catch (error) {
      setLoginStatus(error.message || "Khong dang nhap duoc.");
    }
  }

  async function enterShopContext(account) {
    if (auth?.account?.role !== "admin" || account.role !== "shop") {
      setViewedAccount(account);
      return;
    }

    persistActiveShopContext({
      shopId: account.shopId || account.id,
      shopName: account.displayName || account.username
    });
    setViewedAccount(null);
    setRows([]);
    setSettings(blankShopSettings());
    setSettingsSyncReady(false);
    setStatus(`Dang vao shop ${account.displayName || account.username}...`);
    setView("chat");
  }

  async function handleLogout() {
    try {
      if (auth?.token) {
        await authFetch("/api/auth/logout", { method: "POST" });
      }
    } catch {
      // Dang xuat tren may nay van duoc thuc hien ke ca khi server khong phan hoi.
    }

    persistAuth(null);
    setView("chat");
  }

  async function loadAccounts() {
    if (!canManageAccountsUi(auth?.account)) {
      return;
    }

    setIsLoadingAccounts(true);
    setAccountStatus("");
    try {
      const response = await authFetch("/api/accounts");
      const payload = await parseResponsePayload(response);
      setAccounts(Array.isArray(payload.accounts) ? payload.accounts : []);
    } catch (error) {
      setAccountStatus(error.message || "Khong tai duoc danh sach tai khoan.");
    } finally {
      setIsLoadingAccounts(false);
    }
  }

  function resetAccountDraft() {
    const role = auth?.account?.role === "admin" ? "shop" : "user";
    setAccountDraft({
      id: "",
      username: "",
      displayName: "",
      password: "",
      role,
      active: true
    });
    setViewedAccount(null);
  }

  function editAccount(account) {
    setAccountDraft({
      id: account.id,
      username: account.username,
      displayName: account.displayName || account.username,
      password: "",
      role: account.role || "user",
      active: account.active !== false
    });
    setViewedAccount(null);
  }

  function formatAccountDate(value) {
    if (!value) {
      return "-";
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("vi-VN");
  }

  async function saveAccount(event) {
    event.preventDefault();
    setIsSavingAccount(true);
    setAccountStatus("");
    try {
      const isEdit = Boolean(accountDraft.id);
      const response = await authFetch(
        isEdit ? `/api/accounts/${encodeURIComponent(accountDraft.id)}` : "/api/accounts",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(accountDraft)
        }
      );
      await parseResponsePayload(response);
      setAccountStatus(isEdit ? "Da cap nhat tai khoan." : "Da them tai khoan.");
      resetAccountDraft();
      await loadAccounts();
    } catch (error) {
      setAccountStatus(error.message || "Khong luu duoc tai khoan.");
    } finally {
      setIsSavingAccount(false);
    }
  }

  async function deleteAccount(accountId) {
    setAccountStatus("");
    try {
      const response = await authFetch(`/api/accounts/${encodeURIComponent(accountId)}`, {
        method: "DELETE"
      });
      await parseResponsePayload(response);
      setAccountStatus("Da xoa tai khoan.");
      await loadAccounts();
    } catch (error) {
      setAccountStatus(error.message || "Khong xoa duoc tai khoan.");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function verifyAuth() {
      if (!auth?.token) {
        setIsCheckingAuth(false);
        return;
      }

      try {
        const response = await fetchApiWithRetry("/api/auth/me", {}, { Authorization: `Bearer ${auth.token}` });
        const payload = await parseResponsePayload(response);
        if (!cancelled) {
          persistAuth({ token: auth.token, account: payload.account });
          if (payload.account?.role !== "admin") {
            persistActiveShopContext(null);
          }
        }
      } catch {
        if (!cancelled) {
          persistAuth(null);
        }
      } finally {
        if (!cancelled) {
          setIsCheckingAuth(false);
        }
      }
    }

    verifyAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (view === "accounts" && canManageAccountsUi(auth?.account)) {
      loadAccounts();
    }
  }, [view, auth?.account?.role]);

  const selectedColumnMeta =
    outputColumns.find((column) => column.id === selectedColumn) || outputColumns[0];
  const isAccountManager = canManageAccountsUi(auth?.account);
  const accountManagerCopy =
    auth?.account?.role === "admin"
      ? {
          eyebrow: "Admin",
          title: "Quản lý shop",
          formTitle: accountDraft.id ? "Cập nhật shop" : "Shop mới",
          listTitle: "Shop hệ thống",
          namePlaceholder: "Tên shop",
          saveLabel: "Lưu shop",
          emptyLabel: "Chưa có shop."
        }
      : {
          eyebrow: "Shop",
          title: "Quản lý tài khoản con",
          formTitle: accountDraft.id ? "Cập nhật tài khoản con" : "Tài khoản con mới",
          listTitle: "Tài khoản con",
          namePlaceholder: "Tên nhân viên",
          saveLabel: "Lưu tài khoản",
          emptyLabel: "Chưa có tài khoản con."
        };
  const suppliers = Array.isArray(settings.suppliers) ? settings.suppliers : [];
  const activeSupplier = suppliers.find((supplier) => supplier.id === settings.activeSupplierId) || null;
  const supplierRequiredMessage = showSupplierRequiredError && !activeSupplier ? "Chua chon NCC" : "";
  const supplierSearchTerm = normalizeSearch(supplierSearch);
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearchTerm) {
      return suppliers;
    }

    return suppliers.filter((supplier) => normalizeSearch(supplier.name).includes(supplierSearchTerm));
  }, [supplierSearchTerm, suppliers]);
  const settingsSupplierSearchTerm = normalizeSearch(settingsSupplierSearch);
  const filteredSettingsSuppliers = useMemo(() => {
    if (!settingsSupplierSearchTerm) {
      return suppliers;
    }

    return suppliers.filter((supplier) => normalizeSearch(supplier.name).includes(settingsSupplierSearchTerm));
  }, [settingsSupplierSearchTerm, suppliers]);
  const selectedSettingsSupplier =
    suppliers.find((supplier) => supplier.id === selectedSettingsSupplierId) || suppliers[0];
  const selectedMatchSupplier =
    selectedMatchSupplierId === "total"
      ? null
      : suppliers.find((supplier) => supplier.id === selectedMatchSupplierId) || suppliers[0] || null;
  const selectedMatchRulesValue =
    selectedMatchSupplierId === "total"
      ? suppliers
          .map((supplier) =>
            supplier.productMatchRules
              ? `[${supplier.name}]\n${compactProductMatchRules(supplier.productMatchRules)}`
              : ""
          )
          .filter(Boolean)
          .join("\n\n")
      : compactProductMatchRules(selectedMatchSupplier?.productMatchRules || "");

  const sheetLabel = useMemo(() => {
    if (!config) {
      return "Đang kiểm tra";
    }

    return config.sheetsConfigured ? "Google Sheets" : "Bảng cục bộ";
  }, [config]);

  const supplierTabs = useMemo(() => {
    const names = rows.map((row) => row.supplier).filter(Boolean);
    return [...new Set([...suppliers.map((supplier) => supplier.name), ...names].filter(Boolean))];
  }, [rows, suppliers]);

  const tableSearchQuery = normalizeSearch(tableSearch);
  const baseTableRows = useMemo(() => {
    if (activeTableTab === "cheapest") {
      return cheapestRows(rows);
    }

    return rows.filter((row) => row.supplier === activeTableTab);
  }, [activeTableTab, rows]);
  const tableRows = useMemo(() => {
    if (!tableSearchQuery) {
      return baseTableRows;
    }

    const sourceRows = tableSearchScope === "all" ? rows : baseTableRows;
    return sourceRows.filter((row) => rowMatchesTableSearch(row, tableSearchQuery));
  }, [baseTableRows, rows, tableSearchQuery, tableSearchScope]);

  const minPriceByProduct = useMemo(() => {
    const next = new Map();

    for (const row of rows) {
      const key = productKey(row);
      const price = parsePriceValue(row.purchasePrice);
      if (!key || !Number.isFinite(price)) {
        continue;
      }

      const current = next.get(key);
      if (!current || price < current.value) {
        next.set(key, {
          value: price,
          label: formatCurrency(price)
        });
      }
    }

    return next;
  }, [rows]);

  const marginRulesByProduct = useMemo(
    () => parseMarginRules(settings.marginRules),
    [settings.marginRules]
  );
  const marginRuleLabelsByProduct = useMemo(
    () => parseMarginRuleLabels(settings.marginRules),
    [settings.marginRules]
  );
  const marginRuleSearchMatches = useMemo(
    () => getMarginRuleSearchMatches(settings.marginRules, marginRuleSearch),
    [settings.marginRules, marginRuleSearch]
  );
  const productMatchRulesBySupplier = useMemo(() => {
    const next = new Map();
    for (const supplier of suppliers) {
      next.set(supplier.name, parseProductMatchRules(supplier.productMatchRules));
    }
    return next;
  }, [suppliers]);
  const tableColumns = useMemo(
    () => [
      { id: "productCode", label: "Mã sản phẩm" },
      { id: "productName", label: "Tên sản phẩm" },
      { id: "purchasePrice", label: "Giá NCC" },
      { id: "minPrice", label: "Giá min" },
      { id: "salePrice", label: "Giá bán" },
      { id: "webLink", label: "Link web" },
      { id: "supplier", label: "Nhà cung cấp" },
      { id: "supplierStock", label: "Kho NCC" },
      { id: "notes", label: "Ghi chú" }
    ],
    []
  ).concat([{ id: "actions", label: "Xoa", locked: true }]);

  function resolveMinPrice(row) {
    const explicitMinPrice = parseCurrencyToNumber(row.minPrice);
    if (Number.isFinite(explicitMinPrice)) {
      return {
        value: explicitMinPrice,
        label: formatCurrency(explicitMinPrice)
      };
    }

    return minPriceByProduct.get(productKey(row)) || null;
  }

  function resolveMarginCode(row, supplierOverride = null) {
    const code = normalizeProductCodeRule(row.productCode);
    const supplierName = supplierOverride?.name || row.supplier;
    const supplierRules = productMatchRulesBySupplier.get(supplierName) || new Map();
    return supplierRules.get(code) || code;
  }

function resolveSalePrice(row) {
  const marginValue = marginRulesByProduct.get(resolveMarginCode(row));
  const minPrice = resolveMinPrice(row);

  if (Number.isFinite(marginValue) && Number.isFinite(minPrice?.value)) {
    return formatCurrency(minPrice.value + marginValue);
  }

    return "";
  }

  function findProductMatchCandidate(row, supplierOverride = null) {
    const code = normalizeProductCodeRule(row.productCode);
    if (!code || marginRulesByProduct.has(code)) {
      return null;
    }

    const mappedCode = resolveMarginCode(row, supplierOverride);
    if (mappedCode !== code && marginRulesByProduct.has(mappedCode)) {
      return null;
    }

    const candidateCode = [...marginRulesByProduct.keys()]
      .filter((marginCode) => marginCode !== code && code.length >= 4 && marginCode.length > code.length)
      .find((marginCode) => marginCode.includes(code));

    if (!candidateCode) {
      return null;
    }

    return {
      sourceCode: row.productCode,
      targetCode: marginRuleLabelsByProduct.get(candidateCode) || candidateCode,
      supplierName: supplierOverride?.name || row.supplier || ""
    };
  }

  function renderTableCell(row, columnId) {
    if (columnId === "actions") {
      return (
        <button
          className="icon-button danger table-row-delete"
          type="button"
          title="Xoa dong nay"
          aria-label="Xoa dong nay"
          disabled={!row.rowId || Boolean(deletingRowId)}
          onClick={() => deleteProductRow(row)}
        >
          <Trash2 size={16} />
        </button>
      );
    }

    if (columnId === "purchasePrice") {
      return displayCurrency(row.purchasePrice) || "-";
    }

    if (columnId === "minPrice") {
      return resolveMinPrice(row)?.label || "-";
    }

    if (columnId === "salePrice") {
      return resolveSalePrice(row) || "-";
    }

    if (columnId === "webLink") {
      return isValidWebLink(row.webLink) ? (
        <a href={row.webLink} target="_blank" rel="noreferrer">
          <ExternalLink size={15} />
          Link
        </a>
      ) : (
        "-"
      );
    }

    return row[columnId] || "-";
  }

  useEffect(() => {
    if (isCheckingAuth || !auth?.token) {
      return;
    }

    refreshAll();
  }, [isCheckingAuth, auth?.token, activeShopId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const recentMessages = messages.slice(-80);
    window.localStorage.setItem(chatMessagesStorageKey, JSON.stringify(recentMessages));
  }, [messages]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (lastSubmission?.batchId) {
      window.localStorage.setItem(lastSubmissionStorageKey, JSON.stringify(lastSubmission));
    } else {
      window.localStorage.removeItem(lastSubmissionStorageKey);
    }
  }, [lastSubmission]);

  useEffect(() => {
    localStorage.setItem("ai-product-settings", JSON.stringify(settings));

    if (!settingsSyncReady) {
      return undefined;
    }

    window.clearTimeout(settingsSyncTimerRef.current);
    settingsSyncTimerRef.current = window.setTimeout(() => {
      authFetch("/api/app-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings })
      }).catch(() => {});
    }, 350);

    return () => window.clearTimeout(settingsSyncTimerRef.current);
  }, [settings, settingsSyncReady]);

  useEffect(() => {
    if (!settingsSyncReady || config?.sheetsConfigured) {
      return undefined;
    }

    const signature = JSON.stringify({
      marginRules: settings.marginRules || "",
      productCatalogUrl: settings.productCatalogUrl || "",
      suppliers: (settings.suppliers || []).map((supplier) => ({
        id: supplier.id,
        name: supplier.name,
        updateMode: supplier.updateMode || "partial",
        workflowRule: supplier.workflowRule || "",
        giftRule: supplier.giftRule || "",
        productMatchRules: supplier.productMatchRules || ""
      }))
    });

    if (!productRecalcSignatureRef.current) {
      productRecalcSignatureRef.current = signature;
      return undefined;
    }

    if (productRecalcSignatureRef.current === signature) {
      return undefined;
    }

    productRecalcSignatureRef.current = signature;
    window.clearTimeout(productRecalcTimerRef.current);
    productRecalcTimerRef.current = window.setTimeout(async () => {
      try {
        const response = await authFetch("/api/products/recalculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings })
        });
        const payload = await parseResponsePayload(response);
        if (!response.ok) {
          throw new Error(payload.error || "Khong tinh lai duoc bang cuc bo.");
        }
        if (Array.isArray(payload.rows)) {
          setRows(payload.rows);
        }
        if (payload.warning) {
          setStatus(payload.warning);
        }
      } catch (error) {
        setStatus(error.message || "Khong tinh lai duoc bang cuc bo.");
      }
    }, 800);

    return () => window.clearTimeout(productRecalcTimerRef.current);
  }, [config?.sheetsConfigured, settings, settingsSyncReady]);

  useEffect(() => {
    if (!config) {
      return;
    }

    setSheetConfigDraft({
      sheetId: config.sheetId || "",
      sheetTab: config.sheetTab || "Products",
      serviceAccountEmail: config.sheetServiceAccountEmail || "",
      privateKey: config.sheetPrivateKey || ""
    });
  }, [config]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(appShellWidthStorageKey, String(chatPanelWidth));
  }, [chatPanelWidth]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(tableColumnWidthStorageKey, JSON.stringify(tableColumnWidths));
  }, [tableColumnWidths]);

  useEffect(() => {
    if (!suppliers.some((supplier) => supplier.id === selectedSettingsSupplierId) && suppliers[0]) {
      setSelectedSettingsSupplierId(suppliers[0].id);
    } else if (!suppliers.length && selectedSettingsSupplierId) {
      setSelectedSettingsSupplierId("");
    }
  }, [selectedSettingsSupplierId, suppliers]);

  useEffect(() => {
    if (!isResizingPanels) {
      return undefined;
    }

    const handleMouseMove = (event) => {
      if (!appShellRef.current) {
        return;
      }

      if (window.innerWidth <= 1100) {
        return;
      }

      const bounds = appShellRef.current.getBoundingClientRect();
      const nextWidth = ((event.clientX - bounds.left) / bounds.width) * 100;
      setChatPanelWidth(clampPanelWidth(nextWidth));
    };

    const handleMouseUp = () => {
      setIsResizingPanels(false);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingPanels]);

  useEffect(() => {
    if (!resizingColumnId) {
      return undefined;
    }

    const handleMouseMove = (event) => {
      const { columnId, startX, startWidth } = columnResizeRef.current;
      if (!columnId) {
        return;
      }

      const delta = event.clientX - startX;
      setTableColumnWidths((current) => ({
        ...current,
        [columnId]: clampTableColumnWidth(startWidth + delta)
      }));
    };

    const handleMouseUp = () => {
      setResizingColumnId("");
      columnResizeRef.current = {
        columnId: "",
        startX: 0,
        startWidth: 0
      };
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingColumnId]);

  async function refreshAll() {
    setIsRefreshing(true);
    try {
      const [configResponse, productResponse, appSettingsResponse] = await Promise.all([
        authFetch("/api/config"),
        authFetch("/api/products"),
        authFetch("/api/app-settings")
      ]);
      const nextConfig = await parseResponsePayload(configResponse);
      const productPayload = await parseResponsePayload(productResponse);
      const appSettingsPayload = await parseResponsePayload(appSettingsResponse);
      if (!configResponse.ok) {
        throw new Error(nextConfig.error || "Khong tai duoc cau hinh.");
      }
      if (!productResponse.ok) {
        throw new Error(productPayload.error || "Khong tai duoc du lieu bang.");
      }
      if (!appSettingsResponse.ok) {
        throw new Error(appSettingsPayload.error || "Khong tai duoc cai dat ung dung.");
      }
      const nextProvider = normalizeProvider(nextConfig.provider);
      const nextModel =
        nextConfig.model || (defaultModelOptionsByProvider[nextProvider] || [])[0] || "";
      const effectiveSettings = appSettingsPayload.settings
        ? normalizeSavedSettings(appSettingsPayload.settings)
        : auth?.account?.role === "admin" && !activeShopId
          ? settings
          : blankShopSettings();
      if (settings.activeSupplierId && effectiveSettings.suppliers?.some((supplier) => supplier.id === settings.activeSupplierId)) {
        effectiveSettings.activeSupplierId = settings.activeSupplierId;
      }
      let nextRows = productPayload.rows || [];

      if (appSettingsPayload.settings) {
        setSettings(effectiveSettings);
      }
      setSettingsSyncReady(true);
      setConfig(nextConfig);
      setSelectedProvider(nextProvider);
      setSelectedModel(nextModel);
      setModelOptions(mergeModelOptions(nextProvider, nextConfig.modelOptions || [], nextModel));
      setRows(nextRows);

      if (effectiveSettings.webSearchEnabled === true && nextRows.some(rowNeedsLookup)) {
        setStatus("Dang tra cuu ten/link san pham...");
        const enrichResponse = await authFetch("/api/products/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            settings: {
              ...effectiveSettings,
              provider: nextProvider,
              activeSupplier
            }
          })
        });
        const enrichPayload = await parseResponsePayload(enrichResponse);
        if (enrichResponse.ok && Array.isArray(enrichPayload.rows)) {
          nextRows = enrichPayload.rows;
          setRows(nextRows);
        }
      }

      setConfig(nextConfig);
      setSelectedProvider(nextProvider);
      setSelectedModel(nextModel);
      setModelOptions(mergeModelOptions(nextProvider, nextConfig.modelOptions || [], nextModel));
      setRows(nextRows);
      setStatus(productPayload.warning || "Đã đồng bộ");
    } catch (error) {
      if (String(error.message || "").toLowerCase().includes("chua dang nhap")) {
        persistAuth(null);
        return;
      }

      setStatus(humanizeApiError(error.message, selectedProvider));
    } finally {
      setIsRefreshing(false);
    }
  }

  function mergeModelOptions(provider, nextOptions, activeModel = "") {
    const normalizedProvider = normalizeProvider(provider);
    return [
      ...new Set(
        [activeModel, ...(defaultModelOptionsByProvider[normalizedProvider] || []), ...nextOptions].filter(Boolean)
      )
    ];
  }

  function isProviderConfigured(provider) {
    if (provider === "gemini") {
      return Boolean(config?.geminiConfigured);
    }

    if (provider === "grok") {
      return Boolean(config?.grokConfigured);
    }

    return Boolean(config?.openaiConfigured);
  }

  function providerKeyPlaceholder(provider) {
    if (provider === "gemini") {
      return isProviderConfigured(provider) ? "Da luu Gemini API key tren server" : "AIza...";
    }

    if (provider === "grok") {
      return isProviderConfigured(provider) ? "Da luu xAI API key tren server" : "xai-...";
    }

    return isProviderConfigured(provider) ? "Da luu OpenAI API key tren server" : "sk-...";
  }

  function handleProviderChange(provider) {
    const normalizedProvider = normalizeProvider(provider);
    const nextOptions = mergeModelOptions(
      normalizedProvider,
      normalizedProvider === config?.provider ? config?.modelOptions || [] : [],
      normalizedProvider === config?.provider ? config?.model || "" : ""
    );

    setSelectedProvider(normalizedProvider);
    setModelOptions(nextOptions);
    if (!nextOptions.includes(selectedModel) && nextOptions[0]) {
      setSelectedModel(nextOptions[0]);
    }
    setSettingsStatus("");
  }

  function startPanelResize(event) {
    if (window.innerWidth <= 1100) {
      return;
    }

    event.preventDefault();
    setIsResizingPanels(true);
  }

  function resetPanelWidth() {
    setChatPanelWidth(defaultChatPanelWidth);
  }

  function startTableColumnResize(event, columnId) {
    event.preventDefault();
    event.stopPropagation();
    columnResizeRef.current = {
      columnId,
      startX: event.clientX,
      startWidth: tableColumnWidths[columnId] || defaultTableColumnWidths[columnId] || minTableColumnWidth
    };
    setResizingColumnId(columnId);
  }

  function updateSetting(key, value) {
    setSettings((current) => ({
      ...current,
      [key]: value
    }));
  }

  function updateSheetConfig(key, value) {
    setSheetConfigDraft((current) => ({
      ...current,
      [key]: value
    }));
  }

  function updateColumnRule(columnId, value) {
    setSettings((current) => ({
      ...current,
      columnRules: {
        ...(current.columnRules || {}),
        [columnId]: value
      }
    }));
  }

  function updateActiveSupplier(supplierId) {
    setShowSupplierRequiredError(false);
    setSettings((current) => ({
      ...current,
      activeSupplierId: supplierId
    }));
  }

  function addSupplier() {
    const name = supplierDraft.name.trim();
    if (!name) {
      setSettingsStatus("Vui lòng nhập tên nhà cung cấp.");
      return;
    }

    const supplier = normalizeSupplierShape({
      id: makeSupplierId(name),
      name
    });

    setSettings((current) => ({
      ...current,
      suppliers: [...(current.suppliers || []), supplier],
      activeSupplierId: supplier.id
    }));
    setSelectedSettingsSupplierId(supplier.id);
    setSettingsSupplierSearch("");
    setSupplierDraft({ name: "" });
    setSettingsStatus("Đã thêm nhà cung cấp.");
  }

  function updateSupplier(supplierId, key, value) {
    setSettings((current) => ({
      ...current,
      suppliers: (current.suppliers || []).map((supplier) =>
        supplier.id === supplierId ? { ...supplier, [key]: value } : supplier
      )
    }));
  }

  function moveSupplier(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) {
      return;
    }

    setSettings((current) => {
      const sourceIndex = (current.suppliers || []).findIndex((supplier) => supplier.id === sourceId);
      const targetIndex = (current.suppliers || []).findIndex((supplier) => supplier.id === targetId);

      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return current;
      }

      const nextSuppliers = [...(current.suppliers || [])];
      const [movedSupplier] = nextSuppliers.splice(sourceIndex, 1);
      nextSuppliers.splice(targetIndex, 0, movedSupplier);

      return {
        ...current,
        suppliers: nextSuppliers
      };
    });
  }

  function handleSettingsSupplierDragStart(supplierId) {
    setDraggedSettingsSupplierId(supplierId);
    setSupplierDropTargetId(supplierId);
    setSelectedSettingsSupplierId(supplierId);
  }

  function handleSettingsSupplierDrop(targetSupplierId) {
    moveSupplier(draggedSettingsSupplierId, targetSupplierId);
    setDraggedSettingsSupplierId("");
    setSupplierDropTargetId("");
  }

  function deleteSupplier(supplierId) {
    setSettings((current) => {
      const nextSuppliers = (current.suppliers || []).filter((supplier) => supplier.id !== supplierId);
      const nextSelectedSupplierId = nextSuppliers[0]?.id || "";
      const nextActiveSupplierId =
        current.activeSupplierId === supplierId ||
        !nextSuppliers.some((supplier) => supplier.id === current.activeSupplierId)
          ? ""
          : current.activeSupplierId;

      setSelectedSettingsSupplierId((currentSelected) =>
        currentSelected === supplierId || !nextSuppliers.some((supplier) => supplier.id === currentSelected)
          ? nextSelectedSupplierId
          : currentSelected
      );

      return {
        ...current,
        suppliers: nextSuppliers,
        activeSupplierId: nextActiveSupplierId
      };
    });
  }

  function addMessage(role, text, meta = "", extra = {}) {
    const id = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      {
        id,
        role,
        text,
        meta,
        ...extra
      }
    ]);
    return id;
  }

  function updateMessage(messageId, patch = {}) {
    setMessages((current) =>
      current.map((message) => (message.id === messageId ? { ...message, ...patch } : message))
    );
  }

  async function addAttachedImages(files) {
    const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) {
      return;
    }

    const availableSlots = Math.max(0, 6 - attachedImages.length);
    if (!availableSlots) {
      setStatus("Tối đa 6 ảnh mỗi lần gửi.");
      return;
    }

    try {
      const nextImages = await Promise.all(
        imageFiles.slice(0, availableSlots).map(async (file) => ({
          id: crypto.randomUUID(),
          name: file.name,
          mimeType: file.type,
          size: file.size,
          dataUrl: await fileToDataUrl(file)
        }))
      );
      setAttachedImages((current) => [...current, ...nextImages]);
      setStatus(`Đã đính kèm ${nextImages.length} ảnh.`);
    } catch (error) {
      setStatus(error.message || "Không đọc được ảnh.");
    } finally {
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    }
  }

  function removeAttachedImage(imageId) {
    setAttachedImages((current) => current.filter((image) => image.id !== imageId));
  }

  function handleMarginRuleSearch(value) {
    setMarginRuleSearch(value);
    window.requestAnimationFrame(() => {
      focusMarginRuleMatch(value, { focus: false, silent: true });
    });
  }

  function focusMarginRuleMatch(value = marginRuleSearch, options = {}) {
    const matchRange = findMarginRuleMatchRange(settings.marginRules, value);
    if (!matchRange || !marginRulesTextareaRef.current) {
      if (value.trim() && !options.silent) {
        setSettingsStatus("Khong tim thay gia bien phu hop.");
      }
      return;
    }

    const textarea = marginRulesTextareaRef.current;
    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 20;
    textarea.scrollTop = Math.max(0, matchRange.lineIndex * lineHeight - textarea.clientHeight / 3);
    textarea.setSelectionRange(matchRange.start, matchRange.end);
    if (options.focus !== false) {
      textarea.focus();
    }

    if (settingsStatus === "Khong tim thay gia bien phu hop.") {
      setSettingsStatus("");
    }
  }

  function revealMarginRuleLine(match) {
    setMarginRuleSearch("");
    window.requestAnimationFrame(() => {
      const textarea = marginRulesTextareaRef.current;
      if (!textarea || !match) {
        return;
      }

      const computedStyle = window.getComputedStyle(textarea);
      const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 20;
      textarea.scrollTop = Math.max(0, match.lineIndex * lineHeight - textarea.clientHeight / 3);
      textarea.focus();
      textarea.setSelectionRange(match.start, match.end);
    });
  }

  function toggleSettingsCard(cardId) {
    setCollapsedSettingsCards((current) => ({
      ...current,
      [cardId]: !current[cardId]
    }));
  }

  function clearAllMessages() {
    setMessages(defaultChatMessages());
    setStatus("Đã xóa lịch sử chat.");
  }

  async function clearAllData() {
    const confirmMessage = "Xóa toàn bộ dữ liệu bảng, chat và Google Sheets của shop đang xem?";
    if (typeof window !== "undefined" && !window.confirm(confirmMessage)) {
      return;
    }

    setIsClearingData(true);
    try {
      const response = await authFetch("/api/products/clear", {
        method: "POST"
      });
      const payload = await parseResponsePayload(response);
      if (!response.ok) {
        throw new Error(payload.error || "Khong xoa duoc du lieu.");
      }

      setRows([]);
      setMessages(defaultChatMessages());
      setLastSubmission(null);
      setInput("");
      setAttachedImages([]);
      setTableSearch("");
      setActiveTableTab("cheapest");
      setPendingGiftCode("");
      setGiftValueDraft("");
      setPendingSubmission(null);
      setPendingProductMatch(null);
      setShowSupplierRequiredError(false);
      const sheetSummary = payload.sheetTabsCleared
        ? ` và dọn Google Sheets ở ${payload.sheetTabsCleared} tab`
        : "";
      setStatus(
        payload.warning ||
          `Đã xóa ${payload.removed || 0} dòng dữ liệu${sheetSummary}.`
      );
    } catch (error) {
      setStatus(error.message || "Khong xoa duoc du lieu.");
    } finally {
      setIsClearingData(false);
    }
  }

  async function submitPreparedMessage(message, effectiveSettings, supplier, images = []) {
    setInput("");
    setAttachedImages([]);
    setIsSending(true);
    addMessage("user", message || "Phân tích ảnh đính kèm", images.length ? `Đính kèm ${images.length} ảnh` : "", {
      supplier: supplier?.name || "Nha cung cap"
    });
    const processingMessageId = addMessage(
      "assistant",
      `Đang xử lý dữ liệu cho ${supplier?.name || "nhà cung cấp"}...`,
      "Bạn có thể gửi tiếp tin nhắn khác, hệ thống sẽ xử lý lần lượt."
    );

    try {
      const response = await authFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          images: images.map((image) => ({
            name: image.name,
            mimeType: image.mimeType,
            dataUrl: image.dataUrl
          })),
          settings: {
            ...effectiveSettings,
            provider: selectedProvider,
            activeSupplier: supplier
          }
        })
      });
      const payload = await parseResponsePayload(response);

      if (!response.ok) {
        throw new Error(payload.error || "Khong xu ly duoc tin nhan");
      }

      updateMessage(processingMessageId, {
        text: payload.reply,
        meta: payload.warning || ""
      });
      if (payload.batchId) {
        setLastSubmission({ batchId: payload.batchId, message });
      }
      if (Array.isArray(payload.rows) && payload.rows.length) {
        const payloadRows = payload.rows.map((row) => ({
          ...row,
          rowId: row.rowId || `pending-${crypto.randomUUID()}`
        }));
        if (payload.source && payload.source !== "not-saved") {
          setRows(payloadRows);
        } else {
          setRows((current) => [...current, ...payloadRows]);
        }
        const matchCandidate = payload.rows.map((row) => findProductMatchCandidate(row, supplier)).find(Boolean);
        if (matchCandidate) {
          setPendingProductMatch({
            ...matchCandidate,
            supplierId: supplier?.id || "",
            supplierName: supplier?.name || matchCandidate.supplierName || ""
          });
        }
      }
      setStatus(payload.warning || `Da them ${payload.rows?.length || 0} dong cho ${supplier?.name || "nha cung cap"}`);
    } catch (error) {
      updateMessage(processingMessageId, {
        text: error.message || "Có lỗi khi xử lý dữ liệu.",
        meta: ""
      });
      setStatus("Can kiem tra server");
    } finally {
      setIsSending(false);
    }
  }

  async function processSubmissionWithGiftCheck(message, effectiveSettings, supplier, ignoredCodes = [], images = []) {
    const unknownGiftCode = findUnknownGiftCode(message, supplier, ignoredCodes);
    if (unknownGiftCode) {
      setPendingGiftCode(unknownGiftCode);
      setGiftValueDraft("");
      setPendingSubmission({
        message,
        settings: effectiveSettings,
        supplier,
        ignoredCodes,
        images
      });
      return;
    }

    await submitPreparedMessage(message, effectiveSettings, supplier, images);
  }

  async function confirmGiftCode(event) {
    event.preventDefault();
    if (!pendingSubmission || !pendingGiftCode) {
      return;
    }

    const value = giftValueDraft.trim();
    if (!value) {
      setStatus("Nhap gia tri cho ma qua tang moi.");
      return;
    }

    const updatedSupplier = supplierWithGiftCode(pendingSubmission.supplier, pendingGiftCode, value);
    const baseSuppliers = pendingSubmission.settings.suppliers?.length
      ? pendingSubmission.settings.suppliers
      : suppliers;
    const updatedSettings = {
      ...pendingSubmission.settings,
      suppliers: baseSuppliers.map((supplier) =>
        supplier.id === updatedSupplier.id ? updatedSupplier : supplier
      ),
      activeSupplierId: updatedSupplier.id
    };
    const nextSubmission = pendingSubmission;

    setSettings(updatedSettings);
    setPendingGiftCode("");
    setGiftValueDraft("");
    setPendingSubmission(null);
    await processSubmissionWithGiftCheck(
      nextSubmission.message,
      updatedSettings,
      updatedSupplier,
      nextSubmission.ignoredCodes || [],
      nextSubmission.images || []
    );
  }

  async function skipGiftCode() {
    if (!pendingSubmission || !pendingGiftCode) {
      return;
    }

    const nextSubmission = pendingSubmission;
    const nextIgnoredCodes = [...(nextSubmission.ignoredCodes || []), pendingGiftCode];
    setPendingGiftCode("");
    setGiftValueDraft("");
    setPendingSubmission(null);
    await processSubmissionWithGiftCheck(
      nextSubmission.message,
      nextSubmission.settings,
      nextSubmission.supplier,
      nextIgnoredCodes,
      nextSubmission.images || []
    );
  }

  function updateProductMatchRules(targetSupplierId, value) {
    if (targetSupplierId === "total") {
      return;
    }

    updateSupplier(targetSupplierId, "productMatchRules", value);
  }

  function confirmProductMatch() {
    if (!pendingProductMatch) {
      return;
    }

    const supplierId = pendingProductMatch.supplierId || settings.activeSupplierId;
    const sourceCode = pendingProductMatch.sourceCode || "";
    const targetCode = pendingProductMatch.targetCode || "";

    if (supplierId) {
      setSettings((current) => ({
        ...current,
        suppliers: (current.suppliers || []).map((supplier) =>
          supplier.id === supplierId
            ? {
                ...supplier,
                productMatchRules: appendProductMatchRule(supplier.productMatchRules, sourceCode, targetCode)
              }
            : supplier
        )
      }));
      setSelectedMatchSupplierId(supplierId);
    } else {
      setSelectedMatchSupplierId("total");
    }

    setPendingProductMatch(null);
    setStatus("Da luu quy tac so khop ma san pham.");
  }

  function skipProductMatch() {
    setPendingProductMatch(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const message = input.trim();
    const images = attachedImages;
    if (!message && !images.length) {
      return;
    }

    if (!activeSupplier) {
      setShowSupplierRequiredError(true);
      setStatus("Chua chon NCC.");
      return;
    }

    setShowSupplierRequiredError(false);
    await processSubmissionWithGiftCheck(message, settings, activeSupplier, [], images);
    return;

    setInput("");
    setIsSending(true);
    addMessage("user", message, "", {
      supplier: activeSupplier?.name || "Nhà cung cấp"
    });

    try {
      const response = await authFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          settings: {
            ...settings,
            provider: selectedProvider,
            activeSupplier
          }
        })
      });
      const payload = await parseResponsePayload(response);

      if (!response.ok) {
        throw new Error(payload.error || "Không xử lý được tin nhắn");
      }

      addMessage("assistant", payload.reply, payload.warning || "");
      if (payload.batchId) {
        setLastSubmission({ batchId: payload.batchId, message });
      }
      setStatus(payload.warning || `Đã thêm ${payload.rows?.length || 0} dòng cho ${activeSupplier?.name || "nhà cung cấp"}`);
      await refreshAll();
    } catch (error) {
      addMessage("assistant", error.message || "Có lỗi khi xử lý dữ liệu.");
      setStatus("Cần kiểm tra server");
    } finally {
      setIsSending(false);
    }
  }

  async function undoLastSubmission() {
    if (!lastSubmission?.batchId || isUndoing) {
      return;
    }

    setIsUndoing(true);
    try {
      const response = await authFetch(`/api/products/batch/${encodeURIComponent(lastSubmission.batchId)}`, {
        method: "DELETE"
      });
      const payload = await parseResponsePayload(response);

      if (!response.ok) {
        throw new Error(payload.error || "Không hoàn tác được lần nhập gần nhất");
      }

      setInput(lastSubmission.message);
      setLastSubmission(null);
      addMessage(
        "assistant",
        `Đã quay lại bước trước và xóa ${payload.removed || 0} dòng vừa gán. Nội dung cũ đã được đưa lại vào ô nhập.`
      );
      setStatus(`Đã hoàn tác ${payload.removed || 0} dòng.`);
      await refreshAll();
    } catch (error) {
      addMessage("assistant", error.message || "Không hoàn tác được lần nhập gần nhất.");
      setStatus("Không hoàn tác được lần nhập gần nhất");
    } finally {
      setIsUndoing(false);
    }
  }

  async function deleteProductRow(row) {
    if (!row?.rowId || deletingRowId) {
      return;
    }

    const label = row.productCode || row.productName || "dong nay";
    const confirmed = window.confirm(`Xoa hang ${label}?`);
    if (!confirmed) {
      return;
    }

    setDeletingRowId(row.rowId);
    try {
      const response = await authFetch(`/api/products/row/${encodeURIComponent(row.rowId)}`, {
        method: "DELETE"
      });
      const payload = await parseResponsePayload(response);

      if (!response.ok) {
        throw new Error(payload.error || "Khong xoa duoc dong nay.");
      }

      setStatus(`Da xoa ${payload.removed || 0} dong.`);
      await refreshAll();
    } catch (error) {
      setStatus(error.message || "Khong xoa duoc dong nay.");
    } finally {
      setDeletingRowId("");
    }
  }

  async function scanModels() {
    setIsScanningModels(true);
    setSettingsStatus("");
    try {
        const response = await authFetch("/api/models/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: selectedProvider,
            apiKey: apiKeyDraft.trim()
          })
        });
      const payload = await parseResponsePayload(response);

      if (!response.ok) {
        throw new Error(payload.error || "Không quét được mô hình");
      }

      if (!Array.isArray(payload.modelOptions)) {
        throw new Error("Server chua tra danh sach mo hinh hop le.");
      }

      const nextOptions = mergeModelOptions(selectedProvider, payload.modelOptions || [], selectedModel);
      setModelOptions(nextOptions);
      if (!nextOptions.includes(selectedModel) && nextOptions[0]) {
        setSelectedModel(nextOptions[0]);
      }
      setSettingsStatus(`Đã quét được ${nextOptions.length} mô hình.`);
    } catch (error) {
      setSettingsStatus(humanizeApiError(error.message, selectedProvider));
    } finally {
      setIsScanningModels(false);
    }
  }

  async function saveSettings() {
    setIsSavingSettings(true);
    setSettingsStatus("");
    setSheetSettingsStatus("");
    try {
        const response = await authFetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: selectedProvider,
            apiKey: apiKeyDraft.trim(),
            model: selectedModel,
            sheetId: sheetConfigDraft.sheetId,
            sheetTab: sheetConfigDraft.sheetTab,
            sheetServiceAccountEmail: sheetConfigDraft.serviceAccountEmail,
            sheetPrivateKey: sheetConfigDraft.privateKey
          })
        });
      const payload = await parseResponsePayload(response);

      if (!response.ok) {
        throw new Error(payload.error || "Không lưu được cài đặt");
      }

      if (!payload.provider) {
        throw new Error("Server chua tra du lieu cau hinh sau khi luu.");
      }

      setApiKeyDraft("");
      setConfig((current) => ({
        ...(current || {}),
        provider: payload.provider,
        providerLabel: payload.providerLabel,
        providerConfigured: payload.providerConfigured,
        openaiConfigured: payload.openaiConfigured,
        geminiConfigured: payload.geminiConfigured,
        grokConfigured: payload.grokConfigured,
        sheetsConfigured: payload.sheetsConfigured,
        sheetId: payload.sheetId,
        sheetTab: payload.sheetTab,
        sheetUrl: payload.sheetUrl,
        sheetServiceAccountEmail: payload.sheetServiceAccountEmail,
        sheetPrivateKey: payload.sheetPrivateKey,
        model: payload.model,
        modelOptions: payload.modelOptions
      }));
      setSelectedProvider(normalizeProvider(payload.provider));
      setSelectedModel(payload.model || selectedModel);
      setModelOptions(
        mergeModelOptions(normalizeProvider(payload.provider), payload.modelOptions || [], payload.model || selectedModel)
      );
      setSettingsStatus("Đã lưu cài đặt.");
      setSheetSettingsStatus(payload.sheetsConfigured ? "Đã lưu và kiểm tra được Google Sheets." : "");
      if (payload.sheetsConfigured) {
        try {
          const recalcResponse = await authFetch("/api/products/recalculate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ settings })
          });
          const recalcPayload = await parseResponsePayload(recalcResponse);
          if (!recalcResponse.ok) {
            throw new Error(recalcPayload.error || "Khong cap nhat lai duoc Google Sheets.");
          }
          if (Array.isArray(recalcPayload.rows)) {
            setRows(recalcPayload.rows);
          }
          setStatus(recalcPayload.warning || "Da cap nhat lai Google Sheets.");
        } catch (recalcError) {
          setSheetSettingsStatus(
            `Da luu va kiem tra duoc Google Sheets, nhung chua cap nhat lai du lieu: ${humanizeApiError(
              recalcError.message,
              selectedProvider
            )}`
          );
        }
      }
    } catch (error) {
      const message = humanizeApiError(error.message, selectedProvider);
      setSettingsStatus(message);
      setSheetSettingsStatus(message);
    } finally {
      setIsSavingSettings(false);
    }
  }

  if (isCheckingAuth) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand-mark" aria-hidden="true">
            <Sparkles size={24} />
          </div>
          <p className="eyebrow">AI Product Sheet</p>
          <h1>Đang kiểm tra đăng nhập</h1>
        </section>
      </main>
    );
  }

  if (!auth?.account) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand-mark" aria-hidden="true">
            <Sparkles size={24} />
          </div>
          <p className="eyebrow">AI Product Sheet</p>
          <h1>Đăng nhập</h1>
          <form className="login-form" onSubmit={handleLogin}>
            <label className="field">
              <span>Tên đăng nhập</span>
              <input
                value={loginForm.username}
                onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
                autoComplete="username"
              />
            </label>
            <label className="field">
              <span>Mật khẩu</span>
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                autoComplete="current-password"
              />
            </label>
            {loginStatus ? <p className="form-status error">{loginStatus}</p> : null}
            <button className="primary-button full-width" type="submit">
              <KeyRound size={17} />
              <span>Đăng nhập</span>
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (view === "accounts" && isAccountManager) {
    return (
      <main className="settings-shell">
        <header className="settings-topbar">
          <button className="icon-button" type="button" title="Quay lại" onClick={() => setView("chat")}>
            <ArrowLeft size={20} />
          </button>
          <div className="brand-mark" aria-hidden="true">
            <Users size={24} />
          </div>
          <div>
            <p className="eyebrow">{accountManagerCopy.eyebrow}</p>
            <h1>{accountManagerCopy.title}</h1>
          </div>
          <div className="header-actions">
            <span className="account-pill">
              <UserCog size={16} />
              {auth.account.displayName || auth.account.username}
            </span>
            <button className="icon-button" type="button" title="Đăng xuất" onClick={handleLogout}>
              <LogOut size={19} />
            </button>
          </div>
        </header>

        <section className="account-layout">
          <article className="settings-card account-editor-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{accountDraft.id ? "Sửa" : "Thêm"}</p>
                <h2>{accountManagerCopy.formTitle}</h2>
              </div>
              <UserPlus size={22} />
            </div>
            <form className="account-form" onSubmit={saveAccount}>
              <label className="field">
                <span>Tên đăng nhập</span>
                <input
                  value={accountDraft.username}
                  onChange={(event) =>
                    setAccountDraft((current) => ({ ...current, username: event.target.value }))
                  }
                  placeholder="ten-tai-khoan"
                />
              </label>
              <label className="field">
                <span>Tên hiển thị</span>
                <input
                  value={accountDraft.displayName}
                  onChange={(event) =>
                    setAccountDraft((current) => ({ ...current, displayName: event.target.value }))
                  }
                  placeholder={accountManagerCopy.namePlaceholder}
                />
              </label>
              <label className="field">
                <span>{accountDraft.id ? "Mật khẩu mới" : "Mật khẩu"}</span>
                <input
                  type="password"
                  value={accountDraft.password}
                  onChange={(event) =>
                    setAccountDraft((current) => ({ ...current, password: event.target.value }))
                  }
                  placeholder={accountDraft.id ? "Để trống nếu không đổi" : "Ít nhất 6 ký tự"}
                />
              </label>
              <div className="account-form-grid">
                <div className="account-type-note">
                  <span>Loại tài khoản</span>
                  <strong>{accountRoleLabel(auth.account.role === "admin" ? "shop" : "user")}</strong>
                </div>
                <label className="toggle-field account-active-field">
                  <input
                    type="checkbox"
                    checked={accountDraft.active}
                    onChange={(event) =>
                      setAccountDraft((current) => ({ ...current, active: event.target.checked }))
                    }
                  />
                  <span>Đang hoạt động</span>
                </label>
              </div>
              <div className="settings-actions">
                <button className="secondary-button" type="button" onClick={resetAccountDraft}>
                  <X size={17} />
                  <span>Làm mới</span>
                </button>
                <button className="primary-button" type="submit" disabled={isSavingAccount}>
                  <Save size={17} />
                  <span>{isSavingAccount ? "Đang lưu" : accountManagerCopy.saveLabel}</span>
                </button>
              </div>
              {accountStatus ? <p className="form-status">{accountStatus}</p> : null}
            </form>
          </article>

          <article className="settings-card account-list-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Danh sách</p>
                <h2>{accountManagerCopy.listTitle}</h2>
              </div>
              <button className="icon-button" type="button" onClick={loadAccounts} disabled={isLoadingAccounts}>
                <RefreshCw size={18} />
              </button>
            </div>
            <div className="account-table-wrap">
              <table className="account-table">
                <thead>
                  <tr>
                    <th>Tài khoản</th>
                    <th>Loại</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id}>
                      <td>
                        <strong>{account.displayName || account.username}</strong>
                        <span>{account.username}</span>
                      </td>
                      <td>{accountRoleLabel(account.role)}</td>
                      <td>{account.active ? "Hoạt động" : "Đã khóa"}</td>
                      <td>
                        <button
                          className="icon-button"
                          type="button"
                          title={auth.account.role === "admin" && account.role === "shop" ? "Vào xem dữ liệu shop" : "Xem dữ liệu tài khoản"}
                          onClick={() => enterShopContext(account)}
                        >
                          <Eye size={16} />
                        </button>
                        <button className="icon-button" type="button" title="Sửa" onClick={() => editAccount(account)}>
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button danger"
                          type="button"
                          title="Xóa"
                          onClick={() => deleteAccount(account.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!accounts.length ? (
                    <tr>
                      <td colSpan={4}>{isLoadingAccounts ? "Đang tải..." : accountManagerCopy.emptyLabel}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {viewedAccount ? (
              <div className="account-detail-panel">
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">Chi tiết</p>
                    <h2>{viewedAccount.displayName || viewedAccount.username}</h2>
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    title="Đóng chi tiết"
                    onClick={() => setViewedAccount(null)}
                  >
                    <X size={17} />
                  </button>
                </div>
                <dl className="account-detail-grid">
                  <div>
                    <dt>Tên đăng nhập</dt>
                    <dd>{viewedAccount.username}</dd>
                  </div>
                  <div>
                    <dt>Tên hiển thị</dt>
                    <dd>{viewedAccount.displayName || "-"}</dd>
                  </div>
                  <div>
                    <dt>Loại tài khoản</dt>
                    <dd>{accountRoleLabel(viewedAccount.role)}</dd>
                  </div>
                  <div>
                    <dt>Trạng thái</dt>
                    <dd>{viewedAccount.active ? "Hoạt động" : "Đã khóa"}</dd>
                  </div>
                  <div>
                    <dt>Ngày tạo</dt>
                    <dd>{formatAccountDate(viewedAccount.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Cập nhật lần cuối</dt>
                    <dd>{formatAccountDate(viewedAccount.updatedAt)}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </article>
        </section>
      </main>
    );
  }

  if (view === "settings") {
    return (
      <main className="settings-shell">
        <header className="settings-topbar">
          <button
            className="icon-button"
            type="button"
            title="Quay lại"
            onClick={() => setView("chat")}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="brand-mark" aria-hidden="true">
            <Settings2 size={24} />
          </div>
          <div>
            <p className="eyebrow">Cài đặt</p>
            <h1>Cấu hình AI</h1>
          </div>
          <div className="header-actions">
            {activeShopContext?.shopId ? (
              <button
                className="account-pill context-pill"
                type="button"
                title="Thoat khoi shop dang xem"
                onClick={() => {
                  persistActiveShopContext(null);
                  setRows([]);
                  setSettingsSyncReady(false);
                }}
              >
                <UserCog size={16} />
                <span>Shop: {activeShopContext.shopName}</span>
                <X size={14} />
              </button>
            ) : null}
            {isAccountManager ? (
              <button
                className="icon-button"
                type="button"
                title={accountManagerCopy.title}
                onClick={() => setView("accounts")}
              >
                <Users size={20} />
              </button>
            ) : null}
            <button className="icon-button" type="button" title="Đăng xuất" onClick={handleLogout}>
              <LogOut size={19} />
            </button>
          </div>
        </header>

        <section className="settings-layout" aria-label="Trang cài đặt">
          <div className="settings-compact-column">
          <article className={`settings-card collapsible-card ${collapsedSettingsCards.api ? "collapsed" : ""}`}>
            <div className="section-heading">
              <div>
                  <p className="eyebrow">API</p>
                <h2>Kết nối API</h2>
              </div>
              <button
                className="icon-button collapse-card-button"
                type="button"
                title={collapsedSettingsCards.api ? "Mở phần API" : "Ẩn phần API"}
                onClick={() => toggleSettingsCard("api")}
              >
                {collapsedSettingsCards.api ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
              </button>
            </div>

            {!collapsedSettingsCards.api ? (
              <div className="settings-card-body">
            <label className="field">
              <span>Nhà cung cấp API</span>
              <select value={selectedProvider} onChange={(event) => handleProviderChange(event.target.value)}>
                {providerOptions.map((provider) => (
                  <option value={provider.id} key={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>
                {selectedProvider === "gemini"
                  ? "Gemini API key"
                  : selectedProvider === "grok"
                    ? "xAI API key"
                    : "OpenAI API key"}
              </span>
              <input
                type="password"
                value={apiKeyDraft}
                onChange={(event) => setApiKeyDraft(event.target.value)}
                placeholder={providerKeyPlaceholder(selectedProvider)}
                autoComplete="off"
              />
            </label>

            <div className="model-row">
              <label className="field">
                <span>Mô hình</span>
                <select
                  value={selectedModel}
                  onChange={(event) => setSelectedModel(event.target.value)}
                >
                  {modelOptions.map((model) => (
                    <option value={model} key={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="secondary-button"
                type="button"
                onClick={scanModels}
                disabled={isScanningModels}
              >
                <Search size={17} />
                <span>{isScanningModels ? "Đang quét" : "Quét model"}</span>
              </button>
            </div>

            <div className="settings-actions">
              <span className={`status-pill ${isProviderConfigured(selectedProvider) ? "ok" : "warn"}`}>
                {isProviderConfigured(selectedProvider) ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{isProviderConfigured(selectedProvider) ? "Đã kết nối" : "Chưa có key"}</span>
              </span>
              <button
                className="primary-button"
                type="button"
                onClick={saveSettings}
                disabled={isSavingSettings}
              >
                <Save size={17} />
                <span>{isSavingSettings ? "Đang lưu" : "Lưu cài đặt"}</span>
              </button>
            </div>

            {settingsStatus ? <p className="form-status">{settingsStatus}</p> : null}
              </div>
            ) : null}
          </article>

          <article className={`settings-card collapsible-card ${collapsedSettingsCards.sheets ? "collapsed" : ""}`}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Trang tính</p>
                <h2>Kết nối Google Sheets</h2>
              </div>
              <button
                className="icon-button collapse-card-button"
                type="button"
                title={collapsedSettingsCards.sheets ? "Mở phần Google Sheets" : "Ẩn phần Google Sheets"}
                onClick={() => toggleSettingsCard("sheets")}
              >
                {collapsedSettingsCards.sheets ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
              </button>
            </div>

            {!collapsedSettingsCards.sheets ? (
              <div className="settings-card-body">
            <label className="field">
              <span>Sheet ID</span>
              <input
                value={sheetConfigDraft.sheetId}
                onChange={(event) => updateSheetConfig("sheetId", event.target.value)}
                placeholder="1AbCDefGhijkLmNoP..."
                autoComplete="off"
              />
            </label>

            <label className="field">
              <span>Tên tab</span>
              <input
                value={sheetConfigDraft.sheetTab}
                onChange={(event) => updateSheetConfig("sheetTab", event.target.value)}
                placeholder="Products"
                autoComplete="off"
              />
            </label>

            <label className="field">
              <span>Email service account</span>
              <input
                value={sheetConfigDraft.serviceAccountEmail}
                onChange={(event) => updateSheetConfig("serviceAccountEmail", event.target.value)}
                placeholder="service-account@project.iam.gserviceaccount.com"
                autoComplete="off"
              />
            </label>

            <label className="field">
              <span>Private key</span>
              <textarea
                value={sheetConfigDraft.privateKey}
                onChange={(event) => updateSheetConfig("privateKey", event.target.value)}
                rows={6}
                placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
              />
            </label>

            <div className="settings-actions">
              <span className={`status-pill ${config?.sheetsConfigured ? "ok" : "warn"}`}>
                {config?.sheetsConfigured ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{config?.sheetsConfigured ? "Đã sẵn sàng ghi vào sheet" : "Chưa kết nối sheet"}</span>
              </span>

              <div className="sheet-config-actions">
                {config?.sheetUrl ? (
                  <a className="secondary-button sheet-link-button" href={config.sheetUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={17} />
                    <span>Mở sheet</span>
                  </a>
                ) : null}
                <button
                  className="primary-button"
                  type="button"
                  onClick={saveSettings}
                  disabled={isSavingSettings}
                >
                  <Save size={17} />
                  <span>{isSavingSettings ? "Đang lưu" : "Lưu kết nối"}</span>
                </button>
              </div>
            </div>

            {sheetSettingsStatus ? <p className="form-status">{sheetSettingsStatus}</p> : null}
            <p className="field-hint sheet-config-hint">
              Chia sẻ file Google Sheets cho email service account với quyền Editor, rồi lưu lại. Khi cấu hình đủ,
              bảng bên phải sẽ đồng bộ trực tiếp với sheet này.
            </p>
              </div>
            ) : null}
          </article>

          <article className={`settings-card collapsible-card ${collapsedSettingsCards.catalog ? "collapsed" : ""}`}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">{"Link web"}</p>
                <h2>{"Ngu\u1ed3n link s\u1ea3n ph\u1ea9m"}</h2>
              </div>
              <button
                className="icon-button collapse-card-button"
                type="button"
                title={collapsedSettingsCards.catalog ? "M\u1edf ph\u1ea7n link web" : "\u1ea8n ph\u1ea7n link web"}
                onClick={() => toggleSettingsCard("catalog")}
              >
                {collapsedSettingsCards.catalog ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
              </button>
            </div>

            {!collapsedSettingsCards.catalog ? (
              <div className="settings-card-body">
            <label className="field">
              <span>{"Ch\u1ebf \u0111\u1ed9 so kh\u1edbp"}</span>
              <div className="catalog-match-options" role="radiogroup" aria-label="Ch\u1ebf \u0111\u1ed9 so kh\u1edbp link web">
                <label className={`catalog-match-option ${settings.productCatalogMatchMode !== "ai" ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="productCatalogMatchMode"
                    value="manual"
                    checked={settings.productCatalogMatchMode !== "ai"}
                    onChange={() => updateSetting("productCatalogMatchMode", "manual")}
                  />
                  <span>{"D\u00f9ng th\u1ee7 c\u00f4ng"}</span>
                </label>
                <label className={`catalog-match-option ${settings.productCatalogMatchMode === "ai" ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="productCatalogMatchMode"
                    value="ai"
                    checked={settings.productCatalogMatchMode === "ai"}
                    onChange={() => updateSetting("productCatalogMatchMode", "ai")}
                  />
                  <span>{"D\u00f9ng AI \u0111\u1ec3 so kh\u1edbp"}</span>
                </label>
              </div>
            </label>

            <label className="field">
              <span>{"Link JSON danh s\u00e1ch s\u1ea3n ph\u1ea9m"}</span>
              <textarea
                value={settings.productCatalogUrl || ""}
                onChange={(event) => updateSetting("productCatalogUrl", event.target.value)}
                rows={3}
                placeholder={config?.defaultProductCatalogUrl || defaultProductCatalogUrl}
              />
              <small className="field-hint">
                {
                  "H\u1ec7 th\u1ed1ng s\u1ebd so kh\u1edbp m\u00e3 s\u1ea3n ph\u1ea9m v\u1edbi JSON n\u00e0y \u0111\u1ec3 l\u1ea5y url. Kh\u00f4ng t\u00ecm th\u1ea5y th\u00ec Link web \u0111\u1ec3 tr\u1ed1ng."
                }
              </small>
            </label>
              </div>
            ) : null}
          </article>

          <article className={`settings-card collapsible-card ${collapsedSettingsCards.training ? "collapsed" : ""}`}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Huấn luyện</p>
                <h2>Vai trò và quy tắc</h2>
              </div>
              <button
                className="icon-button collapse-card-button"
                type="button"
                title={collapsedSettingsCards.training ? "Mở phần huấn luyện" : "Ẩn phần huấn luyện"}
                onClick={() => toggleSettingsCard("training")}
              >
                {collapsedSettingsCards.training ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
              </button>
            </div>

            {!collapsedSettingsCards.training ? (
              <div className="settings-card-body">
            <label className="field">
              <span>Vai trò</span>
              <input
                value={settings.role}
                onChange={(event) => updateSetting("role", event.target.value)}
              />
            </label>

            <label className="field">
              <span>Quy tắc chuẩn hóa</span>
              <textarea
                value={settings.rules}
                onChange={(event) => updateSetting("rules", event.target.value)}
                rows={7}
              />
            </label>
              </div>
            ) : null}
          </article>

          </div>

          <article className="settings-card margin-settings-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{"Gi\u00e1 bi\u00ean"}</p>
                <h2>{"L\u00e3i theo m\u00e3 s\u1ea3n ph\u1ea9m"}</h2>
              </div>
              <Cpu size={22} />
            </div>

            <label className="field margin-rules-field">
              <span className="margin-search-field">
                <Search size={15} />
                <input
                  value={marginRuleSearch}
                  onChange={(event) => handleMarginRuleSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      focusMarginRuleMatch();
                    }
                  }}
                  placeholder={"T\u00ecm m\u00e3 ho\u1eb7c s\u1ed1 ti\u1ec1n..."}
                  type="search"
                />
              </span>
              {marginRuleSearch.trim() ? (
                <div className="margin-search-results" role="list">
                  {marginRuleSearchMatches.length ? (
                    marginRuleSearchMatches.map((match) => (
                      <button
                        className="margin-search-result"
                        type="button"
                        onClick={() => revealMarginRuleLine(match)}
                        role="listitem"
                        key={`${match.lineIndex}-${match.line}`}
                      >
                        {highlightMarginRuleText(match.line, marginRuleSearch)}
                      </button>
                    ))
                  ) : (
                    <div className="margin-search-empty">Không tìm thấy mã hoặc số tiền phù hợp.</div>
                  )}
                </div>
              ) : (
                <textarea
                  ref={marginRulesTextareaRef}
                  value={settings.marginRules}
                  onChange={(event) => updateSetting("marginRules", event.target.value)}
                  rows={12}
                  placeholder={"[N9AKH-8] = 500.000\u0111\n[50UA7350PSB] = 300k\n[FR91DSU] = 250"}
                />
              )}
              <small className="field-hint">
                {"Nh\u1eadp theo c\u00fa ph\u00e1p "}
                <code>{"[m\u00e3 s\u1ea3n ph\u1ea9m] = gi\u00e1 bi\u00ean"}</code>
                {". Gi\u00e1 b\u00e1n s\u1ebd t\u1ef1 t\u00ednh b\u1eb1ng Gi\u00e1 min + Gi\u00e1 bi\u00ean. \u00d4 t\u00ecm ki\u1ebfm s\u1ebd t\u1ef1 cu\u1ed9n t\u1edbi d\u00f2ng ph\u00f9 h\u1ee3p khi b\u1ea1n g\u00f5."}
              </small>
            </label>
          </article>

          <article className="settings-card wide">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Nguồn hàng</p>
                <h2>Quản lý nhà cung cấp</h2>
              </div>
              <Pencil size={22} />
            </div>

            <div className="supplier-manager">
              <div className="supplier-manager-toolbar">
                <label className="supplier-search settings-supplier-search">
                  <Search size={15} />
                  <input
                    value={settingsSupplierSearch}
                    onChange={(event) => setSettingsSupplierSearch(event.target.value)}
                    placeholder="Tìm NCC để sửa..."
                    type="search"
                  />
                </label>

                <div className="supplier-add-inline">
                  <input
                    value={supplierDraft.name}
                    onChange={(event) => setSupplierDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Thêm nhà cung cấp mới"
                  />
                  <button className="secondary-button" type="button" onClick={addSupplier}>
                    <Plus size={17} />
                    <span>Thêm</span>
                  </button>
                </div>
              </div>

              <div className="supplier-manager-strip">
                {filteredSettingsSuppliers.length ? (
                  filteredSettingsSuppliers.map((supplier) => (
                    <button
                      className={`supplier-chip settings-supplier-chip ${
                        selectedSettingsSupplier?.id === supplier.id ? "active" : ""
                      } ${draggedSettingsSupplierId === supplier.id ? "dragging" : ""} ${
                        supplierDropTargetId === supplier.id ? "drop-target" : ""
                      }`}
                      type="button"
                      draggable
                      onClick={() => setSelectedSettingsSupplierId(supplier.id)}
                      onDragStart={() => handleSettingsSupplierDragStart(supplier.id)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (supplierDropTargetId !== supplier.id) {
                          setSupplierDropTargetId(supplier.id);
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        handleSettingsSupplierDrop(supplier.id);
                      }}
                      onDragEnd={() => {
                        setDraggedSettingsSupplierId("");
                        setSupplierDropTargetId("");
                      }}
                      title="Kéo để đổi vị trí NCC"
                      key={supplier.id}
                    >
                      {supplier.name}
                    </button>
                  ))
                ) : (
                  <span className="supplier-empty">Không có NCC phù hợp</span>
                )}
              </div>

              {selectedSettingsSupplier ? (
                <div className="supplier-detail-panel">
                  <div className="supplier-detail-top">
                    <div>
                      <p className="eyebrow">Chi tiết NCC</p>
                      <h3>{selectedSettingsSupplier.name || "Nhà cung cấp"}</h3>
                    </div>
                    <button
                      className="icon-button danger"
                      type="button"
                      title="Xóa nhà cung cấp"
                      onClick={() => deleteSupplier(selectedSettingsSupplier.id)}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  <div className="supplier-detail-grid">
                    <label className="field">
                      <span>Tên nhà cung cấp</span>
                      <input
                        value={selectedSettingsSupplier.name}
                        onChange={(event) =>
                          updateSupplier(selectedSettingsSupplier.id, "name", event.target.value)
                        }
                      />
                    </label>

                    <label className="field">
                      <span>Kiểu cập nhật dữ liệu</span>
                      <div className="supplier-update-mode" role="radiogroup" aria-label="Kiểu cập nhật dữ liệu">
                        {supplierUpdateModes.map((mode) => (
                          <button
                            className={`supplier-update-mode-button ${
                              (selectedSettingsSupplier.updateMode || "partial") === mode.id ? "active" : ""
                            }`}
                            type="button"
                            role="radio"
                            aria-checked={(selectedSettingsSupplier.updateMode || "partial") === mode.id}
                            onClick={() => updateSupplier(selectedSettingsSupplier.id, "updateMode", mode.id)}
                            key={mode.id}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>
                    </label>

                    <label className="field">
                      <span>Quy trình NCC</span>
                      <textarea
                        value={selectedSettingsSupplier.workflowRule || ""}
                        onChange={(event) =>
                          updateSupplier(selectedSettingsSupplier.id, "workflowRule", event.target.value)
                        }
                        rows={5}
                        placeholder="Quy ước đọc tin nhắn, đọc cột giá, đọc tồn kho, nhận diện mã hàng riêng của NCC này."
                      />
                    </label>

                    <label className="field">
                      <span>Quà tặng</span>
                      <textarea
                        value={selectedSettingsSupplier.giftRule || ""}
                        onChange={(event) =>
                          updateSupplier(selectedSettingsSupplier.id, "giftRule", event.target.value)
                        }
                        rows={4}
                        placeholder="Giải nghĩa quà, XK, xuất kích, ưu đãi, điều kiện mua, cách hiểu ghi chú riêng của NCC này."
                      />
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
          </article>

          <article className="settings-card wide output-settings-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Đầu ra</p>
                <h2>Quy tắc từng cột</h2>
              </div>
              <Cpu size={22} />
            </div>

            <div className="schema-grid">
              {outputColumns.map((column) => (
                <button
                  className={`schema-chip ${selectedColumn === column.id ? "active" : ""}`}
                  type="button"
                  onClick={() => setSelectedColumn(column.id)}
                  key={column.id}
                >
                  {column.label}
                </button>
              ))}
            </div>

            <div className="column-rule-panel">
              <label className="field">
                <span>Quy tắc cho {selectedColumnMeta.label}</span>
                <textarea
                  value={settings.columnRules?.[selectedColumnMeta.id] || ""}
                  onChange={(event) => updateColumnRule(selectedColumnMeta.id, event.target.value)}
                  rows={5}
                  placeholder={selectedColumnMeta.rule}
                />
              </label>

              <div className="output-tools">
                <label className="toggle-field compact-toggle">
                  <input
                    type="checkbox"
                    checked={settings.webSearchEnabled}
                    onChange={(event) => updateSetting("webSearchEnabled", event.target.checked)}
                  />
                  <span>{"Cho AI tra web khi thi\u1ebfu d\u1eef li\u1ec7u"}</span>
                </label>
              </div>
            </div>
          </article>

          <article className="settings-card wide product-match-settings-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{"So kh\u1edbp m\u00e3"}</p>
                <h2>{"M\u00e3 s\u1ea3n ph\u1ea9m so kh\u1edbp t\u00f9y ch\u1ec9nh"}</h2>
              </div>
              <Cpu size={22} />
            </div>

            <div className="supplier-manager-strip match-rule-tabs">
              <button
                className={`supplier-chip settings-supplier-chip ${selectedMatchSupplierId === "total" ? "active" : ""}`}
                type="button"
                onClick={() => setSelectedMatchSupplierId("total")}
              >
                Tổng
              </button>
              {suppliers.map((supplier) => (
                <button
                  className={`supplier-chip settings-supplier-chip ${
                    selectedMatchSupplierId === supplier.id ? "active" : ""
                  }`}
                  type="button"
                  onClick={() => setSelectedMatchSupplierId(supplier.id)}
                  key={supplier.id}
                >
                  {supplier.name}
                </button>
              ))}
            </div>

            <label className="field">
              <span>
                {selectedMatchSupplierId === "total"
                  ? "Tất cả quy tắc so khớp"
                  : `Quy tắc so khớp cho ${selectedMatchSupplier?.name || "NCC"}`}
              </span>
              <textarea
                value={selectedMatchRulesValue}
                onChange={(event) => updateProductMatchRules(selectedMatchSupplierId, event.target.value)}
                rows={7}
                readOnly={selectedMatchSupplierId === "total"}
                placeholder={"13CSD/TPHI = TBI-13CSD/TPHI\n09CSD/XAB1 = TCL-09CSD/XAB1"}
              />
              <small className="field-hint">
                {selectedMatchSupplierId === "total" ? (
                  "Tổng chỉ hiển thị toàn bộ quy tắc đã khai báo trong các nhà cung cấp."
                ) : (
                  <>
                    {"Nh\u1eadp theo c\u00fa ph\u00e1p "}
                    <code>{"m\u00e3 trong tin nh\u1eafn = m\u00e3 trong Gi\u00e1 bi\u00ean"}</code>
                    {"."}
                  </>
                )}
              </small>
            </label>

            <div className="settings-actions data-reset-actions">
              <button
                className="secondary-button danger-button"
                type="button"
                onClick={clearAllData}
                disabled={isClearingData}
                title="Xóa toàn bộ dữ liệu bảng, chat và Google Sheets"
              >
                <Trash2 size={17} />
                <span>{isClearingData ? "Đang xóa" : "Xóa toàn bộ dữ liệu"}</span>
              </button>
            </div>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main
      className={`app-shell ${isResizingPanels ? "resizing" : ""}`}
      ref={appShellRef}
      style={{ "--chat-panel-width": `${chatPanelWidth}%` }}
    >
      <section className="chat-panel" aria-label="Khung chat AI">
        <header className="panel-header">
          <div className="brand-mark" aria-hidden="true">
            <Sparkles size={24} />
          </div>
          <div className="chat-title-block">
            <h1>Chuẩn hóa GIÁ NHẬP</h1>
            <p className="eyebrow">AI Product Sheet</p>
          </div>
          <div className="header-actions">
            {activeShopContext?.shopId ? (
              <button
                className="account-pill context-pill"
                type="button"
                title="Thoat khoi shop dang xem"
                onClick={() => {
                  persistActiveShopContext(null);
                  setRows([]);
                  setSettingsSyncReady(false);
                }}
              >
                <UserCog size={16} />
                <span>Shop: {activeShopContext.shopName}</span>
                <X size={14} />
              </button>
            ) : null}
            {isAccountManager ? (
              <button
                className="icon-button"
                type="button"
                title={accountManagerCopy.title}
                onClick={() => setView("accounts")}
              >
                <Users size={20} />
              </button>
            ) : null}
            <button
              className="clear-chat-button"
              type="button"
              title="Xoa toan bo tin nhan cu"
              onClick={clearAllMessages}
            >
              <Trash2 size={16} />
              <span>Xóa All</span>
            </button>
            <button
              className="icon-button"
              type="button"
              title="Quay lại lần nhập trước"
              onClick={undoLastSubmission}
              disabled={!lastSubmission?.batchId || isUndoing}
            >
              <Undo2 size={20} />
            </button>
            <button
              className="icon-button"
              type="button"
              title="Cài đặt"
              onClick={() => setView("settings")}
            >
              <Settings2 size={20} />
            </button>
            <button className="icon-button" type="button" title="Đăng xuất" onClick={handleLogout}>
              <LogOut size={19} />
            </button>
          </div>
        </header>

        <div className="message-list">
          {messages.map((message) => (
            <article className={`message ${message.role}`} key={message.id}>
              <div
                className={`message-avatar ${message.role === "user" ? "supplier-message-avatar" : ""}`}
                title={message.role === "user" ? message.supplier || "Nhà cung cấp" : "AI"}
                aria-hidden="true"
              >
                {message.role === "assistant" ? <Bot size={18} /> : message.supplier || "Nhà cung cấp"}
              </div>
              <div className="message-body">
                <p>{message.text}</p>
                {message.meta ? <span className="message-meta">{message.meta}</span> : null}
              </div>
            </article>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form className="chat-composer" onSubmit={handleSubmit}>
          <div className="supplier-picker">
            <div className="supplier-picker-top">
              <span>Nhà cung cấp</span>
              <label className="supplier-search">
                <Search size={15} />
                <input
                  value={supplierSearch}
                  onChange={(event) => setSupplierSearch(event.target.value)}
                  placeholder="Tìm NCC..."
                  type="search"
                />
              </label>
            </div>
            <div className="supplier-chip-row">
              {filteredSuppliers.length ? (
                filteredSuppliers.map((supplier) => (
                  <button
                    className={`supplier-chip ${activeSupplier?.id === supplier.id ? "active" : ""}`}
                    type="button"
                    onClick={() => updateActiveSupplier(supplier.id)}
                    key={supplier.id}
                  >
                    {supplier.name}
                  </button>
                ))
              ) : (
                <span className="supplier-empty">Không có NCC phù hợp</span>
              )}
            </div>
            {supplierRequiredMessage ? (
              <span className="supplier-required-error">{supplierRequiredMessage}</span>
            ) : null}
          </div>
          <div className="composer-row">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={
                activeSupplier
                  ? `Dan tin nhan hoac bang gia tu ${activeSupplier.name}...`
                  : "Chon NCC truoc khi dan du lieu..."
              }
              rows={4}
            />
            <div className="composer-input-tools">
              <input
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="image-input"
                multiple
                onChange={(event) => addAttachedImages(event.target.files)}
                ref={imageInputRef}
                type="file"
              />
              <button
                className="attach-button"
                type="button"
                title="Đính kèm ảnh"
                onClick={() => imageInputRef.current?.click()}
              >
                <ImagePlus size={16} />
              </button>
            </div>
            <button className="send-button" type="submit" disabled={!input.trim() && !attachedImages.length}>
              <Send size={18} />
              <span>Gửi</span>
            </button>
          </div>
          {attachedImages.length ? (
            <div className="image-attachment-list" aria-label="Anh dinh kem">
              {attachedImages.map((image) => (
                <div className="image-attachment" key={image.id}>
                  <img src={image.dataUrl} alt={image.name || "Ảnh đính kèm"} />
                  <span>{image.name || "Ảnh"}</span>
                  <button type="button" title="Bỏ ảnh" onClick={() => removeAttachedImage(image.id)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </form>
      </section>

      <div
        className="panel-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Thanh ?i?u ch?nh k?ch th??c hai khung"
        onMouseDown={startPanelResize}
        onDoubleClick={resetPanelWidth}
      >
        <span className="panel-divider-handle" aria-hidden="true" />
      </div>

      <aside className="workspace-panel" aria-label="Bảng sản phẩm">
        <section className="sheet-panel">
          <div className="sheet-toolbar">
            <div className="section-heading compact">
              <div className="table-icon" aria-hidden="true">
                <Table2 size={20} />
              </div>
              <div className="sheet-heading-copy">
                <div className="sheet-status-line">
                  <p className="eyebrow">{sheetLabel}</p>
                  {status ? <span className="sheet-status-inline">{status}</span> : null}
                </div>
                <h2>{activeTableTab === "cheapest" ? "Sản phẩm rẻ nhất" : activeTableTab}</h2>
              </div>
            </div>

            <div className="toolbar-actions">
              <span className={`status-pill ${config?.providerConfigured ? "ok" : "warn"}`}>
                {config?.providerConfigured ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{config?.providerConfigured ? `${config?.providerLabel || "AI"} - ${config?.model}` : "Local"}</span>
              </span>
              <button
                className="icon-button"
                type="button"
                title="Đồng bộ bảng"
                onClick={refreshAll}
                disabled={isRefreshing}
              >
                <RefreshCw size={18} className={isRefreshing ? "spin" : ""} />
              </button>
            </div>
          </div>

          <div className="table-search-row">
            <label className="table-search-field">
              <Search size={15} />
              <input
                value={tableSearch}
                onChange={(event) => setTableSearch(event.target.value)}
                placeholder="Tìm mã, tên, giá, NCC..."
                type="search"
              />
            </label>
            <div className="table-search-actions" aria-label="Pham vi tim kiem">
              <button
                className={`table-filter-button ${tableSearchScope === "current" ? "active" : ""}`}
                type="button"
                onClick={() => setTableSearchScope("current")}
              >
                NCC Hiện tại
              </button>
              <button
                className={`table-filter-button ${tableSearchScope === "all" ? "active" : ""}`}
                type="button"
                onClick={() => setTableSearchScope("all")}
              >
                Tìm Full
              </button>
            </div>
          </div>


          <div className="table-tabs" aria-label="Lọc bảng sản phẩm">
            <button
              className={`table-tab ${activeTableTab === "cheapest" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveTableTab("cheapest")}
            >
              Sản phẩm rẻ nhất
            </button>
            {supplierTabs.map((supplierName) => (
              <button
                className={`table-tab ${activeTableTab === supplierName ? "active" : ""}`}
                type="button"
                onClick={() => setActiveTableTab(supplierName)}
                key={supplierName}
              >
                {supplierName}
              </button>
            ))}
          </div>

          <div className="table-wrap" ref={tableWrapRef}>
            <table>
              <colgroup>
                {tableColumns.map((column) => (
                  <col
                    key={column.id}
                    style={{
                      width: `${tableColumnWidths[column.id] || defaultTableColumnWidths[column.id]}px`
                    }}
                  />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {tableColumns.map((column) => (
                    <th
                      key={column.id}
                      className={column.id === "actions" ? "table-action-column" : ""}
                      style={{
                        width: `${tableColumnWidths[column.id] || defaultTableColumnWidths[column.id]}px`
                      }}
                    >
                      <div className="table-header-cell">
                        <span>{column.label}</span>
                        {!column.locked && (
                          <button
                            className={`column-resize-handle ${resizingColumnId === column.id ? "active" : ""}`}
                            type="button"
                            aria-label={`Keo de doi do rong cot ${column.label}`}
                            title={`Keo de doi do rong cot ${column.label}`}
                            onMouseDown={(event) => startTableColumnResize(event, column.id)}
                          />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.length ? (
                  tableRows.map((row, index) => (
                    <tr key={row.rowId || `${row.productCode}-${index}`}>
                      {tableColumns.map((column) => (
                        <td
                          className={column.id === "actions" ? "table-action-cell table-action-column" : ""}
                          key={column.id}
                        >
                          {renderTableCell(row, column.id)}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="empty-cell" colSpan={tableColumns.length}>
                      Chua co dong san pham.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </aside>
      {pendingGiftCode ? (
        <div className="modal-backdrop" role="presentation">
          <form className="gift-modal" onSubmit={confirmGiftCode}>
            <div>
              <p className="eyebrow">Mã quà tặng mới</p>
              <h2>Cần khai báo trước khi nhập</h2>
            </div>
            <p>
              NCC {pendingSubmission?.supplier?.name || "dang chon"} chua khai bao ma{" "}
              <span className="gift-code-pill">{pendingGiftCode}</span>. Nhập giá trị để lưu quy ước,
              hoặc bỏ qua nếu đây chỉ là ghi chú bình thường.
            </p>
            <label className="field">
              <span>Giá trị quà tặng</span>
              <input
                value={giftValueDraft}
                onChange={(event) => setGiftValueDraft(event.target.value)}
                placeholder="Ví dụ: 50000 hoặc 50.000"
                autoFocus
              />
            </label>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={skipGiftCode}>
                Bỏ Qua
              </button>
              <button className="primary-button" type="submit">
                Nhập
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {pendingProductMatch ? (
        <div className="modal-backdrop" role="presentation">
          <div className="gift-modal" role="dialog" aria-modal="true">
            <div>
              <p className="eyebrow">{"So kh\u1edbp m\u00e3 s\u1ea3n ph\u1ea9m"}</p>
              <h2>{"Hai m\u00e3 n\u00e0y c\u00f3 ph\u1ea3i l\u00e0 m\u1ed9t kh\u00f4ng?"}</h2>
            </div>
            <p>
              {"D\u1eef li\u1ec7u \u0111\u1ea7u v\u00e0o c\u00f3 m\u00e3 "}
              <span className="gift-code-pill">{pendingProductMatch.sourceCode}</span>
              {" nh\u01b0ng trong Gi\u00e1 bi\u00ean c\u00f3 m\u00e3 "}
              <span className="gift-code-pill">{pendingProductMatch.targetCode}</span>
              {`. NCC: ${pendingProductMatch.supplierName || "dang chon"}.`}
            </p>
            <p>
              {"N\u1ebfu x\u00e1c nh\u1eadn \u0111\u00fang, m\u00ecnh s\u1ebd l\u01b0u v\u00e0o ph\u1ea7n M\u00e3 s\u1ea3n ph\u1ea9m so kh\u1edbp t\u00f9y ch\u1ec9nh c\u1ee7a NCC n\u00e0y."}
            </p>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={skipProductMatch}>
                Không phải
              </button>
              <button className="primary-button" type="button" onClick={confirmProductMatch}>
                Đúng, lưu lại
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default App;
