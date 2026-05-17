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
- Frontend web simple para registrar y consultar reclamos.
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

Los tests validan el flujo principal: registrar, clasificar, asignar, consultar y actualizar estado con trazabilidad.

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

Importarla en Postman y ejecutar primero `Registrar incidente`. Ese request guarda automaticamente el `incidentId` para las consultas y actualizaciones siguientes.

## Persistencia local

La base local es un archivo JSON en:

```text
data/incidents.json
```

Este archivo se crea automaticamente al iniciar la API y no se versiona para evitar subir datos de prueba.
