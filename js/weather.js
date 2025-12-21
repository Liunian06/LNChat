/**
 * LNChat 天气服务模块
 */

import { db, STORES } from './db.js';

export async function getWeather(city, forceRefresh = false) {
    if (!city) return null;

    const settings = await db.get(STORES.SETTINGS, 'ai_settings');
    if (!settings) return null;

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    // Check cache
    if (!forceRefresh && settings.weatherData && settings.weatherData.city === city && (now - settings.weatherData.timestamp < oneDay)) {
        return settings.weatherData;
    }

    // Convert city to Pinyin
    let cityPinyin = city;
    if (window.pinyinPro) {
        // pinyinPro.pinyin('深圳', { toneType: 'none', type: 'array' }) -> ['shen', 'zhen']
        const pinyinArray = window.pinyinPro.pinyin(city, { toneType: 'none', type: 'array' });
        if (Array.isArray(pinyinArray)) {
            cityPinyin = pinyinArray.join('');
            // Capitalize first letter
            if (cityPinyin.length > 0) {
                cityPinyin = cityPinyin.charAt(0).toUpperCase() + cityPinyin.slice(1);
            }
        }
    } else {
        console.warn('pinyin-pro not loaded');
    }

    try {
        const response = await fetch(`https://goweather.herokuapp.com/weather/${cityPinyin}`);
        if (!response.ok) throw new Error('Weather API error');
        
        const data = await response.json();
        
        if (data && (data.temperature || data.description)) {
            const weatherData = {
                city: city,
                cityPinyin: cityPinyin,
                temperature: data.temperature,
                description: data.description,
                wind: data.wind,
                forecast: data.forecast,
                timestamp: now
            };
            
            // Update settings
            await db.put(STORES.SETTINGS, {
                ...settings,
                weatherData
            });
            
            return weatherData;
        }
    } catch (e) {
        console.error('Failed to fetch weather:', e);
        // Return cached if available and same city
        if (settings.weatherData && settings.weatherData.city === city) {
            return settings.weatherData;
        }
    }
    
    return null;
}
