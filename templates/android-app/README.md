# Plantilla `android-app`

Plantilla [Copier](https://copier.readthedocs.io/) para apps **Android nativas**:
Kotlin + Jetpack Compose + Material 3, Hilt, Room (offline primero), DataStore,
navegación type-safe, cliente **REST** del api-gateway (Ktor) o **gRPC** con los
stubs del repo `protos`, Firebase opcional (Auth, App Check, FCM, Crashlytics),
flavors `qa`/`prod`, firma con upload key desde el CI, Gradle Play Publisher y
CI en GitLab o GitHub. Especificación y decisión: `docs/09-movil-android.md`.

Este README y `copier.yml` son meta-archivos: **no** se copian al proyecto. El
contenido vive en `template/` (`_subdirectory`); los `.jinja` se renderizan y el
resto se copia tal cual.

## Qué genera

```
<app>/
├── app/                      Application, MainActivity, AppNavHost, login, DI, flavors, firma, play { }
├── core/
│   ├── model/  domain/       Kotlin puro (kotlin("jvm")): modelos, AppError, repositorios, casos de uso
│   ├── data/                 OfflineFirstItemsRepository (Room = fuente de verdad)
│   ├── network/              Ktor + kotlinx.serialization (rest) | grpc-kotlin + OkHttp (grpc)
│   ├── database/ datastore/  Room (+ schemas/) · DataStore
│   ├── auth/                 Firebase Auth + App Check | sesión de desarrollo (token fijo)
│   ├── designsystem/ ui/     tema Material 3 · ErrorMessage, Loading
│   └── testing/              fakes + MainDispatcherRule (Kotlin puro)
├── feature/items/            lista + detalle: ViewModels (StateFlow<UiState>), pantallas, rutas
├── baselineprofile/          generador de baseline profiles (com.android.test)
├── build-logic/convention/   convention plugins (app.android.*, app.jvm.library, app.hilt)
├── gradle/libs.versions.toml única fuente de versiones · wrapper 9.7.1 con checksum
├── config/detekt/detekt.yml  · .editorconfig (ktlint + reglas de Compose)
├── scripts/android-sdk.sh    SDK mínimo para CI/Docker · scripts/release-notes.sh (CHANGELOG -> Play)
├── .gitlab-ci.yml | .github/workflows/{ci,release,rollout}.yml + plantilla de MR/PR
├── docs/                     ci-cd, play-console, firebase|auth, app-check-gateway, protos (grpc), baseline-profile, kmp
└── CLAUDE.md (≤120 líneas), .claude/settings.json, README.md, CHANGELOG.md
```

Las rutas Kotlin siguen el paquete (`src/main/kotlin/<com/miorg/miapp>/core/...`).
Verificado en Windows: con un `application_id` de 60 caracteres generado en
`C:\dev\tmp-org-android\mobile\mi-app-de-prueba` la ruta más larga es de 182
caracteres y `git add` funciona sin `core.longpaths`; dentro de la plantilla la
más larga es de 124 caracteres desde la raíz del repo.

## Preguntas

| Pregunta | Default | Uso |
|---|---|---|
| `app_name` | `Mi App` | Nombre visible (launcher, Play); `rootProject.name` = slug (`mi-app`) |
| `application_id` | `com.miorg.miapp` | applicationId y paquete base. Validado como paquete Java (sin palabras reservadas). **Inmutable** una vez publicada |
| `min_sdk` | `26` | 26–36 (26: ícono adaptativo y `java.time` sin desugaring) |
| `cliente_api` | `rest` | `rest` (Ktor contra `/v1/items` del api-gateway) o `grpc` (stubs grpc-kotlin) |
| `api_base_url_qa` / `_prod` | `https://api-qa.example.com` / `https://api.example.com` | `BuildConfig.API_BASE_URL` por flavor (prod exige https) |
| `protos_maven` | `com.miorg:protos:0.1.0` | Solo grpc. Artefacto de la plantilla `protos` (kotlin) |
| `protos_paquete` | `<grupo>.example.v1` | Solo grpc. Paquete Kotlin del `ItemService` generado |
| `firebase` | `true` | Auth + App Check + FCM + Crashlytics. `false`: sesión de desarrollo con token fijo |
| `ci_provider` | `gitlab` | `gitlab` o `github` |
| `dueño` | `@mi-org/movil` | `CODEOWNERS` y `SECURITY.md` (`@usuario` o `@org/equipo`; base común, `docs/10` de dev-plantillas) |
| `docs_repo` | vacío | URL del repo de docs: la plantilla de MR/PR enlaza la carpeta del issue ahí |

Derivados (no se guardan): `pkg`, `slug`, `rest`, `grpc`, `fb`, `ci_gl`, `ci_gh`.
Los archivos que dependen de las respuestas tienen nombre normal y se excluyen
con patrones Jinja en `_exclude` (no con nombres `{% if %}`): las rutas Kotlin
ya son largas y Windows corta en 260. Solo el CI usa nombres condicionales
(`{% if ci_gh %}.github{% endif %}`), como el resto de las plantillas.

## Versiones fijadas (octubre de 2026, verificadas en Maven Central / Google Maven / Gradle)

| Qué | Versión | Nota |
|---|---|---|
| Kotlin (+ plugin de Compose) | 2.4.21 | El compilador de Compose es el plugin de Kotlin: misma versión |
| AGP | 9.4.1 | Kotlin integrado (sin `kotlin-android`); exige Gradle ≥ 9.6, JDK 17+ |
| Gradle (wrapper) | 9.7.1 | Con `distributionSha256Sum`. Última dentro del rango probado de KGP 2.4.21 (≤ 9.7) y ≥ el mínimo de AGP 9.4 |
| KSP | 2.3.12 | KSP2, independiente de la versión de Kotlin |
| compileSdk / targetSdk | 37 | build-tools 36.0.0 (default de AGP 9.4) |
| Compose BOM | 2026.09.00 | |
| Hilt / androidx.hilt | 2.60.1 / 1.4.0 | `hiltViewModel()` de `hilt-lifecycle-viewmodel-compose` |
| Room / DataStore | 2.8.5 / 1.2.1 | Room 2.x con KSP (Room 3 es otro paquete, `androidx.room3`) |
| Navigation Compose / Lifecycle / Activity / Core | 2.10.2 / 2.11.0 / 1.13.0 / 1.19.1 | |
| Ktor / OkHttp (MockWebServer) | 3.6.0 / 5.5.0 | rest |
| grpc-java (BOM) | 1.84.2 | grpc; los stubs vienen del artefacto protos (grpc-kotlin 1.5.0) |
| kotlinx.serialization / coroutines | 1.11.0 / 1.11.0 | |
| JUnit 4 / JUnit 6 (Jupiter) / Turbine / Robolectric | 4.13.2 / 6.1.3 / 1.2.1 / 4.17 | |
| ktlint-gradle / ktlint / compose-rules | 14.2.0 / 1.8.0 / 0.6.8 | |
| detekt | 1.23.8 | Última estable (2.0 está en alpha); corre con su Kotlin 2.0.21 |
| Firebase BOM / google-services / Crashlytics plugin | 35.0.0 / 4.5.0 / 3.0.8 | firebase |
| Gradle Play Publisher | 4.1.1 | 4.x = soporte de AGP 9 |
| Baseline profile plugin / benchmark / uiautomator | 1.5.0 / 1.5.0 / 2.4.0 | |

## Generar

```powershell
python -m copier copy --defaults `
  --data "app_name=Mi App" --data application_id=com.miorg.miapp `
  --data cliente_api=rest --data firebase=true --data ci_provider=gitlab `
  C:\dev\<org>\plantillas\templates\android-app C:\dev\<org>\mobile\mi-app
```

`copier update` necesita la plantilla en su propio repo con tags (`scripts/publish-template.sh android-app vX.Y.Z <remote>`).

Al commitear la plantilla (o el proyecto generado) desde Windows, marcar los
scripts como ejecutables: `git add --chmod=+x gradlew scripts/*.sh` (en la
plantilla: `templates/android-app/template/gradlew` y `.../scripts/*.sh`).

## Decisiones

- **REST con Ktor** (no Retrofit): multiplataforma (camino a KMP sin cambiar de
  librería), corrutinas nativas, y el interceptor de auth (renovar token ante 401
  y reintentar una vez) es un `HttpSend.intercept` corto. Motor OkHttp.
  Modelos JSON escritos a mano con la forma de grpc-gateway (lowerCamelCase,
  `{"items", "page": {"nextCursor", "hasNext"}}`, error `{"error": {"code", "message", "request_id"}}`).
- **gRPC**: stubs de corrutinas de `grpc-kotlin` del artefacto Maven de `protos`
  (no Connect-Kotlin: es lo que ya genera y prueba esa plantilla), transporte
  `grpc-okhttp`, token como metadata por llamada (no `CallCredentials`, para
  poder renovarlo con `suspend`), reintentos de lecturas por service config.
  Repositorios: el registry del repo protos (`PROTOS_MAVEN_URL`) + `mavenLocal()`
  filtrado al grupo para co-desarrollo.
- **ktlint (jlleitschuh) + reglas de Compose**, no Spotless: la tarea
  `ktlintCheck` es la de la especificación y el plugin soporta el Kotlin integrado
  de AGP 9 desde 14.1. detekt sin baseline; `!!` y `GlobalScope` prohibidos por regla.
- **Kotlin puro verificado**: `core:model`/`core:domain` (y `core:testing`) usan
  `app.jvm.library`; la tarea `verificarKotlinPuro` (antes de compilar y en
  `check`/`testDebugUnitTest`) falla si el grafo de dependencias trae algo de
  Android, y `settings.gradle.kts` falla si alguien les aplica un plugin Android.
- **Tests**: JUnit 4 en módulos Android (Robolectric y `createComposeRule` son de
  JUnit 4), `kotlin.test` sobre JUnit 6 en los módulos Kotlin puro (lo mismo que
  usaría KMP). Turbine para Flows. Roborazzi no se incluye (opcional).
- **Firebase sin `google-services.json`**: los plugins de Google Services y
  Crashlytics solo se aplican si están los dos JSON (qa y prod); si faltan, los
  builds de release fallan con un mensaje claro y el debug usa la sesión de
  desarrollo. El proveedor de debug de App Check se instala solo con
  `BuildConfig.DEBUG` (R8 lo elimina del release) para que compilen también los
  build types que agrega el plugin de baseline profile.
- **Publicación**: dos apps en Play (qa y prod tienen applicationId propio).
  `qa-v*` → interna de QA; `prod-v*` → interna de prod y producción 10 % → 50 % →
  100 % con aprobación manual. Credenciales por `ANDROID_PUBLISHER_CREDENTIALS`.
- **min_sdk ≥ 26**: ícono adaptativo sin PNG de respaldo y `java.time` sin desugaring.

## Verificar cambios en la plantilla

Sin JDK ni SDK locales, todo en Docker (`eclipse-temurin:21-jdk` + volúmenes
para el SDK y la caché de Gradle):

```bash
docker volume create android-sdk && docker volume create gradle-cache
copier copy --defaults --trust -d cliente_api=rest -d firebase=true templates/android-app /tmp/a1
docker run --rm -v /tmp/a1:/app -w /app -v android-sdk:/sdk -e ANDROID_HOME=/sdk \
  -v gradle-cache:/root/.gradle eclipse-temurin:21-jdk bash -c \
  "apt-get update -qq && apt-get install -y -qq unzip >/dev/null && bash scripts/android-sdk.sh && \
   ./gradlew ktlintCheck detekt lint testDebugUnitTest assembleDebug"
```

Combinaciones: `rest`/`grpc` × `firebase` sí/no × gitlab/github. Para `grpc`,
publicar antes un protos (plantilla `protos` con `languages=[kotlin]`, `make
generate`, `./gradlew publishToMavenLocal` en `gen/jvm`) en el mismo
`/root/.m2`. Además: `bundleProdRelease` con una upload key de prueba
(`keytool`) y `jarsigner -verify`; release sin `google-services.json` tiene que
fallar con el mensaje; agregar `implementation("androidx.core:core-ktx:...")` a
`core:model` tiene que fallar en `verificarKotlinPuro`. CI de la plantilla: job
`android-app` de `.github/workflows/templates.yml`.

## Limitaciones conocidas

- Baseline profile, tests instrumentados y la app corriendo en un dispositivo no
  se verifican en CI (necesitan emulador/dispositivo): Android Studio.
- Google Play no se prueba sin cuenta ni app creada: se valida la configuración
  (tareas de GPP presentes, AAB firmado) y el primer upload es manual
  (`docs/play-console.md`).
- El api-gateway todavía no verifica App Check: la cabecera se manda y se ignora
  (`docs/app-check-gateway.md`).
- `grpc` usa `protobuf-java` completo (lo que publica `protos`), no lite.
