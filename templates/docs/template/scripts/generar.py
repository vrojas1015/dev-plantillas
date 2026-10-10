#!/usr/bin/env python3
"""Genera los índices de contenido/_generado/ a partir del frontmatter.

    python scripts/generar.py              # escribe los archivos
    python scripts/generar.py --comprobar  # no escribe; exit 1 si están desactualizados

Archivos: issues-por-estado.md, issues-por-repo.md, adr.md, servicios.md y
rollout.md. La salida es determinista (orden estable, sin fecha de generación):
el CI corre `make generar` + `git diff --exit-code` y falla si alguien editó un
generado a mano o se olvidó de regenerar.

Lee sólo documentos con frontmatter válido; los inválidos los reporta
`make validar`.
"""

from __future__ import annotations

import argparse
import sys

from comun import (
    ESTADOS_ABIERTOS,
    GENERADO,
    PRIORIDADES,
    RAIZ,
    Documento,
    cargar_documentos,
    configurar_salida,
    por_tipo,
    version_tupla,
)

RESUELTOS_RECIENTES = 20
VACIO = "—"


# ----------------------------------------------------------------- formato


def encabezado(titulo: str, descripcion: str) -> list[str]:
    return [
        "<!-- Archivo generado por scripts/generar.py: no editar. Regenerar con `make generar`. -->",
        "",
        f"# {titulo}",
        "",
        f"> **Archivo generado: no editar.** {descripcion} Se regenera con `make generar`.",
        "",
    ]


def celda(valor) -> str:
    if valor is None or valor == "" or valor == []:
        return VACIO
    if isinstance(valor, list):
        valor = ", ".join(str(v) for v in valor)
    return str(valor).replace("|", "\\|").replace("\n", " ").strip()


def tabla(columnas: list[str], filas: list[list[str]]) -> list[str]:
    salida = ["| " + " | ".join(columnas) + " |", "|" + "---|" * len(columnas)]
    salida += ["| " + " | ".join(f) + " |" for f in filas]
    return salida + [""]


def enlace_issue(d: Documento) -> str:
    return f"[{d.meta['id']:03d}](../{d.rel_contenido})"


def enlace_adr(d: Documento) -> str:
    return f"[{d.meta['id']:04d}](../{d.rel_contenido})"


def orden_prioridad(d: Documento) -> tuple:
    p = d.meta.get("prioridad")
    return (PRIORIDADES.index(p) if p in PRIORIDADES else len(PRIORIDADES), d.meta["id"])


class Contexto:
    def __init__(self, docs: list[Documento]) -> None:
        def con_id(tipo: str) -> list[Documento]:
            return sorted(
                (d for d in por_tipo(docs, tipo) if isinstance(d.meta.get("id"), int)),
                key=lambda d: d.meta["id"],
            )

        self.issues = con_id("issue")
        self.adrs = con_id("adr")
        self.servicios = sorted(
            (d for d in por_tipo(docs, "servicio") if isinstance(d.meta.get("repo"), str)),
            key=lambda d: d.meta["repo"],
        )
        self.releases = sorted(
            (d for d in por_tipo(docs, "release") if isinstance(d.meta.get("servicios"), dict)),
            key=lambda d: (str(d.meta.get("fecha", "")), version_tupla(d.meta.get("version"))),
        )
        self.fichas = {d.meta["repo"]: d for d in self.servicios}

    def repo(self, nombre: str) -> str:
        ficha = self.fichas.get(nombre)
        return f"[{nombre}](../{ficha.rel_contenido})" if ficha else nombre

    def repos(self, nombres, sep: str = ", ") -> str:
        nombres = nombres if isinstance(nombres, list) else []
        return sep.join(self.repo(r) for r in nombres) or VACIO


# ----------------------------------------------------------------- archivos


