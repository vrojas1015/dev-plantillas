"""`dp list` y `dp --version`, probados como los usa una persona."""

import json
from pathlib import Path

from typer.testing import CliRunner

from dp import __version__
from dp.main import app

runner = CliRunner()


def test_version():
    resultado = runner.invoke(app, ["--version"])

    assert resultado.exit_code == 0
    assert resultado.stdout.strip() == f"dp {__version__}"


def test_list_muestra_todas_las_plantillas(catalogo: Path):
    resultado = runner.invoke(app, ["list", "--catalogo", str(catalogo)])

    assert resultado.exit_code == 0
    for nombre in ("go-grpc-service", "angular-app", "protos"):
        assert nombre in resultado.stdout


def test_list_filtra_por_tipo(catalogo: Path):
    resultado = runner.invoke(app, ["list", "--catalogo", str(catalogo), "--tipo", "front"])

    assert resultado.exit_code == 0
    assert "angular-app" in resultado.stdout
    assert "go-grpc-service" not in resultado.stdout


def test_list_tipo_inexistente_es_error_de_usuario(catalogo: Path):
    resultado = runner.invoke(app, ["list", "--catalogo", str(catalogo), "--tipo", "servidor"])

    assert resultado.exit_code == 1
    # Dice cuáles son los tipos válidos para que el usuario corrija.
    assert "backend" in resultado.output


def test_list_json_es_estable(catalogo: Path):
    resultado = runner.invoke(app, ["list", "--catalogo", str(catalogo), "--json"])

    assert resultado.exit_code == 0
    datos = json.loads(resultado.stdout)
    assert [d["nombre"] for d in datos] == ["go-grpc-service", "angular-app", "protos"]
    assert set(datos[0]) == {"nombre", "repo", "tipo", "lenguaje", "descripcion"}


def test_list_json_respeta_el_filtro(catalogo: Path):
    resultado = runner.invoke(
        app, ["list", "--catalogo", str(catalogo), "--tipo", "contratos", "--json"]
    )

    assert resultado.exit_code == 0
    assert [d["nombre"] for d in json.loads(resultado.stdout)] == ["protos"]


def test_catalogo_invalido_sin_traceback(escribir_catalogo):
    ruta = escribir_catalogo("version: 2\nplantillas: []\n")

    resultado = runner.invoke(app, ["list", "--catalogo", str(ruta)])

    assert resultado.exit_code == 1
    assert "Traceback" not in resultado.output
    assert "version" in resultado.output


def test_busca_catalogo_yaml_subiendo_desde_el_directorio_actual(catalogo: Path, monkeypatch):
    subcarpeta = catalogo.parent / "a" / "b"
    subcarpeta.mkdir(parents=True)
    monkeypatch.chdir(subcarpeta)
    monkeypatch.delenv("DP_CATALOGO", raising=False)

    resultado = runner.invoke(app, ["list", "--json"])

    assert resultado.exit_code == 0
    assert len(json.loads(resultado.stdout)) == 3


def test_variable_de_entorno_dp_catalogo(catalogo: Path, tmp_path: Path, monkeypatch):
    otra = tmp_path / "otra"
    otra.mkdir()
    monkeypatch.chdir(otra)
    monkeypatch.setenv("DP_CATALOGO", str(catalogo))

    resultado = runner.invoke(app, ["list", "--json"])

    assert resultado.exit_code == 0
    assert len(json.loads(resultado.stdout)) == 3


def test_sin_catalogo_en_ningun_lado(tmp_path: Path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("DP_CATALOGO", raising=False)

    resultado = runner.invoke(app, ["list"])

    assert resultado.exit_code == 1
    assert "catalogo.yaml" in resultado.output
