import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { appendSheetProducts, isSheetsConfigured, readSheetProducts } from "./googleSheets.js";
import {
  initMysqlSchema,
  isMysqlConfigured,
  readAccountsFromMysql,
  readProductsFromMysql,
  writeAccountsToMysql,
  writeProductsToMysql
} from "./mysqlStore.js";
import { loadRuntimeConfig, runtimeConfig, saveRuntimeConfig } from "./runtimeConfig.js";

dotenv.config();
await loadRuntimeConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");
const dataDir = path.join(__dirname, "data");
const productsFile = path.join(dataDir, "products.json");
const accountsFile = path.join(dataDir, "accounts.json");
const localRowIdPrefix = "local-row-";
const PORT = Number(process.env.PORT || 8787);
const webLinkReachabilityCache = new Map();
const DEFAULT_PRODUCT_CATALOG_URL =
  process.env.PRODUCT_CATALOG_URL ||
  "https://checkgia.id.vn/san-pham-full?website_url=https://dienmaytienphong.com/&format=json";
const PRODUCT_CATALOG_CACHE_MS = 15 * 60 * 1000;
let productCatalogCache = {
  url: "",
  loadedAt: 0,
  products: [],
  promise: null
};
let localStoreQueue = Promise.resolve();
const shopStoreQueues = new Map();
const PROVIDERS = {
  openai: {
    label: "OpenAI",
    defaultModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    modelOptions: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"]
  },
  gemini: {
    label: "Gemini",
    defaultModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    modelOptions: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"]
  },
  grok: {
    label: "Grok",
    defaultModel: process.env.XAI_MODEL || "grok-4.20-reasoning",
    modelOptions: ["grok-4.20-reasoning", "grok-4", "grok-4-fast", "grok-code-fast-1"]
  }
};

const app = express();

app.use(cors());
app.use(express.json({ limit: "25mb" }));

const productSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "rows"],
  properties: {
    reply: {
      type: "string",
      description: "Một câu phản hồi ngắn bằng tiếng Việt cho người dùng."
    },
    rows: {
      type: "array",
      description: "Các dòng sản phẩm đã chuẩn hóa.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "productCode",
          "productName",
          "purchasePrice",
          "minPrice",
          "salePrice",
          "webLink",
          "supplier",
          "supplierStock",
          "notes"
        ],
        properties: {
          productCode: { type: "string" },
          productName: { type: "string" },
          purchasePrice: { type: "string" },
          minPrice: { type: "string" },
          salePrice: { type: "string" },
          webLink: { type: "string" },
          supplier: { type: "string" },
          supplierStock: {
            type: "string",
            description: "Tồn kho của nhà cung cấp, ví dụ còn hàng, hết hàng, số lượng còn hoặc thời gian có hàng."
          },
          notes: {
            type: "string",
            description: "Ghi chú về quà tặng kèm, điều kiện áp dụng, combo, bảo hành hoặc lưu ý đặc biệt."
          }
        }
      }
    }
  }
};

const geminiProductSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "rows"],
  properties: {
    reply: { type: "string" },
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "productCode",
          "productName",
          "purchasePrice",
          "minPrice",
          "salePrice",
          "webLink",
          "supplier",
          "supplierStock",
          "notes"
        ],
        properties: {
          productCode: { type: "string" },
          productName: { type: "string" },
          purchasePrice: { type: "string" },
          minPrice: { type: "string" },
          salePrice: { type: "string" },
          webLink: { type: "string" },
          supplier: { type: "string" },
          supplierStock: { type: "string" },
          notes: { type: "string" }
        }
      }
    }
  }
};

const productLookupSchema = {
  type: "object",
  additionalProperties: false,
  required: ["rows"],
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["productCode", "productName", "webLink"],
        properties: {
          productCode: { type: "string" },
          productName: { type: "string" },
          webLink: { type: "string" }
        }
      }
    }
  }
};

const COLUMN_LABELS = {
  productCode: "Mã sản phẩm",
  productName: "Tên sản phẩm",
  purchasePrice: "Giá NCC",
  minPrice: "Giá min",
  salePrice: "Giá bán",
  webLink: "Link web",
  supplier: "Nhà cung cấp",
  supplierStock: "Kho NCC",
  notes: "Ghi chú"
};

function productFromStructuredRow(row = {}) {
  return {
    productCode: clean(row.productCode),
    productName: clean(row.productName),
    purchasePrice: clean(row.purchasePrice),
    minPrice: clean(row.minPrice),
    salePrice: clean(row.salePrice),
    webLink: clean(row.webLink),
    supplier: clean(row.supplier),
    supplierStock: clean(row.supplierStock),
    notes: clean(row.notes),
    batchId: clean(row.batchId),
    createdAt: clean(row.createdAt)
  };
}

function isEmptyCellValue(value) {
  const text = clean(value).toLowerCase();
  return !text || text === "-" || text === "chưa có" || text === "chua co";
}

function isMeaningfulProductRow(row = {}) {
  return ["productCode", "productName", "purchasePrice"].some((key) => !isEmptyCellValue(row[key]));
}

function sanitizeProductRows(rows = []) {
  return rows.map(productFromStructuredRow).filter(isMeaningfulProductRow);
}

function productUpsertKey(row = {}) {
  const code = normalizeRuleCode(row.productCode);
  if (!code) {
    return "";
  }

  const supplierKey = foldText(row.supplier).replace(/\s+/g, " ").trim() || "unknown-supplier";
  return `${supplierKey}::${code}`;
}

function mergeProductRows(existing = {}, incoming = {}) {
  const current = productFromStructuredRow(existing);
  const update = productFromStructuredRow(incoming);
  const merged = { ...current };
  const preserveWhenBlank = [
    "productCode",
    "productName",
    "purchasePrice",
    "minPrice",
    "webLink",
    "supplier",
    "supplierStock",
    "notes"
  ];

  for (const key of preserveWhenBlank) {
    if (!isEmptyCellValue(update[key])) {
      merged[key] = update[key];
    }
  }

  merged.salePrice = update.salePrice;

  return {
    ...merged,
    batchId: current.batchId || update.batchId,
    createdAt: current.createdAt || update.createdAt
  };
}

function upsertProductRows(currentRows = [], incomingRows = []) {
  const next = [];
  const indexByKey = new Map();

  for (const row of sanitizeProductRows(currentRows)) {
    const key = productUpsertKey(row);
    if (key && indexByKey.has(key)) {
      const index = indexByKey.get(key);
      next[index] = mergeProductRows(next[index], row);
      continue;
    }

    if (key) {
      indexByKey.set(key, next.length);
    }
    next.push(row);
  }

  for (const row of sanitizeProductRows(incomingRows)) {
    const key = productUpsertKey(row);
    if (key && indexByKey.has(key)) {
      const index = indexByKey.get(key);
      next[index] = mergeProductRows(next[index], row);
      continue;
    }

    if (key) {
      indexByKey.set(key, next.length);
    }
    next.push(row);
  }

  return next;
}

function clean(value) {
  return String(value ?? "").trim();
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(String(password || ""), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash = "") {
  const [salt, hash] = clean(storedHash).split(":");
  if (!salt || !hash) {
    return false;
  }

  const nextHash = scryptSync(String(password || ""), salt, 64);
  const storedBuffer = Buffer.from(hash, "hex");
  return storedBuffer.length === nextHash.length && timingSafeEqual(storedBuffer, nextHash);
}

function publicAccount(account = {}) {
  const role = account.role === "admin" ? "admin" : account.role === "shop" ? "shop" : "user";
  return {
    id: clean(account.id),
    username: clean(account.username),
    displayName: clean(account.displayName),
    role,
    shopId: clean(account.shopId || (role === "shop" ? account.id : "")),
    shopName: clean(account.shopName || account.displayName || account.username),
    active: account.active !== false,
    createdAt: clean(account.createdAt),
    updatedAt: clean(account.updatedAt)
  };
}

function normalizeAccountShape(account = {}) {
  const rawRole = account.role === "admin" ? "admin" : account.role === "shop" ? "shop" : "user";
  const role = rawRole === "user" && !clean(account.shopId) ? "shop" : rawRole;
  const id = clean(account.id) || randomUUID();
  const shopId = role === "admin" ? "" : clean(account.shopId) || id;
  return {
    ...account,
    id,
    role,
    shopId,
    shopName: clean(account.shopName || account.displayName || account.username),
    active: account.active !== false
  };
}

async function ensureAccountsStore() {
  if (isMysqlConfigured()) {
    await initMysqlSchema();
    const accounts = await readAccountsFromMysql();
    if (accounts?.length) {
      return;
    }

    const now = new Date().toISOString();
    await writeAccountsToMysql([
      {
        id: randomUUID(),
        username: "admin",
        displayName: "Admin",
        role: "admin",
        active: true,
        passwordHash: hashPassword(process.env.DEFAULT_ADMIN_PASSWORD || "admin123"),
        createdAt: now,
        updatedAt: now
      }
    ]);
    return;
  }

  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(accountsFile);
  } catch {
    const now = new Date().toISOString();
    const defaultAdmin = {
      id: randomUUID(),
      username: "admin",
      displayName: "Admin",
      role: "admin",
      active: true,
      passwordHash: hashPassword(process.env.DEFAULT_ADMIN_PASSWORD || "admin123"),
      createdAt: now,
      updatedAt: now
    };
    await fs.writeFile(accountsFile, `${JSON.stringify([defaultAdmin], null, 2)}\n`, "utf8");
  }
}

async function readAccounts() {
  await ensureAccountsStore();
  if (isMysqlConfigured()) {
    const accounts = await readAccountsFromMysql();
    return Array.isArray(accounts) ? accounts.map(normalizeAccountShape) : [];
  }

  try {
    const text = await fs.readFile(accountsFile, "utf8");
    const accounts = JSON.parse(text);
    const normalized = Array.isArray(accounts) ? accounts.map(normalizeAccountShape) : [];
    if (JSON.stringify(accounts) !== JSON.stringify(normalized)) {
      await writeAccounts(normalized);
    }
    return normalized;
  } catch {
    return [];
  }
}

async function writeAccounts(accounts = []) {
  if (isMysqlConfigured()) {
    await writeAccountsToMysql(accounts.map(normalizeAccountShape));
    return;
  }

  await ensureAccountsStore();
  await fs.writeFile(accountsFile, `${JSON.stringify(accounts, null, 2)}\n`, "utf8");
}

const sessions = new Map();

function canManageAccounts(account = {}) {
  return account.role === "admin" || account.role === "shop";
}

function accountsForManager(accounts = [], manager = {}) {
  if (manager.role === "admin") {
    return accounts.filter((account) => account.role === "shop");
  }

  const shopId = clean(manager.shopId) || clean(manager.id);
  return accounts.filter((account) => account.shopId === shopId && account.role === "user");
}

function canManageTargetAccount(manager = {}, target = {}) {
  if (manager.role === "admin") {
    return target.role === "shop";
  }

  const shopId = clean(manager.shopId) || clean(manager.id);
  return target.shopId === shopId && target.role === "user";
}

function requireAccountManager(req, res, next) {
  requireAuth(req, res, () => {
    if (!canManageAccounts(req.user)) {
      res.status(403).json({ error: "Tai khoan nay khong co quyen quan ly tai khoan." });
      return;
    }

    next();
  });
}

