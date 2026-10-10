# Móvil: Android nativo primero

Decisión sobre cómo encarar móvil y especificación de la plantilla
`android-app` (pendiente de construir).

## 1. Decisión: Android nativo primero

| Criterio | Android nativo | Multiplataforma (Expo / React Native) |
|---|---|---|
| Costo de publicar | **US$25 una vez** (Google Play) | Igual para Android; iOS suma **US$99/año** y una Mac (o builds pagos en la nube) aunque el código sea compartido |
| Acceso a novedades | **Inmediato**: Jetpack Compose, Material 3, APIs nuevas, IA en el dispositivo | Depende de que alguien adapte cada API |
| Mercado objetivo (LATAM) | Mayoritario | — |
| Contratos | `protos` ya genera **Kotlin + gRPC con corrutinas** (probado con servidor y cliente reales) | TypeScript, también generado |
| Conocimiento que se reutiliza | Kotlin sirve después para backend JVM y para compartir lógica con iOS | Para quien viene de web |

**Conclusión:** la primera plantilla móvil es **Android nativo con Kotlin y
Jetpack Compose**.

### El camino a iOS

Cuando un proyecto necesite iOS, **Kotlin Multiplatform (KMP)** permite
compartir la capa de datos, red y lógica de presentación con iOS, manteniendo
UI nativa en cada plataforma (Compose en Android, SwiftUI o Compose
Multiplatform en iOS). Por eso la plantilla separa desde el principio el código
**sin dependencias de Android** (dominio y datos) del código de Android (UI,
plataforma): esa parte se mueve a un módulo compartido sin reescribirla.

### Alternativa documentada

Expo / React Native queda como opción para un proyecto que necesite iOS y
Android a la vez, rápido y con un equipo web. Sin plantilla hasta que aparezca
el caso.

## 2. Arquitectura

```
android-app/
├── app/                         ← Application, MainActivity, navegación, DI de arranque
├── core/
│   ├── model/                   ← modelos de dominio (Kotlin puro, sin Android)
│   ├── domain/                  ← casos de uso (Kotlin puro)
│   ├── data/                    ← repositorios: fuente de verdad local + red
│   ├── network/                 ← cliente del gateway (REST) o de los protos (gRPC/Connect)
│   ├── database/                ← Room
│   ├── datastore/               ← preferencias (DataStore)
│   ├── designsystem/            ← tema Material 3, tipografía, componentes base
│   ├── ui/                      ← componentes compartidos entre features
│   ├── auth/                    ← Firebase Auth, sesión, token para el gateway
│   └── testing/                 ← fakes y reglas de test compartidas
├── feature/
│   └── items/                   ← feature de ejemplo: lista + detalle (ItemService)
├── build-logic/                 ← convention plugins de Gradle (configuración común de módulos)
├── gradle/libs.versions.toml    ← catálogo de versiones: única fuente de versiones
└── baselineprofile/             ← generación de baseline profiles
```

Reglas:

- **Flujo de datos unidireccional:** la UI observa un `StateFlow<UiState>` del
  ViewModel y le manda eventos; el ViewModel no conoce la UI.
- **Offline primero:** la fuente de verdad es Room; la red actualiza la base y la
  UI observa la base. La app abre sin conexión con lo último que tenía.
- **`core:model` y `core:domain` son Kotlin puro** (sin `android.*`): son los
  candidatos a módulo compartido de KMP.
- Una feature no depende de otra; comparten a través de `core`.
- Inyección de dependencias con **Hilt**.
- Corrutinas y `Flow` para todo lo asíncrono; nada de callbacks.

## 3. Red y contratos

Pregunta `cliente_api`:

| Opción | Cómo | Cuándo |
|---|---|---|
| `rest` (default) | Ktor client o Retrofit + kotlinx.serialization contra el `api-gateway`; modelos generados desde su OpenAPI o escritos a mano | El gateway es la puerta pública: auth, rate limit y autorización ya están ahí |
| `grpc` | Stubs Kotlin del repo `protos` (grpc-kotlin o Connect-Kotlin) | Servicios pensados para móvil, streaming, o sin gateway en proyectos chicos |

En ambos casos:

- El token de Firebase Auth va en cada request (interceptor) y se renueva solo.
- Timeouts, reintentos con backoff sólo para operaciones idempotentes.
- Errores de red mapeados a un tipo de dominio (`sin conexión`, `no autorizado`,
  `no encontrado`, `error del servidor`) que la UI sabe mostrar.

## 4. Ecosistema Google (Firebase)

| Servicio | Uso |
|---|---|
| Firebase Auth | Login (email, Google); el ID token autentica contra el gateway |
| **App Check** (Play Integrity) | Prueba que la llamada viene de *tu* app en un dispositivo real. El gateway lo puede exigir (OWASP API6) |
| FCM | Notificaciones push, con canales y permiso de notificaciones de Android 13+ |
| Crashlytics | Reporte de fallos, con el mapping de R8 subido en el build de release |
| Analytics | Eventos, con consentimiento |
| Remote Config | Flags y textos remotos (opcional) |

`google-services.json` **no se commitea**: se inyecta en el CI desde un
secreto y en local se descarga de la consola (documentado). La plantilla
compila sin él en modo debug con un stub, para que los tests no dependan de
Firebase.

## 5. Calidad

