import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';

describe('POC incidentes urbanos', () => {
  let server;
  let baseUrl;

  before(async () => {
    const dataFile = path.join(tmpdir(), `incidents-test-${Date.now()}.json`);
    server = createServer(createApp({ config: { dataFile, llm: { provider: 'local-keywords' } } }));
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
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
});
