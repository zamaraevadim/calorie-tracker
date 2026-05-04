// ==================== Конфигурация ====================
const OAUTH_CLIENT_ID = 'd2fe82481e124199949e52e56ff15798';
const OAUTH_REDIRECT_URI = window.location.origin + '/';
const OAUTH_AUTHORIZE_URL = 'https://oauth.yandex.ru/authorize';
const JSONBOX_API_URL = 'https://jsonbox.ru/api.php';
const LEGACY_JSONBOX_API_KEY = '7ba02b2e341abe6aaad2ba8e9fb7ff0c';
const WIFE_YANDEX_EMAIL = 'krisstina.rau@yandex.ru';
const WIFE_JSONBOX_API_KEY = 'cd4ed927d140a008754c8e54a332e0ca';
const HUSBAND_YANDEX_EMAIL = 'zamaraevadim@yandex.ru';
const HUSBAND_JSONBOX_API_KEY = '7ba02b2e341abe6aaad2ba8e9fb7ff0c';

const STORAGE_KEYS = {
    USER: 'fitTrack_user',
    WORKOUTS: 'fitTrack_workouts',
    MEASUREMENTS: 'fitTrack_measurements',
    CUSTOM_EXERCISES: 'fitTrack_customExercises',
    JSONBOX_API: 'fitTrack_jsonboxApiKey',
    DELETED_WORKOUTS: 'fitTrack_deletedWorkouts',
    DELETED_MEASUREMENTS: 'fitTrack_deletedMeasurements',
    DELETED_CUSTOM_NAMES: 'fitTrack_deletedCustomNames',
    ONE_REP_MAXES: 'fitTrack_oneRepMaxes'
};

const CLOUD_SCHEMA_VERSION = 1;
const CLOUD_PULL_MIN_INTERVAL_MS = 28000;
const CLOUD_SAVE_MAX_RETRIES = 4;
const CLOUD_SAVE_RETRY_BASE_MS = 400;

const DEFAULT_EXERCISES = [
    { name: 'Жим штанги лёжа', category: 'Грудь' },
    { name: 'Жим гантелей лёжа', category: 'Грудь' },
    { name: 'Отжимания на брусьях', category: 'Грудь' },
    { name: 'Подтягивания', category: 'Спина' },
    { name: 'Тяга штанги в наклоне', category: 'Спина' },
    { name: 'Тяга верхнего блока', category: 'Спина' },
    { name: 'Приседания со штангой', category: 'Ноги' },
    { name: 'Жим ногами', category: 'Ноги' },
    { name: 'Выпады', category: 'Ноги' },
    { name: 'Жим штанги стоя', category: 'Плечи' },
    { name: 'Махи гантелями в стороны', category: 'Плечи' },
    { name: 'Подъём штанги на бицепс', category: 'Руки' },
    { name: 'Французский жим', category: 'Руки' },
    { name: 'Скручивания', category: 'Пресс' },
    { name: 'Подъём ног в висе', category: 'Пресс' }
];

const CARDIO_EXERCISES = ['Бег', 'Велосипед', 'Плавание', 'Ходьба', 'Эллипс'];
const MEASUREMENT_TYPES = [
    { id: 'weight', name: 'Вес (кг)' },
    { id: 'chest', name: 'Грудь (см)' },
    { id: 'waist', name: 'Талия (см)' },
    { id: 'hips', name: 'Бёдра (см)' },
    { id: 'biceps', name: 'Бицепс (см)' },
    { id: 'forearm', name: 'Предплечье (см)' },
    { id: 'thigh', name: 'Бедро (см)' },
    { id: 'calf', name: 'Икра (см)' },
    { id: 'neck', name: 'Шея (см)' },
    { id: 'shoulders', name: 'Плечи (см)' }
];

let currentUser = null;
let workouts = [];
let measurements = [];
let customExercises = [];
let currentWorkout = null;
let chartInstance = null;
let oneRepMaxes = {};
let deletedWorkoutIds = [];
let deletedMeasurementIds = [];
let deletedCustomExerciseNames = [];
let lastCloudPullAt = 0;
let cloudSaveMutex = Promise.resolve();
let cloudPullDebounceTimer = null;
let jsonBoxKeyModalResolver = null;

// ==================== Toast уведомления ====================
function showToast(message, type = 'info', action = null) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    if (action) {
        const btn = document.createElement('button');
        btn.className = 'toast-action';
        btn.textContent = action.text;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            action.handler();
            toast.remove();
        });
        toast.appendChild(btn);
    }
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, action ? 6000 : 3000);
}

// ==================== Инициализация ====================
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('yandex-login-btn').addEventListener('click', redirectToYandexOAuth);
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('menu-toggle').addEventListener('click', toggleMenu);
    document.querySelectorAll('[data-page]').forEach(item => {
        item.addEventListener('click', (e) => {
            const li = e.target.closest('[data-page]');
            if (li?.dataset.page) switchPage(li.dataset.page);
        });
    });
    document.getElementById('add-exercise-btn').addEventListener('click', addExerciseToWorkout);
    document.getElementById('finish-workout-btn').addEventListener('click', finishWorkout);
    document.getElementById('copy-last-workout-btn').addEventListener('click', copyLastWorkout);
    document.getElementById('add-measurement-btn').addEventListener('click', showMeasurementForm);
    document.getElementById('save-measurement-btn').addEventListener('click', saveMeasurement);
    document.getElementById('cancel-measurement-btn').addEventListener('click', hideMeasurementForm);
    document.getElementById('progress-type-select').addEventListener('change', updateProgressChart);
    document.getElementById('measurement-type-select').addEventListener('change', updateProgressChart);
    document.getElementById('exercise-progress-select').addEventListener('change', updateProgressChart);
    document.getElementById('add-custom-exercise-btn').addEventListener('click', addCustomExercise);
    document.getElementById('export-data-btn')?.addEventListener('click', exportData);
    document.getElementById('import-data-btn')?.addEventListener('click', () => document.getElementById('import-file-input').click());
    document.getElementById('import-file-input')?.addEventListener('change', importData);
    document.getElementById('cloud-sync-btn')?.addEventListener('click', () => pullFromCloudNow(true));
    document.getElementById('jsonbox-key-save-btn')?.addEventListener('click', onJsonBoxKeySaveClick);
    document.getElementById('jsonbox-key-cancel-btn')?.addEventListener('click', onJsonBoxKeyCancelClick);
    document.getElementById('jsonbox-key-logout-btn')?.addEventListener('click', onJsonBoxKeyLogoutClick);
    document.getElementById('jsonbox-key-settings-btn')?.addEventListener('click', () => showJsonBoxKeyModal({ editMode: true }));
    document.getElementById('history-search')?.addEventListener('input', renderHistory);
    document.getElementById('history-sort')?.addEventListener('change', renderHistory);
    window.addEventListener('focus', () => scheduleDebouncedCloudPull());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleDebouncedCloudPull(); });
}

