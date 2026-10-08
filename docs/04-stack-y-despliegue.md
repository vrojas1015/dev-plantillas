# Stack y despliegue

Las plantillas tienen una opinión clara: **Google primero**. El código es
portable (contenedores y configuración por variables de entorno), así que el
destino del deploy se elige al generar el proyecto y se puede cambiar después.

## Stack

| Necesidad | Servicio | Notas |
|---|---|---|
| Backend propio | Go en **Cloud Run** | Plantilla `go-grpc-service` |
| Datos relacionales | **Cloud SQL (Postgres)** | La opción por defecto para datos de negocio |
| Datos simples, tiempo real u offline en móvil | **Firestore** | Ver la regla de abajo |
| Auth, hosting web, push | **Firebase** Auth / Hosting / FCM | |
| Archivos | Cloud Storage / Firebase Storage | |
| CI/CD | Cloud Build + Workload Identity Federation | Sin claves JSON en el CI |

### Regla de Firestore

Firestore cobra **por lectura y escritura** y no tiene joins. Usarlo sólo cuando
su modelo encaja: documentos independientes, sincronización en tiempo real,
offline en móvil. **Si los datos tienen relaciones** (pedidos ↔ clientes ↔
productos, escuelas ↔ alumnos ↔ tutores), van en Postgres.

## Destinos de deploy

Cada plantilla pregunta `deploy_target`:

| Plantilla | Opciones |
|---|---|
| `go-grpc-service` | `cloud-run` (default) · `coolify` · `ninguno` |
| `angular-app` | `firebase-hosting` (default) · `coolify` · `ninguno` |

| | Google (Cloud Run / Firebase Hosting) | Coolify en un VPS propio |
|---|---|---|
| Costo | Por uso; crece con el tráfico | Fijo: el precio del VPS |
| Mantenimiento | Ninguno | **Propio**: actualizaciones, seguridad, disco |
| Escala y disponibilidad | Automática, multi-zona | Un servidor: si cae, cae todo |
| Base de datos | Cloud SQL con backups gestionados | Postgres en Coolify: **backups a configurar y probar** |
| Ideal para | Clientes, producción de un equipo | Proyectos personales, MVPs, demos, portafolio |

### Reglas para que el código sea portable

1. **Toda la configuración por variables de entorno**, con los mismos nombres
   en todos los destinos (`DATABASE_URL`, `GRPC_PORT`, `APP_ENV`, ...).
2. **El `Dockerfile` es el mismo** en todos los destinos; sólo cambian los
   archivos de deploy y el CI.
3. **Nada de SDKs del proveedor en el dominio.** Si hace falta uno (p. ej.
   Secret Manager), va detrás de un port en `app/infra`.

## Cambiar de destino: de Coolify a Google

Un proyecto que empezó en Coolify y crece pasa a Google sin reescribir código:

```bash
git switch -c chore/migrar-de-destino
# Servicio Go: Coolify -> Cloud Run
python -m copier update --defaults --data deploy_target=cloud-run --data gcp_project=<proyecto> --data gcp_region=us-central1
# App Angular: Coolify -> Firebase Hosting (si ya usa Firebase Auth, alcanza con deploy_target)
python -m copier update --defaults --data deploy_target=firebase-hosting --data firebase_project_qa=<id-qa> --data firebase_project_prod=<id-prod>
```

`copier update` regenera el proyecto con la respuesta nueva: aparecen los
archivos de Google y desaparecen los de Coolify. Agregando `--vcs-ref=:current:`
cambia sólo el destino, sin traer a la vez cambios de una versión nueva de la
plantilla (recomendado: un cambio por vez).

> **Ojo:** Copier **borra sin avisar** los archivos exclusivos de Coolify
> (`docker-compose.coolify.yml`, `Dockerfile`/`Caddyfile` de Angular) aunque
> los hayas editado. Si tenían cambios propios, recuperalos del commit anterior
> (`git show HEAD:<archivo>`) antes de borrar la rama.

El resto —datos (`scripts/migrate_db.sh`, que copia y compara conteos por
tabla), secretos, QA y corte de DNS— está paso a paso en el
`docs/migrar-a-*.md` que trae cada proyecto generado con `coolify`. Esa guía
desaparece con el update: seguila desde `main`.

## Alternativas documentadas (sin plantilla todavía)

| Opción | Cuándo considerarla |
|---|---|
| **Supabase** | Proyecto nuevo y chico, datos relacionales, sin ganas de escribir backend, y preocupa el costo por lectura de Firestore o depender sólo de Google. Es Postgres + auth + API automática; la seguridad vive en políticas RLS |

Se construye la plantilla el día que llegue un proyecto real que la necesite.
