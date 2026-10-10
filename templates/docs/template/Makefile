# Comandos del repo de documentación (`make` o `make ayuda` para la lista).
# Windows: Git Bash + make (`choco install make` o `winget install ezwinports.make`).
# Sin make: los equivalentes `python scripts/...` están en README.md › Comandos.

.DEFAULT_GOAL := ayuda
SHELL := bash

# Python: el de .venv/ si existe (make instalar); si no, python3 o python.
SYS_PY := $(shell python3 -c "" >/dev/null 2>&1 && echo python3 || echo python)
ifneq ($(wildcard .venv/Scripts/python.exe),)
PY ?= .venv/Scripts/python.exe
else ifneq ($(wildcard .venv/bin/python),)
PY ?= .venv/bin/python
else
PY ?= $(SYS_PY)
endif

# markdownlint-cli2 con Node (npx) o, si no hay Node, con Docker.
# `make validar MDLINT=` lo saltea (sólo local: el CI siempre lo corre).
MARKDOWNLINT_VERSION := 0.23.3
MDLINT ?= $(shell \
  if command -v npx >/dev/null 2>&1; then echo "npx --yes markdownlint-cli2@$(MARKDOWNLINT_VERSION)"; \
  elif command -v docker >/dev/null 2>&1; then echo "MSYS_NO_PATHCONV=1 docker run --rm --mount type=bind,src=$(CURDIR),dst=/workdir davidanson/markdownlint-cli2:v$(MARKDOWNLINT_VERSION)"; \
  fi)

# mkdocs queda fijo en 1.6.x (requirements.txt): el aviso de Material sobre MkDocs 2.0 no aplica.
export NO_MKDOCS_2_WARNING := 1

.PHONY: ayuda instalar nuevo validar validar-frontmatter validar-markdown generar comprobar-generado servir construir limpiar

ayuda: ## Esta ayuda
	@grep -E '^[a-z-]+:.*## ' $(firstword $(MAKEFILE_LIST)) | sed -E 's/:.*## /\t/' | expand -t 22

instalar: ## Crea .venv/ e instala requirements.txt
	$(SYS_PY) -m venv .venv
	@if [ -x .venv/Scripts/python.exe ]; then p=.venv/Scripts/python.exe; else p=.venv/bin/python; fi; \
	  $$p -m pip install --quiet --upgrade pip && $$p -m pip install --quiet -r requirements.txt && echo "listo: $$p"

nuevo: ## TIPO=issue|plan|adr|runbook|postmortem|release|servicio TITULO="..." [REPOS=a,b ISSUE= VERSION= ...]
	@test -n "$(TIPO)" || { echo 'uso: make nuevo TIPO=issue|plan|adr|runbook|postmortem|release|servicio TITULO="..."'; exit 2; }
	@$(PY) scripts/nuevo.py "$(TIPO)" --titulo "$(TITULO)" --repos "$(REPOS)" --area "$(AREA)" \
	  --prioridad "$(PRIORIDAD)" --clase "$(CLASE)" --version "$(VERSION)" --fecha "$(FECHA)" \
	  $(if $(ISSUE),--issue "$(ISSUE)")

validar: validar-frontmatter validar-markdown ## Frontmatter (esquemas, ids, fichas) + markdownlint

validar-frontmatter: ## Sólo el frontmatter (scripts/validar.py)
	@$(PY) scripts/validar.py

validar-markdown: ## Sólo markdownlint (.markdownlint-cli2.yaml)
	@if [ -z "$(strip $(MDLINT))" ]; then echo "aviso: markdownlint salteado (no hay npx ni docker, o MDLINT=)"; \
	else $(MDLINT) && echo "markdownlint: OK"; fi

generar: ## Regenera contenido/_generado/
	@$(PY) scripts/generar.py

comprobar-generado: ## Falla si contenido/_generado/ está desactualizado (no escribe)
	@$(PY) scripts/generar.py --comprobar

servir: ## Sitio en http://localhost:8000 (recarga al guardar)
	$(PY) -m mkdocs serve

construir: ## mkdocs build --strict en site/ (un enlace roto falla)
	$(PY) -m mkdocs build --strict

limpiar: ## Borra site/
	rm -rf site
