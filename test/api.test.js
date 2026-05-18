import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';

describe('POC incidentes urbanos', () => {
  let server;
  let baseUrl;
  let adminToken;

  before(async () => {
    const dataFile = path.join(tmpdir(), `incidents-test-${Date.now()}.json`);
    const adminsFile = path.join(tmpdir(), `admins-test-${Date.now()}.json`);
    await fs.writeFile(adminsFile, JSON.stringify({ admins: [{ email: 'admin@example.com', password: 'admin123' }] }, null, 2));
    server = createServer(createApp({
      config: {
        dataFile,
        adminsFile,
        jwtSecret: 'test-secret',
        llm: { provider: 'local-keywords' }
      }
    }));
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const loginResponse = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'admin123' })
    });
    assert.equal(loginResponse.status, 200);
    const login = await loginResponse.json();
    adminToken = login.token;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('registra, clasifica, asigna y permite consultar un incidente', async () => {
    const createResponse = await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        citizenName: 'Test User',
        description: 'Hay un bache profundo que bloquea la calle y genera riesgo de accidente.',
        address: 'Calle 123'
      })
    });

    assert.equal(createResponse.status, 201);
    const { incident } = await createResponse.json();
    assert.equal(incident.classification.category, 'infraestructura_vial');
    assert.equal(incident.assignment.responsibleArea, 'Direccion de Obras Publicas');
    assert.equal(incident.status, 'asignado');
    assert.ok(incident.trace.length >= 3);

    const getResponse = await fetch(`${baseUrl}/api/incidents/${incident.id}`);
    assert.equal(getResponse.status, 200);
  });

  it('actualiza el estado y agrega trazabilidad', async () => {
    const createResponse = await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'El poste de luz esta apagado desde ayer.' })
    });
    const { incident } = await createResponse.json();

    const updateResponse = await fetch(`${baseUrl}/api/incidents/${incident.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'en_proceso', comment: 'Cuadrilla municipal asignada.' })
    });

    assert.equal(updateResponse.status, 200);
    const updated = await updateResponse.json();
    assert.equal(updated.incident.status, 'en_proceso');
    assert.match(updated.incident.trace.at(-1).detail, /Cuadrilla/);
  });

  it('permite CRUD completo de incidentes desde rutas admin', async () => {
    const unauthorizedResponse = await fetch(`${baseUrl}/api/admin/incidents`);
    assert.equal(unauthorizedResponse.status, 401);

    const createResponse = await fetch(`${baseUrl}/api/admin/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        municipalityId: 'admin-municipio',
        citizenName: 'Admin Test',
        contact: 'admin@example.com',
        address: 'Av. Admin 456',
        description: 'Hay basura acumulada con mucho olor en la esquina.'
      })
    });

    assert.equal(createResponse.status, 201);
    const { incident } = await createResponse.json();
    assert.equal(incident.municipalityId, 'admin-municipio');
    assert.equal(incident.classification.category, 'residuos');

    const listResponse = await fetch(`${baseUrl}/api/admin/incidents?municipalityId=admin-municipio`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(listResponse.status, 200);
    const listed = await listResponse.json();
    assert.ok(listed.incidents.some((item) => item.id === incident.id));

    const getResponse = await fetch(`${baseUrl}/api/admin/incidents/${incident.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(getResponse.status, 200);

    const updateResponse = await fetch(`${baseUrl}/api/admin/incidents/${incident.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        citizenName: 'Admin Editado',
        status: 'resuelto',
        description: 'La calle tiene un bache profundo y peligroso.',
        comment: 'Correccion administrativa del reporte.'
      })
    });

    assert.equal(updateResponse.status, 200);
    const updated = await updateResponse.json();
    assert.equal(updated.incident.citizenName, 'Admin Editado');
    assert.equal(updated.incident.status, 'resuelto');
    assert.equal(updated.incident.classification.category, 'infraestructura_vial');
    assert.match(updated.incident.trace.at(-1).detail, /Correccion administrativa/);

    const deleteResponse = await fetch(`${baseUrl}/api/admin/incidents/${incident.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(deleteResponse.status, 204);

    const deletedGetResponse = await fetch(`${baseUrl}/api/admin/incidents/${incident.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(deletedGetResponse.status, 404);
  });

  it('crea administradores solo con JWT valido', async () => {
    const unauthorizedResponse = await fetch(`${baseUrl}/api/admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nuevo@example.com', password: 'nuevo123' })
    });
    assert.equal(unauthorizedResponse.status, 401);

    const createResponse = await fetch(`${baseUrl}/api/admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ email: 'nuevo@example.com', password: 'nuevo123' })
    });
    assert.equal(createResponse.status, 201);

    const loginResponse = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nuevo@example.com', password: 'nuevo123' })
    });
    assert.equal(loginResponse.status, 200);
  });
});