// ==================== Авторизация ====================
function checkAuth() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    if (accessToken) {
        window.history.replaceState({}, document.title, window.location.pathname);
        fetchUserInfo(accessToken);
    } else {
        const savedUser = localStorage.getItem(STORAGE_KEYS.USER);
        if (savedUser) {
            currentUser = JSON.parse(savedUser);
            loadLocalData();
            (async () => {
                const keyOk = await waitForJsonBoxApiKeyIfNeeded();
                if (!keyOk) return;
                showApp();
                const ok = await loadDataFromCloud(true);
                if (ok) { renderHistory(); renderMeasurements(); renderExercisesList(); populateExerciseSelect(); }
            })();
        } else { showLogin(); }
    }
}
function redirectToYandexOAuth() {
    window.location.href = `${OAUTH_AUTHORIZE_URL}?response_type=token&client_id=${OAUTH_CLIENT_ID}&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}`;
}
async function fetchUserInfo(token) {
    showLoading();
    try {
        const response = await fetch(`https://login.yandex.ru/info?format=json&oauth_token=${token}`);
        if (!response.ok) throw new Error('Ошибка получения данных');
        const userData = await response.json();
        currentUser = { id: userData.id, name: userData.display_name || userData.real_name || 'Пользователь', email: userData.default_email || '' };
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(currentUser));
        const keyOk = await waitForJsonBoxApiKeyIfNeeded();
        if (!keyOk) return;
        await loadDataFromCloud(true);
        showApp(); renderHistory(); renderMeasurements(); renderExercisesList(); populateExerciseSelect();
    } catch (error) {
        console.error('User info error:', error);
        showToast('Не удалось получить данные пользователя', 'error');
        showLogin();
    } finally { hideLoading(); }
}
function logout() { setCloudSyncStatus('', ''); localStorage.removeItem(STORAGE_KEYS.USER); currentUser = null; showLogin(); }
function showLogin() { document.getElementById('loading-screen').style.display = 'none'; document.getElementById('login-page').style.display = 'flex'; document.getElementById('app-page').style.display = 'none'; }
function showApp() { document.getElementById('loading-screen').style.display = 'none'; document.getElementById('login-page').style.display = 'none'; document.getElementById('app-page').style.display = 'block'; document.getElementById('user-name').textContent = currentUser?.name || 'Пользователь'; populateExerciseSelect(); renderMeasurements(); renderHistory(); renderExercisesList(); loadWorkoutDraft(); switchPage('workout'); }
function showLoading() { document.getElementById('loading-screen').style.display = 'flex'; document.getElementById('login-page').style.display = 'none'; document.getElementById('app-page').style.display = 'none'; }
function hideLoading() { document.getElementById('loading-screen').style.display = 'none'; }

