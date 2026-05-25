// Servicio minimo de persistencia local para la POC.
// Guarda los incidentes en un archivo JSON en vez de usar una base de datos externa.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export class JsonDatabase {
  constructor(filePath) {
    // Permite usar rutas absolutas en Docker/tests o rutas relativas desde la raiz del proyecto.
    this.filePath = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
  }

  async ensure() {
    // Crea el archivo JSON de incidentes en el primer arranque para no depender de una BD externa.
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(this.filePath, JSON.stringify({ incidents: [] }, null, 2));
    }
  }

  async read() {
    // Cada operacion lee el estado actual del archivo; suficiente para la POC local.
    await this.ensure();
    const content = await fs.readFile(this.filePath, 'utf8');
    return JSON.parse(content || '{"incidents":[]}');
  }

  async write(data) {
    // Persiste con indentacion para que el archivo sea auditable durante demos o pruebas manuales.
    await this.ensure();
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
  }
}
