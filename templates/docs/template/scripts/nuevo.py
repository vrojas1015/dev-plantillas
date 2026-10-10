#!/usr/bin/env python3
"""Crea un documento nuevo desde _plantillas/ (nunca copiar archivos a mano).

    python scripts/nuevo.py issue --titulo "Descuento por pedido con tope" [--repos protos,orders-service] [--prioridad alta] [--clase bug]
    python scripts/nuevo.py plan --issue 42
    python scripts/nuevo.py adr --titulo "Rate limit en Redis"
    python scripts/nuevo.py runbook --titulo "Rollback de un servicio" --repos orders-service
    python scripts/nuevo.py postmortem --titulo "Caída del gateway" --repos api-gateway [--fecha 2026-10-09]
    python scripts/nuevo.py release --version 1.4.0 [--repos orders-service,admin-web]
    python scripts/nuevo.py servicio --titulo orders-service

Issues y ADRs toman el número siguiente mirando la carpeta local Y la rama
principal del remoto (`git fetch` silencioso), para que dos personas no tomen
el mismo número. Si igual chocan, `make validar` lo detecta (id duplicado).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

import yaml

from comun import (
    CONTENIDO,
    PLANTILLAS,
    PRIORIDADES,
    RAIZ,
    RE_KEBAB,
    configurar_salida,
    leer_documento,
)

TIPOS = ("issue", "plan", "adr", "runbook", "postmortem", "release", "servicio")
CLASES = ("feature", "bug", "deuda", "investigacion")
LARGO_SLUG = 60  # rutas cortas: Windows corta en 260 caracteres


class Error(Exception):
    pass


# ----------------------------------------------------------------- texto


def slug(texto: str) -> str:
    """'Descuento por pedido: ¿con tope?' -> 'descuento-por-pedido-con-tope'."""
    s = unicodedata.normalize("NFKD", texto)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    if len(s) > LARGO_SLUG:
        s = s[:LARGO_SLUG].rsplit("-", 1)[0]
    return s


def slug_de(titulo: str) -> str:
    s = slug(titulo)
    if not s:
        raise Error("el TITULO no tiene letras ni números para armar el nombre del archivo")
    return s


def yaml_escalar(texto: str) -> str:
    """El texto tal cual si YAML lo lee igual; si no, entre comillas."""
    try:
        if yaml.safe_load(texto) == texto and "#" not in texto and texto == texto.strip():
            return texto
    except yaml.YAMLError:
        pass
    return json.dumps(texto, ensure_ascii=False)


def yaml_lista(items: list) -> str:
    return "[" + ", ".join(str(i) for i in items) + "]"


# ----------------------------------------------------------------- numeración


def _git(*args: str, timeout: int = 20) -> str | None:
    try:
        r = subprocess.run(
            ["git", "-C", str(RAIZ), *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    return r.stdout if r.returncode == 0 else None


def rama_principal_remota() -> str | None:
    """`origin/main` (o la que sea la rama principal del remoto), después de un fetch."""
    remotos = (_git("remote") or "").split()
    if not remotos:
        return None
    remoto = "origin" if "origin" in remotos else remotos[0]
    if _git("fetch", "--quiet", "--no-tags", remoto, timeout=30) is None:
        print(f"nuevo: aviso: no se pudo hacer git fetch de {remoto}; uso lo que hay localmente", file=sys.stderr)
    cabeza = (_git("symbolic-ref", "--quiet", "--short", f"refs/remotes/{remoto}/HEAD") or "").strip()
    candidatos = [cabeza] if cabeza else []
    candidatos += [f"{remoto}/main", f"{remoto}/master"]
    for ref in candidatos:
        if _git("rev-parse", "--verify", "--quiet", ref) is not None:
            return ref
    return None


def numeros_existentes(subcarpeta: str, patron: re.Pattern) -> set[int]:
    nums = set()
    base = CONTENIDO / subcarpeta
    if base.is_dir():
        nums |= {int(m.group(1)) for p in base.iterdir() if (m := patron.match(p.name))}
    ref = rama_principal_remota()
    if ref:
        salida = _git("ls-tree", "--name-only", f"{ref}:contenido/{subcarpeta}") or ""
        nums |= {int(m.group(1)) for n in salida.splitlines() if (m := patron.match(n.strip()))}
    return nums


def siguiente(subcarpeta: str, patron: re.Pattern) -> int:
    return max(numeros_existentes(subcarpeta, patron), default=0) + 1


# ----------------------------------------------------------------- fichas


def fichas() -> list[str]:
    base = CONTENIDO / "servicios"
    return sorted(p.stem for p in base.glob("*.md") if p.name != "index.md") if base.is_dir() else []


def lista_repos(valor: str | None) -> list[str]:
    repos = [r.strip() for r in (valor or "").replace(" ", ",").split(",") if r.strip()]
    for r in repos:
        if not RE_KEBAB.match(r):
            raise Error(f'"{r}" no es un nombre de repo válido (kebab-case)')
    sin_ficha = [r for r in repos if r not in fichas()]
    if sin_ficha:
        print(
            f"nuevo: aviso: sin ficha en contenido/servicios/: {', '.join(sin_ficha)} "
            f"(make nuevo TIPO=servicio TITULO=<repo>); make validar va a fallar hasta crearla",
            file=sys.stderr,
        )
    return repos


# ----------------------------------------------------------------- crear


def rellenar(plantilla: str, valores: dict[str, str]) -> str:
    texto = (PLANTILLAS / plantilla).read_text(encoding="utf-8")
    for clave, valor in valores.items():
        texto = texto.replace(f"__{clave}__", valor)
    if pendientes := sorted(set(re.findall(r"__[A-Z_]+__", texto))):
        raise Error(f"la plantilla {plantilla} tiene marcadores sin valor: {', '.join(pendientes)}")
    return texto


def escribir(ruta: Path, texto: str) -> Path:
    if ruta.exists():
        raise Error(f"ya existe {ruta.relative_to(RAIZ).as_posix()}")
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(texto, encoding="utf-8", newline="\n")
    return ruta


def requerir(valor, mensaje: str):
    if not valor:
        raise Error(mensaje)
    return valor


def crear(args) -> Path:
    hoy = args.fecha or dt.date.today().isoformat()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", hoy):
        raise Error("FECHA tiene que ser AAAA-MM-DD")
    titulo = (args.titulo or "").strip()
    base = {"FECHA": hoy, "TITULO": yaml_escalar(titulo), "TITULO_TEXTO": titulo}

    if args.tipo == "issue":
        requerir(titulo, 'falta TITULO="..."')
        if args.prioridad not in PRIORIDADES:
            raise Error(f"PRIORIDAD tiene que ser una de: {', '.join(PRIORIDADES)}")
        if args.clase not in CLASES:
            raise Error(f"CLASE tiene que ser una de: {', '.join(CLASES)}")
        repos = lista_repos(args.repos)
        # El repo principal no siempre es el primero del orden (protos suele ir antes).
        area = args.area or (repos[0] if len(repos) == 1 else None)
        if area and area not in repos:
            repos.insert(0, area)
        n = siguiente("issues", re.compile(r"^(\d+)-"))
        ruta = CONTENIDO / "issues" / f"{n:03d}-{slug_de(titulo)}" / "issue.md"
        return escribir(
            ruta,
            rellenar(
                "issue.md",
                base
                | {
                    "ID": str(n),
                    "NUM": f"{n:03d}",
                    "CLASE": args.clase,
                    "PRIORIDAD": args.prioridad,
                    "AREA": area or "null",
                    "REPOS": yaml_lista(repos),
                },
            ),
        )

    if args.tipo == "plan":
        n = requerir(args.issue, "falta ISSUE=<número>")
        carpetas = sorted((CONTENIDO / "issues").glob("*-*/"))
        carpeta = next((c for c in carpetas if re.match(rf"^0*{n}-", c.name)), None)
        if carpeta is None or not (carpeta / "issue.md").is_file():
            raise Error(f"no existe el issue {n} (contenido/issues/{n:03d}-*/issue.md)")
        doc_issue = leer_documento("issue", carpeta / "issue.md")
        titulo = titulo or f"Plan del issue {n:03d}: {doc_issue.meta.get('titulo', '')}".rstrip(": ")
        ruta = escribir(
            carpeta / "plan.md",
            rellenar(
                "plan.md",
                base | {"ISSUE": str(n), "TITULO": yaml_escalar(titulo), "TITULO_TEXTO": titulo},
            ),
        )
        enlazar_plan(carpeta / "issue.md")
        return ruta

    if args.tipo == "adr":
        requerir(titulo, 'falta TITULO="..."')
        n = siguiente("adr", re.compile(r"^(\d{4,})-"))
        ruta = CONTENIDO / "adr" / f"{n:04d}-{slug_de(titulo)}.md"
        return escribir(ruta, rellenar("adr.md", base | {"ID": str(n), "NUM": f"{n:04d}"}))

    if args.tipo == "runbook":
        requerir(titulo, 'falta TITULO="..."')
        repos = requerir(lista_repos(args.repos), "falta REPOS=<repo>[,<repo>...] (servicios a los que aplica)")
        ruta = CONTENIDO / "runbooks" / f"{slug_de(titulo)}.md"
        return escribir(ruta, rellenar("runbook.md", base | {"REPOS": yaml_lista(repos)}))

    if args.tipo == "postmortem":
        requerir(titulo, 'falta TITULO="..."')
        repos = requerir(lista_repos(args.repos), "falta REPOS=<repo>[,<repo>...] (servicios afectados)")
        ruta = CONTENIDO / "postmortems" / f"{hoy}-{slug_de(titulo)}.md"
        return escribir(ruta, rellenar("postmortem.md", base | {"REPOS": yaml_lista(repos)}))

    if args.tipo == "release":
        version = requerir((args.version or "").lstrip("v"), "falta VERSION=X.Y.Z")
        if not re.fullmatch(r"\d+\.\d+\.\d+", version):
            raise Error("VERSION tiene que ser X.Y.Z")
        repos = lista_repos(args.repos) or fichas()
        requerir(repos, "no hay fichas de servicios: pasá REPOS=<repo>[,<repo>...]")
        servicios = "\n".join(f"  {r}: {{qa: null, prod: null}}" for r in repos)
        ruta = CONTENIDO / "releases" / f"v{version}.md"
        return escribir(ruta, rellenar("release.md", base | {"VERSION": version, "SERVICIOS": servicios}))

    if args.tipo == "servicio":
        repo = requerir(args.repo or titulo, "falta TITULO=<nombre exacto del repo>")
        if not RE_KEBAB.match(repo):
            raise Error(f'"{repo}" no es un nombre de repo válido (kebab-case, el nombre exacto del repo)')
        ruta = CONTENIDO / "servicios" / f"{repo}.md"
        return escribir(ruta, rellenar("servicio.md", base | {"REPO": repo}))

    raise Error(f"tipo desconocido: {args.tipo}")


def enlazar_plan(issue: Path) -> None:
    texto = issue.read_text(encoding="utf-8")
    if "(plan.md)" in texto:
        return
    marca = "<!-- plan: make nuevo TIPO=plan ISSUE=<n> lo enlaza acá -->"
    enlace = "Plan detallado para el agente: [plan.md](plan.md)"
    texto = texto.replace(marca, enlace) if marca in texto else texto.rstrip("\n") + f"\n\n{enlace}\n"
    issue.write_text(texto, encoding="utf-8", newline="\n")


def main() -> int:
    configurar_salida()
    p = argparse.ArgumentParser(description="Crea un documento nuevo desde _plantillas/.")
    p.add_argument("tipo", choices=TIPOS)
    p.add_argument("--titulo", default="")
    p.add_argument("--repos", default="", help="repos separados por coma, en orden de ejecución")
    p.add_argument("--area", default="", help="issue: repo principal (por defecto, el único de --repos si hay uno solo)")
    p.add_argument("--prioridad", default="media")
    p.add_argument("--clase", default="feature", help="issue: feature | bug | deuda | investigacion")
    p.add_argument("--issue", type=int, help="plan: número del issue")
    p.add_argument("--version", default="", help="release: X.Y.Z")
    p.add_argument("--repo", default="", help="servicio: nombre del repo (o --titulo)")
    p.add_argument("--fecha", default="", help="AAAA-MM-DD (por defecto, hoy)")
    args = p.parse_args()
    # Make pasa las variables vacías como "": se tratan como no dadas.
    args.prioridad = args.prioridad or "media"
    args.clase = args.clase or "feature"
    try:
        ruta = crear(args)
    except Error as e:
        print(f"nuevo: {e}", file=sys.stderr)
        return 1
    print(f"nuevo: creado {ruta.relative_to(RAIZ).as_posix()}")
    print("       completá el frontmatter y las secciones; después: make validar && make generar")
    return 0


if __name__ == "__main__":
    sys.exit(main())
