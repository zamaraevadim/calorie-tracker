// ==================== calculator.js - Расчёты КБЖУ ====================

const CALORIES_PER_GRAM = {
    protein: 4,
    fat: 9,
    carbs: 4
};

// Округление до указанного количества знаков
function roundTo(num, decimals = 1) {
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

// Расчёт КБЖУ для порции
function calculatePortionNutrients(product, grams) {
    const factor = grams / 100;
    return {
        calories: roundTo((product.caloriesPer100g || 0) * factor),
        protein: roundTo((product.proteinPer100g || 0) * factor),
        fat: roundTo((product.fatPer100g || 0) * factor),
        carbs: roundTo((product.carbsPer100g || 0) * factor)
    };
}

// Расчёт калорий из БЖУ
function calculateCaloriesFromMacros(protein, fat, carbs) {
    return (protein * CALORIES_PER_GRAM.protein) + 
           (fat * CALORIES_PER_GRAM.fat) + 
           (carbs * CALORIES_PER_GRAM.carbs);
}

// Валидация и корректировка КБЖУ целей
// Режим 1: введены БЖУ -> считаем калории
// Режим 2: введены калории -> подгоняем БЖУ пропорционально
function validateAndAdjustGoals(inputGoals, mode = 'auto') {
    const { calories, protein, fat, carbs } = inputGoals;
    
    // Считаем калории из введённых БЖУ
    const calculatedCalories = calculateCaloriesFromMacros(protein, fat, carbs);
    
    let result = {};
    
    if (mode === 'macros-to-calories' || 
        (mode === 'auto' && calories === undefined)) {
        // Режим 1: введены БЖУ, считаем калории
        result = {
            protein: parseFloat(protein) || 0,
            fat: parseFloat(fat) || 0,
            carbs: parseFloat(carbs) || 0,
            calories: roundTo(calculatedCalories)
        };
    } else if (mode === 'calories-to-macros' || 
               (mode === 'auto' && calories > 0 && calculatedCalories === 0)) {
        // Режим 2: введены только калории, используем дефолтные пропорции
        const defaultRatios = { protein: 0.3, fat: 0.3, carbs: 0.4 };
        const cal = parseFloat(calories) || 2200;
        
        result = {
            calories: cal,
            protein: roundTo((cal * defaultRatios.protein) / CALORIES_PER_GRAM.protein),
            fat: roundTo((cal * defaultRatios.fat) / CALORIES_PER_GRAM.fat),
            carbs: roundTo((cal * defaultRatios.carbs) / CALORIES_PER_GRAM.carbs)
        };
    } else {
        // Режим 3: введены и калории, и БЖУ -> проверяем совместимость
        const diff = Math.abs(calories - calculatedCalories);
        const tolerance = calories * 0.05; // 5% погрешность
        
        if (diff <= tolerance) {
            // Всё ок, значения совместимы
            result = {
                calories: parseFloat(calories),
                protein: parseFloat(protein),
                fat: parseFloat(fat),
                carbs: parseFloat(carbs)
            };
        } else if (calories > 0) {
            // Подгоняем БЖУ под калории в тех же пропорциях
            const totalMacros = protein + fat + carbs;
            if (totalMacros > 0) {
                const proteinRatio = protein / totalMacros;
                const fatRatio = fat / totalMacros;
                const carbsRatio = carbs / totalMacros;
                
                // Пересчитываем граммы исходя из целевых калорий
                // calories = p*4 + f*9 + c*4, где p:f:c в заданных пропорциях
                const macroCalories = calories;
                const ratioSum = proteinRatio * 4 + fatRatio * 9 + carbsRatio * 4;
                const factor = macroCalories / ratioSum;
                
                result = {
                    calories: parseFloat(calories),
                    protein: roundTo(proteinRatio * factor),
                    fat: roundTo(fatRatio * factor),
                    carbs: roundTo(carbsRatio * factor)
                };
            } else {
                // Если БЖУ нулевые, используем дефолтные пропорции
                result = validateAndAdjustGoals({ calories }, 'calories-to-macros');
            }
        } else {
            // Если калории не заданы, считаем из БЖУ
            result = validateAndAdjustGoals({ protein, fat, carbs }, 'macros-to-calories');
        }
    }
    
    return result;
}

// Форматирование даты для отображения
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Получение названия дня
function getDayName(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (dateStr === today.toISOString().split('T')[0]) return 'Сегодня';
    if (dateStr === yesterday.toISOString().split('T')[0]) return 'Вчера';
    
    return date.toLocaleDateString('ru-RU', { weekday: 'long' });
}
