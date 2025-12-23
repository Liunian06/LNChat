
/**
 * LNChat 表情库模块
 */

import { db, STORES } from '../db.js';
import { generateId, showToast } from '../utils.js';

let container, headerActions;
let currentTab = 'global'; // 'global' | 'private'
let currentLibraryId = null;
let emojiCounter = null; // 全局表情ID计数器
let appTitleEl = null; // 标题元素引用
let backBtnEl = null; // 返回按钮引用
let originalBackHandler = null; // 原始返回处理器

// 获取下一个表情ID
async function getNextEmojiId() {
    if (emojiCounter === null) {
        // 从设置中读取计数器
        const settings = await db.get(STORES.SETTINGS, 'emoji_counter');
        emojiCounter = settings?.value || 0;
    }
    emojiCounter++;
    // 保存计数器
    await db.put(STORES.SETTINGS, { key: 'emoji_counter', value: emojiCounter });
    return `emoji-id-${String(emojiCounter).padStart(5, '0')}`;
}

// 获取当前最大的表情ID数字
async function getMaxEmojiIdNumber() {
    const allEmojis = await db.getAll(STORES.EMOJIS);
    let maxNum = 0;
    for (const emoji of allEmojis) {
        if (emoji.id && emoji.id.startsWith('emoji-id-')) {
            const numStr = emoji.id.replace('emoji-id-', '');
            const num = parseInt(numStr, 10);
            if (!isNaN(num) && num > maxNum) {
                maxNum = num;
            }
        }
    }
    return maxNum;
}

// 初始化计数器（确保与现有数据同步）
async function initEmojiCounter() {
    const settings = await db.get(STORES.SETTINGS, 'emoji_counter');
    const maxExisting = await getMaxEmojiIdNumber();
    const savedCounter = settings?.value || 0;
    emojiCounter = Math.max(maxExisting, savedCounter);
    await db.put(STORES.SETTINGS, { key: 'emoji_counter', value: emojiCounter });
}

// 获取表情库绑定的角色名称列表
function getLibraryContactNames(library, contacts) {
    const contactIds = library.contactIds || (library.contactId ? [library.contactId] : []);
    const names = contactIds.map(id => {
        const contact = contacts.find(c => c.id === id);
        return contact?.name || '未知角色';
    });
    return names.length > 0 ? names.join('、') : '无';
}

export async function init(target, actions) {
    container = target;
    headerActions = actions;
    
    // 获取标题和返回按钮引用
    appTitleEl = document.getElementById('app-title');
    backBtnEl = document.getElementById('app-back-btn');
    
    // 保存原始返回处理器
    if (backBtnEl) {
        originalBackHandler = backBtnEl.onclick;
        // 设置自定义返回处理
        backBtnEl.onclick = handleBack;
    }
    
    // 初始化计数器
    await initEmojiCounter();
    
    // 确保全局表情库存在
    await ensureGlobalLibrary();
    
    renderTabs();
}

// 处理返回按钮点击
function handleBack() {
    if (currentTab === 'private' && currentLibraryId) {
        // 在独立表情库详情页，返回到独立表情库列表
        currentLibraryId = null;
        renderCurrentTab();
    } else {
        // 在列表页面，返回主屏幕
        if (originalBackHandler) {
            originalBackHandler();
        }
    }
}

// 更新标题
function updateTitle(title) {
    if (appTitleEl) {
        appTitleEl.textContent = title;
    }
}

// 确保全局表情库存在
async function ensureGlobalLibrary() {
    const libraries = await db.getAll(STORES.EMOJI_LIBRARIES);
    const globalLib = libraries.find(lib => lib.type === 'global');
    
    if (!globalLib) {
        await db.put(STORES.EMOJI_LIBRARIES, {
            id: 'global-library',
            name: '全局表情库',
            type: 'global',
            contactId: null,
            createdAt: new Date().toISOString()
        });
    }
}

