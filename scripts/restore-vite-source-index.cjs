const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceIndex = path.join(root, "index.html");
const hiddenIndex = path.join(root, "index.vite-source.html");

if (fs.existsSync(sourceIndex)) {
  process.exit(0);
}

if (!fs.existsSync(hiddenIndex)) {
  console.error("Cannot build: index.html and index.vite-source.html are both missing.");
  process.exit(1);
}

fs.copyFileSync(hiddenIndex, sourceIndex);
console.log("Restored Vite source index.html before build.");