// ==================== Локальные данные ====================
function loadLocalData() {
    const userId = currentUser?.id;
    if (!userId) return;
    workouts = JSON.parse(localStorage.getItem(`${STORAGE_KEYS.WORKOUTS}_${userId}`) || '[]');
    measurements = JSON.parse(localStorage.getItem(`${STORAGE_KEYS.MEASUREMENTS}_${userId}`) || '[]');
    customExercises = JSON.parse(localStorage.getItem(`${STORAGE_KEYS.CUSTOM_EXERCISES}_${userId}`) || '[]');
    oneRepMaxes = JSON.parse(localStorage.getItem(`${STORAGE_KEYS.ONE_REP_MAXES}_${userId}`) || '{}');
    deletedWorkoutIds = JSON.parse(localStorage.getItem(`${STORAGE_KEYS.DELETED_WORKOUTS}_${userId}`) || '[]');
    deletedMeasurementIds = JSON.parse(localStorage.getItem(`${STORAGE_KEYS.DELETED_MEASUREMENTS}_${userId}`) || '[]');
    deletedCustomExerciseNames = JSON.parse(localStorage.getItem(`${STORAGE_KEYS.DELETED_CUSTOM_NAMES}_${userId}`) || '[]');
}
function saveLocalData() {
    if (!currentUser) return;
    const userId = currentUser.id;
    localStorage.setItem(`${STORAGE_KEYS.WORKOUTS}_${userId}`, JSON.stringify(workouts));
    localStorage.setItem(`${STORAGE_KEYS.MEASUREMENTS}_${userId}`, JSON.stringify(measurements));
    localStorage.setItem(`${STORAGE_KEYS.CUSTOM_EXERCISES}_${userId}`, JSON.stringify(customExercises));
    localStorage.setItem(`${STORAGE_KEYS.ONE_REP_MAXES}_${userId}`, JSON.stringify(oneRepMaxes));
    localStorage.setItem(`${STORAGE_KEYS.DELETED_WORKOUTS}_${userId}`, JSON.stringify(deletedWorkoutIds));
    localStorage.setItem(`${STORAGE_KEYS.DELETED_MEASUREMENTS}_${userId}`, JSON.stringify(deletedMeasurementIds));
    localStorage.setItem(`${STORAGE_KEYS.DELETED_CUSTOM_NAMES}_${userId}`, JSON.stringify(deletedCustomExerciseNames));
}
function jsonBoxApiStorageKey() { return currentUser?.id ? `${STORAGE_KEYS.JSONBOX_API}_${currentUser.id}` : null; }
function hadLegacyLocalDataBeforeKeySplit(userId) {
    const nonEmpty = (k) => { const v = localStorage.getItem(`${k}_${userId}`); return v && v !== '[]' && v !== 'null'; };
    return nonEmpty(STORAGE_KEYS.WORKOUTS) || nonEmpty(STORAGE_KEYS.MEASUREMENTS) || nonEmpty(STORAGE_KEYS.CUSTOM_EXERCISES);
}
function getJsonBoxApiKey() {
    const email = (currentUser?.email || '').trim().toLowerCase();
    if (email === WIFE_YANDEX_EMAIL.toLowerCase()) return WIFE_JSONBOX_API_KEY;
    if (email === HUSBAND_YANDEX_EMAIL.toLowerCase()) return HUSBAND_JSONBOX_API_KEY;
    const sk = jsonBoxApiStorageKey();
    if (!sk) return null;
    const saved = localStorage.getItem(sk);
    if (saved) return saved;
    if (hadLegacyLocalDataBeforeKeySplit(currentUser.id)) { localStorage.setItem(sk, LEGACY_JSONBOX_API_KEY); return LEGACY_JSONBOX_API_KEY; }
    return null;
}
function saveJsonBoxApiKey(key) { const sk = jsonBoxApiStorageKey(); if (sk) localStorage.setItem(sk, key.trim()); }
function waitForJsonBoxApiKeyIfNeeded() {
    if (getJsonBoxApiKey()) return Promise.resolve(true);
    return new Promise((resolve) => { jsonBoxKeyModalResolver = resolve; showJsonBoxKeyModal({ firstTime: true }); });
}
function showJsonBoxKeyModal(options) {
    const modal = document.getElementById('jsonbox-key-modal');
    const logoutBtn = document.getElementById('jsonbox-key-logout-btn');
    const cancelBtn = document.getElementById('jsonbox-key-cancel-btn');
    const input = document.getElementById('jsonbox-api-key-input');
    if (!modal || !input) return;
    if (options?.firstTime) { logoutBtn.style.display = ''; cancelBtn.style.display = 'none'; }
    else if (options?.editMode) { logoutBtn.style.display = 'none'; cancelBtn.style.display = ''; }
    input.value = ''; modal.style.display = 'flex';
}
function hideJsonBoxKeyModal() { const modal = document.getElementById('jsonbox-key-modal'); if (modal) modal.style.display = 'none'; }
function onJsonBoxKeySaveClick() {
    const input = document.getElementById('jsonbox-api-key-input');
    const key = input?.value?.trim();
    if (!key) { showToast('Вставьте API-ключ из jsonbox.ru', 'error'); return; }
    if (key.length < 10) { showToast('Неверный формат API-ключа', 'error'); return; }
    saveJsonBoxApiKey(key); hideJsonBoxKeyModal();
    if (jsonBoxKeyModalResolver) { jsonBoxKeyModalResolver(true); jsonBoxKeyModalResolver = null; }
    else { pullFromCloudNow(true); showToast('Ключ сохранён. Данные подтянуты из облака.', 'success'); }
}
function onJsonBoxKeyCancelClick() { hideJsonBoxKeyModal(); jsonBoxKeyModalResolver = null; }
function onJsonBoxKeyLogoutClick() { hideJsonBoxKeyModal(); const r = jsonBoxKeyModalResolver; jsonBoxKeyModalResolver = null; if (r) r(false); logout(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function setCloudSyncStatus(message, state) { const el = document.getElementById('cloud-sync-status'); if (!el) return; el.textContent = message; el.classList.remove('ok', 'err', 'syncing'); if (state) el.classList.add(state); }
function scheduleDebouncedCloudPull() { if (!currentUser) return; if (cloudPullDebounceTimer) clearTimeout(cloudPullDebounceTimer); cloudPullDebounceTimer = setTimeout(() => { cloudPullDebounceTimer = null; pullFromCloudNow(false); }, 1200); }
async function pullFromCloudNow(force) { if (!currentUser) return; const result = await loadDataFromCloud(force); if (result === true) { renderHistory(); renderMeasurements(); renderExercisesList(); populateExerciseSelect(); const page = document.querySelector('.side-menu li.active')?.dataset?.page; if (page === 'progress') { populateProgressSelects(); updateProgressChart(); } } }

// ==================== Нормализация и слияние ====================
function normalizeWorkout(w) { if (!w.exercises) w.exercises = []; if (!Array.isArray(w.cardio)) w.cardio = []; if (w.updatedAt == null) w.updatedAt = typeof w.id === 'number' ? w.id : Date.now(); return w; }
function normalizeMeasurement(m) { if (m.updatedAt == null) m.updatedAt = typeof m.id === 'number' ? m.id : Date.now(); return m; }
function mergeTombstoneIds(a, b) { return [...new Set([...(a || []), ...(b || [])])].filter(id => id != null); }
function mergeByIdWithTombstones(localList, cloudList, tombstones) {
    const tomb = new Set(tombstones); const byId = new Map();
    const consider = (item, isLocal) => { if (!item || item.id == null || tomb.has(item.id)) return; const t = item.updatedAt ?? item.id; const cur = byId.get(item.id); const ct = cur ? (cur.updatedAt ?? cur.id) : -Infinity; if (!cur || t > ct || (t === ct && isLocal)) byId.set(item.id, { ...item }); };
    (cloudList || []).forEach(x => consider(x, false)); (localList || []).forEach(x => consider(x, true));
    return [...byId.values()].sort((a, b) => (a.id || 0) - (b.id || 0));
}
function mergeCustomExercises(localList, cloudList, tombstoneNames) {
    const tomb = new Set(tombstoneNames || []); const byName = new Map();
    const consider = (c, isLocal) => { if (!c || !c.name || tomb.has(c.name)) return; const t = c.updatedAt || 0; const cur = byName.get(c.name); const ct = cur ? (cur.updatedAt || 0) : -Infinity; if (!cur || t > ct || (t === ct && isLocal)) byName.set(c.name, { ...c }); };
    (cloudList || []).forEach(c => consider(c, false)); (localList || []).forEach(c => consider(c, true));
    return [...byName.values()];
}
function buildUserSliceFromState() {
    workouts.forEach(normalizeWorkout); measurements.forEach(normalizeMeasurement);
    return { workouts: workouts.map(w => normalizeWorkout({ ...w })), measurements: measurements.map(m => normalizeMeasurement({ ...m })), customExercises: customExercises.map(c => ({ ...c, updatedAt: c.updatedAt || 0 })), oneRepMaxes: { ...oneRepMaxes }, deletedWorkoutIds: [...deletedWorkoutIds], deletedMeasurementIds: [...deletedMeasurementIds], deletedCustomExerciseNames: [...deletedCustomExerciseNames] };
}
function mergeUserSlices(localSlice, cloudSlice) {
    const dw = mergeTombstoneIds(localSlice.deletedWorkoutIds, cloudSlice.deletedWorkoutIds);
    const dm = mergeTombstoneIds(localSlice.deletedMeasurementIds, cloudSlice.deletedMeasurementIds);
    const dc = [...new Set([...(localSlice.deletedCustomExerciseNames || []), ...(cloudSlice.deletedCustomExerciseNames || [])])];
    const workoutsMerged = mergeByIdWithTombstones(localSlice.workouts, cloudSlice.workouts, dw);
    const measurementsMerged = mergeByIdWithTombstones(localSlice.measurements, cloudSlice.measurements, dm);
    const customMerged = mergeCustomExercises(localSlice.customExercises, cloudSlice.customExercises, dc);
    const oneRepMaxesMerged = {};
    const allKeys = new Set([...Object.keys(localSlice.oneRepMaxes || {}), ...Object.keys(cloudSlice.oneRepMaxes || {})]);
    allKeys.forEach(key => { const l = localSlice.oneRepMaxes?.[key]; const c = cloudSlice.oneRepMaxes?.[key]; if (!l) oneRepMaxesMerged[key] = c; else if (!c) oneRepMaxesMerged[key] = l; else oneRepMaxesMerged[key] = (l.updatedAt || 0) >= (c.updatedAt || 0) ? l : c; });
    return { workouts: workoutsMerged, measurements: measurementsMerged, customExercises: customMerged, oneRepMaxes: oneRepMaxesMerged, deletedWorkoutIds: dw, deletedMeasurementIds: dm, deletedCustomExerciseNames: dc };
}
function applyMergedUserSlice(merged) { workouts = merged.workouts; measurements = merged.measurements; customExercises = merged.customExercises; oneRepMaxes = merged.oneRepMaxes || {}; deletedWorkoutIds = merged.deletedWorkoutIds; deletedMeasurementIds = merged.deletedMeasurementIds; deletedCustomExerciseNames = merged.deletedCustomExerciseNames; }
function ensureEnvelopeShape(raw, userId) {
    if (!raw || typeof raw !== 'object') return { schemaVersion: CLOUD_SCHEMA_VERSION, users: {} };
    if (raw.users && typeof raw.users === 'object') { if (raw.schemaVersion == null) raw.schemaVersion = CLOUD_SCHEMA_VERSION; return raw; }
    if (raw.workouts || raw.measurements || raw.customExercises) return { schemaVersion: CLOUD_SCHEMA_VERSION, users: { [userId]: { workouts: raw.workouts || [], measurements: raw.measurements || [], customExercises: raw.customExercises || [], deletedWorkoutIds: [], deletedMeasurementIds: [], deletedCustomExerciseNames: [], oneRepMaxes: {} } } };
    return { schemaVersion: CLOUD_SCHEMA_VERSION, users: {} };
}
function ensureUserSliceShape(slice) { const s = slice || {}; return { workouts: (s.workouts || []).map(w => normalizeWorkout({ ...w })), measurements: (s.measurements || []).map(m => normalizeMeasurement({ ...m })), customExercises: s.customExercises || [], oneRepMaxes: s.oneRepMaxes || {}, deletedWorkoutIds: s.deletedWorkoutIds || [], deletedMeasurementIds: s.deletedMeasurementIds || [], deletedCustomExerciseNames: s.deletedCustomExerciseNames || [] }; }

// ==================== Облако ====================
async function jsonboxGet() { const apiKey = getJsonBoxApiKey(); if (!apiKey) throw new Error('JsonBox ключ не задан'); const res = await fetch(`${JSONBOX_API_URL}?action=get&api_key=${apiKey}`); if (!res.ok) throw new Error(`JsonBox GET ${res.status}`); return res.json(); }
async function jsonboxStore(envelope) { const apiKey = getJsonBoxApiKey(); if (!apiKey) throw new Error('JsonBox ключ не задан'); const res = await fetch(`${JSONBOX_API_URL}?action=store`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: apiKey, data: envelope }) }); if (!res.ok) throw new Error(`JsonBox STORE ${res.status}: ${await res.text()}`); }
async function loadDataFromCloud(force) {
    if (!currentUser || !getJsonBoxApiKey()) return false;
    const userId = currentUser.id; const now = Date.now();
    if (!force && lastCloudPullAt > 0 && now - lastCloudPullAt < CLOUD_PULL_MIN_INTERVAL_MS) return null;
    setCloudSyncStatus('Облако…', 'syncing');
    try {
        const cloudData = await jsonboxGet(); const raw = cloudData.data;
        const wasLegacyFlat = raw && !raw.users && (raw.workouts || raw.measurements);
        const envelope = ensureEnvelopeShape(raw, userId);
        if (wasLegacyFlat) await jsonboxStore(envelope);
        if (!envelope.users[userId]) envelope.users[userId] = ensureUserSliceShape(null);
        const cloudSlice = ensureUserSliceShape(envelope.users[userId]);
        const localSlice = buildUserSliceFromState();
        applyMergedUserSlice(mergeUserSlices(localSlice, cloudSlice));
        saveLocalData(); lastCloudPullAt = Date.now();
        setCloudSyncStatus(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + ' облако', 'ok');
        return true;
    } catch (e) { console.warn('Ошибка загрузки из облака:', e); setCloudSyncStatus('Нет связи', 'err'); return false; }
}
async function saveDataToCloudInternal() {
    if (!currentUser || !getJsonBoxApiKey()) return;
    const userId = currentUser.id; let lastErr;
    for (let attempt = 0; attempt < CLOUD_SAVE_MAX_RETRIES; attempt++) {
        try {
            const cloudData = await jsonboxGet(); const raw = cloudData.data;
            const wasLegacyFlat = raw && !raw.users && (raw.workouts || raw.measurements);
            const envelope = ensureEnvelopeShape(raw, userId);
            if (wasLegacyFlat) await jsonboxStore(envelope);
            if (!envelope.users) envelope.users = {};
            const cloudSlice = ensureUserSliceShape(envelope.users[userId]);
            const localSlice = buildUserSliceFromState();
            applyMergedUserSlice(mergeUserSlices(localSlice, cloudSlice));
            envelope.users[userId] = { workouts, measurements, customExercises, oneRepMaxes, deletedWorkoutIds, deletedMeasurementIds, deletedCustomExerciseNames };
            await jsonboxStore(envelope); saveLocalData();
            setCloudSyncStatus(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + ' сохранено', 'ok');
            return;
        } catch (e) { lastErr = e; console.warn(`JsonBox save попытка ${attempt + 1}:`, e); await sleep(CLOUD_SAVE_RETRY_BASE_MS * Math.pow(2, attempt)); }
    }
    setCloudSyncStatus('Ошибка записи', 'err'); console.error('JsonBox save окончательно не удался:', lastErr);
}
async function saveDataToCloud() { if (!currentUser) return; cloudSaveMutex = cloudSaveMutex.then(() => saveDataToCloudInternal()).catch(e => console.warn('JsonBox очередь:', e)); await cloudSaveMutex; }
async function saveWorkouts() { saveLocalData(); await saveDataToCloud(); }
async function saveMeasurements() { saveLocalData(); await saveDataToCloud(); }
async function saveCustomExercises() { saveLocalData(); await saveDataToCloud(); }

