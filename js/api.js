// ==================== api.js - Работа с Open Food Facts API ====================

const API_BASE = 'https://world.openfoodfacts.org';
const SEARCH_DELAY_MS = 4000; // 4 секунды между поисковыми запросами

let lastSearchTime = 0;

// Поиск продуктов
async function searchProducts(query) {
    const now = Date.now();
    if (now - lastSearchTime < SEARCH_DELAY_MS) {
        const waitTime = Math.ceil((SEARCH_DELAY_MS - (now - lastSearchTime)) / 1000);
        showToast(`Подождите ${waitTime} сек перед следующим поиском`, 'warning');
        return [];
    }
    
    lastSearchTime = now;
    
    // Сначала ищем локально
    const localResults = searchLocalProducts(query).map(p => ({ ...p, source: 'local' }));
    
    // Затем ищем в API через прокси для обхода CORS
    try {
        // Используем современный API v2 с правильным User-Agent
        const url = `${API_BASE}/api/v2/search?search_terms=${encodeURIComponent(query)}&json=true&page=1&page_size=20`;
        
        // Используем надежный CORS-прокси
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        
        const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'NutriTrack-CalorieTracker/1.0 (Contact: developer@example.com)'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return processApiResults(data, localResults);
    } catch (error) {
        console.error('Search error:', error);
        showToast('Ошибка поиска. Попробуйте позже или добавьте продукт вручную.', 'error');
        return localResults;
    }
}

// Обработка результатов API
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
        addLocalProduct(product);
    }
    
    // Объединяем результаты
    return [...localResults, ...apiResults.filter(p => !localResults.some(l => l.barcode === p.barcode))];
}
