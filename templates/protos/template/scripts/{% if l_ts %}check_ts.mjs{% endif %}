// Importa con Node todos los .js de gen/ts/lib (lo usan `make check-ts` y CI).
// Verifica que el paquete funciona como ESM en JavaScript puro, sin TypeScript.
// Se corre desde gen/ts: `node ../../scripts/check_ts.mjs`.
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve("lib");
const files = readdirSync(root, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith(".js"))
  .sort();
for (const f of files) {
  await import(pathToFileURL(join(root, f)).href);
}
console.log(`OK: ${files.length} modulos ESM importados desde ${root}`);