def issues_por_estado(ctx: Contexto) -> str:
    salida = encabezado(
        "Issues por estado",
        "Sale del frontmatter de `issues/<n>-<slug>/issue.md`.",
    )
    conteo = {e: sum(1 for d in ctx.issues if d.meta.get("estado") == e) for e in
              ("abierto", "en-curso", "bloqueado", "resuelto", "descartado")}
    salida += [
        f"Total: {len(ctx.issues)} · " + " · ".join(f"{e}: {n}" for e, n in conteo.items()),
        "",
    ]
    secciones = (("Abiertos", "abierto"), ("En curso", "en-curso"), ("Bloqueados", "bloqueado"))
    for titulo, estado in secciones:
        lista = sorted((d for d in ctx.issues if d.meta.get("estado") == estado), key=orden_prioridad)
        salida += [f"## {titulo} ({len(lista)})", ""]
        if not lista:
            salida += ["_Ninguno._", ""]
            continue
        salida += tabla(
            ["#", "Título", "Prioridad", "Tipo", "Área", "Repos (en orden)", "Creado"],
            [
                [
                    enlace_issue(d),
                    celda(d.meta.get("titulo")),
                    celda(d.meta.get("prioridad")),
                    celda(d.meta.get("tipo")),
                    ctx.repo(d.meta["area"]) if d.meta.get("area") else VACIO,
                    ctx.repos(d.meta.get("repos"), " → "),
                    celda(d.meta.get("creado")),
                ]
                for d in lista
            ],
        )
    resueltos = sorted(
        (d for d in ctx.issues if d.meta.get("estado") == "resuelto"),
        key=lambda d: (str(d.meta.get("resuelto") or ""), d.meta["id"]),
        reverse=True,
    )[:RESUELTOS_RECIENTES]
    salida += [f"## Resueltos recientes (últimos {RESUELTOS_RECIENTES})", ""]
    if not resueltos:
        salida += ["_Ninguno._", ""]
    else:
        salida += tabla(
            ["#", "Título", "Tipo", "Repos", "Resuelto"],
            [
                [
                    enlace_issue(d),
                    celda(d.meta.get("titulo")),
                    celda(d.meta.get("tipo")),
                    ctx.repos(d.meta.get("repos")),
                    celda(d.meta.get("resuelto")),
                ]
                for d in resueltos
            ],
        )
    return "\n".join(salida)


def issues_por_repo(ctx: Contexto) -> str:
    salida = encabezado(
        "Issues abiertos por repo",
        "Para cada repo, los issues abiertos, en curso o bloqueados que lo tocan, "
        "con su lugar en el orden de ejecución del issue.",
    )
    abiertos = [d for d in ctx.issues if d.meta.get("estado") in ESTADOS_ABIERTOS]
    nombres = set(ctx.fichas)
    for d in abiertos:
        nombres.update(r for r in d.meta.get("repos") or [] if isinstance(r, str))
    if not nombres:
        return "\n".join(salida + ["_Todavía no hay fichas de servicios._", ""])
    for nombre in sorted(nombres):
        lista = sorted((d for d in abiertos if nombre in (d.meta.get("repos") or [])), key=orden_prioridad)
        salida += [f"## {nombre}", ""]
        if nombre in ctx.fichas:
            salida += [f"Ficha: {ctx.repo(nombre)}", ""]
        if not lista:
            salida += ["_Sin issues abiertos._", ""]
            continue
        filas = []
        for d in lista:
            repos = d.meta["repos"]
            filas.append(
                [
                    enlace_issue(d),
                    celda(d.meta.get("titulo")),
                    celda(d.meta.get("estado")),
                    celda(d.meta.get("prioridad")),
                    f"{repos.index(nombre) + 1} de {len(repos)}",
                ]
            )
        salida += tabla(["#", "Título", "Estado", "Prioridad", "Paso"], filas)
    return "\n".join(salida)


def adr(ctx: Contexto) -> str:
    salida = encabezado(
        "Decisiones de arquitectura (ADR)",
        "Sale del frontmatter de `adr/NNNN-<titulo>.md`.",
    )
    if not ctx.adrs:
        return "\n".join(salida + ["_Todavía no hay ADRs._", ""])
    por_id = {d.meta["id"]: d for d in ctx.adrs}

    def ref(n) -> str:
        return enlace_adr(por_id[n]) if n in por_id else celda(n)

    salida += tabla(
        ["#", "Título", "Estado", "Fecha", "Reemplaza", "Reemplazado por"],
        [
            [
                enlace_adr(d),
                celda(d.meta.get("titulo")),
                celda(d.meta.get("estado")),
                celda(d.meta.get("fecha")),
                ref(d.meta.get("reemplaza")),
                ref(d.meta.get("reemplazado_por")),
            ]
            for d in ctx.adrs
        ],
    )
    return "\n".join(salida)


def _nodo(repo: str) -> str:
    return "s_" + repo.replace("-", "_")