// ==================== Экспорт / Импорт ====================
function exportData() {
    const data = { workouts, measurements, customExercises, oneRepMaxes, deletedWorkoutIds, deletedMeasurementIds, deletedCustomExerciseNames };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `fitrack_backup_${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(url);
    showToast('Данные экспортированы', 'success');
}
function importData(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (Array.isArray(imported.workouts) && Array.isArray(imported.measurements) && Array.isArray(imported.customExercises)) {
                workouts = imported.workouts; measurements = imported.measurements; customExercises = imported.customExercises;
                oneRepMaxes = imported.oneRepMaxes || {};
                deletedWorkoutIds = Array.isArray(imported.deletedWorkoutIds) ? imported.deletedWorkoutIds : [];
                deletedMeasurementIds = Array.isArray(imported.deletedMeasurementIds) ? imported.deletedMeasurementIds : [];
                deletedCustomExerciseNames = Array.isArray(imported.deletedCustomExerciseNames) ? imported.deletedCustomExerciseNames : [];
                saveLocalData(); await saveDataToCloud(); renderHistory(); renderMeasurements(); renderExercisesList(); populateExerciseSelect();
                showToast('Данные импортированы', 'success');
            } else { showToast('Неверный формат файла', 'error'); }
        } catch (err) { showToast('Ошибка чтения файла', 'error'); }
    }; reader.readAsText(file); event.target.value = '';
}

// ==================== Навигация ====================
function toggleMenu() { document.getElementById('side-menu').classList.toggle('open'); }
function switchPage(pageId) {
    document.querySelectorAll('.content-page').forEach(p => p.style.display = 'none');
    const page = document.getElementById(`${pageId}-page`); if (page) page.style.display = 'block';
    document.querySelectorAll('.side-menu li').forEach(li => li.classList.remove('active'));
    const activeItem = document.querySelector(`[data-page="${pageId}"]`); if (activeItem) activeItem.classList.add('active');
    try {
        if (pageId === 'history') renderHistory();
        if (pageId === 'measurements') renderMeasurements();
        if (pageId === 'progress') { populateProgressSelects(); updateProgressChart(); }
        if (pageId === 'exercises') renderExercisesList();
        if (pageId === 'workout') {
            if (currentWorkout) { currentWorkout = normalizeWorkout(currentWorkout); renderCurrentWorkout(); }
            else {
                const draft = localStorage.getItem('fitTrack_workout_draft');
                if (draft) {
                    try {
                        currentWorkout = JSON.parse(draft);
                        if (!currentWorkout || (!Array.isArray(currentWorkout.exercises) && !Array.isArray(currentWorkout.cardio))) throw new Error('Invalid draft structure');
                        renderCurrentWorkout();
                    } catch (e) { console.warn('Ошибка загрузки черновика:', e); localStorage.removeItem('fitTrack_workout_draft'); resetWorkoutUI(); }
                } else { resetWorkoutUI(); }
            }
        }
    } catch (e) { console.error(`Ошибка при переключении на страницу ${pageId}:`, e); }
    document.getElementById('side-menu').classList.remove('open');
}
function resetWorkoutUI() {
    const c = document.getElementById('workout-exercises'); const cc = document.getElementById('cardio-exercises'); const i = document.getElementById('active-workout-info');
    if (c) c.innerHTML = '<p class="text-sm">Добавьте упражнения</p>'; if (cc) cc.innerHTML = ''; if (i) i.style.display = 'none';
}

// ==================== Статистика и 1ПМ ====================
function calculateEstimated1RM(weight, reps) { if (!weight || !reps || weight <= 0 || reps <= 0) return 0; if (reps === 1) return weight; return weight / (1.0278 - 0.0278 * reps); }
function getExerciseHistoryStats(exerciseName) {
    let maxWeight = 0, totalWeight = 0, totalSets = 0, tonnages = [], bestEstimated1RM = 0;
    workouts.forEach(w => (w.exercises || []).forEach(ex => { if (ex.name !== exerciseName) return; let t = 0; (ex.sets || []).forEach(s => { const wg = parseFloat(s.weight) || 0; const rp = parseFloat(s.reps) || 0; if (wg > 0 && rp > 0) { if (wg > maxWeight) maxWeight = wg; totalWeight += wg; totalSets++; t += wg * rp; const e = calculateEstimated1RM(wg, rp); if (e > bestEstimated1RM) bestEstimated1RM = e; } }); if (t > 0) tonnages.push(t); }));
    return { maxWeight, avgWeight: totalSets > 0 ? totalWeight / totalSets : 0, avgTonnage: tonnages.length > 0 ? tonnages.reduce((a,b)=>a+b,0)/tonnages.length : 0, bestEstimated1RM };
}
function getExerciseCurrentStats(exercise) { let t = 0, best = 0; (exercise.sets || []).forEach(s => { const w = parseFloat(s.weight)||0, r = parseFloat(s.reps)||0; if(w>0&&r>0){t+=w*r; const e=calculateEstimated1RM(w,r); if(e>best)best=e;} }); return { tonnage: t, bestEstimated1RM: best }; }
function getDisplay1RM(exerciseName, currentStats) {
    const h = getExerciseHistoryStats(exerciseName); const real = oneRepMaxes[exerciseName]?.value || 0; const best = Math.max(h.bestEstimated1RM, currentStats?.bestEstimated1RM || 0);
    if (real > 0) return { value: real, source: 'real', outdated: best > real * 1.02 };
    return { value: best > 0 ? best : 0, source: 'estimated', outdated: false };
}
function formatNumber(num) { return (!num) ? '0' : num.toLocaleString('ru-RU', { maximumFractionDigits: 1 }); }
function refreshExerciseCardStats(exIndex) {
    if (!currentWorkout || !currentWorkout.exercises[exIndex]) return;
    const card = document.getElementById(`exercise-card-${exIndex}`); if (!card) return;
    const ex = currentWorkout.exercises[exIndex]; const h = getExerciseHistoryStats(ex.name); const c = getExerciseCurrentStats(ex); const d = getDisplay1RM(ex.name, c);
    const stats = card.querySelector('.exercise-stats'); if (!stats) return;
    stats.innerHTML = `<div class="stat-item"><span class="stat-label">рекорд</span><span class="stat-value">${formatNumber(h.maxWeight)} кг</span></div><div class="stat-item"><span class="stat-label">Ср. вес</span><span class="stat-value">${formatNumber(h.avgWeight)} кг</span></div><div class="stat-item"><span class="stat-label">1ПМ</span><span class="stat-value">${formatNumber(d.value)} кг <span class="badge ${d.source==='real'?'badge-real':'badge-estimated'}">${d.source==='real'?'реальный':'расчётный'}</span>${d.outdated?' <span class="badge badge-warning">реальный устарел</span>':''}</span></div><div class="stat-item"><span class="stat-label">Тоннаж</span><span class="stat-value">${formatNumber(c.tonnage)} кг</span></div><div class="stat-item"><span class="stat-label">Ср. тоннаж</span><span class="stat-value">${formatNumber(h.avgTonnage)} кг</span></div>`;
}

// ==================== Тренировка ====================
function getAllExercises() { return [...DEFAULT_EXERCISES, ...customExercises]; }
function populateExerciseSelect() {
    const select = document.getElementById('exercise-select'); select.innerHTML = '<option value="">-- Выберите упражнение --</option>';
    const exercises = getAllExercises(); const categories = [...new Set(exercises.map(e => e.category))];
    categories.forEach(cat => { const group = document.createElement('optgroup'); group.label = cat; exercises.filter(e => e.category === cat).forEach(ex => { const opt = document.createElement('option'); opt.value = ex.name; opt.textContent = ex.name; group.appendChild(opt); }); select.appendChild(group); });
    const cardioGroup = document.createElement('optgroup'); cardioGroup.label = 'Кардио'; CARDIO_EXERCISES.forEach(cardio => { const opt = document.createElement('option'); opt.value = `cardio:${cardio}`; opt.textContent = cardio; cardioGroup.appendChild(opt); }); select.appendChild(cardioGroup);
}
function addExerciseToWorkout() {
    const val = document.getElementById('exercise-select').value; if (!val) return;
    if (!currentWorkout) currentWorkout = { id: Date.now(), date: new Date().toISOString(), exercises: [], cardio: [] };
    if (val.startsWith('cardio:')) currentWorkout.cardio.unshift({ name: val.substring(7), distance: 0, duration: 0 });
    else { const ex = getAllExercises().find(e => e.name === val); currentWorkout.exercises.unshift({ name: val, category: ex?.category || 'Другое', sets: [{ weight: 0, reps: 0 }] }); }
    renderCurrentWorkout(); document.getElementById('exercise-select').value = ''; saveWorkoutDraft();
}
function renderCurrentWorkout() {
    const container = document.getElementById('workout-exercises'); const cardioContainer = document.getElementById('cardio-exercises'); const infoDiv = document.getElementById('active-workout-info');
    const exLen = (currentWorkout?.exercises || []).length; const cardLen = (currentWorkout?.cardio || []).length;
    if (!currentWorkout || (exLen === 0 && cardLen === 0)) { resetWorkoutUI(); return; }
    infoDiv.style.display = 'block'; infoDiv.innerHTML = `Тренировка от ${new Date(currentWorkout.date).toLocaleDateString()}`; container.innerHTML = '';
    currentWorkout.exercises.forEach((ex, exIndex) => {
        const card = document.createElement('div'); card.className = 'exercise-card'; card.id = `exercise-card-${exIndex}`;
        const h = getExerciseHistoryStats(ex.name); const c = getExerciseCurrentStats(ex); const d = getDisplay1RM(ex.name, c);
        card.innerHTML = `<div class="exercise-header"><span class="exercise-name">${ex.name}</span><div class="exercise-actions"><button class="icon-btn remove-exercise" data-index="${exIndex}"><i class="fas fa-trash"></i></button></div></div><div class="exercise-stats"><div class="stat-item"><span class="stat-label">рекорд</span><span class="stat-value">${formatNumber(h.maxWeight)} кг</span></div><div class="stat-item"><span class="stat-label">Ср. вес</span><span class="stat-value">${formatNumber(h.avgWeight)} кг</span></div><div class="stat-item"><span class="stat-label">1ПМ</span><span class="stat-value">${formatNumber(d.value)} кг <span class="badge ${d.source==='real'?'badge-real':'badge-estimated'}">${d.source==='real'?'реальный':'расчётный'}</span>${d.outdated?' <span class="badge badge-warning">реальный устарел</span>':''}</span></div><div class="stat-item"><span class="stat-label">Тоннаж</span><span class="stat-value">${formatNumber(c.tonnage)} кг</span></div><div class="stat-item"><span class="stat-label">Ср. тоннаж</span><span class="stat-value">${formatNumber(h.avgTonnage)} кг</span></div></div><table class="sets-table"><thead><tr><th>Подход</th><th>Вес (кг)</th><th>Повторы</th><th></th></tr></thead><tbody id="sets-${exIndex}"></tbody></table><button class="add-set-btn" data-exercise="${exIndex}">+ Добавить подход</button>`;
        container.appendChild(card);
        const tbody = card.querySelector(`#sets-${exIndex}`);
        ex.sets.forEach((set, setIndex) => {
            const row = document.createElement('tr'); row.innerHTML = `<td>${setIndex + 1}</td><td><input type="number" class="set-input" value="${set.weight}" data-ex="${exIndex}" data-set="${setIndex}" data-field="weight"></td><td><input type="number" class="set-input" value="${set.reps}" data-ex="${exIndex}" data-set="${setIndex}" data-field="reps"></td><td><button class="icon-btn remove-set" data-ex="${exIndex}" data-set="${setIndex}"><i class="fas fa-times"></i></button></td>`; tbody.appendChild(row);
        });
        card.querySelector('.add-set-btn').addEventListener('click', () => { currentWorkout.exercises[exIndex].sets.push({ weight: 0, reps: 0 }); renderCurrentWorkout(); saveWorkoutDraft(); });
        card.querySelector('.remove-exercise').addEventListener('click', () => { currentWorkout.exercises.splice(exIndex, 1); renderCurrentWorkout(); saveWorkoutDraft(); });
        card.querySelectorAll('.set-input').forEach(inp => {
            inp.addEventListener('change', (e) => { const f = e.target.dataset.field; const si = parseInt(e.target.dataset.set); const v = parseFloat(e.target.value) || 0; currentWorkout.exercises[exIndex].sets[si][f] = v; saveWorkoutDraft(); refreshExerciseCardStats(exIndex); });
            inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const next = inp.closest('tr').querySelector('input:last-of-type'); if (next && next !== inp) next.focus(); else { const nr = inp.closest('tr').nextElementSibling; nr?.querySelector('input')?.focus(); } } });
        });
        card.querySelectorAll('.remove-set').forEach(btn => {
            btn.addEventListener('click', (e) => { const si = parseInt(e.target.closest('button').dataset.set); currentWorkout.exercises[exIndex].sets.splice(si, 1); if (currentWorkout.exercises[exIndex].sets.length === 0) currentWorkout.exercises[exIndex].sets.push({ weight: 0, reps: 0 }); renderCurrentWorkout(); saveWorkoutDraft(); });
        });
    });
    cardioContainer.innerHTML = ''; (currentWorkout.cardio || []).forEach((c, idx) => {
        const card = document.createElement('div'); card.className = 'cardio-card';
        card.innerHTML = `<div class="exercise-header"><span class="exercise-name">${c.name}</span><button class="icon-btn remove-cardio" data-index="${idx}"><i class="fas fa-trash"></i></button></div><div style="display:flex;gap:12px;"><div><label>Дистанция (км)</label><input type="number" class="form-input cardio-distance" data-index="${idx}" value="${c.distance}"></div><div><label>Время (мин)</label><input type="number" class="form-input cardio-duration" data-index="${idx}" value="${c.duration}"></div></div>`; cardioContainer.appendChild(card);
        card.querySelector('.remove-cardio').addEventListener('click', () => { currentWorkout.cardio.splice(idx, 1); renderCurrentWorkout(); saveWorkoutDraft(); });
        card.querySelector('.cardio-distance').addEventListener('change', (e) => { currentWorkout.cardio[idx].distance = parseFloat(e.target.value) || 0; saveWorkoutDraft(); });
        card.querySelector('.cardio-duration').addEventListener('change', (e) => { currentWorkout.cardio[idx].duration = parseFloat(e.target.value) || 0; saveWorkoutDraft(); });
    });
}
function finishWorkout() {
    const exL = (currentWorkout?.exercises || []).length; const cardL = (currentWorkout?.cardio || []).length;
    if (!currentWorkout || (exL === 0 && cardL === 0)) { showToast('Добавьте хотя бы одно упражнение', 'error'); return; }
    if (currentWorkout.isEditing && currentWorkout.originalId) { const i = workouts.findIndex(w => w.id === currentWorkout.originalId); if (i !== -1) { const { isEditing, originalId, ...rest } = currentWorkout; workouts[i] = { ...rest, id: currentWorkout.originalId, date: currentWorkout.date, updatedAt: Date.now() }; } saveWorkouts(); showToast('Тренировка обновлена!', 'success'); }
    else { const { isEditing, originalId, ...rest } = currentWorkout; workouts.push({ ...rest, id: Date.now(), updatedAt: Date.now() }); saveWorkouts(); showToast('Тренировка сохранена!', 'success'); }
    currentWorkout = null; document.getElementById('finish-workout-btn').textContent = 'Завершить'; delete document.getElementById('finish-workout-btn').dataset.editing; localStorage.removeItem('fitTrack_workout_draft'); resetWorkoutUI(); switchPage('history');
}
function copyLastWorkout() { let src = null; if (currentWorkout && ((currentWorkout.exercises||[]).length>0||(currentWorkout.cardio||[]).length>0)) src=currentWorkout; else if(workouts.length>0) src=workouts[workouts.length-1]; if(!src){showToast('Нет сохранённых тренировок','warning');return;} currentWorkout=normalizeWorkout({id:Date.now(),date:new Date().toISOString(),exercises:JSON.parse(JSON.stringify(src.exercises||[])),cardio:JSON.parse(JSON.stringify(src.cardio||[]))}); renderCurrentWorkout(); showToast('Тренировка скопирована','success'); }

