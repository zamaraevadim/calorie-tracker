// ==================== Конфигурация ====================
const API_BASE = 'https://world.openfoodfacts.org';
const SEARCH_DELAY_MS = 6000; // 6 секунд между поисковыми запросами
const USE_CORS_PROXY = false; // Можно включить прокси если CORS всё ещё блокируется

const STORAGE_KEYS = {
    USER_SETTINGS: 'nutritrack_settings',
    FOOD_DIARY: 'nutritrack_foodDiary',
    LOCAL_PRODUCTS: 'nutritrack_localProducts',
    WEIGHT_HISTORY: 'nutritrack_weightHistory'
};

const DEFAULT_SETTINGS = {
    dailyGoals: {
        calories: 2200,
        protein: 150,
        fat: 70,
        carbs: 250
    }
};

const MEAL_TYPES = {
    breakfast: 'Завтрак',
    lunch: 'Обед',
    dinner: 'Ужин',
    snack: 'Перекус'
};

// ==================== Глобальные переменные ====================
let db;
let currentViewDate = new Date().toISOString().split('T')[0];
let chartInstance = null;
let lastSearchTime = 0;
let selectedProduct = null;
let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
let foodDiary = [];
let localProducts = [];
let weightHistory = [];

// ==================== Инициализация IndexedDB через Dexie ====================
async function initDB() {
    db = new Dexie('NutriTrackDB');
    db.version(1).stores({
        products: '++id, name, brand, barcode, source, openfoodfactsId'
    });
    await db.open();
}

// ==================== Toast уведомления ====================
function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==================== Загрузка/Сохранение данных ====================
function loadLocalData() {
    const savedSettings = localStorage.getItem(STORAGE_KEYS.USER_SETTINGS);
    if (savedSettings) settings = JSON.parse(savedSettings);
    
    foodDiary = JSON.parse(localStorage.getItem(STORAGE_KEYS.FOOD_DIARY) || '[]');
    localProducts = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_PRODUCTS) || '[]');
    weightHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.WEIGHT_HISTORY) || '[]');
}

function saveLocalData() {
    localStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(settings));
    localStorage.setItem(STORAGE_KEYS.FOOD_DIARY, JSON.stringify(foodDiary));
    localStorage.setItem(STORAGE_KEYS.LOCAL_PRODUCTS, JSON.stringify(localProducts));
    localStorage.setItem(STORAGE_KEYS.WEIGHT_HISTORY, JSON.stringify(weightHistory));
}

// ==================== Утилиты ====================
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getDayName(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (dateStr === today.toISOString().split('T')[0]) return 'Сегодня';
    if (dateStr === yesterday.toISOString().split('T')[0]) return 'Вчера';
    
    return date.toLocaleDateString('ru-RU', { weekday: 'long' });
}

