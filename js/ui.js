// ==================== ui.js - Отрисовка интерфейса ====================

const MEAL_TYPES = {
    breakfast: 'Завтрак',
    lunch: 'Обед',
    dinner: 'Ужин',
    snack: 'Перекус'
};

let chartInstance = null;
let selectedProduct = null;

// Toast уведомления
window.showToast = function(message, type = 'info') {
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
};

// Обновление отображения даты
window.updateDateDisplay = function() {
    document.getElementById('current-date-display').textContent = 
        `${window.getDayName(window.currentViewDate)}, ${window.formatDate(window.currentViewDate)}`;
};

// Отрисовка дневника
window.renderDiary = function() {
    window.updateDateDisplay();
    
    const totals = window.calculateDailyTotals(window.currentViewDate);
    const goals = window.getSettings().dailyGoals;
    
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
    document.getElementById('protein-consumed').textContent = window.roundTo(totals.protein);
    document.getElementById('protein-goal').textContent = goals.protein;
    document.getElementById('protein-bar').style.width = `${Math.min((totals.protein / goals.protein) * 100, 100)}%`;
    
    document.getElementById('fat-consumed').textContent = window.roundTo(totals.fat);
    document.getElementById('fat-goal').textContent = goals.fat;
    document.getElementById('fat-bar').style.width = `${Math.min((totals.fat / goals.fat) * 100, 100)}%`;
    
    document.getElementById('carbs-consumed').textContent = window.roundTo(totals.carbs);
    document.getElementById('carbs-goal').textContent = goals.carbs;
    document.getElementById('carbs-bar').style.width = `${Math.min((totals.carbs / goals.carbs) * 100, 100)}%`;
    
    // Приёмы пищи
    const log = window.getDailyLog(window.currentViewDate);
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
                    <span>Б: ${window.roundTo(meal.protein)}г</span>
                    <span>Ж: ${window.roundTo(meal.fat)}г</span>
                    <span>У: ${window.roundTo(meal.carbs)}г</span>
                </div>
                <button class="delete-meal-btn" data-index="${log.meals.indexOf(meal)}"><i class="fas fa-trash"></i></button>
            `;
            
            mealCard.querySelector('.delete-meal-btn').addEventListener('click', () => {
                window.removeMealEntry(window.currentViewDate, log.meals.indexOf(meal));
                window.renderDiary();
            });
            
            mealsList.appendChild(mealCard);
        }
    }
};

// Обработка поиска UI
window.handleSearch = async function() {
    const query = document.getElementById('product-search-input').value.trim();
    if (!query) {
        window.showToast('Введите название продукта', 'warning');
        return;
    }
    
    document.getElementById('search-loading').style.display = 'flex';
    document.getElementById('search-results').innerHTML = '';
    
    let results = [];
    try {
        results = await window.searchProducts(query);
    } catch (error) {
        console.error('Search failed:', error);
        window.showToast('Ошибка сети. Попробуйте позже.', 'error');
    }
    
    document.getElementById('search-loading').style.display = 'none';
    
    if (!results || results.length === 0) {
        document.getElementById('search-results').innerHTML = 
            '<p class="empty-message">Продукты не найдены. Попробуйте другой запрос или добавьте продукт вручную.</p>';
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
                    Б: ${window.roundTo(product.proteinPer100g)}г | Ж: ${window.roundTo(product.fatPer100g)}г | У: ${window.roundTo(product.carbsPer100g)}г
                </div>
                ${product.source === 'local' ? '<span class="badge-local">Локально</span>' : ''}
            </div>
            <button class="add-product-btn"><i class="fas fa-plus"></i></button>
        `;
        
        card.querySelector('.add-product-btn').addEventListener('click', () => {
            window.showAddProductModal(product);
        });
        
        resultsContainer.appendChild(card);
    }
};

// Показать модальное окно добавления продукта
window.showAddProductModal = function(product) {
    selectedProduct = product;
    
    document.getElementById('modal-product-info').innerHTML = `
        <strong>${product.name}</strong><br>
        ${product.brand ? product.brand + '<br>' : ''}
        <small>${Math.round(product.caloriesPer100g)} ккал, Б: ${window.roundTo(product.proteinPer100g)}г, 
        Ж: ${window.roundTo(product.fatPer100g)}г, У: ${window.roundTo(product.carbsPer100g)}г (на 100г)</small>
    `;
    
    document.getElementById('portion-grams').value = 100;
    window.updatePortionNutrients();
    
    document.getElementById('add-product-modal').style.display = 'flex';
};

// Обновление КБЖУ порции
window.updatePortionNutrients = function() {
    if (!selectedProduct) return;
    
    const grams = parseInt(document.getElementById('portion-grams').value) || 0;
    const nutrients = window.calculatePortionNutrients(selectedProduct, grams);
    
    document.getElementById('portion-nutrients').innerHTML = `
        <strong>На порцию (${grams}г):</strong><br>
        ${Math.round(nutrients.calories)} ккал | 
        Б: ${window.roundTo(nutrients.protein)}г | 
        Ж: ${window.roundTo(nutrients.fat)}г | 
        У: ${window.roundTo(nutrients.carbs)}г
    `;
};

// Отрисовка статистики
window.renderStats = function(period = 'week', metric = 'calories') {
    const ctx = document.getElementById('stats-chart');
    if (!ctx) return;
    
    if (chartInstance) {
        chartInstance.destroy();
    }
    
    const now = new Date();
    let daysCount = 7;
    if (period === 'month') daysCount = 30;
    if (period === 'year') daysCount = 365;
    
    const labels = [];
    const data = [];
    
    for (let i = daysCount - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        labels.push(window.formatDate(dateStr));
        
        const totals = window.calculateDailyTotals(dateStr);
        if (metric === 'calories') {
            data.push(Math.round(totals.calories));
        } else if (metric === 'weight') {
            const weightEntry = window.getWeightHistory().find(w => w.date === dateStr);
            data.push(weightEntry ? weightEntry.weight : null);
        } else {
            data.push(window.roundTo(totals[metric]));
        }
    }
    
    const metricLabels = {
        calories: 'Ккал',
        protein: 'Белки (г)',
        fat: 'Жиры (г)',
        carbs: 'Углеводы (г)',
        weight: 'Вес (кг)'
    };
    
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: metricLabels[metric],
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
    
    // Среднее значение
    const validData = data.filter(d => d !== null);
    const avg = validData.length > 0 
        ? window.roundTo(validData.reduce((a, b) => a + b, 0) / validData.length) 
        : 0;
    
    document.getElementById('stats-average').textContent = 
        `Среднее за период: ${avg} ${metricLabels[metric]}`;
};

// Переключение страниц
window.switchPage = function(pageId) {
    document.querySelectorAll('.content-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.content-page').forEach(p => p.style.display = 'none');
    
    const targetPage = document.getElementById(`${pageId}-page`);
    if (targetPage) {
        targetPage.classList.add('active');
        targetPage.style.display = 'block';
    }
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === pageId);
    });
    
    if (pageId === 'diary') {
        window.renderDiary();
    } else if (pageId === 'stats') {
        const activePeriod = document.querySelector('.stats-tab.active')?.dataset.period || 'week';
        const activeMetric = document.querySelector('.metric-btn.active')?.dataset.metric || 'calories';
        window.renderStats(activePeriod, activeMetric);
    }
};
