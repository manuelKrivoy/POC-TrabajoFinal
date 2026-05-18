export const config = {
  port: Number(process.env.PORT || 3000),
  dataFile: process.env.DATA_FILE || 'data/incidents.json',
  adminsFile: process.env.ADMINS_FILE || 'data/admins.json',
  jwtSecret: process.env.JWT_SECRET || 'poc-admin-secret-change-me',
  llm: {
    provider: process.env.LLM_PROVIDER || 'local-keywords',
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 8000)
  }
};
