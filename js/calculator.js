// ==================== calculator.js - Вычисления ====================

/**
 * Округление числа
 */
window.roundTo = function(num, decimals = 1) {
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
};

/**
 * Расчёт КБЖУ для порции
 */
window.calculatePortionNutrients = function(product, grams) {
    const factor = grams / 100;
    
    return {
        calories: (product.caloriesPer100g || 0) * factor,
        protein: (product.proteinPer100g || 0) * factor,
        fat: (product.fatPer100g || 0) * factor,
        carbs: (product.carbsPer100g || 0) * factor
    };
};

/**
 * Расчёт калорий из макронутриентов
 */
window.calculateCaloriesFromMacros = function(protein, fat, carbs) {
    return (protein * 4) + (fat * 9) + (carbs * 4);
};

/**
 * Валидация и корректировка целей
 */
window.validateAndAdjustGoals = function(inputGoals, mode = 'auto') {
    const { calories, protein, fat, carbs } = inputGoals;
    
    // Если режим auto и калории не указаны или равны 0
    if (mode === 'auto' && (!calories || calories <= 0)) {
        // Считаем калории из БЖУ
        const calculatedCalories = window.calculateCaloriesFromMacros(protein, fat, carbs);
        return {
            calories: Math.round(calculatedCalories),
            protein: protein || 0,
            fat: fat || 0,
            carbs: carbs || 0
        };
    }
    
    // Если все значения указаны
    if (calories > 0 && protein > 0 && fat > 0 && carbs > 0) {
        const calculatedCalories = window.calculateCaloriesFromMacros(protein, fat, carbs);
        
        // Если разница больше 5%, подгоняем БЖУ под калории
        if (Math.abs(calculatedCalories - calories) / calories > 0.05) {
            // Пропорции БЖУ
            const totalMacros = protein + fat + carbs;
            if (totalMacros > 0) {
                const proteinRatio = protein / totalMacros;
                const fatRatio = fat / totalMacros;
                const carbsRatio = carbs / totalMacros;
                
                // Целевые калории из каждого макроса (4-9-4)
                const targetProteinCals = calories * 0.3;
                const targetFatCals = calories * 0.3;
                const targetCarbsCals = calories * 0.4;
                
                return {
                    calories: Math.round(calories),
                    protein: window.roundTo(targetProteinCals / 4),
                    fat: window.roundTo(targetFatCals / 9),
                    carbs: window.roundTo(targetCarbsCals / 4)
                };
            }
        }
    }
    
    // Возвращаем как есть
    return {
        calories: Math.round(calories) || 0,
        protein: protein || 0,
        fat: fat || 0,
        carbs: carbs || 0
    };
};

/**
 * Форматирование даты
 */
window.formatDate = function(dateStr) {
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
};

/**
 * Название дня недели
 */
window.getDayName = function(dateStr) {
    const date = new Date(dateStr);
    const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    return days[date.getDay()];
};