function renderTabs() {
    container.innerHTML = `
        <div id="emoji-content" style="height: calc(100% - 50px); overflow-y: auto;"></div>
        <div class="tab-bar" style="height: 50px; display: flex; border-top: 1px solid var(--glass-border); background: rgba(0,0,0,0.2); position: absolute; bottom: 0; width: 100%;">
            <div class="tab-item" id="tab-global" style="flex: 1; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.3s;">
                <span style="font-size: 14px;">🌐 全局表情库</span>
            </div>
            <div class="tab-item" id="tab-private" style="flex: 1; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.3s;">
                <span style="font-size: 14px;">🔒 独立表情库</span>
            </div>
        </div>
    `;

    const updateTabStyles = () => {
        const globalTab = document.getElementById('tab-global');
        const privateTab = document.getElementById('tab-private');
        
        if (currentTab === 'global') {
            globalTab.style.color = 'var(--primary-color)';
            globalTab.style.fontWeight = 'bold';
            privateTab.style.color = 'var(--text-secondary)';
            privateTab.style.fontWeight = 'normal';
        } else {
            globalTab.style.color = 'var(--text-secondary)';
            globalTab.style.fontWeight = 'normal';
            privateTab.style.color = 'var(--primary-color)';
            privateTab.style.fontWeight = 'bold';
        }
    };

    document.getElementById('tab-global').onclick = () => {
        currentTab = 'global';
        currentLibraryId = null;
        updateTabStyles();
        renderCurrentTab();
    };
    
    document.getElementById('tab-private').onclick = () => {
        currentTab = 'private';
        currentLibraryId = null;
        updateTabStyles();
        renderCurrentTab();
    };

    updateTabStyles();
    renderCurrentTab();
}

async function renderCurrentTab() {
    const content = document.getElementById('emoji-content');
    if (currentTab === 'global') {
        await renderGlobalLibrary(content);
    } else {
        if (currentLibraryId) {
            await renderLibraryDetail(content, currentLibraryId);
        } else {
            await renderPrivateLibraries(content);
        }
    }
}

// 渲染全局表情库
async function renderGlobalLibrary(target) {
    const libraries = await db.getAll(STORES.EMOJI_LIBRARIES);
    const globalLib = libraries.find(lib => lib.type === 'global');
    
    if (!globalLib) {
        await ensureGlobalLibrary();
        return renderGlobalLibrary(target);
    }
    
    // 更新标题
    updateTitle('全局表情库');
    
    headerActions.innerHTML = `
        <div style="display: flex; gap: 8px;">
            <button class="add-btn" id="add-emoji-btn" title="添加表情">＋</button>
            <button class="add-btn" id="import-export-btn" title="导入/导出">📦</button>
        </div>
    `;
    
    document.getElementById('add-emoji-btn').onclick = () => showAddEmojiDialog(globalLib.id);
    document.getElementById('import-export-btn').onclick = () => showImportExportDialog(globalLib.id);
    
    await renderEmojiGrid(target, globalLib.id, '全局表情库');
}

