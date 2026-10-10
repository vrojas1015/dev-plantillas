/**
 * Reporte JSON de Playwright -> registro de casos de uso (registro.json).
 *
 *   node scripts/registro.ts [--entrada reportes/playwright.json]
 *                            [--salida reportes/registro.json]
 *                            [--enlace <url del reporte>] [--bloquear]
 *
 * Esquema: esquemas/registro.schema.json (lo lee el repo `docs` para la página
 * de estado por escenario y la regla de `validar`; ver docs/registro.md).
 *
 * Estado de cada test:
 *   ✅ pasa       pasó al primer intento
 *   ❌ falla      falló (también después de los reintentos)
 *   ⚠️ inestable  etiquetado @inestable (en cuarentena), o pasó sólo al reintentar
 *   🔧 pendiente  test.fixme / test.skip: el escenario todavía no tiene test que corra
 * Estado de un escenario (@CU-<issue>-<n>), el peor de sus tests:
 *   falla > inestable > pendiente > pasa.
 *
 * --bloquear: exit 1 si falló algún test que NO es @inestable, si el reporte
 * trae errores globales (config, globalSetup) o si no corrió ningún test. Los
 * @inestable que fallan sólo se avisan (no bloquean).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export type Estado = 'pasa' | 'falla' | 'inestable' | 'pendiente';

export const ICONOS: Record<Estado, string> = {
  pasa: '✅',
  falla: '❌',
  inestable: '⚠️',
  pendiente: '🔧',
};

const GRAVEDAD: Estado[] = ['pasa', 'pendiente', 'inestable', 'falla'];
const RE_ESCENARIO = /^@?(CU-\d+-\d+)$/i;

// --- Reporte JSON de Playwright (sólo lo que se usa) -------------------------

interface PwResultado {
  status: string;
  duration: number;
  retry: number;
  startTime: string;
}

interface PwTest {
  projectName: string;
  status: 'expected' | 'unexpected' | 'flaky' | 'skipped';
  results: PwResultado[];
}

interface PwSpec {
  title: string;
  tags?: string[];
  file: string;
  line: number;
  tests: PwTest[];
}

interface PwSuite {
  title: string;
  file?: string;
  specs?: PwSpec[];
  suites?: PwSuite[];
}

interface PwReporte {
  /** metadata de playwright.config.ts: ambiente, corrida y prefijo. */
  config?: { metadata?: Record<string, unknown> };
  suites: PwSuite[];
  errors?: Array<{ message?: string }>;
  stats?: { startTime?: string; duration?: number };
}

// --- registro.json (esquemas/registro.schema.json) ---------------------------

export interface TestRegistro {
  titulo: string;
  archivo: string;
  proyecto: string;
  estado: Estado;
  etiquetas: string[];
  intentos: number;
  duracion_ms: number;
}

export interface EscenarioRegistro {
  estado: Estado;
  icono: string;
  ultima_corrida: string;
  enlace: string | null;
  tests: TestRegistro[];
}

export interface Registro {
  version: 1;
  generado: string;
  ambiente: string;
  corrida: { id: string | null; inicio: string; duracion_ms: number; commit: string | null; enlace: string | null };
  resumen: Record<Estado, number> & { tests: number; escenarios: number; tasa_inestables: number };
  escenarios: Record<string, EscenarioRegistro>;
  sin_escenario: TestRegistro[];
}

function peor(estados: Estado[]): Estado {
  return estados.reduce<Estado>((a, b) => (GRAVEDAD.indexOf(b) > GRAVEDAD.indexOf(a) ? b : a), 'pasa');
}

function normalizarEtiqueta(t: string): string {
  return t.startsWith('@') ? t : `@${t}`;
}

function estadoDeTest(t: PwTest, etiquetas: string[]): Estado {
  if (etiquetas.includes('@inestable')) return 'inestable';
  switch (t.status) {
    case 'expected':
      return 'pasa';
    case 'flaky':
      return 'inestable';
    case 'skipped':
      return 'pendiente';
    default:
      return 'falla';
  }
}

/** Specs con la ruta de describe() que los contiene (sin la suite raíz, que es el archivo). */
function recorrer(
  suite: PwSuite,
  titulos: string[],
  salida: Array<{ spec: PwSpec; ruta: string[] }>,
  raiz = false,
): void {
  const ruta = !raiz && suite.title ? [...titulos, suite.title] : titulos;
  for (const spec of suite.specs ?? []) salida.push({ spec, ruta });
  for (const s of suite.suites ?? []) recorrer(s, ruta, salida);
}

/** Enlace al reporte de la corrida: --enlace, E2E_URL_REPORTE o el job del CI. */
function enlacePorDefecto(): string | null {
  const e = process.env;
  if (e['E2E_URL_REPORTE']) return e['E2E_URL_REPORTE'];
  if (e['GITHUB_RUN_ID']) return `${e['GITHUB_SERVER_URL']}/${e['GITHUB_REPOSITORY']}/actions/runs/${e['GITHUB_RUN_ID']}`;
  if (e['CI_JOB_URL']) return `${e['CI_JOB_URL']}/artifacts/file/reportes/html/index.html`;
  return null;
}

