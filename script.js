const STORAGE_KEY = 'qr-muebles-registros-v1';
const QR_SIZE = 240;
const APP_CONFIG = window.APP_CONFIG || {};

const form = document.getElementById('furniture-form');
const adminApp = document.getElementById('admin-app');
const savedRecordsSection = document.getElementById('saved-records-section');
const publicRecord = document.getElementById('public-record');
const assetCode = document.getElementById('asset-code');
const formMessage = document.getElementById('form-message');
const qrContainer = document.getElementById('qrcode');
const qrPlaceholder = document.getElementById('qr-placeholder');
const qrLabel = document.getElementById('qr-label');
const downloadQrButton = document.getElementById('download-qr-btn');
const savedRecords = document.getElementById('saved-records');
const recordCount = document.getElementById('record-count');
const startScanButton = document.getElementById('start-scan-btn');
const stopScanButton = document.getElementById('stop-scan-btn');
const reader = document.getElementById('reader');
const scanResult = document.getElementById('scan-result');

let records = [];
let generatedRecord = null;
let html5QrCode = null;
let supabaseClient = null;

function hasSupabaseConfig() {
  return Boolean(
    APP_CONFIG.supabaseUrl
    && APP_CONFIG.supabaseAnonKey
    && !APP_CONFIG.supabaseUrl.includes('YOUR_')
    && !APP_CONFIG.supabaseAnonKey.includes('YOUR_')
  );
}

function getSupabaseClient() {
  if (!hasSupabaseConfig()) {
    return null;
  }

  if (!supabaseClient && window.supabase) {
    supabaseClient = window.supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey);
  }

  return supabaseClient;
}

function loadLocalRecords() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveLocalRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function nextAssetCodeFromList(list) {
  const largestCode = list.reduce((largest, record) => {
    const match = /^MOB-(\d+)$/.exec(record.id);
    return match ? Math.max(largest, Number(match[1])) : largest;
  }, 0);

  return `MOB-${String(largestCode + 1).padStart(3, '0')}`;
}

function nextAssetCode() {
  return nextAssetCodeFromList(records);
}

function setFormMessage(message = '', isError = false) {
  formMessage.textContent = message;
  formMessage.classList.toggle('error', isError);
}

function resetForm() {
  form.reset();
  assetCode.textContent = nextAssetCode();
  setFormMessage();
  generatedRecord = null;
  qrContainer.replaceChildren();
  qrPlaceholder.hidden = false;
  qrLabel.hidden = true;
  qrLabel.textContent = '';
  downloadQrButton.disabled = true;
}

function getRecordFromForm() {
  const data = new FormData(form);
  const type = String(data.get('type') || '').trim();
  const location = String(data.get('location') || '').trim();

  return {
    id: assetCode.textContent,
    name: `${type} · ${location}`.trim(),
    type,
    location,
    status: String(data.get('status') || '').trim(),
    notes: String(data.get('notes') || '').trim(),
  };
}

function validateRecord(record) {
  if (!record.type || !record.location || !record.status) {
    return 'Completa el tipo, la oficina y el estado.';
  }

  return '';
}

function buildRecordUrl(record) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('mueble', record.id);
  return url.toString();
}

async function fetchRecordById(recordId) {
  const client = getSupabaseClient();

  if (client) {
    const { data, error } = await client
      .from('furniture')
      .select('*')
      .eq('id', recordId)
      .maybeSingle();

    if (error) {
      console.error('No se pudo cargar el registro desde Supabase:', error);
      return null;
    }

    return data || null;
  }

  const localRecord = loadLocalRecords().find((record) => record.id === recordId);
  return localRecord || null;
}

async function readRecordFromUrl(urlText = window.location.href) {
  try {
    const url = new URL(urlText, window.location.href);
    const recordId = url.searchParams.get('mueble');

    if (!recordId) {
      return null;
    }

    return fetchRecordById(recordId);
  } catch {
    return null;
  }
}

function isValidRecord(record) {
  return Boolean(
    record
    && typeof record === 'object'
    && typeof record.id === 'string'
    && typeof record.name === 'string'
    && typeof record.type === 'string'
    && typeof record.location === 'string'
    && typeof record.status === 'string'
  );
}

