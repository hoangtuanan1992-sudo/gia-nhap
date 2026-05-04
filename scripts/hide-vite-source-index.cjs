const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceIndex = path.join(root, "index.html");
const hiddenIndex = path.join(root, "index.vite-source.html");

if (!fs.existsSync(sourceIndex)) {
  process.exit(0);
}

const html = fs.readFileSync(sourceIndex, "utf8");
if (!html.includes("/src/main.jsx")) {
  process.exit(0);
}

fs.copyFileSync(sourceIndex, hiddenIndex);
fs.unlinkSync(sourceIndex);
console.log("Hidden Vite source index.html so cPanel serves the Node app.");
