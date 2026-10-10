# Plantilla `protos`

Plantilla [Copier](https://copier.readthedocs.io/) para el **repo de contratos
gRPC** de una organización: `.proto` con [buf](https://buf.build) v2 (lint,
breaking, managed mode, plugins remotos de la BSR) y código generado
**commiteado** y distribuible para Go, Python, TypeScript/JavaScript, Java,
Kotlin y Swift (los que se elijan).

Este README y `copier.yml` son meta-archivos: **no** se copian al repo
generado. El contenido vive en `template/` (`_subdirectory`); los `.jinja` se
renderizan y el resto se copia tal cual.

## Qué genera

```
<repo_name>/
├── proto/<first_package>/v1/item.proto   # ItemService de ejemplo (= el de go-grpc-service)
├── buf.yaml, buf.gen.yaml                # lint STANDARD, breaking FILE, managed mode, plugins fijados
├── buf.lock                              # http_gateway: googleapis fijado
├── go.mod, go.sum, gen/go/               # go: módulo <module_path>, import <module_path>/gen/go/<pkg>/v1
├── gen/go/**/*.pb.gw.go, gen/openapi/    # http_gateway: grpc-gateway (REST) + OpenAPI v2 embebido
├── gen/python/pyproject.toml             # python: paquete <python_package> (hatchling) + código generado
├── gen/ts/{package.json,tsconfig.json}   # typescript: <npm_package>, JS ESM + .d.ts en gen/ts/lib
├── gen/jvm/ (Gradle KTS + wrapper)       # java/kotlin: <maven_group>:<repo_name>, src/main/{java,kotlin}
├── Package.swift, gen/swift/             # swift: producto SPM <swift_module> (SwiftProtobuf + Connect-Swift)
├── scripts/generate.sh                   # buf generate + limpieza (+ imports de Python)
├── scripts/version.sh, scripts/release.sh
├── Makefile                              # lint, breaking, generate, check, release VERSION=x.y.z
├── .gitlab-ci.yml | .github/workflows/ci.yml, plantilla de MR/PR
├── docs/{consumir,publicar,co-desarrollo}.md
├── CLAUDE.md, .claude/settings.json, README.md
└── .copier-answers.yml
```

Solo aparecen los archivos de los lenguajes elegidos (con `languages=[go]` no
hay `gen/python`, `gen/ts`, `gen/jvm` ni `Package.swift`). El código de `gen/`
**no** viene en la plantilla (depende de las respuestas): se crea con
`make generate` después del `copy` y se commitea.

## Requisitos

- Python + `pip install copier` (>= 9.0; probado con 9.18.2)
- `buf` 1.71+ e internet (plugins remotos) y bash (en Windows, Git Bash) + make
- Según los lenguajes: Go 1.25+ (`GOTOOLCHAIN=auto` alcanza), Python 3.10+,
  Node 24+, JDK 17+ (el wrapper baja Gradle), Swift 6.2+ (Xcode 26+ o Docker `swift:6.4`)

## Generar

```bash
copier copy --defaults \
  --data org_name=mi-org \
  --data ci_provider=gitlab \
  --data 'languages=["go","python","typescript"]' \
  <origen-de-la-plantilla> ./protos
cd protos
git init -b main && make generate && make check
git add . && git add --chmod=+x scripts/*.sh && git commit -m "Scaffold inicial"
```

(Con java/kotlin: `git add --chmod=+x gen/jvm/gradlew` también.)

## Preguntas (`copier.yml`)

| Pregunta | Default | Uso |
|---|---|---|
| `repo_name` | `protos` | Nombre del repo; artifactId Maven |
| `org_name` | `mi-org` | Grupo/owner; base de los defaults |
| `ci_provider` | `gitlab` | `.gitlab-ci.yml` (registries de GitLab) o `.github/workflows/ci.yml` (GitHub Packages/Releases) |
| `dueño` | `@<org_name>/backend` | `CODEOWNERS` y `SECURITY.md` (`@usuario` o `@org/equipo`; base común, `docs/10` de dev-plantillas) |
| `docs_repo` | vacío | URL del repo de docs: la plantilla de MR/PR enlaza la carpeta del issue ahí |
| `languages` | `go, python, typescript` | Multiselect: `go`, `python`, `typescript`, `java`, `kotlin`, `swift`. `kotlin` implica `java` |
| `module_path` | `<gitlab.com\|github.com>/<org>/<repo>` | Solo go. `module` de `go.mod` y `go_package_prefix` |
| `http_gateway` | `true` si hay go | Solo go. Anotaciones `google.api.http` en el ejemplo, dep `buf.build/googleapis/googleapis` y plugins `grpc-ecosystem/gateway` + `openapiv2` (ver "REST para el api-gateway") |
| `python_package` | `<org>_<repo>` | Solo python. Nombre de import y de distribución |
| `npm_package` | `@<org>/<repo>` | Solo typescript. Scope = grupo/owner del registry |
| `maven_group` | `com.<org>` | Solo java/kotlin. groupId y `java_package_prefix` |
| `swift_module` | `<Org><Repo>` | Solo swift. Producto/módulo SPM |
| `first_package` | `example` | `proto/<pkg>/v1/item.proto`, package `<pkg>.v1` |

Derivados (no se guardan; se recalculan): `l_go`, `l_gw`, `l_py`, `l_ts`, `l_jvm`,
`l_kt`, `l_sw`, `ci_gl`, `ci_gh` (flags cortos para nombres condicionales:
rutas de Windows) y `repo_url`.

## Decisiones

- **Plugins remotos de la BSR con versión fijada** (nada de `protoc-gen-*`
  locales). Versiones y runtimes: tabla en `docs/publicar.md` del proyecto.
  | Lenguaje | Plugins |
  |---|---|
  | Go | `protocolbuffers/go:v1.36.12`, `grpc/go:v1.6.2` |
  | Python | `protocolbuffers/python:v36.2`, `protocolbuffers/pyi:v36.2`, `grpc/python:v1.84.0` |
  | TS/JS | `bufbuild/es:v2.16.0` (`target=js+dts`, `import_extension=js`) |
  | Java | `protocolbuffers/java:v36.2`, `grpc/java:v1.84.1` |
  | Kotlin | `protocolbuffers/kotlin:v36.2`, `grpc/kotlin:v1.5.0` |
  | Swift | `apple/swift:v1.38.1`, `connectrpc/swift:v1.2.3` |
- **Go**: `go.mod` en la raíz (module = `module_path`), código en `gen/go`. El
  path de import (`<module_path>/gen/go/<pkg>/v1`, package `<pkg>v1`) es el
  mismo patrón que `go-grpc-service`, así que un servicio cambia solo el import.
- **Python**: los plugins generan imports absolutos desde la raíz de `proto/`
  (`from example.v1 import ...`); `scripts/fix_py_imports.py` los reescribe a
  `<python_package>.example.v1` y agrega `__init__.py` y `py.typed`.
  `protobuf>=7.36.2,<8` porque el código generado valida el runtime al importar.
- **TS**: `target=js+dts` en vez de `.ts` + build: el paquete funciona en
  JavaScript puro con Node (Node no hace type-stripping en `node_modules`) y en
  TS, sin paso de build ni `dist/` fuera de git. Sin `package-lock.json`
  (librería); CI usa `npm install`. connect-es v2 no necesita plugin propio:
  usa los descriptores de servicio de protobuf-es.
- **JVM**: un solo proyecto Gradle `gen/jvm` (Java + Kotlin en el mismo
  artefacto: el DSL de Kotlin depende de las clases Java). Bytecode 17 sin
  toolchains (compila con cualquier JDK >= 17). Wrapper Gradle 9.8.1 con
  checksum.
- **Swift**: Connect-Swift en vez de grpc-swift: cliente sobre URLSession
  pensado para apps Apple (Connect/gRPC-Web, y gRPC nativo con ConnectNIO), iOS
  15+; grpc-swift 2 exige iOS 18 y apunta más a servidores. SPM exige
  `Package.swift` en la raíz y usa el tag como versión.
- **Versión**: el tag `vX.Y.Z`. `make release` escribe la versión en
  `pyproject.toml`/`package.json`/`gradle.properties`, commitea y taggea (sin
  push); CI en el tag **verifica** que coincidan (no las setea), así lo que hay
  en el tag es lo publicado.
- **Breaking** en CI: contra la rama destino en MR/PR, contra el último tag en
  la rama default. Regla FILE (la más estricta).
- **REST para el api-gateway** (`http_gateway`, default con Go): el código del
  gateway (`*.pb.gw.go`) y el OpenAPI se generan **acá**, junto al resto, con
  plugins remotos fijados (`grpc-ecosystem/gateway:v2.30.0`,
  `openapiv2:v2.30.0`; v2.30 porque v2.31 exige Go 1.26 y obligaría a subir
  el `go` de todos los consumidores). Así el gateway solo importa paquetes
  generados y la plantilla `api-gateway` no necesita buf. googleapis entra
  como dep de la BSR (`buf.lock` fijado) **fuera del managed mode**. El
  import de `google/api/annotations.proto` afecta a todos los lenguajes:
  Python agrega `googleapis-common-protos`, TS genera `google/api/*` junto
  (`include_imports`), JVM agrega `proto-google-common-protos`; Swift no lo
  referencia. Agregar opciones `google.api.http` no es breaking (`buf
  breaking` FILE pasa). Con `http_gateway=false` el repo queda idéntico al de
  antes de esta opción.

## Verificar cambios en la plantilla

Generar en un directorio temporal con todos los lenguajes y con subconjuntos
(solo `go`; `python`+`typescript`), con ambos `ci_provider`, y en cada uno:

```bash
git init -b main && make generate && make check-gen   # (2da corrida sin diff)
make check-go check-py check-ts
docker run --rm -v "$PWD:/p" -w /p/gen/jvm eclipse-temurin:21 sh ./gradlew --no-daemon build
docker run --rm -v "$PWD:/p" -w /p swift:6.4 swift build
```

`buf breaking`: commit base, cambiar el número de un campo → `make breaking`
falla; agregar un campo nuevo → pasa. YAML de CI: `actionlint` (GitHub) y
parseo de `.gitlab-ci.yml`.

`copier update` necesita la plantilla en un repo git propio con tags (igual que
`go-grpc-service`: `scripts/publish-template.sh protos vX.Y.Z <remote>`).

## Limitaciones conocidas

- Los plugins remotos sin autenticar tienen **rate limit** en la BSR
  (`resource_exhausted: too many requests`); en CI conviene `BUF_TOKEN`.
- Python: un consumidor atado a protobuf 5.x/6.x no puede usar el paquete sin
  bajar la versión de los plugins (ver `docs/publicar.md`).
- Swift: Connect-Swift con URLSession no habla gRPC "puro" con trailers HTTP/2:
  el backend tiene que exponer Connect o gRPC-Web (o usar ConnectNIO).
- Dependencias de la BSR distintas de googleapis: hay que excluirlas del
  managed mode (`disable` en `buf.gen.yaml`) y agregar sus runtimes a mano.
- `http_gateway` con java/kotlin/swift no se verificó en CI (sí go, python y
  typescript): ver "Verificar cambios en la plantilla".
