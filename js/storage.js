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
window.loadLocalData = function() {
    const savedSettings = localStorage.getItem(STORAGE_KEYS.USER_SETTINGS);
    if (savedSettings) settings = JSON.parse(savedSettings);

    foodDiary = JSON.parse(localStorage.getItem(STORAGE_KEYS.FOOD_DIARY) || '[]');
    localProducts = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_PRODUCTS) || '[]');
    weightHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.WEIGHT_HISTORY) || '[]');
};

// Сохранение данных в localStorage
window.saveLocalData = function() {
    localStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(settings));
    localStorage.setItem(STORAGE_KEYS.FOOD_DIARY, JSON.stringify(foodDiary));
    localStorage.setItem(STORAGE_KEYS.LOCAL_PRODUCTS, JSON.stringify(localProducts));
    localStorage.setItem(STORAGE_KEYS.WEIGHT_HISTORY, JSON.stringify(weightHistory));
};

// Получение дневного лога
window.getDailyLog = function(date) {
    return foodDiary.find(log => log.date === date) || { date, meals: [] };
};

// Сохранение дневного лога
window.saveDailyLog = function(log) {
    const index = foodDiary.findIndex(l => l.date === log.date);
    if (index >= 0) {
        foodDiary[index] = log;
    } else {
        foodDiary.push(log);
    }
    window.saveLocalData();
};

// Добавление приёма пищи
window.addMealEntry = function(date, mealType, product, grams) {
    let log = window.getDailyLog(date);
    
    const nutrients = window.calculatePortionNutrients(product, grams);
    
    log.meals.push({
        type: mealType,
        productId: product.id,
        productName: product.name,
        grams: grams,
        calories: nutrients.calories,
        protein: nutrients.protein,
        fat: nutrients.fat,
        carbs: nutrients.carbs
    });
    
    window.saveDailyLog(log);
};

// Удаление записи
window.removeMealEntry = function(date, mealIndex) {
    const log = window.getDailyLog(date);
    if (log && log.meals[mealIndex]) {
        log.meals.splice(mealIndex, 1);
        window.saveDailyLog(log);
    }
};

// Подсчёт итогов за день
window.calculateDailyTotals = function(date) {
    const log = window.getDailyLog(date);
    if (!log || !log.meals) return { calories: 0, protein: 0, fat: 0, carbs: 0 };
    
    return log.meals.reduce((total, meal) => ({
        calories: total.calories + meal.calories,
        protein: total.protein + meal.protein,
        fat: total.fat + meal.fat,
        carbs: total.carbs + meal.carbs
    }), { calories: 0, protein: 0, fat: 0, carbs: 0 });
};

// Экспорт всех данных
window.exportAllData = function() {
    return {
        settings: settings,
        foodDiary: foodDiary,
        localProducts: localProducts,
        weightHistory: weightHistory,
        exportDate: new Date().toISOString()
    };
};

// Импорт всех данных
window.importAllData = function(data) {
    if (data.settings) settings = data.settings;
    if (data.foodDiary) foodDiary = data.foodDiary;
    if (data.localProducts) localProducts = data.localProducts;
    if (data.weightHistory) weightHistory = data.weightHistory;
    window.saveLocalData();
};

// Сохранение настроек
window.saveSettings = function(newSettings) {
    settings = newSettings;
    window.saveLocalData();
};

// Получение настроек
window.getSettings = function() {
    return settings;
};

// История веса
window.getWeightHistory = function() {
    return weightHistory;
};

// Добавление записи веса
window.addWeightEntry = function(date, weight) {
    const existingIndex = weightHistory.findIndex(w => w.date === date);
    if (existingIndex >= 0) {
        weightHistory[existingIndex].weight = weight;
    } else {
        weightHistory.push({ date, weight });
        weightHistory.sort((a, b) => a.date.localeCompare(b.date));
    }
    window.saveLocalData();
};

// Удаление записи веса
window.removeWeightEntry = function(date) {
    weightHistory = weightHistory.filter(w => w.date !== date);
    window.saveLocalData();
};

// Локальные продукты
window.getLocalProducts = function() {
    return localProducts;
};

// Добавление локального продукта
window.addLocalProduct = function(product) {
    localProducts.push(product);
    window.saveLocalData();
};

// Поиск локальных продуктов
window.searchLocalProducts = function(query) {
    const q = query.toLowerCase();
    return localProducts.filter(p => 
        p.name.toLowerCase().includes(q) || 
        (p.brand && p.brand.toLowerCase().includes(q))
    );
};
