"""Fixtures compartidas por los tests de dp."""

from pathlib import Path

import pytest

CATALOGO_MINIMO = """\
version: 1
plantillas:
  - nombre: go-grpc-service
    repo: gh:ejemplo/template-go-grpc-service
    tipo: backend
    lenguaje: go
    descripcion: Servicio Go
  - nombre: angular-app
    repo: gh:ejemplo/template-angular-app
    tipo: front
    lenguaje: typescript
    descripcion: App Angular
  - nombre: protos
    repo: gh:ejemplo/template-protos
    tipo: contratos
    lenguaje: proto
    descripcion: Contratos gRPC
"""


@pytest.fixture
def catalogo(tmp_path: Path) -> Path:
    """Un catálogo válido con tres plantillas, en un directorio temporal."""
    ruta = tmp_path / "catalogo.yaml"
    ruta.write_text(CATALOGO_MINIMO, encoding="utf-8")
    return ruta


@pytest.fixture
def escribir_catalogo(tmp_path: Path):
    """Escribe un catálogo con el contenido dado y devuelve su ruta."""

    def _escribir(contenido: str) -> Path:
        ruta = tmp_path / "catalogo.yaml"
        ruta.write_text(contenido, encoding="utf-8")
        return ruta

    return _escribir