function roundTo(num, decimals = 1) {
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

// ==================== Расчёт КБЖУ для порции ====================
function calculatePortionNutrients(product, grams) {
    const factor = grams / 100;
    return {
        calories: roundTo((product.caloriesPer100g || 0) * factor),
        protein: roundTo((product.proteinPer100g || 0) * factor),
        fat: roundTo((product.fatPer100g || 0) * factor),
        carbs: roundTo((product.carbsPer100g || 0) * factor)
    };
}

// ==================== Поиск продуктов ====================
async function searchProducts(query) {
    const now = Date.now();
    if (now - lastSearchTime < SEARCH_DELAY_MS) {
        const waitTime = Math.ceil((SEARCH_DELAY_MS - (now - lastSearchTime)) / 1000);
        showToast(`Подождите ${waitTime} сек перед следующим поиском`, 'warning');
        return [];
    }
    
    lastSearchTime = now;
    
    // Сначала ищем локально
    const localResults = localProducts.filter(p => 
        p.name.toLowerCase().includes(query.toLowerCase())
    ).map(p => ({ ...p, source: 'local' }));
    
    // Затем ищем в API (используем v1 search.pl для полнотекстового поиска)
    try {
        const url = `${API_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page=1&page_size=20`;
        
        // Пробуем прямой запрос, если не работает - используем CORS-прокси
        let response;
        try {
            response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'NutriTrack/1.0 (contact@nutritrack.app)'
                },
                mode: 'cors'
            });
        } catch (corsError) {
            // Если CORS ошибка, используем прокси
            console.log('CORS error detected, using proxy...');
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
            response = await fetch(proxyUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Proxy HTTP error! status: ${response.status}`);
            }
            
            const proxyData = await response.json();
            // allorigins возвращает содержимое в поле contents как строку
            const data = JSON.parse(proxyData.contents || '{}');
            return processApiResults(data, localResults);
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return processApiResults(data, localResults);
    } catch (error) {
        console.error('Search error:', error);
        showToast('Ошибка поиска. Проверьте интернет.', 'error');
        return localResults;
    }
}

// ==================== Обработка результатов API ====================
function processApiResults(data, localResults) {
    const apiResults = (data.products || []).map(p => ({
        id: `off_${p.code}`,
        name: p.product_name || 'Без названия',
        brand: p.brands || '',
        caloriesPer100g: Math.round(p.nutriments?.['energy-kcal_100g'] || 0),
        proteinPer100g: Math.round((p.nutriments?.proteins_100g || 0) * 10) / 10,
        fatPer100g: Math.round((p.nutriments?.fat_100g || 0) * 10) / 10,
        carbsPer100g: Math.round((p.nutriments?.carbohydrates_100g || 0) * 10) / 10,
        barcode: p.code || '',
        source: 'openfoodfacts',
        openfoodfactsId: p.code
    })).filter(p => p.caloriesPer100g > 0);
    
    // Сохраняем новые продукты в кэш
    for (const product of apiResults) {
        const exists = localProducts.some(p => p.barcode === product.barcode);
        if (!exists) {
            localProducts.push(product);
            if (db) db.products.put(product);
        }
    }
    saveLocalData();
    
    // Объединяем результаты: сначала локальные, потом из API
    return [...localResults, ...apiResults.filter(p => !localResults.some(l => l.barcode === p.barcode))];
}

// ==================== Дневник питания ====================
function getDailyLog(date) {
    return foodDiary.find(log => log.date === date) || { date, meals: [] };
}

function saveDailyLog(log) {
    const index = foodDiary.findIndex(l => l.date === log.date);
    if (index >= 0) {
        foodDiary[index] = log;
    } else {
        foodDiary.push(log);
    }
    saveLocalData();
}

function addMealEntry(date, mealType, product, grams) {
    const nutrients = calculatePortionNutrients(product, grams);
    const log = getDailyLog(date);
    
    log.meals.push({
        type: mealType,
        productId: product.id,
        productName: `${product.name}${product.brand ? ' (' + product.brand + ')' : ''}`,
        grams,
        ...nutrients
    });
    
    saveDailyLog(log);
    showToast('Продукт добавлен', 'success');
}

function removeMealEntry(date, mealIndex) {
    const log = getDailyLog(date);
    log.meals.splice(mealIndex, 1);
    saveDailyLog(log);
    showToast('Запись удалена', 'success');
}

function calculateDailyTotals(date) {
    const log = getDailyLog(date);
    return log.meals.reduce((acc, meal) => ({
        calories: acc.calories + meal.calories,
        protein: acc.protein + meal.protein,
        fat: acc.fat + meal.fat,
        carbs: acc.carbs + meal.carbs
    }), { calories: 0, protein: 0, fat: 0, carbs: 0 });
}

// ==================== Отрисовка интерфейса ====================
function updateDateDisplay() {
    document.getElementById('current-date-display').textContent = 
        `${getDayName(currentViewDate)}, ${formatDate(currentViewDate)}`;
}

function renderDiary() {
    updateDateDisplay();
    
    const totals = calculateDailyTotals(currentViewDate);
    const goals = settings.dailyGoals;
    
    // Круговой прогресс калорий
    const caloriesPercent = Math.min((totals.calories / goals.calories) * 100, 100);
    const circumference = 2 * Math.PI * 52;
    const offset = circumference - (caloriesPercent / 100) * circumference;
    const progressCircle = document.getElementById('calories-progress');
    progressCircle.style.strokeDasharray = circumference;
    progressCircle.style.strokeDashoffset = offset;
    
    // Цвет прогресса
    let color = '#2563eb';
    if (caloriesPercent >= 110) color = '#b91c1c';
    else if (caloriesPercent >= 90) color = '#15803d';
    else if (caloriesPercent >= 50) color = '#f59e0b';
    progressCircle.style.stroke = color;
    
    document.getElementById('calories-consumed').textContent = Math.round(totals.calories);
    document.getElementById('calories-goal').textContent = goals.calories;
    
    // Макронутриенты
    document.getElementById('protein-consumed').textContent = roundTo(totals.protein);
    document.getElementById('protein-goal').textContent = goals.protein;
    document.getElementById('protein-bar').style.width = `${Math.min((totals.protein / goals.protein) * 100, 100)}%`;
    
    document.getElementById('fat-consumed').textContent = roundTo(totals.fat);
    document.getElementById('fat-goal').textContent = goals.fat;
    document.getElementById('fat-bar').style.width = `${Math.min((totals.fat / goals.fat) * 100, 100)}%`;
    
    document.getElementById('carbs-consumed').textContent = roundTo(totals.carbs);
    document.getElementById('carbs-goal').textContent = goals.carbs;
    document.getElementById('carbs-bar').style.width = `${Math.min((totals.carbs / goals.carbs) * 100, 100)}%`;
    
    // Приёмы пищи
    const log = getDailyLog(currentViewDate);
    const mealsList = document.getElementById('meals-list');
    
    if (log.meals.length === 0) {
        mealsList.innerHTML = '<p class="empty-message">Нет записей за этот день</p>';
        return;
    }
    
    // Группируем по типам приёмов пищи
    const grouped = {};
    for (const meal of log.meals) {
        if (!grouped[meal.type]) grouped[meal.type] = [];
        grouped[meal.type].push(meal);
    }
    
    mealsList.innerHTML = '';
    for (const [type, meals] of Object.entries(grouped)) {
        const mealSection = document.createElement('div');
        mealSection.className = 'meal-section';
        
        const mealHeader = document.createElement('div');
        mealHeader.className = 'meal-header';
        mealHeader.innerHTML = `<h4>${MEAL_TYPES[type]}</h4>`;
        mealSection.appendChild(mealHeader);
        
        for (const meal of meals) {
            const mealCard = document.createElement('div');
            mealCard.className = 'meal-card';
            mealCard.innerHTML = `
                <div class="meal-info">
                    <div class="meal-name">${meal.productName}</div>
                    <div class="meal-weight">${meal.grams} г</div>
                </div>
                <div class="meal-nutrients">
                    <span>${Math.round(meal.calories)} ккал</span>
                    <span>Б: ${roundTo(meal.protein)}г</span>
                    <span>Ж: ${roundTo(meal.fat)}г</span>
                    <span>У: ${roundTo(meal.carbs)}г</span>
                </div>
                <button class="delete-meal-btn" data-index="${log.meals.indexOf(meal)}"><i class="fas fa-trash"></i></button>
            `;
            
            mealCard.querySelector('.delete-meal-btn').addEventListener('click', () => {
                removeMealEntry(currentViewDate, log.meals.indexOf(meal));
                renderDiary();
            });
            
            mealsList.appendChild(mealCard);
        }
    }
}

// ==================== Поиск продуктов UI ====================
async function handleSearch() {
    const query = document.getElementById('product-search-input').value.trim();
    if (!query) {
        showToast('Введите название продукта', 'warning');
        return;
    }
    
    document.getElementById('search-loading').style.display = 'flex';
    document.getElementById('search-results').innerHTML = '';
    
    const results = await searchProducts(query);
    
    document.getElementById('search-loading').style.display = 'none';
    
    if (results.length === 0) {
        document.getElementById('search-results').innerHTML = 
            '<p class="empty-message">Продукты не найдены</p>';
        return;
    }
    
    const resultsContainer = document.getElementById('search-results');
    for (const product of results) {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="product-info">
                <div class="product-name">${product.name}</div>
                ${product.brand ? `<div class="product-brand">${product.brand}</div>` : ''}
                <div class="product-calories">${Math.round(product.caloriesPer100g)} ккал / 100г</div>
                <div class="product-macros">
                    Б: ${roundTo(product.proteinPer100g)}г | Ж: ${roundTo(product.fatPer100g)}г | У: ${roundTo(product.carbsPer100g)}г
                </div>
                ${product.source === 'local' ? '<span class="badge-local">Локально</span>' : ''}
            </div>
            <button class="add-product-btn"><i class="fas fa-plus"></i></button>
        `;
        
        card.querySelector('.add-product-btn').addEventListener('click', () => {
            showAddProductModal(product);
        });
        
        resultsContainer.appendChild(card);
    }
}

