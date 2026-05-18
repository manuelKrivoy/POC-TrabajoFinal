import { randomUUID } from 'node:crypto';
import { assignIncident } from './assignmentService.js';
import { classifyIncident } from './classificationService.js';

const VALID_STATUSES = ['registrado', 'asignado', 'en_proceso', 'resuelto', 'rechazado'];
const EDITABLE_FIELDS = ['municipalityId', 'citizenName', 'contact', 'address'];

function now() {
  return new Date().toISOString();
}

function trace(type, detail) {
  return { at: now(), type, detail };
}

function validateStatus(status) {
  if (!VALID_STATUSES.includes(status)) {
    const error = new Error(`Estado invalido. Valores permitidos: ${VALID_STATUSES.join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }
}

function notFoundError() {
  const error = new Error('Incidente no encontrado.');
  error.statusCode = 404;
  return error;
}

export class IncidentService {
  constructor(database, llmConfig) {
    this.database = database;
    this.llmConfig = llmConfig;
  }

  async create(input) {
    const description = String(input.description || '').trim();
    const classification = await classifyIncident(description, this.llmConfig);
    const assignment = assignIncident(classification);
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
    const data = await this.database.read();
    return data.incidents.filter((incident) => {
      if (filters.status && incident.status !== filters.status) return false;
      if (filters.municipalityId && incident.municipalityId !== filters.municipalityId) return false;
      return true;
    });
  }

  async getById(id) {
    const data = await this.database.read();
    return data.incidents.find((incident) => incident.id === id) || null;
  }

  async updateStatus(id, status, comment) {
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
      const assignment = assignIncident(classification);
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
