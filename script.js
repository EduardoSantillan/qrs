// ---------------------------------------------------------------------------
// Config y cliente de Supabase (con fallback a localStorage)
// ---------------------------------------------------------------------------
const CONFIG = window.APP_CONFIG || {};
const STORAGE_KEY = 'furniture-records';

let supabaseClient = null;
if (CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && window.supabase) {
  try {
    supabaseClient = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  } catch (err) {
    console.warn('No se pudo iniciar Supabase, se usará almacenamiento local.', err);
    supabaseClient = null;
  }
}

// ---------------------------------------------------------------------------
// Elementos del DOM
// ---------------------------------------------------------------------------
const publicRecordSection = document.getElementById('public-record');
const adminApp = document.getElementById('admin-app');
const savedRecordsSection = document.getElementById('saved-records-section');

const furnitureForm = document.getElementById('furniture-form');
const typeInput = document.getElementById('type');
const locationInput = document.getElementById('location');
const statusInput = document.getElementById('status');
const notesInput = document.getElementById('notes');
const photoInput = document.getElementById('photo');
const photoPreview = document.getElementById('photo-preview');
const photoPreviewImage = document.getElementById('photo-preview-image');
const assetCodeLabel = document.getElementById('asset-code');
const formMessage = document.getElementById('form-message');
const clearFormBtn = document.getElementById('clear-form-btn');

const qrPlaceholder = document.getElementById('qr-placeholder');
const qrContainer = document.getElementById('qrcode');
const qrLabel = document.getElementById('qr-label');
const downloadQrBtn = document.getElementById('download-qr-btn');

const recordCountLabel = document.getElementById('record-count');
const savedRecordsList = document.getElementById('saved-records');

let currentAssetId = null;
let currentQrCode = null;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function generateId() {
  return 'M-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function buildRecordUrl(id) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('id', id);
  return url.toString();
}

function getIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

function showMessage(text, isError = false) {
  formMessage.textContent = text;
  formMessage.classList.toggle('error', isError);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function getLocalRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveLocalRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

// ---------------------------------------------------------------------------
// Persistencia: Supabase con fallback a localStorage
// ---------------------------------------------------------------------------
async function saveRecord(record) {
  if (supabaseClient) {
    const { error } = await supabaseClient.from('furniture').upsert(record, { onConflict: 'id' });
    if (error) {
      if (!CONFIG.localFallback) throw error;
      console.warn('Supabase falló, guardando localmente.', error);
    } else {
      return;
    }
  }
  const records = getLocalRecords();
  const idx = records.findIndex((r) => r.id === record.id);
  if (idx >= 0) records[idx] = record;
  else records.unshift(record);
  saveLocalRecords(records);
}

async function fetchRecordById(id) {
  if (supabaseClient) {
    const { data, error } = await supabaseClient.from('furniture').select('*').eq('id', id).maybeSingle();
    if (!error && data) return data;
    if (error) console.warn('Supabase falló al buscar el registro, probando localStorage.', error);
  }
  return getLocalRecords().find((r) => r.id === id) || null;
}

async function fetchAllRecords() {
  if (supabaseClient) {
    const { data, error } = await supabaseClient.from('furniture').select('*').order('created_at', { ascending: false });
    if (!error && data) return data;
    if (error) console.warn('Supabase falló al listar registros, usando localStorage.', error);
  }
  return getLocalRecords();
}

async function deleteRecord(id) {
  if (supabaseClient) {
    const { error } = await supabaseClient.from('furniture').delete().eq('id', id);
    if (error) console.warn('Supabase falló al borrar, borrando localmente igual.', error);
  }
  const records = getLocalRecords().filter((r) => r.id !== id);
  saveLocalRecords(records);
}

// ---------------------------------------------------------------------------
// Formulario -> Registro
// ---------------------------------------------------------------------------
async function getRecordFromForm() {
  let photoData = '';
  const file = photoInput.files && photoInput.files[0];
  if (file) {
    photoData = await fileToDataUrl(file);
  }

  return {
    id: currentAssetId || generateId(),
    name: `${typeInput.value} - ${locationInput.value}`,
    type: typeInput.value,
    location: locationInput.value,
    status: statusInput.value,
    notes: notesInput.value || '',
    photo: photoData,
    created_at: new Date().toISOString(),
  };
}

function renderQr(record) {
  qrContainer.innerHTML = '';
  const url = buildRecordUrl(record.id);

  currentQrCode = new QRCode(qrContainer, {
    text: url,
    width: 220,
    height: 220,
    correctLevel: QRCode.CorrectLevel.H,
  });

  qrPlaceholder.hidden = true;
  qrContainer.hidden = false;
  qrLabel.textContent = record.name;
  qrLabel.hidden = false;
  downloadQrBtn.disabled = false;
  assetCodeLabel.textContent = record.id;
}

async function createRecord(event) {
  event.preventDefault();

  if (!furnitureForm.reportValidity()) return;

  try {
    showMessage('Guardando...');
    const record = await getRecordFromForm();
    await saveRecord(record);
    currentAssetId = record.id;
    renderQr(record);
    showMessage('Mueble guardado correctamente.');
    await refreshSavedRecords();
  } catch (error) {
    console.error(error);
    showMessage('No se pudo guardar el registro: ' + error.message, true);
  }
}

function resetForm() {
  furnitureForm.reset();
  currentAssetId = null;
  assetCodeLabel.textContent = '';
  photoPreview.hidden = true;
  photoPreviewImage.src = '';
  qrContainer.innerHTML = '';
  qrContainer.hidden = true;
  qrPlaceholder.hidden = false;
  qrLabel.hidden = true;
  downloadQrBtn.disabled = true;
  showMessage('');
}

function downloadQr() {
  const canvas = qrContainer.querySelector('canvas');
  const img = qrContainer.querySelector('img');
  const source = canvas || img;
  if (!source) return;

  const link = document.createElement('a');
  link.download = `qr-${currentAssetId || 'mueble'}.png`;
  link.href = canvas ? canvas.toDataURL('image/png') : img.src;
  link.click();
}

photoInput.addEventListener('change', async () => {
  const file = photoInput.files && photoInput.files[0];
  if (!file) {
    photoPreview.hidden = true;
    return;
  }
  photoPreviewImage.src = await fileToDataUrl(file);
  photoPreview.hidden = false;
});

furnitureForm.addEventListener('submit', createRecord);
clearFormBtn.addEventListener('click', resetForm);
downloadQrBtn.addEventListener('click', downloadQr);

// ---------------------------------------------------------------------------
// Lista de muebles guardados
// ---------------------------------------------------------------------------
async function refreshSavedRecords() {
  const records = await fetchAllRecords();
  recordCountLabel.textContent = `${records.length} mueble${records.length === 1 ? '' : 's'}`;

  if (records.length === 0) {
    savedRecordsList.innerHTML = '<p class="empty-state">Aún no hay muebles registrados.</p>';
    return;
  }

  savedRecordsList.innerHTML = '';
  records.forEach((record) => {
    const item = document.createElement('div');
    item.className = 'record-item';

    item.innerHTML = `
      ${record.photo ? `<img class="record-photo" src="${record.photo}" alt="Foto de ${record.name}" />` : ''}
      <span class="record-code">${record.id}</span>
      <span class="record-name">${record.name}</span>
      <span class="record-meta">${record.status}${record.notes ? ' · ' + record.notes : ''}</span>
      <div class="record-actions">
        <button type="button" data-action="view" data-id="${record.id}">Ver ficha</button>
        <button type="button" class="button-secondary" data-action="delete" data-id="${record.id}">Eliminar</button>
      </div>
    `;
    savedRecordsList.appendChild(item);
  });

  savedRecordsList.querySelectorAll('[data-action="view"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.location.href = buildRecordUrl(btn.dataset.id);
    });
  });

  savedRecordsList.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este mueble?')) return;
      await deleteRecord(btn.dataset.id);
      await refreshSavedRecords();
    });
  });
}