| Qué | Herramienta |
|---|---|
| Estilo y análisis | ktlint (o Spotless) + detekt + Android Lint, con baseline vacío al empezar |
| Tests unitarios | JUnit 5 + Turbine (Flows) + fakes de `core:testing`; ViewModels y repositorios |
| Tests de UI | Compose UI tests (`createComposeRule`) con Robolectric en la JVM, sin emulador |
| Screenshots | Roborazzi (opcional): detecta cambios visuales en PR |
| Rendimiento | Baseline profiles + R8 completo en release; Macrobenchmark opcional |
| Accesibilidad | `contentDescription`, tamaños táctiles ≥ 48 dp, contraste; chequeo de Compose en tests |

Todo lo anterior corre **sin emulador** en el CI. Los tests instrumentados en
emulador quedan como job opcional (son lentos y caros en CI).

## 6. Build, firma y publicación

- **Build types:** `debug` (sin minificar, `applicationIdSuffix .debug`),
  `release` (R8, recursos reducidos). **Flavors** `qa` y `prod` con su propio
  `applicationId` y URL del gateway, para tener las dos instaladas a la vez.
- **Versionado:** `versionName` desde el tag (`v1.4.0`) y `versionCode` derivado
  (p. ej. `1004000`) o del número de build del CI; nunca a mano.
- **Firma:** Play App Signing. El repo **no** tiene keystore; el CI firma con
  la *upload key* guardada como secreto (base64) y Google firma lo que llega a
  los usuarios. Perder la upload key se recupera desde la consola.
- **Publicación:** Gradle Play Publisher (o fastlane) sube el **AAB** a la pista
  **interna** en cada tag `qa-v*`; `prod-v*` lo promueve a producción con
  rollout escalonado (10 % → 50 % → 100 %), con aprobación manual.
- Notas de la versión desde el changelog.

## 7. CI

| Evento | Pasos |
|---|---|
| PR / MR | ktlint, detekt, lint, tests unitarios y de UI (Robolectric), `assembleDebug`; reporte de tests |
| Tag `qa-v*` | Lo anterior + `bundleQaRelease` firmado → pista interna |
| Tag `prod-v*` | `bundleProdRelease` → producción con rollout escalonado (aprobación manual) + mapping a Crashlytics |

GitHub Actions o GitLab CI según `ci_provider`, con caché de Gradle. El
`google-services.json` y la upload key vienen de secretos del proveedor.

## 8. Plantilla: preguntas

```
app_name:         "Mi App"
application_id:   com.miorg.miapp          # paquete; inmutable una vez publicado
min_sdk:          26                        # Android 8.0
cliente_api:      rest | grpc
api_base_url_qa:  https://api-qa.ejemplo.com
api_base_url_prod: https://api.ejemplo.com
protos_maven:     com.miorg:protos:0.2.0   # si cliente_api = grpc
firebase:         true | false              # Auth + App Check + FCM + Crashlytics
ci_provider:      gitlab | github
```

Versiones (Kotlin, AGP, Compose BOM, Hilt, Room...): las últimas estables al
construir la plantilla, fijadas en `libs.versions.toml` y verificadas.

## 9. Agentes

`CLAUDE.md` (≤ 120 líneas) con: la estructura de módulos y qué va en cada uno,
la regla de Kotlin puro en `core:model`/`core:domain`, cómo agregar una feature
(módulo nuevo desde el convention plugin), comandos de Gradle, y lo que nunca
se hace (commitear `google-services.json` o keystores, `GlobalScope`, lógica en
los composables, `!!`).

Un `android-reviewer` en el plugin `dev-agentes` revisará esas reglas (después,
igual que `go-reviewer`).

## 10. Limitaciones conocidas

- En la máquina de desarrollo actual no hay JDK ni Android SDK: la plantilla se
  verifica compilando y corriendo los tests en **Docker** (imagen con JDK y
  Android SDK). El emulador y la prueba en un dispositivo real se hacen en
  Android Studio.
- La publicación en Google Play no se puede probar sin una cuenta y una app
  creada en la consola: se valida la configuración y se documenta el primer
  upload manual (Google exige que el primer AAB se suba a mano).

## 11. Criterios de terminado

- [ ] `copier copy` con `rest`/`grpc` × `firebase` sí/no × gitlab/github →
      `./gradlew ktlintCheck detekt lint testDebugUnitTest assembleDebug` pasa
      (en Docker).
- [ ] La feature de ejemplo: lista y detalle de items contra un servidor de
      prueba (MockWebServer para REST; servidor gRPC en proceso para `grpc`),
      con tests de ViewModel y de UI.
- [ ] Sin conexión: la lista muestra lo guardado en Room (test).
- [ ] Error 401 del gateway → la app pide volver a iniciar sesión (test).
- [ ] `core:model` y `core:domain` no dependen de Android (chequeo de Gradle:
      módulos `kotlin("jvm")`, no `com.android.library`).
- [ ] `bundleProdRelease` con R8 genera un AAB firmado con una upload key de
      prueba; el mapping se genera.
- [ ] El build sin `google-services.json` funciona en debug; el de release lo
      exige con un mensaje claro.
- [ ] YAML del CI válido; `copier update` entre dos versiones sin conflictos.
- [ ] Documentado: primer upload a Play Console, configuración de App Check en
      el gateway, y el camino a KMP.