export function construirRegistro(reporte: PwReporte, enlace: string | null, ahora = new Date()): Registro {
  const specs: Array<{ spec: PwSpec; ruta: string[] }> = [];
  for (const s of reporte.suites) recorrer(s, [], specs, true);

  const inicio = reporte.stats?.startTime ?? ahora.toISOString();
  const tests: Array<TestRegistro & { escenarios: string[] }> = [];
  for (const { spec, ruta } of specs) {
    const etiquetas = (spec.tags ?? []).map(normalizarEtiqueta);
    const escenarios = etiquetas
      .map((t) => RE_ESCENARIO.exec(t)?.[1]?.toUpperCase())
      .filter((x): x is string => !!x);
    for (const t of spec.tests) {
      tests.push({
        titulo: [...ruta, spec.title].join(' › '),
        archivo: `${spec.file}:${spec.line}`,
        proyecto: t.projectName,
        estado: estadoDeTest(t, etiquetas),
        etiquetas,
        intentos: t.results.length,
        duracion_ms: t.results.reduce((a, r) => a + (r.duration ?? 0), 0),
        escenarios,
      });
    }
  }

  const escenarios: Record<string, EscenarioRegistro> = {};
  for (const id of [...new Set(tests.flatMap((t) => t.escenarios))].sort()) {
    const propios = tests.filter((t) => t.escenarios.includes(id)).map(({ escenarios: _e, ...t }) => t);
    const estado = peor(propios.map((t) => t.estado));
    escenarios[id] = { estado, icono: ICONOS[estado], ultima_corrida: inicio, enlace, tests: propios };
  }

  const cuenta = (e: Estado) => tests.filter((t) => t.estado === e).length;
  const meta = reporte.config?.metadata ?? {};
  const texto = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return {
    version: 1,
    generado: ahora.toISOString(),
    ambiente: texto(meta['ambiente']) ?? process.env['E2E_AMBIENTE'] ?? 'desconocido',
    corrida: {
      id: texto(meta['corrida']) ?? process.env['GITHUB_RUN_ID'] ?? process.env['CI_PIPELINE_ID'] ?? null,
      inicio,
      duracion_ms: Math.round(reporte.stats?.duration ?? 0),
      commit: process.env['GITHUB_SHA'] ?? process.env['CI_COMMIT_SHA'] ?? null,
      enlace,
    },
    resumen: {
      tests: tests.length,
      escenarios: Object.keys(escenarios).length,
      pasa: cuenta('pasa'),
      falla: cuenta('falla'),
      inestable: cuenta('inestable'),
      pendiente: cuenta('pendiente'),
      tasa_inestables: tests.length ? Number((cuenta('inestable') / tests.length).toFixed(4)) : 0,
    },
    escenarios,
    sin_escenario: tests.filter((t) => t.escenarios.length === 0).map(({ escenarios: _e, ...t }) => t),
  };
}

/** Motivos por los que la corrida bloquea (vacío = no bloquea). */
export function motivosDeBloqueo(reporte: PwReporte, registro: Registro): string[] {
  const motivos: string[] = [];
  for (const e of reporte.errors ?? []) motivos.push(`error global: ${(e.message ?? '').split('\n')[0]}`);
  if (registro.resumen.tests === 0) motivos.push('no corrió ningún test');
  const todos = [...Object.values(registro.escenarios).flatMap((e) => e.tests), ...registro.sin_escenario];
  const vistos = new Set<string>();
  for (const t of todos) {
    const clave = `${t.proyecto}|${t.archivo}|${t.titulo}`;
    if (t.estado === 'falla' && !vistos.has(clave)) {
      vistos.add(clave);
      motivos.push(`falló [${t.proyecto}] ${t.titulo} (${t.archivo})`);
    }
  }
  return motivos;
}

function main(): number {
  const { values } = parseArgs({
    options: {
      entrada: { type: 'string', default: 'reportes/playwright.json' },
      salida: { type: 'string', default: 'reportes/registro.json' },
      enlace: { type: 'string' },
      bloquear: { type: 'boolean', default: false },
    },
  });
  let reporte: PwReporte;
  try {
    reporte = JSON.parse(readFileSync(resolve(values.entrada), 'utf8')) as PwReporte;
  } catch (e) {
    console.error(`registro: no se pudo leer ${values.entrada}: ${String(e)}`);
    return values.bloquear ? 1 : 2;
  }
  const registro = construirRegistro(reporte, values.enlace ?? enlacePorDefecto());
  mkdirSync(dirname(resolve(values.salida)), { recursive: true });
  writeFileSync(resolve(values.salida), `${JSON.stringify(registro, null, 2)}\n`, 'utf8');

  const r = registro.resumen;
  console.log(
    `registro: ${values.salida} · ${r.escenarios} escenario(s) · ${r.tests} test(s): ` +
      `✅ ${r.pasa} · ❌ ${r.falla} · ⚠️ ${r.inestable} · 🔧 ${r.pendiente}`,
  );
  for (const [id, e] of Object.entries(registro.escenarios)) console.log(`  ${e.icono} ${id}`);
  const todos = [...Object.values(registro.escenarios).flatMap((e) => e.tests), ...registro.sin_escenario];
  const cuarentena = todos.filter((t) => t.etiquetas.includes('@inestable'));
  if (cuarentena.length) {
    console.log(`aviso: ${cuarentena.length} test(s) en cuarentena (@inestable): no bloquean; plazo para arreglarlos: 2 semanas`);
  }
  for (const t of todos.filter((x) => x.estado === 'inestable' && !x.etiquetas.includes('@inestable'))) {
    console.log(`aviso: pasó sólo al reintentar (¿inestable?): [${t.proyecto}] ${t.titulo}`);
  }

  if (!values.bloquear) return 0;
  const motivos = motivosDeBloqueo(reporte, registro);
  if (motivos.length) {
    console.error(`\nregistro: la corrida BLOQUEA (${motivos.length}):`);
    for (const m of motivos) console.error(`  - ${m}`);
    return 1;
  }
  console.log('registro: la corrida no bloquea');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
