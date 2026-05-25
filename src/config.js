// Archivo central de configuracion de la POC.
// Lee variables de entorno y define valores por defecto para puerto, persistencia, JWT y modelo local.
export const config = {
  // Puerto HTTP donde Express expone frontend y API.
  port: Number(process.env.PORT || 3000),
  // Archivo JSON de incidentes; en Docker se sobreescribe a /app/data/incidents.json.
  dataFile: process.env.DATA_FILE || 'data/incidents.json',
  // Archivo JSON de administradores demo.
  adminsFile: process.env.ADMINS_FILE || 'data/admins.json',
  // Secreto para firmar/verificar JWT del panel admin.
  jwtSecret: process.env.JWT_SECRET || 'poc-admin-secret-change-me',
  llm: {
    // Configuracion del modelo usado para clasificar; si falla, classificationService usa reglas locales.
    provider: process.env.CLASSIFICATION_LLM_PROVIDER || 'local-keywords',
    baseUrl: process.env.CODELLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.CODELLAMA_MODEL || 'qwen2.5:0.5b-instruct',
    timeoutMs: Number(process.env.CLASSIFICATION_LLM_TIMEOUT_MS || 8000)
  },
  assignmentLlm: {
    // Configuracion del modelo usado para asignar area responsable; si falla, assignmentService usa reglas locales.
    provider: process.env.ASSIGNMENT_LLM_PROVIDER || 'local-rules',
    baseUrl: process.env.CODELLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.CODELLAMA_MODEL || 'qwen2.5:0.5b-instruct',
    timeoutMs: Number(process.env.ASSIGNMENT_LLM_TIMEOUT_MS || 8000)
  }
};
