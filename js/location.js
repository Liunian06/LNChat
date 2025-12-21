/**
 * LNChat 定位服务模块
 * 支持多个API源和降级策略
 */

import { db, STORES } from './db.js';

// 定位API配置，按优先级排序
const LOCATION_APIS = [
    {
        name: 'ipwho.is',
        url: 'https://ipwho.is/',
        parseResponse: (data) => {
            // 检查国家是否为中国
            if (data.country !== 'China') {
                throw new Error('检测到您可能在使用VPN或代理，请关闭后重试，或直接访问 ipwho.is');
            }
            return data.city;
        },
        enabled: true
    }
];

// 浏览器原生地理位置API（需要用户授权）
async function getBrowserLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('浏览器不支持地理位置API'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    // 使用反向地理编码服务获取城市名
                    const { latitude, longitude } = position.coords;
                    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=zh-CN`);
                    const data = await response.json();
                    
                    if (data && data.address) {
                        // 尝试获取城市或区县
                        const city = data.address.city || data.address.town || data.address.county || data.address.state;
                        resolve(city);
                    } else {
                        reject(new Error('无法解析地理位置'));
                    }
                } catch (error) {
                    reject(new Error('反向地理编码失败: ' + error.message));
                }
            },
            (error) => {
                reject(new Error('获取地理位置失败: ' + error.message));
            },
            {
                timeout: 10000,
                enableHighAccuracy: false
            }
        );
    });
}

// 尝试使用单个API获取位置
async function tryLocationAPI(api) {
    try {
        console.log(`尝试使用 ${api.name} 获取位置...`);
        const response = await fetch(api.url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*',
            },
            mode: 'cors'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        let city;
        if (api.isTextResponse) {
            const text = await response.text();
            city = api.parseResponse(text);
        } else {
            const data = await response.json();
            city = api.parseResponse(data);
        }
        
        if (city && city.trim()) {
            console.log(`${api.name} 成功获取位置: ${city}`);
            return city.trim();
        } else {
            throw new Error('API返回空的城市信息');
        }
    } catch (error) {
        console.warn(`${api.name} 失败:`, error.message);
        throw error;
    }
}

export async function getLocation(forceRefresh = false) {
    const settings = await db.get(STORES.SETTINGS, 'ai_settings');
    if (!settings) return null;

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    // 检查缓存
    if (!forceRefresh && settings.locationData && (now - settings.locationData.timestamp < oneDay)) {
        console.log('使用缓存的位置数据:', settings.locationData.city);
        return settings.locationData.city;
    }

    // 尝试获取新位置
    let lastError = null;
    let city = null;
    
    // 1. 首先尝试所有可用的IP定位API
    for (const api of LOCATION_APIS) {
        if (!api.enabled) continue;
        
        try {
            city = await tryLocationAPI(api);
            if (city) break;
        } catch (error) {
            lastError = error;
            continue;
        }
    }
    
    // 2. 如果所有IP API都失败，尝试浏览器原生地理位置API
    if (!city) {
        try {
            console.log('尝试使用浏览器原生地理位置API...');
            city = await getBrowserLocation();
        } catch (error) {
            console.warn('浏览器地理位置API失败:', error.message);
            lastError = error;
        }
    }
    
    // 3. 如果所有方法都失败，返回缓存数据（如果有的话）
    if (!city) {
        if (settings.locationData) {
            console.warn('所有定位方法失败，使用过期的缓存数据:', settings.locationData.city);
            return settings.locationData.city;
        } else {
            console.error('无法获取位置信息，且没有缓存数据');
            if (lastError) {
                throw lastError;
            } else {
                throw new Error('所有定位方法都失败了');
            }
        }
    }
    
    // 保存成功获取的位置数据
    const locationData = {
        city: city,
        timestamp: now
    };
    
    try {
        await db.put(STORES.SETTINGS, {
            ...settings,
            locationData
        });
        console.log('位置数据已保存:', city);
    } catch (error) {
        console.error('保存位置数据失败:', error);
    }
    
    return city;
}

// 导出API配置，允许用户在设置中启用/禁用特定的API
export { LOCATION_APIS };
