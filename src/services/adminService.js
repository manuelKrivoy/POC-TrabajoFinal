import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_ADMINS = { admins: [{ email: 'admin@example.com', password: 'admin123' }] };

export class AdminService {
  constructor(filePath) {
    this.filePath = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
  }

  async ensure() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(this.filePath, JSON.stringify(DEFAULT_ADMINS, null, 2));
    }
  }

  async read() {
    await this.ensure();
    const content = await fs.readFile(this.filePath, 'utf8');
    return JSON.parse(content || '{"admins":[]}');
  }

  async write(data) {
    await this.ensure();
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
  }

  async validateCredentials(email, password) {
    const data = await this.read();
    return data.admins.find((admin) => admin.email === email && admin.password === password) || null;
  }

  async create(input) {
    const email = String(input.email || '').trim().toLowerCase();
    const password = String(input.password || '');

    if (!email || !email.includes('@')) {
      const error = new Error('Email de administrador invalido.');
      error.statusCode = 400;
      throw error;
    }

    if (password.length < 6) {
      const error = new Error('La password debe tener al menos 6 caracteres.');
      error.statusCode = 400;
      throw error;
    }

    const data = await this.read();
    if (data.admins.some((admin) => admin.email === email)) {
      const error = new Error('Ya existe un administrador con ese email.');
      error.statusCode = 409;
      throw error;
    }

    const admin = { email, password };
    data.admins.push(admin);
    await this.write(data);
    return { email: admin.email };
  }
}