function requestShopId(req) {
  if (req.user?.role === "admin") {
    return clean(req.headers["x-shop-id"]) || "admin";
  }

  return clean(req.user?.shopId) || clean(req.user?.id) || "default";
}

function safeShopId(shopId = "") {
  return clean(shopId).replace(/[^a-z0-9_-]/gi, "_") || "default";
}

function productsFileForShop(shopId = "") {
  const safeId = safeShopId(shopId);
  return safeId === "admin" ? productsFile : path.join(dataDir, `products.${safeId}.json`);
}

function blankShopRuntimeConfig() {
  return {
    provider: "openai",
    apiKeys: {
      openai: "",
      gemini: "",
      grok: ""
    },
    models: {
      openai: providerMeta("openai").defaultModel,
      gemini: providerMeta("gemini").defaultModel,
      grok: providerMeta("grok").defaultModel
    },
    sheets: {
      sheetId: "",
      sheetTab: "Products",
      serviceAccountEmail: "",
      privateKey: "",
      credentialsPath: ""
    },
    appSettings: null
  };
}

function getRuntimeForShop(shopId = "") {
  const safeId = safeShopId(shopId);
  if (safeId === "admin") {
    return runtimeConfig;
  }

  runtimeConfig.shopConfigs = runtimeConfig.shopConfigs || {};
  if (!runtimeConfig.shopConfigs[safeId]) {
    runtimeConfig.shopConfigs[safeId] = {
      ...blankShopRuntimeConfig(),
      appSettings: runtimeConfig.shopSettings?.[safeId] || null
    };
  }

  runtimeConfig.shopConfigs[safeId] = {
    ...blankShopRuntimeConfig(),
    ...runtimeConfig.shopConfigs[safeId],
    apiKeys: {
      ...blankShopRuntimeConfig().apiKeys,
      ...(runtimeConfig.shopConfigs[safeId].apiKeys || {})
    },
    models: {
      ...blankShopRuntimeConfig().models,
      ...(runtimeConfig.shopConfigs[safeId].models || {})
    },
    sheets: {
      ...blankShopRuntimeConfig().sheets,
      ...(runtimeConfig.shopConfigs[safeId].sheets || {})
    }
  };

  return runtimeConfig.shopConfigs[safeId];
}

function getAppSettingsForShop(shopId = "") {
  return getRuntimeForShop(shopId).appSettings || null;
}

function setAppSettingsForShop(shopId = "", settings = null) {
  const targetConfig = getRuntimeForShop(shopId);
  targetConfig.appSettings =
    settings && typeof settings === "object" && !Array.isArray(settings) ? settings : null;
}

function enqueueShopStoreWrite(shopId, task) {
  const safeId = safeShopId(shopId);
  const queue = shopStoreQueues.get(safeId) || Promise.resolve();
  const run = queue.then(task, task);
  shopStoreQueues.set(safeId, run.catch(() => {}));
  return run;
}

function getSessionFromRequest(req) {
  const authHeader = clean(req.headers.authorization);
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  return token ? sessions.get(token) || null : null;
}

function requireAuth(req, res, next) {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: "Chua dang nhap." });
    return;
  }

  req.user = session.account;
  req.sessionToken = session.token;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Chi tai khoan admin moi duoc thuc hien thao tac nay." });
      return;
    }

    next();
  });
}

function cleanMultiline(value) {
  return clean(value)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function cleanImageInputs(images = []) {
  if (!Array.isArray(images)) {
    return [];
  }

  return images
    .map((image) => {
      const dataUrl = clean(image?.dataUrl);
      const mimeType = clean(image?.mimeType || image?.type).toLowerCase();
      const name = clean(image?.name);
      const match = dataUrl.match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,([a-z0-9+/=]+)$/i);
      if (!match) {
        return null;
      }

      const detectedMimeType = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
      const normalizedMimeType = mimeType.replace("image/jpg", "image/jpeg") || detectedMimeType;
      if (normalizedMimeType !== detectedMimeType) {
        return null;
      }

      return {
        dataUrl,
        base64: match[2],
        mimeType: detectedMimeType,
        name
      };
    })
    .filter(Boolean)
    .slice(0, 6);
}

function imagePayloadSize(images = []) {
  return images.reduce((total, image) => total + image.dataUrl.length, 0);
}

function buildResponsesInput(message, images = []) {
  if (!images.length) {
    return message;
  }

  return [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text:
            message ||
            "Phân tích ảnh này như bảng giá/tin nhắn nhà cung cấp, trích xuất sản phẩm vào đúng schema."
        },
        ...images.map((image) => ({
          type: "input_image",
          image_url: image.dataUrl
        }))
      ]
    }
  ];
}

function buildGeminiParts(message, images = []) {
  return [
    {
      text:
        message ||
        "Phân tích ảnh này như bảng giá/tin nhắn nhà cung cấp, trích xuất sản phẩm vào đúng schema."
    },
    ...images.map((image) => ({
      inlineData: {
        mimeType: image.mimeType,
        data: image.base64
      }
    }))
  ];
}

function normalizeRuleCode(value) {
  return clean(value)
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function parseMarginRuleCodes(value = "") {
  const codes = new Set();
  const lines = String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match =
      line.match(/^\[([^\]]+)\]\s*(?:=|:|=>|->)\s*(.+)$/) ||
      line.match(/^([^\s\[\]=:>]+)\s*(?:=|:|=>|->)\s*(.+)$/) ||
      line.match(/^([^\s\[\]=:>]+)\s+(.+)$/);
    const code = normalizeRuleCode(match?.[1] || "");
    if (code) {
      codes.add(code);
    }
  }

  return codes;
}

function parseMarginRuleValues(value = "") {
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
    const code = normalizeRuleCode(match?.[1] || "");
    const valueText = normalizePrice(match?.[2] || "", { assumeThousands: true });
    const amount = Number(valueText.replace(/\D/g, ""));
    if (code && Number.isFinite(amount) && amount > 0) {
      rules.set(code, amount);
    }
  }

  return rules;
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
    const sourceCode = normalizeRuleCode(match?.[1] || "");
    const targetCode = normalizeRuleCode(match?.[2] || "");
    if (sourceCode && targetCode) {
      rules.set(sourceCode, targetCode);
    }
  }

  return rules;
}

function productMatchRulesForSupplier(settings = {}, supplierName = "") {
  const supplierKey = foldText(supplierName);
  const supplier = (settings.suppliers || []).find((item) => foldText(item?.name) === supplierKey);
  return parseProductMatchRules(supplier?.productMatchRules);
}

function resolveMatchedProductCode(row = {}, settings = {}) {
  const code = normalizeRuleCode(row.productCode);
  const matches = productMatchRulesForSupplier(settings, row.supplier);
  return matches.get(code) || code;
}

function parsePriceAmount(value) {
  const normalized = normalizePrice(value, { assumeThousands: true });
  const amount = Number(normalized.replace(/\D/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : NaN;
}

function formatPriceAmount(value) {
  return Number.isFinite(value) && value > 0 ? `${value.toLocaleString("vi-VN")} đ` : "";
}

function applySalePriceVisibility(rows = [], settings = {}) {
  const marginCodes = parseMarginRuleCodes(settings.marginRules);
  return rows.map((row) => {
    const code = resolveMatchedProductCode(row, settings);
    if (!code || !marginCodes.has(code)) {
      return {
        ...row,
        salePrice: ""
      };
    }

    return row;
  });
}

function normalizeGiftCode(value) {
  return foldText(value).replace(/\s+/g, "").toUpperCase();
}

function parseGiftRuleValues(value = "") {
  const rules = new Map();
  const lines = String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match =
      line.match(/^\[?([^=\]:]+?)\]?\s*(?:=|:|=>|->)\s*(.+)$/) ||
      line.match(/^([^\s=:\]]+)\s+(.+)$/);
    const rawCode = clean(match?.[1] || "");
    const valueText = clean(match?.[2] || "");
    const code = normalizeGiftCode(rawCode);
    if (code && valueText) {
      rules.set(code, {
        code: rawCode.toUpperCase(),
        value: valueText
      });
    }
  }

  return rules;
}

function notesContainGiftCode(notes, code) {
  const normalizedNotes = normalizeGiftCode(notes);
  return normalizedNotes.includes(code);
}

function applyGiftRulesToNotes(notes = "", giftRules = new Map()) {
  if (!giftRules.size) {
    return clean(notes);
  }

  let segments = clean(notes)
    .split(";")
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const [codeKey, rule] of giftRules.entries()) {
    const annotation = `${rule.code} = ${rule.value}`;
    let found = false;

    segments = segments.map((segment) => {
      const normalizedSegment = normalizeGiftCode(segment);
      if (normalizedSegment.startsWith(codeKey) && /(?:=|:)/.test(segment)) {
        found = true;
        return annotation;
      }

      if (normalizedSegment === codeKey) {
        found = true;
        return annotation;
      }

      if (normalizedSegment.includes(codeKey)) {
        found = true;
      }

      return segment;
    });

    const alreadyAnnotated = segments.some((segment) => normalizeGiftCode(segment) === normalizeGiftCode(annotation));
    if (found && !alreadyAnnotated) {
      segments.push(annotation);
    }
  }

  return appendNote(...segments);
}

function recalculateProductsWithSettings(rows = [], settings = {}) {
  const safeRows = sanitizeProductRows(rows);
  const marginRules = parseMarginRuleValues(settings.marginRules);
  const minPriceByCode = new Map();
  const supplierGiftRules = new Map();

  for (const supplier of settings.suppliers || []) {
    const supplierKey = foldText(supplier?.name);
    if (supplierKey) {
      supplierGiftRules.set(supplierKey, parseGiftRuleValues(supplier?.giftRule));
    }
  }

  for (const row of safeRows) {
    const code = resolveMatchedProductCode(row, settings);
    const price = parsePriceAmount(row.purchasePrice);
    if (!code || !Number.isFinite(price)) {
      continue;
    }

    const current = minPriceByCode.get(code);
    if (!Number.isFinite(current) || price < current) {
      minPriceByCode.set(code, price);
    }
  }

  return safeRows.map((row) => {
    const next = productFromStructuredRow(row);
    const code = resolveMatchedProductCode(next, settings);
    const explicitMinPrice = parsePriceAmount(next.minPrice);
    const minPrice = Number.isFinite(explicitMinPrice) ? explicitMinPrice : minPriceByCode.get(code);
    const margin = marginRules.get(code);
    next.salePrice = Number.isFinite(margin) && Number.isFinite(minPrice) ? formatPriceAmount(minPrice + margin) : "";

    const giftRules = supplierGiftRules.get(foldText(next.supplier));
    if (giftRules?.size) {
      next.notes = applyGiftRulesToNotes(next.notes, giftRules);
    }

    return next;
  });
}

function buildColumnRuleLines(columnRules = {}) {
  return Object.entries(COLUMN_LABELS)
    .map(([key, label]) => {
      const rule = clean(columnRules[key]);
      return rule ? `- ${label}: ${rule}` : "";
    })
    .filter(Boolean);
}

function normalizeProvider(value) {
  const normalized = clean(value).toLowerCase();
  if (normalized === "gemini" || normalized === "grok") {
    return normalized;
  }

  return "openai";
}

