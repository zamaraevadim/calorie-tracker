// js/api.js

const BASE_URL = 'https://world.openfoodfacts.org';
const PROXY_URL = 'https://api.allorigins.win/get?url=';

/**
 * Поиск продуктов по названию
 */
window.searchProducts = async function(query, page = 1, pageSize = 20) {
    if (!query || query.trim() === '') {
        throw new Error('Поисковый запрос пуст');
    }

    const encodedQuery = encodeURIComponent(query.trim());
    const targetUrl = `${BASE_URL}/cgi/search.pl?search_terms=${encodedQuery}&json=true&page=${page}&page_size=${pageSize}`;
    
    console.log('Searching:', targetUrl);
    
    try {
        // Используем прокси allorigins.win
        const proxyUrl = PROXY_URL + encodeURIComponent(targetUrl);
        
        const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            signal: AbortSignal.timeout(30000)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const proxyData = await response.json();
        
        // allorigins возвращает данные в поле contents как строку
        if (!proxyData.contents) {
            throw new Error('Неверный формат ответа от прокси');
        }
        
        const data = JSON.parse(proxyData.contents);

        if (!data.products || data.products.length === 0) {
            return [];
        }

        return data.products.map(product => ({
            id: product.code,
            name: product.product_name || 'Без названия',
            brand: product.brands || '',
            image: product.image_small_url || product.image_front_small_url || null,
            nutriments: product.nutriments || {},
            nutriscore: product.nutriscore_grade || null,
            novaGroup: product.nova_group || null
        }));
        
    } catch (error) {
        console.error('Search error:', error.message);
        throw error;
    }
};

/**
 * Получение данных о продукте по штрих-коду
 */
window.getProductByBarcode = async function(barcode) {
    const targetUrl = `${BASE_URL}/api/v2/product/${barcode}.json`;
    
    console.log('Getting product by barcode:', targetUrl);
    
    try {
        // Используем прокси allorigins.win
        const proxyUrl = PROXY_URL + encodeURIComponent(targetUrl);
        
        const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            signal: AbortSignal.timeout(30000)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const proxyData = await response.json();
        
        // allorigins возвращает данные в поле contents как строку
        if (!proxyData.contents) {
            throw new Error('Неверный формат ответа от прокси');
        }
        
        const data = JSON.parse(proxyData.contents);

        if (data.status !== 1) {
            throw new Error('Продукт не найден');
        }

        const product = data.product;
        return {
            id: product.code,
            name: product.product_name || 'Без названия',
            brand: product.brands || '',
            image: product.image_small_url || product.image_front_small_url || null,
            nutriments: product.nutriments || {},
            nutriscore: product.nutriscore_grade || null,
            novaGroup: product.nova_group || null,
            barcode: product.code
        };
        
    } catch (error) {
        console.error('Barcode search error:', error.message);
        throw error;
    }
};