// 渲染独立表情库列表
async function renderPrivateLibraries(target) {
    const libraries = await db.getAll(STORES.EMOJI_LIBRARIES);
    const privateLibs = libraries.filter(lib => lib.type === 'private');
    const contacts = await db.getAll(STORES.CONTACTS);
    
    // 更新标题
    updateTitle('独立表情库');
    
    headerActions.innerHTML = `
        <div style="display: flex; gap: 8px;">
            <button class="add-btn" id="add-library-btn" title="创建表情库">＋</button>
            <button class="add-btn" id="import-all-btn" title="导入表情库">📥</button>
        </div>
    `;
    
    document.getElementById('add-library-btn').onclick = () => showCreateLibraryDialog();
    document.getElementById('import-all-btn').onclick = () => showImportNewLibraryDialog();
    
    if (privateLibs.length === 0) {
        target.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📚</div>
                <p>还没有独立表情库</p>
                <p style="font-size: 13px; color: var(--text-secondary); margin-top: 8px;">独立表情库只能被指定的角色使用</p>
                <button id="empty-add-library-btn">创建第一个表情库</button>
            </div>
        `;
        document.getElementById('empty-add-library-btn').onclick = () => showCreateLibraryDialog();
        return;
    }
    
    target.innerHTML = `
        <div class="list-container" style="padding: 10px; padding-bottom: 60px;">
            ${privateLibs.map(lib => {
                const contactNames = getLibraryContactNames(lib, contacts);
                const contactIds = lib.contactIds || (lib.contactId ? [lib.contactId] : []);
                const firstContact = contactIds.length > 0 ? contacts.find(c => c.id === contactIds[0]) : null;
                return `
                    <div class="emoji-library-item" data-id="${lib.id}" style="display: flex; align-items: center; padding: 12px; margin-bottom: 10px; border-radius: 12px; background: var(--glass-bg); border: 1px solid var(--glass-border); cursor: pointer;">
                        <div style="width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; font-size: 28px; margin-right: 12px;">${firstContact?.avatar ? `<img src="${firstContact.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">` : '📁'}</div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-weight: 500; color: white;">${lib.name}</div>
                            <div style="font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">绑定: ${contactNames}</div>
                        </div>
                        <div style="display: flex; gap: 6px; flex-shrink: 0;">
                            <button class="export-library-btn" data-id="${lib.id}" style="padding: 6px 10px; background: rgba(76,175,80,0.2); border: 1px solid var(--glass-border); border-radius: 8px; color: #4CAF50; cursor: pointer; font-size: 12px;">📤</button>
                            <button class="edit-library-btn" data-id="${lib.id}" style="padding: 6px 10px; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 8px; color: white; cursor: pointer; font-size: 12px;">✏️</button>
                            <button class="delete-library-btn" data-id="${lib.id}" style="padding: 6px 10px; background: rgba(244,67,54,0.2); border: 1px solid var(--glass-border); border-radius: 8px; color: #ff5252; cursor: pointer; font-size: 12px;">🗑️</button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    // 直接绑定点击事件到各个按钮，不使用事件委托避免微交互问题
    target.querySelectorAll('.emoji-library-item').forEach(item => {
        // 整个列表项的点击（排除按钮区域）
        item.addEventListener('click', (e) => {
            // 如果点击的是按钮，不处理
            if (e.target.closest('button')) return;
            currentLibraryId = item.dataset.id;
            renderCurrentTab();
        });
    });
    
    target.querySelectorAll('.export-library-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showImportExportDialog(btn.dataset.id);
        });
    });
    
    target.querySelectorAll('.edit-library-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showEditLibraryDialog(btn.dataset.id);
        });
    });
    
    target.querySelectorAll('.delete-library-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await deleteLibrary(btn.dataset.id);
        });
    });
}

// 渲染表情库详情
async function renderLibraryDetail(target, libraryId) {
    const library = await db.get(STORES.EMOJI_LIBRARIES, libraryId);
    
    if (!library) {
        currentLibraryId = null;
        return renderCurrentTab();
    }
    
    // 更新标题为库名称
    updateTitle(library.name);
    
    headerActions.innerHTML = `
        <div style="display: flex; gap: 8px;">
            <button class="add-btn" id="add-emoji-btn" title="添加表情">＋</button>
            <button class="add-btn" id="import-export-btn" title="导入/导出">📦</button>
        </div>
    `;
    
    document.getElementById('add-emoji-btn').onclick = () => showAddEmojiDialog(libraryId);
    document.getElementById('import-export-btn').onclick = () => showImportExportDialog(libraryId);
    
    await renderEmojiGrid(target, libraryId, library.name);
}

// 渲染表情网格
async function renderEmojiGrid(target, libraryId, title) {
    const allEmojis = await db.getAll(STORES.EMOJIS);
    const emojis = allEmojis.filter(e => e.libraryId === libraryId);
    
    if (emojis.length === 0) {
        target.innerHTML = `
            <div style="padding: 20px;">
                <h3 style="margin-bottom: 15px; color: var(--primary-color);">${title}</h3>
            </div>
            <div class="empty-state">
                <div class="empty-icon">😊</div>
                <p>表情库空空如也</p>
                <button id="empty-add-emoji-btn">添加第一个表情</button>
            </div>
        `;
        document.getElementById('empty-add-emoji-btn').onclick = () => showAddEmojiDialog(libraryId);
        return;
    }
    
    target.innerHTML = `
        <div style="padding: 20px; padding-bottom: 80px;">
            <h3 style="margin-bottom: 15px; color: var(--primary-color);">${title}</h3>
            <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 15px;">共 ${emojis.length} 个表情</p>
            <div class="emoji-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
                ${emojis.map(emoji => `
                    <div class="emoji-item" data-id="${emoji.id}" style="position: relative; aspect-ratio: 1; border-radius: 12px; overflow: hidden; background: var(--glass-bg); border: 1px solid var(--glass-border); cursor: pointer;">
                        <img src="${emoji.imageData}" style="width: 100%; height: 100%; object-fit: cover;" alt="${emoji.meaning || emoji.id}">
                        <div class="emoji-overlay" style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.8)); padding: 4px; opacity: 0; transition: opacity 0.2s;">
                            <div style="font-size: 10px; color: white; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${emoji.meaning || '无描述'}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    // 添加悬停效果
    target.querySelectorAll('.emoji-item').forEach(item => {
        item.onmouseenter = () => {
            item.querySelector('.emoji-overlay').style.opacity = '1';
        };
        item.onmouseleave = () => {
            item.querySelector('.emoji-overlay').style.opacity = '0';
        };
        item.onclick = () => showEmojiDetail(item.dataset.id);
    });
}

// 显示添加表情对话框
function showAddEmojiDialog(libraryId) {
    const dialog = document.createElement('div');
    dialog.className = 'emoji-dialog';
    dialog.innerHTML = `
        <div class="emoji-dialog-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 3000; display: flex; align-items: center; justify-content: center;">
            <div class="emoji-dialog-content" style="background: rgba(40,40,40,0.98); border: 1px solid var(--glass-border); border-radius: 20px; padding: 24px; width: 90%; max-width: 400px; max-height: 80vh; overflow-y: auto;">
                <h3 style="margin-bottom: 20px; color: white;">添加表情</h3>
                
                <div class="emoji-upload-area" id="emoji-upload-area" style="width: 100%; height: 200px; border: 2px dashed var(--glass-border); border-radius: 15px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; margin-bottom: 20px; transition: all 0.3s;">
                    <div id="upload-preview" style="display: none; width: 100%; height: 100%; position: relative;">
                        <img id="preview-img" style="width: 100%; height: 100%; object-fit: contain; border-radius: 13px;">
                    </div>
                    <div id="upload-placeholder" style="text-align: center;">
                        <span style="font-size: 48px;">📷</span>
                        <p style="color: var(--text-secondary); margin-top: 10px;">点击或拖拽上传图片</p>
                    </div>
                </div>
                <input type="file" id="emoji-file-input" accept="image/*" style="display: none;">
                
                <div class="input-group" style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; color: var(--text-secondary);">表情含义 (方便AI理解)</label>
                    <input type="text" id="emoji-meaning" placeholder="例如: 开心、难过、生气..." style="width: 100%; padding: 12px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.08); border-radius: 10px; color: white; font-size: 14px;">
                </div>
                
                <div style="display: flex; gap: 12px;">
                    <button id="emoji-save-btn" style="flex: 1; padding: 14px; background: var(--primary-color); border: none; border-radius: 12px; color: white; font-weight: 600; cursor: pointer;">保存</button>
                    <button id="emoji-cancel-btn" style="flex: 1; padding: 14px; background: rgba(255,255,255,0.1); border: 1px solid var(--glass-border); border-radius: 12px; color: white; cursor: pointer;">取消</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    const uploadArea = document.getElementById('emoji-upload-area');
    const fileInput = document.getElementById('emoji-file-input');
    const previewContainer = document.getElementById('upload-preview');
    const previewImg = document.getElementById('preview-img');
    const placeholder = document.getElementById('upload-placeholder');
    
    let selectedFile = null;
    
    uploadArea.onclick = () => fileInput.click();
    
    uploadArea.ondragover = (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--primary-color)';
        uploadArea.style.background = 'rgba(33,150,243,0.1)';
    };
    
    uploadArea.ondragleave = () => {
        uploadArea.style.borderColor = 'var(--glass-border)';
        uploadArea.style.background = 'transparent';
    };
    
    uploadArea.ondrop = (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--glass-border)';
        uploadArea.style.background = 'transparent';
        
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            handleImageFile(file);
        }
    };
    
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            handleImageFile(file);
        }
    };
    
    function handleImageFile(file) {
        if (file.size > 20 * 1024 * 1024) {
            showToast('图片大小不能超过 20MB');
            return;
        }
        
        selectedFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImg.src = e.target.result;
            previewContainer.style.display = 'block';
            placeholder.style.display = 'none';
        };
        reader.readAsDataURL(file);
    }
    
    document.getElementById('emoji-save-btn').onclick = async () => {
        if (!selectedFile) {
            showToast('请选择图片');
            return;
        }
        
        const meaning = document.getElementById('emoji-meaning').value.trim();
        
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const emojiId = await getNextEmojiId();
                
                await db.put(STORES.EMOJIS, {
                    id: emojiId,
                    libraryId: libraryId,
                    imageData: e.target.result,
                    meaning: meaning,
                    createdAt: new Date().toISOString()
                });
                
                document.body.removeChild(dialog);
                showToast('表情添加成功');
                renderCurrentTab();
            };
            reader.readAsDataURL(selectedFile);
        } catch (err) {
            console.error(err);
            showToast('保存失败: ' + err.message);
        }
    };
    
    document.getElementById('emoji-cancel-btn').onclick = () => {
        document.body.removeChild(dialog);
    };
    
    dialog.querySelector('.emoji-dialog-overlay').onclick = (e) => {
        if (e.target === dialog.querySelector('.emoji-dialog-overlay')) {
            document.body.removeChild(dialog);
        }
    };
}

