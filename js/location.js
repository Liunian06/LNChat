/**
 * LNChat 定位服务模块
 */

import { db, STORES } from './db.js';

export async function getLocation(forceRefresh = false) {
    const settings = await db.get(STORES.SETTINGS, 'ai_settings');
    if (!settings) return null;

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    // 如果有手动设置的城市，优先使用
    if (settings.manualLocation) {
        // 检查是否需要更新时间戳
        if (!settings.locationData ||
            settings.locationData.city !== settings.manualLocation ||
            settings.locationData.isManual !== true) {
            const locationData = {
                city: settings.manualLocation,
                timestamp: now,
                isManual: true
            };
            
            await db.put(STORES.SETTINGS, {
                ...settings,
                locationData
            });
        }
        
        return settings.manualLocation;
    }

    // Check cache
    if (!forceRefresh && settings.locationData && (now - settings.locationData.timestamp < oneDay)) {
        return settings.locationData.city;
    }

    // Fetch new
    try {
        // 新接口: https://myip.ipip.net/
        // 返回格式: 当前 IP：218.17.40.74  来自于：中国 广东 深圳  电信
        const response = await fetch('https://myip.ipip.net/');
        const text = await response.text();
        
        // 解析城市信息
        // 提取 "来自于：" 后面的部分
        let city = '';
        const locationText = text.split('来自于：')[1];
        
        if (locationText) {
            // 分割并过滤空字符串
            let parts = locationText.trim().split(/\s+/);
            
            // 过滤掉 "中国"
            parts = parts.filter(p => p !== '中国');
            
            // 过滤掉常见的运营商关键词
            const ispKeywords = ['电信', '联通', '移动', '铁通', '教育网', '鹏博士', '广电', '宽带', 'ADSL'];
            parts = parts.filter(p => !ispKeywords.some(k => p.includes(k)));
            
            // 取最后一个剩余的部分作为城市
            // 例如: ["广东", "深圳"] -> "深圳"
            // 例如: ["深圳"] -> "深圳"
            if (parts.length > 0) {
                city = parts[parts.length - 1];
            }
        }
        
        if (city) {
            const locationData = {
                city: city,
                timestamp: now,
                isManual: false
            };
            
            // Update settings
            await db.put(STORES.SETTINGS, {
                ...settings,
                locationData
            });
            
            return city;
        }
    } catch (e) {
        console.error('Failed to fetch location:', e);
        // Return cached if available even if expired
        if (settings.locationData) return settings.locationData.city;
        throw e;
    }
    
    return null;
}
