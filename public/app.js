const form = document.querySelector('#incident-form');
const searchForm = document.querySelector('#search-form');
const detail = document.querySelector('#incident-detail');
const incidentsContainer = document.querySelector('#incidents');
const refreshButton = document.querySelector('#refresh');

async function request(path, options) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Error de API');
  return payload;
}

function renderIncident(incident) {
  return `
    <article class="incident">
      <p><strong>${incident.classification.categoryLabel}</strong> - prioridad ${incident.classification.priority} - estado ${incident.status}</p>
      <p>${incident.description}</p>
      <p class="meta">ID: ${incident.id} | Area: ${incident.assignment.responsibleArea} | SLA: ${incident.assignment.slaHours}h</p>
    </article>
  `;
}

async function loadIncidents() {
  const { incidents } = await request('/api/incidents');
  incidentsContainer.innerHTML = incidents.length
    ? incidents.map(renderIncident).join('')
    : '<p class="meta">Todavia no hay incidentes registrados.</p>';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(form).entries());
  try {
    const { incident } = await request('/api/incidents', { method: 'POST', body: JSON.stringify(body) });
    detail.textContent = JSON.stringify(incident, null, 2);
    form.reset();
    await loadIncidents();
  } catch (error) {
    detail.textContent = error.message;
  }
});

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = new FormData(searchForm).get('id');
  try {
    const { incident } = await request(`/api/incidents/${id}`);
    detail.textContent = JSON.stringify(incident, null, 2);
  } catch (error) {
    detail.textContent = error.message;
  }
});

refreshButton.addEventListener('click', loadIncidents);
loadIncidents().catch((error) => {
  incidentsContainer.textContent = error.message;
});
