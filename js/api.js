// js/api.js

const PROXY_URL = 'https://api.allorigins.win/get?url=';
const BASE_URL = 'https://world.openfoodfacts.org';

/**
 * Поиск продуктов по названию
 */
export async function searchProducts(query, page = 1, pageSize = 20) {
    if (!query || query.trim() === '') {
        throw new Error('Поисковый запрос пуст');
    }

    // Используем API v2 search с правильными параметрами
    const encodedQuery = encodeURIComponent(query.trim());
    const targetUrl = `${BASE_URL}/cgi/search.pl?search_terms=${encodedQuery}&json=true&page=${page}&page_size=${pageSize}`;
    
    // Формируем URL для прокси allorigins
    const proxyUrl = `${PROXY_URL}${encodeURIComponent(targetUrl)}`;

    console.log('Fetching via proxy:', proxyUrl);

    try {
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // allorigins возвращает данные в поле "contents" как строку, её нужно распарсить
        if (!data.contents) {
            throw new Error('Пустой ответ от прокси');
        }

        const productData = JSON.parse(data.contents);

        if (!productData.products || productData.products.length === 0) {
            return [];
        }

        return productData.products.map(product => ({
            id: product.code,
            name: product.product_name || 'Без названия',
            brand: product.brands || '',
            image: product.image_small_url || product.image_front_small_url || null,
            nutriments: product.nutriments || {},
            nutriscore: product.nutriscore_grade || null,
            novaGroup: product.nova_group || null
        }));

    } catch (error) {
        console.error('Search error:', error);
        throw error;
    }
}

/**
 * Получение данных о продукте по штрих-коду
 */
export async function getProductByBarcode(barcode) {
    const targetUrl = `${BASE_URL}/api/v2/product/${barcode}.json`;
    const proxyUrl = `${PROXY_URL}${encodeURIComponent(targetUrl)}`;

    try {
        const response = await fetch(proxyUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const productData = JSON.parse(data.contents);

        if (productData.status !== 1) {
            throw new Error('Продукт не найден');
        }

        const product = productData.product;
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
        console.error('Get product error:', error);
        throw error;
    }
}