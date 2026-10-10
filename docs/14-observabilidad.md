# Observabilidad

Estándar para saber qué está pasando en la plataforma en producción: seguir un
request de punta a punta, medir si los servicios cumplen lo que prometen, y
enterarse de un problema **antes que el usuario**. Especificación (pendiente de
construir).

## 1. Estado actual

| Pieza | Hoy |
|---|---|
| Logs estructurados | ✅ Go (zap) y gateway; con `request-id` |
| `request-id` propagado | ✅ Gateway → servicios por metadata gRPC |
| Variables `OTEL_*` | ⚠️ Declaradas en `go-grpc-service`, **sin instrumentación** |
| Trazas | ❌ |
| Métricas | ❌ (salvo las de plataforma de Cloud Run) |
| Alertas | ❌ |
| Front y móvil | ⚠️ Crashlytics previsto en `android-app`; nada en web |

## 2. Principios

1. **OpenTelemetry (OTel) en todos lados.** Es el estándar abierto: la misma
   instrumentación sirve para Google Cloud, Grafana o cualquier otro backend.
   Cambiar de destino es configuración, no código.
2. **Las tres señales correlacionadas:** trazas, métricas y logs comparten
   `trace_id`. Desde un log se llega a la traza; desde una métrica que se dispara,
   a los logs de ese momento.
3. **Alertas sobre síntomas, no sobre causas.** Se alerta cuando el usuario sufre
   (errores, lentitud, caída), no cuando sube la CPU.
4. **Sin datos personales en la telemetría.** Igual que en los logs del gateway:
   tokens, emails y datos de usuarios se redactan.
5. **Lo da la plantilla.** Un servicio nuevo nace instrumentado; nadie tiene que
   acordarse.

## 3. Trazas

Un request del usuario se convierte en **una traza** con un *span* por cada
salto:

```
app/web ─▶ api-gateway ─▶ orders-service ─▶ Postgres
                     └──▶ catalog-service ─▶ Postgres
```

| Qué | Cómo |
|---|---|
| Propagación | Cabecera **W3C `traceparent`** en HTTP y metadata gRPC. El gateway la acepta del cliente propio o la crea |
| `request-id` | Se mantiene (es lo que ve el usuario en un error) y se agrega como atributo de la traza |
| Instrumentación automática | HTTP server (gateway), cliente y servidor gRPC, cliente de Postgres (GORM/pgx), clientes HTTP salientes |
| Spans manuales | Sólo en operaciones de negocio relevantes (p. ej. «calcular descuento»), con atributos sin datos personales |
| Muestreo | 100 % en QA. En producción: **todas** las trazas con error o lentas (*tail sampling* en el collector) + un porcentaje del resto (p. ej. 10 %) |

## 4. Métricas

### RED por servicio y por ruta

| Métrica | Qué mide |
|---|---|
| **R**ate | Requests por segundo |
| **E**rrors | Porcentaje de errores (5xx en HTTP; `INTERNAL`, `UNAVAILABLE`, `DEADLINE_EXCEEDED` en gRPC) |
| **D**uration | Latencia: p50, p95, p99 (histogramas, no promedios) |

Etiquetas: servicio, ruta o método gRPC, código de respuesta. **Nunca** IDs de
usuario ni valores libres como etiqueta (explota la cardinalidad y el costo).

### Además

| Fuente | Métricas |
|---|---|
| Gateway | Rechazos por auth (401/403), por rate limit (429), por tamaño (413); latencia por upstream |
| Base de datos | Conexiones en uso, consultas lentas, errores |
| Runtime | Memoria, goroutines/hilos, GC (Go: automático con OTel) |
| Negocio | Pocas y elegidas: pedidos creados, pagos fallidos. Son las que más importan al producto |

## 5. Logs

Ya existen; se ajustan para correlacionar:

- Formato JSON estructurado, con `trace_id`, `span_id`, `request_id`, servicio,
  versión y ambiente en cada línea.
- Niveles: `error` (algo falló y requiere atención), `warn` (degradado pero
  funcionando), `info` (eventos de negocio y ciclo de vida), `debug` (apagado en
  producción).
- Redacción de secretos y datos personales (como el gateway hoy).
- En Cloud Run, el formato de Cloud Logging (`severity`,
  `logging.googleapis.com/trace`) para que los logs se vean dentro de la traza.

## 6. SLOs y alertas

Un **SLO** es la promesa al usuario; las alertas avisan cuando se está por romper.

| SLO por defecto (por servicio público) | Objetivo |
|---|---|
| Disponibilidad | 99,5 % de requests sin error 5xx en 30 días |
| Latencia | 95 % de requests por debajo de 500 ms |

Alertas mínimas, todas sobre síntomas:

