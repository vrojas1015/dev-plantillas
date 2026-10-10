# API gateway: diseño y seguridad

Especificación de la plantilla `api-gateway` (fase 1 construida en
`templates/api-gateway/`: REST + auth + autorización por ruta + rate limit en
memoria + límites, CORS, cabeceras, errores y logs; ver su README). El
gateway es **la única puerta pública** de la plataforma: traduce los protocolos
de los clientes a gRPC y concentra los controles de seguridad comunes. Los
servicios nunca se exponen directamente.

## 1. Arquitectura

Dos capas separadas:

- **Adaptadores de protocolo:** uno por forma de entrar (REST, GraphQL, SOAP).
  Sólo traducen.
- **Pipeline común:** los controles de seguridad y operación. Se escriben una
  vez y aplican a todos los protocolos.

```
 Clientes                  api-gateway                                      Servicios
┌────────┐   ┌──────────────────────┐   ┌──────────────────────────────┐
│ Web    │──▶│ REST/JSON  (adapter) │──▶│ Pipeline común               │   ┌──────────────┐
│ Móvil  │──▶│ GraphQL    (adapter) │──▶│ 1. request-id + logs         │──▶│ go-grpc-svc  │
│ Legacy │──▶│ SOAP       (adapter) │──▶│ 2. CORS / límites de tamaño  │   │ python-svc   │
└────────┘   └──────────────────────┘   │ 3. Auth (JWT / API key)      │──▶│ ...          │
                                        │ 4. Autorización por ruta     │   └──────────────┘
                                        │ 5. Rate limit                │     gRPC + metadata
                                        │ 6. Validación (protovalidate)│     (identidad)
                                        │ 7. Timeout + circuit breaker │
                                        └──────────────────────────────┘
```

### Protocolos

| Protocolo | Implementación | Particularidades |
|---|---|---|
| **REST/JSON** | `grpc-gateway`: rutas desde las anotaciones `google.api.http` de los `.proto`; OpenAPI generado | El default. Cliente tipado para Angular/Expo desde el OpenAPI o los protos |
| **GraphQL** | `gqlgen`; los resolvers llaman a gRPC | El rate limit por request no alcanza: una query puede pedir miles de objetos. Hace falta **límite de profundidad y de costo** por query, y *dataloaders* contra el N+1 |
| **SOAP** | **Adaptador separado** detrás del gateway (Java + Apache CXF es lo más sólido), no dentro del gateway Go | Sólo para integraciones legacy (bancos, gobierno, ERPs). Reutiliza el mismo pipeline de auth y rate limit al pasar por el gateway |

Alternativa para proyectos chicos: **ConnectRPC** en los servicios, que atiende
gRPC, gRPC-Web y HTTP/JSON con el mismo handler. Puede reemplazar al gateway
cuando no hace falta centralizar controles (un solo servicio, proyecto en
Coolify). En cuanto hay varios servicios o clientes externos, va el gateway.

## 2. Autenticación (tokens)

| Qué | Dónde | Reglas |
|---|---|---|
| **Verificar** JWT | Gateway | Firma con JWKS (en caché, con refresco ante `kid` desconocido). Algoritmos en **lista cerrada** (RS256/ES256; nunca `none` ni HS* con clave pública). Validar `iss`, `aud`, `exp`, `nbf`, con tolerancia de reloj ≤ 60 s. Proveedores: Firebase Auth u OIDC genérico |
| **API keys** (máquina a máquina) | Gateway | Guardadas como hash (nunca en claro), con prefijo identificable, scopes, fecha de expiración y rotación sin corte (dos keys válidas a la vez) |
| **Emitir y renovar** tokens | Servicio de auth, **no** el gateway | Access token corto (≤ 1 h), refresh token rotativo |
| **Revocación** | Gateway, sólo en operaciones sensibles | Firebase `checkRevoked` (cuesta una llamada extra: no en cada request) |
| **Fuerza bruta en login** | Servicio de auth | Backoff por cuenta y por IP; bloqueo temporal; mismo error para «usuario no existe» y «clave incorrecta» |
| **Identidad hacia los servicios** | Metadata gRPC | `x-user-id`, `x-roles`, `x-request-id`. El gateway **borra** esas cabeceras si vienen del cliente antes de setearlas |

