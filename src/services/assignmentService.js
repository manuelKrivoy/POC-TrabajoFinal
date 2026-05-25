// Modulo de asignacion de incidentes.
// Decide el area municipal responsable usando primero Ollama y reglas locales como fallback.
import { getResponsibleArea } from './classificationService.js';

const VALID_PRIORITIES = ['alta', 'media', 'baja'];

// Las reglas locales garantizan que siempre haya una asignacion aun cuando el LLM local no responda.
export function assignIncidentWithRules(classification) {
  const responsibleArea = getResponsibleArea(classification.category);

  return {
    responsibleArea,
    assignmentRule: classification.category === 'otros'
      ? 'Derivacion manual por categoria no identificada'
      : `Derivacion automatica por categoria ${classification.category}`,
    slaHours: classification.priority === 'alta' ? 4 : classification.priority === 'media' ? 24 : 72
  };
}

function parseCodellamaAssignment(content, fallback, classification) {
  // Extrae JSON de la respuesta del modelo y completa campos faltantes con la asignacion local.
  const cleaned = content.replace(/```json|```/g, '').trim();
  const json = cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned;
  const parsed = JSON.parse(json);
  const parsedResponsibleArea = typeof parsed.responsibleArea === 'string' && parsed.responsibleArea.trim()
    ? parsed.responsibleArea.trim()
    : fallback.responsibleArea;
  const responsibleArea = classification.category && classification.category !== 'otros'
    ? fallback.responsibleArea
    : parsedResponsibleArea;
  const priority = VALID_PRIORITIES.includes(parsed.priority) ? parsed.priority : null;
  const slaHours = Number.isFinite(Number(parsed.slaHours)) ? Number(parsed.slaHours) : fallback.slaHours;
  const assignmentRule = typeof parsed.assignmentRule === 'string' && parsed.assignmentRule.trim()
    ? parsed.assignmentRule.trim()
    : `Derivacion asistida por modelo local para ${responsibleArea}`;

  return {
    responsibleArea,
    assignmentRule,
    slaHours,
    prioritySuggestion: priority,
    method: 'codellama-local'
  };
}

async function assignWithCodellama(classification, llmConfig, fallback, context) {
  // Envia categoria, prioridad y descripcion original al modelo para que proponga area/SLA.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), llmConfig.timeoutMs);

  try {
    const response = await fetch(`${llmConfig.baseUrl}/api/generate`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: llmConfig.model,
        stream: false,
        prompt: [
          'Sos un asistente municipal. Asigna incidentes urbanos a un area responsable.',
          'Responde solo JSON valido con responsibleArea, assignmentRule, slaHours y priority.',
          'Areas validas:',
          '- alumbrado_publico => Direccion de Alumbrado Publico',
          '- residuos => Direccion de Higiene Urbana',
          '- infraestructura_vial => Direccion de Obras Publicas',
          '- seguridad_urbana => Centro de Monitoreo y Seguridad Urbana',
          '- otros => Mesa de Entrada Municipal',
          'Si la clasificacion ya trae una categoria, respeta el area correspondiente a esa categoria.',
          `Descripcion: ${context.description || 'sin descripcion'}`,
          `Clasificacion: ${JSON.stringify(classification)}`
        ].join('\n')
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`CodeLlama respondio ${response.status}${detail ? `: ${detail}` : ''}`);
    }

    const payload = await response.json();
    return parseCodellamaAssignment(payload.response || '{}', fallback, classification);
  } finally {
    clearTimeout(timeout);
  }
}

export async function assignIncident(classification, llmConfig = {}, context = {}) {
  // Punto de entrada usado por incidentService y /api/assignments.
  const fallback = assignIncidentWithRules(classification || {});

  if (llmConfig.provider !== 'codellama') {
    return { ...fallback, method: 'local-rules' };
  }

  try {
    return await assignWithCodellama(classification || {}, llmConfig, fallback, context);
  } catch (error) {
    return {
      ...fallback,
      method: 'local-rules-fallback',
      assignmentRule: `${fallback.assignmentRule}. Fallback local aplicado porque CodeLlama no estuvo disponible: ${error.message}.`
    };
  }
}
