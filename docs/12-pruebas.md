# Pruebas en el flujo de desarrollo

Cómo se integran las pruebas en el flujo de trabajo (issue → MR → QA →
producción) y especificación de la plantilla `e2e-tests` (pendiente de
construir).

**Principio:** las pruebas no son una fase al final. Cada etapa del flujo tiene
**controles automáticos** que impiden avanzar si fallan, y las personas de QA
participan **desde el issue**, no sólo antes de producción. Lo repetible se
automatiza; las personas se dedican a lo que una máquina no hace bien:
explorar, cuestionar los criterios y juzgar la experiencia.

## 1. El flujo con sus controles

| Etapa | Quién | Automático (bloquea si falla) | Manual |
|---|---|---|---|
| **1. Issue** | Producto + QA + Dev | `validar` de docs: el issue tiene criterios de aceptación | QA escribe o revisa los **escenarios** (Dado/Cuando/Entonces) antes de empezar: es la *definición de listo* |
| **2. Desarrollo** | Dev | Pre-commit (formato, lint, secretos); tests unitarios locales; `/verificar` | Dev escribe los tests de los escenarios del issue |
| **3. MR/PR** | Dev + revisor | Pipeline: calidad, **unit + integración**, **contrato** (buf breaking, diff de OpenAPI), seguridad, build. Tests de autorización del gateway | Code review, **incluidos los tests**: ¿cubren los escenarios? |
| **4. QA** (tag `qa-v*`) | Pipeline + QA | Deploy → **smoke** → suite `e2e-tests` (UI + API + robustez) contra QA | QA hace **pruebas exploratorias** y de aceptación; registra el resultado en el issue |
| **5. Producción** (tag `prod-v*`) | Responsable del release | Guard de migraciones; deploy; **smoke en prod**; rollback si el smoke falla | Aprobación del release |
| **6. Después** | Todos | Monitoreo y alertas (`docs` de observabilidad) | Un bug que llega a producción → issue + test que lo reproduce |

**Definición de terminado** de un issue (ya en `workspace/CLAUDE.md`, ampliada):
tests de sus escenarios en verde en el MR, suite e2e verde en QA, aceptación de
QA registrada en la sección Verificación del issue.

## 2. Qué prueba cada nivel

| Nivel | Qué verifica | Dónde vive | Cuándo corre |
|---|---|---|---|
| **Unitario** | Una función, caso de uso o componente, sin red ni base | Cada repo (ya en todas las plantillas) | Pre-commit y cada MR |
| **Integración** | El servicio con su base real, sus migraciones y sus adaptadores | Cada repo (Postgres efímero en el CI) | Cada MR |
| **Contrato** | Que no se rompa lo que otros consumen | `protos` (buf breaking), gateway (diff de OpenAPI) | Cada MR |
| **Componente / API** | Un servicio o el gateway completo con dependencias simuladas | Cada repo (gateway: tests de autorización generados) | Cada MR |
| **End-to-end** | Flujos de usuario reales sobre el sistema desplegado | Repo `e2e-tests` | Cada deploy a QA; nocturno |
| **Robustez de API** | Entradas inesperadas contra el contrato | Repo `e2e-tests` (Schemathesis) | Cada deploy a QA |
| **Carga** | Latencia y errores bajo tráfico; que el rate limit funcione | Repo `e2e-tests` (k6) | Antes de releases grandes; semanal |
| **Smoke** | Que lo desplegado responde | Bloque `smoke` del repo `ci` | Después de cada deploy |
| **Exploratorio** | Lo que nadie pensó | Personas de QA | En QA, por issue |

**La pirámide se respeta:** la mayoría de las pruebas son unitarias e
integración (rápidas, en cada MR); e2e cubre los flujos críticos, no cada
combinación.

### Mínimos por plantilla

| Plantilla | Mínimo en cada MR |
|---|---|
| `go-grpc-service` | Unit de cada caso de uso (feliz, validación, errores del repo); integración del repo contra Postgres |
| `api-gateway` | Tests de autorización generados desde `routes.yaml`; pipeline de seguridad |
| `protos` | buf lint + breaking; compilación por lenguaje |
| `angular-app` / `android-app` | Unit de stores/ViewModels; componentes con lógica |
| `astro-site` | Test de SEO + Lighthouse |

## 3. Trazabilidad: escenario → test → resultado

Cada escenario de aceptación tiene un identificador, y el test que lo cubre lo
lleva como etiqueta:

```markdown
<!-- docs/contenido/issues/042-descuentos/issue.md -->
## Criterios de aceptación
- **CU-042-1** Dado un pedido de $100, cuando aplico un descuento de $20, entonces el total es $80.
- **CU-042-2** Dado un pedido de $100, cuando aplico un descuento de $40, entonces se rechaza (tope 30 %).
```

```ts
// e2e-tests: test etiquetado con el escenario
test('aplicar descuento dentro del tope', { tag: ['@CU-042-1'] }, async ({ page }) => { … });
```

- El reporte de cada corrida produce un **registro de casos de uso**
  (`registro.json`: escenario → estado → última corrida → enlace al reporte).
- `docs` lo lee con el mismo modelo *pull* de `docs/10` §7 y genera la página de
  estado por escenario: ✅ pasa · ❌ falla (con issue) · ⚠️ inestable ·
  🔧 pendiente.
