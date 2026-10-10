"""Escenarios de aceptación (CU-<issue>-<n>) y el registro de la suite e2e.

El repo `e2e-tests` publica `registro.json` (escenario -> estado -> última
corrida -> enlace; esquema en su `esquemas/registro.schema.json`). Este repo lo
LEE (modelo pull, docs/10 §7) cuando `REGISTRO_E2E` apunta a él:

    REGISTRO_E2E=../e2e-tests/reportes/registro.json make generar
    REGISTRO_E2E=https://.../registro.json REGISTRO_E2E_TOKEN=... make validar

Sin `REGISTRO_E2E` nada de esto se activa: ni la página de estado ni la regla
de `validar` (quien no usa e2e no ve ningún cambio).

Sólo stdlib.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from comun import RAIZ, Documento

# Identificador de escenario en el cuerpo de un issue: **CU-042-1** Dado ...
RE_CU = re.compile(r"\bCU-(\d+)-(\d+)\b")

ICONOS = {"pasa": "✅", "falla": "❌", "inestable": "⚠️", "pendiente": "🔧"}
SIN_TEST = "sin-test"
ICONO_SIN_TEST = "🔧"


class ErrorRegistro(Exception):
    """El registro está configurado pero no se puede leer o no es válido."""


@dataclass
class Registro:
    origen: str
    datos: dict
    # (issue, n) -> entrada del registro
    por_clave: dict[tuple[int, int], dict]
    # (issue, n) -> id tal como está en el registro
    ids: dict[tuple[int, int], str]


def origen() -> str | None:
    """Ruta o URL del registro (variable REGISTRO_E2E), o None si no hay."""
    valor = os.environ.get("REGISTRO_E2E", "").strip()
    return valor or None


def clave(texto: str) -> tuple[int, int] | None:
    """'CU-042-1' -> (42, 1). Los ceros a la izquierda no importan."""
    m = RE_CU.search(texto)
    return (int(m.group(1)), int(m.group(2))) if m else None


def nombre(c: tuple[int, int]) -> str:
    return f"CU-{c[0]:03d}-{c[1]}"


def _leer(fuente: str) -> bytes:
    if re.match(r"^https?://", fuente):
        req = urllib.request.Request(fuente, headers={"Accept": "application/json"})
        token = os.environ.get("REGISTRO_E2E_TOKEN", "").strip()
        if token:
            if "/api/v4/" in fuente:  # API de GitLab
                req.add_header("PRIVATE-TOKEN", token)
            else:
                req.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                return res.read()
        except (urllib.error.URLError, TimeoutError) as e:
            raise ErrorRegistro(f"no se pudo descargar {fuente}: {e}") from e
    ruta = Path(fuente)
    if not ruta.is_absolute():
        ruta = RAIZ / ruta
    try:
        return ruta.read_bytes()
    except OSError as e:
        raise ErrorRegistro(f"no se pudo leer {fuente}: {e.strerror or e}") from e


def cargar(fuente: str) -> Registro:
    try:
        datos = json.loads(_leer(fuente).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise ErrorRegistro(f"{fuente} no es JSON válido: {e}") from e
    if not isinstance(datos, dict) or datos.get("version") != 1:
        raise ErrorRegistro(f"{fuente}: versión de registro no soportada (se espera version: 1)")
    escenarios = datos.get("escenarios")
    if not isinstance(escenarios, dict):
        raise ErrorRegistro(f"{fuente}: falta `escenarios`")
    por_clave: dict[tuple[int, int], dict] = {}
    ids: dict[tuple[int, int], str] = {}
    for ident, entrada in escenarios.items():
        c = clave(str(ident))
        if c and isinstance(entrada, dict) and entrada.get("estado") in ICONOS:
            por_clave[c] = entrada
            ids[c] = str(ident)
    return Registro(origen=fuente, datos=datos, por_clave=por_clave, ids=ids)


def de_issue(doc: Documento) -> list[tuple[int, int]]:
    """Escenarios CU-<id>-<n> del cuerpo de un issue (sólo los de su propio id), en orden."""
    ident = doc.meta.get("id")
    vistos: list[tuple[int, int]] = []
    cuerpo = re.sub(r"<!--.*?-->", "", doc.cuerpo, flags=re.DOTALL)  # los comentarios son ayuda, no escenarios
    for m in RE_CU.finditer(cuerpo):
        c = (int(m.group(1)), int(m.group(2)))
        if c[0] == ident and c not in vistos:
            vistos.append(c)
    return vistos


def estado(reg: Registro, c: tuple[int, int]) -> str:
    entrada = reg.por_clave.get(c)
    return entrada["estado"] if entrada else SIN_TEST


def icono(est: str) -> str:
    return ICONOS.get(est, ICONO_SIN_TEST)
