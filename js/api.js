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
    
    // Пробуем прямой запрос сначала
    try {
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            signal: AbortSignal.timeout(15000)
        });
        
        if (!response.ok) {
            if (response.status === 0) {
                throw new Error('Сетевая ошибка');
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
        console.warn('Direct request failed, trying proxy:', error.message);
        // Если прямой запрос не удался, пробуем через прокси
        return searchProductsViaProxy(query, page, pageSize);
    }
};

/**
 * Поиск продуктов через прокси (резервный вариант)
 */
async function searchProductsViaProxy(query, page = 1, pageSize = 20) {
    const PROXY_URLS = [
        'https://api.allorigins.win/get?url=',
        'https://corsproxy.io/?'
    ];
    
    const encodedQuery = encodeURIComponent(query.trim());
    const targetUrl = `${BASE_URL}/cgi/search.pl?search_terms=${encodedQuery}&json=true&page=${page}&page_size=${pageSize}`;
    
    let lastError = null;
    
    for (const proxyBase of PROXY_URLS) {
        const proxyUrl = `${proxyBase}${encodeURIComponent(targetUrl)}`;
        
        console.log('Trying proxy:', proxyUrl);
        
        try {
            const response = await fetch(proxyUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                signal: AbortSignal.timeout(15000)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            let data;
            
            // allorigins возвращает данные в поле "contents" как строку
            if (proxyBase.includes('allorigins')) {
                const rawData = await response.json();
                if (!rawData.contents) {
                    throw new Error('Пустой ответ от прокси');
                }
                data = JSON.parse(rawData.contents);
            } else {
                data = await response.json();
            }

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
            console.warn(`Proxy ${proxyBase} failed:`, error.message);
            lastError = error;
            continue;
        }
    }
    
    console.error('All proxies failed');
    throw lastError || new Error('Не удалось выполнить поиск');
};

/**
 * Получение данных о продукте по штрих-коду
 */
window.getProductByBarcode = async function(barcode) {
    const targetUrl = `${BASE_URL}/api/v2/product/${barcode}.json`;
    
    console.log('Getting product by barcode:', targetUrl);
    
    try {
        // Пробуем прямой запрос сначала
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            signal: AbortSignal.timeout(15000)
        });
        
        if (!response.ok) {
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
        console.warn('Direct request failed for barcode, trying proxy:', error.message);
        return getProductByBarcodeViaProxy(barcode);
    }
};

/**
 * Получение продукта по штрих-коду через прокси (резервный вариант)
 */
async function getProductByBarcodeViaProxy(barcode) {
    const PROXY_URLS = [
        'https://api.allorigins.win/get?url=',
        'https://corsproxy.io/?',
        'https://thingproxy.freeboard.io/fetch/'
    ];
    
    const targetUrl = `${BASE_URL}/api/v2/product/${barcode}.json`;
    
    let lastError = null;
    
    for (const proxyBase of PROXY_URLS) {
        const proxyUrl = `${proxyBase}${encodeURIComponent(targetUrl)}`;
        
        console.log('Trying proxy for barcode:', proxyUrl);
        
        try {
            const response = await fetch(proxyUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                signal: AbortSignal.timeout(10000)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            let data;
            
            // allorigins возвращает данные в поле "contents" как строку
            if (proxyBase.includes('allorigins')) {
                const rawData = await response.json();
                if (!rawData.contents) {
                    throw new Error('Пустой ответ от прокси');
                }
                data = JSON.parse(rawData.contents);
            } else {
                data = await response.json();
            }

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
            console.warn(`Proxy ${proxyBase} failed:`, error.message);
            lastError = error;
            continue;
        }
    }
    
    console.error('All proxies failed for barcode');
    throw lastError || new Error('Не удалось получить продукт');
};