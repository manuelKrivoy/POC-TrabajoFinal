import React, { useEffect, useState } from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';

const h = React.createElement;
const TOKEN_KEY = 'adminToken';
const ADMIN_KEY = 'adminEmail';
const EMPTY_INCIDENT = {
  municipalityId: 'demo-municipio',
  citizenName: '',
  contact: '',
  address: '',
  description: '',
  status: 'asignado',
  comment: ''
};

async function api(path, { token, ...options } = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  const payload = response.status === 204 ? null : await response.json().catch(async () => ({ error: await response.text().catch(() => '') }));
  if (!response.ok) throw new Error(payload?.error || `Error de API (${response.status})`);
  return payload;
}

function Field({ label, children }) {
  return h('label', null, label, children);
}

function LoginView({ onLogin }) {
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('admin123');
  const [message, setMessage] = useState('Ingrese con credenciales administrativas.');

  async function submit(event) {
    event.preventDefault();
    try {
      const payload = await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      localStorage.setItem(TOKEN_KEY, payload.token);
      localStorage.setItem(ADMIN_KEY, payload.admin.email);
      onLogin(payload.token, payload.admin.email);
    } catch (error) {
      setMessage(error.message);
    }
  }

  return h('main', { className: 'admin-login-page' },
    h('section', { className: 'login-panel' },
      h('div', { className: 'login-copy' },
        h('p', { className: 'eyebrow' }, 'Panel administrativo'),
        h('h1', null, 'Operaciones urbanas en tiempo real'),
        h('p', null, 'Ingreso protegido con JWT. El alta de administradores no esta expuesta al publico.'),
        h('div', { className: 'login-badges' },
          h('span', null, 'JWT'),
          h('span', null, 'CRUD incidentes'),
          h('span', null, 'Flujo separado')
        )
      ),
      h('form', { className: 'login-card', onSubmit: submit },
        h('h2', null, 'Acceso admin'),
        h('p', { className: 'meta' }, message),
        h(Field, { label: 'Email' },
          h('input', { type: 'email', value: email, onChange: (event) => setEmail(event.target.value), required: true })
        ),
        h(Field, { label: 'Password' },
          h('input', { type: 'password', value: password, onChange: (event) => setPassword(event.target.value), required: true })
        ),
        h('button', { type: 'submit' }, 'Ingresar al panel')
      )
    )
  );
}

function IncidentForm({ title, value, onChange, onSubmit, submitLabel }) {
  function setField(field, nextValue) {
    onChange({ ...value, [field]: nextValue });
  }

  return h('form', { className: 'admin-form', onSubmit },
    h('h2', null, title),
    h('div', { className: 'form-grid' },
      h(Field, { label: 'Municipio' },
        h('input', { value: value.municipalityId, onChange: (event) => setField('municipalityId', event.target.value), placeholder: 'demo-municipio' })
      ),
      h(Field, { label: 'Estado' },
        h('select', { value: value.status, onChange: (event) => setField('status', event.target.value) },
          ['registrado', 'asignado', 'en_proceso', 'resuelto', 'rechazado'].map((status) => h('option', { key: status, value: status }, status))
        )
      ),
      h(Field, { label: 'Ciudadano' },
        h('input', { value: value.citizenName, onChange: (event) => setField('citizenName', event.target.value), placeholder: 'Nombre' })
      ),
      h(Field, { label: 'Contacto' },
        h('input', { value: value.contact, onChange: (event) => setField('contact', event.target.value), placeholder: 'mail o telefono' })
      ),
      h(Field, { label: 'Direccion' },
        h('input', { value: value.address, onChange: (event) => setField('address', event.target.value), placeholder: 'Calle 123' })
      ),
      h(Field, { label: 'Comentario admin' },
        h('input', { value: value.comment, onChange: (event) => setField('comment', event.target.value), placeholder: 'Motivo de la actualizacion' })
      )
    ),
    h(Field, { label: 'Descripcion' },
      h('textarea', { value: value.description, onChange: (event) => setField('description', event.target.value), required: true, minLength: 8 })
    ),
    h('button', { type: 'submit' }, submitLabel)
  );
}

