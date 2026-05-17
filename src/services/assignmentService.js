import { getResponsibleArea } from './classificationService.js';

export function assignIncident(classification) {
  const responsibleArea = getResponsibleArea(classification.category);

  return {
    responsibleArea,
    assignmentRule: classification.category === 'otros'
      ? 'Derivacion manual por categoria no identificada'
      : `Derivacion automatica por categoria ${classification.category}`,
    slaHours: classification.priority === 'alta' ? 4 : classification.priority === 'media' ? 24 : 72
  };
}