// 显示表情详情
async function showEmojiDetail(emojiId) {
    const emoji = await db.get(STORES.EMOJIS, emojiId);
    if (!emoji) return;
    
    const dialog = document.createElement('div');
    dialog.className = 'emoji-dialog';
    dialog.innerHTML = `
        <div class="emoji-dialog-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 3000; display: flex; align-items: center; justify-content: center;">
            <div class="emoji-dialog-content" style="background: rgba(40,40,40,0.98); border: 1px solid var(--glass-border); border-radius: 20px; padding: 24px; width: 90%; max-width: 400px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <img src="${emoji.imageData}" style="max-width: 200px; max-height: 200px; border-radius: 15px; object-fit: contain;">
                </div>
                
                <div style="margin-bottom: 15px;">
                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 5px;">表情ID</div>
                    <div style="font-size: 14px; color: white; font-family: monospace; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 6px;">${emoji.id}</div>
                </div>
                
                <div class="input-group" style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; color: var(--text-secondary); font-size: 12px;">表情含义</label>
                    <input type="text" id="edit-emoji-meaning" value="${emoji.meaning || ''}" placeholder="描述这个表情的含义..." style="width: 100%; padding: 12px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.08); border-radius: 10px; color: white; font-size: 14px;">
                </div>
                
                <div style="display: flex; gap: 12px;">
                    <button id="emoji-update-btn" style="flex: 1; padding: 14px; background: var(--primary-color); border: none; border-radius: 12px; color: white; font-weight: 600; cursor: pointer;">保存</button>
                    <button id="emoji-delete-btn" style="padding: 14px 20px; background: rgba(244,67,54,0.8); border: none; border-radius: 12px; color: white; cursor: pointer;">🗑️</button>
                    <button id="emoji-close-btn" style="flex: 1; padding: 14px; background: rgba(255,255,255,0.1); border: 1px solid var(--glass-border); border-radius: 12px; color: white; cursor: pointer;">关闭</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    document.getElementById('emoji-update-btn').onclick = async () => {
        const newMeaning = document.getElementById('edit-emoji-meaning').value.trim();
        emoji.meaning = newMeaning;
        emoji.updatedAt = new Date().toISOString();
        await db.put(STORES.EMOJIS, emoji);
        document.body.removeChild(dialog);
        showToast('保存成功');
        renderCurrentTab();
    };
    
    document.getElementById('emoji-delete-btn').onclick = async () => {
        if (confirm('确定要删除这个表情吗？')) {
            await db.delete(STORES.EMOJIS, emojiId);
            document.body.removeChild(dialog);
            showToast('表情已删除');
            renderCurrentTab();
        }
    };
    
    document.getElementById('emoji-close-btn').onclick = () => {
        document.body.removeChild(dialog);
    };
    
    dialog.querySelector('.emoji-dialog-overlay').onclick = (e) => {
        if (e.target === dialog.querySelector('.emoji-dialog-overlay')) {
            document.body.removeChild(dialog);
        }
    };
}

// 显示创建表情库对话框
async function showCreateLibraryDialog() {
    const contacts = await db.getAll(STORES.CONTACTS);
    
    if (contacts.length === 0) {
        showToast('请先在联系人中创建角色');
        return;
    }
    
    const dialog = document.createElement('div');
    dialog.className = 'emoji-dialog';
    dialog.innerHTML = `
        <div class="emoji-dialog-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 3000; display: flex; align-items: center; justify-content: center;">
            <div class="emoji-dialog-content" style="background: rgba(40,40,40,0.98); border: 1px solid var(--glass-border); border-radius: 20px; padding: 24px; width: 90%; max-width: 400px; max-height: 80vh; overflow-y: auto;">
                <h3 style="margin-bottom: 20px; color: white;">创建独立表情库</h3>
                
                <div class="input-group" style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; color: var(--text-secondary);">表情库名称</label>
                    <input type="text" id="library-name" placeholder="例如: 小美的专属表情" style="width: 100%; padding: 12px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.08); border-radius: 10px; color: white; font-size: 14px;">
                </div>
                
                <div class="input-group" style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; color: var(--text-secondary);">绑定角色 (可多选)</label>
                    <div id="contact-checkboxes" style="max-height: 200px; overflow-y: auto; background: rgba(255,255,255,0.05); border-radius: 10px; padding: 10px;">
                        ${contacts.map(c => `
                            <label style="display: flex; align-items: center; gap: 10px; padding: 8px; cursor: pointer; border-radius: 8px; transition: background 0.2s;">
                                <input type="checkbox" value="${c.id}" style="width: 18px; height: 18px; cursor: pointer;">
                                <span style="color: white; font-size: 14px;">${c.name}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
                
                <div style="display: flex; gap: 12px;">
                    <button id="library-save-btn" style="flex: 1; padding: 14px; background: var(--primary-color); border: none; border-radius: 12px; color: white; font-weight: 600; cursor: pointer;">创建</button>
                    <button id="library-cancel-btn" style="flex: 1; padding: 14px; background: rgba(255,255,255,0.1); border: 1px solid var(--glass-border); border-radius: 12px; color: white; cursor: pointer;">取消</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    document.getElementById('library-save-btn').onclick = async () => {
        const name = document.getElementById('library-name').value.trim();
        const checkboxes = document.querySelectorAll('#contact-checkboxes input[type="checkbox"]:checked');
        const selectedContactIds = Array.from(checkboxes).map(cb => cb.value);
        
        if (!name) {
            showToast('请输入表情库名称');
            return;
        }
        
        if (selectedContactIds.length === 0) {
            showToast('请至少选择一个角色');
            return;
        }
        
        try {
            await db.put(STORES.EMOJI_LIBRARIES, {
                id: generateId(),
                name: name,
                type: 'private',
                contactIds: selectedContactIds,
                createdAt: new Date().toISOString()
            });
            
            document.body.removeChild(dialog);
            showToast('表情库创建成功');
            renderCurrentTab();
        } catch (err) {
            console.error(err);
            showToast('创建失败: ' + err.message);
        }
    };
    
    document.getElementById('library-cancel-btn').onclick = () => {
        document.body.removeChild(dialog);
    };
    
    dialog.querySelector('.emoji-dialog-overlay').onclick = (e) => {
        if (e.target === dialog.querySelector('.emoji-dialog-overlay')) {
            document.body.removeChild(dialog);
        }
    };
}

// 显示编辑表情库对话框
async function showEditLibraryDialog(libraryId) {
    const library = await db.get(STORES.EMOJI_LIBRARIES, libraryId);
    if (!library) return;
    
    const contacts = await db.getAll(STORES.CONTACTS);
    const currentContactIds = library.contactIds || (library.contactId ? [library.contactId] : []);
    
    const dialog = document.createElement('div');
    dialog.className = 'emoji-dialog';
    dialog.innerHTML = `
        <div class="emoji-dialog-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 3000; display: flex; align-items: center; justify-content: center;">
            <div class="emoji-dialog-content" style="background: rgba(40,40,40,0.98); border: 1px solid var(--glass-border); border-radius: 20px; padding: 24px; width: 90%; max-width: 400px; max-height: 80vh; overflow-y: auto;">
                <h3 style="margin-bottom: 20px; color: white;">编辑表情库</h3>
                
                <div class="input-group" style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; color: var(--text-secondary);">表情库名称</label>
                    <input type="text" id="edit-library-name" value="${library.name}" style="width: 100%; padding: 12px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.08); border-radius: 10px; color: white; font-size: 14px;">
                </div>
                
                <div class="input-group" style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; color: var(--text-secondary);">绑定角色 (可多选)</label>
                    <div id="edit-contact-checkboxes" style="max-height: 200px; overflow-y: auto; background: rgba(255,255,255,0.05); border-radius: 10px; padding: 10px;">
                        ${contacts.map(c => `
                            <label style="display: flex; align-items: center; gap: 10px; padding: 8px; cursor: pointer; border-radius: 8px; transition: background 0.2s;">
                                <input type="checkbox" value="${c.id}" ${currentContactIds.includes(c.id) ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;">
                                <span style="color: white; font-size: 14px;">${c.name}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
                
                <div style="display: flex; gap: 12px;">
                    <button id="edit-library-save-btn" style="flex: 1; padding: 14px; background: var(--primary-color); border: none; border-radius: 12px; color: white; font-weight: 600; cursor: pointer;">保存</button>
                    <button id="edit-library-cancel-btn" style="flex: 1; padding: 14px; background: rgba(255,255,255,0.1); border: 1px solid var(--glass-border); border-radius: 12px; color: white; cursor: pointer;">取消</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    document.getElementById('edit-library-save-btn').onclick = async () => {
        const name = document.getElementById('edit-library-name').value.trim();
        const checkboxes = document.querySelectorAll('#edit-contact-checkboxes input[type="checkbox"]:checked');
        const selectedContactIds = Array.from(checkboxes).map(cb => cb.value);
        
        if (!name) {
            showToast('请输入表情库名称');
            return;
        }
        
        if (selectedContactIds.length === 0) {
            showToast('请至少选择一个角色');
            return;
        }
        
        try {
            library.name = name;
            library.contactIds = selectedContactIds;
            delete library.contactId;
            library.updatedAt = new Date().toISOString();
            
            await db.put(STORES.EMOJI_LIBRARIES, library);
            
            document.body.removeChild(dialog);
            showToast('保存成功');
            renderCurrentTab();
        } catch (err) {
            console.error(err);
            showToast('保存失败: ' + err.message);
        }
    };
    
    document.getElementById('edit-library-cancel-btn').onclick = () => {
        document.body.removeChild(dialog);
    };
    
    dialog.querySelector('.emoji-dialog-overlay').onclick = (e) => {
        if (e.target === dialog.querySelector('.emoji-dialog-overlay')) {
            document.body.removeChild(dialog);
        }
    };
}

// 删除表情库
async function deleteLibrary(libraryId) {
    if (!confirm('确定要删除这个表情库吗？库中的所有表情也会被删除。')) {
        return;
    }
    
    try {
        const allEmojis = await db.getAll(STORES.EMOJIS);
        const libraryEmojis = allEmojis.filter(e => e.libraryId === libraryId);
        
        for (const emoji of libraryEmojis) {
            await db.delete(STORES.EMOJIS, emoji.id);
        }
        
        await db.delete(STORES.EMOJI_LIBRARIES, libraryId);
        
        showToast('表情库已删除');
        renderCurrentTab();
    } catch (err) {
        console.error(err);
        showToast('删除失败: ' + err.message);
    }
}

// 显示导入/导出对话框
async function showImportExportDialog(libraryId) {
    const library = await db.get(STORES.EMOJI_LIBRARIES, libraryId);
    if (!library) return;
    
    const dialog = document.createElement('div');
    dialog.className = 'emoji-dialog';
    dialog.innerHTML = `
        <div class="emoji-dialog-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 3000; display: flex; align-items: center; justify-content: center;">
            <div class="emoji-dialog-content" style="background: rgba(40,40,40,0.98); border: 1px solid var(--glass-border); border-radius: 20px; padding: 24px; width: 90%; max-width: 400px;">
                <h3 style="margin-bottom: 20px; color: white;">导入/导出 - ${library.name}</h3>
                
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <button id="export-btn" style="padding: 16px; background: rgba(76,175,80,0.2); border: 1px solid #4CAF50; border-radius: 12px; color: #4CAF50; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;">
                        <span style="font-size: 24px;">📤</span>
                        <span>导出表情库</span>
                    </button>
                    
                    <button id="import-btn" style="padding: 16px; background: rgba(33,150,243,0.2); border: 1px solid #2196F3; border-radius: 12px; color: #2196F3; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;">
                        <span style="font-size: 24px;">📥</span>
                        <span>导入表情到此库</span>
                    </button>
                    
                    <input type="file" id="import-file-input" accept=".json" style="display: none;">
                </div>
                
                <button id="close-dialog-btn" style="width: 100%; margin-top: 20px; padding: 14px; background: rgba(255,255,255,0.1); border: 1px solid var(--glass-border); border-radius: 12px; color: white; cursor: pointer;">关闭</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    document.getElementById('export-btn').onclick = async () => {
        await exportLibrary(libraryId);
        document.body.removeChild(dialog);
    };
    
    document.getElementById('import-btn').onclick = () => {
        document.getElementById('import-file-input').click();
    };
    
    document.getElementById('import-file-input').onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            await importEmojisToLibrary(file, libraryId);
            document.body.removeChild(dialog);
        }
    };
    
    document.getElementById('close-dialog-btn').onclick = () => {
        document.body.removeChild(dialog);
    };
    
    dialog.querySelector('.emoji-dialog-overlay').onclick = (e) => {
        if (e.target === dialog.querySelector('.emoji-dialog-overlay')) {
            document.body.removeChild(dialog);
        }
    };
}

// 显示导入新表情库对话框
async function showImportNewLibraryDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'emoji-dialog';
    dialog.innerHTML = `
        <div class="emoji-dialog-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 3000; display: flex; align-items: center; justify-content: center;">
            <div class="emoji-dialog-content" style="background: rgba(40,40,40,0.98); border: 1px solid var(--glass-border); border-radius: 20px; padding: 24px; width: 90%; max-width: 400px;">
                <h3 style="margin-bottom: 20px; color: white;">导入表情库</h3>
                
                <p style="color: var(--text-secondary); margin-bottom: 20px; font-size: 14px;">
                    选择一个之前导出的表情库文件(.json)来导入。如果表情ID冲突，将自动分配新的ID。
                </p>
                
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <button id="select-import-file-btn" style="padding: 16px; background: rgba(33,150,243,0.2); border: 1px solid #2196F3; border-radius: 12px; color: #2196F3; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;">
                        <span style="font-size: 24px;">📁</span>
                        <span>选择文件</span>
                    </button>
                    
                    <input type="file" id="new-import-file-input" accept=".json" style="display: none;">
                </div>
                
                <button id="close-import-dialog-btn" style="width: 100%; margin-top: 20px; padding: 14px; background: rgba(255,255,255,0.1); border: 1px solid var(--glass-border); border-radius: 12px; color: white; cursor: pointer;">关闭</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    document.getElementById('select-import-file-btn').onclick = () => {
        document.getElementById('new-import-file-input').click();
    };
    
    document.getElementById('new-import-file-input').onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            await importNewLibrary(file);
            document.body.removeChild(dialog);
        }
    };
    
    document.getElementById('close-import-dialog-btn').onclick = () => {
        document.body.removeChild(dialog);
    };
    
    dialog.querySelector('.emoji-dialog-overlay').onclick = (e) => {
        if (e.target === dialog.querySelector('.emoji-dialog-overlay')) {
            document.body.removeChild(dialog);
        }
    };
}

// 导出表情库
async function exportLibrary(libraryId) {
    try {
        const library = await db.get(STORES.EMOJI_LIBRARIES, libraryId);
        const allEmojis = await db.getAll(STORES.EMOJIS);
        const libraryEmojis = allEmojis.filter(e => e.libraryId === libraryId);
        
        const exportData = {
            version: 1,
            exportedAt: new Date().toISOString(),
            library: {
                name: library.name,
                type: library.type,
                contactIds: library.contactIds || (library.contactId ? [library.contactId] : [])
            },
            emojis: libraryEmojis.map(e => ({
                id: e.id,
                imageData: e.imageData,
                meaning: e.meaning,
                createdAt: e.createdAt
            }))
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `emoji-library-${library.name}-${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('导出成功');
    } catch (err) {
        console.error(err);
        showToast('导出失败: ' + err.message);
    }
}

// 导入表情到现有库
async function importEmojisToLibrary(file, libraryId) {
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (!data.emojis || !Array.isArray(data.emojis)) {
            showToast('无效的导入文件格式');
            return;
        }
        
        const existingEmojis = await db.getAll(STORES.EMOJIS);
        const existingIds = new Set(existingEmojis.map(e => e.id));
        
        let importedCount = 0;
        
        for (const emoji of data.emojis) {
            let newId = emoji.id;
            
            if (existingIds.has(newId)) {
                newId = await getNextEmojiId();
            }
            
            await db.put(STORES.EMOJIS, {
                id: newId,
                libraryId: libraryId,
                imageData: emoji.imageData,
                meaning: emoji.meaning || '',
                createdAt: emoji.createdAt || new Date().toISOString(),
                importedAt: new Date().toISOString()
            });
            
            existingIds.add(newId);
            importedCount++;
        }
        
        showToast(`成功导入 ${importedCount} 个表情`);
        renderCurrentTab();
    } catch (err) {
        console.error(err);
        showToast('导入失败: ' + err.message);
    }
}