Los servicios **sólo aceptan llamadas del gateway**: en Cloud Run con
`--no-allow-unauthenticated` e IAM invoker para la cuenta del gateway; en
Coolify, red interna sin puertos publicados.

## 3. Autorización

| Nivel | Dónde | Regla |
|---|---|---|
| **Por ruta** (OWASP API5) | Gateway | **Denegar por defecto.** Cada ruta declara si es pública o qué rol/scope necesita. Una ruta sin declaración no se expone. Las rutas de administración van en un prefijo propio con su rol |
| **Por objeto** (OWASP API1, el fallo más común) | **Servicios** | Toda consulta por ID filtra por el dueño o por la organización del usuario (`WHERE id = $1 AND owner_id = $2`), o justifica por qué no. El gateway no puede hacerlo: no conoce los datos |
| **Por campo** (OWASP API3) | Servicios (mappers) | No devolver campos internos; no aceptar del cliente campos que no le corresponden (`role`, `owner_id`, `created_at`) |

La regla por objeto la revisa `go-reviewer` (ver `docs/ejercicios/01-go-reviewer.md`).

## 4. Rate limit y consumo de recursos

| Decisión | Valor por defecto | Opciones |
|---|---|---|
| Clave | Usuario si está autenticado; si no, IP | API key para integraciones |
| Algoritmo | Token bucket | — |
| Respuesta | `429` con `Retry-After` y cabeceras `RateLimit-*` | — |
| Almacenamiento | `memory` (una instancia) | `redis` si hay varias instancias (Cloud Run escala: en memoria cada instancia contaría por separado). Memorystore en Google, contenedor Redis en Coolify |
| Límites por ruta | Más estrictos en login, registro, recuperar clave y búsquedas | Configurables por ruta |

Además del rate limit (OWASP API4):

- Tamaño máximo del body (1 MB por defecto; ajustable por ruta para subidas).
- Timeouts de lectura de cabeceras y cuerpo (contra *slowloris*) y timeout por
  llamada gRPC, propagado como *deadline*.
- Página máxima en listados (`page_size` ≤ 100).
- GraphQL: profundidad y costo máximos por query.
- Circuit breaker por servicio: si un servicio falla, se corta rápido en vez de
  acumular requests colgados.
- Capa volumétrica delante: **Cloud Armor** (Google) o middleware de Traefik
  (Coolify). El gateway se ocupa de los límites de negocio.

## 5. Validación de entrada

- **`protovalidate`**: las reglas se declaran en el `.proto`
  (`string.email`, `min_len`, rangos, `required`) y se aplican en el gateway
  **y** en los servicios (defensa en profundidad: un servicio puede recibir
  llamadas internas que no pasaron por el gateway).
- `Content-Type` estricto (`application/json`); rechazar JSON con campos
  desconocidos en las rutas de escritura.
- Errores de validación con el campo y el motivo, sin eco del valor recibido.

## 6. Configuración segura (OWASP API8)

| Tema | Regla |
|---|---|
| CORS | **Lista de orígenes permitidos** por ambiente. Nunca `*` con credenciales |
| Cabeceras | `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` en respuestas autenticadas |
| Errores | Formato único; **sin stack traces ni mensajes internos**. Los errores no-dominio salen como `500` genérico con el `request-id` para buscarlo en logs |
| TLS | Siempre. Lo termina Cloud Run / Traefik; HSTS desde el gateway |
| Reflection y debug | Apagados en producción |
| Rutas (OWASP API9) | El OpenAPI generado desde los protos es la **única** fuente de rutas. Versión en la ruta (`/v1/...`) y deprecación con cabecera `Sunset` |