function humanizeProviderError(provider, error, fallbackMessage) {
  const status = Number(error?.status || error?.statusCode || 0);
  const rawMessage = clean(error?.error || error?.message || fallbackMessage);
  const lower = rawMessage.toLowerCase();

  if (provider === "grok") {
    if (
      status === 403 ||
      lower.includes("credits or licenses") ||
      lower.includes("doesn't have any credits")
    ) {
      return "Tai khoan Grok chua co credit/license. Vui long nap credit tai console.x.ai roi thu lai.";
    }

    if (status === 401 || lower.includes("incorrect api key") || lower.includes("invalid api key")) {
      return "xAI API key khong hop le hoac da het hieu luc.";
    }
  }

  return rawMessage || fallbackMessage;
}

function providerMeta(provider = runtimeConfig.provider) {
  return PROVIDERS[normalizeProvider(provider)] || PROVIDERS.openai;
}

function getRuntimeModel(provider = runtimeConfig.provider, config = runtimeConfig) {
  const normalizedProvider = normalizeProvider(provider);
  return config.models?.[normalizedProvider] || providerMeta(normalizedProvider).defaultModel;
}

function configuredModelOptions(provider = runtimeConfig.provider, extraModels = [], config = runtimeConfig) {
  const normalizedProvider = normalizeProvider(provider);
  return [
    ...new Set(
      [getRuntimeModel(normalizedProvider, config), ...providerMeta(normalizedProvider).modelOptions, ...extraModels].filter(Boolean)
    )
  ];
}

function getProviderKey(provider = runtimeConfig.provider, apiKey = "", config = runtimeConfig) {
  const normalizedProvider = normalizeProvider(provider);
  const draftKey = clean(apiKey);
  if (draftKey) {
    return draftKey;
  }

  if (normalizedProvider === "gemini") {
    return config.apiKeys?.gemini || "";
  }

  if (normalizedProvider === "grok") {
    return config.apiKeys?.grok || "";
  }

  return config.apiKeys?.openai || "";
}

function providerConfigured(provider = runtimeConfig.provider, config = runtimeConfig) {
  return Boolean(getProviderKey(provider, "", config));
}

function getOpenAIClient(apiKey = runtimeConfig.apiKeys.openai) {
  const key = clean(apiKey);
  return key ? new OpenAI({ apiKey: key }) : null;
}

function getGrokClient(apiKey = runtimeConfig.apiKeys.grok) {
  const key = clean(apiKey);
  return key
    ? new OpenAI({
        apiKey: key,
        baseURL: "https://api.x.ai/v1"
      })
    : null;
}

async function ensureLocalStore(shopId = "admin") {
  if (isMysqlConfigured()) {
    await initMysqlSchema();
    return;
  }

  await fs.mkdir(dataDir, { recursive: true });
  const targetFile = productsFileForShop(shopId);
  try {
    await fs.access(targetFile);
  } catch {
    await fs.writeFile(targetFile, "[]", "utf8");
  }
}