// 导入新表情库
async function importNewLibrary(file) {
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (!data.library || !data.emojis) {
            showToast('无效的导入文件格式');
            return;
        }
        
        const newLibraryId = generateId();
        
        await db.put(STORES.EMOJI_LIBRARIES, {
            id: newLibraryId,
            name: data.library.name + ' (导入)',
            type: data.library.type === 'global' ? 'private' : data.library.type,
            contactIds: [],
            createdAt: new Date().toISOString(),
            importedAt: new Date().toISOString()
        });
        
        const existingEmojis = await db.getAll(STORES.EMOJIS);
        const existingIds = new Set(existingEmojis.map(e => e.id));
        
        let importedCount = 0;
        
        for (const emoji of data.emojis) {
            let newId = emoji.id;
            
            if (existingIds.has(newId)) {
                newId = await getNextEmojiId();
            }
            
            await db.put(STORES.EMOJIS, {
                id: newId,
                libraryId: newLibraryId,
                imageData: emoji.imageData,
                meaning: emoji.meaning || '',
                createdAt: emoji.createdAt || new Date().toISOString(),
                importedAt: new Date().toISOString()
            });
            
            existingIds.add(newId);
            importedCount++;
        }
        
        showToast(`成功导入表情库，包含 ${importedCount} 个表情`);
        renderCurrentTab();
    } catch (err) {
        console.error(err);
        showToast('导入失败: ' + err.message);
    }
}

export function cleanup() {
    // 恢复原始返回处理器
    if (backBtnEl && originalBackHandler) {
        backBtnEl.onclick = originalBackHandler;
    }
    
    currentTab = 'global';
    currentLibraryId = null;
    appTitleEl = null;
    backBtnEl = null;
    originalBackHandler = null;
}