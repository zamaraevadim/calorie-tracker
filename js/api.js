// ==================== api.js - Работа с Open Food Facts API ====================

const API_BASE = 'https://world.openfoodfacts.org';
const SEARCH_DELAY_MS = 6000; // 6 секунд между поисковыми запросами

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
    
    // Затем ищем в API
    try {
        const url = `${API_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page=1&page_size=20`;
        
        let response;
        try {
            response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'NutriTrack/1.0'
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
