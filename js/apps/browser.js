/**
 * LNChat 浏览器模块
 * 
 * 功能：
 * - 简易网页浏览器
 * - 书签管理
 * - 历史记录
 * - 搜索引擎
 */

import { db, STORES } from '../db.js';
import { generateId, showToast } from '../utils.js';

let container, headerActions;
let appTitleEl = null;
let backBtnEl = null;
let originalBackHandler = null;
let currentView = 'home'; // 'home' | 'browser' | 'bookmarks' | 'history'
let currentUrl = '';

// 默认书签
const DEFAULT_BOOKMARKS = [
    { id: 'bm_1', name: '百度', url: 'https://www.baidu.com', icon: '🔍' },
    { id: 'bm_2', name: '必应', url: 'https://www.bing.com', icon: '🌐' },
    { id: 'bm_3', name: '知乎', url: 'https://www.zhihu.com', icon: '💡' },
    { id: 'bm_4', name: '哔哩哔哩', url: 'https://www.bilibili.com', icon: '📺' },
    { id: 'bm_5', name: '微博', url: 'https://www.weibo.com', icon: '📝' },
    { id: 'bm_6', name: 'GitHub', url: 'https://github.com', icon: '💻' },
    { id: 'bm_7', name: '淘宝', url: 'https://www.taobao.com', icon: '🛒' },
    { id: 'bm_8', name: '京东', url: 'https://www.jd.com', icon: '📦' }
];

// 搜索引擎
const SEARCH_ENGINES = {
    baidu: { name: '百度', url: 'https://www.baidu.com/s?wd=' },
    bing: { name: '必应', url: 'https://www.bing.com/search?q=' },
    google: { name: '谷歌', url: 'https://www.google.com/search?q=' }
};

export async function init(target, actions) {
    container = target;
    headerActions = actions;
    
    appTitleEl = document.getElementById('app-title');
    backBtnEl = document.getElementById('app-back-btn');
    
    if (backBtnEl) {
        originalBackHandler = backBtnEl.onclick;
        backBtnEl.onclick = handleBack;
    }
    
    // 初始化书签数据
    await ensureBookmarksExist();
    
    renderHome();
}

function handleBack() {
    if (currentView === 'browser') {
        currentView = 'home';
        currentUrl = '';
        renderHome();
    } else if (currentView === 'bookmarks' || currentView === 'history') {
        currentView = 'home';
        renderHome();
    } else {
        if (originalBackHandler) {
            originalBackHandler();
        }
    }
}

function updateTitle(title) {
    if (appTitleEl) {
        appTitleEl.textContent = title;
    }
}

// 确保书签数据存在
async function ensureBookmarksExist() {
    try {
        const settings = await db.get(STORES.SETTINGS, 'browser_bookmarks');
        if (!settings || !settings.bookmarks) {
            await db.put(STORES.SETTINGS, {
                key: 'browser_bookmarks',
                bookmarks: DEFAULT_BOOKMARKS
            });
        }
    } catch (e) {
        console.error('初始化书签失败', e);
    }
}

// 获取书签
async function getBookmarks() {
    try {
        const settings = await db.get(STORES.SETTINGS, 'browser_bookmarks');
        return settings?.bookmarks || DEFAULT_BOOKMARKS;
    } catch (e) {
        return DEFAULT_BOOKMARKS;
    }
}

// 保存书签
async function saveBookmarks(bookmarks) {
    await db.put(STORES.SETTINGS, {
        key: 'browser_bookmarks',
        bookmarks
    });
}

// 获取历史记录
async function getHistory() {
    try {
        const settings = await db.get(STORES.SETTINGS, 'browser_history');
        return settings?.history || [];
    } catch (e) {
        return [];
    }
}

// 添加历史记录
async function addHistory(url, title) {
    const history = await getHistory();
    const newEntry = {
        id: generateId(),
        url,
        title,
        visitedAt: new Date().toISOString()
    };
    
    // 去重，只保留最新的
    const filtered = history.filter(h => h.url !== url);
    filtered.unshift(newEntry);
    
    // 只保留最近100条
    const limited = filtered.slice(0, 100);
    
    await db.put(STORES.SETTINGS, {
        key: 'browser_history',
        history: limited
    });
}

// 清空历史记录
async function clearHistory() {
    await db.put(STORES.SETTINGS, {
        key: 'browser_history',
        history: []
    });
}

