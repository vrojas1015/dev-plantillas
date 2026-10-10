#!/usr/bin/env python3
"""Valida el frontmatter de todos los documentos de contenido/.

    python scripts/validar.py

Comprueba:
  - el frontmatter de cada tipo contra su esquema (esquemas/<tipo>.schema.json);
  - nombres de carpeta/archivo coherentes con el frontmatter (id, repo, fecha, versión);
  - ids de issues y ADRs sin duplicar;
  - que todo repo mencionado (area, repos, servicios, depende_de, ...) tenga
    ficha en contenido/servicios/, y que los issues/ADRs referenciados existan;
  - que un issue `resuelto` tenga la sección «Verificación» completa.

Cada problema sale como `archivo: campo: problema`. Exit 1 si hay alguno.
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict

import jsonschema
from jsonschema.exceptions import best_match

from comun import (
    CONTENIDO,
    ESQUEMAS,
    RAIZ,
    RE_ARCHIVO_ADR,
    RE_ARCHIVO_POSTMORTEM,
    RE_ARCHIVO_RELEASE,
    RE_CARPETA_ISSUE,
    RE_KEBAB,
    Documento,
    cargar_documentos,
    configurar_salida,
    carpetas_issue,
    numero_carpeta,
    por_tipo,
)

TIPOS_JSON = {
    "string": "texto",
    "integer": "número entero",
    "array": "lista",
    "object": "mapa",
    "null": "null",
    "boolean": "true/false",
}


class Reporte:
    def __init__(self) -> None:
        self.errores: set[tuple[str, str, str]] = set()
        self.avisos: set[tuple[str, str, str]] = set()

    def error(self, archivo: str, campo: str, problema: str) -> None:
        self.errores.add((archivo, campo, problema))

    def aviso(self, archivo: str, campo: str, problema: str) -> None:
        self.avisos.add((archivo, campo, problema))


def _campo(error) -> str:
    ruta = [str(p) for p in error.absolute_path]
    if error.validator == "required":
        m = re.match(r"'(.+?)' is a required property", error.message)
        if m:
            ruta.append(m.group(1))
    elif error.validator == "additionalProperties" and isinstance(error.instance, dict):
        extras = sorted(set(error.instance) - set(error.schema.get("properties", {})))
        ruta.append(",".join(map(str, extras)))
    return ".".join(ruta) or "frontmatter"


def _problema(error, meta: dict) -> str:
    v, val = error.validator, error.validator_value
    inst = error.instance
    if v in ("oneOf", "anyOf") and error.context:
        return _problema(best_match(error.context), meta)
    if v == "required":
        msg = "falta (obligatorio)"
    elif v == "additionalProperties":
        permitidos = ", ".join(error.schema.get("properties", {}))
        msg = f"campo desconocido (¿error de tipeo? permitidos: {permitidos})"
    elif v == "enum":
        msg = f"valor {json.dumps(inst, ensure_ascii=False)} no permitido; opciones: {', '.join(map(str, val))}"
    elif v == "const":
        msg = f"tiene que ser {json.dumps(val, ensure_ascii=False)}"
    elif v == "type" and inst is None:
        msg = "vacío (null): falta el valor"
    elif v == "type":
        tipos = val if isinstance(val, list) else [val]
        msg = f"se esperaba {' o '.join(TIPOS_JSON.get(t, t) for t in tipos)}, no {json.dumps(inst, ensure_ascii=False)}"
    elif v == "pattern":
        if "[0-9]{4}-[0-9]{2}" in val:
            formato = "fecha absoluta AAAA-MM-DD"
        elif val.startswith("^[a-z][a-z0-9]*(-"):
            formato = "kebab-case (minúsculas, dígitos y guiones)"
        else:
            formato = val
        msg = f"{json.dumps(inst, ensure_ascii=False)} no cumple el formato: {formato}"
    elif v == "minItems":
        msg = f"necesita al menos {val} elemento(s)"
    elif v == "minProperties":
        msg = "no puede estar vacío"
    elif v == "minLength":
        msg = "demasiado corto"
    elif v == "uniqueItems":
        msg = "tiene elementos repetidos"
    elif v == "minimum":
        msg = f"tiene que ser mayor o igual a {val}"
    else:
        msg = error.message
    # Reglas que dependen del estado (if/then/else del esquema).
    if {"then", "else"} & set(map(str, error.schema_path)) and "estado" in meta:
        msg += f" (con estado: {meta['estado']})"
    return msg


def validar_esquemas(docs: list[Documento], rep: Reporte) -> None:
    validadores = {}
    for d in docs:
        if d.error:
            rep.error(d.rel, "frontmatter", d.error)
            continue
        if d.tipo not in validadores:
            esquema = json.loads((ESQUEMAS / f"{d.tipo}.schema.json").read_text(encoding="utf-8"))
            validadores[d.tipo] = jsonschema.Draft202012Validator(esquema)
        for e in validadores[d.tipo].iter_errors(d.meta):
            rep.error(d.rel, _campo(e), _problema(e, d.meta))


def validar_nombres(docs: list[Documento], rep: Reporte) -> None:
    base_issues = CONTENIDO / "issues"
    if base_issues.is_dir():
        for p in sorted(base_issues.iterdir()):
            if p.is_file() and p.name != "index.md":
                rel = p.relative_to(RAIZ).as_posix()
                rep.error(rel, "ubicación", "los issues van en una carpeta: issues/<nnn>-<slug>/issue.md")
    for carpeta in carpetas_issue():
        rel = carpeta.relative_to(RAIZ).as_posix()
        if not RE_CARPETA_ISSUE.match(carpeta.name):
            rep.error(rel, "carpeta", "nombre inválido: <número de 3 dígitos>-<slug-kebab>, ej. 042-descuento-por-pedido")
        if not (carpeta / "issue.md").is_file():
            rep.error(rel, "issue.md", "falta: cada carpeta de issue tiene su issue.md (crear con make nuevo TIPO=issue)")

    for d in docs:
        if d.error:
            continue
        m = d.meta
        nombre = d.ruta.name
        if d.tipo in ("issue", "plan"):
            n = numero_carpeta(d.ruta.parent)
            campo = "id" if d.tipo == "issue" else "issue"
            if n is not None and isinstance(m.get(campo), int) and m[campo] != n:
                rep.error(d.rel, campo, f"es {m[campo]} pero la carpeta es del issue {n}")
        elif d.tipo == "adr":
            ma = RE_ARCHIVO_ADR.match(nombre)
            if not ma:
                rep.error(d.rel, "archivo", "nombre inválido: NNNN-<slug>.md, ej. 0007-rate-limit-en-redis.md")
            elif isinstance(m.get("id"), int) and int(ma.group(1)) != m["id"]:
                rep.error(d.rel, "id", f"es {m['id']} pero el archivo es el ADR {int(ma.group(1))}")
        elif d.tipo == "servicio":
            if m.get("repo") != d.ruta.stem:
                rep.error(d.rel, "repo", f"tiene que ser igual al nombre del archivo ({d.ruta.stem}): sin alias")
            if not RE_KEBAB.match(d.ruta.stem):
                rep.error(d.rel, "archivo", "el nombre del archivo es el nombre exacto del repo, en kebab-case")
        elif d.tipo == "runbook":
            if not RE_KEBAB.match(d.ruta.stem):
                rep.error(d.rel, "archivo", "nombre inválido: <slug-kebab>.md")
        elif d.tipo == "postmortem":
            mp = RE_ARCHIVO_POSTMORTEM.match(nombre)
            if not mp:
                rep.error(d.rel, "archivo", "nombre inválido: AAAA-MM-DD-<slug>.md")
            elif m.get("fecha") and mp.group(1) != m["fecha"]:
                rep.error(d.rel, "fecha", f"es {m['fecha']} pero el archivo dice {mp.group(1)}")
        elif d.tipo == "release":
            mr = RE_ARCHIVO_RELEASE.match(nombre)
            if not mr:
                rep.error(d.rel, "archivo", "nombre inválido: vX.Y.Z.md")
            elif m.get("version") and mr.group(1) != str(m["version"]):
                rep.error(d.rel, "version", f"es {m['version']} pero el archivo es v{mr.group(1)}")


def validar_duplicados(docs: list[Documento], rep: Reporte) -> None:
    for tipo in ("issue", "adr"):
        vistos: dict[int, list[Documento]] = defaultdict(list)
        for d in por_tipo(docs, tipo):
            if isinstance(d.meta.get("id"), int):
                vistos[d.meta["id"]].append(d)
        for ident, lista in vistos.items():
            if len(lista) > 1:
                for d in lista:
                    otros = ", ".join(o.rel for o in lista if o is not d)
                    rep.error(d.rel, "id", f"{tipo} {ident} duplicado (también en {otros}); renumerar con make nuevo")


def _lista(valor) -> list:
    return valor if isinstance(valor, list) else []


def validar_referencias(docs: list[Documento], rep: Reporte) -> None:
    fichas = {d.meta.get("repo") for d in por_tipo(docs, "servicio")}
    issues = {d.meta.get("id") for d in por_tipo(docs, "issue")}
    adrs = {d.meta.get("id") for d in por_tipo(docs, "adr")}

    def repo(d: Documento, campo: str, nombre) -> None:
        if isinstance(nombre, str) and nombre not in fichas:
            rep.error(
                d.rel,
                campo,
                f'"{nombre}" no tiene ficha en contenido/servicios/ '
                f'(¿nombre exacto del repo? si es nuevo: make nuevo TIPO=servicio TITULO={nombre})',
            )

    def ref(d: Documento, campo: str, valor, existentes: set, que: str) -> None:
        if isinstance(valor, int) and valor not in existentes:
            rep.error(d.rel, campo, f"{que} {valor} no existe")

    for d in docs:
        if d.error:
            continue
        m = d.meta
        if d.tipo == "issue":
            if m.get("area") is not None:
                repo(d, "area", m["area"])
            for r in _lista(m.get("repos")):
                repo(d, "repos", r)
            if m.get("area") and _lista(m.get("repos")) and m["area"] not in m["repos"]:
                rep.error(d.rel, "area", f'"{m["area"]}" (repo principal) tiene que estar también en repos')
            for i in _lista(m.get("relacionados")):
                ref(d, "relacionados", i, issues, "el issue")
                if i == m.get("id"):
                    rep.error(d.rel, "relacionados", "un issue no se relaciona consigo mismo")
            if m.get("estado") == "abierto" and not m.get("repos"):
                rep.aviso(d.rel, "repos", "vacío: completalo (en orden de ejecución) antes de pasar a en-curso")
        elif d.tipo == "plan":
            pass
        elif d.tipo == "adr":
            ref(d, "reemplaza", m.get("reemplaza"), adrs, "el ADR")
            ref(d, "reemplazado_por", m.get("reemplazado_por"), adrs, "el ADR")
        elif d.tipo == "servicio":
            for campo in ("depende_de", "consumido_por"):
                for r in _lista(m.get(campo)):
                    repo(d, campo, r)
                    if r == m.get("repo"):
                        rep.error(d.rel, campo, "un servicio no depende de sí mismo")
        elif d.tipo in ("runbook", "postmortem"):
            for r in _lista(m.get("servicios")):
                repo(d, "servicios", r)
            for i in _lista(m.get("issues")):
                ref(d, "issues", i, issues, "el issue")
        elif d.tipo == "release":
            servicios = m.get("servicios") if isinstance(m.get("servicios"), dict) else {}
            for r in servicios:
                repo(d, f"servicios.{r}", r)
            for i in _lista(m.get("issues")):
                ref(d, "issues", i, issues, "el issue")


RE_VERIFICACION = re.compile(r"^##\s+Verificaci[oó]n\b.*$", re.MULTILINE)


def seccion_verificacion_completa(cuerpo: str) -> bool:
    m = RE_VERIFICACION.search(cuerpo)
    if not m:
        return False
    resto = cuerpo[m.end() :]
    siguiente = re.search(r"^#{1,2}\s", resto, re.MULTILINE)
    texto = resto[: siguiente.start()] if siguiente else resto
    texto = re.sub(r"<!--.*?-->", "", texto, flags=re.DOTALL)
    return bool(texto.strip())


def validar_verificacion(docs: list[Documento], rep: Reporte) -> None:
    for d in por_tipo(docs, "issue"):
        if d.meta.get("estado") == "resuelto" and not seccion_verificacion_completa(d.cuerpo):
            rep.error(
                d.rel,
                "estado",
                "resuelto sin la sección «## Verificación» completa (fecha, comandos y commits; la escribe /verificar)",
            )


def main() -> int:
    configurar_salida()
    docs = cargar_documentos()
    rep = Reporte()
    validar_esquemas(docs, rep)
    validar_nombres(docs, rep)
    validar_duplicados(docs, rep)
    validar_referencias(docs, rep)
    validar_verificacion(docs, rep)

    for archivo, campo, problema in sorted(rep.avisos):
        print(f"aviso: {archivo}: {campo}: {problema}")
    for archivo, campo, problema in sorted(rep.errores):
        print(f"{archivo}: {campo}: {problema}", file=sys.stderr)
    if rep.errores:
        print(f"\nvalidar: {len(rep.errores)} problema(s) en {len({e[0] for e in rep.errores})} archivo(s)", file=sys.stderr)
        return 1
    print(f"validar: OK ({len(docs)} documentos)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