// ==================== Модальные окна ====================
function showAddProductModal(product) {
    selectedProduct = product;
    
    document.getElementById('modal-product-info').innerHTML = `
        <strong>${product.name}</strong><br>
        ${product.brand ? product.brand + '<br>' : ''}
        <small>${Math.round(product.caloriesPer100g)} ккал, Б: ${roundTo(product.proteinPer100g)}г, 
        Ж: ${roundTo(product.fatPer100g)}г, У: ${roundTo(product.carbsPer100g)}г (на 100г)</small>
    `;
    
    document.getElementById('portion-grams').value = 100;
    updatePortionNutrients();
    
    document.getElementById('add-product-modal').style.display = 'flex';
}

function updatePortionNutrients() {
    if (!selectedProduct) return;
    
    const grams = parseInt(document.getElementById('portion-grams').value) || 0;
    const nutrients = calculatePortionNutrients(selectedProduct, grams);
    
    document.getElementById('portion-nutrients').innerHTML = `
        <strong>На порцию ${grams}г:</strong><br>
        ${Math.round(nutrients.calories)} ккал | 
        Б: ${roundTo(nutrients.protein)}г | 
        Ж: ${roundTo(nutrients.fat)}г | 
        У: ${roundTo(nutrients.carbs)}г
    `;
}

