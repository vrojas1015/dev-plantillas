/**
 * Corre una herramienta externa (Schemathesis, k6) sin exigir que esté
 * instalada: por Docker (default, local y GitHub Actions) o con el binario del
 * PATH (E2E_HERRAMIENTAS=local; lo usa el CI de GitLab, sin Docker).
 *
 * Con Docker, el repo se monta en /trabajo y las URLs a localhost se reescriben
 * para que el contenedor llegue al host (Linux: --network host; Windows y
 * macOS: host.docker.internal). Las credenciales viajan como variables de
 * entorno heredadas (`-e NOMBRE`), nunca en la línea de comandos.
 */
import { spawnSync } from 'node:child_process';

import { RAIZ } from '../tests/fixtures/ambiente.ts';

export interface Herramienta {
  /** Imagen fijada por versión (modo docker). */
  imagen: string;
  /** Comando local (modo local), ej. ['k6'] o ['uvx', '--from', 'schemathesis==X', 'schemathesis']. */
  local: string[];
}

export const MODO = process.env['E2E_HERRAMIENTAS'] === 'local' ? 'local' : 'docker';
const LINUX = process.platform === 'linux';

/** URL tal como la ve la herramienta (dentro del contenedor, si corre en Docker). */
export function urlParaHerramienta(url: string): string {
  if (MODO !== 'docker' || LINUX) return url;
  return url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(?=[:/]|$)/, '$1host.docker.internal');
}

/** Ruta de un archivo del repo tal como la ve la herramienta. */
export function rutaParaHerramienta(relativa: string): string {
  return MODO === 'docker' ? `/trabajo/${relativa}` : relativa;
}

/**
 * Corre la herramienta y devuelve su código de salida.
 * @param args argumentos (después del comando)
 * @param env variables extra para el proceso (se pasan por nombre a Docker)
 */
export function correr(h: Herramienta, args: string[], env: Record<string, string> = {}): number {
  const entorno = { ...process.env, ...env };
  let comando: string;
  let todos: string[];
  if (MODO === 'docker') {
    comando = 'docker';
    todos = [
      'run', '--rm',
      ...(LINUX ? ['--network', 'host', '--user', `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`] : []),
      '-v', `${RAIZ}:/trabajo`, '-w', '/trabajo',
      ...Object.keys(env).flatMap((k) => ['-e', k]),
      h.imagen, ...args,
    ];
  } else {
    [comando, ...todos] = [...h.local, ...args] as [string, ...string[]];
  }
  const r = spawnSync(comando, todos, { stdio: 'inherit', env: entorno, cwd: RAIZ });
  if (r.error) {
    console.error(`no se pudo ejecutar ${comando}: ${r.error.message}` +
      (MODO === 'docker' ? ' (¿Docker instalado y corriendo? o E2E_HERRAMIENTAS=local)' : ''));
    return 1;
  }
  return r.status ?? 1;
}
