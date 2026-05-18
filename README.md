# POC Incidentes Urbanos con IA

Implementacion de la prueba de concepto especificada en el paper `TFG_Manuel_Krivoy_Microservicios_IA_v6 (1).pdf`.

La POC valida el flujo funcional principal de la arquitectura reducida: frontend web, backend principal en Express, modulo de clasificacion NLP/LLM, modulo de asignacion y base de datos local.

## Que implementa

- Registro de incidentes urbanos con descripcion textual.
- Clasificacion automatica por categoria: alumbrado publico, residuos, infraestructura vial, seguridad urbana u otros.
- Determinacion automatica de prioridad: alta, media o baja.
- Asignacion a un area municipal simulada.
- Consulta del estado del incidente.
- Actualizacion de estado con trazabilidad.
- API REST consumible por web, Postman, chatbot o sistemas externos.
- Frontend web en React para registrar y consultar reclamos.
- Panel admin separado en React con login por JWT.
- Dockerfile y Docker Compose para ejecucion contenerizada.

## Arquitectura de la POC

La arquitectura respeta la version reducida indicada en el paper:

```text
Frontend Web
  -> Backend Principal Express
    -> Modulo de Clasificacion NLP/LLM
    -> Modulo de Asignacion
    -> Base de Datos Local
```

Los modulos viven en el mismo backend para evitar complejidad de infraestructura, pero estan separados logicamente en `src/services`. Esto mantiene desacoplamiento, modificabilidad y trazabilidad sin requerir Kubernetes ni cloud para la POC.

## LLM / NLP usado

Por defecto la POC usa `local-keywords`, un clasificador deterministico local basado en palabras clave y reglas de prioridad. Esta decision esta alineada con el paper, que permite para la POC usar reglas basicas, palabras clave o un modelo liviano de NLP para evitar complejidad innecesaria.

Tambien se dejo soporte opcional para un LLM compatible con OpenAI. Si se configura `LLM_PROVIDER=openai` y `OPENAI_API_KEY`, el modulo de clasificacion llama a `/chat/completions` y exige una respuesta JSON con categoria, prioridad, confianza y explicacion. Si el LLM falla, se aplica automaticamente el fallback local para mantener disponibilidad de la POC.