function showQr(record) {
  if (typeof QRCode === 'undefined') {
    setFormMessage('No se pudo cargar la libreria para generar el QR. Revisa tu conexion.', true);
    return;
  }

  try {
    qrContainer.replaceChildren();
    new QRCode(qrContainer, {
      text: buildRecordUrl(record),
      width: QR_SIZE,
      height: QR_SIZE,
      correctLevel: QRCode.CorrectLevel.M,
    });
    generatedRecord = record;
    qrPlaceholder.hidden = true;
    qrLabel.hidden = false;
    qrLabel.textContent = `${record.id} - ${record.name}`;
    downloadQrButton.disabled = false;
  } catch (error) {
    console.error('No se pudo generar el codigo QR:', error);
    setFormMessage('La ficha tiene demasiado texto para un QR. Acorta las observaciones e intenta otra vez.', true);
  }
}

async function loadRecords() {
  const client = getSupabaseClient();

  if (client) {
    const { data, error } = await client
      .from('furniture')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error al cargar muebles desde Supabase:', error);
      setFormMessage('No se pudo cargar el inventario compartido.', true);
      return [];
    }

    records = data || [];
    return records;
  }

  records = loadLocalRecords();
  return records;
}

async function persistRecord(record) {
  const client = getSupabaseClient();

  if (client) {
    const payload = {
      id: record.id,
      name: record.name,
      type: record.type,
      location: record.location,
      status: record.status,
      notes: record.notes || '',
    };

    const { error } = await client.from('furniture').upsert([payload], { onConflict: 'id' });
    if (error) {
      throw error;
    }
    return;
  }

  records = [record, ...records.filter((savedRecord) => savedRecord.id !== record.id)];
  saveLocalRecords();
}

async function createRecord() {
  const record = getRecordFromForm();
  const validationMessage = validateRecord(record);

  if (validationMessage) {
    setFormMessage(validationMessage, true);
    return;
  }

  try {
    await persistRecord(record);
    records = await loadRecords();
    showQr(record);
    setFormMessage(`Listo. Generaste la etiqueta de ${record.id}.`);
  } catch (error) {
    console.error('No se pudo guardar el registro:', error);
    setFormMessage('No se pudo guardar el registro. Intenta otra vez.', true);
  }
}

