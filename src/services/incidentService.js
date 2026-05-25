// Servicio de negocio principal de incidentes.
// Orquesta clasificacion, asignacion, persistencia y trazabilidad de cada reclamo.
import { randomUUID } from 'node:crypto';
import { assignIncident } from './assignmentService.js';
import { classifyIncident } from './classificationService.js';

const VALID_STATUSES = ['registrado', 'asignado', 'en_proceso', 'resuelto', 'rechazado'];
const EDITABLE_FIELDS = ['municipalityId', 'citizenName', 'contact', 'address'];

function now() {
  // Fecha ISO para guardar timestamps comparables y serializables en JSON.
  return new Date().toISOString();
}

function trace(type, detail) {
  // Entrada de auditoria que explica que paso con el incidente en cada etapa.
  return { at: now(), type, detail };
}

function validateStatus(status) {
  // Evita estados arbitrarios; la API solo permite el ciclo definido por la POC.
  if (!VALID_STATUSES.includes(status)) {
    const error = new Error(`Estado invalido. Valores permitidos: ${VALID_STATUSES.join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }
}

function notFoundError() {
  // Error reutilizable para lecturas/updates/deletes de IDs inexistentes.
  const error = new Error('Incidente no encontrado.');
  error.statusCode = 404;
  return error;
}

export class IncidentService {
  constructor(database, llmConfig, assignmentLlmConfig) {
    // Recibe dependencias desde app.js para mantener este servicio testeable.
    this.database = database;
    this.llmConfig = llmConfig;
    this.assignmentLlmConfig = assignmentLlmConfig;
  }

  // Crea el incidente completo: valida texto, clasifica, asigna responsable y persiste trazabilidad.
  async create(input) {
    const description = String(input.description || '').trim();
    const classification = await classifyIncident(description, this.llmConfig);
    const assignment = await assignIncident(classification, this.assignmentLlmConfig, { description });
    const timestamp = now();

    const incident = {
      id: randomUUID(),
      municipalityId: input.municipalityId || 'demo-municipio',
      citizenName: input.citizenName || 'Ciudadano anonimo',
      contact: input.contact || null,
      address: input.address || null,
      description,
      classification,
      assignment,
      status: 'asignado',
      createdAt: timestamp,
      updatedAt: timestamp,
      trace: [
        trace('registro', 'Incidente recibido y validado por el backend principal.'),
        trace('clasificacion', classification.explanation),
        trace('asignacion', `${assignment.responsibleArea}. SLA estimado: ${assignment.slaHours} horas.`)
      ]
    };

    const data = await this.database.read();
    data.incidents.unshift(incident);
    await this.database.write(data);
    return incident;
  }

  async list(filters = {}) {
    // Devuelve incidentes filtrados por query params soportados por la API.
    const data = await this.database.read();
    // Los filtros se aplican en memoria porque la POC usa una base JSON local.
    return data.incidents.filter((incident) => {
      if (filters.status && incident.status !== filters.status) return false;
      if (filters.municipalityId && incident.municipalityId !== filters.municipalityId) return false;
      return true;
    });
  }

  async getById(id) {
    // Busca un incidente puntual por UUID; devuelve null si no existe.
    const data = await this.database.read();
    return data.incidents.find((incident) => incident.id === id) || null;
  }

  async updateStatus(id, status, comment) {
    // Cambia solo el estado publico y agrega una entrada de seguimiento.
    validateStatus(status);

    const data = await this.database.read();
    const incident = data.incidents.find((item) => item.id === id);
    if (!incident) {
      throw notFoundError();
    }

    incident.status = status;
    incident.updatedAt = now();
    incident.trace.push(trace('seguimiento', comment || `Estado actualizado a ${status}.`));
    await this.database.write(data);
    return incident;
  }

  async update(id, input = {}) {
    // Edicion administrativa: permite cambiar campos, estado y reclasificar si cambia la descripcion.
    const data = await this.database.read();
    const incident = data.incidents.find((item) => item.id === id);
    if (!incident) {
      throw notFoundError();
    }

    for (const field of EDITABLE_FIELDS) {
      if (Object.hasOwn(input, field)) {
        incident[field] = input[field] || null;
      }
    }

    if (Object.hasOwn(input, 'description')) {
      const description = String(input.description || '').trim();
      const classification = await classifyIncident(description, this.llmConfig);
      const assignment = await assignIncident(classification, this.assignmentLlmConfig, { description });
      incident.description = description;
      incident.classification = classification;
      incident.assignment = assignment;
      incident.trace.push(trace('clasificacion', `Reclasificacion administrativa: ${classification.explanation}`));
      incident.trace.push(trace('asignacion', `Reasignacion administrativa: ${assignment.responsibleArea}. SLA estimado: ${assignment.slaHours} horas.`));
    }

    if (Object.hasOwn(input, 'status')) {
      validateStatus(input.status);
      incident.status = input.status;
    }

    incident.updatedAt = now();
    incident.trace.push(trace('admin_actualizacion', input.comment || 'Incidente actualizado desde ruta admin.'));
    await this.database.write(data);
    return incident;
  }

  async delete(id) {
    // Eliminacion administrativa del JSON local.
    const data = await this.database.read();
    const index = data.incidents.findIndex((incident) => incident.id === id);
    if (index === -1) {
      throw notFoundError();
    }

    const [incident] = data.incidents.splice(index, 1);
    await this.database.write(data);
    return incident;
  }
}
