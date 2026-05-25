// Punto de entrada real de la aplicacion.
// Importa la app Express ya configurada y la deja escuchando en el puerto definido por config.js.
import { createApp } from './app.js';
import { config } from './config.js';

// createApp separa la construccion de Express del listen para poder testear la API sin abrir un puerto fijo.
const app = createApp();

// Arranca el servidor HTTP para uso local, Docker o demo.
app.listen(config.port, () => {
  console.log(`POC de incidentes urbanos escuchando en http://localhost:${config.port}`);
});
