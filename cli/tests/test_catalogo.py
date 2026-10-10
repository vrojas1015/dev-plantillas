"""Lógica del catálogo: leer y validar catalogo.yaml (sin CLI)."""

from pathlib import Path

import pytest

from dp.catalogo import CatalogoInvalido, Plantilla, cargar_catalogo


def test_carga_las_plantillas_en_el_orden_del_archivo(catalogo: Path):
    plantillas = cargar_catalogo(catalogo)

    assert [p.nombre for p in plantillas] == ["go-grpc-service", "angular-app", "protos"]
    assert plantillas[0] == Plantilla(
        nombre="go-grpc-service",
        repo="gh:ejemplo/template-go-grpc-service",
        tipo="backend",
        lenguaje="go",
        descripcion="Servicio Go",
    )


def test_ignora_campos_opcionales_que_todavia_no_usa(escribir_catalogo):
    ruta = escribir_catalogo(
        "version: 1\n"
        "plantillas:\n"
        "  - nombre: docs\n"
        "    repo: gh:ejemplo/template-docs\n"
        "    tipo: docs\n"
        "    lenguaje: markdown\n"
        "    descripcion: Documentación\n"
        '    destino_por_defecto: "{nombre}"\n'
        "    atajos: {ci: ci_provider}\n"
    )
    assert cargar_catalogo(ruta)[0].nombre == "docs"


def test_archivo_inexistente(tmp_path: Path):
    with pytest.raises(CatalogoInvalido, match="no existe"):
        cargar_catalogo(tmp_path / "no-esta.yaml")


def test_yaml_roto(escribir_catalogo):
    ruta = escribir_catalogo("version: 1\nplantillas: [\n")
    with pytest.raises(CatalogoInvalido, match="YAML"):
        cargar_catalogo(ruta)


def test_version_no_soportada(escribir_catalogo):
    ruta = escribir_catalogo("version: 2\nplantillas: []\n")
    with pytest.raises(CatalogoInvalido, match="version"):
        cargar_catalogo(ruta)


@pytest.mark.parametrize("campo", ["nombre", "repo", "tipo", "lenguaje", "descripcion"])
def test_falta_un_campo_obligatorio(escribir_catalogo, campo: str):
    entrada = {
        "nombre": "x",
        "repo": "gh:ejemplo/x",
        "tipo": "backend",
        "lenguaje": "go",
        "descripcion": "X",
    }
    del entrada[campo]
    lineas = "\n".join(f"    {k}: {v}" for k, v in entrada.items())
    ruta = escribir_catalogo(f"version: 1\nplantillas:\n  -\n{lineas}\n")

    # El mensaje tiene que decir qué campo falta.
    with pytest.raises(CatalogoInvalido, match=campo):
        cargar_catalogo(ruta)


def test_tipo_desconocido(escribir_catalogo):
    ruta = escribir_catalogo(
        "version: 1\n"
        "plantillas:\n"
        '  - {nombre: x, repo: "gh:e/x", tipo: servidor, lenguaje: go, descripcion: X}\n'
    )
    with pytest.raises(CatalogoInvalido, match="servidor"):
        cargar_catalogo(ruta)


def test_nombres_duplicados(escribir_catalogo):
    ruta = escribir_catalogo(
        "version: 1\n"
        "plantillas:\n"
        '  - {nombre: x, repo: "gh:e/x", tipo: backend, lenguaje: go, descripcion: X}\n'
        '  - {nombre: x, repo: "gh:e/y", tipo: front, lenguaje: ts, descripcion: Y}\n'
    )
    with pytest.raises(CatalogoInvalido, match="duplicad"):
        cargar_catalogo(ruta)


def test_el_catalogo_real_del_repo_es_valido():
    raiz = Path(__file__).resolve().parents[2]
    plantillas = cargar_catalogo(raiz / "catalogo.yaml")
    assert {"go-grpc-service", "angular-app", "protos", "docs"} <= {p.nombre for p in plantillas}
