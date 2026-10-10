# Elegir la tecnología: el problema dicta la herramienta

No hay un lenguaje oficial. Se elige la herramienta que mejor resuelve el
problema, con una condición: **cada tecnología nueva tiene un costo** que hay
que pagar durante toda la vida del sistema. Esta guía ayuda a decidir con las
dos cosas en la balanza.

## 1. Cómo decidir

Antes de elegir, responder en orden:

1. **¿Qué tipo de problema es?** (secciones 2 y 3: cada tecnología tiene señales
   claras de cuándo encaja).
2. **¿Hay una plantilla?** Una tecnología con plantilla trae CI, seguridad,
   deploy, tests y agentes resueltos. Sin plantilla, todo eso se construye y se
   mantiene a mano.
3. **¿El beneficio paga el costo de una tecnología más?** (sección 4).
4. **Si se elige algo nuevo, se escribe un ADR** en `docs` con el problema, las
   opciones y por qué.

La pregunta no es «¿qué lenguaje me gusta?» sino «¿qué necesita este
problema que el stack actual no da?». Si la respuesta es «nada», se usa lo que
ya hay.

## 2. Backend

### Resumen

| Lenguaje | Su terreno | Plantilla |
|---|---|---|
| **Go** | Servicios de red: APIs gRPC/REST, gateways, alta concurrencia, binarios chicos | `go-grpc-service`, `api-gateway` |
| **Python** | Datos, ML/IA, automatización, integraciones con SDKs que sólo existen (o son mejores) en Python | `python-grpc-service` (pendiente) |
| **Kotlin** (JVM) | Lógica de negocio compleja con un equipo que ya hace Android; ecosistema JVM con un lenguaje moderno | — (Android: `android-app`) |
| **Java** | Integraciones empresariales (SOAP, mensajería, ERPs), librerías JVM maduras, equipos Java existentes | — |
| **TypeScript** (Node) | BFF para un front, tiempo real (WebSockets), funciones serverless, equipo full-stack JS | `ts-grpc-service` (pendiente) |
| **JavaScript** | Scripts chicos y glue code; en servicios, siempre TypeScript | — |

### Go

**Elegirlo cuando:**

- Es un servicio de red con muchas conexiones simultáneas o latencia baja.
- Importa el costo de infraestructura: arranca en milisegundos, usa poca memoria
  y escala a cero bien en Cloud Run.
- Se quiere un binario único sin runtime (imágenes de ~20 MB, distroless).
- Herramientas de línea de comandos que se distribuyen como un ejecutable.

**No elegirlo cuando:**

- El núcleo del problema es análisis de datos o ML: el ecosistema está en Python.
- El dominio tiene muchísimas reglas y jerarquías de tipos donde un sistema de
  tipos más expresivo ayuda (Kotlin).

### Python

**Elegirlo cuando:**

- Procesamiento de datos, ETL, reportes, migraciones de datos (pandas, polars).
- ML, IA, embeddings, llamadas a modelos y orquestación de LLMs: el ecosistema
  (SDKs, notebooks, librerías) llega primero a Python.
- Automatización y scripts de operación.
- El SDK oficial de un proveedor es mejor en Python (algunos de Google, Firebase
  Admin, científicos).

**No elegirlo cuando:**

- Es un servicio con mucha concurrencia y CPU: el GIL y el consumo de memoria lo
  vuelven caro (se puede, pero cuesta más que en Go).
- Se necesita un binario único fácil de distribuir.

### Kotlin (backend JVM)

**Elegirlo cuando:**

- El equipo ya escribe Kotlin para Android y quiere compartir modelos o lógica
  (Kotlin Multiplatform).
- Dominio complejo donde ayudan los tipos sellados, la nulidad en el tipo y las
  corrutinas.
- Se necesita una librería JVM que no existe en otro ecosistema.

**No elegirlo cuando:**

- Es un servicio chico de red: la JVM arranca más lento y usa más memoria que Go
  (GraalVM native image lo mejora, pero agrega complejidad de build).

### Java

**Elegirlo cuando:**

- Integraciones empresariales: **SOAP** (Apache CXF), JMS, ERPs, bancos, gobierno.
  Es el adaptador SOAP de `docs/05-api-gateway.md`.
- Hay un equipo o un sistema Java existente que hay que extender.
- Librerías maduras sin equivalente (procesamiento de documentos, ciertos
  protocolos industriales).

**No elegirlo cuando:**

- El proyecto es nuevo y no hay ninguna de las razones anteriores: Kotlin da lo
  mismo con menos código.

### TypeScript (Node)

**Elegirlo cuando:**

- **BFF** (backend for frontend): un servicio delgado que adapta varias APIs para
  un front concreto, escrito por el mismo equipo de front.
- **Tiempo real**: WebSockets, Server-Sent Events, colaboración en vivo.
- **Funciones serverless** cortas (Cloud Functions, webhooks).
- SSR de un front (Astro, Next.js): ya es Node.
- Compartir tipos con el front (los mismos paquetes generados desde `protos`).

**No elegirlo cuando:**

- Cálculo intensivo en CPU: bloquea el event loop.
- El servicio es el núcleo del negocio y no hay equipo con experiencia en Node en
  producción (manejo de memoria, errores asíncronos, dependencias).

### JavaScript sin tipos

Sólo para scripts chicos y configuración. En cualquier servicio o librería:
TypeScript. Los contratos generados desde `protos` publican JS + tipos, así
que un proyecto JS puede consumirlos igual.

### Por tipo de problema

