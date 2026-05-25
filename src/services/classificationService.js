// Modulo de clasificacion de incidentes.
// Intenta usar un modelo local via Ollama y mantiene reglas deterministicas como fallback seguro.
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
    keywords: ['robo', 'asalto', 'violencia', 'disturbio', 'peligro', 'amenaza', 'vandalismo', 'arma', 'inseguridad', 'cadaver', 'cuerpo', 'muerto', 'fallecido']
  }
};

// Palabras que elevan o bajan la prioridad cuando se usa el clasificador deterministico local.
const PRIORITY_KEYWORDS = {
  alta: ['urgente', 'peligro', 'riesgo', 'herido', 'accidente', 'electrocutar', 'arma', 'violencia', 'incendio', 'explosion'],
  media: ['bloquea', 'bloqueada', 'varios', 'acumulada', 'transito', 'profundo', 'sin luz', 'inundacion'],
  baja: ['consulta', 'menor', 'leve', 'pequeno', 'pequena']
};

function normalize(text) {
  // Normaliza texto para comparar palabras clave sin depender de mayusculas ni acentos.
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function scoreCategory(text) {
  // Cuenta coincidencias por categoria y se queda con la categoria de mayor puntaje.
  return Object.entries(CATEGORIES).map(([category, definition]) => {
    const score = definition.keywords.reduce((total, keyword) => total + (text.includes(keyword) ? 1 : 0), 0);
    return { category, score };
  }).sort((a, b) => b.score - a.score)[0];
}

function detectPriority(text, category) {
  // Define prioridad con reglas simples; seguridad urbana siempre se trata como alta.
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
  // Genera una explicacion trazable para guardar en el historial del incidente.
  if (category === 'otros') {
    return 'No se detectaron palabras clave suficientes; se deriva a mesa de entrada para revision.';
  }

  return `Clasificado como ${CATEGORIES[category].label} por coincidencias de texto (${matched.join(', ') || 'contexto general'}). Prioridad ${priority}.`;
}

export function classifyWithRules(description) {
  // Clasificador deterministico: puntua categorias por keywords y calcula confianza aproximada.
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

function parseCodellamaClassification(content, fallback) {
  // Ollama devuelve texto libre; se extrae el primer objeto JSON para tolerar respuestas con explicacion alrededor.
  const cleaned = content.replace(/```json|```/g, '').trim();
  const json = cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned;
  const parsed = JSON.parse(json);
  // Si las reglas locales detectaron una categoria concreta, no permitimos que un modelo chico la contradiga.
  const parsedCategory = CATEGORIES[parsed.category] ? parsed.category : fallback.category;
  const category = fallback.category !== 'otros' && parsedCategory !== fallback.category
    ? fallback.category
    : parsedCategory;
  const priority = ['alta', 'media', 'baja'].includes(parsed.priority) ? parsed.priority : fallback.priority;
  const rawConfidence = Number(parsed.confidence || 0.75);
  const confidence = rawConfidence > 1 ? rawConfidence / 100 : rawConfidence;
  const explanation = category === parsedCategory
    ? parsed.explanation || 'Clasificacion generada por modelo local.'
    : `El modelo sugirio ${parsedCategory}, pero se preservo ${category} por coincidencias locales criticas. ${parsed.explanation || ''}`.trim();

  return {
    category,
    categoryLabel: category === 'otros' ? 'Otros' : CATEGORIES[category].label,
    priority,
    confidence: Math.max(0, Math.min(1, confidence)),
    method: 'codellama-local',
    explanation
  };
}

async function classifyWithCodellama(description, llmConfig, fallback) {
  // Llama al endpoint /api/generate de Ollama. AbortController evita que un modelo colgado bloquee la API.
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
          'Clasifica incidentes urbanos municipales en Argentina.',
          'Responde solo JSON valido con category, priority, confidence y explanation.',
          'category debe ser una de: alumbrado_publico, residuos, infraestructura_vial, seguridad_urbana, otros.',
          'Definiciones:',
          '- alumbrado_publico: luces, postes, lamparas, cables electricos o falta de iluminacion.',
          '- residuos: basura, contenedores, limpieza, malos olores por residuos.',
          '- infraestructura_vial: baches, veredas, asfalto, calles, pavimento.',
          '- seguridad_urbana: robos, violencia, amenazas, armas, vandalismo, cadaveres, cuerpos, muertos, riesgos graves para personas.',
          '- otros: solo si no corresponde ninguna categoria anterior.',
          'Ejemplo: "un cadaver en la cuadra" => {"category":"seguridad_urbana","priority":"alta","confidence":0.95,"explanation":"Presencia de cadaver o posible muerte en via publica."}',
          'priority debe ser alta, media o baja.',
          `Descripcion: ${description}`
        ].join('\n')
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`CodeLlama respondio ${response.status}${detail ? `: ${detail}` : ''}`);
    }

    const payload = await response.json();
    return parseCodellamaClassification(payload.response || '{}', fallback);
  } finally {
    clearTimeout(timeout);
  }
}

export async function classifyIncident(description, llmConfig = {}) {
  // Valida entrada, calcula fallback local y luego intenta modelo local si esta configurado.
  if (!description || typeof description !== 'string' || description.trim().length < 8) {
    const error = new Error('La descripcion debe tener al menos 8 caracteres.');
    error.statusCode = 400;
    throw error;
  }

  const fallback = classifyWithRules(description);

  if (llmConfig.provider !== 'codellama') {
    return fallback;
  }

  try {
    return await classifyWithCodellama(description, llmConfig, fallback);
  } catch (error) {
    return {
      ...fallback,
      method: 'local-keywords-fallback',
      explanation: `${fallback.explanation} Fallback local aplicado porque CodeLlama no estuvo disponible: ${error.message}.`
    };
  }
}

export function listCategories() {
  // Expone catalogo de categorias para frontends, Postman o integraciones externas.
  return Object.entries(CATEGORIES).map(([id, value]) => ({ id, label: value.label, responsibleArea: value.area }));
}

export function getResponsibleArea(category) {
  // Traduce categoria a area municipal; si no se reconoce deriva a mesa de entrada.
  return CATEGORIES[category]?.area || 'Mesa de Entrada Municipal';
}