function hideAddProductModal() {
    document.getElementById('add-product-modal').style.display = 'none';
    selectedProduct = null;
}

function showAddMealModal() {
    document.getElementById('add-meal-modal').style.display = 'flex';
}

function hideAddMealModal() {
    document.getElementById('add-meal-modal').style.display = 'none';
}

function showCustomFoodModal() {
    hideAddMealModal();
    document.getElementById('custom-food-modal').style.display = 'flex';
}

function hideCustomFoodModal() {
    document.getElementById('custom-food-modal').style.display = 'none';
}

function showWeightModal() {
    hideAddMealModal();
    document.getElementById('weight-date').value = currentViewDate;
    document.getElementById('weight-value').value = '';
    document.getElementById('weight-modal').style.display = 'flex';
}

function hideWeightModal() {
    document.getElementById('weight-modal').style.display = 'none';
}

// ==================== Добавление своего продукта ====================
function saveCustomFood() {
    const name = document.getElementById('custom-name').value.trim();
    const brand = document.getElementById('custom-brand').value.trim();
    const calories = parseFloat(document.getElementById('custom-calories').value) || 0;
    const protein = parseFloat(document.getElementById('custom-protein').value) || 0;
    const fat = parseFloat(document.getElementById('custom-fat').value) || 0;
    const carbs = parseFloat(document.getElementById('custom-carbs').value) || 0;
    
    if (!name) {
        showToast('Введите название продукта', 'warning');
        return;
    }
    
    const product = {
        id: `custom_${Date.now()}`,
        name,
        brand: brand || 'Свой продукт',
        caloriesPer100g: calories,
        proteinPer100g: protein,
        fatPer100g: fat,
        carbsPer100g: carbs,
        barcode: '',
        source: 'custom'
    };
    
    localProducts.push(product);
    db.products.put(product);
    saveLocalData();
    
    hideCustomFoodModal();
    showAddProductModal(product);
    showToast('Продукт сохранён', 'success');
}

// ==================== Добавление веса ====================
function saveWeight() {
    const date = document.getElementById('weight-date').value;
    const weight = parseFloat(document.getElementById('weight-value').value);
    
    if (!weight || weight <= 0) {
        showToast('Введите корректный вес', 'warning');
        return;
    }
    
    // Удаляем существующую запись за эту дату
    weightHistory = weightHistory.filter(w => w.date !== date);
    weightHistory.push({ date, weight });
    weightHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    saveLocalData();
    hideWeightModal();
    showToast('Вес сохранён', 'success');
}