| Problema | Primera opción | Alternativa | Por qué |
|---|---|---|---|
| API de negocio / microservicio | Go | Kotlin | Concurrencia, costo, plantilla lista |
| API gateway | Go | — | Plantilla con la seguridad resuelta |
| Procesamiento de datos, ETL, reportes | Python | Go (si es alto volumen y simple) | Ecosistema de datos |
| ML, IA, LLMs | Python | TypeScript (si sólo llama APIs de modelos) | Ecosistema |
| Integración SOAP / legacy empresarial | Java | Kotlin | Librerías maduras |
| Tiempo real (WebSockets) | TypeScript | Go | Ecosistema y equipo de front |
| BFF de un front | TypeScript | Go | Mismo equipo y mismos tipos |
| Webhooks y funciones cortas | TypeScript | Go, Python | Arranque y simplicidad |
| CLI que se distribuye | Go | Python (para uso interno, como `dp`) | Binario único |
| Scripts de operación y migraciones | Python | Go | Rapidez para escribir |
| Workers de colas y jobs | Go | Python (si son de datos) | Concurrencia |

## 3. Frontend y móvil

### Resumen

| Herramienta | Su terreno | Plantilla |
|---|---|---|
| **Angular** | Apps internas grandes: paneles, backoffice, muchos formularios y roles | `angular-app` |
| **Astro** (+ islas de React) | **Todo lo que tiene que posicionar en buscadores**: landing, blog, catálogo, perfiles públicos | `astro-site` |
| **React** (Vite) | Apps interactivas sin SEO, en equipos o clientes que trabajan con React | `react-app` (pendiente) |
| **Next.js** | App con SEO **y** mucha lógica de servidor por usuario | — |
| **Kotlin + Jetpack Compose** | **Android** | `android-app` |
| **Swift + SwiftUI** | **iOS** nativo | — |
| **Kotlin Multiplatform** | Compartir lógica Android ↔ iOS manteniendo UI nativa | Camino desde `android-app` |
| **Expo / React Native** | iOS y Android a la vez, rápido, con un equipo web | — |

### Por tipo de problema

| Problema | Primera opción | Por qué |
|---|---|---|
| Panel de administración, backoffice | Angular | Estructura fuerte para apps grandes y equipos |
| Landing, marketing, blog | Astro | HTML estático, Core Web Vitals, SEO |
| Catálogo o perfiles públicos que vienen de la API | Astro (SSG o SSR) | SEO programático (`docs/07` §4) |
| Buscador o filtros dentro de un sitio público | Isla de React dentro de Astro | Interactividad sin perder SEO |
| App interactiva sin SEO para un cliente React | React (Vite) | Equipo y ecosistema |
| App web con SEO y sesiones por usuario | Astro híbrido; Next.js si crece mucho | Empezar simple |
| App móvil, primer lanzamiento | Android nativo | Costo y mercado (`docs/09`) |
| Agregar iOS a una app Android existente | Kotlin Multiplatform | Reutiliza dominio y datos |
| iOS y Android desde cero, rápido, equipo web | Expo | Un solo código |
| Documentación | MkDocs (plantilla `docs`) | Markdown, búsqueda, sin código |

### Señales para no equivocarse

- **¿Tiene que aparecer en Google?** → Astro. Una SPA (Angular, React) se
  indexa peor y carga más JS.
- **¿Sólo la usa gente logueada?** → la app (Angular o React); el SEO no importa.
- **¿Necesita el hardware o APIs nuevas del sistema?** (cámara avanzada, NFC,
  Bluetooth, widgets, IA en el dispositivo) → nativo.
- **¿Una sola persona tiene que sacar iOS y Android?** → Expo o KMP, no dos
  apps nativas separadas.

## 4. El costo de una tecnología más

Cada lenguaje o framework nuevo en la plataforma suma, para siempre:

| Costo | Ejemplo |
|---|---|
| Plantilla y CI | Pipeline, escaneo de dependencias, imagen, deploy |
| Seguridad | Vulnerabilidades de otro ecosistema que vigilar y actualizar |
| Contratos | Generación de código desde `protos` para ese lenguaje |
| Personas | Alguien que lo sepa operar en producción, revisar y depurar a las 3 a.m. |
| Agentes | Reglas, revisor y skills para ese stack |
| Observabilidad | Instrumentación con OpenTelemetry en ese lenguaje |

**Regla práctica:** una tecnología nueva entra cuando resuelve un problema que
las actuales resuelven **claramente peor**, no cuando resuelve el mismo
problema de otra forma. Y entra con un ADR y, si se va a repetir, con una
plantilla.

### Lo que no cambia con el lenguaje

Elijas lo que elijas, el servicio cumple lo mismo:

- Habla con los demás por **contratos de `protos`** (gRPC) y queda detrás del
  `api-gateway` si es público.
- Configuración por variables de entorno; imagen de contenedor; mismo
  `deploy_target`.
- Logs estructurados con `request-id`, trazas con OpenTelemetry.
- Base común de repos (`docs/10`): secretos, dependencias, releases.
- Pruebas en el flujo (`docs/12`): mismos controles por etapa.

Así, cambiar de lenguaje para un servicio no cambia cómo se opera la
plataforma.

## 5. Plantillas: qué existe y qué falta

| Plantilla | Estado |
|---|---|
| `go-grpc-service`, `api-gateway`, `protos`, `angular-app`, `docs` | Publicadas |
| `astro-site`, `android-app`, `e2e-tests` | En construcción |
| `python-grpc-service`, `ts-grpc-service`, `react-app` | Pendientes: se construyen cuando un proyecto real las necesite |
| Java, Swift, Next.js, Expo | Sin plantilla prevista; se evalúan con un ADR cuando aparezca el caso |