// ==================== История ====================
function renderHistory() {
    const container = document.getElementById('history-list'); if (workouts.length === 0) { container.innerHTML = '<p>Нет сохранённых тренировок</p>'; return; }
    const search = document.getElementById('history-search')?.value.toLowerCase() || ''; const sort = document.getElementById('history-sort')?.value || 'date-desc';
    let filtered = [...workouts];
    if (search) filtered = filtered.filter(w => new Date(w.date).toLocaleString().toLowerCase().includes(search) || (w.exercises||[]).map(e=>e.name).join(' ').toLowerCase().includes(search));
    filtered.sort((a,b) => { if(sort==='date-desc')return new Date(b.date)-new Date(a.date); if(sort==='date-asc')return new Date(a.date)-new Date(b.date); if(sort==='exercises-desc')return (b.exercises?.length||0)-(a.exercises?.length||0); if(sort==='exercises-asc')return (a.exercises?.length||0)-(b.exercises?.length||0); return 0; });
    container.innerHTML = '';
    filtered.forEach(w => {
        const div = document.createElement('div'); div.className = 'history-item';
        div.innerHTML = `<div class="history-header"><span class="history-date">${new Date(w.date).toLocaleString()}</span><span class="history-exercises">${(w.exercises||[]).length} упр. + ${(w.cardio||[]).length} кардио</span><div style="display:flex;gap:4px;margin-left:auto;"><button class="icon-btn edit-workout" data-id="${w.id}"><i class="fas fa-edit"></i></button><button class="icon-btn delete-workout" data-id="${w.id}"><i class="fas fa-trash"></i></button></div></div><button class="secondary-btn copy-workout" data-id="${w.id}">Повторить</button>`;
        container.appendChild(div);
        div.querySelector('.copy-workout').addEventListener('click', () => { const orig = workouts.find(wk => wk.id === w.id); currentWorkout = normalizeWorkout({ id: Date.now(), date: new Date().toISOString(), exercises: JSON.parse(JSON.stringify(orig.exercises||[])), cardio: JSON.parse(JSON.stringify(orig.cardio||[])) }); switchPage('workout'); showToast('Тренировка скопирована', 'success'); });
        div.querySelector('.delete-workout').addEventListener('click', (e) => { e.stopPropagation(); const wd = workouts.find(wk => wk.id === w.id); const undo = () => { if(wd){workouts.push(wd);deletedWorkoutIds=deletedWorkoutIds.filter(id=>id!==w.id);saveWorkouts();renderHistory();showToast('Удаление отменено','success');}}; workouts=workouts.filter(wk=>wk.id!==w.id);deletedWorkoutIds.push(w.id);deletedWorkoutIds=[...new Set(deletedWorkoutIds)];saveWorkouts();renderHistory();showToast('Тренировка удалена','warning',{text:'Отмена',handler:undo}); });
        div.querySelector('.edit-workout').addEventListener('click', (e) => { e.stopPropagation(); const we = workouts.find(wk => wk.id === w.id); if(we){currentWorkout=normalizeWorkout({...we,isEditing:true,originalId:w.id});switchPage('workout');const f=document.getElementById('finish-workout-btn');f.textContent='Сохранить изменения';f.dataset.editing='true';showToast('Режим редактирования','info');} });
    });
}