## 7. Otros riesgos

| Riesgo | Control |
|---|---|
| Abuso de flujos de negocio (API6): bots en registro, cupones, reservas | **Firebase App Check** (la llamada viene de *tu* app) o reCAPTCHA Enterprise en esos flujos |
| SSRF (API7) | Si se descargan URLs (webhooks, imágenes): lista de dominios permitidos y bloqueo de IPs privadas y de metadata (`169.254.169.254`) |
| APIs de terceros (API10) | Validar sus respuestas, timeouts, no reenviar sus datos sin validar |

## 8. Operación

| Tema | Regla |
|---|---|
| Secretos | Secret Manager + Workload Identity Federation. **Nunca claves en el repo** (ni JSON de cuentas de servicio) |
| Logs | Estructurados, con `request-id` propagado a los servicios. **Redactar** `Authorization`, cookies, tokens, emails y datos personales |
| Auditoría | Rastro de acciones sensibles (cambios de permisos, exportaciones, borrados): quién, qué, cuándo, desde dónde |
| Cadena de suministro | `govulncheck` y Trivy en el CI; Renovate o Dependabot; imagen distroless fijada por digest |
| Pruebas de seguridad | **Tests de autorización por ruta** (sin token → 401, sin rol → 403, con rol → 200) generados desde la tabla de rutas; OWASP ZAP *baseline* en el CI contra QA |

## 9. Plantilla: preguntas y alcance

```
protocols:        [rest, graphql]      # multiselect; soap = adaptador aparte, documentado
auth:             firebase | oidc | api-key | ninguno
rate_limit_store: memory | redis
deploy_target:    cloud-run | coolify | ninguno
ci_provider:      gitlab | github
```

| Activado por defecto | Documentado, se activa por proyecto |
|---|---|
| Rutas con denegar por defecto y roles · Verificación JWT/OIDC · Rate limit · Límites de body y timeouts · CORS con lista · Cabeceras de seguridad · Errores sin detalles · Logs redactados · `protovalidate` · Tests de autorización por ruta · `govulncheck` y Trivy | App Check / reCAPTCHA · Cloud Armor · Revocación de tokens · Protección SSRF · ZAP contra QA · Auditoría · GraphQL · Adaptador SOAP |

### Orden de construcción

1. REST + auth (Firebase/OIDC) + autorización por ruta + rate limit en memoria
   + límites + CORS/cabeceras + errores + logs. Tests de autorización.
2. `protovalidate` (requiere la plantilla `protos`).
3. Rate limit en Redis.
4. GraphQL.
5. Adaptador SOAP, cuando aparezca una integración real.

### Criterios de terminado de la plantilla

- [ ] Un servicio generado con `go-grpc-service` queda accesible por REST a
      través del gateway, con OpenAPI generado.
- [ ] Sin token → 401; token válido sin rol → 403; con rol → 200, para cada ruta
      (tests generados).
- [ ] Ruta sin declarar → 404, no expuesta.
- [ ] Ráfaga por encima del límite → 429 con `Retry-After`.
- [ ] Body por encima del máximo → 413; request lento → cortado por timeout.
- [ ] Origen fuera de la lista → sin cabeceras CORS.
- [ ] Error interno de un servicio → 500 genérico con `request-id`, sin detalles.
- [ ] Logs sin `Authorization` ni tokens.
- [ ] `govulncheck` y Trivy en el CI.

## Referencias

- OWASP API Security Top 10 (2023): <https://owasp.org/API-Security/editions/2023/en/0x11-t10/>
- grpc-gateway: <https://github.com/grpc-ecosystem/grpc-gateway>
- protovalidate: <https://github.com/bufbuild/protovalidate>
- ConnectRPC: <https://connectrpc.com>
