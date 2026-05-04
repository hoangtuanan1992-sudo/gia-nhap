import { google } from "googleapis";
import { runtimeConfig } from "./runtimeConfig.js";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const HEADER = [
  "Mã sản phẩm",
  "Tên sản phẩm",
  "Giá NCC",
  "Giá min",
  "Giá bán",
  "Link web",
  "Nhà cung cấp",
  "Kho NCC",
  "Ghi chú"
];

export function isSheetsConfigured(config = runtimeConfig) {
  const sheets = config.sheets || {};
  return Boolean(
    sheets.sheetId &&
      (sheets.credentialsPath || (sheets.serviceAccountEmail && sheets.privateKey))
  );
}

function normalizePrivateKey(rawKey = "") {
  return rawKey.replace(/\\n/g, "\n");
}

async function getSheetsClient(config = runtimeConfig) {
  const sheets = config.sheets || {};
  let auth;

  if (sheets.credentialsPath) {
    auth = new google.auth.GoogleAuth({
      keyFile: sheets.credentialsPath,
      scopes: SCOPES
    });
  } else {
    auth = new google.auth.JWT({
      email: sheets.serviceAccountEmail,
      key: normalizePrivateKey(sheets.privateKey),
      scopes: SCOPES
    });
  }

  return google.sheets({ version: "v4", auth });
}

function tabName(config = runtimeConfig) {
  return config.sheets?.sheetTab || "Products";
}

function looksLikeStock(value = "") {
  const text = String(value || "").toLowerCase();
  return /\b\d+\s*c\b/.test(text) || text.includes("còn") || text.includes("het") || text.includes("hết");
}

function toProduct(row = []) {
  const isOldLayout = row.length <= 8 && Boolean(row[5]) && (!row[6] || looksLikeStock(row[6]));

  return {
    productCode: row[0] || "",
    productName: row[1] || "",
    purchasePrice: row[2] || "",
    minPrice: isOldLayout ? "" : row[3] || "",
    salePrice: isOldLayout ? row[3] || "" : row[4] || "",
    webLink: isOldLayout ? row[4] || "" : row[5] || "",
    supplier: isOldLayout ? row[5] || "" : row[6] || "",
    supplierStock: isOldLayout ? row[6] || "" : row[7] || "",
    notes: isOldLayout ? row[7] || "" : row[8] || ""
  };
}

function toSheetRow(product) {
  return [
    product.productCode || "",
    product.productName || "",
    product.purchasePrice || "",
    product.minPrice || "",
    product.salePrice || "",
    product.webLink || "",
    product.supplier || "",
    product.supplierStock || "",
    product.notes || ""
  ];
}

async function ensureHeader(sheets, config = runtimeConfig) {
  const spreadsheetId = config.sheets?.sheetId;
  const sheet = tabName(config);
  const range = `${sheet}!A1:I1`;
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const firstRow = existing.data.values?.[0] || [];
  const hasHeader = HEADER.every((label, index) => firstRow[index] === label);

  if (!hasHeader) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { values: [HEADER] }
    });
  }
}

export async function readSheetProducts(config = runtimeConfig) {
  const sheets = await getSheetsClient(config);
  const spreadsheetId = config.sheets?.sheetId;
  const sheet = tabName(config);

  await ensureHeader(sheets, config);

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheet}!A2:I`
  });

  return (result.data.values || []).map(toProduct);
}

export async function appendSheetProducts(products, config = runtimeConfig) {
  if (!products.length) {
    return;
  }

  const sheets = await getSheetsClient(config);
  const spreadsheetId = config.sheets?.sheetId;
  const sheet = tabName(config);

  await ensureHeader(sheets, config);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheet}!A:I`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: products.map(toSheetRow)
    }
  });
}