// ==================== Замеры ====================
function renderMeasurements() {
    const container = document.getElementById('measurements-list'); if (measurements.length === 0) { container.innerHTML = '<p>Нет сохранённых замеров</p>'; return; }
    container.innerHTML = ''; [...measurements].sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach(m => {
        const div = document.createElement('div'); div.className = 'measurement-card';
        let v = ''; MEASUREMENT_TYPES.forEach(t => { if(m[t.id]!==undefined) v+=`<div><strong>${t.name}:</strong> ${m[t.id]}</div>`; });
        div.innerHTML = `<div class="history-header"><span class="history-date">${new Date(m.date).toLocaleDateString()}</span><button class="icon-btn delete-measurement" data-id="${m.id}"><i class="fas fa-trash"></i></button></div><div>${v}</div>`; container.appendChild(div);
        div.querySelector('.delete-measurement').addEventListener('click', () => { const md = measurements.find(ms => ms.id === m.id); const undo = () => { if(md){measurements.push(md);deletedMeasurementIds=deletedMeasurementIds.filter(id=>id!==m.id);saveMeasurements();renderMeasurements();showToast('Замер восстановлен','success');}}; measurements=measurements.filter(ms=>ms.id!==m.id);deletedMeasurementIds.push(m.id);deletedMeasurementIds=[...new Set(deletedMeasurementIds)];saveMeasurements();renderMeasurements();showToast('Замер удалён','warning',{text:'Отмена',handler:undo}); });
    });
}
function showMeasurementForm() { const f = document.getElementById('measurement-form'); const fd = document.getElementById('measurement-fields'); fd.innerHTML = ''; MEASUREMENT_TYPES.forEach(t => { fd.innerHTML += `<div style="margin-bottom:12px;"><label>${t.name}</label><input type="number" step="0.1" class="form-input measurement-input" data-type="${t.id}" placeholder="0.0"></div>`; }); document.getElementById('measurement-date').value = new Date().toISOString().split('T')[0]; f.style.display = 'flex'; }
function hideMeasurementForm() { document.getElementById('measurement-form').style.display = 'none'; }
function saveMeasurement() { const date = document.getElementById('measurement-date').value; if(!date){showToast('Укажите дату','error');return;} const m={id:Date.now(),date}; document.querySelectorAll('.measurement-input').forEach(i=>{const v=parseFloat(i.value);if(!isNaN(v)&&v>0)m[i.dataset.type]=v;}); if(Object.keys(m).length<=2){showToast('Введите хотя бы одно значение','warning');return;} m.updatedAt=Date.now(); measurements.push(m); saveMeasurements(); hideMeasurementForm(); renderMeasurements(); showToast('Замер сохранён','success'); }