// 渲染主页
async function renderHome() {
    currentView = 'home';
    updateTitle('浏览器');
    
    const bookmarks = await getBookmarks();
    const history = await getHistory();
    const recentHistory = history.slice(0, 4);
    
    headerActions.innerHTML = `
        <button class="add-btn" id="bookmarks-btn" title="书签">⭐</button>
        <button class="add-btn" id="history-btn" title="历史记录" style="margin-left: 8px;">📜</button>
    `;
    
    container.innerHTML = `
        <div class="browser-container" style="padding: 20px;">
            <!-- 搜索栏 -->
            <div style="background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 24px; padding: 12px 20px; display: flex; align-items: center; gap: 12px; margin-bottom: 25px;">
                <span style="font-size: 20px;">🔍</span>
                <input type="text" id="browser-search-input" placeholder="搜索或输入网址" style="flex: 1; background: transparent; border: none; color: white; font-size: 16px; outline: none;">
                <button id="browser-go-btn" style="background: var(--primary-color); border: none; border-radius: 50%; width: 36px; height: 36px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                    →
                </button>
            </div>
            
            <!-- 快捷方式 -->
            <div style="margin-bottom: 25px;">
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 15px;">快捷方式</div>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px;">
                    ${bookmarks.slice(0, 8).map(bm => `
                        <div class="quick-link" data-url="${bm.url}" style="display: flex; flex-direction: column; align-items: center; cursor: pointer;">
                            <div style="width: 56px; height: 56px; border-radius: 16px; background: var(--glass-bg); border: 1px solid var(--glass-border); display: flex; align-items: center; justify-content: center; font-size: 24px; margin-bottom: 8px; transition: all 0.3s;">
                                ${bm.icon || '🌐'}
                            </div>
                            <span style="font-size: 12px; color: white; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70px;">${bm.name}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- 最近访问 -->
            ${recentHistory.length > 0 ? `
                <div style="margin-bottom: 25px;">
                    <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 15px;">最近访问</div>
                    <div style="background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 16px; overflow: hidden;">
                        ${recentHistory.map((h, i) => `
                            <div class="history-item" data-url="${h.url}" style="display: flex; align-items: center; padding: 14px; cursor: pointer; ${i < recentHistory.length - 1 ? 'border-bottom: 1px solid var(--glass-border);' : ''} transition: background 0.2s;">
                                <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; margin-right: 12px;">
                                    🌐
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-size: 14px; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${h.title || h.url}</div>
                                    <div style="font-size: 12px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${h.url}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <!-- 提示 -->
            <div style="text-align: center; padding: 30px; color: var(--text-secondary);">
                <div style="font-size: 48px; margin-bottom: 15px;">🌐</div>
                <div style="font-size: 14px;">由于浏览器安全限制，部分网站可能无法在内嵌框架中加载</div>
                <div style="font-size: 12px; margin-top: 8px; opacity: 0.7;">可尝试访问支持嵌入的网站</div>
            </div>
        </div>
    `;
    
    // 绑定事件
    document.getElementById('bookmarks-btn').onclick = () => renderBookmarks();
    document.getElementById('history-btn').onclick = () => renderHistory();
    
    const searchInput = document.getElementById('browser-search-input');
    const goBtn = document.getElementById('browser-go-btn');
    
    const handleSearch = () => {
        const input = searchInput.value.trim();
        if (!input) return;
        
        let url = input;
        
        // 判断是否为URL
        if (!input.includes('.') || input.includes(' ')) {
            // 使用搜索引擎
            url = SEARCH_ENGINES.bing.url + encodeURIComponent(input);
        } else if (!input.startsWith('http://') && !input.startsWith('https://')) {
            url = 'https://' + input;
        }
        
        navigateTo(url);
    };
    
    goBtn.onclick = handleSearch;
    searchInput.onkeypress = (e) => {
        if (e.key === 'Enter') handleSearch();
    };
    
    container.querySelectorAll('.quick-link').forEach(link => {
        link.onclick = () => navigateTo(link.dataset.url);
        link.onmouseenter = () => {
            link.querySelector('div').style.background = 'rgba(255,255,255,0.15)';
            link.querySelector('div').style.transform = 'scale(1.05)';
        };
        link.onmouseleave = () => {
            link.querySelector('div').style.background = 'var(--glass-bg)';
            link.querySelector('div').style.transform = 'scale(1)';
        };
    });
    
    container.querySelectorAll('.history-item').forEach(item => {
        item.onclick = () => navigateTo(item.dataset.url);
        item.onmouseenter = () => item.style.background = 'rgba(255,255,255,0.1)';
        item.onmouseleave = () => item.style.background = 'transparent';
    });
}

// 导航到指定URL
async function navigateTo(url) {
    currentUrl = url;
    currentView = 'browser';
    
    // 尝试从URL提取域名作为标题
    let title = url;
    try {
        const urlObj = new URL(url);
        title = urlObj.hostname;
    } catch (e) {}
    
    updateTitle(title);
    
    // 添加到历史记录
    await addHistory(url, title);
    
    headerActions.innerHTML = `
        <button class="add-btn" id="refresh-btn" title="刷新">🔄</button>
        <button class="add-btn" id="add-bookmark-btn" title="添加书签" style="margin-left: 8px;">⭐</button>
        <button class="add-btn" id="open-external-btn" title="在新窗口打开" style="margin-left: 8px;">🔗</button>
    `;
    
    container.innerHTML = `
        <div class="browser-view" style="height: 100%; display: flex; flex-direction: column;">
            <!-- URL栏 -->
            <div style="padding: 10px; background: rgba(0,0,0,0.2); border-bottom: 1px solid var(--glass-border); display: flex; align-items: center; gap: 10px;">
                <div style="flex: 1; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 20px; padding: 8px 15px; display: flex; align-items: center; gap: 8px;">
                    <span style="color: var(--text-secondary);">🔒</span>
                    <span style="flex: 1; font-size: 13px; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${url}</span>
                </div>
            </div>
            
            <!-- 网页内容 -->
            <div style="flex: 1; position: relative; background: white;">
                <iframe id="browser-iframe" src="${url}" style="width: 100%; height: 100%; border: none;" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
                <div id="iframe-loading" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;">
                    <div style="font-size: 36px; margin-bottom: 15px;">⏳</div>
                    <div style="color: #666;">加载中...</div>
                </div>
                <div id="iframe-error" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: none; flex-direction: column; align-items: center; justify-content: center; background: white; text-align: center; padding: 40px;">
                    <div style="font-size: 48px; margin-bottom: 20px;">🚫</div>
                    <div style="font-size: 18px; color: #333; margin-bottom: 10px;">无法加载此页面</div>
                    <div style="font-size: 14px; color: #666; margin-bottom: 20px;">该网站可能不允许在框架中显示</div>
                    <button id="try-external-btn" style="padding: 12px 24px; background: var(--primary-color); border: none; border-radius: 20px; color: white; font-size: 14px; cursor: pointer;">
                        在新窗口中打开
                    </button>
                </div>
            </div>
        </div>
    `;
    
    const iframe = document.getElementById('browser-iframe');
    const loading = document.getElementById('iframe-loading');
    const error = document.getElementById('iframe-error');
    
    // 监听iframe加载
    iframe.onload = () => {
        loading.style.display = 'none';
    };
    
    iframe.onerror = () => {
        loading.style.display = 'none';
        error.style.display = 'flex';
    };
    
    // 5秒后如果还在加载，显示错误提示
    setTimeout(() => {
        try {
            // 尝试访问iframe内容，如果失败则说明跨域
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            if (!doc || !doc.body || doc.body.innerHTML === '') {
                loading.style.display = 'none';
                error.style.display = 'flex';
            }
        } catch (e) {
            loading.style.display = 'none';
            error.style.display = 'flex';
        }
    }, 5000);
    
    // 绑定按钮事件
    document.getElementById('refresh-btn').onclick = () => {
        iframe.src = url;
        loading.style.display = 'block';
        error.style.display = 'none';
    };
    
    document.getElementById('add-bookmark-btn').onclick = async () => {
        const bookmarks = await getBookmarks();
        if (bookmarks.some(b => b.url === url)) {
            showToast('书签已存在');
            return;
        }
        
        const name = prompt('输入书签名称:', title);
        if (name) {
            bookmarks.push({
                id: `bm_${generateId()}`,
                name,
                url,
                icon: '🌐'
            });
            await saveBookmarks(bookmarks);
            showToast('书签已添加');
        }
    };
    
    document.getElementById('open-external-btn').onclick = () => {
        window.open(url, '_blank');
    };
    
    document.getElementById('try-external-btn')?.addEventListener('click', () => {
        window.open(url, '_blank');
    });
}

// 渲染书签页面
async function renderBookmarks() {
    currentView = 'bookmarks';
    updateTitle('书签');
    
    const bookmarks = await getBookmarks();
    
    headerActions.innerHTML = `
        <button class="add-btn" id="add-bookmark-manual-btn" title="添加书签">➕</button>
    `;
    
    container.innerHTML = `
        <div class="bookmarks-container" style="padding: 20px;">
            ${bookmarks.length > 0 ? `
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    ${bookmarks.map(bm => `
                        <div class="bookmark-item" data-id="${bm.id}" data-url="${bm.url}" style="display: flex; align-items: center; padding: 15px; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 14px; cursor: pointer; transition: all 0.3s;">
                            <div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 22px; margin-right: 15px;">
                                ${bm.icon || '🌐'}
                            </div>
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-size: 16px; color: white; font-weight: 500; margin-bottom: 4px;">${bm.name}</div>
                                <div style="font-size: 12px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${bm.url}</div>
                            </div>
                            <button class="delete-bookmark-btn" data-id="${bm.id}" style="background: none; border: none; color: var(--text-secondary); font-size: 18px; cursor: pointer; padding: 8px;">×</button>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <div class="empty-state">
                    <div class="empty-icon">⭐</div>
                    <p>还没有书签</p>
                </div>
            `}
        </div>
    `;
    
    // 绑定事件
    document.getElementById('add-bookmark-manual-btn').onclick = async () => {
        const name = prompt('书签名称:');
        if (!name) return;
        const url = prompt('网址 (URL):');
        if (!url) return;
        
        const bookmarks = await getBookmarks();
        bookmarks.push({
            id: `bm_${generateId()}`,
            name,
            url: url.startsWith('http') ? url : 'https://' + url,
            icon: '🌐'
        });
        await saveBookmarks(bookmarks);
        showToast('书签已添加');
        renderBookmarks();
    };
    
    container.querySelectorAll('.bookmark-item').forEach(item => {
        item.onclick = (e) => {
            if (e.target.classList.contains('delete-bookmark-btn')) return;
            navigateTo(item.dataset.url);
        };
        
        item.onmouseenter = () => {
            item.style.background = 'rgba(255,255,255,0.15)';
            item.style.transform = 'translateX(5px)';
        };
        item.onmouseleave = () => {
            item.style.background = 'var(--glass-bg)';
            item.style.transform = 'translateX(0)';
        };
    });
    
    container.querySelectorAll('.delete-bookmark-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm('确定删除此书签吗？')) {
                const bookmarks = await getBookmarks();
                const filtered = bookmarks.filter(b => b.id !== btn.dataset.id);
                await saveBookmarks(filtered);
                showToast('书签已删除');
                renderBookmarks();
            }
        };
    });
}