function IncidentRow({ incident, selected, onSelect, onDelete }) {
  return h('article', { className: `admin-incident ${selected ? 'selected' : ''}` },
    h('div', null,
      h('div', { className: 'incident-topline' },
        h('strong', null, incident.classification.categoryLabel),
        h('span', { className: 'citizen-chip' }, incident.citizenName || 'Ciudadano anonimo'),
        h('span', { className: `status-pill status-${incident.status}` }, incident.status)
      ),
      h('p', null, incident.description),
      h('p', { className: 'meta' }, `${incident.assignment.responsibleArea} | ${incident.municipalityId} | ${incident.id}`)
    ),
    h('div', { className: 'row-actions' },
      h('button', { type: 'button', className: 'ghost-button', onClick: () => onSelect(incident) }, 'Editar'),
      h('button', { type: 'button', className: 'danger-button', onClick: () => onDelete(incident.id) }, 'Eliminar')
    )
  );
}

function AdminCreateForm({ token, onMessage }) {
  const [admin, setAdmin] = useState({ email: '', password: '' });
  const [apiResponse, setApiResponse] = useState('');

  async function submit(event) {
    event.preventDefault();
    const payload = await api('/api/admin', {
      token,
      method: 'POST',
      body: JSON.stringify(admin)
    });
    setAdmin({ email: '', password: '' });
    setApiResponse(JSON.stringify(payload, null, 2));
    onMessage(`Administrador creado: ${payload.admin.email}`);
  }

  return h('form', { className: 'admin-create-card', onSubmit: async (event) => {
    try {
      await submit(event);
    } catch (error) {
      setApiResponse(error.message);
      onMessage(error.message);
    }
  } },
    h('h3', null, 'Crear administrador'),
    h('p', { className: 'meta' }, 'Solo disponible dentro del panel autenticado.'),
    h('input', { type: 'email', value: admin.email, onChange: (event) => setAdmin({ ...admin, email: event.target.value }), placeholder: 'nuevo-admin@example.com', required: true }),
    h('input', { type: 'password', value: admin.password, onChange: (event) => setAdmin({ ...admin, password: event.target.value }), placeholder: 'minimo 6 caracteres', required: true }),
    h('button', { type: 'submit' }, 'Crear admin'),
    apiResponse && h('pre', { className: 'compact-response' }, apiResponse)
  );
}

