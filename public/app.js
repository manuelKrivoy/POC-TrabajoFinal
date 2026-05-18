import React, { useEffect, useState } from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';

async function request(path, options) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Error de API');
  return payload;
}

function IncidentCard({ incident }) {
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
  const [form, setForm] = useState({ citizenName: '', contact: '', address: '', description: '' });
  const [searchId, setSearchId] = useState('');
  const [detail, setDetail] = useState('Sin consulta activa.');
  const [incidents, setIncidents] = useState([]);
  const [listError, setListError] = useState('');

  async function loadIncidents() {
    try {
      const payload = await request('/api/incidents');
      setIncidents(payload.incidents);
      setListError('');
    } catch (error) {
      setListError(error.message);
    }
  }

  useEffect(() => {
    loadIncidents();
  }, []);

  async function submitIncident(event) {
    event.preventDefault();
    try {
      const { incident } = await request('/api/incidents', { method: 'POST', body: JSON.stringify(form) });
      setDetail(JSON.stringify(incident, null, 2));
      setForm({ citizenName: '', contact: '', address: '', description: '' });
      await loadIncidents();
    } catch (error) {
      setDetail(error.message);
    }
  }

  async function searchIncident(event) {
    event.preventDefault();
    try {
      const { incident } = await request(`/api/incidents/${searchId}`);
      setDetail(JSON.stringify(incident, null, 2));
    } catch (error) {
      setDetail(error.message);
    }
  }

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

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
          React.createElement('input', { value: form.contact, onChange: (event) => setField('contact', event.target.value), placeholder: 'Ej: ana@mail.com' })
        ),
        React.createElement('label', null, 'Direccion',
          React.createElement('input', { value: form.address, onChange: (event) => setField('address', event.target.value), placeholder: 'Ej: Av. Siempre Viva 742' })
        ),
        React.createElement('label', null, 'Descripcion textual',
          React.createElement('textarea', { value: form.description, onChange: (event) => setField('description', event.target.value), required: true, minLength: 8, placeholder: 'Ej: Hay un bache profundo que bloquea media calle y genera riesgo para autos.' })
        ),
        React.createElement('button', { type: 'submit' }, 'Crear reclamo')
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