// 渲染历史记录页面
async function renderHistory() {
    currentView = 'history';
    updateTitle('历史记录');
    
    const history = await getHistory();
    
    headerActions.innerHTML = `
        <button class="add-btn" id="clear-history-btn" title="清空历史">🗑️</button>
    `;
    
    // 按日期分组
    const grouped = {};
    history.forEach(h => {
        const date = new Date(h.visitedAt).toLocaleDateString('zh-CN');
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(h);
    });
    
    container.innerHTML = `
        <div class="history-container" style="padding: 20px;">
            ${Object.keys(grouped).length > 0 ? `
                ${Object.entries(grouped).map(([date, items]) => `
                    <div style="margin-bottom: 20px;">
                        <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 10px;">${date}</div>
                        <div style="background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 14px; overflow: hidden;">
                            ${items.map((h, i) => `
                                <div class="history-item" data-url="${h.url}" style="display: flex; align-items: center; padding: 14px; cursor: pointer; ${i < items.length - 1 ? 'border-bottom: 1px solid var(--glass-border);' : ''} transition: background 0.2s;">
                                    <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; margin-right: 12px;">
                                        🌐
                                    </div>
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-size: 14px; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${h.title || h.url}</div>
                                        <div style="font-size: 12px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${new Date(h.visitedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            ` : `
                <div class="empty-state">
                    <div class="empty-icon">📜</div>
                    <p>没有历史记录</p>
                </div>
            `}
        </div>
    `;
    
    // 绑定事件
    document.getElementById('clear-history-btn').onclick = async () => {
        if (confirm('确定清空所有历史记录吗？')) {
            await clearHistory();
            showToast('历史记录已清空');
            renderHistory();
        }
    };
    
    container.querySelectorAll('.history-item').forEach(item => {
        item.onclick = () => navigateTo(item.dataset.url);
        item.onmouseenter = () => item.style.background = 'rgba(255,255,255,0.1)';
        item.onmouseleave = () => item.style.background = 'transparent';
    });
}

export function cleanup() {
    if (backBtnEl && originalBackHandler) {
        backBtnEl.onclick = originalBackHandler;
    }
    
    currentView = 'home';
    currentUrl = '';
    appTitleEl = null;
    backBtnEl = null;
    originalBackHandler = null;
}