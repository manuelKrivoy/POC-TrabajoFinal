import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`POC de incidentes urbanos escuchando en http://localhost:${config.port}`);
});
