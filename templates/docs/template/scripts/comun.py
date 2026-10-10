"""Utilidades compartidas por nuevo.py, validar.py, generar.py y el hook de MkDocs.

Sólo stdlib + PyYAML. Las rutas se devuelven relativas a la raíz del repo y con
barras `/`, para que los mensajes y los archivos generados sean iguales en
Windows y en Linux.
"""

from __future__ import annotations

import datetime as _dt
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import yaml

RAIZ = Path(__file__).resolve().parent.parent
CONTENIDO = RAIZ / "contenido"
ESQUEMAS = RAIZ / "esquemas"
PLANTILLAS = RAIZ / "_plantillas"
GENERADO = CONTENIDO / "_generado"

# kebab-case: el nombre de los repos, carpetas y archivos.
RE_KEBAB = re.compile(r"^[a-z][a-z0-9]*(-[a-z0-9]+)*$")
RE_CARPETA_ISSUE = re.compile(r"^(\d{3,})-([a-z0-9]+(?:-[a-z0-9]+)*)$")
RE_ARCHIVO_ADR = re.compile(r"^(\d{4,})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$")
RE_ARCHIVO_POSTMORTEM = re.compile(r"^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$")
RE_ARCHIVO_RELEASE = re.compile(r"^v(\d+\.\d+\.\d+)\.md$")

# Orden de presentación (y de validación) de cada lista de valores.
ESTADOS_ISSUE = ["abierto", "en-curso", "bloqueado", "resuelto", "descartado"]
ESTADOS_ABIERTOS = ["abierto", "en-curso", "bloqueado"]
PRIORIDADES = ["alta", "media", "baja"]


@dataclass
class Documento:
    """Un archivo Markdown de contenido/ con su frontmatter ya parseado."""

    tipo: str  # issue | plan | adr | servicio | runbook | postmortem | release
    ruta: Path  # absoluta
    meta: dict = field(default_factory=dict)
    cuerpo: str = ""
    error: str | None = None  # error al leer el frontmatter

    @property
    def rel(self) -> str:
        """Ruta relativa a la raíz del repo, con `/` (para mensajes)."""
        return self.ruta.relative_to(RAIZ).as_posix()

    @property
    def rel_contenido(self) -> str:
        """Ruta relativa a contenido/ (para enlaces del sitio)."""
        return self.ruta.relative_to(CONTENIDO).as_posix()


def _fechas_a_texto(valor):
    """YAML convierte 2026-10-09 en date; el esquema trabaja con texto."""
    if isinstance(valor, (_dt.date, _dt.datetime)):
        return valor.isoformat()[:10]
    if isinstance(valor, dict):
        return {k: _fechas_a_texto(v) for k, v in valor.items()}
    if isinstance(valor, list):
        return [_fechas_a_texto(v) for v in valor]
    return valor


def separar_frontmatter(texto: str) -> tuple[str | None, str]:
    """Devuelve (yaml del frontmatter o None, cuerpo)."""
    texto = texto.lstrip("﻿")
    if not texto.startswith("---"):
        return None, texto
    lineas = texto.splitlines(keepends=True)
    if lineas[0].strip() != "---":
        return None, texto
    for i in range(1, len(lineas)):
        if lineas[i].strip() == "---":
            return "".join(lineas[1:i]), "".join(lineas[i + 1 :])
    return None, texto


def leer_documento(tipo: str, ruta: Path) -> Documento:
    doc = Documento(tipo=tipo, ruta=ruta)
    try:
        texto = ruta.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        doc.error = "el archivo no está en UTF-8"
        return doc
    crudo, doc.cuerpo = separar_frontmatter(texto)
    if crudo is None:
        doc.error = "falta el frontmatter (bloque --- ... --- al principio)"
        return doc
    try:
        meta = yaml.safe_load(crudo)
    except yaml.YAMLError as e:
        marca = getattr(e, "problem_mark", None)
        linea = f" (línea {marca.line + 2})" if marca else ""
        doc.error = f"YAML inválido{linea}: {getattr(e, 'problem', e)}"
        return doc
    if not isinstance(meta, dict):
        doc.error = "el frontmatter tiene que ser un mapa clave: valor"
        return doc
    doc.meta = _fechas_a_texto(meta)
    return doc


def _md(carpeta: Path) -> list[Path]:
    """Los .md de una carpeta (sin index.md), en orden estable."""
    if not carpeta.is_dir():
        return []
    return sorted(
        (p for p in carpeta.glob("*.md") if p.name != "index.md"),
        key=lambda p: p.name,
    )


def carpetas_issue() -> list[Path]:
    base = CONTENIDO / "issues"
    if not base.is_dir():
        return []
    return sorted((p for p in base.iterdir() if p.is_dir()), key=lambda p: p.name)


def cargar_documentos() -> list[Documento]:
    """Todos los documentos con frontmatter de contenido/, en orden estable."""
    docs: list[Documento] = []
    for carpeta in carpetas_issue():
        for nombre, tipo in (("issue.md", "issue"), ("plan.md", "plan")):
            if (carpeta / nombre).is_file():
                docs.append(leer_documento(tipo, carpeta / nombre))
    for tipo, sub in (
        ("adr", "adr"),
        ("servicio", "servicios"),
        ("runbook", "runbooks"),
        ("postmortem", "postmortems"),
        ("release", "releases"),
    ):
        docs.extend(leer_documento(tipo, p) for p in _md(CONTENIDO / sub))
    return docs


def por_tipo(docs: list[Documento], tipo: str) -> list[Documento]:
    return [d for d in docs if d.tipo == tipo and d.error is None]


def numero_carpeta(carpeta: Path) -> int | None:
    m = re.match(r"^(\d+)-", carpeta.name)
    return int(m.group(1)) if m else None


def version_tupla(v: str) -> tuple:
    """'v1.10.0' -> (1, 10, 0) para ordenar versiones."""
    partes = re.findall(r"\d+", str(v or ""))[:3]
    return tuple(int(p) for p in partes) + (0,) * (3 - len(partes))


def titulo_markdown(ruta: Path) -> str:
    """`titulo` del frontmatter, o el primer `# H1`, o el nombre del archivo."""
    crudo, cuerpo = separar_frontmatter(ruta.read_text(encoding="utf-8"))
    if crudo:
        try:
            meta = yaml.safe_load(crudo) or {}
            if isinstance(meta, dict) and meta.get("titulo"):
                return str(meta["titulo"])
        except yaml.YAMLError:
            pass
    for linea in cuerpo.splitlines():
        if linea.startswith("# "):
            return linea[2:].strip()
    return ruta.stem


def configurar_salida() -> None:
    """UTF-8 en stdout/stderr también en consolas de Windows y en pipes."""
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
