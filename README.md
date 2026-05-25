# POC Incidentes Urbanos con IA

Implementacion de la prueba de concepto especificada en el paper `TFG_Manuel_Krivoy_Microservicios_IA_v6 (1).pdf`.

La POC valida el flujo funcional principal de la arquitectura reducida: frontend web, backend principal en Express, modulo de clasificacion NLP/LLM, modulo de asignacion y base de datos local.

## Que implementa

- Registro de incidentes urbanos con descripcion textual.
- Clasificacion automatica por categoria: alumbrado publico, residuos, infraestructura vial, seguridad urbana u otros.
- Determinacion automatica de prioridad: alta, media o baja.
- Asignacion a un area municipal simulada por reglas locales o, opcionalmente, por CodeLlama local.
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

La POC puede usar un modelo local mediante Ollama para clasificar y asignar incidentes. Si se configuran `CLASSIFICATION_LLM_PROVIDER=codellama` y `ASSIGNMENT_LLM_PROVIDER=codellama`, ambos modulos llaman a Ollama en `/api/generate`.

`local-keywords` queda como fallback de clasificacion si el modelo local no responde o devuelve un formato invalido. La asignacion tambien vuelve a reglas locales si falla el modelo.

Variables opcionales:

```bash
CLASSIFICATION_LLM_PROVIDER=codellama
CLASSIFICATION_LLM_TIMEOUT_MS=8000
ASSIGNMENT_LLM_PROVIDER=codellama
CODELLAMA_BASE_URL=http://localhost:11434
CODELLAMA_MODEL=qwen2.5:0.5b-instruct
ASSIGNMENT_LLM_TIMEOUT_MS=8000
```

Tambien se incluye `.env.example` con estas variables listas para copiar a un `.env` local si se quiere cargar configuracion desde entorno.

## Usar un modelo local para clasificacion y asignacion

La integracion local recomendada es Ollama, porque expone una API HTTP simple compatible con el backend de la POC.

1. Instalar Ollama desde `https://ollama.com/download`.
2. Descargar un modelo liviano. Esta POC usa por defecto `qwen2.5:0.5b-instruct` porque requiere mucha menos memoria que `codellama:7b-instruct`:

```bash
ollama pull qwen2.5:0.5b-instruct
```

3. Verificar que Ollama este corriendo:

```bash
ollama list
```

4. Levantar la API con clasificacion y asignacion por el modelo local:

```bash
CLASSIFICATION_LLM_PROVIDER=codellama ASSIGNMENT_LLM_PROVIDER=codellama CODELLAMA_BASE_URL=http://localhost:11434 CODELLAMA_MODEL=qwen2.5:0.5b-instruct npm start
```

5. Validar el modo de clasificacion y asignacion con el healthcheck:

```http
GET /health
```

Respuesta esperada usando el modelo local:

```json
{
  "status": "ok",
  "classificationMode": "codellama",
  "assignmentMode": "codellama",
  "classification": {
    "provider": "codellama",
    "model": "qwen2.5:0.5b-instruct"
  },
  "assignment": {
    "provider": "codellama",
    "model": "qwen2.5:0.5b-instruct"
  }
}
```

Si CodeLlama no esta configurado, el healthcheck devuelve modos locales:

```json
{
  "status": "ok",
  "classificationMode": "local-keywords",
  "assignmentMode": "local-assignment",
  "assignmentLlmProvider": "local-rules"
}
```

## Cambiar facilmente el modelo local

El backend no esta atado al modelo `qwen2.5:0.5b-instruct`. Ese modelo se eligio porque consume poca memoria y funciona en maquinas chicas. En una computadora con mas RAM se puede usar un modelo mejor cambiando solo `CODELLAMA_MODEL`.

Pasos:

1. Elegir un modelo disponible en Ollama. Ejemplos utiles:

```text
qwen2.5:0.5b-instruct  -> muy liviano, menor calidad, ideal para 1-2 GB
llama3.2:1b            -> liviano y mejor para lenguaje general
gemma2:2b              -> mejor calidad, requiere mas memoria
qwen2.5:3b-instruct    -> mejor razonamiento, requiere mas memoria
llama3.1:8b            -> mucha mejor calidad, requiere bastante mas RAM
```

2. Descargarlo en la maquina donde corre Ollama:

```bash
ollama pull llama3.2:1b
```

Si `ollama` no esta en el PATH, tambien se puede descargar por API:

```http
POST http://localhost:11434/api/pull
Content-Type: application/json

{
  "name": "llama3.2:1b",
  "stream": false
}
```

3. Cambiar el modelo en `.env`, `.env.example` o `docker-compose.yml`:

```env
CODELLAMA_MODEL=llama3.2:1b
```

4. Si se levanta con Node local:

```bash
CODELLAMA_MODEL=llama3.2:1b npm start
```

5. Si se levanta con Docker, editar `docker-compose.yml`:

```yaml
environment:
  CODELLAMA_MODEL: llama3.2:1b
```

Despues reconstruir:

```bash
docker compose up --build
```

6. Validar el modelo activo:

```http
GET http://localhost:3000/health
```

La respuesta debe mostrar el nuevo modelo en ambos bloques:

```json
{
  "classification": {
    "model": "llama3.2:1b"
  },
  "assignment": {
    "model": "llama3.2:1b"
  }
}
```

Si el modelo es muy pesado para la computadora, Ollama puede responder con error de memoria. En ese caso la API no se cae: usa `local-keywords-fallback` para clasificacion y `local-rules-fallback` para asignacion.

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

Cuando la API corre dentro de Docker y Ollama corre en la maquina host, no usar `http://localhost:11434` para Ollama. Dentro del contenedor, `localhost` apunta al propio contenedor, no a tu PC. Por eso `docker-compose.yml` usa:

```text
CODELLAMA_BASE_URL=http://host.docker.internal:11434
```

Validar el modo de clasificacion y asignacion con:

```http
GET http://localhost:3000/health
```

Si Docker esta configurado para el modelo local, la respuesta debe incluir:

```json
{
  "classificationMode": "codellama",
  "assignmentMode": "codellama",
  "classification": {
    "model": "qwen2.5:0.5b-instruct",
    "baseUrl": "http://host.docker.internal:11434"
  },
  "assignment": {
    "model": "qwen2.5:0.5b-instruct",
    "baseUrl": "http://host.docker.internal:11434"
  }
}
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