// ---------------------------------------------------------------------------
// Vista pública (al escanear el QR)
// ---------------------------------------------------------------------------
async function renderPublicRecord(id) {
  adminApp.hidden = true;
  savedRecordsSection.hidden = true;

  const record = await fetchRecordById(id);

  if (!record) {
    publicRecordSection.hidden = false;
    publicRecordSection.innerHTML = `
      <div class="public-record-header">
        <div>
          <p class="eyebrow">Mueble no encontrado</p>
          <h2>No existe un registro con este código</h2>
        </div>
      </div>
      <p class="public-notice">Verifica que el código QR corresponda a un mueble registrado.</p>
    `;
    return;
  }

  publicRecordSection.hidden = false;
  publicRecordSection.innerHTML = `
    <div class="public-record-header">
      <div>
        <p class="eyebrow">Ficha del mueble</p>
        <h2>${record.name}</h2>
      </div>
      <span class="asset-code">${record.id}</span>
    </div>
    <div class="record-details">
      ${record.photo ? `<div class="public-photo"><img src="${record.photo}" alt="Foto de ${record.name}" /></div>` : ''}
      <div>
        <span class="detail-label">Tipo</span>
        <span class="detail-value">${record.type}</span>
      </div>
      <div>
        <span class="detail-label">Oficina</span>
        <span class="detail-value">${record.location}</span>
      </div>
      <div>
        <span class="detail-label">Estado</span>
        <span class="detail-value">${record.status}</span>
      </div>
      ${record.notes ? `
      <div class="notes-detail">
        <span class="detail-label">Observaciones</span>
        <span class="detail-value">${record.notes}</span>
      </div>` : ''}
    </div>
    <p class="public-notice">Consulta generada al escanear el código QR de este mueble.</p>
  `;
}

// ---------------------------------------------------------------------------
// Inicio: decide si mostrar la ficha pública o la app de registro
// ---------------------------------------------------------------------------
async function init() {
  const id = getIdFromUrl();
  if (id) {
    await renderPublicRecord(id);
  } else {
    await refreshSavedRecords();
  }
}

init();