// ==================== Прогресс ====================
function populateProgressSelects() {
    const ms = document.getElementById('measurement-type-select'); ms.innerHTML = ''; MEASUREMENT_TYPES.forEach(t => { const o=document.createElement('option');o.value=t.id;o.textContent=t.name;ms.appendChild(o); });
    const es = document.getElementById('exercise-progress-select'); es.innerHTML = ''; [...new Set(getAllExercises().map(e=>e.name))].forEach(n => { const o=document.createElement('option');o.value=n;o.textContent=n;es.appendChild(o); });
}
function updateProgressChart() {
    const type = document.getElementById('progress-type-select').value; const ms = document.getElementById('measurement-type-select'); const es = document.getElementById('exercise-progress-select');
    ms.style.display = type === 'measurement' ? 'block' : 'none'; es.style.display = type === 'exercise' ? 'block' : 'none';
    let labels=[], data=[], label=''; let exerciseData=[];
    if(type==='weight'){const f=measurements.filter(m=>m.weight).sort((a,b)=>new Date(a.date)-new Date(b.date));labels=f.map(m=>new Date(m.date).toLocaleDateString());data=f.map(m=>m.weight);label='Вес (кг)';}
    else if(type==='measurement'){const mt=ms.value;const f=measurements.filter(m=>m[mt]).sort((a,b)=>new Date(a.date)-new Date(b.date));labels=f.map(m=>new Date(m.date).toLocaleDateString());data=f.map(m=>m[mt]);label=MEASUREMENT_TYPES.find(t=>t.id===mt)?.name||mt;}
    else if(type==='exercise'){const en=es.value;exerciseData=[];workouts.forEach(w=>{(w.exercises||[]).forEach(ex=>{if(ex.name===en){const vs=(ex.sets||[]).filter(s=>typeof s.weight==='number'&&!isNaN(s.weight)&&typeof s.reps==='number'&&!isNaN(s.reps));if(vs.length){exerciseData.push({date:w.date,weight:Math.max(...vs.map(s=>s.weight)),reps:Math.max(...vs.map(s=>s.reps))});}}});});exerciseData.sort((a,b)=>new Date(a.date)-new Date(b.date));labels=exerciseData.map(d=>new Date(d.date).toLocaleDateString());if(exerciseData.some(d=>d.weight>0)){data=exerciseData.map(d=>d.weight);label=`${en} (макс. вес, кг)`;}else{data=exerciseData.map(d=>d.reps);label=`${en} (макс. повторы)`;}}
    try{const ctx=document.getElementById('progress-chart').getContext('2d');if(chartInstance){chartInstance.destroy();chartInstance=null;}const ds=[{label,data,borderColor:'#2563eb',tension:0.1}];if(type==='exercise'&&exerciseData.length>0&&exerciseData.some(d=>d.weight>0))ds.push({label:'Макс. повторы',data:exerciseData.map(d=>d.reps),borderColor:'#16a34a',tension:0.1});chartInstance=new Chart(ctx,{type:'line',data:{labels,datasets:ds},options:{responsive:true,plugins:{legend:{display:true}}}});}catch(e){console.error('Ошибка отрисовки графика:',e);}
}
function saveWorkoutDraft() { if(currentWorkout) localStorage.setItem('fitTrack_workout_draft', JSON.stringify(currentWorkout)); else localStorage.removeItem('fitTrack_workout_draft'); }
function loadWorkoutDraft() { const d = localStorage.getItem('fitTrack_workout_draft'); if(d){try{currentWorkout=JSON.parse(d);if(!currentWorkout||(!Array.isArray(currentWorkout.exercises)&&!Array.isArray(currentWorkout.cardio)))throw new Error('Invalid draft');renderCurrentWorkout();showToast('Восстановлена несохранённая тренировка','info');}catch(e){console.warn('Ошибка загрузки черновика:',e);localStorage.removeItem('fitTrack_workout_draft');}} }

