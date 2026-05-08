import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const distIndex = resolve(process.cwd(), "dist", "index.html");

if (!existsSync(distIndex) || !statSync(distIndex).isFile()) {
  console.error(
    "Missing dist/index.html. Run `npm run build` locally, commit and push the dist folder, then deploy on cPanel."
  );
  process.exit(1);
}

console.log("Found dist/index.html. cPanel can restart the app now.");
