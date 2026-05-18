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

export function createApp(overrides = {}) {
  const app = express();
  const runtimeConfig = { ...config, ...overrides.config };
  const database = overrides.database || new JsonDatabase(runtimeConfig.dataFile);
  const incidentService = overrides.incidentService || new IncidentService(database, runtimeConfig.llm);
  const adminService = overrides.adminService || new AdminService(runtimeConfig.adminsFile);

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
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static('public'));

  app.get('/admin', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin.html'));
  });

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      architecture: 'poc-reducida',
      components: ['frontend-web', 'backend-principal', 'modulo-clasificacion', 'modulo-asignacion', 'base-local'],
      llmProvider: runtimeConfig.llm.provider
    });
  });

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

  app.post('/api/assignments', (req, res) => {
    res.json({ assignment: assignIncident(req.body.classification || {}) });
  });

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

  app.post('/api/admin/login', async (req, res, next) => {
    try {
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

  app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada.' });
  });

  app.use((error, req, res, next) => {
    res.status(error.statusCode || 500).json({ error: error.message || 'Error interno.' });
  });

  return app;
}
