import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { JsonDatabase } from './services/database.js';
import { IncidentService } from './services/incidentService.js';
import { assignIncident } from './services/assignmentService.js';
import { classifyIncident, listCategories } from './services/classificationService.js';

export function createApp(overrides = {}) {
  const app = express();
  const runtimeConfig = { ...config, ...overrides.config };
  const database = overrides.database || new JsonDatabase(runtimeConfig.dataFile);
  const incidentService = overrides.incidentService || new IncidentService(database, runtimeConfig.llm);

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static('public'));

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

  app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada.' });
  });

  app.use((error, req, res, next) => {
    res.status(error.statusCode || 500).json({ error: error.message || 'Error interno.' });
  });

  return app;
}
