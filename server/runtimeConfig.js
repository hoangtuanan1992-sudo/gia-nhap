import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initMysqlSchema, isMysqlConfigured, readRuntimeConfigFromMysql, writeRuntimeConfigToMysql } from "./mysqlStore.js";

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeProvider(value) {
  const normalized = clean(value).toLowerCase();
  if (normalized === "gemini" || normalized === "grok") {
    return normalized;
  }

  return "openai";
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "data");
const runtimeConfigFile = path.join(dataDir, "runtime-config.json");

const defaultProvider = normalizeProvider(process.env.AI_PROVIDER);

function createDefaultRuntimeConfig() {
  return {
    provider: defaultProvider,
    apiKeys: {
      openai: clean(process.env.OPENAI_API_KEY),
      gemini: clean(process.env.GEMINI_API_KEY),
      grok: clean(process.env.XAI_API_KEY)
    },
    models: {
      openai: clean(process.env.OPENAI_MODEL) || "gpt-4.1-mini",
      gemini: clean(process.env.GEMINI_MODEL) || "gemini-2.5-flash",
      grok: clean(process.env.XAI_MODEL) || "grok-4.20-reasoning"
    },
    sheets: {
      sheetId: clean(process.env.GOOGLE_SHEET_ID),
      sheetTab: clean(process.env.GOOGLE_SHEET_TAB) || "Products",
      serviceAccountEmail: clean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
      privateKey: process.env.GOOGLE_PRIVATE_KEY || "",
      credentialsPath: clean(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    },
    appSettings: null,
    shopSettings: {},
    shopConfigs: {}
  };
}

export const runtimeConfig = createDefaultRuntimeConfig();

function mergeRuntimeConfig(saved = {}) {
  const nextApiKeys = saved.apiKeys || {};
  const nextModels = saved.models || {};
  const nextSheets = saved.sheets || {};
  const nextAppSettings =
    saved.appSettings && typeof saved.appSettings === "object" && !Array.isArray(saved.appSettings)
      ? saved.appSettings
      : runtimeConfig.appSettings;
  const nextShopSettings =
    saved.shopSettings && typeof saved.shopSettings === "object" && !Array.isArray(saved.shopSettings)
      ? saved.shopSettings
      : runtimeConfig.shopSettings;
  const nextShopConfigs =
    saved.shopConfigs && typeof saved.shopConfigs === "object" && !Array.isArray(saved.shopConfigs)
      ? saved.shopConfigs
      : runtimeConfig.shopConfigs;

  runtimeConfig.provider = normalizeProvider(saved.provider || runtimeConfig.provider);
  runtimeConfig.apiKeys = {
    ...runtimeConfig.apiKeys,
    openai: clean(nextApiKeys.openai || runtimeConfig.apiKeys.openai),
    gemini: clean(nextApiKeys.gemini || runtimeConfig.apiKeys.gemini),
    grok: clean(nextApiKeys.grok || runtimeConfig.apiKeys.grok)
  };
  runtimeConfig.models = {
    ...runtimeConfig.models,
    openai: clean(nextModels.openai) || runtimeConfig.models.openai,
    gemini: clean(nextModels.gemini) || runtimeConfig.models.gemini,
    grok: clean(nextModels.grok) || runtimeConfig.models.grok
  };
  runtimeConfig.sheets = {
    ...runtimeConfig.sheets,
    sheetId: clean(nextSheets.sheetId ?? runtimeConfig.sheets.sheetId),
    sheetTab: clean(nextSheets.sheetTab) || runtimeConfig.sheets.sheetTab || "Products",
    serviceAccountEmail: clean(nextSheets.serviceAccountEmail ?? runtimeConfig.sheets.serviceAccountEmail),
    privateKey: String(nextSheets.privateKey ?? runtimeConfig.sheets.privateKey ?? ""),
    credentialsPath: clean(nextSheets.credentialsPath ?? runtimeConfig.sheets.credentialsPath)
  };
  runtimeConfig.appSettings = nextAppSettings || null;
  runtimeConfig.shopSettings = nextShopSettings || {};
  runtimeConfig.shopConfigs = nextShopConfigs || {};
}

export async function loadRuntimeConfig() {
  await fs.mkdir(dataDir, { recursive: true });

  if (isMysqlConfigured()) {
    await initMysqlSchema();
    const savedFromMysql = await readRuntimeConfigFromMysql();
    if (savedFromMysql && typeof savedFromMysql === "object") {
      mergeRuntimeConfig(savedFromMysql);
      return;
    }
  }

  try {
    const text = await fs.readFile(runtimeConfigFile, "utf8");
    const saved = JSON.parse(text);
    if (saved && typeof saved === "object") {
      mergeRuntimeConfig(saved);
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
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

export async function saveRuntimeConfig() {
  if (isMysqlConfigured()) {
    const savedToMysql = await writeRuntimeConfigToMysql(runtimeConfig);
    if (savedToMysql) {
      return;
    }
  }

  await fs.mkdir(dataDir, { recursive: true });
  await backupFileIfExists(runtimeConfigFile);
  await fs.writeFile(`${runtimeConfigFile}`, `${JSON.stringify(runtimeConfig, null, 2)}\n`, "utf8");
}
