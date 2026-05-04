import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRuntimeConfig, runtimeConfig, saveRuntimeConfig } from "./runtimeConfig.js";
import {
  initMysqlSchema,
  isMysqlConfigured,
  readJsonFile,
  writeAccountsToMysql,
  writeProductsToMysql,
  writeRuntimeConfigToMysql
} from "./mysqlStore.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "data");

function clean(value) {
  return String(value ?? "").trim();
}

function safeShopId(shopId = "") {
  return clean(shopId).replace(/[^a-z0-9_-]/gi, "_") || "default";
}

if (!isMysqlConfigured()) {
  console.error("Chua co DB_HOST, DB_NAME, DB_USER. Hay cau hinh MySQL truoc khi migrate.");
  process.exit(1);
}

await initMysqlSchema();
await loadRuntimeConfig();

const accounts = await readJsonFile(path.join(dataDir, "accounts.json"), []);
if (Array.isArray(accounts) && accounts.length) {
  await writeAccountsToMysql(accounts);
  console.log(`Imported ${accounts.length} accounts.`);
} else {
  console.log("No local accounts.json found. The app will create default admin on first start.");
}

await writeRuntimeConfigToMysql(runtimeConfig);
await saveRuntimeConfig();
console.log("Imported runtime config.");

let productFiles = [];
try {
  productFiles = (await fs.readdir(dataDir)).filter((file) => /^products(\..+)?\.json$/i.test(file));
} catch {
  productFiles = [];
}

for (const file of productFiles) {
  const shopId =
    file === "products.json"
      ? "admin"
      : file.replace(/^products\./i, "").replace(/\.json$/i, "");
  const rows = await readJsonFile(path.join(dataDir, file), []);
  if (Array.isArray(rows)) {
    await writeProductsToMysql(safeShopId(shopId), rows);
    console.log(`Imported ${rows.length} products for shop ${shopId}.`);
  }
}

console.log("MySQL migration finished.");
