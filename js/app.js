// ==================== app.js - Главный контроллер ====================

// Глобальные переменные
let currentViewDate = new Date().toISOString().split('T')[0];
let db;

// ==================== Инициализация IndexedDB через Dexie ====================
async function initDB() {
    db = new Dexie('NutriTrackDB');
    db.version(1).stores({
        products: '++id, name, brand, barcode, source, openfoodfactsId'
    });
    await db.open();
}

// ==================== Инициализация приложения ====================
async function initApp() {
    try {
        await initDB();
        window.loadLocalData();
        
        // Заполняем форму настроек текущими значениями
        const goals = window.getSettings().dailyGoals;
        document.getElementById('goal-calories').value = goals.calories;
        document.getElementById('goal-protein').value = goals.protein;
        document.getElementById('goal-fat').value = goals.fat;
        document.getElementById('goal-carbs').value = goals.carbs;
        
        // Скрываем экран загрузки, показываем приложение
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('app-page').style.display = 'block';
        
        // Отрисовываем дневник
        window.renderDiary();
        
        setupEventListeners();
    } catch (error) {
        console.error('Init error:', error);
        window.showToast('Ошибка загрузки приложения', 'error');
    }
}

// ==================== Обработчики событий ====================
function setupEventListeners() {
    // Навигация
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            window.switchPage(item.dataset.page);
        });
    });
    
    document.getElementById('settings-btn').addEventListener('click', () => {
        window.switchPage('settings');
    });
    
    // Переключение дней
    document.getElementById('prev-day-btn').addEventListener('click', () => {
        const date = new Date(currentViewDate);
        date.setDate(date.getDate() - 1);
        currentViewDate = date.toISOString().split('T')[0];
        window.renderDiary();
    });
    
    document.getElementById('next-day-btn').addEventListener('click', () => {
        const date = new Date(currentViewDate);
        date.setDate(date.getDate() + 1);
        currentViewDate = date.toISOString().split('T')[0];
        window.renderDiary();
    });
    
    // Поиск
    document.getElementById('search-btn').addEventListener('click', window.handleSearch);
    document.getElementById('product-search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') window.handleSearch();
    });
    
    // Добавление приёма пищи
    document.getElementById('add-meal-btn').addEventListener('click', () => {
        document.getElementById('add-meal-modal').style.display = 'flex';
    });
    
    document.getElementById('cancel-add-meal-btn').addEventListener('click', () => {
        document.getElementById('add-meal-modal').style.display = 'none';
    });
    
    document.getElementById('add-from-products-btn').addEventListener('click', () => {
        document.getElementById('add-meal-modal').style.display = 'none';
        window.switchPage('products');
    });
    
    document.getElementById('add-custom-food-btn').addEventListener('click', () => {
        document.getElementById('add-meal-modal').style.display = 'none';
        document.getElementById('custom-food-modal').style.display = 'flex';
    });
    
    document.getElementById('add-weight-btn').addEventListener('click', () => {
        document.getElementById('add-meal-modal').style.display = 'none';
        document.getElementById('weight-date').value = currentViewDate;
        document.getElementById('weight-modal').style.display = 'flex';
    });
    
    // Модальное окно добавления продукта
    document.getElementById('cancel-add-product-btn').addEventListener('click', () => {
        document.getElementById('add-product-modal').style.display = 'none';
    });
    
    document.getElementById('portion-grams').addEventListener('input', window.updatePortionNutrients);
    
    document.getElementById('confirm-add-product-btn').addEventListener('click', () => {
        const grams = parseInt(document.getElementById('portion-grams').value) || 100;
        const mealType = document.getElementById('meal-type-select').value;
        
        window.addMealEntry(currentViewDate, mealType, selectedProduct, grams);
        document.getElementById('add-product-modal').style.display = 'none';
        window.switchPage('diary');
    });
    
    // Создание своего продукта
    document.getElementById('cancel-custom-food-btn').addEventListener('click', () => {
        document.getElementById('custom-food-modal').style.display = 'none';
    });
    
    document.getElementById('save-custom-food-btn').addEventListener('click', saveCustomProduct);
    
    // Ввод веса
    document.getElementById('cancel-weight-btn').addEventListener('click', () => {
        document.getElementById('weight-modal').style.display = 'none';
    });
    
    document.getElementById('save-weight-btn').addEventListener('click', () => {
        const date = document.getElementById('weight-date').value;
        const weight = parseFloat(document.getElementById('weight-value').value);
        
        if (!date || !weight) {
            window.showToast('Введите дату и вес', 'warning');
            return;
        }
        
        window.addWeightEntry(date, weight);
        document.getElementById('weight-modal').style.display = 'none';
        window.showToast('Вес сохранён', 'success');
    });
    
    // Сохранение целей
    document.getElementById('save-goals-btn').addEventListener('click', saveGoals);
    
    // Экспорт/Импорт
    document.getElementById('export-data-btn').addEventListener('click', exportData);
    document.getElementById('import-data-btn').addEventListener('click', () => {
        document.getElementById('import-file-input').click();
    });
    document.getElementById('import-file-input').addEventListener('change', importData);
    
    // Статистика - переключение периода
    document.querySelectorAll('.stats-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.stats-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const activeMetric = document.querySelector('.metric-btn.active')?.dataset.metric || 'calories';
            window.renderStats(tab.dataset.period, activeMetric);
        });
    });
    
    // Статистика - переключение метрики
    document.querySelectorAll('.metric-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.metric-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const activePeriod = document.querySelector('.stats-tab.active')?.dataset.period || 'week';
            window.renderStats(activePeriod, btn.dataset.metric);
        });
    });
}

