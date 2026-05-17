const CATEGORIES = {
  alumbrado_publico: {
    label: 'Alumbrado publico',
    area: 'Direccion de Alumbrado Publico',
    keywords: ['luz', 'poste', 'lampara', 'alumbrado', 'oscuro', 'quemada', 'cable', 'electrico', 'electrica']
  },
  residuos: {
    label: 'Recoleccion de residuos',
    area: 'Direccion de Higiene Urbana',
    keywords: ['basura', 'residuo', 'contenedor', 'recoleccion', 'bolsas', 'olor', 'suciedad', 'limpieza']
  },
  infraestructura_vial: {
    label: 'Infraestructura vial',
    area: 'Direccion de Obras Publicas',
    keywords: ['bache', 'pozo', 'calle', 'vereda', 'asfalto', 'pavimento', 'cordon', 'hundimiento', 'ruta']
  },
  seguridad_urbana: {
    label: 'Seguridad urbana',
    area: 'Centro de Monitoreo y Seguridad Urbana',
    keywords: ['robo', 'asalto', 'violencia', 'disturbio', 'peligro', 'amenaza', 'vandalismo', 'arma', 'inseguridad']
  }
};

const PRIORITY_KEYWORDS = {
  alta: ['urgente', 'peligro', 'riesgo', 'herido', 'accidente', 'electrocutar', 'arma', 'violencia', 'incendio', 'explosion'],
  media: ['bloquea', 'bloqueada', 'varios', 'acumulada', 'transito', 'profundo', 'sin luz', 'inundacion'],
  baja: ['consulta', 'menor', 'leve', 'pequeno', 'pequena']
};

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function scoreCategory(text) {
  return Object.entries(CATEGORIES).map(([category, definition]) => {
    const score = definition.keywords.reduce((total, keyword) => total + (text.includes(keyword) ? 1 : 0), 0);
    return { category, score };
  }).sort((a, b) => b.score - a.score)[0];
}

function detectPriority(text, category) {
  if (PRIORITY_KEYWORDS.alta.some((keyword) => text.includes(keyword)) || category === 'seguridad_urbana') {
    return 'alta';
  }

  if (PRIORITY_KEYWORDS.media.some((keyword) => text.includes(keyword)) || category === 'infraestructura_vial') {
    return 'media';
  }

  if (PRIORITY_KEYWORDS.baja.some((keyword) => text.includes(keyword))) {
    return 'baja';
  }

  return 'media';
}

function explain(category, priority, matched) {
  if (category === 'otros') {
    return 'No se detectaron palabras clave suficientes; se deriva a mesa de entrada para revision.';
  }

  return `Clasificado como ${CATEGORIES[category].label} por coincidencias de texto (${matched.join(', ') || 'contexto general'}). Prioridad ${priority}.`;
}

export function classifyWithRules(description) {
  const normalized = normalize(description);
  const best = scoreCategory(normalized);
  const category = best.score > 0 ? best.category : 'otros';
  const priority = detectPriority(normalized, category);
  const matched = category === 'otros'
    ? []
    : CATEGORIES[category].keywords.filter((keyword) => normalized.includes(keyword));

  return {
    category,
    categoryLabel: category === 'otros' ? 'Otros' : CATEGORIES[category].label,
    priority,
    confidence: category === 'otros' ? 0.35 : Math.min(0.95, 0.55 + best.score * 0.12),
    method: 'local-keywords',
    explanation: explain(category, priority, matched)
  };
}

function parseLlmClassification(content) {
  const cleaned = content.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(cleaned);
  const category = CATEGORIES[parsed.category] ? parsed.category : 'otros';
  const priority = ['alta', 'media', 'baja'].includes(parsed.priority) ? parsed.priority : 'media';

  return {
    category,
    categoryLabel: category === 'otros' ? 'Otros' : CATEGORIES[category].label,
    priority,
    confidence: Number(parsed.confidence || 0.75),
    method: 'openai-compatible-llm',
    explanation: parsed.explanation || 'Clasificacion generada por LLM compatible con OpenAI.'
  };
}

export async function classifyIncident(description, llmConfig) {
  if (!description || typeof description !== 'string' || description.trim().length < 8) {
    const error = new Error('La descripcion debe tener al menos 8 caracteres.');
    error.statusCode = 400;
    throw error;
  }

  if (llmConfig.provider === 'openai' && llmConfig.apiKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), llmConfig.timeoutMs);
      const response = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${llmConfig.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: llmConfig.model,
          temperature: 0,
          messages: [
            {
              role: 'system',
              content: 'Clasifica incidentes urbanos. Responde solo JSON valido con category, priority, confidence y explanation. category debe ser una de: alumbrado_publico, residuos, infraestructura_vial, seguridad_urbana, otros. priority debe ser alta, media o baja.'
            },
            { role: 'user', content: description }
          ]
        })
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`LLM respondio ${response.status}`);
      }

      const payload = await response.json();
      return parseLlmClassification(payload.choices?.[0]?.message?.content || '{}');
    } catch (error) {
      const fallback = classifyWithRules(description);
      return {
        ...fallback,
        explanation: `${fallback.explanation} Fallback local aplicado porque el LLM no estuvo disponible: ${error.message}.`
      };
    }
  }

  return classifyWithRules(description);
}

export function listCategories() {
  return Object.entries(CATEGORIES).map(([id, value]) => ({ id, label: value.label, responsibleArea: value.area }));
}

export function getResponsibleArea(category) {
  return CATEGORIES[category]?.area || 'Mesa de Entrada Municipal';
}