| Alerta | Condición | Severidad |
|---|---|---|
| Consumo rápido del presupuesto de errores | A este ritmo, el SLO mensual se rompe en < 2 días | Urgente (aviso inmediato) |
| Consumo lento | A este ritmo, se rompe antes de fin de mes | Normal (horario laboral) |
| Servicio caído | El *uptime check* externo falla 2 veces seguidas | Urgente |
| Certificado TLS | Vence en < 14 días | Normal |
| Errores nuevos en la app | Crashlytics: un fallo nuevo o que afecta > 1 % de usuarios | Normal |

**Cada alerta enlaza a un runbook** en el repo `docs` (`runbooks/`): qué
significa, cómo diagnosticar, cómo mitigar. Una alerta sin runbook no se crea.

Canales: email o chat para normal; push/teléfono para urgente.

## 7. Dónde se ve: dos destinos

Mismo código, distinto destino según `deploy_target`, configurado en el
**OpenTelemetry Collector**:

| Señal | Google (`cloud-run`) | Coolify (VPS) |
|---|---|---|
| Trazas | Cloud Trace | Grafana **Tempo** |
| Métricas | Cloud Monitoring (Managed Prometheus) | **Prometheus** |
| Logs | Cloud Logging | Grafana **Loki** |
| Tableros y alertas | Cloud Monitoring | **Grafana** |
| Uptime | Uptime checks de Cloud Monitoring | Uptime Kuma o Grafana synthetic |
| Collector | *Sidecar* de Cloud Run o servicio propio | Contenedor en el mismo compose |

Para Coolify, una plantilla nueva **`observabilidad-stack`** (compose con
Collector, Prometheus, Tempo, Loki y Grafana, con tableros y alertas
preconfigurados) que se levanta una vez por VPS.

**Costo:** en Google la telemetría se paga por volumen; el muestreo de trazas y
evitar etiquetas de alta cardinalidad lo mantienen bajo control. En Coolify el
costo es disco: retención de 15 días para logs y trazas, 90 para métricas.

## 8. Front y móvil

| Cliente | Qué se mide | Cómo |
|---|---|---|
| Web (Angular, Astro) | **Core Web Vitals reales** (LCP, CLS, INP) de usuarios, errores de JavaScript | Librería `web-vitals` → endpoint del gateway o GA4; errores → Sentry/GlitchTip (opcional) |
| Web → backend | La traza empieza en el navegador | OTel JS envía `traceparent` al gateway (sólo a dominios propios) |
| Android | Fallos, ANR, tiempo de arranque, rendimiento de red | Firebase Crashlytics + Performance Monitoring |
| Android → backend | Traza desde la app | OTel Android (opcional, fase posterior) |

## 9. Qué agrega cada plantilla

| Plantilla | Cambios |
|---|---|
| `go-grpc-service` | SDK de OTel (trazas + métricas), interceptores gRPC, instrumentación de pgx/GORM, logs con `trace_id`, exportador OTLP configurable por `OTEL_EXPORTER_OTLP_ENDPOINT` |
| `api-gateway` | Lo mismo + HTTP server, propagación `traceparent` hacia los upstreams, métricas de rechazos (401/403/413/429) |
| `angular-app`, `astro-site` | `web-vitals` + reporte; OTel JS opcional |
| `android-app` | Crashlytics y Performance (ya previstos) |
| `docs` | Plantilla de runbook por alerta; página de SLOs por servicio |
| `e2e-tests` | Cada corrida agrega un atributo `test.id` a la traza, para ver en Tempo/Trace qué hizo un test que falló |
| Nueva: `observabilidad-stack` | Compose de Grafana + Prometheus + Tempo + Loki + Collector para Coolify |

## 10. Criterios de terminado

- [ ] Un request a través del gateway produce **una sola traza** con spans de
      gateway, servicio y Postgres, visible en Tempo (local/Coolify) y en Cloud
      Trace (QA en Google).
- [ ] Un log de error del servicio tiene el `trace_id` de esa traza y desde
      Grafana/Cloud Logging se navega de uno al otro.
- [ ] Las métricas RED por ruta aparecen en el tablero; un 500 forzado sube la
      tasa de errores.
- [ ] Una alerta de prueba (umbral bajado) dispara y su notificación enlaza al
      runbook.
- [ ] Ningún token ni dato personal en trazas, métricas ni logs (búsqueda en el
      backend de telemetría después de una corrida de `e2e-tests`).
- [ ] `observabilidad-stack` levanta en un VPS con un comando y trae tableros
      de RED y de gateway listos.
- [ ] Apagar el collector no rompe los servicios (la telemetría se descarta, el
      request sigue).

## 11. Fases

| Fase | Contenido |
|---|---|
| 1 | Trazas + logs correlacionados en `go-grpc-service` y `api-gateway`; `observabilidad-stack` mínimo (Collector + Tempo + Grafana) para desarrollo local |
| 2 | Métricas RED y tableros; Prometheus y Loki |
| 3 | SLOs, alertas y runbooks; destino Google (Cloud Trace/Monitoring/Logging) |
| 4 | Front (web-vitals, OTel JS) y móvil (Performance) |