function renderRecords() {
  savedRecords.replaceChildren();
  recordCount.textContent = `${records.length} ${records.length === 1 ? 'mueble' : 'muebles'}`;

  if (records.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Aun no hay muebles registrados.';
    savedRecords.append(empty);
    return;
  }

  records.forEach((record) => {
    const item = document.createElement('article');
    item.className = 'record-item';

    const code = document.createElement('span');
    code.className = 'record-code';
    code.textContent = record.id;

    const name = document.createElement('p');
    name.className = 'record-name';
    name.textContent = record.name;

    const meta = document.createElement('p');
    meta.className = 'record-meta';
    meta.textContent = `${record.type} · ${record.location}`;

    const actions = document.createElement('div');
    actions.className = 'record-actions';

    const generateButton = document.createElement('button');
    generateButton.type = 'button';
    generateButton.className = 'button-secondary';
    generateButton.textContent = 'Ver QR';
    generateButton.addEventListener('click', () => {
      showQr(record);
      document.querySelector('.qr-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'button-secondary';
    viewButton.textContent = 'Ver ficha';
    viewButton.addEventListener('click', () => renderPublicRecord(record));

    actions.append(generateButton, viewButton);
    item.append(code, name, meta, actions);
    savedRecords.append(item);
  });
}

function addDetail(container, label, value, className = '') {
  if (!value) {
    return;
  }

  const detail = document.createElement('div');
  detail.className = className;

  const detailLabel = document.createElement('span');
  detailLabel.className = 'detail-label';
  detailLabel.textContent = label;

  const detailValue = document.createElement('p');
  detailValue.className = 'detail-value';
  detailValue.textContent = value;

  detail.append(detailLabel, detailValue);
  container.append(detail);
}

function renderPublicRecord(record) {
  adminApp.hidden = true;
  savedRecordsSection.hidden = true;
  publicRecord.hidden = false;
  publicRecord.replaceChildren();

  const header = document.createElement('div');
  header.className = 'public-record-header';

  const heading = document.createElement('div');
  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'Ficha de mueble';
  const title = document.createElement('h2');
  title.textContent = record.name || `${record.type} · ${record.location}`;
  heading.append(eyebrow, title);

  const code = document.createElement('span');
  code.className = 'asset-code';
  code.textContent = record.id;
  header.append(heading, code);

  const details = document.createElement('div');
  details.className = 'record-details';
  addDetail(details, 'Tipo', record.type);
  addDetail(details, 'Ubicacion', record.location);
  addDetail(details, 'Estado', record.status);
  addDetail(details, 'Observaciones', record.notes, 'notes-detail');

  const notice = document.createElement('p');
  notice.className = 'public-notice';
  notice.textContent = 'Esta ficha se muestra desde el codigo QR del mueble.';

  publicRecord.append(header, details, notice);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function downloadQr() {
  const image = qrContainer.querySelector('img');
  const canvas = qrContainer.querySelector('canvas');
  const source = image?.src || canvas?.toDataURL('image/png');

  if (!source || !generatedRecord) {
    return;
  }

  const link = document.createElement('a');
  link.href = source;
  link.download = `${generatedRecord.id}-qr.png`;
  document.body.append(link);
  link.click();
  link.remove();
}

function setScanResult(message) {
  scanResult.textContent = message;
}

async function startScanner() {
  if (html5QrCode || typeof Html5Qrcode === 'undefined') {
    if (typeof Html5Qrcode === 'undefined') {
      setScanResult('No se pudo cargar el lector. Revisa tu conexion.');
    }
    return;
  }

  reader.hidden = false;
  startScanButton.disabled = true;
  stopScanButton.disabled = false;
  setScanResult('Buscando un codigo QR...');

  try {
    html5QrCode = new Html5Qrcode('reader');
    const devices = await Html5Qrcode.getCameras();
    const backCamera = devices.find((device) => /back|rear|environment/i.test(device.label));
    const cameraId = (backCamera || devices[0])?.id;

    if (!cameraId) {
      throw new Error('No hay camara disponible.');
    }

    await html5QrCode.start(
      cameraId,
      { fps: 10, qrbox: { width: 220, height: 220 } },
      async (decodedText) => {
        await handleScannedText(decodedText);
      },
      () => {}
    );
  } catch (error) {
    console.error('No se pudo iniciar la camara:', error);
    setScanResult('No se pudo abrir la camara. Revisa los permisos y usa HTTPS o localhost.');
    await stopScanner(false);
  }
}

async function handleScannedText(decodedText) {
  const record = await readRecordFromUrl(decodedText);

  if (record && isValidRecord(record)) {
    setScanResult(`Se encontro ${record.id}. Abriendo ficha...`);
    stopScanner(false).finally(() => renderPublicRecord(record));
    return;
  }

  setScanResult('Este QR no corresponde a una ficha creada en este inventario.');
}

async function stopScanner(showStoppedMessage = true) {
  const scanner = html5QrCode;
  html5QrCode = null;

  if (scanner) {
    try {
      await scanner.stop();
      await scanner.clear();
    } catch (error) {
      console.warn('No se pudo cerrar la camara:', error);
    }
  }

  reader.hidden = true;
  startScanButton.disabled = false;
  stopScanButton.disabled = true;

  if (showStoppedMessage) {
    setScanResult('La camara esta apagada.');
  }
}

async function initialize() {
  records = await loadRecords();

  if (hasSupabaseConfig()) {
    setFormMessage('Usando inventario compartido en Supabase.');
  }

  const recordFromUrl = await readRecordFromUrl();

  if (recordFromUrl && isValidRecord(recordFromUrl)) {
    renderPublicRecord(recordFromUrl);
    return;
  }

  resetForm();
  renderRecords();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  createRecord();
});

document.getElementById('clear-form-btn').addEventListener('click', resetForm);
downloadQrButton.addEventListener('click', downloadQr);
startScanButton.addEventListener('click', startScanner);
stopScanButton.addEventListener('click', () => stopScanner());

window.addEventListener('beforeunload', () => {
  if (html5QrCode) {
    html5QrCode.stop().catch(() => {});
  }
});

initialize();