// ==================== Упражнения ====================
function renderExercisesList() {
    const container = document.getElementById('exercises-list'); const exercises = getAllExercises(); container.innerHTML = '';
    const categories = [...new Set(exercises.map(e=>e.category))];
    categories.forEach(cat => { const cd=document.createElement('div');cd.innerHTML=`<h3 style="margin:16px 0 8px;">${cat}</h3>`;container.appendChild(cd);exercises.filter(e=>e.category===cat).forEach(ex => {const isC=customExercises.some(c=>c.name===ex.name);const rm=oneRepMaxes[ex.name];const hint=rm?`1ПМ: ${formatNumber(rm.value)} кг (${rm.source==='real'?'реальный':'расчётный'})`:'1ПМ: не задан';const div=document.createElement('div');div.className='exercise-item';div.innerHTML=`<div style="display:flex;flex-direction:column;gap:2px;"><span>${ex.name}</span><span style="font-size:12px;color:#64748b;">${hint}</span></div><div style="display:flex;gap:4px;"><button class="icon-btn set-1rm-btn" title="Задать 1ПМ"><i class="fas fa-dumbbell"></i></button>${isC?'<button class="icon-btn edit-custom-exercise" title="Редактировать"><i class="fas fa-pen"></i></button>':''}${isC?'<button class="icon-btn delete-custom-exercise" title="Удалить"><i class="fas fa-trash"></i></button>':''}</div>`;container.appendChild(div);div.querySelector('.set-1rm-btn').addEventListener('click',()=>setOneRepMaxPrompt(ex.name));if(isC){div.querySelector('.edit-custom-exercise').addEventListener('click',()=>editCustomExercise(ex.name,ex.category));div.querySelector('.delete-custom-exercise').addEventListener('click',()=>{customExercises=customExercises.filter(c=>c.name!==ex.name);deletedCustomExerciseNames.push(ex.name);deletedCustomExerciseNames=[...new Set(deletedCustomExerciseNames)];saveCustomExercises();populateExerciseSelect();renderExercisesList();});}});});
}
function setOneRepMaxPrompt(exName) { const cur=oneRepMaxes[exName]; const inp=prompt(`Укажите реальный 1ПМ для "${exName}" (кг):`, cur?.value||''); if(inp===null)return; const v=parseFloat(inp); if(isNaN(v)||v<=0){if(cur){delete oneRepMaxes[exName];saveLocalData();saveDataToCloud();renderExercisesList();showToast('1ПМ удалён','info');}return;} oneRepMaxes[exName]={value:v,source:'real',updatedAt:Date.now()};saveLocalData();saveDataToCloud();renderExercisesList();if(document.querySelector('.side-menu li.active')?.dataset?.page==='workout')renderCurrentWorkout();showToast(`1ПМ сохранён: ${v} кг`,'success'); }
function editCustomExercise(oldName, oldCategory) {
    const newName=prompt('Новое название:', oldName); if(newName===null)return; const tn=newName.trim(); if(!tn){showToast('Название не может быть пустым','error');return;}
    const newCat=prompt('Новая группа мышц:', oldCategory); if(newCat===null)return; const tc=newCat.trim(); if(!tc){showToast('Группа не может быть пустой','error');return;}
    if(tn.toLowerCase()!==oldName.toLowerCase()&&getAllExercises().some(e=>e.name.toLowerCase()===tn.toLowerCase())){showToast('Такое упражнение уже существует','warning');return;}
    const idx=customExercises.findIndex(c=>c.name===oldName); if(idx!==-1)customExercises[idx]={name:tn,category:tc,updatedAt:Date.now()};
    let renamed=false; workouts.forEach(w=>{(w.exercises||[]).forEach(ex=>{if(ex.name===oldName){ex.name=tn;ex.category=tc;renamed=true;w.updatedAt=Date.now();}});});
    if(oldName!==tn&&oneRepMaxes[oldName]){oneRepMaxes[tn]=oneRepMaxes[oldName];delete oneRepMaxes[oldName];}
    if(currentWorkout)(currentWorkout.exercises||[]).forEach(ex=>{if(ex.name===oldName){ex.name=tn;ex.category=tc;}});
    if(renamed)saveWorkouts(); else saveDataToCloud(); populateExerciseSelect(); renderExercisesList(); if(document.querySelector('.side-menu li.active')?.dataset?.page==='workout')renderCurrentWorkout(); showToast('Упражнение обновлено','success');
}
function addCustomExercise() { const n=prompt('Название упражнения:'); if(!n)return; const tn=n.trim(); if(!tn)return; const c=prompt('Группа мышц (например, Грудь, Спина, Ноги):'); if(!c)return; const tc=c.trim(); if(!tc)return; if(getAllExercises().some(e=>e.name.toLowerCase()===tn.toLowerCase())){showToast('Такое упражнение уже есть','warning');return;} deletedCustomExerciseNames=deletedCustomExerciseNames.filter(x=>x!==tn); customExercises.push({name:tn,category:tc,updatedAt:Date.now()}); saveCustomExercises(); populateExerciseSelect(); renderExercisesList(); showToast('Упражнение добавлено','success'); }