Variables opcionales:

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=tu_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
LLM_TIMEOUT_MS=8000
```

## Requisitos locales

- Node.js 20 o superior.
- npm.
- Docker y Docker Compose, si se quiere levantar contenerizado.

## Levantar localmente con Node

```bash
npm install
npm start
```

Abrir:

```text
http://localhost:3000
```

Panel admin:

```text
http://localhost:3000/admin
```

Credenciales de ejemplo:

```text
email: admin@example.com
password: admin123
```

Modo desarrollo:

```bash
npm run dev
```

## Levantar con Docker

```bash
docker compose up --build
```

Abrir:

```text
http://localhost:3000
```

La persistencia se guarda en el volumen `incidentes-data` usando el archivo `/app/data/incidents.json` dentro del contenedor.

## Ejecutar tests

```bash
npm test
```

Los tests validan el flujo principal, login admin con JWT, proteccion de rutas admin, creacion de administradores y CRUD administrativo de incidentes.

## Endpoints principales

### Healthcheck

```http
GET /health
```

### Registrar incidente

```http
POST /api/incidents
Content-Type: application/json
```

```json
{
  "municipalityId": "demo-municipio",
  "citizenName": "Manuel Krivoy",
  "contact": "manuel@example.com",
  "address": "Av. Principal 123",
  "description": "Hay un bache profundo que bloquea media calle y genera riesgo de accidente."
}
```

### Listar incidentes

```http
GET /api/incidents
```

Filtros opcionales:

```http
GET /api/incidents?status=asignado&municipalityId=demo-municipio
```

### Consultar incidente

```http
GET /api/incidents/:id
```

### Actualizar estado

```http
PATCH /api/incidents/:id/status
Content-Type: application/json
```

```json
{
  "status": "en_proceso",
  "comment": "Cuadrilla municipal asignada."
}
```

Estados permitidos: `registrado`, `asignado`, `en_proceso`, `resuelto`, `rechazado`.

## Endpoints admin

El flujo admin esta separado del flujo publico. No hay registro publico de administradores desde el frontend.

Todas las rutas admin, excepto `POST /api/admin/login`, requieren JWT en el header:

```http
Authorization: Bearer <token>
```

### Admin - Login

```http
POST /api/admin/login
Content-Type: application/json
```

Valida credenciales contra `data/admins.json` y devuelve un JWT.

```json
{
  "email": "admin@example.com",
  "password": "admin123"
}
```

Respuesta:

```json
{
  "token": "<jwt>",
  "admin": {
    "email": "admin@example.com"
  }
}
```

### Admin - Crear administrador

```http
POST /api/admin
Content-Type: application/json
Authorization: Bearer <token>
```

Agrega un nuevo administrador al archivo `data/admins.json`. No funciona sin token valido.

```json
{
  "email": "nuevo-admin@example.com",
  "password": "nuevo123"
}
```

### Uso del JWT en rutas admin

Despues de ejecutar `POST /api/admin/login`, usar el token devuelto como `Bearer token` en `Authorization`. Si el token falta, es invalido o esta vencido, la API responde `401`.

### Admin - Crear incidente

```http
POST /api/admin/incidents
Content-Type: application/json
Authorization: Bearer <token>
```

Usa el mismo cuerpo que `POST /api/incidents`. La API clasifica, asigna responsable y deja trazabilidad inicial.

### Admin - Listar incidentes

```http
GET /api/admin/incidents
Authorization: Bearer <token>
```

Admite los mismos filtros opcionales que el listado publico:

```http
GET /api/admin/incidents?status=asignado&municipalityId=demo-municipio
Authorization: Bearer <token>
```

### Admin - Consultar incidente

```http
GET /api/admin/incidents/:id
Authorization: Bearer <token>
```

### Admin - Actualizar incidente

```http
PUT /api/admin/incidents/:id
Content-Type: application/json
Authorization: Bearer <token>
```

Campos editables: `municipalityId`, `citizenName`, `contact`, `address`, `description`, `status` y `comment`.

Si se cambia `description`, el incidente se reclasifica y reasigna automaticamente. Si se informa `status`, debe ser uno de: `registrado`, `asignado`, `en_proceso`, `resuelto`, `rechazado`.

```json
{
  "citizenName": "Operador Admin Editado",
  "address": "Calle Admin 789",
  "description": "La calle tiene un bache profundo y peligroso.",
  "status": "en_proceso",
  "comment": "Actualizacion administrativa del incidente."
}
```

### Admin - Eliminar incidente

```http
DELETE /api/admin/incidents/:id
Authorization: Bearer <token>
```

Responde `204 No Content` cuando el incidente fue eliminado.

### Clasificar texto

```http
POST /api/classifications
Content-Type: application/json
```

```json
{
  "description": "Hay basura acumulada y mucho olor junto al contenedor."
}
```

### Asignar por clasificacion

```http
POST /api/assignments
Content-Type: application/json
```

```json
{
  "classification": {
    "category": "infraestructura_vial",
    "priority": "media"
  }
}
```

## Postman

La coleccion esta en:

```text
postman/POC-Incidentes-Urbanos.postman_collection.json
```

Importarla en Postman y ejecutar primero `Registrar incidente`. Ese request guarda automaticamente el `incidentId` para las consultas y actualizaciones publicas siguientes.

Para probar el flujo admin, ejecutar primero `Admin - Login`. Ese request guarda automaticamente `adminToken` y la coleccion lo usa como `Authorization: Bearer {{adminToken}}` en las rutas protegidas.

Luego ejecutar `Admin - Crear incidente`. Ese request guarda automaticamente el `adminIncidentId` que usan `Admin - Consultar incidente por ID`, `Admin - Actualizar incidente` y `Admin - Eliminar incidente`.

## Persistencia local

La base local de incidentes es un archivo JSON en:

```text
data/incidents.json
```

Este archivo se crea automaticamente al iniciar la API y no se versiona para evitar subir datos de prueba.

La base local de administradores esta en:

```text
data/admins.json
```

Para la POC guarda `email` y `password` en JSON plano y trae un administrador de ejemplo. En una implementacion real, las passwords deben persistirse hasheadas y el secreto JWT debe configurarse con `JWT_SECRET`.