// Сохранение целей с валидацией
function saveGoals() {
    const calories = parseFloat(document.getElementById('goal-calories').value) || 0;
    const protein = parseFloat(document.getElementById('goal-protein').value) || 0;
    const fat = parseFloat(document.getElementById('goal-fat').value) || 0;
    const carbs = parseFloat(document.getElementById('goal-carbs').value) || 0;
    
    const adjustedGoals = window.validateAndAdjustGoals({ calories, protein, fat, carbs }, 'auto');
    
    const newSettings = window.getSettings();
    newSettings.dailyGoals = adjustedGoals;
    window.saveSettings(newSettings);
    
    document.getElementById('goal-calories').value = adjustedGoals.calories;
    document.getElementById('goal-protein').value = adjustedGoals.protein;
    document.getElementById('goal-fat').value = adjustedGoals.fat;
    document.getElementById('goal-carbs').value = adjustedGoals.carbs;
    
    window.showToast('Цели сохранены', 'success');
}

// Сохранение своего продукта
function saveCustomProduct() {
    const name = document.getElementById('custom-name').value.trim();
    const brand = document.getElementById('custom-brand').value.trim();
    const calories = parseFloat(document.getElementById('custom-calories').value) || 0;
    const protein = parseFloat(document.getElementById('custom-protein').value) || 0;
    const fat = parseFloat(document.getElementById('custom-fat').value) || 0;
    const carbs = parseFloat(document.getElementById('custom-carbs').value) || 0;
    
    if (!name) {
        window.showToast('Введите название продукта', 'warning');
        return;
    }
    
    const product = {
        id: `local_${Date.now()}`,
        name,
        brand: brand || '',
        caloriesPer100g: Math.round(calories),
        proteinPer100g: window.roundTo(protein),
        fatPer100g: window.roundTo(fat),
        carbsPer100g: window.roundTo(carbs),
        barcode: `local_${Date.now()}`,
        source: 'local'
    };
    
    window.addLocalProduct(product);
    document.getElementById('custom-food-modal').style.display = 'none';
    
    document.getElementById('custom-name').value = '';
    document.getElementById('custom-brand').value = '';
    document.getElementById('custom-calories').value = '';
    document.getElementById('custom-protein').value = '';
    document.getElementById('custom-fat').value = '';
    document.getElementById('custom-carbs').value = '';
    
    window.showToast('Продукт сохранён', 'success');
}

// Экспорт данных
function exportData() {
    const data = window.exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nutritrack_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    window.showToast('Данные экспортированы', 'success');
}

// Импорт данных
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            window.importAllData(data);
            window.showToast('Данные импортированы', 'success');
            
            const goals = window.getSettings().dailyGoals;
            document.getElementById('goal-calories').value = goals.calories;
            document.getElementById('goal-protein').value = goals.protein;
            document.getElementById('goal-fat').value = goals.fat;
            document.getElementById('goal-carbs').value = goals.carbs;
            
            window.renderDiary();
        } catch (error) {
            window.showToast('Ошибка импорта: неверный формат файла', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// Закрытие модальных окон по клику вне контента
document.addEventListener('click', (e) => {
    document.querySelectorAll('.modal').forEach(modal => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
});

// Запуск приложения
document.addEventListener('DOMContentLoaded', initApp);

// Service Worker регистрация
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