// ==================== Статистика ====================
function renderStats(period = 'week', metric = 'calories') {
    const ctx = document.getElementById('stats-chart');
    if (!ctx) return;
    
    if (chartInstance) {
        chartInstance.destroy();
    }
    
    // Определяем диапазон дат
    const endDate = new Date();
    const startDate = new Date();
    
    switch (period) {
        case 'week': startDate.setDate(endDate.getDate() - 7); break;
        case 'month': startDate.setDate(endDate.getDate() - 30); break;
        case 'year': startDate.setDate(endDate.getDate() - 365); break;
    }
    
    // Собираем данные
    const labels = [];
    const data = [];
    let sum = 0;
    let count = 0;
    
    const current = new Date(startDate);
    while (current <= endDate) {
        const dateStr = current.toISOString().split('T')[0];
        labels.push(current.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }));
        
        let value;
        if (metric === 'weight') {
            const weightEntry = weightHistory.find(w => w.date === dateStr);
            value = weightEntry ? weightEntry.weight : null;
        } else {
            const totals = calculateDailyTotals(dateStr);
            value = metric === 'calories' ? totals.calories :
                    metric === 'protein' ? totals.protein :
                    metric === 'fat' ? totals.fat :
                    metric === 'carbs' ? totals.carbs : 0;
        }
        
        if (value !== null && value !== undefined) {
            data.push(value);
            sum += value;
            count++;
        } else {
            data.push(null);
        }
        
        current.setDate(current.getDate() + 1);
    }
    
    // Среднее значение
    const avg = count > 0 ? roundTo(sum / count) : 0;
    document.getElementById('stats-average').textContent = 
        `Среднее за период: ${avg} ${metric === 'weight' ? 'кг' : metric === 'calories' ? 'ккал' : 'г'}`;
    
    // График
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: metric === 'calories' ? 'Калории' :
                       metric === 'weight' ? 'Вес (кг)' :
                       metric === 'protein' ? 'Белки (г)' :
                       metric === 'fat' ? 'Жиры (г)' : 'Углеводы (г)',
                data,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// ==================== Экспорт/Импорт ====================
