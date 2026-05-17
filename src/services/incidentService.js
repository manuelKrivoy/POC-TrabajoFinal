import { randomUUID } from 'node:crypto';
import { assignIncident } from './assignmentService.js';
import { classifyIncident } from './classificationService.js';

const VALID_STATUSES = ['registrado', 'asignado', 'en_proceso', 'resuelto', 'rechazado'];

function now() {
  return new Date().toISOString();
}

function trace(type, detail) {
  return { at: now(), type, detail };
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
    if (!VALID_STATUSES.includes(status)) {
      const error = new Error(`Estado invalido. Valores permitidos: ${VALID_STATUSES.join(', ')}.`);
      error.statusCode = 400;
      throw error;
    }

    const data = await this.database.read();
    const incident = data.incidents.find((item) => item.id === id);
    if (!incident) {
      const error = new Error('Incidente no encontrado.');
      error.statusCode = 404;
      throw error;
    }

    incident.status = status;
    incident.updatedAt = now();
    incident.trace.push(trace('seguimiento', comment || `Estado actualizado a ${status}.`));
    await this.database.write(data);
    return incident;
  }
}
