// js/api.js

const BASE_URL = 'https://world.openfoodfacts.org';

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
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(20000),
            mode: 'cors',
            credentials: 'omit'
        });
        
        if (!response.ok) {
            if (response.status === 0) {
                throw new Error('Сетевая ошибка - проверьте интернет соединение');
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

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
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(20000),
            mode: 'cors',
            credentials: 'omit'
        });
        
        if (!response.ok) {
            if (response.status === 0) {
                throw new Error('Сетевая ошибка - проверьте интернет соединение');
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

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