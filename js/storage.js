// ==================== storage.js - Хранение данных ====================

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

let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
let foodDiary = [];
let localProducts = [];
let weightHistory = [];

// Загрузка данных из localStorage
function loadLocalData() {
    const savedSettings = localStorage.getItem(STORAGE_KEYS.USER_SETTINGS);
    if (savedSettings) settings = JSON.parse(savedSettings);
    
    foodDiary = JSON.parse(localStorage.getItem(STORAGE_KEYS.FOOD_DIARY) || '[]');
    localProducts = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_PRODUCTS) || '[]');
    weightHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.WEIGHT_HISTORY) || '[]');
}

// Сохранение данных в localStorage
function saveLocalData() {
    localStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(settings));
    localStorage.setItem(STORAGE_KEYS.FOOD_DIARY, JSON.stringify(foodDiary));
    localStorage.setItem(STORAGE_KEYS.LOCAL_PRODUCTS, JSON.stringify(localProducts));
    localStorage.setItem(STORAGE_KEYS.WEIGHT_HISTORY, JSON.stringify(weightHistory));
}

// Получение дневного лога
function getDailyLog(date) {
    return foodDiary.find(log => log.date === date) || { date, meals: [] };
}

// Сохранение дневного лога
function saveDailyLog(log) {
    const index = foodDiary.findIndex(l => l.date === log.date);
    if (index >= 0) {
        foodDiary[index] = log;
    } else {
        foodDiary.push(log);
    }
    saveLocalData();
}

// Добавление записи о приёме пищи
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
}

// Удаление записи о приёме пищи
function removeMealEntry(date, mealIndex) {
    const log = getDailyLog(date);
    log.meals.splice(mealIndex, 1);
    saveDailyLog(log);
}

// Расчёт суточных_totals
function calculateDailyTotals(date) {
    const log = getDailyLog(date);
    return log.meals.reduce((acc, meal) => ({
        calories: acc.calories + meal.calories,
        protein: acc.protein + meal.protein,
        fat: acc.fat + meal.fat,
        carbs: acc.carbs + meal.carbs
    }), { calories: 0, protein: 0, fat: 0, carbs: 0 });
}

// Экспорт всех данных
function exportAllData() {
    return {
        settings,
        foodDiary,
        localProducts,
        weightHistory,
        exportDate: new Date().toISOString()
    };
}

// Импорт данных
function importAllData(data) {
    if (data.settings) settings = data.settings;
    if (data.foodDiary) foodDiary = data.foodDiary;
    if (data.localProducts) localProducts = data.localProducts;
    if (data.weightHistory) weightHistory = data.weightHistory;
    saveLocalData();
}

// Сохранение настроек
function saveSettings(newSettings) {
    settings = newSettings;
    saveLocalData();
}

// Получение настроек
function getSettings() {
    return settings;
}

// Получение истории веса
function getWeightHistory() {
    return weightHistory;
}

// Добавление записи веса
function addWeightEntry(date, weight) {
    const existingIndex = weightHistory.findIndex(w => w.date === date);
    if (existingIndex >= 0) {
        weightHistory[existingIndex].weight = weight;
    } else {
        weightHistory.push({ date, weight });
    }
    weightHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
    saveLocalData();
}

// Удаление записи веса
function removeWeightEntry(date) {
    weightHistory = weightHistory.filter(w => w.date !== date);
    saveLocalData();
}

// Получение локальных продуктов
function getLocalProducts() {
    return localProducts;
}

// Добавление локального продукта
function addLocalProduct(product) {
    const exists = localProducts.some(p => p.barcode === product.barcode);
    if (!exists) {
        localProducts.push(product);
        saveLocalData();
        return true;
    }
    return false;
}

// Поиск локального продукта по названию
function searchLocalProducts(query) {
    return localProducts.filter(p => 
        p.name.toLowerCase().includes(query.toLowerCase())
    );
}
