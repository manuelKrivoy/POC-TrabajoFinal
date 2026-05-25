// Frontend publico de la POC.
// Permite registrar incidentes, validar contacto/direccion, consultar estado y ver ultimos reclamos.
import React, { useEffect, useState } from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';

async function request(path, options) {
  // Cliente HTTP minimo usado por el frontend publico contra las rutas /api/*.
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Error de API');
  return payload;
}

async function geocodeAddress(address, coords) {
  // Busca una direccion en OpenStreetMap/Nominatim. Si hay geolocalizacion, limita la busqueda a la zona cercana.
  const params = new URLSearchParams({
    format: 'jsonv2',
    limit: '1',
    q: address
  });

  if (coords) {
    const delta = 0.18;
    params.set('bounded', '1');
    params.set('viewbox', [
      coords.longitude - delta,
      coords.latitude + delta,
      coords.longitude + delta,
      coords.latitude - delta
    ].join(','));
  }

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error('No se pudo validar la direccion con el mapa.');
  const results = await response.json();
  if (!results.length) throw new Error('No se encontro la direccion cerca de tu ubicacion.');
  return results[0];
}

function getCurrentPosition() {
  // Envuelve navigator.geolocation en Promise para usar async/await desde validateAddress.
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('El navegador no soporta geolocalizacion.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position.coords),
      () => reject(new Error('No se pudo obtener la ubicacion de la PC.')),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

function IncidentCard({ incident }) {
  // Tarjeta compacta para listar incidentes ya registrados.
  return React.createElement('article', { className: 'incident' },
    React.createElement('p', null,
      React.createElement('strong', null, incident.classification.categoryLabel),
      ` - prioridad ${incident.classification.priority} - estado ${incident.status}`
    ),
    React.createElement('p', null, incident.description),
    React.createElement('p', { className: 'meta' }, `ID: ${incident.id} | Area: ${incident.assignment.responsibleArea} | SLA: ${incident.assignment.slaHours}h`)
  );
}

function App() {
  // Estado principal del formulario, busqueda, resultado tecnico y listado publico.
  const [form, setForm] = useState({ citizenName: '', contact: '', address: '', description: '' });
  const [searchId, setSearchId] = useState('');
  const [detail, setDetail] = useState('Sin consulta activa.');
  const [incidents, setIncidents] = useState([]);
  const [listError, setListError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contactStatus, setContactStatus] = useState({ valid: true, message: '' });
  const [addressStatus, setAddressStatus] = useState({ state: 'idle', message: '', result: null });

  async function loadIncidents() {
    // Ruta publica de listado: muestra los ultimos reclamos sin entrar al panel admin.
    try {
      const payload = await request('/api/incidents');
      setIncidents(payload.incidents);
      setListError('');
    } catch (error) {
      setListError(error.message);
    }
  }

  useEffect(() => {
    // Al cargar / se consulta el listado publico inicial.
    loadIncidents();
  }, []);

  async function submitIncident(event) {
    event.preventDefault();
    if (isSubmitting) return;

    if (form.contact && !contactStatus.valid) {
      setDetail(contactStatus.message || 'Revise el email de contacto.');
      return;
    }

    setIsSubmitting(true);
    setDetail('Creando incidente y consultando el modelo local...');
    try {
      // POST /api/incidents ejecuta en backend clasificacion, asignacion y persistencia.
      const { incident } = await request('/api/incidents', { method: 'POST', body: JSON.stringify(form) });
      setDetail(JSON.stringify(incident, null, 2));
      setForm({ citizenName: '', contact: '', address: '', description: '' });
      setContactStatus({ valid: true, message: '' });
      setAddressStatus({ state: 'idle', message: '', result: null });
      await loadIncidents();
    } catch (error) {
      setDetail(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function validateContact() {
    // Valida email contra el backend para centralizar la regla y bloquear envios invalidos.
    const email = form.contact.trim();
    if (!email) {
      setContactStatus({ valid: true, message: '' });
      return;
    }

    try {
      const payload = await request('/api/contact/validate', { method: 'POST', body: JSON.stringify({ email }) });
      setContactStatus(payload);
    } catch (error) {
      setContactStatus({ valid: false, message: error.message });
    }
  }

  async function validateAddress() {
    // Pide ubicacion del navegador y valida la direccion contra el mapa antes de crear el reclamo.
    const address = form.address.trim();
    if (!address) {
      setAddressStatus({ state: 'error', message: 'Ingrese una direccion antes de validarla.', result: null });
      return;
    }

    setAddressStatus({ state: 'loading', message: 'Obteniendo ubicacion y buscando direccion...', result: null });
    try {
      const coords = await getCurrentPosition();
      const result = await geocodeAddress(address, coords);
      setAddressStatus({ state: 'ok', message: result.display_name, result });
    } catch (error) {
      setAddressStatus({ state: 'error', message: error.message, result: null });
    }
  }

  async function searchIncident(event) {
    event.preventDefault();
    try {
      // GET /api/incidents/:id permite consultar el estado trazable de un reclamo puntual.
      const { incident } = await request(`/api/incidents/${searchId}`);
      setDetail(JSON.stringify(incident, null, 2));
    } catch (error) {
      setDetail(error.message);
    }
  }

  function setField(field, value) {
    // Actualiza un campo del formulario y limpia validaciones relacionadas cuando el usuario edita.
    setForm((current) => ({ ...current, [field]: value }));
    if (field === 'contact') setContactStatus({ valid: true, message: '' });
    if (field === 'address') setAddressStatus({ state: 'idle', message: '', result: null });
  }

  const mapUrl = addressStatus.result
    // URL del iframe de OpenStreetMap centrado en la direccion encontrada.
    ? `https://www.openstreetmap.org/export/embed.html?marker=${addressStatus.result.lat},${addressStatus.result.lon}&layer=mapnik&bbox=${Number(addressStatus.result.lon) - 0.01},${Number(addressStatus.result.lat) - 0.01},${Number(addressStatus.result.lon) + 0.01},${Number(addressStatus.result.lat) + 0.01}`
    : '';

  return React.createElement('main', { className: 'shell' },
    React.createElement('section', { className: 'hero' },
      React.createElement('p', { className: 'eyebrow' }, 'Arquitectura reducida de la POC'),
      React.createElement('h1', null, 'Gestion inteligente de incidentes urbanos'),
      React.createElement('p', null, 'Registro, clasificacion NLP/LLM, asignacion automatica y seguimiento trazable desde una API Express.')
    ),
    React.createElement('section', { className: 'grid' },
      React.createElement('form', { className: 'card', onSubmit: submitIncident },
        React.createElement('h2', null, 'Registrar incidente'),
        React.createElement('label', null, 'Nombre del ciudadano',
          React.createElement('input', { value: form.citizenName, onChange: (event) => setField('citizenName', event.target.value), placeholder: 'Ej: Ana Perez' })
        ),
        React.createElement('label', null, 'Contacto',
          React.createElement('input', { type: 'email', value: form.contact, onBlur: validateContact, onChange: (event) => setField('contact', event.target.value), placeholder: 'Ej: ana@mail.com', 'aria-invalid': !contactStatus.valid })
        ),
        contactStatus.message && React.createElement('p', { className: `field-message ${contactStatus.valid ? 'ok' : 'error'}` }, contactStatus.message),
        React.createElement('label', null, 'Direccion',
          React.createElement('input', { value: form.address, onChange: (event) => setField('address', event.target.value), placeholder: 'Ej: Av. Siempre Viva 742' })
        ),
        React.createElement('div', { className: 'address-tools' },
          React.createElement('button', { type: 'button', className: 'ghost-button', onClick: validateAddress, disabled: addressStatus.state === 'loading' },
            addressStatus.state === 'loading' ? 'Validando...' : 'Validar con mapa'
          )
        ),
        addressStatus.message && React.createElement('p', { className: `field-message ${addressStatus.state === 'ok' ? 'ok' : 'error'}` }, addressStatus.message),
        mapUrl && React.createElement('iframe', { className: 'address-map', title: 'Mapa de direccion validada', src: mapUrl, loading: 'lazy' }),
        React.createElement('label', null, 'Descripcion textual',
          React.createElement('textarea', { value: form.description, onChange: (event) => setField('description', event.target.value), required: true, minLength: 8, placeholder: 'Ej: Hay un bache profundo que bloquea media calle y genera riesgo para autos.' })
        ),
        React.createElement('button', { type: 'submit', className: 'submit-button', disabled: isSubmitting || !contactStatus.valid },
          isSubmitting && React.createElement('span', { className: 'spinner', 'aria-hidden': true }),
          isSubmitting ? 'Creando reclamo...' : 'Crear reclamo'
        )
      ),
      React.createElement('section', { className: 'card' },
        React.createElement('h2', null, 'Consultar estado'),
        React.createElement('form', { className: 'inline-form', onSubmit: searchIncident },
          React.createElement('input', { value: searchId, onChange: (event) => setSearchId(event.target.value), placeholder: 'ID del incidente', required: true }),
          React.createElement('button', { type: 'submit' }, 'Buscar')
        ),
        React.createElement('pre', null, detail)
      )
    ),
    React.createElement('section', { className: 'card wide' },
      React.createElement('div', { className: 'section-head' },
        React.createElement('h2', null, 'Ultimos incidentes'),
        React.createElement('button', { type: 'button', onClick: loadIncidents }, 'Actualizar')
      ),
      React.createElement('div', { className: 'incidents' },
        listError
          ? React.createElement('p', { className: 'meta' }, listError)
          : incidents.length
            ? incidents.map((incident) => React.createElement(IncidentCard, { key: incident.id, incident }))
            : React.createElement('p', { className: 'meta' }, 'Todavia no hay incidentes registrados.')
      )
    )
  );
}

createRoot(document.querySelector('#root')).render(React.createElement(App));