function Dashboard({ token, email, onLogout }) {
  const [incidents, setIncidents] = useState([]);
  const [message, setMessage] = useState('Cargando incidentes...');
  const [createForm, setCreateForm] = useState(EMPTY_INCIDENT);
  const [editForm, setEditForm] = useState(null);
  const [filters, setFilters] = useState({ status: '', citizenName: '' });
  const [showCreateIncident, setShowCreateIncident] = useState(false);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);

  async function loadIncidents(nextFilters = filters) {
    try {
      const params = new URLSearchParams(nextFilters.status ? { status: nextFilters.status } : {});
      const payload = await api(`/api/admin/incidents${params.toString() ? `?${params}` : ''}`, { token });
      const nameFilter = nextFilters.citizenName.trim().toLowerCase();
      const filteredIncidents = nameFilter
        ? payload.incidents.filter((incident) => String(incident.citizenName || '').toLowerCase().includes(nameFilter))
        : payload.incidents;
      setIncidents(filteredIncidents);
      setMessage(filteredIncidents.length ? 'Panel actualizado.' : 'No hay incidentes para mostrar.');
    } catch (error) {
      if (error.message.includes('Token')) onLogout();
      setMessage(error.message);
    }
  }

  useEffect(() => {
    loadIncidents();
  }, []);

  async function createIncident(event) {
    event.preventDefault();
    try {
      await api('/api/admin/incidents', { token, method: 'POST', body: JSON.stringify(createForm) });
      setCreateForm(EMPTY_INCIDENT);
      setShowCreateIncident(false);
      setMessage('Incidente creado correctamente.');
      await loadIncidents();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function updateIncident(event) {
    event.preventDefault();
    try {
      await api(`/api/admin/incidents/${editForm.id}`, { token, method: 'PUT', body: JSON.stringify(editForm) });
      setEditForm(null);
      setMessage('Incidente actualizado correctamente.');
      await loadIncidents();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteIncident(id) {
    if (!confirm('Eliminar incidente? Esta accion no se puede deshacer.')) return;
    try {
      await api(`/api/admin/incidents/${id}`, { token, method: 'DELETE' });
      setMessage('Incidente eliminado.');
      if (editForm?.id === id) setEditForm(null);
      await loadIncidents();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function selectIncident(incident) {
    setEditForm({
      id: incident.id,
      municipalityId: incident.municipalityId || '',
      citizenName: incident.citizenName || '',
      contact: incident.contact || '',
      address: incident.address || '',
      description: incident.description || '',
      status: incident.status || 'asignado',
      comment: ''
    });
  }

  return h('main', { className: 'admin-dashboard' },
    h('header', { className: 'admin-topbar' },
      h('div', null,
        h('p', { className: 'eyebrow' }, 'Admin conectado'),
        h('h1', null, 'Centro de control de incidentes'),
        h('p', { className: 'meta' }, email)
      ),
      h('button', { type: 'button', className: 'ghost-button', onClick: onLogout }, 'Cerrar sesion')
    ),
    h('section', { className: 'admin-stats' },
      h('div', null, h('strong', null, incidents.length), h('span', null, 'incidentes visibles')),
      h('div', null, h('strong', null, incidents.filter((item) => item.status === 'en_proceso').length), h('span', null, 'en proceso')),
      h('div', null, h('strong', null, incidents.filter((item) => item.status === 'resuelto').length), h('span', null, 'resueltos')),
      h('div', null, h('strong', null, 'JWT'), h('span', null, 'rutas protegidas'))
    ),
    h('section', { className: 'admin-layout' },
      h('div', { className: 'admin-main-column' },
        h('section', { className: 'admin-card-panel' },
          h('div', { className: 'section-head' },
            h('div', null, h('h2', null, 'Incidentes'), h('p', { className: 'meta' }, message)),
            h('button', { type: 'button', onClick: () => loadIncidents() }, 'Actualizar')
          ),
          h('div', { className: 'filters' },
            h('select', { value: filters.status, onChange: (event) => setFilters({ ...filters, status: event.target.value }) },
              h('option', { value: '' }, 'Todos los estados'),
              ['registrado', 'asignado', 'en_proceso', 'resuelto', 'rechazado'].map((status) => h('option', { key: status, value: status }, status))
            ),
            h('input', { value: filters.citizenName, onChange: (event) => setFilters({ ...filters, citizenName: event.target.value }), placeholder: 'Filtrar por nombre del ciudadano' }),
            h('button', { type: 'button', onClick: () => loadIncidents(filters) }, 'Filtrar')
          ),
          h('div', { className: 'admin-list' },
            incidents.map((incident) => h(IncidentRow, {
              key: incident.id,
              incident,
              selected: editForm?.id === incident.id,
              onSelect: selectIncident,
              onDelete: deleteIncident
            }))
          )
        )
      ),
      h('aside', { className: 'admin-side-column' },
        editForm && h('section', { className: 'admin-card-panel edit-panel' },
          h(IncidentForm, { title: 'Editar incidente', value: editForm, onChange: setEditForm, onSubmit: updateIncident, submitLabel: 'Guardar cambios' }),
          h('button', { type: 'button', className: 'ghost-button full-button', onClick: () => setEditForm(null) }, 'Cancelar edicion')
        ),
        h('button', { type: 'button', className: 'admin-toggle-button', onClick: () => setShowCreateIncident((current) => !current) },
          showCreateIncident ? 'Ocultar nuevo incidente' : 'Nuevo incidente'
        ),
        showCreateIncident && h('section', { className: 'admin-card-panel' },
          h(IncidentForm, { title: 'Nuevo incidente', value: createForm, onChange: setCreateForm, onSubmit: createIncident, submitLabel: 'Crear incidente' })
        ),
        h('button', { type: 'button', className: 'admin-toggle-button secondary-toggle', onClick: () => setShowCreateAdmin((current) => !current) },
          showCreateAdmin ? 'Ocultar crear administrador' : 'Crear administrador'
        ),
        showCreateAdmin && h(AdminCreateForm, { token, onMessage: setMessage })
      )
    )
  );
}

function AdminApp() {
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || '');
  const [email, setEmail] = useState(localStorage.getItem(ADMIN_KEY) || '');

  function login(nextToken, nextEmail) {
    setToken(nextToken);
    setEmail(nextEmail);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADMIN_KEY);
    setToken('');
    setEmail('');
  }

  return token
    ? h(Dashboard, { token, email, onLogout: logout })
    : h(LoginView, { onLogin: login });
}

createRoot(document.querySelector('#admin-root')).render(h(AdminApp));
