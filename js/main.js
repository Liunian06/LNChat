/**
 * LNChat 系统核心入口
 */

import { formatTime, formatDate } from './utils.js';
import { db, STORES } from './db.js';

// 应用列表定义
const APPS = [
    { id: 'chat', name: '聊天', icon: '💬' },
    { id: 'contacts', name: '联系人', icon: '👥' },
    { id: 'diary', name: '日记', icon: '📔' },
    { id: 'moments', name: '朋友圈', icon: '🌟' },
    { id: 'memory', name: '记忆', icon: '🧠' },
    { id: 'wallet', name: '钱包', icon: '💳' },
    { id: 'store', name: '商城', icon: '🛒' },
    { id: 'settings', name: '设置', icon: '⚙️' }
];

class LNChatSystem {
    constructor() {
        this.appGrid = document.getElementById('app-grid');
        this.appOverlay = document.getElementById('app-overlay');
        this.appTitle = document.getElementById('app-title');
        this.appContent = document.getElementById('app-content');
        this.backBtn = document.getElementById('app-back-btn');
        
        this.init();
    }

    async init() {
        // 初始化数据库
        await db.init();
        
        // 渲染应用图标
        this.renderAppGrid();
        
        // 启动系统时钟
        this.startClock();
        
        // 初始化电池状态
        this.initBattery();
        
        // 初始化壁纸
        this.initWallpaper();
        
        // 绑定返回按钮
        this.backBtn.onclick = () => this.closeApp();
    }

    renderAppGrid() {
        this.appGrid.innerHTML = APPS.map(app => `
            <div class="app-item" data-id="${app.id}">
                <div class="app-icon">${app.icon}</div>
                <div class="app-name">${app.name}</div>
            </div>
        `).join('');

        this.appGrid.querySelectorAll('.app-item').forEach(item => {
            item.onclick = () => this.openApp(item.dataset.id);
        });
    }

    async openApp(appId) {
        const app = APPS.find(a => a.id === appId);
        if (!app) return;

        this.appTitle.textContent = app.name;
        this.appOverlay.style.display = 'flex';
        this.appContent.innerHTML = '<div class="loading">正在加载...</div>';

        // 动态加载应用模块
        try {
            let module;
            if (['moments', 'memory', 'wallet', 'store'].includes(appId)) {
                module = await import(`./apps/placeholder.js`);
            } else {
                module = await import(`./apps/${appId}.js`);
            }
            
            if (module.init) {
                module.init(this.appContent, document.getElementById('header-actions'));
            }
        } catch (error) {
            console.error(`加载应用 ${appId} 失败:`, error);
            this.appContent.innerHTML = `<div class="error">应用加载失败: ${error.message}</div>`;
        }
    }

    closeApp() {
        this.appOverlay.style.display = 'none';
        this.appContent.innerHTML = '';
        document.getElementById('header-actions').innerHTML = '';
    }

    startClock() {
        const update = () => {
            const now = new Date();
            document.getElementById('status-time').textContent = formatTime(now);
            document.getElementById('big-clock').textContent = formatTime(now);
            document.getElementById('big-date').textContent = formatDate(now);
        };
        update();
        setInterval(update, 1000);
    }

    initBattery() {
        const batteryText = document.getElementById('status-battery');
        const batteryLevel = document.getElementById('battery-level');

        const updateUI = (level) => {
            const percentage = Math.round(level * 100);
            batteryText.textContent = `${percentage}%`;
            batteryLevel.style.width = `${percentage}%`;
            
            if (percentage <= 20) {
                batteryLevel.classList.add('low');
            } else {
                batteryLevel.classList.remove('low');
            }
        };

        if ('getBattery' in navigator) {
            navigator.getBattery().then(battery => {
                const update = () => updateUI(battery.level);
                update();
                battery.onlevelchange = update;
            }).catch(() => {
                // Fallback if getBattery fails
                this.simulateBattery(updateUI);
            });
        } else {
            // Fallback if getBattery is not supported
            this.simulateBattery(updateUI);
        }
    }

    simulateBattery(callback) {
        // 模拟电量：从 95% 开始，每分钟减少一点，或者只是保持一个合理的值
        let level = 0.95;
        callback(level);
        
        // 每 30 秒模拟一次微小的电量变化，让用户看到“实时变化”
        setInterval(() => {
            level -= 0.001;
            if (level < 0.05) level = 0.95; // 循环模拟
            callback(level);
        }, 30000);
    }

    async initWallpaper() {
        const wallpaper = document.getElementById('wallpaper');
        try {
            const response = await fetch('https://bing.biturl.top/?resolution=1920&index=0&mkt=zh-CN');
            const data = await response.json();
            if (data.url) {
                wallpaper.style.backgroundImage = `url(${data.url})`;
            }
        } catch (e) {
            console.error('壁纸加载失败', e);
            wallpaper.style.backgroundColor = '#2196F3';
        }
    }
}

// 启动系统
window.addEventListener('DOMContentLoaded', () => {
    window.lnChat = new LNChatSystem();
});
