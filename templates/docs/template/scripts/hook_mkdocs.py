"""Hook de MkDocs (mkdocs.yml › hooks). Sólo cambia el sitio, nunca los archivos.

- Issues (`issues/<n>-<slug>/issue.md`): bloque con estado, prioridad, tipo,
  área, repos (enlazados a su ficha) y fechas, debajo del título.
- ADRs (`adr/NNNN-*.md`): estado y fecha (y quién lo reemplaza).
- Índices de sección (`runbooks/`, `postmortems/`, `releases/`, `servicios/`,
  `casos-de-uso/`): agrega al final la lista de documentos de la carpeta, así
  ningún documento queda huérfano sin que nadie edite un índice compartido.
- Casos de uso: si existe `_generado/escenarios.md` (registro e2e configurado,
  ver scripts/escenarios.py), un enlace a la página de estado por escenario.
"""

from __future__ import annotations

import html
import posixpath
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from comun import titulo_markdown, version_tupla  # noqa: E402

RE_ISSUE = re.compile(r"^issues/(\d+)-[^/]+/issue\.md$")
RE_ADR = re.compile(r"^adr/\d{4,}-[^/]+\.md$")
SECCIONES = ("runbooks", "postmortems", "releases", "servicios", "casos-de-uso")


def _rel(desde: str, hacia: str) -> str:
    return posixpath.relpath(hacia, posixpath.dirname(desde) or ".")


def _repo(nombre, src: str, files) -> str:
    nombre = str(nombre)
    destino = f"servicios/{nombre}.md"
    if files.get_file_from_path(destino) is None:
        return f"`{html.escape(nombre)}`"
    return f"[{html.escape(nombre)}]({_rel(src, destino)})"


def _chip(clase: str, texto) -> str:
    texto = html.escape(str(texto))
    return f'<span class="metadatos__chip metadatos__chip--{html.escape(clase)}">{texto}</span>'


def _insertar_bajo_h1(markdown: str, bloque: str) -> str:
    m = re.search(r"^# .*$", markdown, re.MULTILINE)
    if not m:
        return f"{bloque}\n\n{markdown}"
    return f"{markdown[: m.end()]}\n\n{bloque}\n{markdown[m.end() :]}"


def _bloque(partes: list[str]) -> str:
    return '<div class="metadatos" markdown>\n' + " · ".join(p for p in partes if p) + "\n</div>\n"


def _issue(markdown: str, meta: dict, src: str, files) -> str:
    repos = meta.get("repos") or []
    estado = meta.get("estado", "?")
    partes = [
        _chip(f"estado-{estado}", estado),
        _chip(f"prioridad-{meta.get('prioridad', '?')}", f"prioridad {meta.get('prioridad', '?')}"),
        f"**Tipo:** {html.escape(str(meta.get('tipo', '?')))}",
        f"**Área:** {_repo(meta['area'], src, files)}" if meta.get("area") else "**Área:** sin definir",
        "**Repos:** " + (" → ".join(_repo(r, src, files) for r in repos) if repos else "sin definir"),
        f"**Creado:** {meta.get('creado')}" if meta.get("creado") else "",
        f"**Resuelto:** {meta.get('resuelto')}" if meta.get("resuelto") else "",
    ]
    relacionados = meta.get("relacionados") or []
    if relacionados:
        enlaces = []
        for n in relacionados:
            carpeta = next(
                (f.src_uri for f in files.documentation_pages()
                 if (m := RE_ISSUE.match(f.src_uri)) and int(m.group(1)) == n),
                None,
            )
            enlaces.append(f"[{n:03d}]({_rel(src, carpeta)})" if carpeta and isinstance(n, int) else str(n))
        partes.append("**Relacionados:** " + ", ".join(enlaces))
    return _insertar_bajo_h1(markdown, _bloque(partes))


def _adr(markdown: str, meta: dict) -> str:
    estado = meta.get("estado", "?")
    partes = [_chip(f"estado-{estado}", estado), f"**Fecha:** {meta.get('fecha', '?')}"]
    for campo, texto in (("reemplaza", "Reemplaza a"), ("reemplazado_por", "Reemplazado por")):
        if isinstance(meta.get(campo), int):
            partes.append(f"**{texto}:** ADR {meta[campo]:04d}")
    return _insertar_bajo_h1(markdown, _bloque(partes))


def _indice(markdown: str, seccion: str, page, files) -> str:
    docs = [
        f for f in files.documentation_pages()
        if posixpath.dirname(f.src_uri) == seccion and posixpath.basename(f.src_uri) != "index.md"
    ]
    if not docs:
        return markdown.rstrip("\n") + "\n\n## Documentos\n\n_Todavía no hay documentos en esta sección._\n"
    if seccion == "releases":
        docs.sort(key=lambda f: version_tupla(posixpath.basename(f.src_uri)), reverse=True)
    elif seccion == "postmortems":
        docs.sort(key=lambda f: f.src_uri, reverse=True)
    else:
        docs.sort(key=lambda f: f.src_uri)
    lineas = [
        f"- [{titulo_markdown(Path(f.abs_src_path)).replace('[', '(').replace(']', ')')}]"
        f"({posixpath.basename(f.src_uri)})"
        for f in docs
    ]
    return markdown.rstrip("\n") + "\n\n## Documentos\n\n" + "\n".join(lineas) + "\n"


def on_page_markdown(markdown, page, config, files):
    src = page.file.src_uri
    meta = page.meta or {}
    if RE_ISSUE.match(src):
        return _issue(markdown, meta, src, files)
    if RE_ADR.match(src):
        return _adr(markdown, meta)
    seccion = posixpath.dirname(src)
    if posixpath.basename(src) == "index.md" and seccion in SECCIONES:
        markdown = _indice(markdown, seccion, page, files)
        if seccion == "casos-de-uso" and files.get_file_from_path("_generado/escenarios.md") is not None:
            markdown += (
                "\n## Estado de los escenarios\n\n"
                "[Estado por escenario de la suite e2e](../_generado/escenarios.md)\n"
            )
        return markdown
    return markdown
