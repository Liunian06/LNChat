import { db, STORES } from './db.js';
import { getCurrentTimestamp } from './utils.js';

export const LOG_TYPES = {
    API: 'api',
    ACTION: 'action',
    ERROR: 'error',
    SETTING: 'setting'
};

export class Logger {
    /**
     * 记录日志
     * @param {string} type - 日志类型 (api, action, error, setting)
     * @param {any} content - 日志内容
     */
    static async log(type, content) {
        try {
            // 获取设置以检查开关
            const settings = await db.get(STORES.SETTINGS, 'ai_settings');
            
            // 默认开启开发者模式
            const isDevMode = settings?.devMode !== false; 
            
            if (!isDevMode) return;

            const logEntry = {
                timestamp: getCurrentTimestamp(),
                type: type,
                content: content
            };

            await db.put(STORES.LOGS, logEntry);
            
            // 随机触发清理 (10% 概率)，避免每次写入都遍历
            if (Math.random() < 0.1) {
                this.cleanup(settings?.logRetention || 7);
            }
        } catch (e) {
            console.error('Logging failed:', e);
        }
    }

    /**
     * 清理过期日志
     * @param {number} days - 保留天数
     */
    static async cleanup(days) {
        try {
            const retentionMs = days * 24 * 60 * 60 * 1000;
            const cutoffDate = new Date(Date.now() - retentionMs);
            const cutoffStr = getCurrentTimestamp(cutoffDate);
            
            // 获取所有日志并筛选过期的
            const logs = await db.getAll(STORES.LOGS);
            for (const log of logs) {
                // 字符串比较: "2023-12-01" < "2023-12-05"
                // 兼容旧的数字时间戳
                let isExpired = false;
                if (typeof log.timestamp === 'number') {
                    isExpired = log.timestamp < (Date.now() - retentionMs);
                } else {
                    isExpired = log.timestamp < cutoffStr;
                }

                if (isExpired) {
                    await db.delete(STORES.LOGS, log.id);
                }
            }
        } catch (e) {
            console.error('Log cleanup failed:', e);
        }
    }
    
    /**
     * 获取所有日志 (按时间倒序)
     */
    static async getLogs() {
        const logs = await db.getAll(STORES.LOGS);
        return logs.sort((a, b) => {
            const tA = typeof a.timestamp === 'number' ? a.timestamp : new Date(a.timestamp).getTime();
            const tB = typeof b.timestamp === 'number' ? b.timestamp : new Date(b.timestamp).getTime();
            return tB - tA;
        });
    }
}
