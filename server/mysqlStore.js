import fs from "node:fs/promises";
import mysql from "mysql2/promise";

function clean(value) {
  return String(value ?? "").trim();
}

let pool = null;
let schemaReady = false;

export function isMysqlConfigured() {
  return Boolean(clean(process.env.DB_HOST) && clean(process.env.DB_NAME) && clean(process.env.DB_USER));
}

function mysqlConfig() {
  return {
    host: clean(process.env.DB_HOST) || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    database: clean(process.env.DB_NAME),
    user: clean(process.env.DB_USER),
    password: String(process.env.DB_PASSWORD || ""),
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    charset: "utf8mb4"
  };
}

export function getMysqlPool() {
  if (!isMysqlConfigured()) {
    return null;
  }

  if (!pool) {
    pool = mysql.createPool(mysqlConfig());
  }

  return pool;
}

export async function initMysqlSchema() {
  const db = getMysqlPool();
  if (!db) {
    return false;
  }

  if (schemaReady) {
    return true;
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS app_runtime (
      config_key VARCHAR(64) PRIMARY KEY,
      config_json LONGTEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(191) NOT NULL UNIQUE,
      display_name VARCHAR(255) NOT NULL,
      role VARCHAR(32) NOT NULL,
      shop_id VARCHAR(64) NULL,
      shop_name VARCHAR(255) NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      password_hash TEXT NOT NULL,
      created_at VARCHAR(64) NULL,
      updated_at VARCHAR(64) NULL,
      INDEX idx_accounts_shop_id (shop_id),
      INDEX idx_accounts_role (role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS products (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      shop_id VARCHAR(64) NOT NULL,
      row_json LONGTEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_products_shop_id_id (shop_id, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  schemaReady = true;
  return true;
}

export async function readRuntimeConfigFromMysql() {
  if (!(await initMysqlSchema())) {
    return null;
  }

  const db = getMysqlPool();
  const [rows] = await db.query("SELECT config_json FROM app_runtime WHERE config_key = 'runtime' LIMIT 1");
  const raw = rows?.[0]?.config_json;
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeRuntimeConfigToMysql(config) {
  if (!(await initMysqlSchema())) {
    return false;
  }

  const db = getMysqlPool();
  await db.query(
    `
      INSERT INTO app_runtime (config_key, config_json)
      VALUES ('runtime', ?)
      ON DUPLICATE KEY UPDATE config_json = VALUES(config_json)
    `,
    [JSON.stringify(config || {})]
  );
  return true;
}

export async function readAccountsFromMysql() {
  if (!(await initMysqlSchema())) {
    return null;
  }

  const db = getMysqlPool();
  const [rows] = await db.query("SELECT * FROM accounts ORDER BY created_at ASC, username ASC");
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    shopId: row.shop_id || "",
    shopName: row.shop_name || "",
    active: row.active !== 0,
    passwordHash: row.password_hash,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  }));
}

export async function writeAccountsToMysql(accounts = []) {
  if (!(await initMysqlSchema())) {
    return false;
  }

  const db = getMysqlPool();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM accounts");
    if (accounts.length) {
      await connection.query(
        `
          INSERT INTO accounts
            (id, username, display_name, role, shop_id, shop_name, active, password_hash, created_at, updated_at)
          VALUES ?
        `,
        [
          accounts.map((account) => [
            clean(account.id),
            clean(account.username),
            clean(account.displayName || account.username),
            clean(account.role) || "user",
            clean(account.shopId || ""),
            clean(account.shopName || ""),
            account.active === false ? 0 : 1,
            String(account.passwordHash || ""),
            clean(account.createdAt || ""),
            clean(account.updatedAt || "")
          ])
        ]
      );
    }
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function readProductsFromMysql(shopId = "admin") {
  if (!(await initMysqlSchema())) {
    return null;
  }

  const db = getMysqlPool();
  const [rows] = await db.query("SELECT row_json FROM products WHERE shop_id = ? ORDER BY id ASC", [
    clean(shopId) || "admin"
  ]);

  return rows
    .map((row) => {
      try {
        return JSON.parse(row.row_json);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export async function writeProductsToMysql(shopId = "admin", products = []) {
  if (!(await initMysqlSchema())) {
    return false;
  }

  const db = getMysqlPool();
  const connection = await db.getConnection();
  const safeShopId = clean(shopId) || "admin";
  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM products WHERE shop_id = ?", [safeShopId]);
    if (products.length) {
      await connection.query(
        "INSERT INTO products (shop_id, row_json) VALUES ?",
        [products.map((product) => [safeShopId, JSON.stringify(product || {})])]
      );
    }
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function readJsonFile(filePath, fallback = null) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