- Un issue no pasa a `resuelto` si alguno de sus escenarios no tiene test o no
  está en verde (lo controla `validar` en docs).

## 4. Ambientes y datos de prueba

| Tema | Regla |
|---|---|
| Ambientes | **Local** (compose) → **CI** (bases efímeras) → **QA** (persistente, datos de prueba) → **Prod**. Opcional: ambientes efímeros por MR |
| Datos | Datos sintéticos generados por scripts de *seed* versionados. **Nunca datos reales de producción** ni datos personales en QA |
| Usuarios de prueba | Uno por rol (sin rol, lector, escritor, admin), con credenciales en el gestor de secretos del CI |
| Aislamiento | Cada test crea lo que necesita y no depende del orden; los e2e usan prefijos para limpiar lo suyo |
| Servicios externos | Simulados en CI (pagos, emails); en QA, sandbox del proveedor |

## 5. Bugs y tests inestables

**Bug encontrado (en QA o en producción):**

1. Issue de tipo `bug` con pasos para reproducir, esperado y obtenido.
2. **Primero el test que lo reproduce** (falla), después el arreglo (pasa).
3. El test queda en la suite como regresión.

**Test inestable (*flaky*):**

- Se detecta: falla y pasa sin cambios de código (los reintentos lo marcan).
- Se **pone en cuarentena** con una etiqueta (`@inestable`) y un issue; sigue
  corriendo pero no bloquea.
- Plazo para arreglarlo o borrarlo: 2 semanas. Un test en cuarentena para
  siempre no protege nada.
- La tasa de inestables se reporta; si sube, se para a arreglar.

## 6. Métricas

| Métrica | Para qué |
|---|---|
| Tasa de éxito de la suite e2e en QA | Salud del sistema |
| Tasa de tests inestables | Confianza en la suite |
| Bugs escapados (encontrados en producción) por release | Calidad de los controles |
| Tiempo del pipeline de MR | Que los controles no frenen el flujo (objetivo: ≤ 10 min) |
| Escenarios sin test | Deuda de cobertura funcional |

## 7. Plantilla `e2e-tests`

Repo que prueba **la plataforma completa** desplegada (un ambiente), separado
de los repos de cada servicio.

```
e2e-tests/
├── playwright.config.ts        ← proyectos: web (por navegador), api, por rol
├── tests/
│   ├── web/                    ← flujos de usuario (Page Objects)
│   ├── api/                    ← API del gateway: auth, permisos por rol, flujos
│   └── fixtures/               ← usuarios por rol, datos, limpieza
├── robustez/                   ← Schemathesis contra el OpenAPI del gateway
├── carga/                      ← escenarios k6 con umbrales
├── scripts/registro.ts         ← reporte → registro.json de casos de uso
├── ambientes/{qa,local}.env.example
└── .github/ | .gitlab-ci.yml   ← usa el pipeline `e2e` del repo `ci`
```

| Pieza | Detalle |
|---|---|
| **Playwright** (UI + API) | Etiquetas por escenario (`@CU-…`), por suite (`@smoke`, `@regresion`) y `@inestable`; trazas y video sólo al fallar; reintentos sólo en CI |
| **Schemathesis** | Lee el OpenAPI del gateway; con token de cada rol; falla en 5xx, respuestas que no cumplen el contrato o tiempos excesivos |
| **k6** | Umbrales (`p95 < 500 ms`, `errores < 1 %`); un escenario verifica que el rate limit responde 429 |
| **Reportes** | HTML de Playwright + registro de casos de uso publicado como artefacto |
| **Disparo** | Desde el pipeline de deploy a QA de cualquier servicio (`workflow_dispatch` / *trigger* de GitLab), nocturno, y manual |
| Preguntas | `ambientes`, `web` (sí/no), `api_gateway_openapi_url`, `auth` (firebase \| oidc \| api-key), `carga` (sí/no), `ci_provider` |

### Criterios de terminado de `e2e-tests`

- [ ] Contra un ambiente local levantado con las plantillas (protos + servicio +
      gateway + front), la suite pasa: UI, API por rol (401/403/200) y smoke.
- [ ] Un escenario etiquetado aparece en `registro.json` con su estado; `docs`
      lo muestra en la página de estado.
- [ ] Schemathesis encuentra un error sembrado a propósito (un handler que
      devuelve 500 ante cierto input) y el job falla.
- [ ] k6 falla si se supera el umbral; el escenario de rate limit ve 429.
- [ ] Un test marcado `@inestable` no bloquea el pipeline pero aparece en el
      reporte.
- [ ] El deploy a QA de un servicio dispara la suite y su resultado bloquea la
      promoción a producción.
- [ ] `copier update` sin conflictos.

## 8. Orden de construcción

1. Este estándar en `workspace/CLAUDE.md` y en las plantillas de issue y de MR/PR
   (escenarios con identificador, checklist de tests).
2. Plantilla `e2e-tests` con Playwright (UI + API) y el registro de casos de uso.
3. Integración con `docs` (página de estado por escenario y regla de `validar`).
4. Schemathesis y k6.
5. Disparo desde los pipelines de deploy (requiere el repo `ci`, `docs/11`).