async function readLocalProducts(shopId = "admin") {
  await ensureLocalStore(shopId);
  if (isMysqlConfigured()) {
    const products = await readProductsFromMysql(shopId);
    return Array.isArray(products) ? products : [];
  }

  const text = await fs.readFile(productsFileForShop(shopId), "utf8");
  try {
    const rows = JSON.parse(text);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function enqueueLocalStoreWrite(task) {
  const run = localStoreQueue.then(task, task);
  localStoreQueue = run.catch(() => {});
  return run;
}

async function appendLocalProducts(products, shopId = "admin") {
  return enqueueShopStoreWrite(shopId, async () => {
    const current = await readLocalProducts(shopId);
    const next = upsertProductRows(current, products);
    await writeLocalProducts(next, shopId);
  });
}

async function compactLocalProducts(shopId = "admin") {
  return enqueueShopStoreWrite(shopId, async () => {
    const current = await readLocalProducts(shopId);
    const next = upsertProductRows(current);
    if (next.length !== current.length || JSON.stringify(next) !== JSON.stringify(current)) {
      await writeLocalProducts(next, shopId);
    }
    return current.length - next.length;
  });
}

async function backupFileIfExists(filePath) {
  try {
    await fs.access(filePath);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await fs.copyFile(filePath, `${filePath}.${stamp}.bak`);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function writeLocalProducts(products, shopId = "admin") {
  if (isMysqlConfigured()) {
    await writeProductsToMysql(shopId, products);
    return;
  }

  await ensureLocalStore(shopId);
  const targetFile = productsFileForShop(shopId);
  await backupFileIfExists(targetFile);
  await fs.writeFile(targetFile, `${JSON.stringify(products, null, 2)}\n`, "utf8");
}

async function deleteLocalBatch(batchId, shopId = "admin") {
  return enqueueShopStoreWrite(shopId, async () => {
    const current = await readLocalProducts(shopId);
    const next = current.filter((product) => product.batchId !== batchId);
    await writeLocalProducts(next, shopId);
    return current.length - next.length;
  });
}

function withLocalRowIds(rows) {
  return rows.map((row, index) => ({
    ...row,
    rowId: `${localRowIdPrefix}${index}`
  }));
}

function visibleLocalProductsWithRowIds(rows) {
  return rows
    .map((row, index) => ({
      ...productFromStructuredRow(row),
      rowId: `${localRowIdPrefix}${index}`
    }))
    .filter(isMeaningfulProductRow);
}

function parseLocalRowIndex(rowId) {
  const value = clean(rowId);
  if (!value.startsWith(localRowIdPrefix)) {
    return -1;
  }

  const index = Number.parseInt(value.slice(localRowIdPrefix.length), 10);
  return Number.isInteger(index) && index >= 0 ? index : -1;
}

async function deleteLocalRow(rowId, shopId = "admin") {
  return enqueueShopStoreWrite(shopId, async () => {
    const current = await readLocalProducts(shopId);
    const rowIndex = parseLocalRowIndex(rowId);
    if (rowIndex < 0 || rowIndex >= current.length) {
      return 0;
    }

    current.splice(rowIndex, 1);
    await writeLocalProducts(current, shopId);
    return 1;
  });
}

function normalizePrice(value, options = {}) {
  const text = clean(value);
  if (!text) {
    return "";
  }

  const compact = text.replace(/\s+/g, "");
  const numberMatch = compact.match(/(\d[\d.,]*)/);
  if (!numberMatch) {
    return text;
  }

  const suffix = /k$/i.test(compact) ? "000" : "";
  const numericText = numberMatch[1].replace(/[.,]/g, "") + suffix;
  if (!numericText) {
    return text;
  }

  let numeric = Number(numericText);
  if (options.assumeThousands && numeric > 0 && numeric < 100000) {
    numeric *= 1000;
  }

  return `${numeric.toLocaleString("vi-VN")} đ`;
}

function foldText(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function normalizeLookupKey(value) {
  return clean(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/^\[/, "")
    .replace(/\]$/, "");
}

function normalizeAlphaNum(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hasCodeEvidence(code, ...texts) {
  const codeToken = normalizeAlphaNum(code);
  if (!codeToken || codeToken.length < 4) {
    return false;
  }

  return texts.some((text) => normalizeAlphaNum(text).includes(codeToken));
}

function normalizeCatalogProduct(product = {}) {
  const code = clean(product.code || product.productCode || product.sku);
  const name = clean(product.name || product.productName || product.title);
  const url = normalizeWebLink(product.url || product.webLink || product.link);
  if (!url || (!code && !name)) {
    return null;
  }

  return {
    code,
    name,
    url,
    codeToken: normalizeAlphaNum(code),
    nameToken: normalizeAlphaNum(name),
    urlToken: normalizeAlphaNum(url)
  };
}

function getProductCatalogUrl(settings = {}) {
  return clean(settings.productCatalogUrl) || clean(runtimeConfig.appSettings?.productCatalogUrl) || DEFAULT_PRODUCT_CATALOG_URL;
}

async function loadProductCatalog(settings = {}) {
  const catalogUrl = getProductCatalogUrl(settings);
  const now = Date.now();
  if (
    productCatalogCache.url === catalogUrl &&
    productCatalogCache.products.length &&
    now - productCatalogCache.loadedAt < PRODUCT_CATALOG_CACHE_MS
  ) {
    return productCatalogCache.products;
  }

  if (productCatalogCache.url === catalogUrl && productCatalogCache.promise) {
    return productCatalogCache.promise;
  }

  productCatalogCache.url = catalogUrl;
  productCatalogCache.promise = (async () => {
    const response = await fetch(catalogUrl, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20000)
    });

    if (!response.ok) {
      throw new Error(`Khong doc duoc danh sach san pham: HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload && !Array.isArray(payload) && clean(payload.message)) {
      throw new Error(`Khong doc duoc danh sach san pham: ${clean(payload.message)}`);
    }
    const sourceProducts = Array.isArray(payload) ? payload : payload.products || payload.data || [];
    const products = sourceProducts
      .map(normalizeCatalogProduct)
      .filter(Boolean);

    productCatalogCache = {
      url: catalogUrl,
      loadedAt: Date.now(),
      products,
      promise: null
    };

    return products;
  })();

  try {
    return await productCatalogCache.promise;
  } catch (error) {
    productCatalogCache.promise = null;
    throw error;
  }
}

function productCatalogScore(row = {}, product = {}) {
  const codeToken = normalizeAlphaNum(row.productCode);
  if (!codeToken || codeToken.length < 4) {
    return 0;
  }

  let score = 0;
  if (product.codeToken === codeToken) {
    score += 120;
  } else if (product.codeToken.includes(codeToken)) {
    score += 90;
  } else if (codeToken.includes(product.codeToken) && product.codeToken.length >= 4) {
    score += 70;
  } else if (product.nameToken.includes(codeToken)) {
    score += 55;
  } else if (product.urlToken.includes(codeToken)) {
    score += 45;
  }

  const rowNameToken = normalizeAlphaNum(row.productName);
  if (score && rowNameToken && rowNameToken !== codeToken) {
    const rowWords = foldText(row.productName)
      .split(/[^a-z0-9]+/i)
      .map((word) => word.trim().toLowerCase())
      .filter((word) => word.length >= 3);
    const productText = `${foldText(product.name)} ${product.code}`.toLowerCase();
    score += rowWords.filter((word) => productText.includes(word)).length * 4;
  }

  return score;
}

function findCatalogProduct(row = {}, products = []) {
  let best = null;
  let bestScore = 0;

  for (const product of products) {
    const score = productCatalogScore(row, product);
    if (score > bestScore) {
      best = product;
      bestScore = score;
    }
  }

  return bestScore >= 45 ? best : null;
}

function findCatalogCandidates(row = {}, products = [], limit = 8) {
  return products
    .map((product) => ({
      product,
      score: productCatalogScore(row, product)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function catalogNameCandidateScore(row = {}, product = {}) {
  const rowName = clean(row.productName);
  const rowNameToken = normalizeAlphaNum(rowName);
  if (!rowNameToken || rowNameToken.length < 4) {
    return 0;
  }

  let score = 0;
  if (product.nameToken === rowNameToken) {
    score += 120;
  } else if (product.nameToken.includes(rowNameToken)) {
    score += 95;
  } else if (rowNameToken.includes(product.nameToken) && product.nameToken.length >= 8) {
    score += 70;
  }

  const rowWords = foldText(rowName)
    .split(/[^a-z0-9]+/i)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length >= 3);
  const productNameText = foldText(product.name).toLowerCase();
  const matchedWords = rowWords.filter((word) => productNameText.includes(word)).length;
  if (matchedWords >= 2) {
    score += matchedWords * 12;
  }

  return score;
}

function findCatalogNameCandidates(row = {}, products = [], limit = 8) {
  return products
    .map((product) => ({
      product,
      score: catalogNameCandidateScore(row, product)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function applyCatalogProductToRow(row = {}, product = null) {
  if (!product) {
    return {
      ...row,
      webLink: ""
    };
  }

  const rowNameKey = normalizeLookupKey(row.productName);
  const codeKey = normalizeLookupKey(row.productCode);
  const shouldUseCatalogName = !rowNameKey || rowNameKey === codeKey;

  return {
    ...row,
    productName: shouldUseCatalogName && product.name ? product.name : clean(row.productName),
    webLink: product.url
  };
}

function enrichRowsWithProductCatalogManual(rows = [], products = []) {
  let matched = 0;
  const nextRows = rows.map((row) => {
    const match = findCatalogProduct(row, products);
    if (match) {
      matched += 1;
    }

    return applyCatalogProductToRow(row, match);
  });

  return { rows: nextRows, matched, warning: "" };
}

async function enrichRowsWithProductCatalogAi(rows = [], products = [], settings = {}) {
  const { client, model } = getLookupClient(settings.provider || runtimeConfig.provider);
  if (!client || !model) {
    return {
      ...enrichRowsWithProductCatalogManual(rows, products),
      warning: "Chua co OpenAI/Grok API key de dung AI so khop link; da dung so khop thu cong."
    };
  }

  const candidateGroups = rows
    .map((row) => ({
      row,
      codeKey: normalizeLookupKey(row.productCode),
      candidates: findCatalogNameCandidates(row, products, 8)
    }))
    .filter((group) => group.codeKey && group.candidates.length);

  if (!candidateGroups.length) {
    return { rows: rows.map((row) => ({ ...row, webLink: "" })), matched: 0, warning: "" };
  }

  const byCode = new Map();
  const chunks = [];
  for (let index = 0; index < candidateGroups.length; index += 20) {
    chunks.push(candidateGroups.slice(index, index + 20));
  }

  for (const chunk of chunks) {
    const input = [
      "Chon link san pham dung nhat tu danh sach ung vien JSON.",
      "Chi duoc chon webLink la mot url co san trong candidates. Khong tu tao link moi.",
      "Chi so khop dua tren truong ten san pham productName. Khong dung ma san pham productCode de quyet dinh.",
      "Neu khong chac chan ung vien nao dung voi ten san pham thi de productName va webLink rong.",
      "Tra ve JSON dung schema.",
      JSON.stringify({
        rows: chunk.map((group) => ({
          productCode: clean(group.row.productCode),
          productName: clean(group.row.productName),
          candidates: group.candidates.map(({ product }) => ({
            productName: product.name,
            code: product.code,
            webLink: product.url
          }))
        }))
      })
    ].join("\n");

    const response = await client.responses.create({
      model,
      input,
      text: {
        format: {
          type: "json_schema",
          name: "product_lookup",
          strict: true,
          schema: productLookupSchema
        }
      }
    });

    const parsed = JSON.parse(extractOutputText(response));

    for (const item of parsed.rows || []) {
      const codeKey = normalizeLookupKey(item.productCode);
      const group = chunk.find((entry) => entry.codeKey === codeKey);
      if (!group) {
        continue;
      }

      const selectedUrl = normalizeWebLink(item.webLink);
      const selected = selectedUrl
        ? group.candidates.find(({ product }) => product.url === selectedUrl)?.product
        : null;
      byCode.set(codeKey, selected || null);
    }
  }

  let matched = 0;
  const nextRows = rows.map((row) => {
    const codeKey = normalizeLookupKey(row.productCode);
    if (!byCode.has(codeKey)) {
      return {
        ...row,
        webLink: ""
      };
    }

    const match = byCode.get(codeKey);
    if (match) {
      matched += 1;
    }

    return applyCatalogProductToRow(row, match);
  });

  return { rows: nextRows, matched, warning: "" };
}

async function enrichRowsWithProductCatalog(rows = [], settings = {}) {
  if (!Array.isArray(rows) || !rows.length) {
    return { rows, matched: 0, warning: "" };
  }

  let products = [];
  try {
    products = await loadProductCatalog(settings);
  } catch (error) {
    return {
      rows,
      matched: 0,
      warning: `Khong doc duoc danh sach link san pham: ${error.message}`
    };
  }

  if (!products.length) {
    return {
      rows,
      matched: 0,
      warning: "Danh sach link san pham dang trong."
    };
  }

  if (settings.productCatalogMatchMode === "ai") {
    try {
      return await enrichRowsWithProductCatalogAi(rows, products, settings);
    } catch (error) {
      const fallback = enrichRowsWithProductCatalogManual(rows, products);
      return {
        ...fallback,
        warning: `AI so khop link bi loi, da dung so khop thu cong: ${error.message}`
      };
    }
  }

  return enrichRowsWithProductCatalogManual(rows, products);
}

function isHttpLink(value) {
  return /^https?:\/\//i.test(clean(value));
}

function normalizeWebLink(value) {
  const text = clean(value);
  if (!isHttpLink(text)) {
    return "";
  }

  try {
    const url = new URL(text);
    return url.toString();
  } catch {
    return "";
  }
}

async function isReachableWebLink(value) {
  const url = normalizeWebLink(value);
  if (!url) {
    return false;
  }

  if (webLinkReachabilityCache.has(url)) {
    return webLinkReachabilityCache.get(url);
  }

  const headers = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  };

  for (const method of ["HEAD", "GET"]) {
    try {
      const response = await fetch(url, {
        method,
        redirect: "follow",
        headers,
        signal: AbortSignal.timeout(7000)
      });

      if (response.status >= 200 && response.status < 400) {
        webLinkReachabilityCache.set(url, true);
        return true;
      }

      if (method === "HEAD" && [401, 403, 405, 429].includes(response.status)) {
        continue;
      }

      webLinkReachabilityCache.set(url, false);
      return false;
    } catch {
      if (method === "HEAD") {
        continue;
      }
      webLinkReachabilityCache.set(url, false);
      return false;
    }
  }

  webLinkReachabilityCache.set(url, false);
  return false;
}

async function stripBrokenWebLinks(rows = []) {
  let removed = 0;
  const nextRows = await Promise.all(
    rows.map(async (row) => {
      const link = clean(row.webLink);
      if (!link) {
        return row;
      }

      const reachable = await isReachableWebLink(link);
      if (reachable) {
        return {
          ...row,
          webLink: normalizeWebLink(link)
        };
      }

      removed += 1;
      return {
        ...row,
        webLink: ""
      };
    })
  );

  return { rows: nextRows, removed };
}

function needsWebLookup(row = {}) {
  const code = clean(row.productCode);
  if (!code || !isLikelyProductCode(code)) {
    return false;
  }

  const codeKey = normalizeLookupKey(code);
  const nameKey = normalizeLookupKey(row.productName);
  const missingName = !nameKey || nameKey === codeKey;
  const missingLink = !isHttpLink(row.webLink);
  return missingName || missingLink;
}

async function enrichRowsWithWebLookup({ client, model, rows, settings = {} }) {
  if (!client || !model || settings.webSearchEnabled !== true || !Array.isArray(rows) || !rows.length) {
    return rows;
  }

  const lookupCandidates = rows
    .filter(needsWebLookup)
    .map((row) => ({
      productCode: clean(row.productCode),
      supplier: clean(row.supplier),
      productName: clean(row.productName)
    }))
    .filter((row) => row.productCode);

  if (!lookupCandidates.length) {
    return rows;
  }

  const uniqueCandidates = [];
  const seenCodes = new Set();
  for (const candidate of lookupCandidates) {
    const key = normalizeLookupKey(candidate.productCode);
    if (!key || seenCodes.has(key)) {
      continue;
    }
    seenCodes.add(key);
    uniqueCandidates.push(candidate);
    if (uniqueCandidates.length >= 20) {
      break;
    }
  }

  const lookupInput = [
    "Tra cuu internet theo ma san pham va tra ve ten + link web.",
    "Chi tra JSON schema duoc yeu cau.",
    "Neu ten chua chac chan thi de productName rong, khong lap lai ma san pham.",
    "webLink chi dung URL da thay trong ket qua tim kiem, khong tu ghep URL tu ten/ma san pham.",
    "Neu khong chac chan link truy cap duoc thi de webLink rong.",
    "Khong gioi han vao website cai dat hay website nha cung cap.",
    "Danh sach can tra:",
    ...uniqueCandidates.map((item, index) => {
      const hint = item.productName ? ` | ten hien co: ${item.productName}` : "";
      const supplier = item.supplier ? ` | NCC: ${item.supplier}` : "";
      return `${index + 1}. ${item.productCode}${supplier}${hint}`;
    })
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.responses.create({
    model,
    input: lookupInput,
    tools: [{ type: "web_search" }],
    tool_choice: "auto",
    text: {
      format: {
        type: "json_schema",
        name: "product_lookup",
        strict: true,
        schema: productLookupSchema
      }
    }
  });

  const outputText = extractOutputText(response);
  const parsed = JSON.parse(outputText);
  const byCode = new Map();

  for (const item of parsed.rows || []) {
    const key = normalizeLookupKey(item.productCode);
    if (!key) {
      continue;
    }
    byCode.set(key, {
      productName: clean(item.productName),
      webLink: ""
    });
  }

  const aiRows = rows.map((row) => {
    const codeKey = normalizeLookupKey(row.productCode);
    const lookup = codeKey ? byCode.get(codeKey) : null;
    if (!lookup) {
      return row;
    }

    const existingNameKey = normalizeLookupKey(row.productName);
    const codeOnlyName = !existingNameKey || existingNameKey === codeKey;
    const lookupNameKey = normalizeLookupKey(lookup.productName);
    const lookupHasEvidence = hasCodeEvidence(row.productCode, lookup.productName, lookup.webLink);
    const nextName =
      codeOnlyName && lookupNameKey && lookupNameKey !== codeKey && lookupHasEvidence
        ? lookup.productName
        : clean(row.productName);
    return {
      ...row,
      productName: nextName,
      webLink: ""
    };
  });

  const catalogResult = await enrichRowsWithProductCatalog(aiRows, settings);
  return catalogResult.rows;
}

function applyKnownProductDetails(rows = []) {
  const knownByCode = new Map();

  for (const row of rows) {
    const code = clean(row.productCode);
    const codeKey = normalizeLookupKey(code);
    const name = clean(row.productName);
    const link = clean(row.webLink);
    const nameKey = normalizeLookupKey(name);

    if (!codeKey || !isLikelyProductCode(code) || !name || nameKey === codeKey) {
      continue;
    }

    if (!knownByCode.has(codeKey) && hasCodeEvidence(code, name, link)) {
      knownByCode.set(codeKey, {
        productName: name,
        webLink: isHttpLink(link) ? link : ""
      });
    }
  }

  if (!knownByCode.size) {
    return rows;
  }

  return rows.map((row) => {
    const code = clean(row.productCode);
    const codeKey = normalizeLookupKey(code);
    const known = knownByCode.get(codeKey);
    if (!known) {
      return row;
    }

    const nameKey = normalizeLookupKey(row.productName);
    const nextName = !nameKey || nameKey === codeKey ? known.productName : clean(row.productName);
    const nextLink = isHttpLink(row.webLink) ? clean(row.webLink) : known.webLink;

    return {
      ...row,
      productName: nextName,
      webLink: nextLink
    };
  });
}

function labeledFieldsFromChunk(text) {
  const fields = {};
  const segments = text
    .split(/[;|\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const match = segment.match(/^([^:=\-]{1,42})\s*[:=\-]\s*(.+)$/);
    if (!match) {
      continue;
    }

    const key = foldText(match[1]);
    const value = clean(match[2]);

    if ((key.includes("ma") && !key.includes("gia")) || key.includes("sku") || key.includes("code")) {
      fields.productCode = value;
    } else if (key.includes("ten") || key.includes("san pham") || key.includes("product")) {
      fields.productName = value;
    } else if (
      key.includes("gia ncc") ||
      key.includes("gia nhap") ||
      key === "nhap" ||
      key.includes("cost")
    ) {
      fields.purchasePrice = value;
    } else if (
      key.includes("gia min") ||
      key.includes("gia toi thieu") ||
      key.includes("gia thap nhat") ||
      key.includes("minimum price")
    ) {
      fields.minPrice = value;
    } else if (key.includes("gia ban") || key === "ban" || key.includes("sell")) {
      fields.salePrice = value;
    } else if (
      key.includes("kho ncc") ||
      key.includes("ton kho ncc") ||
      key.includes("ton kho") ||
      key.includes("inventory") ||
      key.includes("stock") ||
      key === "kho"
    ) {
      fields.supplierStock = value;
    } else if (
      key.includes("ncc") ||
      key.includes("nha cung cap") ||
      key.includes("supplier") ||
      key.includes("vendor")
    ) {
      fields.supplier = value;
    } else if (key.includes("link") || key.includes("url") || key.includes("web")) {
      fields.webLink = value;
    } else if (
      key.includes("ghi chu") ||
      key.includes("note") ||
      key.includes("qua tang") ||
      key.includes("tang kem") ||
      key.includes("dieu kien") ||
      key.includes("bao hanh") ||
      key.includes("combo")
    ) {
      fields.notes = value;
    }
  }

  return fields;
}

function isLikelyProductCode(value) {
  const text = clean(value);
  if (!text || /\s/.test(text)) {
    return false;
  }

  return /^(?=.*[0-9])(?=.*[A-Za-z])[A-Za-z0-9][A-Za-z0-9/_().-]{2,}$/.test(text);
}

function splitLeadingCode(value) {
  const text = clean(value);
  const match = text.match(/^([A-Za-z0-9][A-Za-z0-9/_().-]{2,})\s+(.+)$/);
  if (!match || !isLikelyProductCode(match[1])) {
    return { code: "", remainder: text };
  }

  return {
    code: match[1],
    remainder: clean(match[2])
  };
}

function splitTableCells(line) {
  const text = clean(line);
  if (!text) {
    return [];
  }

  if (text.includes("\t")) {
    return text.split(/\t+/).map(clean);
  }

  return text.split(/\s{2,}/).map(clean);
}

function isPriceCell(value) {
  const text = clean(value);
  return /^\d{1,3}([.,]\d{3})?$/.test(text) || /^\d{1,6}$/.test(text);
}

function isStockNote(value) {
  const text = foldText(value);
  return (
    /^\d+\s*c$/.test(text) ||
    /\bco\s*\d+\s*c\b/.test(text) ||
    /\bcon\s*\d+/.test(text) ||
    text.includes("con hang") ||
    text.includes("het hang") ||
    text.includes("dat truoc")
  );
}

function normalizeStock(value) {
  const text = clean(value);
  if (!text) {
    return "Còn nhiều";
  }

  const normalized = foldText(text);
  const pieceMatch = normalized.match(/(?:^|\b)(?:co|con)?\s*(\d+)\s*c\b/);
  if (pieceMatch) {
    return `Còn ${pieceMatch[1]} sản phẩm`;
  }

  return text;
}

function appendNote(...values) {
  return values
    .map(clean)
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join("; ");
}

function cleanSectionText(value) {
  return clean(value)
    .replace(/^['"]+/, "")
    .replace(/^✅\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSectionHeading(line) {
  const text = cleanSectionText(line);
  if (!text || !/^✅/u.test(clean(line).replace(/^['"]+/, "").trim())) {
    return null;
  }

  const parentheticalNotes = [...text.matchAll(/\(([^)]+)\)/g)]
    .map((match) => clean(match[1]))
    .filter(Boolean);
  const [namePart, dashNote] = text.split(/\s+-\s+/, 2);
  const name = clean((namePart || text).replace(/\([^)]*\)/g, ""));
  const note = appendNote(...parentheticalNotes, dashNote || "");

  return {
    name,
    note
  };
}

function parseSubheading(line) {
  const text = clean(line);
  if (!text.startsWith("***")) {
    return null;
  }

  const name = clean(text.replace(/^\*+/, ""));
  return name || "";
}

function parseLooseSectionHeading(line) {
  const text = cleanSectionText(line).replace(/^[?•\-–]+\s*/, "");
  if (!text || text.includes("\t") || text.includes(":") || isPriceCell(text) || isLikelyProductCode(text)) {
    return null;
  }

  const normalized = foldText(text);
  const categoryWords = [
    "hang moi",
    "dieu hoa",
    "tivi",
    "tv ",
    "may giat",
    "tu lanh",
    "tu quay",
    "may loc nuoc",
    "cay nong lanh",
    "noi chien",
    "bep",
    "quat",
    "say",
    "hut mui",
    "loa"
  ];

  if (!categoryWords.some((word) => normalized.includes(word))) {
    return null;
  }

  const parentheticalNotes = [...text.matchAll(/\(([^)]+)\)/g)]
    .map((match) => clean(match[1]))
    .filter(Boolean);
  const [namePart, dashNote] = text.split(/\s+-\s+/, 2);

  return {
    name: clean((namePart || text).replace(/\([^)]*\)/g, "")),
    note: appendNote(...parentheticalNotes, dashNote || "")
  };
}

function categoryContext(section, subsection) {
  return [section, subsection].map(clean).filter(Boolean).join(" - ");
}

function deriveProductIdentity(rawName, context) {
  const source = clean(rawName);
  const leading = splitLeadingCode(source);

  if (isLikelyProductCode(source)) {
    return {
      productCode: source,
      productName: context ? `${context} ${source}` : ""
    };
  }

  if (leading.code) {
    return {
      productCode: leading.code,
      productName: context ? `${context} ${source}` : source
    };
  }

  return {
    productCode: "",
    productName: source
  };
}

function supplierFromSettings(settings = {}) {
  const activeSupplierName = clean(settings.activeSupplier?.name);
  if (activeSupplierName) {
    return activeSupplierName;
  }

  return "";
}

function parseSupplierPriceTable(message, settings = {}) {
  const rows = [];
  let section = "";
  let sectionNote = "";
  let subsection = "";
  const supplier = supplierFromSettings(settings);

  for (const rawLine of message.split(/\r?\n/)) {
    const line = clean(rawLine);
    if (!line) {
      continue;
    }

    const heading = parseSectionHeading(line);
    if (heading) {
      section = heading.name;
      sectionNote = heading.note;
      subsection = "";
      continue;
    }

    const subheading = parseSubheading(line);
    if (subheading !== null) {
      subsection = subheading;
      continue;
    }

    const looseHeading = parseLooseSectionHeading(line);
    if (looseHeading) {
      section = looseHeading.name;
      sectionNote = looseHeading.note;
      subsection = "";
      continue;
    }

    const cells = splitTableCells(line).filter(Boolean);
    if (cells.length < 2 || !isPriceCell(cells[1])) {
      continue;
    }

    const context = categoryContext(section, subsection);
    const identity = deriveProductIdentity(cells[0], context);
    const noteCells = cells.slice(2);
    const stockNotes = noteCells.filter(isStockNote);
    const businessNotes = noteCells.filter((value) => !isStockNote(value));
    const notes = appendNote(sectionNote, ...businessNotes);

    rows.push(
      productFromStructuredRow({
        ...identity,
        purchasePrice: normalizePrice(cells[1], { assumeThousands: true }),
        minPrice: "",
        salePrice: "",
        webLink: "",
        supplier,
        supplierStock: stockNotes.length ? stockNotes.map(normalizeStock).join("; ") : "Còn nhiều",
        notes
      })
    );
  }

  return rows;
}

function fallbackNormalize(message, settings = {}) {
  const supplierTableRows = parseSupplierPriceTable(message, settings);
  if (supplierTableRows.length) {
    return {
      reply: `Mình đã tách được ${supplierTableRows.length} dòng từ bảng giá nhà cung cấp.`,
      rows: supplierTableRows
    };
  }

  const lines = message
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const chunks = lines.length > 1 ? lines : [message];
  const rows = chunks.map((chunk) => {
    const labeledFields = labeledFieldsFromChunk(chunk);
    const parts = chunk
      .split(/[;|]/)
      .map((part) => part.trim())
      .filter(Boolean);
    const link =
      labeledFields.webLink ||
      chunk.match(/https?:\/\/\S+/i)?.[0]?.replace(/[),.;]+$/, "") ||
      "";
    const productCode =
      labeledFields.productCode ||
      parts.find((part) => /^[A-Z0-9_-]{3,}$/i.test(part)) ||
      "";
    const productName =
      labeledFields.productName ||
      parts.find((part) => !part.includes(":") && !part.includes("http") && part !== productCode) ||
      "";
    const purchasePrice = normalizePrice(labeledFields.purchasePrice);
    const minPrice = normalizePrice(labeledFields.minPrice);
    const salePrice = normalizePrice(labeledFields.salePrice);
    const supplier = labeledFields.supplier || supplierFromSettings(settings);
    const supplierStock = normalizeStock(labeledFields.supplierStock);
    const notes = labeledFields.notes || "";

    return productFromStructuredRow({
      productCode,
      productName,
      purchasePrice,
      minPrice,
      salePrice,
      webLink: link,
      supplier,
      supplierStock,
      notes
    });
  });

  return {
    reply: `Mình đã tách được ${rows.length} dòng sản phẩm bằng chế độ cục bộ.`,
    rows
  };
}

function buildInstructions(settings = {}) {
  const role = clean(settings.role) || "Trợ lý nhập liệu sản phẩm cho đội mua hàng.";
  const rules =
    clean(settings.rules) ||
    "Giữ nguyên dữ liệu chắc chắn, không tự bịa. Nếu thiếu thông tin, để trống ô tương ứng.";
  const currency = clean(settings.currency) || "VND";
  const columnRuleLines = buildColumnRuleLines(settings.columnRules);
  const webSearchEnabled = settings.webSearchEnabled === true;
  const activeSupplierName = clean(settings.activeSupplier?.name);
  const supplierWorkflowRule = clean(settings.activeSupplier?.workflowRule);
  const supplierGiftRule = clean(settings.activeSupplier?.giftRule);

  const instructions = [
    role,
    "Nhiệm vụ: đọc dữ liệu thô từ chat và chuẩn hóa thành bảng sản phẩm.",
    "Chỉ trả về dữ liệu theo JSON schema đã yêu cầu.",
    "Cột cần xuất: productCode, productName, purchasePrice, minPrice, salePrice, webLink, supplier, supplierStock, notes.",
    "Đầu vào có thể là bảng giá Excel thô của nhà cung cấp: tiêu đề nhóm bắt đầu bằng ✅, dòng phân cách hoặc tiểu mục bắt đầu bằng ***, dòng sản phẩm thường có mã/tên ở cột 1 và giá ở cột 2.",
    "Không tạo dòng sản phẩm từ tiêu đề nhóm, dòng trống hoặc dòng chỉ có ***. Dùng tiêu đề nhóm và tiểu mục làm ngữ cảnh để hiểu ngành hàng, thương hiệu, ghi chú.",
    "Với bảng giá nhà cung cấp, cột giá thứ 2 là Giá NCC. Giá dạng 4,250 hoặc 250 hiểu là đơn vị nghìn VND, tương ứng 4.250.000 đ hoặc 250.000 đ. Giá min chỉ điền khi dữ liệu ghi rõ giá tối thiểu/giá min; nếu không có thì để trống.",
    "Các ô như quà, XK -100K, Xuất kích, tháng 7 kích, bảo hành, tặng kèm, âm trần đưa vào notes. Các ô như 1c, 2c, Có 1c, còn 12, hết hàng đưa vào supplierStock.",
    "Nếu người dùng đã chọn nhà cung cấp trước khi nhập dữ liệu, mọi dòng trong tin nhắn thuộc nhà cung cấp đó trừ khi dòng ghi rõ nhà cung cấp khác.",
    activeSupplierName ? `Nhà cung cấp đang chọn: ${activeSupplierName}.` : "",
    supplierWorkflowRule ? `Quy trình NCC riêng cho ${activeSupplierName || "NCC này"}: ${supplierWorkflowRule}` : "",
    supplierGiftRule ? `Quy tắc quà tặng riêng cho ${activeSupplierName || "NCC này"}: ${supplierGiftRule}` : "",
    `Quy tắc riêng: ${rules}`,
    `Đơn vị tiền ưu tiên: ${currency}.`,
    columnRuleLines.length ? `Quy tắc theo từng cột:\n${columnRuleLines.join("\n")}` : "",
    "Khong tu suy doan gia tri qua tang/khuyen mai tu ma nhu XK50, FT75 neu quy tac qua tang cua NCC chua khai bao ro.",
    "Neu gap ma qua tang chua khai bao, giu nguyen ma do trong notes; khong chuyen thanh giam tien, khong cong/tru vao gia.",
    webSearchEnabled
      ? "Được phép dùng web search khi dữ liệu đầu vào thiếu thông tin và quy tắc cột yêu cầu tra cứu."
      : "Không dùng web search; nếu thiếu dữ liệu thì để trống hoặc ghi theo đúng quy tắc cột.",
    "Voi Link web: khong tu tra Internet va khong tu tao link. De webLink trong; he thong se lay link tu JSON Nguon link san pham. Neu JSON khong co san pham tuong ung thi de trong.",
    "Với Kho NCC: nếu ô tồn kho trống thì ghi 'Còn nhiều'. Nếu ghi 1c, 2c hoặc Có 1c thì hiểu là còn 1 sản phẩm, 2 sản phẩm.",
    "Với Ghi chú: ghi quà tặng kèm, điều kiện mua, điều kiện giá, combo, bảo hành hoặc lưu ý đặc biệt; không dùng cột này để ghi lỗi kỹ thuật.",
    "Khong ghi nguon web, gia thi truong hoac link tham khao vao notes.",
    "Nếu người dùng đưa nhiều sản phẩm trong một tin nhắn, tạo nhiều dòng.",
    "Không thêm sản phẩm không có trong dữ liệu người dùng."
  ];

  return instructions.filter(Boolean).join("\n");
}

function extractOutputText(response) {
  if (response.output_text) {
    return response.output_text;
  }

  const chunks = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("");
}

function extractGeminiOutputText(response) {
  const parts = [];

  for (const candidate of response.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.text) {
        parts.push(part.text);
      }
    }
  }

  return parts.join("");
}

function isJsonFormatError(error) {
  return (
    error instanceof SyntaxError ||
    /json|unterminated string|unexpected token|unexpected end|bad control character/i.test(
      String(error?.message || "")
    )
  );
}

function withRetryInstruction(message, attempt) {
  if (attempt === 0) {
    return message;
  }

  return [
    message,
    "",
    "Luu y: lan goi lai vi lan truoc tra JSON loi. Chi tra JSON hop le theo schema, khong them giai thich ngoai JSON."
  ].join("\n");
}

function splitMessageForApi(message) {
  const maxChars = 6500;
  const text = clean(message);
  if (text.length <= maxChars) {
    return [text];
  }

  const chunks = [];
  const lines = text.split(/\r?\n/);
  let current = "";
  let context = "";

  for (const line of lines) {
    const trimmed = clean(line);
    if (/^(✅|\*\*\*)/u.test(trimmed)) {
      context = line;
    }

    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxChars && current) {
      chunks.push(current);
      current = context && context !== line ? `${context}\n${line}` : line;
    } else {
      current = next;
    }
  }

  if (current.trim()) {
    chunks.push(current);
  }

  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxChars * 1.2) {
      return [chunk];
    }

    const parts = [];
    for (let index = 0; index < chunk.length; index += maxChars) {
      parts.push(chunk.slice(index, index + maxChars));
    }
    return parts;
  });
}

async function normalizeWithOpenAI(message, settings, images = [], config = runtimeConfig) {
  const openai = getOpenAIClient(getProviderKey("openai", "", config));

  if (!openai) {
    throw new Error("Chua co OpenAI API key.");
    return {
      ...fallbackNormalize(message, settings),
      warning: "Chưa có OPENAI_API_KEY, đang dùng chế độ cục bộ."
    };
  }

  const request = {
    model: getRuntimeModel("openai", config),
    instructions: buildInstructions(settings),
    input: buildResponsesInput(message, images),
    text: {
      format: {
        type: "json_schema",
        name: "product_normalization",
        strict: true,
        schema: productSchema
      }
    }
  };

  if (settings.webSearchEnabled === true) {
    request.tools = [{ type: "web_search" }];
    request.tool_choice = "auto";
  }

  const response = await openai.responses.create(request);

  const outputText = extractOutputText(response);
  const parsed = JSON.parse(outputText);
  let rows = (parsed.rows || []).map(productFromStructuredRow);

  if (settings.webSearchEnabled === true) {
    try {
      rows = await enrichRowsWithWebLookup({
        client: openai,
        model: getRuntimeModel("openai", config),
        rows,
        settings
      });
    } catch {
      // Keep normalized rows even if lookup enrichment fails.
    }
  }

  return {
    reply: clean(parsed.reply) || "Đã chuẩn hóa dữ liệu.",
    rows
  };
}

async function listGeminiModels(apiKey) {
  const modelIds = [];
  let nextPageToken = "";

  do {
    const endpoint = new URL("https://generativelanguage.googleapis.com/v1beta/models");
    endpoint.searchParams.set("key", apiKey);
    endpoint.searchParams.set("pageSize", "1000");
    if (nextPageToken) {
      endpoint.searchParams.set("pageToken", nextPageToken);
    }

    const response = await fetch(endpoint, {
      headers: { "Content-Type": "application/json" }
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error?.message || "KhĂ´ng quĂ©t Ä‘Æ°á»£c model Gemini.");
    }

    for (const model of payload.models || []) {
      if (!(model.supportedGenerationMethods || []).includes("generateContent")) {
        continue;
      }

      const modelId = clean(model.baseModelId || model.name).replace(/^models\//, "");
      if (modelId) {
        modelIds.push(modelId);
      }
    }

    nextPageToken = clean(payload.nextPageToken);
  } while (nextPageToken);

  return [...new Set(modelIds)].sort((a, b) => a.localeCompare(b));
}

async function normalizeWithGemini(message, settings, images = [], config = runtimeConfig) {
  const apiKey = getProviderKey("gemini", "", config);

  if (!apiKey) {
    throw new Error("Chua co Gemini API key.");
    return {
      ...fallbackNormalize(message, settings),
      warning: "ChÆ°a cĂ³ GEMINI_API_KEY, Ä‘ang dĂ¹ng cháº¿ Ä‘á»™ cá»¥c bá»™."
    };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    getRuntimeModel("gemini", config)
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: buildInstructions(settings) }]
      },
      contents: [
        {
          role: "user",
          parts: buildGeminiParts(message, images)
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: geminiProductSchema
      }
    })
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || "Gemini API lá»—i.");
  }

  const outputText = extractGeminiOutputText(payload);
  const parsed = JSON.parse(outputText);

  return {
    reply: clean(parsed.reply) || "ÄĂ£ chuáº©n hĂ³a dá»¯ liá»‡u.",
    rows: (parsed.rows || []).map(productFromStructuredRow),
    warning:
      settings.webSearchEnabled === true
        ? "Gemini Ä‘ang cháº¡y khĂ´ng kĂ¨m web search tá»± Ä‘á»™ng; AI Æ°u tiĂªn dá»¯ liá»‡u anh nháº­p vĂ  quy táº¯c Ä‘Ă£ cĂ i."
        : ""
  };
}

async function normalizeWithGrok(message, settings, images = [], config = runtimeConfig) {
  const grok = getGrokClient(getProviderKey("grok", "", config));

  if (!grok) {
    throw new Error("Chua co xAI API key.");
    return {
      ...fallbackNormalize(message, settings),
      warning: "Chua co XAI_API_KEY, dang dung che do cuc bo."
    };
  }

  const request = {
    model: getRuntimeModel("grok", config),
    instructions: buildInstructions(settings),
    input: buildResponsesInput(message, images),
    text: {
      format: {
        type: "json_schema",
        name: "product_normalization",
        strict: true,
        schema: productSchema
      }
    }
  };

  if (settings.webSearchEnabled === true) {
    request.tools = [{ type: "web_search" }];
    request.tool_choice = "auto";
  }

  const response = await grok.responses.create(request);
  const outputText = extractOutputText(response);
  const parsed = JSON.parse(outputText);
  let rows = (parsed.rows || []).map(productFromStructuredRow);

  if (settings.webSearchEnabled === true) {
    try {
      rows = await enrichRowsWithWebLookup({
        client: grok,
        model: getRuntimeModel("grok", config),
        rows,
        settings
      });
    } catch {
      // Keep normalized rows even if lookup enrichment fails.
    }
  }

  return {
    reply: clean(parsed.reply) || "Da chuan hoa du lieu.",
    rows
  };
}

async function normalizeProviderOnce(provider, message, settings, images = [], config = runtimeConfig) {
  if (provider === "gemini") {
    return normalizeWithGemini(message, settings, images, config);
  }

  if (provider === "grok") {
    return normalizeWithGrok(message, settings, images, config);
  }

  return normalizeWithOpenAI(message, settings, images, config);
}

async function normalizeProviderWithRetries(provider, message, settings, images = [], config = runtimeConfig) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await normalizeProviderOnce(provider, withRetryInstruction(message, attempt), settings, images, config);
    } catch (error) {
      lastError = error;
      if (!isJsonFormatError(error) || attempt === 2) {
        throw error;
      }
    }
  }

  throw lastError;
}

async function normalizeChunkedWithProvider(provider, message, settings, images = [], config = runtimeConfig) {
  if (images.length) {
    return normalizeProviderWithRetries(provider, message, settings, images, config);
  }

  const chunks = splitMessageForApi(message);
  if (chunks.length === 1) {
    return normalizeProviderWithRetries(provider, message, settings, [], config);
  }

  const rows = [];
  const warnings = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const result = await normalizeProviderWithRetries(provider, chunks[index], settings, [], config);
    rows.push(...(result.rows || []));
    if (result.warning) {
      warnings.push(result.warning);
    }
  }

  return {
    reply: `Da chuan hoa ${rows.length} dong tu ${chunks.length} phan du lieu.`,
    rows,
    warning: warnings.filter(Boolean).join(" ")
  };
}

function buildConfigResponse(shopId = "admin") {
  const config = getRuntimeForShop(shopId);
  const sheetId = config.sheets?.sheetId || "";
  const sheetTab = config.sheets?.sheetTab || "Products";
  const sheetUrl = sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=0` : "";

  return {
    provider: config.provider,
    providerLabel: providerMeta(config.provider).label,
    providerConfigured: providerConfigured(config.provider, config),
    openaiConfigured: Boolean(config.apiKeys?.openai),
    geminiConfigured: Boolean(config.apiKeys?.gemini),
    grokConfigured: Boolean(config.apiKeys?.grok),
    sheetsConfigured: isSheetsConfigured(config),
    sheetId,
    sheetTab,
    sheetUrl,
    sheetServiceAccountEmail: config.sheets?.serviceAccountEmail || "",
    sheetPrivateKey: config.sheets?.privateKey || "",
    defaultProductCatalogUrl: DEFAULT_PRODUCT_CATALOG_URL,
    model: getRuntimeModel(config.provider, config),
    modelOptions: configuredModelOptions(config.provider, [], config),
    providers: Object.entries(PROVIDERS).map(([id, meta]) => ({
      id,
      label: meta.label
    }))
  };
}

async function readProducts(req) {
  const shopId = requestShopId(req);
  const shopConfig = getRuntimeForShop(shopId);
  const settings = getAppSettingsForShop(shopId) || {};
  if (!isSheetsConfigured(shopConfig)) {
    const localRows = await readLocalProducts(shopId);
    const catalogResult = await enrichRowsWithProductCatalog(applyKnownProductDetails(localRows), settings);
    const rows = visibleLocalProductsWithRowIds(catalogResult.rows);
    const linkCheck = await stripBrokenWebLinks(rows);
    return {
      source: "local",
      rows: linkCheck.rows,
      warning: [
        catalogResult.warning,
        linkCheck.removed ? `Da an ${linkCheck.removed} link web khong truy cap duoc.` : ""
      ]
        .filter(Boolean)
        .join(" ")
    };
  }

  try {
    const catalogResult = await enrichRowsWithProductCatalog(sanitizeProductRows(await readSheetProducts(shopConfig)), settings);
    const linkCheck = await stripBrokenWebLinks(catalogResult.rows);
    return {
      source: "google-sheets",
      rows: linkCheck.rows,
      warning: [
        catalogResult.warning,
        linkCheck.removed ? `Da an ${linkCheck.removed} link web khong truy cap duoc.` : ""
      ]
        .filter(Boolean)
        .join(" ")
    };
  } catch (error) {
    const localRows = await readLocalProducts(shopId);
    const catalogResult = await enrichRowsWithProductCatalog(applyKnownProductDetails(localRows), settings);
    const rows = visibleLocalProductsWithRowIds(catalogResult.rows);
    const linkCheck = await stripBrokenWebLinks(rows);
    return {
      source: "local",
      rows: linkCheck.rows,
      warning: [
        `Không đọc được Google Sheets: ${error.message}`,
        linkCheck.removed ? `Da an ${linkCheck.removed} link web khong truy cap duoc.` : ""
      ]
        .filter(Boolean)
        .join(" ")
    };
  }
}

async function appendProducts(products, settings = {}, req) {
  const shopId = requestShopId(req);
  const shopConfig = getRuntimeForShop(shopId);
  const catalogResult = await enrichRowsWithProductCatalog(sanitizeProductRows(products), settings);
  const safeProducts = sanitizeProductRows(catalogResult.rows);
  if (!safeProducts.length) {
    return "none";
  }

  if (!isSheetsConfigured(shopConfig)) {
    await appendLocalProducts(safeProducts, shopId);
    return "local";
  }

  try {
    await appendSheetProducts(safeProducts, shopConfig);
    return "google-sheets";
  } catch (error) {
    throw new Error(`Không ghi được Google Sheets: ${error.message}`);
  }
}

function getLookupClient(provider, config = runtimeConfig) {
  const normalizedProvider = normalizeProvider(provider);

  if (normalizedProvider === "grok") {
    const grok = getGrokClient(getProviderKey("grok", "", config));
    if (grok) {
      return { client: grok, model: getRuntimeModel("grok", config) };
    }
  }

  const openai = getOpenAIClient(getProviderKey("openai", "", config));
  if (openai) {
    return { client: openai, model: getRuntimeModel("openai", config) };
  }

  const grok = getGrokClient(getProviderKey("grok", "", config));
  if (grok) {
    return { client: grok, model: getRuntimeModel("grok", config) };
  }

  return { client: null, model: "" };
}

async function enrichStoredProducts(settings = {}, req) {
  const shopId = requestShopId(req);
  const shopConfig = getRuntimeForShop(shopId);
  const currentRows = await readLocalProducts(shopId);
  let catalogResult = await enrichRowsWithProductCatalog(applyKnownProductDetails(currentRows), settings);
  let nextRows = catalogResult.rows;

  if (!nextRows.some(needsWebLookup)) {
    let updated = 0;
    for (let index = 0; index < currentRows.length; index += 1) {
      const before = currentRows[index] || {};
      const after = nextRows[index] || {};
      if (before.productName !== after.productName || before.webLink !== after.webLink) {
        updated += 1;
      }
    }

    if (updated > 0) {
      await writeLocalProducts(nextRows, shopId);
    }

    return { rows: nextRows, updated, warning: "" };
  }

  const { client, model } = getLookupClient(settings.provider || shopConfig.provider, shopConfig);
  if (!client || !model) {
    return {
      rows: nextRows,
      updated: 0,
      warning: "Chua co OpenAI/Grok API key de tra Internet."
    };
  }

  nextRows = await enrichRowsWithWebLookup({
    client,
    model,
    rows: nextRows,
    settings: {
      ...settings,
      webSearchEnabled: true
    }
  });
  catalogResult = await enrichRowsWithProductCatalog(applyKnownProductDetails(nextRows), settings);
  nextRows = catalogResult.rows;

  let updated = 0;
  for (let index = 0; index < currentRows.length; index += 1) {
    const before = currentRows[index] || {};
    const after = nextRows[index] || {};
    if (before.productName !== after.productName || before.webLink !== after.webLink) {
      updated += 1;
    }
  }

  if (updated > 0) {
    await writeLocalProducts(nextRows, shopId);
  }

  return { rows: nextRows, updated, warning: "" };
}

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const username = clean(req.body?.username).toLowerCase();
    const password = String(req.body?.password || "");
    const accounts = await readAccounts();
    const account = accounts.find((item) => clean(item.username).toLowerCase() === username);

    if (!account || account.active === false || !verifyPassword(password, account.passwordHash)) {
      res.status(401).json({ error: "Sai ten dang nhap hoac mat khau." });
      return;
    }

    const token = `${randomUUID()}-${randomBytes(16).toString("hex")}`;
    const safeAccount = publicAccount(account);
    sessions.set(token, {
      token,
      account: safeAccount,
      createdAt: Date.now()
    });

    res.json({ token, account: safeAccount });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ account: req.user });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  sessions.delete(req.sessionToken);
  res.json({ ok: true });
});

app.get("/api/accounts", requireAccountManager, async (req, res, next) => {
  try {
    const accounts = await readAccounts();
    res.json({ accounts: accountsForManager(accounts, req.user).map(publicAccount) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/accounts", requireAccountManager, async (req, res, next) => {
  try {
    const username = clean(req.body?.username).toLowerCase();
    const displayName = clean(req.body?.displayName) || username;
    const role = req.user.role === "admin" ? "shop" : "user";
    const password = String(req.body?.password || "");

    if (!username || username.length < 3) {
      res.status(400).json({ error: "Ten dang nhap can it nhat 3 ky tu." });
      return;
    }

    if (!password || password.length < 6) {
      res.status(400).json({ error: "Mat khau can it nhat 6 ky tu." });
      return;
    }

    const accounts = await readAccounts();
    if (accounts.some((account) => clean(account.username).toLowerCase() === username)) {
      res.status(409).json({ error: "Ten dang nhap da ton tai." });
      return;
    }

    const now = new Date().toISOString();
    const accountId = randomUUID();
    const account = {
      id: accountId,
      username,
      displayName,
      role,
      shopId: role === "shop" ? accountId : clean(req.user.shopId || req.user.id),
      shopName: role === "shop" ? displayName : clean(req.user.shopName || req.user.displayName || req.user.username),
      active: req.body?.active !== false,
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now
    };
    accounts.push(account);
    if (role === "shop") {
      runtimeConfig.shopConfigs = runtimeConfig.shopConfigs || {};
      runtimeConfig.shopConfigs[safeShopId(accountId)] = blankShopRuntimeConfig();
      await ensureLocalStore(accountId);
      await saveRuntimeConfig();
    }
    await writeAccounts(accounts);
    res.status(201).json({ account: publicAccount(account) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/accounts/:accountId", requireAccountManager, async (req, res, next) => {
  try {
    const accountId = clean(req.params.accountId);
    const accounts = await readAccounts();
    const index = accounts.findIndex((account) => account.id === accountId);
    if (index === -1) {
      res.status(404).json({ error: "Khong tim thay tai khoan." });
      return;
    }

    const current = accounts[index];
    if (!canManageTargetAccount(req.user, current)) {
      res.status(403).json({ error: "Khong co quyen sua tai khoan nay." });
      return;
    }
    const username = clean(req.body?.username).toLowerCase();
    const displayName = clean(req.body?.displayName) || username || current.displayName;
    const role = current.role;
    const active = req.body?.active !== false;
    const password = String(req.body?.password || "");

    if (!username || username.length < 3) {
      res.status(400).json({ error: "Ten dang nhap can it nhat 3 ky tu." });
      return;
    }

    if (
      accounts.some(
        (account) => account.id !== accountId && clean(account.username).toLowerCase() === username
      )
    ) {
      res.status(409).json({ error: "Ten dang nhap da ton tai." });
      return;
    }

    accounts[index] = {
      ...current,
      username,
      displayName,
      role,
      shopId: current.shopId,
      shopName: role === "shop" ? displayName : current.shopName,
      active,
      passwordHash: password ? hashPassword(password) : current.passwordHash,
      updatedAt: new Date().toISOString()
    };

    await writeAccounts(accounts);
    res.json({ account: publicAccount(accounts[index]) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/accounts/:accountId", requireAccountManager, async (req, res, next) => {
  try {
    const accountId = clean(req.params.accountId);
    const accounts = await readAccounts();
    const target = accounts.find((account) => account.id === accountId);
    if (!target) {
      res.status(404).json({ error: "Khong tim thay tai khoan." });
      return;
    }

    if (!canManageTargetAccount(req.user, target)) {
      res.status(403).json({ error: "Khong co quyen xoa tai khoan nay." });
      return;
    }

    const remainingAdmins = accounts.filter(
      (account) => account.id !== accountId && account.role === "admin" && account.active !== false
    ).length;
    if (target.role === "admin" && remainingAdmins === 0) {
      res.status(400).json({ error: "Can giu lai it nhat 1 tai khoan admin dang hoat dong." });
      return;
    }

    const deletedShopId = target.role === "shop" ? clean(target.shopId || target.id) : "";
    if (deletedShopId) {
      delete runtimeConfig.shopConfigs?.[safeShopId(deletedShopId)];
      await saveRuntimeConfig();
    }
    await writeAccounts(
      accounts.filter((account) => {
        if (account.id === accountId) {
          return false;
        }

        return !deletedShopId || account.shopId !== deletedShopId;
      })
    );
    if (req.user?.id === accountId) {
      sessions.delete(req.sessionToken);
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use("/api", requireAuth);

app.get("/api/config", (req, res) => {
  res.json(buildConfigResponse(requestShopId(req)));
});

app.get("/api/settings", (req, res) => {
  res.json(buildConfigResponse(requestShopId(req)));
});

app.get("/api/app-settings", (req, res) => {
  res.json({ settings: getAppSettingsForShop(requestShopId(req)) || null });
});

app.put("/api/app-settings", async (req, res, next) => {
  try {
    const settings = req.body?.settings;
    const shopId = requestShopId(req);
    setAppSettingsForShop(shopId, settings);
    await saveRuntimeConfig();
    res.json({ settings: getAppSettingsForShop(shopId) || null });
  } catch (error) {
    next(error);
  }
});

app.post("/api/settings", async (req, res, next) => {
  try {
    const shopId = requestShopId(req);
    const config = getRuntimeForShop(shopId);
    const provider = normalizeProvider(req.body?.provider || config.provider);
    const apiKey = clean(req.body?.apiKey);
    const model = clean(req.body?.model);
    const sheetId = clean(req.body?.sheetId);
    const sheetTab = clean(req.body?.sheetTab) || "Products";
    const sheetServiceAccountEmail = clean(req.body?.sheetServiceAccountEmail);
    const sheetPrivateKey = String(req.body?.sheetPrivateKey ?? "");

    config.provider = provider;

    if (apiKey) {
      if (provider === "gemini") {
        config.apiKeys.gemini = apiKey;
      } else if (provider === "grok") {
        config.apiKeys.grok = apiKey;
      } else {
        config.apiKeys.openai = apiKey;
      }
    }

    if (model) {
      config.models[provider] = model;
    }

    config.sheets.sheetId = sheetId;
    config.sheets.sheetTab = sheetTab;
    config.sheets.serviceAccountEmail = sheetServiceAccountEmail;
    config.sheets.privateKey = sheetPrivateKey;

    if (isSheetsConfigured(config)) {
      try {
        await readSheetProducts(config);
      } catch (error) {
        res.status(400).json({
          error: `Không kết nối được Google Sheets: ${error.message}`
        });
        return;
      }
    }

    await saveRuntimeConfig();
    res.json(buildConfigResponse(shopId));
  } catch (error) {
    next(error);
  }
});

app.post("/api/models/scan", async (req, res, next) => {
  const shopConfig = getRuntimeForShop(requestShopId(req));
  const provider = normalizeProvider(req.body?.provider || shopConfig.provider);
  try {
    const apiKey = getProviderKey(provider, req.body?.apiKey, shopConfig);
    let modelIds = [];

    if (!apiKey) {
      res.status(400).json({
        error:
          provider === "gemini"
            ? "Vui l?ng nh?p Gemini API key tr??c khi qu?t m? h?nh."
            : provider === "grok"
              ? "Vui long nhap xAI API key truoc khi quet mo hinh."
            : "Vui l?ng nh?p OpenAI API key tr??c khi qu?t m? h?nh."
      });
      return;
    }

    if (provider === "gemini") {
      modelIds = await listGeminiModels(apiKey);
    } else if (provider === "grok") {
      const grok = getGrokClient(apiKey);
      const response = await grok.models.list();
      modelIds = (response.data || []).map((model) => model.id).filter(Boolean).sort((a, b) => a.localeCompare(b));
    } else {
      const openai = getOpenAIClient(apiKey);
      const response = await openai.models.list();
      modelIds = (response.data || [])
        .map((model) => model.id)
        .filter((id) => /^gpt-|^o[0-9]|^chatgpt-/i.test(id))
        .sort((a, b) => a.localeCompare(b));
    }

    const modelOptions = configuredModelOptions(provider, modelIds, shopConfig);
    res.json({ modelOptions });
  } catch (error) {
    res.status(Number(error?.status || 500)).json({
      error: humanizeProviderError(provider, error, "Khong quet duoc mo hinh.")
    });
  }
});

app.get("/api/products", async (req, res, next) => {
  try {
    res.json(await readProducts(req));
  } catch (error) {
    next(error);
  }
});

app.post("/api/products/enrich", async (req, res, next) => {
  try {
    if (isSheetsConfigured(getRuntimeForShop(requestShopId(req)))) {
      res.json({
        ...(await readProducts(req)),
        updated: 0,
        warning: "Lam giau ten/link tu dong hien dang ap dung cho bang cuc bo."
      });
      return;
    }

    const result = await enrichStoredProducts(req.body?.settings || getAppSettingsForShop(requestShopId(req)), req);
    res.json({
      source: "local",
      rows: visibleLocalProductsWithRowIds(result.rows),
      updated: result.updated,
      warning: result.warning
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/products/recalculate", async (req, res, next) => {
  try {
    const settings = req.body?.settings || {};

    if (isSheetsConfigured(getRuntimeForShop(requestShopId(req)))) {
      res.json({
        ...(await readProducts(req)),
        updated: 0,
        warning: "Tinh lai theo cai dat hien chi ap dung cho bang cuc bo."
      });
      return;
    }

    const shopId = requestShopId(req);
    const result = await enqueueShopStoreWrite(shopId, async () => {
      const current = await readLocalProducts(shopId);
      const catalogResult = await enrichRowsWithProductCatalog(recalculateProductsWithSettings(current, settings), settings);
      const next = catalogResult.rows;
      const changed = JSON.stringify(sanitizeProductRows(current)) !== JSON.stringify(next);
      if (changed) {
        await writeLocalProducts(next, shopId);
      }

      return {
        rows: visibleLocalProductsWithRowIds(next),
        updated: changed ? next.length : 0
      };
    });

    res.json({
      source: "local",
      rows: result.rows,
      updated: result.updated,
      warning: result.updated ? "Da cap nhat bang cuc bo theo cai dat moi." : ""
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/products", async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? sanitizeProductRows(req.body.rows) : [];
    const source = await appendProducts(rows, req.body?.settings || getAppSettingsForShop(requestShopId(req)) || {}, req);
    res.json({ source, rows });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/products/batch/:batchId", async (req, res, next) => {
  try {
    const batchId = clean(req.params.batchId);
    if (!batchId) {
      res.status(400).json({ error: "Thiếu mã lần nhập cần hoàn tác." });
      return;
    }

    if (isSheetsConfigured(getRuntimeForShop(requestShopId(req)))) {
      res.status(501).json({
        error:
          "Hoàn tác tự động hiện hỗ trợ bảng cục bộ. Nếu dùng Google Sheets, hãy xóa các dòng vừa thêm trực tiếp trong sheet."
      });
      return;
    }

    const removed = await deleteLocalBatch(batchId, requestShopId(req));
    res.json({ removed });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/products/row/:rowId", async (req, res, next) => {
  try {
    if (isSheetsConfigured(getRuntimeForShop(requestShopId(req)))) {
      res.status(400).json({ error: "Xoa tung dong hien chi ap dung cho bang cuc bo." });
      return;
    }

    const removed = await deleteLocalRow(req.params.rowId, requestShopId(req));
    if (!removed) {
      res.status(404).json({ error: "Khong tim thay dong can xoa." });
      return;
    }

    res.json({ removed });
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat", async (req, res, next) => {
  try {
    const message = clean(req.body?.message);
    const images = cleanImageInputs(req.body?.images);
    const shopConfig = getRuntimeForShop(requestShopId(req));
    const settings = req.body?.settings || getAppSettingsForShop(requestShopId(req)) || {};
    const provider = normalizeProvider(settings.provider || shopConfig.provider);

    if (!message && !images.length) {
      res.status(400).json({ error: "Vui long nhap du lieu san pham hoac dinh kem anh." });
      return;
    }

    if (imagePayloadSize(images) > 20 * 1024 * 1024) {
      res.status(413).json({ error: "Anh dinh kem qua lon. Vui long gui it anh hon hoac anh nhe hon." });
      return;
    }

    let result;
    try {
      result = await normalizeChunkedWithProvider(provider, message, settings, images, shopConfig);
    } catch (error) {
      const providerLabel = providerMeta(provider).label;
      const messageText = isJsonFormatError(error)
        ? `${providerLabel} tra ve JSON loi sau 3 lan thu. Xin thu lai sau hoac doi sang model manh hon.`
        : humanizeProviderError(provider, error, `${providerLabel} API loi. Xin thu lai sau.`);
      res.status(502).json({ error: messageText });
      return;
    }

    const batchId = randomUUID();
    const createdAt = new Date().toISOString();
    const activeSupplierName = supplierFromSettings(settings);
    let rows = sanitizeProductRows((result.rows || []).map((row) =>
      productFromStructuredRow({
        ...row,
        supplier: activeSupplierName || row.supplier,
        batchId,
        createdAt
      })
    ));
    rows = applySalePriceVisibility(rows, settings);
    const catalogResult = await enrichRowsWithProductCatalog(rows, settings);
    rows = catalogResult.rows;
    const linkCheck = await stripBrokenWebLinks(rows);
    rows = linkCheck.rows;
    const shouldAutoAdd = settings.autoAdd !== false;
    const source = shouldAutoAdd ? await appendProducts(rows, settings, req) : "not-saved";
    const undoable = shouldAutoAdd && source !== "google-sheets";
    const linkWarning = linkCheck.removed
      ? `Da bo ${linkCheck.removed} link web khong truy cap duoc.`
      : "";
    const warning = [result.warning, catalogResult.warning, linkWarning].filter(Boolean).join(" ");

    res.json({
      reply: result.reply,
      rows,
      batchId: undoable ? batchId : "",
      source,
      warning:
        warning ||
        (shouldAutoAdd && !undoable
          ? "?? l?u v?o Google Sheets; ho?n t?c t? ??ng hi?n ch? h? tr? b?ng c?c b?."
          : "")
    });
  } catch (error) {
    next(error);
  }
});

app.use(express.static(distDir));

app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    error: error.message || "Đã có lỗi không xác định."
  });
});

const compactedRows = await compactLocalProducts();
if (compactedRows > 0) {
  console.log(`Compacted ${compactedRows} duplicate local product rows.`);
}

app.listen(PORT, () => {
  console.log(`API server listening on http://127.0.0.1:${PORT}`);
});
