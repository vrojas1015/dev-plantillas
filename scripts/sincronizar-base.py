#!/usr/bin/env python3
"""Sincroniza la base común (templates/_base) en cada plantilla.

La base común (docs/10-base-comun-de-repos.md) se define una vez en
templates/_base y se copia o integra en templates/<plantilla>/template/ antes
de publicar. Así cada plantilla publicada (un repo propio) la lleva adentro y
`copier update` la propaga a los repos generados.

  python scripts/sincronizar-base.py               # todas las plantillas
  python scripts/sincronizar-base.py protos docs   # sólo esas
  python scripts/sincronizar-base.py --comprobar   # no escribe: falla (exit 1)
                                                   # si alguna quedó desactualizada

Qué hace en cada plantilla (las rutas condicionales .github/.gitlab se detectan
en su template/, cada plantilla usa sus propios flags: ci_gh, ci_github…):

  Copia tal cual         SECURITY.md.jinja, CODEOWNERS.jinja, .gitleaks.toml,
                         .pre-commit-config.yaml, scripts/verificar-titulo.sh,
                         <.github>/workflows/base.yml, <.gitlab>/base.gitlab-ci.yml
  Arma                   plantilla de PR/MR = _base/pr.md.jinja + la sección
                         propia de la plantilla (templates/<x>/pr-propio.md)
  Bloque delimitado      .gitignore (fragmento de secretos), .gitlab-ci.yml
  (# >>> base común …    (include: del archivo de la base) y copier.yml
   # <<< base común)     (preguntas dueño y docs_repo). Lo de afuera no se toca.
  Agrega si faltan       permisos de .claude/settings.json (allow/deny)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
TEMPLATES = RAIZ / "templates"
BASE = TEMPLATES / "_base"

INICIO = "# >>> base común"
FIN = "# <<< base común"
CABECERA_BLOQUE = {
    "gitignore": f"{INICIO} (se actualiza con copier update; lo propio va fuera del bloque)",
    "gitlab-ci": f"{INICIO} (se actualiza con copier update; lo propio va fuera del bloque)",
    "copier": f"{INICIO}: preguntas comunes (templates/_base/copier-preguntas.yml; "
    "las copia scripts/sincronizar-base.py, no editar acá)",
}
MARCA_PROPIA = "@@SECCION_PROPIA@@"
AVISO_JINJA = (
    "{#- Base común: se edita en templates/_base (y la sección propia en pr-propio.md) "
    "y se copia con scripts/sincronizar-base.py. -#}\n"
)

# Default de la pregunta `dueño` (CODEOWNERS) por plantilla. Donde la plantilla
# ya conoce la organización, sale de sus respuestas.
DUEÑO_DEFAULT = {
    "go-grpc-service": "@{{ module_path.split('/')[1] }}/backend",
    "api-gateway": "@{{ module_path.split('/')[1] }}/backend",
    "protos": "@{{ org_name }}/backend",
    "docs": "@{{ org_name }}/plataforma",
    "angular-app": "@mi-org/frontend",
    "astro-site": "@mi-org/frontend",
    "android-app": "@mi-org/movil",
    "e2e-tests": "@mi-org/qa",
}

COPIAS = {
    # destino relativo a template/ -> origen relativo a _base/
    "SECURITY.md.jinja": "SECURITY.md.jinja",
    "CODEOWNERS.jinja": "CODEOWNERS.jinja",
    ".gitleaks.toml": ".gitleaks.toml",
    ".pre-commit-config.yaml": ".pre-commit-config.yaml",
    "scripts/verificar-titulo.sh": "scripts/verificar-titulo.sh",
}


class Plantilla:
    def __init__(self, nombre: str):
        self.nombre = nombre
        self.dir = TEMPLATES / nombre
        self.tpl = self.dir / "template"
        self.github = self._una("{% if *%}.github{% endif %}", dir_=True)
        self.gitlab = self._una("{% if *%}.gitlab{% endif %}", dir_=True)
        self.gitlab_ci = self._una("{% if *%}.gitlab-ci.yml{% endif %}.jinja", dir_=False)
        gi = [p for p in (self.tpl / ".gitignore", self.tpl / ".gitignore.jinja") if p.exists()]
        if len(gi) != 1:
            raise SystemExit(f"{nombre}: se esperaba un .gitignore o .gitignore.jinja en template/")
        self.gitignore = gi[0]

    def _una(self, patron: str, dir_: bool) -> Path:
        hallados = [p for p in self.tpl.glob(patron) if p.is_dir() == dir_]
        if len(hallados) != 1:
            raise SystemExit(f"{self.nombre}: se esperaba un {patron!r} en template/, hay {len(hallados)}")
        return hallados[0]


def leer(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def con_bloque(texto: str, bloque: str, cabecera: str, donde: str = "final") -> str:
    """Reemplaza el bloque delimitado o, si no está, lo inserta.

    donde: "final"; "principio" (después de un comentario Jinja inicial); o
    "antes-de-clave" (antes de la primera clave de primer nivel del YAML, o sea
    después del comentario de cabecera). En los archivos que el repo generado
    edita (.gitignore, .gitlab-ci.yml) el bloque no va al final: ahí es donde
    cada repo agrega lo suyo, y `copier update` daría conflicto.
    """
    nuevo = f"{cabecera}\n{bloque.rstrip()}\n{FIN}\n"
    lineas = texto.splitlines(keepends=True)
    ini = next((i for i, l in enumerate(lineas) if l.startswith(INICIO)), None)
    if ini is not None:
        fin = next((i for i in range(ini, len(lineas)) if lineas[i].startswith(FIN)), None)
        if fin is None:
            raise ValueError(f"bloque sin cierre ({FIN})")
        return "".join(lineas[:ini]) + nuevo + "".join(lineas[fin + 1 :])
    if donde == "principio":
        corte = texto.index("#}") + 2 if texto.startswith("{#") else 0
        resto = texto[corte:].lstrip("\n")
        return texto[:corte] + ("\n" if corte else "") + nuevo + "\n" + resto
    if donde == "antes-de-clave":
        i = next((i for i, l in enumerate(lineas) if re.match(r"[A-Za-z_][\w.-]*:", l)), None)
        if i is None:
            raise ValueError("no hay claves de primer nivel")
        return "".join(lineas[:i]) + nuevo + "\n" + "".join(lineas[i:])
    if texto and not texto.endswith("\n"):
        texto += "\n"
    return texto + ("\n" if texto else "") + nuevo


def settings_claude(texto: str) -> str:
    datos = json.loads(texto)
    base = json.loads(leer(BASE / "claude-settings.json"))["permissions"]
    permisos = datos.setdefault("permissions", {})
    for clave, entradas in base.items():
        lista = permisos.setdefault(clave, [])
        lista.extend(e for e in entradas if e not in lista)
    return json.dumps(datos, indent=2, ensure_ascii=False) + "\n"


def esperado(p: Plantilla) -> tuple[dict[Path, str], list[Path]]:
    """Contenido esperado de cada archivo administrado y archivos a borrar."""
    archivos: dict[Path, str] = {}
    borrar: list[Path] = []

    for destino, origen in COPIAS.items():
        texto = leer(BASE / origen)
        if destino.endswith(".jinja"):
            texto = AVISO_JINJA + texto
        archivos[p.tpl / destino] = texto

    archivos[p.github / "workflows" / "base.yml"] = leer(BASE / "github/workflows/base.yml")
    archivos[p.gitlab / "base.gitlab-ci.yml"] = leer(BASE / "gitlab/base.gitlab-ci.yml")

    propio_p = p.dir / "pr-propio.md"
    if not propio_p.exists():
        raise SystemExit(f"{p.nombre}: falta pr-propio.md (sección propia de la plantilla de MR/PR)")
    pr = leer(BASE / "pr.md.jinja").replace(MARCA_PROPIA, leer(propio_p).strip())
    pr = AVISO_JINJA + pr
    archivos[p.github / "pull_request_template.md.jinja"] = pr
    archivos[p.gitlab / "merge_request_templates" / "Default.md.jinja"] = pr
    borrar += [p.github / "pull_request_template.md", p.gitlab / "merge_request_templates" / "Default.md"]

    archivos[p.gitignore] = con_bloque(
        leer(p.gitignore), leer(BASE / "gitignore"), CABECERA_BLOQUE["gitignore"], "principio"
    )
    archivos[p.gitlab_ci] = con_bloque(
        leer(p.gitlab_ci), leer(BASE / "gitlab/include.yml"), CABECERA_BLOQUE["gitlab-ci"], "antes-de-clave"
    )

    if p.nombre not in DUEÑO_DEFAULT:
        raise SystemExit(f"{p.nombre}: agregar su default de `dueño` en DUEÑO_DEFAULT")
    preguntas = leer(BASE / "copier-preguntas.yml").replace("@@DUEÑO_DEFAULT@@", DUEÑO_DEFAULT[p.nombre])
    copier = p.dir / "copier.yml"
    archivos[copier] = con_bloque(leer(copier), preguntas, CABECERA_BLOQUE["copier"])

    settings = p.tpl / ".claude" / "settings.json"
    archivos[settings] = settings_claude(leer(settings))
    return archivos, borrar


def plantillas(nombres: list[str]) -> list[Plantilla]:
    todas = sorted(d.name for d in TEMPLATES.iterdir() if (d / "copier.yml").exists() and not d.name.startswith("_"))
    for n in nombres:
        if n not in todas:
            raise SystemExit(f"No existe la plantilla {n!r} (hay: {', '.join(todas)})")
    return [Plantilla(n) for n in (nombres or todas)]


def main() -> int:
    for flujo in (sys.stdout, sys.stderr):  # consola de Windows (cp1252)
        flujo.reconfigure(encoding="utf-8", errors="replace")
    ap =argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("plantillas", nargs="*", help="nombres (default: todas)")
    ap.add_argument("--comprobar", action="store_true", help="no escribe; falla si alguna quedó desactualizada")
    args = ap.parse_args()

    desactualizadas: dict[str, list[str]] = {}
    for p in plantillas(args.plantillas):
        archivos, borrar = esperado(p)
        cambios = []
        for ruta, texto in archivos.items():
            actual = ruta.read_bytes().decode("utf-8") if ruta.exists() else None
            if actual != texto:
                cambios.append(ruta)
                if not args.comprobar:
                    ruta.parent.mkdir(parents=True, exist_ok=True)
                    ruta.write_bytes(texto.encode("utf-8"))
        for ruta in borrar:
            if ruta.exists():
                cambios.append(ruta)
                if not args.comprobar:
                    ruta.unlink()
        if cambios:
            desactualizadas[p.nombre] = [str(r.relative_to(p.dir)).replace("\\", "/") for r in cambios]

    accion = "desactualizada" if args.comprobar else "actualizada"
    for nombre, rutas in desactualizadas.items():
        print(f"{nombre}: {accion}")
        for r in rutas:
            print(f"  {r}")
    sys.stdout.flush()
    if args.comprobar and desactualizadas:
        print(
            "\nLa base común no coincide con templates/_base en: "
            + ", ".join(desactualizadas)
            + ".\nCorré `python scripts/sincronizar-base.py` y commiteá el resultado "
            "(los cambios a la base se hacen en templates/_base, no en cada plantilla).",
            file=sys.stderr,
        )
        return 1
    if not desactualizadas:
        print("Base común al día en todas las plantillas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
