import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export class JsonDatabase {
  constructor(filePath) {
    this.filePath = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
  }

  async ensure() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(this.filePath, JSON.stringify({ incidents: [] }, null, 2));
    }
  }

  async read() {
    await this.ensure();
    const content = await fs.readFile(this.filePath, 'utf8');
    return JSON.parse(content || '{"incidents":[]}');
  }

  async write(data) {
    await this.ensure();
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
  }
}