def servicios(ctx: Contexto) -> str:
    salida = encabezado(
        "Mapa de servicios",
        "Sale de las fichas de `servicios/<repo>.md` (`depende_de` y `consumido_por`).",
    )
    if not ctx.servicios:
        return "\n".join(salida + ["_Todavía no hay fichas de servicios._", ""])
    salida += tabla(
        ["Repo", "Tipo", "Estado", "Dueño", "Depende de", "Consumido por", "Plantilla"],
        [
            [
                ctx.repo(d.meta["repo"]),
                celda(d.meta.get("tipo")),
                celda(d.meta.get("estado")),
                celda(d.meta.get("dueño")),
                ctx.repos(d.meta.get("depende_de")),
                ctx.repos(d.meta.get("consumido_por")),
                celda(d.meta.get("plantilla")),
            ]
            for d in ctx.servicios
        ],
    )
    # A --> B: A depende de B (o B es consumido por A).
    aristas: set[tuple[str, str]] = set()
    nodos: dict[str, str] = {}
    for d in ctx.servicios:
        repo = d.meta["repo"]
        estado = d.meta.get("estado")
        nodos[repo] = repo if estado in (None, "activo") else f"{repo} ({estado})"
        for dep in d.meta.get("depende_de") or []:
            aristas.add((repo, dep))
        for consumidor in d.meta.get("consumido_por") or []:
            aristas.add((consumidor, repo))
    for a, b in aristas:
        nodos.setdefault(a, a)
        nodos.setdefault(b, b)
    salida += [
        "## Dependencias",
        "",
        "Una flecha `A --> B` significa «A depende de B».",
        "",
        "```mermaid",
        "graph LR",
    ]
    salida += [f'  {_nodo(r)}["{etiqueta}"]' for r, etiqueta in sorted(nodos.items())]
    salida += [f"  {_nodo(a)} --> {_nodo(b)}" for a, b in sorted(aristas)]
    salida += ["```", ""]
    return "\n".join(salida)


def rollout(ctx: Contexto) -> str:
    salida = encabezado(
        "Rollout",
        "Qué versión de cada servicio está en QA y en prod, según la última release "
        "(por fecha y versión) que lo menciona en `releases/vX.Y.Z.md`.",
    )
    if not ctx.releases:
        return "\n".join(salida + ["_Todavía no hay releases._", ""])
    actual: dict[str, dict[str, tuple[str, Documento]]] = {}
    for rel in ctx.releases:  # ya en orden cronológico: la última gana
        for repo, versiones in sorted(rel.meta["servicios"].items()):
            for amb in ("qa", "prod"):
                v = (versiones or {}).get(amb)
                if v:
                    actual.setdefault(repo, {})[amb] = (str(v), rel)

    def cel(repo: str, amb: str) -> str:
        if amb not in actual.get(repo, {}):
            return VACIO
        v, rel = actual[repo][amb]
        return f"{celda(v)} ([v{rel.meta['version']}](../{rel.rel_contenido}))"

    repos = sorted(set(ctx.fichas) | set(actual))
    salida += ["## Versiones desplegadas", ""]
    salida += tabla(["Servicio", "QA (release)", "Prod (release)"], [[ctx.repo(r), cel(r, "qa"), cel(r, "prod")] for r in repos])
    salida += ["## Releases", ""]
    salida += tabla(
        ["Versión", "Fecha", "Servicios", "Issues"],
        [
            [
                f"[v{rel.meta['version']}](../{rel.rel_contenido})",
                celda(rel.meta.get("fecha")),
                ctx.repos(sorted(rel.meta["servicios"])),
                ", ".join(f"{i:03d}" for i in sorted(rel.meta.get("issues") or []) if isinstance(i, int)) or VACIO,
            ]
            for rel in reversed(ctx.releases)
        ],
    )
    return "\n".join(salida)


GENERADORES = {
    "issues-por-estado.md": issues_por_estado,
    "issues-por-repo.md": issues_por_repo,
    "adr.md": adr,
    "servicios.md": servicios,
    "rollout.md": rollout,
}


def main() -> int:
    configurar_salida()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--comprobar", action="store_true", help="no escribe; exit 1 si hay diferencias")
    args = parser.parse_args()

    ctx = Contexto(cargar_documentos())
    nuevos = {nombre: gen(ctx).rstrip("\n") + "\n" for nombre, gen in GENERADORES.items()}
    sobrantes = sorted(p for p in GENERADO.glob("*.md") if p.name not in nuevos) if GENERADO.is_dir() else []

    distintos = []
    for nombre, texto in nuevos.items():
        ruta = GENERADO / nombre
        previo = ruta.read_text(encoding="utf-8") if ruta.is_file() else None
        if previo != texto:
            distintos.append(ruta)
            if not args.comprobar:
                GENERADO.mkdir(parents=True, exist_ok=True)
                ruta.write_text(texto, encoding="utf-8", newline="\n")
    if not args.comprobar:
        for p in sobrantes:
            p.unlink()

    cambios = [p.relative_to(RAIZ).as_posix() for p in distintos + sobrantes]
    if args.comprobar:
        if cambios:
            print("generar: desactualizado (correr `make generar` y commitear):", *cambios, sep="\n  ", file=sys.stderr)
            return 1
        print("generar: al día")
        return 0
    print("generar: " + (f"{len(cambios)} archivo(s) actualizado(s): " + ", ".join(cambios) if cambios else "sin cambios"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
