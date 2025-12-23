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
    { id: 'emoji', name: '表情库', icon: '😊' },
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
        this.currentModule = null; // 当前加载的模块
        
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

        // 初始化气泡样式
        this.initBubbleStyles();
        
        // 初始化壁纸遮罩透明度
        this.initWallpaperOverlay();
        
        // 初始化自定义字体
        this.initCustomFont();
        
        // 绑定返回按钮
        this.backBtn.onclick = () => this.closeApp();
    }

    async renderAppGrid() {
        // 获取自定义图标配置
        let customIcons = {};
        try {
            const settings = await db.get(STORES.SETTINGS, 'ai_settings');
            customIcons = settings?.customAppIcons || {};
        } catch (e) {
            console.error('加载自定义图标配置失败', e);
        }

        // 为每个应用生成HTML
        const appsHtml = await Promise.all(APPS.map(async (app) => {
            let iconHtml = app.icon;
            
            // 检查是否有自定义图标
            if (customIcons[app.id]) {
                const iconData = customIcons[app.id];
                if (iconData.type === 'upload') {
                    // 从IndexedDB加载图片
                    try {
                        const imgData = await db.get(STORES.IMAGES, `app_icon_${app.id}`);
                        if (imgData && imgData.blob) {
                            const url = URL.createObjectURL(imgData.blob);
                            iconHtml = `<img src="${url}" style="width:100%; height:100%; object-fit:cover; border-radius:18px;">`;
                        }
                    } catch (e) {
                        console.error(`加载 ${app.id} 图标失败`, e);
                    }
                } else if (iconData.type === 'url' && iconData.url) {
                    iconHtml = `<img src="${iconData.url}" style="width:100%; height:100%; object-fit:cover; border-radius:18px;">`;
                }
            }
            
            return `
                <div class="app-item" data-id="${app.id}">
                    <div class="app-icon">${iconHtml}</div>
                    <div class="app-name">${app.name}</div>
                </div>
            `;
        }));

        this.appGrid.innerHTML = appsHtml.join('');

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
            if (['wallet', 'store'].includes(appId)) {
                module = await import(`./apps/placeholder.js`);
            } else {
                module = await import(`./apps/${appId}.js`);
            }
            
            this.currentModule = module; // 保存当前模块引用
            
            if (module.init) {
                await module.init(this.appContent, document.getElementById('header-actions'));
            }
        } catch (error) {
            console.error(`加载应用 ${appId} 失败:`, error);
            this.appContent.innerHTML = `<div class="error">应用加载失败: ${error.message}</div>`;
        }
    }

    closeApp() {
        // 调用当前模块的 cleanup 函数（如果存在）
        if (this.currentModule && typeof this.currentModule.cleanup === 'function') {
            this.currentModule.cleanup();
        }
        this.currentModule = null;
        
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
            // 读取设置
            const settings = await db.get(STORES.SETTINGS, 'ai_settings');
            const useBing = settings ? (settings.bingWallpaper !== false) : true; // 默认为 true

            if (useBing) {
                const response = await fetch('https://bing.biturl.top/?resolution=1920&index=0&mkt=zh-CN');
                const data = await response.json();
                if (data.url) {
                    wallpaper.style.backgroundImage = `url(${data.url})`;
                }
            } else {
                // 尝试加载自定义壁纸
                const imgData = await db.get(STORES.IMAGES, 'custom_wallpaper');
                if (imgData && imgData.blob) {
                    const url = URL.createObjectURL(imgData.blob);
                    wallpaper.style.backgroundImage = `url(${url})`;
                } else {
                    // 如果没有自定义壁纸，回退到默认颜色
                    wallpaper.style.backgroundImage = 'none';
                    wallpaper.style.backgroundColor = '#000'; // 使用黑色背景，因为有磨砂玻璃效果
                }
            }
        } catch (e) {
            console.error('壁纸加载失败', e);
            wallpaper.style.backgroundImage = 'none';
            wallpaper.style.backgroundColor = '#2196F3';
        }
    }

    async initBubbleStyles() {
        try {
            const settings = await db.get(STORES.SETTINGS, 'ai_settings');
            if (settings) {
                const root = document.documentElement;
                
                // 1. 应用 CSS 变量 (可视化设置)
                if (settings.bubbleSettings) {
                    const bs = settings.bubbleSettings;
                    
                    if (bs.user) {
                        if (bs.user.bgColor) root.style.setProperty('--user-msg-bg', bs.user.bgColor);
                        if (bs.user.textColor) root.style.setProperty('--user-msg-text', bs.user.textColor);
                        if (bs.user.radius) root.style.setProperty('--user-msg-radius', bs.user.radius + 'px');
                    }
                    
                    if (bs.assistant) {
                        if (bs.assistant.bgColor) root.style.setProperty('--ai-msg-bg', bs.assistant.bgColor);
                        if (bs.assistant.textColor) root.style.setProperty('--ai-msg-text', bs.assistant.textColor);
                        if (bs.assistant.radius) root.style.setProperty('--ai-msg-radius', bs.assistant.radius + 'px');
                    }
                }

                // 2. 应用自定义 CSS (高级设置)
                let styleTag = document.getElementById('custom-bubble-css');
                if (!styleTag) {
                    styleTag = document.createElement('style');
                    styleTag.id = 'custom-bubble-css';
                    document.head.appendChild(styleTag);
                }

                const customCss = settings.customCss || {};
                let cssContent = '';
                
                if (customCss.user) {
                    cssContent += `.message.user { ${customCss.user} } \n`;
                }
                // 普通回复 (<words>)
                if (customCss.assistant) {
                    cssContent += `.message.assistant.text { ${customCss.assistant} } \n`;
                }
                // 动作 (<action>)
                if (customCss.action) {
                    cssContent += `.message.assistant.action { ${customCss.action} } \n`;
                }
                // 思考 (<thought>)
                if (customCss.thought) {
                    cssContent += `.message.assistant.thought { ${customCss.thought} } \n`;
                }
                // 状态 (<state>)
                if (customCss.state) {
                    cssContent += `.message.assistant.state { ${customCss.state} } \n`;
                }

                styleTag.textContent = cssContent;
            }
        } catch (e) {
            console.error('加载气泡样式失败', e);
        }
    }
    
    async initWallpaperOverlay() {
        try {
            const settings = await db.get(STORES.SETTINGS, 'ai_settings');
            if (settings && settings.wallpaperOverlay !== undefined) {
                const overlay = document.querySelector('.wallpaper-overlay');
                if (overlay) {
                    overlay.style.background = `rgba(0, 0, 0, ${settings.wallpaperOverlay})`;
                }
            }
        } catch (e) {
            console.error('加载壁纸遮罩设置失败', e);
        }
    }
    
    async initCustomFont() {
        try {
            const settings = await db.get(STORES.SETTINGS, 'ai_settings');
            if (settings && settings.customFont) {
                const { name, type } = settings.customFont;
                
                if (type === 'upload') {
                    // 从IndexedDB加载字体文件
                    const fontData = await db.get(STORES.IMAGES, 'custom_font');
                    if (fontData && fontData.blob) {
                        await this.loadFont(name, fontData.blob);
                        this.applyFontGlobally(name);
                    }
                } else if (type === 'url' && settings.customFont.url) {
                    // 从URL加载字体
                    await this.loadFont(name, settings.customFont.url);
                    this.applyFontGlobally(name);
                }
            }
        } catch (e) {
            console.error('加载自定义字体失败', e);
        }
    }
    
    async loadFont(fontName, source) {
        try {
            let fontUrl;
            
            if (source instanceof Blob) {
                fontUrl = URL.createObjectURL(source);
            } else {
                fontUrl = source; // 直接使用URL
            }
            
            // 创建 @font-face 规则
            const fontFace = new FontFace(fontName, `url(${fontUrl})`);
            await fontFace.load();
            document.fonts.add(fontFace);
            
            return true;
        } catch (e) {
            console.error('字体加载失败:', e);
            return false;
        }
    }
    
    applyFontGlobally(fontName) {
        document.documentElement.style.setProperty('--custom-font', `"${fontName}", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`);
        document.body.style.fontFamily = `"${fontName}", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    }
}

// 启动系统
window.addEventListener('DOMContentLoaded', () => {
    window.lnChat = new LNChatSystem();
});
