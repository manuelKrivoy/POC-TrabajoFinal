// Define la aplicacion Express completa: middlewares, frontend estatico, rutas publicas,
// rutas admin protegidas, healthcheck y manejo centralizado de errores.
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { JsonDatabase } from './services/database.js';
import { IncidentService } from './services/incidentService.js';
import { AdminService } from './services/adminService.js';
import { assignIncident } from './services/assignmentService.js';
import { classifyIncident, listCategories } from './services/classificationService.js';
import { signJwt, verifyJwt } from './services/jwtService.js';

const publicDir = path.resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// Construye una instancia de Express. El parametro overrides permite inyectar configuracion,
// base de datos o servicios falsos durante tests sin modificar variables globales.
export function createApp(overrides = {}) {
  const app = express();
  // Mezcla configuracion por defecto con overrides. Los objetos anidados se mergean aparte
  // para no perder defaults como model/baseUrl cuando un test solo sobreescribe provider.
  const runtimeConfig = {
    ...config,
    ...overrides.config,
    llm: { ...config.llm, ...overrides.config?.llm },
    assignmentLlm: { ...config.assignmentLlm, ...overrides.config?.assignmentLlm }
  };
  const database = overrides.database || new JsonDatabase(runtimeConfig.dataFile);
  const incidentService = overrides.incidentService || new IncidentService(database, runtimeConfig.llm, runtimeConfig.assignmentLlm);
  const adminService = overrides.adminService || new AdminService(runtimeConfig.adminsFile);

  // Middleware comun para todo el panel admin: valida JWT antes de tocar datos protegidos.
  function requireAdmin(req, res, next) {
    const [scheme, token] = String(req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Token admin requerido.' });
    }

    const payload = verifyJwt(token, runtimeConfig.jwtSecret);
    if (!payload || payload.role !== 'admin') {
      return res.status(401).json({ error: 'Token admin invalido.' });
    }

    req.admin = payload;
    next();
  }

  app.use(cors());
  // Acepta JSON en requests POST/PUT/PATCH; 1mb alcanza para la POC y evita payloads enormes.
  app.use(express.json({ limit: '1mb' }));
  // Sirve index.html, admin.html, JS y CSS desde public/.
  app.use(express.static('public'));

  // Ruta HTML del panel admin. El frontend publico queda servido desde / por express.static.
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin.html'));
  });

  app.get('/health', (req, res) => {
    // Expone como esta configurado el runtime para diagnosticar si usa modelo local o fallback.
    const assignmentMode = runtimeConfig.assignmentLlm.provider === 'codellama'
      ? 'codellama'
      : 'local-assignment';
    const classificationMode = runtimeConfig.llm.provider === 'codellama'
      ? 'codellama'
      : 'local-keywords';

    res.json({
      status: 'ok',
      architecture: 'poc-reducida',
      components: ['frontend-web', 'backend-principal', 'modulo-clasificacion', 'modulo-asignacion', 'base-local'],
      llmProvider: runtimeConfig.llm.provider,
      classificationMode,
      classification: {
        configuredMode: classificationMode,
        provider: runtimeConfig.llm.provider,
        model: runtimeConfig.llm.model,
        baseUrl: runtimeConfig.llm.baseUrl
      },
      assignmentMode,
      assignmentLlmProvider: runtimeConfig.assignmentLlm.provider,
      assignment: {
        configuredMode: assignmentMode,
        provider: runtimeConfig.assignmentLlm.provider,
        model: runtimeConfig.assignmentLlm.model,
        baseUrl: runtimeConfig.assignmentLlm.baseUrl
      }
    });
  });

  // Endpoints auxiliares para probar clasificacion y asignacion por separado desde Postman.
  app.get('/api/categories', (req, res) => {
    res.json({ categories: listCategories() });
  });

  app.post('/api/classifications', async (req, res, next) => {
    try {
      const classification = await classifyIncident(req.body.description, runtimeConfig.llm);
      res.json({ classification });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/contact/validate', (req, res) => {
    // Validacion liviana del email de contacto. No verifica existencia real del buzon.
    const email = String(req.body.email || '').trim();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    res.json({ valid, message: valid ? 'Email valido.' : 'Ingrese un email valido para el contacto.' });
  });

  app.post('/api/assignments', async (req, res, next) => {
    try {
      res.json({ assignment: await assignIncident(req.body.classification || {}, runtimeConfig.assignmentLlm, { description: req.body.description }) });
    } catch (error) {
      next(error);
    }
  });

  // Flujo publico: alta, listado, consulta y cambio simple de estado por ID.
  app.post('/api/incidents', async (req, res, next) => {
    try {
      const incident = await incidentService.create(req.body);
      res.status(201).json({ incident });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/incidents', async (req, res, next) => {
    try {
      const incidents = await incidentService.list(req.query);
      res.json({ incidents });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/incidents/:id', async (req, res, next) => {
    try {
      const incident = await incidentService.getById(req.params.id);
      if (!incident) return res.status(404).json({ error: 'Incidente no encontrado.' });
      res.json({ incident });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/incidents/:id/status', async (req, res, next) => {
    try {
      const incident = await incidentService.updateStatus(req.params.id, req.body.status, req.body.comment);
      res.json({ incident });
    } catch (error) {
      next(error);
    }
  });

  // Flujo administrativo: login, alta de admins y CRUD completo de incidentes con JWT.
  app.post('/api/admin/login', async (req, res, next) => {
    try {
      // Si las credenciales existen en data/admins.json, se emite un JWT con role admin.
      const admin = await adminService.validateCredentials(req.body.email, req.body.password);
      if (!admin) return res.status(401).json({ error: 'Credenciales admin invalidas.' });

      const token = signJwt({ sub: admin.email, email: admin.email, role: 'admin' }, runtimeConfig.jwtSecret);
      res.json({ token, admin: { email: admin.email } });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/admin', requireAdmin, async (req, res, next) => {
    try {
      const admin = await adminService.create(req.body);
      res.status(201).json({ admin });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/admin/incidents', requireAdmin, async (req, res, next) => {
    try {
      const incidents = await incidentService.list(req.query);
      res.json({ incidents });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/admin/incidents', requireAdmin, async (req, res, next) => {
    try {
      let incident = await incidentService.create(req.body);
      if (req.body.status && req.body.status !== incident.status) {
        incident = await incidentService.updateStatus(incident.id, req.body.status, req.body.comment || 'Estado inicial definido desde admin.');
      }
      res.status(201).json({ incident });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/admin/incidents/:id', requireAdmin, async (req, res, next) => {
    try {
      const incident = await incidentService.getById(req.params.id);
      if (!incident) return res.status(404).json({ error: 'Incidente no encontrado.' });
      res.json({ incident });
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/admin/incidents/:id', requireAdmin, async (req, res, next) => {
    try {
      const incident = await incidentService.update(req.params.id, req.body);
      res.json({ incident });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/admin/incidents/:id', requireAdmin, async (req, res, next) => {
    try {
      await incidentService.delete(req.params.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  // Cualquier ruta no declarada responde 404 JSON para clientes web, Postman o integraciones.
  app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada.' });
  });

  // Handler centralizado: los servicios arrojan errores con statusCode cuando corresponde.
  app.use((error, req, res, next) => {
    res.status(error.statusCode || 500).json({ error: error.message || 'Error interno.' });
  });

  return app;
}
