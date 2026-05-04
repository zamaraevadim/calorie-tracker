// api.js - Работа с Open Food Facts API

const OFF_API_BASE = 'https://world.openfoodfacts.org';
// Используем надежный прокси только если прямой запрос не сработает
const PROXY_BASE = 'https://corsproxy.io/?'; 

/**
 * Поиск продуктов по названию
 * @param {string} query - Поисковый запрос
 * @param {number} page - Номер страницы
 * @returns {Promise<Array>} - Массив продуктов
 */
async function searchProducts(query, page = 1) {
    const pageSize = 20;
    // Кодируем запрос для URL
    const encodedQuery = encodeURIComponent(query);
    
    // Используем современный API v2 вместо старого cgi/search.pl
    const url = `${OFF_API_BASE}/api/v2/search?search_terms=${encodedQuery}&json=true&page=${page}&page_size=${pageSize}`;
    
    console.log(`Searching for: ${query} at ${url}`);

    try {
        // Попытка прямого запроса с правильным User-Agent (хотя браузеры его часто игнорируют для CORS)
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
                // User-Agent нельзя установить вручную в браузере из соображений безопасности
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return processSearchResults(data);

    } catch (error) {
        console.warn(`Direct request failed: ${error.message}. Trying proxy...`);
        
        // Если прямой запрос не удался (CORS или сеть), пробуем через прокси
        try {
            const proxyUrl = `${PROXY_BASE}${encodeURIComponent(url)}`;
            const proxyResponse = await fetch(proxyUrl);
            
            if (!proxyResponse.ok) {
                throw new Error(`Proxy HTTP error! status: ${proxyResponse.status}`);
            }

            const proxyData = await proxyResponse.json();
            // Прокси может вернуть объект с полем contents, если это текст, но здесь мы ждем JSON
            // corsproxy.io обычно возвращает чистый ответ, но проверим структуру
            const jsonData = proxyData.contents ? JSON.parse(proxyData.contents) : proxyData;
            
            return processSearchResults(jsonData);

        } catch (proxyError) {
            console.error('Search failed via proxy too:', proxyError);
            throw new Error('Не удалось выполнить поиск. Проверьте соединение или попробуйте позже.');
        }
    }
}

/**
 * Обработка данных поиска
 * @param {Object} data - Сырые данные от API
 * @returns {Array} - Массив продуктов
 */
function processSearchResults(data) {
    if (!data || !data.products) {
        console.warn('No products found in response');
        return [];
    }
    
    // Фильтруем продукты, у которых есть хотя бы название
    return data.products.filter(product => product.product_name).map(product => ({
        id: product.code,
        name: product.product_name,
        brand: product.brands || 'Неизвестный бренд',
        image: product.image_front_url || product.image_small_url || null,
        nutriscore: product.nutriscore_grade ? product.nutriscore_grade.toUpperCase() : null,
        nova: product.nova_group,
        // Сохраняем полные данные нутриентов для последующего использования
        nutriments: product.nutriments || {}
    }));
}

/**
 * Получение детальной информации о продукте по штрих-коду
 * @param {string} barcode - Штрих-код продукта
 * @returns {Promise<Object>} - Данные продукта
 */
async function getProductByBarcode(barcode) {
    const url = `${OFF_API_BASE}/api/v2/product/${barcode}.json`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Product not found or error: ${response.status}`);
        }
        const data = await response.json();
        
        if (data.status !== 1) {
            throw new Error('Product not found in database');
        }
        
        const product = data.product;
        return {
            id: product.code,
            name: product.product_name,
            brand: product.brands || 'Неизвестный бренд',
            image: product.image_front_url || null,
            nutriscore: product.nutriscore_grade ? product.nutriscore_grade.toUpperCase() : null,
            nova: product.nova_group,
            ingredients_text: product.ingredients_text,
            nutriments: product.nutriments || {},
            categories: product.categories_tags || []
        };
    } catch (error) {
        console.error('Error fetching product details:', error);
        throw error;
    }
}

export { searchProducts, getProductByBarcode };
