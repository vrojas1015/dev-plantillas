/**
 * La suite completa como la corre el CI: Playwright + registro.json + decisión
 * de bloqueo (los @inestable no bloquean).
 *
 *   npm run e2e [-- <argumentos de playwright test>]   ej. npm run e2e -- --grep @smoke
 *
 * El código de salida de Playwright se ignora a propósito: incluye los
 * @inestable que fallan. Lo que bloquea lo decide `registro.ts --bloquear`.
 */
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cli = require.resolve('@playwright/test/cli');

// Sin reporte viejo: si esta corrida no escribe el JSON (p. ej. --reporter=dot
// pisa los reporters de la config), el registro falla en vez de mentir.
rmSync('reportes/playwright.json', { force: true });

const pw = spawnSync(process.execPath, [cli, 'test', ...process.argv.slice(2)], { stdio: 'inherit' });
if (pw.error) throw pw.error;
console.log(`\nplaywright terminó con código ${pw.status} (no decide: lo decide el registro)\n`);

const reg = spawnSync(process.execPath, ['scripts/registro.ts', '--bloquear'], { stdio: 'inherit' });
process.exit(reg.status ?? 1);