function exportData() {
    const exportData = {
        version: 2,
        exportDate: new Date().toISOString(),
        user: {
            name: 'User',
            dailyGoals: settings.dailyGoals,
            weightHistory
        },
        localProducts,
        foodDiary
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nutritrack_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Данные экспортированы', 'success');
}

function importData(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            if (!data.version || !data.foodDiary) {
                throw new Error('Неверный формат файла');
            }
            
            if (!confirm('Импорт заменит все текущие данные. Продолжить?')) return;
            
            if (data.user?.dailyGoals) {
                settings.dailyGoals = data.user.dailyGoals;
            }
            
            weightHistory = data.user?.weightHistory || [];
            localProducts = data.localProducts || [];
            foodDiary = data.foodDiary || [];
            
            // Сохраняем продукты в IndexedDB
            for (const product of localProducts) {
                await db.products.put(product);
            }
            
            saveLocalData();
            
            showToast('Данные импортированы', 'success');
            renderDiary();
        } catch (error) {
            console.error('Import error:', error);
            showToast('Ошибка импорта: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
}

// ==================== Навигация ====================
function switchPage(pageId) {
    document.querySelectorAll('.content-page').forEach(page => {
        page.style.display = 'none';
        page.classList.remove('active');
    });
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const targetPage = document.getElementById(`${pageId}-page`);
    if (targetPage) {
        targetPage.style.display = 'block';
        targetPage.classList.add('active');
    }
    
    const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if (navItem) navItem.classList.add('active');
    
    // Обновляем контент страницы
    if (pageId === 'diary') {
        renderDiary();
    } else if (pageId === 'stats') {
        const activePeriod = document.querySelector('.stats-tab.active')?.dataset?.period || 'week';
        const activeMetric = document.querySelector('.metric-btn.active')?.dataset?.metric || 'calories';
        renderStats(activePeriod, activeMetric);
    }
}

// ==================== Event Listeners ====================
function setupEventListeners() {
    // Навигация
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            switchPage(item.dataset.page);
        });
    });
    
    // Переключение дат
    document.getElementById('prev-day-btn').addEventListener('click', () => {
        const date = new Date(currentViewDate);
        date.setDate(date.getDate() - 1);
        currentViewDate = date.toISOString().split('T')[0];
        renderDiary();
    });
    
    document.getElementById('next-day-btn').addEventListener('click', () => {
        const date = new Date(currentViewDate);
        date.setDate(date.getDate() + 1);
        currentViewDate = date.toISOString().split('T')[0];
        renderDiary();
    });
    
    // Поиск продуктов
    document.getElementById('search-btn').addEventListener('click', handleSearch);
    document.getElementById('product-search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
    
    // Добавление записи
    document.getElementById('add-meal-btn').addEventListener('click', showAddMealModal);
    document.getElementById('add-from-products-btn').addEventListener('click', () => {
        hideAddMealModal();
        switchPage('products');
    });
    document.getElementById('add-custom-food-btn').addEventListener('click', showCustomFoodModal);
    document.getElementById('add-weight-btn').addEventListener('click', showWeightModal);
    document.getElementById('cancel-add-meal-btn').addEventListener('click', hideAddMealModal);
    
    // Модальное окно добавления продукта
    document.getElementById('portion-grams').addEventListener('input', updatePortionNutrients);
    document.getElementById('cancel-add-product-btn').addEventListener('click', hideAddProductModal);
    document.getElementById('confirm-add-product-btn').addEventListener('click', () => {
        if (!selectedProduct) return;
        
        const grams = parseInt(document.getElementById('portion-grams').value) || 100;
        const mealType = document.getElementById('meal-type-select').value;
        
        addMealEntry(currentViewDate, mealType, selectedProduct, grams);
        hideAddProductModal();
        switchPage('diary');
    });
    
    // Свой продукт
    document.getElementById('cancel-custom-food-btn').addEventListener('click', hideCustomFoodModal);
    document.getElementById('save-custom-food-btn').addEventListener('click', saveCustomFood);
    
    // Вес
    document.getElementById('cancel-weight-btn').addEventListener('click', hideWeightModal);
    document.getElementById('save-weight-btn').addEventListener('click', saveWeight);
    
    // Настройки
    document.getElementById('settings-btn').addEventListener('click', () => {
        switchPage('settings');
    });
    
    document.getElementById('save-goals-btn').addEventListener('click', () => {
        let calories = parseInt(document.getElementById('goal-calories').value) || 2200;
        let protein = parseInt(document.getElementById('goal-protein').value) || 150;
        let fat = parseInt(document.getElementById('goal-fat').value) || 70;
        let carbs = parseInt(document.getElementById('goal-carbs').value) || 250;
        
        // Валидация: проверяем, что БЖУ не превышают общую калорийность
        // 1г белка = 4 ккал, 1г жира = 9 ккал, 1г углеводов = 4 ккал
        const caloriesFromMacros = (protein * 4) + (fat * 9) + (carbs * 4);
        
        if (caloriesFromMacros > calories) {
            // БЖУ превышают общую калорийность - масштабируем пропорционально
            const scale = calories / caloriesFromMacros;
            protein = Math.round(protein * scale);
            fat = Math.round(fat * scale);
            carbs = Math.round(carbs * scale);
            
            showToast('Цели скорректированы: БЖУ превышали общую калорийность', 'warning');
        } else if (caloriesFromMacros < calories * 0.85) {
            // Если БЖУ составляют менее 85% от калорий - предупреждаем
            // Это может означать, что пользователь забыл ввести что-то
            const remainingCalories = calories - caloriesFromMacros;
            if (remainingCalories > 300) {
                showToast(`Внимание: ${remainingCalories} ккал не распределены между БЖУ`, 'warning');
            }
        }
        
        settings.dailyGoals.calories = calories;
        settings.dailyGoals.protein = protein;
        settings.dailyGoals.fat = fat;
        settings.dailyGoals.carbs = carbs;
        
        saveLocalData();
        showToast('Цели сохранены', 'success');
        renderDiary();
    });
    
    // Экспорт/Импорт
    document.getElementById('export-data-btn').addEventListener('click', exportData);
    document.getElementById('import-data-btn').addEventListener('click', () => {
        document.getElementById('import-file-input').click();
    });
    document.getElementById('import-file-input').addEventListener('change', (e) => {
        if (e.target.files[0]) importData(e.target.files[0]);
    });
    
    // Статистика - переключатели
    document.querySelectorAll('.stats-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.stats-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const metric = document.querySelector('.metric-btn.active')?.dataset?.metric || 'calories';
            renderStats(tab.dataset.period, metric);
        });
    });
    
    document.querySelectorAll('.metric-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.metric-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const period = document.querySelector('.stats-tab.active')?.dataset?.period || 'week';
            renderStats(period, btn.dataset.metric);
        });
    });
}

// ==================== Инициализация ====================
async function init() {
    try {
        await initDB();
        loadLocalData();
        setupEventListeners();
        
        // Загружаем цели в настройки
        document.getElementById('goal-calories').value = settings.dailyGoals.calories;
        document.getElementById('goal-protein').value = settings.dailyGoals.protein;
        document.getElementById('goal-fat').value = settings.dailyGoals.fat;
        document.getElementById('goal-carbs').value = settings.dailyGoals.carbs;
        
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('app-page').style.display = 'block';
        
        renderDiary();
        
        showToast('NutriTrack готов!', 'success');
    } catch (error) {
        console.error('Init error:', error);
        showToast('Ошибка запуска приложения', 'error');
    }
}

document.addEventListener('DOMContentLoaded', init);
