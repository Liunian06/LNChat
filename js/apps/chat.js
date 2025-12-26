/**
 * LNChat 聊天模块
 */

import { db, STORES } from '../db.js';
import { formatTime, simpleMarkdown, showToast, generateId, getDefaultSystemPrompt, getGroupPrompt, getCurrentTimestamp, formatDate } from '../utils.js';
import { getLocation } from '../location.js';
import { getWeather } from '../weather.js';
import { Logger, LOG_TYPES } from '../logger.js';

// 表情包缓存，用于快速查找
let emojiCache = null;

let container, headerActions;
let currentChatId = null;
let messageTimer = null;
let isManageMode = false;
let selectedSessions = new Set();
let isMessageManageMode = false;
let selectedMessages = new Set();
let currentStatus = null; // 当前显示的状态

export async function init(target, actions) {
    container = target;
    headerActions = actions;
    isManageMode = false;
    selectedSessions.clear();
    // 移除全量加载表情包，改为按需加载
    // await loadEmojiCache();
    renderMainSessionList();
}

/**
 * 加载单一表情包到缓存
 */
async function loadEmojiToCache(emojiId) {
    if (!emojiCache) emojiCache = {};
    if (emojiCache[emojiId]) return emojiCache[emojiId];
    
    try {
        const emoji = await db.get(STORES.EMOJIS, emojiId);
        if (emoji) {
            // 如果是 Blob，转换为 URL 以便显示
            if (emoji.imageData instanceof Blob) {
                emoji.imageUrl = URL.createObjectURL(emoji.imageData);
            } else {
                emoji.imageUrl = emoji.imageData; // 兼容旧 Base64
            }
            emojiCache[emojiId] = emoji;
        }
        return emoji;
    } catch(e) {
        console.error('Failed to load emoji:', emojiId, e);
        return null;
    }
}

/**
 * 获取指定角色可用的表情包列表（用于 AI 的 system prompt）
 * 包含：全局表情库 + 角色绑定的独立表情库 + 角色单独授权的表情包
 * @param {string} contactId - 角色ID
 * @returns {Promise<Array>} 表情包列表，包含id和meaning
 */
async function getAvailableEmojisForContact(contactId) {
    const allLibraries = await db.getAll(STORES.EMOJI_LIBRARIES);
    const allEmojis = await db.getAll(STORES.EMOJIS);
    const contact = await db.get(STORES.CONTACTS, contactId);
    
    // 更新缓存
    emojiCache = {};
    for (const emoji of allEmojis) {
        emojiCache[emoji.id] = emoji;
    }
    
    // 找到全局表情库
    const globalLibrary = allLibraries.find(lib => lib.type === 'global');
    
    // 找到该角色可以使用的独立表情库
    const privateLibraries = allLibraries.filter(lib => {
        if (lib.type !== 'private') return false;
        const contactIds = lib.contactIds || (lib.contactId ? [lib.contactId] : []);
        return contactIds.includes(contactId);
    });
    
    // 收集可用的表情库ID
    const availableLibraryIds = [];
    if (globalLibrary) {
        availableLibraryIds.push(globalLibrary.id);
    }
    for (const lib of privateLibraries) {
        availableLibraryIds.push(lib.id);
    }
    
    // 获取所有可用的表情（从表情库）
    const availableEmojis = allEmojis.filter(emoji =>
        availableLibraryIds.includes(emoji.libraryId)
    );
    
    // 添加角色单独授权的表情包
    const authorizedEmojiIds = contact?.authorizedEmojiIds || [];
    for (const emojiId of authorizedEmojiIds) {
        const emoji = emojiCache[emojiId];
        if (emoji && !availableEmojis.find(e => e.id === emojiId)) {
            availableEmojis.push(emoji);
        }
    }
    
    // 按ID升序排列
    availableEmojis.sort((a, b) => {
        const numA = parseInt(a.id.replace('emoji-id-', ''), 10);
        const numB = parseInt(b.id.replace('emoji-id-', ''), 10);
        return numA - numB;
    });
    
    return availableEmojis;
}

/**
 * 获取所有表情包（用于用户选择器，不受权限限制）
 * @returns {Promise<Array>} 所有表情包列表
 */
async function getAllEmojis() {
    const allEmojis = await db.getAll(STORES.EMOJIS);
    
    // 更新缓存
    emojiCache = {};
    for (const emoji of allEmojis) {
        emojiCache[emoji.id] = emoji;
    }
    
    // 按ID升序排列
    allEmojis.sort((a, b) => {
        const numA = parseInt(a.id.replace('emoji-id-', ''), 10);
        const numB = parseInt(b.id.replace('emoji-id-', ''), 10);
        return numA - numB;
    });
    
    return allEmojis;
}

/**
 * 检查表情包是否在角色的可用列表中
 * @param {string} emojiId - 表情包ID
 * @param {string} contactId - 角色ID
 * @returns {Promise<boolean>} 是否可用
 */
async function isEmojiAvailableForContact(emojiId, contactId) {
    const availableEmojis = await getAvailableEmojisForContact(contactId);
    return availableEmojis.some(e => e.id === emojiId);
}

/**
 * 为群聊所有成员授权表情包
 * @param {string} emojiId - 表情包ID
 * @param {object} session - 会话对象
 */
async function authorizeEmojiForGroup(emojiId, session) {
    if (!session || session.type !== 'group' || !session.contactIds) return;
    
    let authorizedCount = 0;
    
    for (const cid of session.contactIds) {
        // 检查是否已授权，避免重复操作数据库
        const isAvailable = await isEmojiAvailableForContact(emojiId, cid);
        if (!isAvailable) {
            await authorizeEmojiForContact(emojiId, cid);
            authorizedCount++;
        }
    }
    
    if (authorizedCount > 0) {
        const emoji = emojiCache ? emojiCache[emojiId] : null;
        const emojiName = emoji?.meaning || emojiId;
        // 避免太频繁的提示，或者提示内容更通用
        console.log(`已为群成员开通表情包: ${emojiName}`);
    }
}

/**
 * 为角色授权表情包
 * @param {string} emojiId - 表情包ID
 * @param {string} contactId - 角色ID
 */
async function authorizeEmojiForContact(emojiId, contactId) {
    const contact = await db.get(STORES.CONTACTS, contactId);
    if (!contact) return;
    
    // 初始化授权列表
    if (!contact.authorizedEmojiIds) {
        contact.authorizedEmojiIds = [];
    }
    
    // 如果还没有授权，则添加
    if (!contact.authorizedEmojiIds.includes(emojiId)) {
        contact.authorizedEmojiIds.push(emojiId);
        await db.put(STORES.CONTACTS, contact);
    }
}

/**
 * 构建可用表情包列表字符串（用于添加到 system prompt）
 * @param {string} contactId - 角色ID
 * @returns {Promise<string>} 表情包列表字符串
 */
async function buildEmojiListForPrompt(contactId) {
    const emojis = await getAvailableEmojisForContact(contactId);
    
    if (emojis.length === 0) {
        return '';
    }
    
    let listStr = '\n\n以下是可用表情包列表：\n';
    for (const emoji of emojis) {
        const meaning = emoji.meaning || '无描述';
        listStr += `${emoji.id}：${meaning}\n`;
    }
    
    return listStr;
}

/**
 * 根据表情ID获取表情图片URL (支持异步)
 * 注意：由于渲染是同步的，对于未缓存的图片，首次可能会显示 loading 或占位符
 */
function getEmojiImageUrl(emojiId) {
    if (emojiCache && emojiCache[emojiId]) {
        return emojiCache[emojiId].imageUrl || emojiCache[emojiId].imageData;
    }
    // 触发异步加载，下次渲染时可用，这里返回 null 显示 loading
    loadEmojiToCache(emojiId).then(emoji => {
        if (emoji) {
            // 找到所有需要显示该表情的元素并更新
            const imgs = document.querySelectorAll(`img[data-emoji-id="${emojiId}"]`);
            imgs.forEach(img => {
                img.src = emoji.imageUrl || emoji.imageData;
                img.classList.remove('emoji-loading');
            });
        }
    });
    return null;
}

function toggleManageMode(enable) {
    isManageMode = enable;
    if (!enable) {
        selectedSessions.clear();
    }
    renderMainSessionList();
}

/**
 * 一级菜单：全局会话列表
 */
async function renderMainSessionList() {
    // 限制加载数量，避免卡顿。更完善的方案是实现滚动加载或虚拟列表
    const SESSION_LIMIT = 50;
    const sessions = await db.getAll(STORES.SESSIONS, SESSION_LIMIT);
    const contacts = await db.getAll(STORES.CONTACTS); // 联系人通常不会太多，暂不分页
    const contactMap = Object.fromEntries(contacts.map(c => [c.id, c]));

    if (isManageMode) {
        window.lnChat.appTitle.textContent = selectedSessions.size > 0 ? `已选择 ${selectedSessions.size} 项` : '选择会话';
        headerActions.innerHTML = `<button id="cancel-manage-btn" style="font-size:14px; background:none; border:none; color:white;">完成</button>`;
        document.getElementById('cancel-manage-btn').onclick = () => toggleManageMode(false);
    } else {
        window.lnChat.appTitle.textContent = '聊天';
        headerActions.innerHTML = `
            <button id="manage-btn" style="margin-right:10px; font-size:14px; background:none; border:none; color:white;">管理</button>
            <button id="new-chat-btn" style="font-size:14px; background:none; border:none; color:white;">新建聊天</button>
        `;
        document.getElementById('manage-btn').onclick = () => toggleManageMode(true);
        document.getElementById('new-chat-btn').onclick = () => showCreateChatOptions();
    }

    if (sessions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💬</div>
                <p>暂无聊天会话</p>
                <div style="display: flex; gap: 10px;">
                    <button id="start-new-chat-btn">新建聊天</button>
                </div>
            </div>
        `;
        document.getElementById('start-new-chat-btn').onclick = () => showCreateChatOptions();
        return;
    }

    // 按最后活跃时间排序（如果没有则按创建时间）
    sessions.sort((a, b) => {
        const timeA = new Date(a.lastActive || a.createdAt);
        const timeB = new Date(b.lastActive || b.createdAt);
        return timeB - timeA;
    });

    container.innerHTML = `
        <div class="chat-contact-list" style="padding-bottom: 80px;">
            ${sessions.map(s => {
                let name = '未知会话';
                let avatar = '👤';
                
                if (s.type === 'group') {
                    name = s.title || '群聊';
                    avatar = '👥';
                    // 如果有群成员，可以显示组合头像，这里简化处理
                } else {
                    const contact = contactMap[s.contactId] || { name: '未知角色', avatar: '' };
                    name = contact.name;
                    avatar = contact.avatar ? `<img src="${contact.avatar}">` : '👤';
                }

                const isSelected = selectedSessions.has(s.id.toString());
                return `
                    <div class="chat-item session-item ${isManageMode ? 'manage-mode' : ''} ${isSelected ? 'selected' : ''}" data-id="${s.id}">
                        <div class="checkbox-wrapper">
                            <div class="custom-checkbox"></div>
                        </div>
                        <div class="avatar">${avatar}</div>
                        <div class="info">
                            <div class="name">${name}</div>
                            <div class="desc">${s.lastMessage || s.title}</div>
                        </div>
                        <div class="meta" style="text-align:right; font-size:11px; color:var(--text-secondary);">
                            <div>${formatTime(s.lastActive || s.createdAt)}</div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
        
        <div class="bottom-action-bar ${isManageMode ? 'visible' : ''}">
            <button class="action-btn delete" id="batch-delete-btn" ${selectedSessions.size === 0 ? 'disabled' : ''}>
                删除 (${selectedSessions.size})
            </button>
        </div>
    `;

    const list = container.querySelector('.chat-contact-list');
    if (list) {
        list.onclick = async (e) => {
            const sessionItem = e.target.closest('.session-item');
            if (sessionItem) {
                const sid = sessionItem.dataset.id;
                
                if (isManageMode) {
                    if (selectedSessions.has(sid)) {
                        selectedSessions.delete(sid);
                    } else {
                        selectedSessions.add(sid);
                    }
                    renderMainSessionList(); // 重新渲染以更新选中状态和标题
                } else {
                    openChat(sid);
                }
            }
        };
    }

    const deleteBtn = document.getElementById('batch-delete-btn');
    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            if (selectedSessions.size === 0) return;
            
            if (confirm(`确定删除选中的 ${selectedSessions.size} 个会话及其记录吗？`)) {
                for (const sid of selectedSessions) {
                    // 尝试获取会话以确认 ID 类型（兼容旧数据的数字 ID）
                    let realId = sid;
                    let session = await db.get(STORES.SESSIONS, sid);
                    if (!session) {
                        const numId = parseInt(sid);
                        if (!isNaN(numId)) {
                            session = await db.get(STORES.SESSIONS, numId);
                            if (session) realId = numId;
                        }
                    }

                    // 删除会话
                    await db.delete(STORES.SESSIONS, realId);
                    
                    // 删除关联的聊天记录
                    const history = await db.getChatHistory(realId);
                    if (history && history.length > 0) {
                        for (const m of history) {
                            await db.delete(STORES.CHAT_HISTORY, m.id);
                        }
                    }
                }
                
                selectedSessions.clear();
                toggleManageMode(false);
            }
        };
    }
}

/**
 * 显示新建聊天选项对话框
 */
function showCreateChatOptions() {
    // 移除已存在的对话框
    const existingDialog = document.getElementById('create-chat-dialog');
    if (existingDialog) {
        document.body.removeChild(existingDialog);
    }

    const dialog = document.createElement('div');
    dialog.id = 'create-chat-dialog';
    dialog.className = 'confirm-dialog visible';
    dialog.innerHTML = `
        <div class="confirm-dialog-content" style="width: 320px; padding: 20px;">
            <div class="confirm-dialog-header" style="text-align: center; margin-bottom: 20px;">新建聊天</div>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <div id="create-private-chat-btn" class="create-chat-option">
                    <div class="create-chat-icon" style="background: rgba(33, 150, 243, 0.2);">👤</div>
                    <div class="create-chat-info">
                        <h4>新建私聊</h4>
                        <p>与单个角色进行对话</p>
                    </div>
                </div>
                <div id="create-group-chat-btn" class="create-chat-option">
                    <div class="create-chat-icon" style="background: rgba(156, 39, 176, 0.2);">👥</div>
                    <div class="create-chat-info">
                        <h4>新建群聊</h4>
                        <p>邀请多个角色加入群组</p>
                    </div>
                </div>
            </div>
            <div style="margin-top: 20px; text-align: center;">
                <button id="create-chat-cancel" style="background: transparent; border: none; color: rgba(255, 255, 255, 0.6); font-size: 14px; cursor: pointer; padding: 10px;">取消</button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    // 点击背景关闭
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
            document.body.removeChild(dialog);
        }
    });

    document.getElementById('create-chat-cancel').onclick = () => {
        document.body.removeChild(dialog);
    };

    document.getElementById('create-private-chat-btn').onclick = () => {
        document.body.removeChild(dialog);
        showContactSelector();
    };

    document.getElementById('create-group-chat-btn').onclick = () => {
        document.body.removeChild(dialog);
        showGroupContactSelector();
    };
}

/**
 * 角色选择器：选择一个角色开启新会话
 */
async function showContactSelector() {
    const contacts = await db.getAll(STORES.CONTACTS);
    
    window.lnChat.appTitle.textContent = '选择角色';
    headerActions.innerHTML = '';
    
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        renderMainSessionList();
    };

    if (contacts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>还没有可以聊天的角色</p>
                <button id="go-to-contacts">去创建角色</button>
            </div>
        `;
        document.getElementById('go-to-contacts').onclick = () => window.lnChat.openApp('contacts');
        return;
    }

    container.innerHTML = `
        <div class="chat-contact-list">
            ${contacts.map(c => `
                <div class="chat-item contact-select-item" data-id="${c.id}">
                    <div class="avatar">${c.avatar ? `<img src="${c.avatar}">` : '👤'}</div>
                    <div class="info">
                        <div class="name">${c.name}</div>
                        <div class="desc">${c.description || ''}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    container.querySelectorAll('.contact-select-item').forEach(item => {
        item.onclick = async () => {
            const contactId = item.dataset.id;
            await showUserPersonaSelector(contactId);
        };
    });
}

async function showUserPersonaSelector(contactId) {
    const personas = await db.getAll(STORES.USER_PERSONAS);
    
    if (personas.length === 0) {
        await createSession(contactId, null);
        return;
    }

    window.lnChat.appTitle.textContent = '选择你的身份';
    
    container.innerHTML = `
        <div class="chat-contact-list">
            <div class="chat-item persona-select-item" data-id="null">
                <div class="avatar">👤</div>
                <div class="info">
                    <div class="name">默认 (无设定)</div>
                    <div class="desc">不使用特定用户人设</div>
                </div>
            </div>
            ${personas.map(p => `
                <div class="chat-item persona-select-item" data-id="${p.id}">
                    <div class="avatar">👤</div>
                    <div class="info">
                        <div class="name">${p.name}</div>
                        <div class="desc">${p.description || ''}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    container.querySelectorAll('.persona-select-item').forEach(item => {
        item.onclick = async () => {
            const personaId = item.dataset.id === 'null' ? null : item.dataset.id;
            await createSession(contactId, personaId);
        };
    });
}

/**
 * 群聊角色选择器
 */
async function showGroupContactSelector() {
    const contacts = await db.getAll(STORES.CONTACTS);
    
    window.lnChat.appTitle.textContent = '选择群聊成员';
    headerActions.innerHTML = `<button id="create-group-confirm-btn" style="font-size:14px; background:none; border:none; color:white;" disabled>确定 (0)</button>`;
    
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        renderMainSessionList();
    };

    if (contacts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>还没有可以聊天的角色</p>
                <button id="go-to-contacts">去创建角色</button>
            </div>
        `;
        document.getElementById('go-to-contacts').onclick = () => window.lnChat.openApp('contacts');
        return;
    }

    const selectedContacts = new Set();

    container.innerHTML = `
        <div class="chat-contact-list">
            ${contacts.map(c => `
                <div class="chat-item contact-select-item group-select-item" data-id="${c.id}">
                    <div class="checkbox-wrapper" style="width: 30px; margin-right: 10px;">
                        <div class="custom-checkbox"></div>
                    </div>
                    <div class="avatar">${c.avatar ? `<img src="${c.avatar}">` : '👤'}</div>
                    <div class="info">
                        <div class="name">${c.name}</div>
                        <div class="desc">${c.description || ''}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    const confirmBtn = document.getElementById('create-group-confirm-btn');
    
    container.querySelectorAll('.group-select-item').forEach(item => {
        item.onclick = () => {
            const contactId = item.dataset.id;
            if (selectedContacts.has(contactId)) {
                selectedContacts.delete(contactId);
                item.classList.remove('selected');
            } else {
                selectedContacts.add(contactId);
                item.classList.add('selected');
            }
            
            confirmBtn.textContent = `确定 (${selectedContacts.size})`;
            confirmBtn.disabled = selectedContacts.size === 0;
        };
    });

    confirmBtn.onclick = async () => {
        if (selectedContacts.size === 0) return;
        await showGroupUserPersonaSelector(Array.from(selectedContacts));
    };
}

async function showGroupUserPersonaSelector(contactIds) {
    const personas = await db.getAll(STORES.USER_PERSONAS);
    
    if (personas.length === 0) {
        await createGroupSession(contactIds, null);
        return;
    }

    window.lnChat.appTitle.textContent = '选择你的身份';
    
    container.innerHTML = `
        <div class="chat-contact-list">
            <div class="chat-item persona-select-item" data-id="null">
                <div class="avatar">👤</div>
                <div class="info">
                    <div class="name">默认 (无设定)</div>
                    <div class="desc">不使用特定用户人设</div>
                </div>
            </div>
            ${personas.map(p => `
                <div class="chat-item persona-select-item" data-id="${p.id}">
                    <div class="avatar">👤</div>
                    <div class="info">
                        <div class="name">${p.name}</div>
                        <div class="desc">${p.description || ''}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    container.querySelectorAll('.persona-select-item').forEach(item => {
        item.onclick = async () => {
            const personaId = item.dataset.id === 'null' ? null : item.dataset.id;
            await createGroupSession(contactIds, personaId);
        };
    });
}

async function createSession(contactId, userPersonaId) {
    const contact = await db.get(STORES.CONTACTS, contactId);
    const newSession = {
        id: generateId(),
        contactId: contactId,
        userPersonaId: userPersonaId,
        type: 'private',
        title: `与 ${contact.name} 的对话`,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        lastMessage: '新开启的对话'
    };
    await db.put(STORES.SESSIONS, newSession);
    openChat(newSession.id);
}

async function createGroupSession(contactIds, userPersonaId) {
    const contacts = [];
    for (const id of contactIds) {
        const c = await db.get(STORES.CONTACTS, id);
        if (c) contacts.push(c);
    }
    
    const groupName = contacts.map(c => c.name).join('、').substring(0, 20) + (contacts.length > 3 ? '...' : '') + ' 的群聊';
    
    const newSession = {
        id: generateId(),
        contactIds: contactIds, // 数组
        userPersonaId: userPersonaId,
        type: 'group',
        title: groupName,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        lastMessage: '新开启的群聊'
    };
    await db.put(STORES.SESSIONS, newSession);
    openChat(newSession.id);
}

/**
 * 更新聊天界面头部
 */
function updateChatHeader(contactName, status = null) {
    if (isMessageManageMode) {
        window.lnChat.appTitle.textContent = selectedMessages.size > 0 ? `已选择 ${selectedMessages.size} 条` : '选择消息';
        headerActions.innerHTML = `<button id="cancel-message-manage-btn" style="font-size:14px; background:none; border:none; color:white;">完成</button>`;
        document.getElementById('cancel-message-manage-btn').onclick = () => toggleMessageManageMode(false);
    } else {
        // 如果传入新状态，更新当前状态
        if (status !== null) {
            currentStatus = status;
        }
        
        // 构建标题：昵称 + 状态
        if (currentStatus) {
            window.lnChat.appTitle.innerHTML = `${contactName} <span class="header-status">${currentStatus}</span>`;
        } else {
            window.lnChat.appTitle.textContent = contactName;
        }
        
        headerActions.innerHTML = `
            <button id="message-manage-btn" style="margin-right:10px; font-size:14px; background:none; border:none; color:white;">管理</button>
            <button id="clear-chat-btn">🗑️</button>
        `;
        document.getElementById('message-manage-btn').onclick = () => toggleMessageManageMode(true);
        document.getElementById('clear-chat-btn').onclick = async () => {
            if (confirm('确定清空当前会话的聊天记录吗？')) {
                const history = await db.getChatHistory(currentChatId);
                for (const msg of history) {
                    await db.delete(STORES.CHAT_HISTORY, msg.id);
                }
                currentStatus = null; // 清空状态
                openChat(currentChatId);
            }
        };
    }
}

/**
 * 切换消息管理模式
 */
function toggleMessageManageMode(enable) {
    isMessageManageMode = enable;
    if (!enable) {
        selectedMessages.clear();
    }
    
    const session = db.get(STORES.SESSIONS, currentChatId).then(async (session) => {
        if (session) {
            let name = '聊天';
            if (session.type === 'group') {
                name = session.title;
            } else {
                const contact = await db.get(STORES.CONTACTS, session.contactId);
                if (contact) name = contact.name;
            }
            updateChatHeader(name);
            renderMessagesInManageMode();
        }
    });
}

/**
 * 在管理模式下重新渲染消息
 */
async function renderMessagesInManageMode() {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;
    
    // 分页加载逻辑 - 首次加载最新的 20 条
    const PAGE_SIZE = 20;
    const history = await db.getChatHistory(currentChatId, PAGE_SIZE);
    const session = await db.get(STORES.SESSIONS, currentChatId);
    const isGroup = session && session.type === 'group';
    
    // 更新容器类名
    if (isMessageManageMode) {
        messagesDiv.classList.add('manage-mode');
    } else {
        messagesDiv.classList.remove('manage-mode');
    }
    
    // 预处理历史记录
    const expandedHistory = [];
    for (const msg of history) {
        // 解析包含特定标签的消息（支持 assistant 和 user）
        if (msg.type === 'text' && /<(words|action|thought|state|emoji|location|redpacket|transfer|anniversary|product|link|note|memory)(?:\s+[^>]*)?>/i.test(msg.content)) {
            const parsedParts = [];
            const tagRegex = /<(words|action|thought|state|emoji|location|redpacket|transfer|anniversary|product|link|note|memory)(?:\s+[^>]*)?>(.*?)<\/\1>/gis;
            let match;
            while ((match = tagRegex.exec(msg.content)) !== null) {
                let type = match[1].toLowerCase();
                if (type === 'words') type = 'text';
                
                // 提取红包和转账的额外属性
                let extraData = {};
                if (type === 'redpacket' || type === 'transfer') {
                    // 金额从标签内容获取
                    const contentAmount = parseFloat(match[2].trim());
                    extraData.amount = isNaN(contentAmount) ? 0 : contentAmount;
                    
                    // message 参数是可选的
                    const messageMatch = match[0].match(/message="([^"]+)"/);
                    if (type === 'redpacket') {
                        extraData.message = messageMatch ? messageMatch[1] : '恭喜发财，大吉大利';
                    } else {
                        extraData.message = messageMatch ? messageMatch[1] : '';
                    }
                }
                
                // 提取纪念日的额外属性
                if (type === 'anniversary') {
                    const idMatch = match[0].match(/id="([^"]+)"/);
                    const titleMatch = match[0].match(/title="([^"]+)"/);
                    const daysMatch = match[0].match(/days="([^"]+)"/);
                    const labelMatch = match[0].match(/label="([^"]+)"/);
                    const dateMatch = match[0].match(/date="([^"]+)"/);
                    const backgroundMatch = match[0].match(/background="([^"]+)"/);
                    
                    extraData.anniversaryId = idMatch ? idMatch[1] : '';
                    extraData.title = titleMatch ? titleMatch[1] : '';
                    extraData.days = daysMatch ? daysMatch[1] : '';
                    extraData.label = labelMatch ? labelMatch[1] : '';
                    extraData.date = dateMatch ? dateMatch[1] : '';
                    extraData.background = backgroundMatch ? backgroundMatch[1] : '';
                }
                
                // 提取商品推荐的额外属性
                if (type === 'product') {
                    const nameMatch = match[0].match(/name="([^"]+)"/);
                    const priceMatch = match[0].match(/price="([^"]+)"/);
                    const imageMatch = match[0].match(/image="([^"]+)"/);
                    
                    extraData.productName = nameMatch ? nameMatch[1] : '商品';
                    extraData.price = priceMatch ? priceMatch[1] : '';
                    extraData.image = imageMatch ? imageMatch[1] : '';
                }
                
                // 提取链接分享的额外属性
                if (type === 'link') {
                    const titleMatch = match[0].match(/title="([^"]+)"/);
                    const urlMatch = match[0].match(/url="([^"]+)"/);
                    
                    extraData.linkTitle = titleMatch ? titleMatch[1] : '链接';
                    extraData.url = urlMatch ? urlMatch[1] : '';
                }
                
                // 提取备忘录的额外属性
                if (type === 'note') {
                    const titleMatch = match[0].match(/title="([^"]+)"/);
                    
                    extraData.noteTitle = titleMatch ? titleMatch[1] : '备忘';
                }
                
                parsedParts.push({
                    type: type,
                    content: match[2].trim(),
                    ...extraData
                });
            }
            
            if (parsedParts.length > 0) {
                parsedParts.forEach((part, index) => {
                    expandedHistory.push({
                        ...msg,
                        virtualId: `${msg.id}_${index}`,
                        type: part.type,
                        content: part.content,
                        amount: part.amount,
                        message: part.message,
                        anniversaryId: part.anniversaryId,
                        title: part.title,
                        days: part.days,
                        label: part.label,
                        date: part.date,
                        background: part.background
                    });
                });
            } else {
                expandedHistory.push(msg);
            }
        } else {
            expandedHistory.push(msg);
        }
    }
    
    // 提取最新的 state 消息用于标题栏显示
    let latestState = null;
    for (let i = expandedHistory.length - 1; i >= 0; i--) {
        if (expandedHistory[i].type === 'state' && expandedHistory[i].sender === 'assistant') {
            latestState = expandedHistory[i].content;
            break;
        }
    }
    
    // 如果找到了状态，更新标题栏
    if (latestState && !isMessageManageMode) {
        const session = await db.get(STORES.SESSIONS, currentChatId);
        if (session) {
            if (session.type === 'group') {
                // 群聊暂不显示状态，或者显示最后说话角色的状态
                updateChatHeader(session.title);
            } else {
                const contact = await db.get(STORES.CONTACTS, session.contactId);
                if (contact) {
                    updateChatHeader(contact.name, latestState);
                }
            }
        }
    }
    
    // 过滤掉 state 和 memory 类型的消息，不在聊天流中显示
    const filteredHistory = expandedHistory.filter(msg => msg.type !== 'state' && msg.type !== 'memory');
    
    messagesDiv.innerHTML = filteredHistory.map(msg => {
        if (msg.status === 'recalled') {
            return `<div class="message system"><div class="message-content-wrapper"><div class="msg-content">消息已撤回</div></div></div>`;
        }
        
        let contentHtml = '';
        if (msg.type === 'text' || msg.type === 'action' || msg.type === 'thought' || msg.type === 'state') {
            contentHtml = simpleMarkdown(msg.content);
        } else if (msg.type === 'image') {
            contentHtml = `<img src="${msg.content}" style="max-width: 100%; border-radius: 10px;">`;
        } else if (msg.type === 'emoji') {
            // 表情包消息：根据ID获取图片显示
            const emojiUrl = getEmojiImageUrl(msg.content);
            if (emojiUrl) {
                contentHtml = `<img src="${emojiUrl}" data-emoji-id="${msg.content}" class="emoji-message-img" style="max-width: 120px; max-height: 120px; border-radius: 10px;">`;
            } else {
                // 显示占位符，图片加载完成后会自动更新
                contentHtml = `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='12'%3E⌛%3C/text%3E%3C/svg%3E" data-emoji-id="${msg.content}" class="emoji-message-img emoji-loading" style="max-width: 120px; max-height: 120px; border-radius: 10px; opacity: 0.5;">`;
            }
        } else if (msg.type === 'location') {
            // 位置消息：显示位置信息（模仿转账样式）
            contentHtml = `<div class="location-message">
                <div class="location-icon">📍</div>
                <div class="location-info">
                    <div class="location-title">${msg.content}</div>
                    <div class="location-address">位置分享</div>
                </div>
                <div class="location-label">位置</div>
            </div>`;
        } else if (msg.type === 'redpacket') {
            // 红包消息
            const amount = msg.amount || parseFloat(msg.content) || 0;
            const message = msg.message || '恭喜发财，大吉大利';
            contentHtml = `<div class="redpacket-message">
                <div class="redpacket-icon">🧧</div>
                <div class="redpacket-info">
                    <div class="redpacket-amount">¥${amount.toFixed(2)}</div>
                    <div class="redpacket-msg">${message}</div>
                </div>
                <div class="redpacket-label">红包</div>
            </div>`;
        } else if (msg.type === 'transfer') {
            // 转账消息
            const amount = msg.amount || parseFloat(msg.content) || 0;
            const transferMsg = msg.message || '';
            contentHtml = `<div class="transfer-message">
                <div class="transfer-icon">💰</div>
                <div class="transfer-info">
                    <div class="transfer-amount">¥${amount.toFixed(2)}</div>
                    <div class="transfer-label-text">${transferMsg || '转账给你'}</div>
                </div>
                <div class="transfer-label">转账</div>
            </div>`;
        } else if (msg.type === 'anniversary') {
            // 纪念日卡片消息
            const title = msg.title || '';
            const days = msg.days || '';
            const label = msg.label || '';
            const date = msg.date || '';
            const background = msg.background || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800';
            contentHtml = `<div class="anniversary-card-message" style="background-image: url('${background}');">
                <div class="anniversary-card-overlay"></div>
                <div class="anniversary-card-content">
                    <div class="anniversary-card-title">${title}${label}</div>
                    <div class="anniversary-card-days">${days}</div>
                    <div class="anniversary-card-date">目标日: ${date}</div>
                </div>
            </div>`;
        } else if (msg.type === 'product') {
            // 商品推荐消息
            const productName = msg.productName || '商品';
            const price = msg.price || '';
            const image = msg.image || '';
            const description = msg.content || '';
            contentHtml = `<div class="product-share-message" onclick="window.lnChat?.openApp && window.lnChat.openApp('store')">
                ${image ? `<div class="product-share-image"><img src="${image}" alt="${productName}"></div>` : '<div class="product-share-icon">🛒</div>'}
                <div class="product-share-info">
                    <div class="product-share-name">${productName}</div>
                    ${price ? `<div class="product-share-price">¥${price}</div>` : ''}
                    ${description ? `<div class="product-share-desc">${description}</div>` : ''}
                </div>
            </div>`;
        } else if (msg.type === 'link') {
            // 链接分享消息
            const linkTitle = msg.linkTitle || '链接';
            const url = msg.url || '#';
            const description = msg.content || '';
            contentHtml = `<div class="link-share-message" onclick="window.open('${url}', '_blank')">
                <div class="link-share-icon">🔗</div>
                <div class="link-share-info">
                    <div class="link-share-title">${linkTitle}</div>
                    ${description ? `<div class="link-share-desc">${description}</div>` : ''}
                    <div class="link-share-url">${url}</div>
                </div>
            </div>`;
        } else if (msg.type === 'note') {
            // 备忘录消息
            const noteTitle = msg.noteTitle || '备忘';
            const noteContent = msg.content || '';
            contentHtml = `<div class="note-share-message">
                <div class="note-share-header">
                    <div class="note-share-icon">📝</div>
                    <div class="note-share-title">${noteTitle}</div>
                </div>
                <div class="note-share-content">${noteContent}</div>
            </div>`;
        } else {
            contentHtml = `[暂不支持的消息类型: ${msg.type}]`;
        }
        
        // 折叠的消息显示完整内容，但添加标签提示
        let foldedTag = '';
        if (msg.status === 'folded') {
            foldedTag = `<span class="folded-tag">（该消息已被折叠）</span>`;
        }
        
        let timeDisplay = '';
        if (typeof msg.timestamp === 'number') {
            timeDisplay = formatTime(msg.timestamp * 1000);
        } else {
            timeDisplay = formatTime(msg.timestamp);
        }
        
        const isSelected = selectedMessages.has(msg.id);
        
        // 获取发送者信息（用于群聊显示头像和名字）
        let senderName = '';
        let senderAvatar = '';
        
        if (msg.sender === 'assistant' && msg.contactId) {
            // 尝试从缓存或数据库获取角色信息
            // 这里为了性能，最好有缓存。暂时简化，假设 renderMessagesInManageMode 外部已准备好数据
            // 由于是异步渲染，这里只能做同步操作。
            // 实际项目中应该先获取所有相关角色信息。
        }

        return `
            <div class="message ${msg.sender} ${msg.type} ${msg.status} ${isMessageManageMode ? 'manage-mode' : ''} ${isSelected ? 'selected' : ''}"
                 data-id="${msg.virtualId || msg.id}" data-real-id="${msg.id}" data-contact-id="${msg.contactId || ''}">
                <div class="message-checkbox-wrapper">
                    <div class="custom-checkbox"></div>
                </div>
                ${isGroup && msg.sender === 'assistant' ? `<div class="message-avatar" data-contact-id="${msg.contactId}"></div>` : ''}
                <div class="message-content-wrapper">
                    ${isGroup && msg.sender === 'assistant' ? `<div class="message-sender-name" data-contact-id="${msg.contactId}"></div>` : ''}
                    <div class="msg-content">${contentHtml}${foldedTag}</div>
                    <div class="msg-time">${timeDisplay}</div>
                </div>
            </div>
        `;
    }).join('');

    // 异步填充群聊头像和名字
    if (isGroup) {
        const contactIds = session.contactIds || [];
        const contacts = await Promise.all(contactIds.map(id => db.get(STORES.CONTACTS, id)));
        const contactMap = {};
        contacts.forEach(c => { if(c) contactMap[c.id] = c; });

        messagesDiv.querySelectorAll('.message.assistant').forEach(el => {
            const contactId = el.dataset.contactId;
            const contact = contactMap[contactId];
            if (contact) {
                const avatarEl = el.querySelector('.message-avatar');
                const nameEl = el.querySelector('.message-sender-name');
                if (avatarEl) avatarEl.innerHTML = contact.avatar ? `<img src="${contact.avatar}">` : '👤';
                if (nameEl) nameEl.textContent = contact.name;
            }
        });
    }
    
    // 添加底部操作栏
    let bottomBar = document.querySelector('.chat-container .bottom-action-bar');
    if (!bottomBar) {
        bottomBar = document.createElement('div');
        bottomBar.className = 'bottom-action-bar';
        bottomBar.innerHTML = `
            <button class="action-btn fold" id="batch-fold-messages-btn" disabled>
                折叠 (0)
            </button>
            <button class="action-btn unfold" id="batch-unfold-messages-btn" disabled>
                展开 (0)
            </button>
            <button class="action-btn delete" id="batch-delete-messages-btn" disabled>
                删除 (0)
            </button>
        `;
        document.querySelector('.chat-container').appendChild(bottomBar);
    }
    
    if (isMessageManageMode) {
        bottomBar.classList.add('visible');
        const foldBtn = document.getElementById('batch-fold-messages-btn');
        const unfoldBtn = document.getElementById('batch-unfold-messages-btn');
        const deleteBtn = document.getElementById('batch-delete-messages-btn');
        if (foldBtn) {
            foldBtn.disabled = selectedMessages.size === 0;
            foldBtn.textContent = `折叠 (${selectedMessages.size})`;
        }
        if (unfoldBtn) {
            unfoldBtn.disabled = selectedMessages.size === 0;
            unfoldBtn.textContent = `展开 (${selectedMessages.size})`;
        }
        if (deleteBtn) {
            deleteBtn.disabled = selectedMessages.size === 0;
            deleteBtn.textContent = `删除 (${selectedMessages.size})`;
        }
    } else {
        bottomBar.classList.remove('visible');
    }
    
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    // 添加"加载更多"观察器 (Infinite Scroll)
    if (history.length >= PAGE_SIZE) {
        // 创建一个观察哨兵元素
        const sentinel = document.createElement('div');
        sentinel.className = 'message-sentinel';
        sentinel.style.cssText = 'height: 20px; text-align: center; color: transparent;';
        sentinel.textContent = 'loading...';
        messagesDiv.insertBefore(sentinel, messagesDiv.firstChild);

        // 使用 IntersectionObserver 监听哨兵
        const observer = new IntersectionObserver(async (entries) => {
            if (entries[0].isIntersecting) {
                // 停止观察，防止重复触发
                observer.unobserve(sentinel);
                
                // 显示加载提示
                sentinel.textContent = '正在加载更多消息...';
                sentinel.style.color = '#888';
                sentinel.style.fontSize = '12px';
                
                const oldestMsgId = history[0] ? history[0].id : null;
                if (oldestMsgId) {
                    await loadMoreMessages(currentChatId, oldestMsgId, isGroup);
                }
                
                // 移除哨兵 (新的消息加载后，如果有更多，loadMoreMessages 会再次添加哨兵)
                sentinel.remove();
            }
        }, {
            root: messagesDiv,
            threshold: 0.1, // 稍微露头就触发
            rootMargin: '50px 0px 0px 0px' // 提前50px触发预加载
        });
        
        observer.observe(sentinel);
    }

    // 绑定事件 - 使用 filteredHistory 代替 expandedHistory
    messagesDiv.querySelectorAll('.message').forEach(el => {
        if (el.classList.contains('system')) {
            return;
        }
        
        if (isMessageManageMode) {
            // 管理模式：点击选择/取消选择
            el.onclick = () => {
                const msgId = parseInt(el.dataset.realId);
                if (selectedMessages.has(msgId)) {
                    selectedMessages.delete(msgId);
                } else {
                    selectedMessages.add(msgId);
                }
                renderMessagesInManageMode();
            };
        } else {
            // 正常模式：长按/右键菜单
            if (el.classList.contains('assistant') || el.classList.contains('user')) {
                let pressTimer = null;
                
                el.addEventListener('touchstart', (e) => {
                    pressTimer = setTimeout(() => {
                        e.preventDefault();
                        showMessageContextMenu(el, e.touches[0].clientX, e.touches[0].clientY);
                    }, 500);
                });
                
                el.addEventListener('touchend', () => {
                    clearTimeout(pressTimer);
                });
                
                el.addEventListener('touchmove', () => {
                    clearTimeout(pressTimer);
                });
                
                el.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    showMessageContextMenu(el, e.clientX, e.clientY);
                });
            }
            
        }
    });
    
    // 绑定批量折叠按钮
    const foldBtn = document.getElementById('batch-fold-messages-btn');
    if (foldBtn) {
        foldBtn.onclick = async () => {
            if (selectedMessages.size === 0) return;
            
            const count = selectedMessages.size;
            for (const msgId of selectedMessages) {
                const msg = await db.get(STORES.CHAT_HISTORY, msgId);
                if (msg) {
                    msg.status = 'folded';
                    await db.put(STORES.CHAT_HISTORY, msg);
                }
            }
            selectedMessages.clear();
            showToast(`已折叠 ${count} 条消息`);
            renderMessagesInManageMode();
        };
    }
    
    // 绑定批量展开按钮
    const unfoldBtn = document.getElementById('batch-unfold-messages-btn');
    if (unfoldBtn) {
        unfoldBtn.onclick = async () => {
            if (selectedMessages.size === 0) return;
            
            const count = selectedMessages.size;
            for (const msgId of selectedMessages) {
                const msg = await db.get(STORES.CHAT_HISTORY, msgId);
                if (msg) {
                    msg.status = 'normal';
                    await db.put(STORES.CHAT_HISTORY, msg);
                }
            }
            selectedMessages.clear();
            showToast(`已展开 ${count} 条消息`);
            renderMessagesInManageMode();
        };
    }
    
    // 绑定批量删除按钮
    const deleteBtn = document.getElementById('batch-delete-messages-btn');
    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            if (selectedMessages.size === 0) return;
            
            if (confirm(`确定删除选中的 ${selectedMessages.size} 条消息吗？`)) {
                for (const msgId of selectedMessages) {
                    await db.delete(STORES.CHAT_HISTORY, msgId);
                }
                selectedMessages.clear();
                showToast('消息已删除');
                renderMessagesInManageMode();
            }
        };
    }
}

/**
 * 加载更多历史消息并插入到顶部
 */
async function loadMoreMessages(chatId, beforeId, isGroup) {
    const PAGE_SIZE = 20;
    const history = await db.getChatHistory(chatId, PAGE_SIZE, beforeId);
    
    if (history.length === 0) {
        // showToast('没有更多消息了');
        return;
    }

    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;

    // 记录当前的滚动高度，以便加载后保持位置
    const oldScrollHeight = messagesDiv.scrollHeight;
    const oldScrollTop = messagesDiv.scrollTop;

    // 生成HTML (复用 renderMessagesInManageMode 的大部分逻辑，这里简单处理文本和常见类型)
    // 为了避免重复大量代码，最好重构 renderMessageItem。
    // 这里暂时简化处理，确保能显示核心内容。
    // 注意：这里的渲染逻辑应该与 renderMessagesInManageMode 保持一致。
    
    const contactIds = isGroup ? (await db.get(STORES.SESSIONS, chatId)).contactIds : [];
    const contacts = isGroup ? await Promise.all(contactIds.map(id => db.get(STORES.CONTACTS, id))) : [];
    const contactMap = {};
    contacts.forEach(c => { if(c) contactMap[c.id] = c; });

    // history 是按时间倒序拿回来的（getChatHistory内部做了reverse变成了时间正序），所以直接遍历即可
    const newMessagesHtml = history.map(msg => {
        let contentHtml = '';
        if (msg.type === 'text' || msg.type === 'action' || msg.type === 'thought' || msg.type === 'state') {
            contentHtml = simpleMarkdown(msg.content);
        } else if (msg.type === 'emoji') {
            const emojiUrl = getEmojiImageUrl(msg.content);
            contentHtml = emojiUrl
                ? `<img src="${emojiUrl}" class="emoji-message-img" style="max-width: 120px; border-radius: 10px;">`
                : '[表情包加载中]';
        } else {
            contentHtml = `[${msg.type}]`;
        }
        
        let timeDisplay = formatTime(msg.timestamp);
        
        // 简化的渲染模板
        return `
            <div class="message ${msg.sender} ${msg.type}" data-real-id="${msg.id}">
                ${isGroup && msg.sender === 'assistant' ? `<div class="message-avatar">${contactMap[msg.contactId]?.avatar ? `<img src="${contactMap[msg.contactId].avatar}">` : '👤'}</div>` : ''}
                <div class="message-content-wrapper">
                    ${isGroup && msg.sender === 'assistant' ? `<div class="message-sender-name">${contactMap[msg.contactId]?.name || ''}</div>` : ''}
                    <div class="msg-content">${contentHtml}</div>
                    <div class="msg-time">${timeDisplay}</div>
                </div>
            </div>
        `;
    }).join('');

    // 创建临时容器解析 HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newMessagesHtml;
    
    // 将新消息插入到最前面 (除了哨兵元素)
    const firstMessage = messagesDiv.querySelector('.message');
    while (tempDiv.firstChild) {
        messagesDiv.insertBefore(tempDiv.firstChild, firstMessage);
    }

    // 恢复滚动位置
    // 新的 scrollHeight - 旧的 scrollHeight = 插入内容的高度
    // 我们需要把 scrollTop 设为这个高度，这样视觉上用户看到的内容不变
    const newScrollHeight = messagesDiv.scrollHeight;
    messagesDiv.scrollTop = newScrollHeight - oldScrollHeight;

    // 如果还有更多消息，再次添加观察哨兵
    if (history.length >= PAGE_SIZE) {
        const sentinel = document.createElement('div');
        sentinel.className = 'message-sentinel';
        sentinel.style.cssText = 'height: 20px; text-align: center; color: transparent;';
        sentinel.textContent = 'loading...';
        messagesDiv.insertBefore(sentinel, messagesDiv.firstChild);

        const observer = new IntersectionObserver(async (entries) => {
            if (entries[0].isIntersecting) {
                observer.unobserve(sentinel);
                sentinel.textContent = '加载中...';
                sentinel.style.color = '#888';
                sentinel.style.fontSize = '12px';
                
                const oldestMsgId = history[0] ? history[0].id : null;
                if (oldestMsgId) {
                    await loadMoreMessages(chatId, oldestMsgId, isGroup);
                }
                sentinel.remove();
            }
        }, { root: messagesDiv, threshold: 0.1, rootMargin: '50px 0px 0px 0px' });
        
        observer.observe(sentinel);
    }
}

/**
 * 聊天窗口
 */
async function openChat(chatId) {
    currentChatId = chatId;
    isMessageManageMode = false;
    selectedMessages.clear();
    currentStatus = null; // 重置状态，将在 renderMessagesInManageMode 中从历史记录加载
    
    const session = await db.get(STORES.SESSIONS, chatId);
    if (!session) return renderMainSessionList();
    
    let title = '聊天';
    if (session.type === 'group') {
        title = session.title;
    } else {
        const contact = await db.get(STORES.CONTACTS, session.contactId);
        title = contact ? contact.name : '未知角色';
    }
    
    // 从会话中恢复上次的状态
    if (session.lastStatus) {
        currentStatus = session.lastStatus;
    }
    
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        isMessageManageMode = false;
        selectedMessages.clear();
        currentStatus = null;
        renderMainSessionList();
    };
    
    updateChatHeader(title, session.type === 'group' ? null : currentStatus);

    container.innerHTML = `
        <div class="chat-container">
            <div class="messages" id="chat-messages"></div>
            <div class="input-area">
                <textarea id="chat-input" placeholder="输入消息..."></textarea>
                <button id="emoji-btn" class="icon-btn">😊</button>
                <button id="plus-btn" class="icon-btn">➕</button>
                <button id="send-btn">发送</button>
            </div>
            <div class="extension-menu" id="extension-menu">
                <div class="extension-menu-grid">
                    <div class="extension-menu-item" data-action="photo">
                        <div class="extension-menu-icon">🖼️</div>
                        <div class="extension-menu-label">相册</div>
                    </div>
                    <div class="extension-menu-item" data-action="camera">
                        <div class="extension-menu-icon">📷</div>
                        <div class="extension-menu-label">拍照</div>
                    </div>
                    <div class="extension-menu-item" data-action="location">
                        <div class="extension-menu-icon">📍</div>
                        <div class="extension-menu-label">位置</div>
                    </div>
                    <div class="extension-menu-item" data-action="gift">
                        <div class="extension-menu-icon">🎁</div>
                        <div class="extension-menu-label">礼物</div>
                    </div>
                    <div class="extension-menu-item" data-action="redpacket">
                        <div class="extension-menu-icon">🧧</div>
                        <div class="extension-menu-label">红包</div>
                    </div>
                    <div class="extension-menu-item" data-action="transfer">
                        <div class="extension-menu-icon">💰</div>
                        <div class="extension-menu-label">转账</div>
                    </div>
                    <div class="extension-menu-item" data-action="anniversary">
                        <div class="extension-menu-icon">📅</div>
                        <div class="extension-menu-label">纪念日</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const messagesDiv = document.getElementById('chat-messages');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const emojiBtn = document.getElementById('emoji-btn');
    const plusBtn = document.getElementById('plus-btn');
    const extensionMenu = document.getElementById('extension-menu');

    await renderMessagesInManageMode();

    // 绑定加号按钮事件 - 切换扩展菜单
    plusBtn.onclick = () => {
        toggleExtensionMenu();
    };

    // 绑定扩展菜单项事件
    extensionMenu.querySelectorAll('.extension-menu-item').forEach(item => {
        item.onclick = async () => {
            const action = item.dataset.action;
            // 群聊时 contact 为 null 或 undefined，需要处理
            const contact = session.type === 'group' ? null : await db.get(STORES.CONTACTS, session.contactId);
            await handleExtensionAction(action, session, contact);
            hideExtensionMenu();
        };
    });

    // 点击消息区域时关闭扩展菜单
    messagesDiv.onclick = (e) => {
        if (!e.target.closest('.extension-menu')) {
            hideExtensionMenu();
        }
    };

    // 绑定表情包按钮事件
    emojiBtn.onclick = async () => {
        hideExtensionMenu();
        // 群聊时表情包选择器可能需要调整，暂时使用第一个角色的权限或全局权限
        const targetContactId = session.type === 'group' ? (session.contactIds[0]) : session.contactId;
        await showEmojiSelector(targetContactId);
    };

    sendBtn.onclick = async () => {
        const content = input.value.trim();
        if (!content) return;
        input.value = '';

        const now = getCurrentTimestamp();
        const userMsg = {
            chatId,
            contactId: session.contactId || null, // 群聊时可能为 null
            sender: 'user',
            type: 'text',
            content,
            status: 'normal',
            timestamp: now
        };
        await db.put(STORES.CHAT_HISTORY, userMsg);
        
        // 更新会话最后活跃时间和最后消息
        session.lastActive = now;
        session.lastMessage = content;
        await db.put(STORES.SESSIONS, session);

        const contactName = session.type === 'group' ? session.title : (await db.get(STORES.CONTACTS, session.contactId))?.name;
        await Logger.log(LOG_TYPES.ACTION, `User sent message to ${contactName}: ${content}`);

        await renderMessagesInManageMode();
        
        if (session.type === 'group') {
            queueGroupAIResponse(session);
        } else {
            const contact = await db.get(STORES.CONTACTS, session.contactId);
            queueAIResponse(session, contact);
        }
    };

    input.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    };
    
    // 创建上下文菜单和编辑对话框（如果不存在）
    createMessageEditComponents();
}

/**
 * 显示表情包选择器（显示所有表情包，用户可以发送任意表情）
 */
async function showEmojiSelector(contactId) {
    const emojis = await getAllEmojis();
    
    if (emojis.length === 0) {
        showToast('还没有添加任何表情包');
        return;
    }

    // 移除已存在的选择器
    const existingSelector = document.getElementById('emoji-selector-dialog');
    if (existingSelector) {
        document.body.removeChild(existingSelector);
    }

    const dialog = document.createElement('div');
    dialog.id = 'emoji-selector-dialog';
    dialog.className = 'emoji-selector-dialog';
    dialog.innerHTML = `
        <div class="emoji-selector-overlay"></div>
        <div class="emoji-selector-content">
            <div class="emoji-selector-handle"></div>
            <div class="emoji-selector-header">
                <h3>选择表情包</h3>
                <button class="close-btn">×</button>
            </div>
            <div class="emoji-selector-grid">
                ${emojis.map(emoji => `
                    <div class="emoji-selector-item" data-id="${emoji.id}">
                        <img src="${emoji.imageData}" alt="${emoji.meaning || '表情'}">
                        <div class="emoji-meaning">${emoji.meaning || ''}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    // 绑定事件
    const closeBtn = dialog.querySelector('.close-btn');
    const overlay = dialog.querySelector('.emoji-selector-overlay');
    
    const closeDialog = () => {
        dialog.classList.remove('visible');
        setTimeout(() => {
            if (document.body.contains(dialog)) {
                document.body.removeChild(dialog);
            }
        }, 300);
    };

    closeBtn.onclick = closeDialog;
    overlay.onclick = closeDialog;

    // 表情点击事件
    dialog.querySelectorAll('.emoji-selector-item').forEach(item => {
        item.onclick = async () => {
            const emojiId = item.dataset.id;
            await sendEmojiMessage(emojiId, contactId);
            closeDialog();
        };
    });

    // 显示动画
    requestAnimationFrame(() => {
        dialog.classList.add('visible');
    });
}

/**
 * 发送表情包消息
 * 如果发送的表情包不在角色权限内，自动为角色授权
 */
async function sendEmojiMessage(emojiId, contactId) {
    if (!currentChatId) return;

    const session = await db.get(STORES.SESSIONS, currentChatId);
    if (!session) return;

    if (session.type === 'group') {
        // 群聊：给所有群成员授权
        await authorizeEmojiForGroup(emojiId, session);
    } else {
        const contact = await db.get(STORES.CONTACTS, contactId);
        if (!contact) return;

        // 检查表情包是否在角色权限内，如果不在则自动授权
        const isAvailable = await isEmojiAvailableForContact(emojiId, contactId);
        if (!isAvailable) {
            await authorizeEmojiForContact(emojiId, contactId);
            // 获取表情包信息用于显示提示
            const emoji = emojiCache[emojiId];
            const emojiName = emoji?.meaning || emojiId;
            showToast(`已为 ${contact.name} 开通表情包: ${emojiName}`);
        }
    }

    const now = getCurrentTimestamp();
    const userMsg = {
        chatId: currentChatId,
        contactId: contactId,
        sender: 'user',
        type: 'emoji',
        content: emojiId,
        status: 'normal',
        timestamp: now
    };

    await db.put(STORES.CHAT_HISTORY, userMsg);
    
    // 更新会话最后活跃时间和最后消息
    session.lastActive = now;
    session.lastMessage = '[表情包]';
    await db.put(STORES.SESSIONS, session);

    await Logger.log(LOG_TYPES.ACTION, `User sent emoji to ${contact.name}: ${emojiId}`);

    await renderMessagesInManageMode();
    queueAIResponse(session, contact);
}

/**
 * 创建消息编辑相关的UI组件
 */
function createMessageEditComponents() {
    // 创建上下文菜单
    if (!document.getElementById('message-context-menu')) {
        const contextMenu = document.createElement('div');
        contextMenu.id = 'message-context-menu';
        contextMenu.className = 'message-context-menu';
        contextMenu.innerHTML = `
            <div class="context-menu-item" data-action="edit">
                <span>✏️</span>
                <span>编辑消息</span>
            </div>
            <div class="context-menu-item" data-action="reroll">
                <span>🔄</span>
                <span>重新生成</span>
            </div>
            <div class="context-menu-item" data-action="fold">
                <span>📁</span>
                <span>折叠消息</span>
            </div>
            <div class="context-menu-item danger" data-action="delete">
                <span>🗑️</span>
                <span>删除消息</span>
            </div>
        `;
        document.body.appendChild(contextMenu);
        
        // 点击菜单外部关闭
        document.addEventListener('click', (e) => {
            if (!contextMenu.contains(e.target)) {
                contextMenu.classList.remove('visible');
            }
        });
    }
    
    // 创建编辑对话框
    if (!document.getElementById('message-edit-dialog')) {
        const editDialog = document.createElement('div');
        editDialog.id = 'message-edit-dialog';
        editDialog.className = 'message-edit-dialog';
        editDialog.innerHTML = `
            <div class="edit-dialog-content">
                <div class="edit-dialog-header">编辑消息</div>
                <textarea class="edit-dialog-textarea" id="edit-message-textarea"></textarea>
                <div class="edit-dialog-actions">
                    <button class="edit-dialog-btn secondary" id="edit-cancel-btn">取消</button>
                    <button class="edit-dialog-btn primary" id="edit-save-btn">保存</button>
                </div>
            </div>
        `;
        document.body.appendChild(editDialog);
        
        // 点击背景关闭
        editDialog.addEventListener('click', (e) => {
            if (e.target === editDialog) {
                editDialog.classList.remove('visible');
            }
        });
    }
    
    // 创建确认对话框
    if (!document.getElementById('confirm-dialog')) {
        const confirmDialog = document.createElement('div');
        confirmDialog.id = 'confirm-dialog';
        confirmDialog.className = 'confirm-dialog';
        confirmDialog.innerHTML = `
            <div class="confirm-dialog-content">
                <div class="confirm-dialog-header" id="confirm-dialog-title">确认操作</div>
                <div class="confirm-dialog-message" id="confirm-dialog-message"></div>
                <div class="confirm-dialog-checkbox" id="confirm-dialog-checkbox-wrapper" style="display: none;">
                    <input type="checkbox" id="confirm-dialog-checkbox">
                    <label for="confirm-dialog-checkbox">不再提示此消息</label>
                </div>
                <div class="confirm-dialog-actions">
                    <button class="confirm-dialog-btn secondary" id="confirm-dialog-cancel">取消</button>
                    <button class="confirm-dialog-btn danger" id="confirm-dialog-confirm">确认</button>
                </div>
            </div>
        `;
        document.body.appendChild(confirmDialog);
        
        // 点击背景关闭
        confirmDialog.addEventListener('click', (e) => {
            if (e.target === confirmDialog) {
                confirmDialog.classList.remove('visible');
            }
        });
    }
}

/**
 * 显示消息上下文菜单
 */
function showMessageContextMenu(messageElement, x, y) {
    const contextMenu = document.getElementById('message-context-menu');
    if (!contextMenu) return;
    
    const messageId = parseInt(messageElement.dataset.realId);
    const isUserMessage = messageElement.classList.contains('user');
    
    // 移除旧的事件监听器并添加新的
    const menuItems = contextMenu.querySelectorAll('.context-menu-item');
    menuItems.forEach(item => {
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);
    });
    
    // 重新获取菜单项并绑定事件
    const newMenuItems = contextMenu.querySelectorAll('.context-menu-item');
    newMenuItems.forEach(item => {
        item.onclick = async () => {
            const action = item.dataset.action;
            contextMenu.classList.remove('visible');
            
            if (action === 'edit') {
                await showEditMessageDialog(messageId);
            } else if (action === 'delete') {
                await deleteMessage(messageId);
            } else if (action === 'reroll') {
                await handleReroll(messageId, isUserMessage);
            } else if (action === 'fold') {
                await foldMessage(messageId);
            }
        };
    });
    
    // 显示菜单
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.classList.add('visible');
    
    // 确保菜单不超出屏幕
    setTimeout(() => {
        const rect = contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            contextMenu.style.left = (x - rect.width) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            contextMenu.style.top = (y - rect.height) + 'px';
        }
    }, 0);
}

/**
 * 显示编辑消息对话框
 */
async function showEditMessageDialog(messageId) {
    const message = await db.get(STORES.CHAT_HISTORY, messageId);
    if (!message) {
        showToast('消息不存在');
        return;
    }
    
    const editDialog = document.getElementById('message-edit-dialog');
    const textarea = document.getElementById('edit-message-textarea');
    const saveBtn = document.getElementById('edit-save-btn');
    const cancelBtn = document.getElementById('edit-cancel-btn');
    
    if (!editDialog || !textarea || !saveBtn || !cancelBtn) return;
    
    // 设置当前消息内容
    textarea.value = message.content;
    editDialog.classList.add('visible');
    textarea.focus();
    
    // 移除旧的事件监听器
    const newSaveBtn = saveBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    
    // 保存按钮
    newSaveBtn.onclick = async () => {
        const newContent = textarea.value.trim();
        if (!newContent) {
            showToast('消息内容不能为空');
            return;
        }
        
        if (newContent === message.content) {
            editDialog.classList.remove('visible');
            return;
        }
        
        // 更新消息
        message.content = newContent;
        await db.put(STORES.CHAT_HISTORY, message);
        
        // 重新渲染消息
        if (currentChatId === message.chatId) {
            await openChat(message.chatId);
        }
        
        editDialog.classList.remove('visible');
        showToast('消息已更新');
    };
    
    // 取消按钮
    newCancelBtn.onclick = () => {
        editDialog.classList.remove('visible');
    };
}

/**
 * 删除消息
 */
async function deleteMessage(messageId) {
    if (!confirm('确定要删除这条消息吗？')) {
        return;
    }
    
    const message = await db.get(STORES.CHAT_HISTORY, messageId);
    if (!message) {
        showToast('消息不存在');
        return;
    }
    
    await db.delete(STORES.CHAT_HISTORY, messageId);
    
    // 重新渲染消息
    if (currentChatId === message.chatId) {
        await openChat(message.chatId);
    }
    
    showToast('消息已删除');
}

/**
 * 折叠消息
 */
async function foldMessage(messageId) {
    const message = await db.get(STORES.CHAT_HISTORY, messageId);
    if (!message) {
        showToast('消息不存在');
        return;
    }
    
    // 将消息状态设置为折叠
    message.status = 'folded';
    await db.put(STORES.CHAT_HISTORY, message);
    
    // 重新渲染消息
    if (currentChatId === message.chatId) {
        await renderMessagesInManageMode();
    }
    
    showToast('消息已折叠');
}

/**
 * 显示确认对话框
 */
function showConfirmDialog(title, message, showCheckbox = false, checkboxKey = '') {
    return new Promise((resolve) => {
        const dialog = document.getElementById('confirm-dialog');
        const titleEl = document.getElementById('confirm-dialog-title');
        const messageEl = document.getElementById('confirm-dialog-message');
        const checkboxWrapper = document.getElementById('confirm-dialog-checkbox-wrapper');
        const checkbox = document.getElementById('confirm-dialog-checkbox');
        const confirmBtn = document.getElementById('confirm-dialog-confirm');
        const cancelBtn = document.getElementById('confirm-dialog-cancel');
        
        if (!dialog || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
            resolve({ confirmed: false, dontShowAgain: false });
            return;
        }
        
        // 设置内容
        titleEl.textContent = title;
        messageEl.textContent = message;
        
        // 显示/隐藏复选框
        if (showCheckbox && checkboxKey) {
            checkboxWrapper.style.display = 'flex';
            checkbox.checked = false;
        } else {
            checkboxWrapper.style.display = 'none';
        }
        
        // 显示对话框
        dialog.classList.add('visible');
        
        // 移除旧的事件监听器
        const newConfirmBtn = confirmBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        
        // 确认按钮
        newConfirmBtn.onclick = () => {
            const dontShowAgain = checkbox.checked;
            if (dontShowAgain && checkboxKey) {
                localStorage.setItem(checkboxKey, 'true');
            }
            dialog.classList.remove('visible');
            resolve({ confirmed: true, dontShowAgain });
        };
        
        // 取消按钮
        newCancelBtn.onclick = () => {
            dialog.classList.remove('visible');
            resolve({ confirmed: false, dontShowAgain: false });
        };
    });
}

/**
 * 处理重新生成
 */
async function handleReroll(messageId, isUserMessage) {
    const message = await db.get(STORES.CHAT_HISTORY, messageId);
    if (!message) {
        showToast('消息不存在');
        return;
    }
    
    const session = await db.get(STORES.SESSIONS, message.chatId);
    if (!session) {
        showToast('会话不存在');
        return;
    }
    
    let contact = null;
    if (session.type !== 'group') {
        contact = await db.get(STORES.CONTACTS, session.contactId);
        if (!contact) {
            showToast('角色不存在');
            return;
        }
    }
    
    // 获取所有历史消息
    const allHistory = await db.getChatHistory(message.chatId);
    
    // 找到当前消息的索引
    const currentIndex = allHistory.findIndex(m => m.id === messageId);
    if (currentIndex === -1) {
        showToast('消息索引错误');
        return;
    }
    
    // 确定要删除的消息范围
    let messagesToDelete;
    let confirmMessage;
    let checkboxKey;
    
    if (isUserMessage) {
        // 用户消息：删除从此消息往后的所有消息（不包括当前消息）
        messagesToDelete = allHistory.slice(currentIndex + 1);
        confirmMessage = `将删除从此用户消息之后的 ${messagesToDelete.length} 条消息，并重新生成AI回复。确认继续吗？`;
        checkboxKey = 'reroll-user-message-no-prompt';
    } else {
        // AI消息：删除从此消息开始往后的所有消息（包括当前消息）
        messagesToDelete = allHistory.slice(currentIndex);
        confirmMessage = `将删除从此AI消息开始的 ${messagesToDelete.length} 条消息，并重新生成AI回复。确认继续吗？`;
        checkboxKey = 'reroll-ai-message-no-prompt';
    }
    
    // 检查是否需要显示确认对话框
    const dontShowAgain = localStorage.getItem(checkboxKey) === 'true';
    let confirmed = false;
    
    if (dontShowAgain) {
        confirmed = true;
    } else {
        const result = await showConfirmDialog(
            '重新生成',
            confirmMessage,
            true,
            checkboxKey
        );
        confirmed = result.confirmed;
    }
    
    if (!confirmed) {
        return;
    }
    
    // 删除消息
    for (const msg of messagesToDelete) {
        await db.delete(STORES.CHAT_HISTORY, msg.id);
    }
    
    // 重新渲染界面
    await openChat(message.chatId);
    
    // 触发AI回复
    showToast('正在重新生成...');
    if (session.type === 'group') {
        await queueGroupAIResponse(session);
    } else {
        await queueAIResponse(session, contact);
    }
}

async function queueGroupAIResponse(session) {
    const settings = await getSettings();
    const presetId = settings.mainPresetId || settings.activePresetId || settings.presets[0].id;
    const activePreset = settings.presets.find(p => p.id === presetId) || settings.presets[0];
    const delay = (activePreset.replyDelay || 6) * 1000;

    if (messageTimer) clearTimeout(messageTimer);
    
    // 显示 "对方正在输入..." 的逻辑比较复杂，因为不知道谁会说话
    // 暂时先不显示 loading 状态，或者显示一个通用的 "群里有人正在输入..."
    const messagesDiv = document.getElementById('chat-messages');
    if (messagesDiv) {
        // 移除旧的 loading
        const oldLoading = messagesDiv.querySelector('.message.loading');
        if (oldLoading) messagesDiv.removeChild(oldLoading);
        
        // 添加新的 loading (可选，为了体验可以先加一个通用的)
        /*
        let loadingMsg = document.createElement('div');
        loadingMsg.className = 'message assistant loading';
        loadingMsg.innerHTML = '<div class="msg-content">...</div>';
        messagesDiv.appendChild(loadingMsg);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        */
    }

    messageTimer = setTimeout(async () => {
        await triggerGroupMembersResponse(session);
    }, delay);
}

async function triggerGroupMembersResponse(session) {
    // 获取群成员
    const contactIds = session.contactIds || [];
    const contacts = await Promise.all(contactIds.map(id => db.get(STORES.CONTACTS, id)));
    const validContacts = contacts.filter(c => c);

    if (validContacts.length === 0) return;

    // 获取最后一条消息，确定谁刚刚发过言
    const history = await db.getChatHistory(session.id);
    const lastMsg = history[history.length - 1];
    
    // 排除掉最后发言的人 (无论是用户还是AI)
    // 如果最后一条是用户的，所有AI都有机会发言
    // 如果最后一条是某个AI的，该AI暂时不发言 (给别人机会)
    let candidates = [];
    if (lastMsg && lastMsg.sender === 'assistant' && lastMsg.contactId) {
        candidates = validContacts.filter(c => c.id !== lastMsg.contactId);
    } else {
        candidates = validContacts;
    }

    // 并发触发所有候选人的思考
    // 注意：这里不 await Promise.all，让它们各自独立运行
    candidates.forEach(contact => {
        processGroupMemberResponse(session, contact).catch(err => {
            console.error(`Error in group member response (${contact.name}):`, err);
        });
    });
}

async function queueAIResponse(session, contact) {
    const settings = await getSettings();
    const presetId = settings.mainPresetId || settings.activePresetId || settings.presets[0].id;
    const activePreset = settings.presets.find(p => p.id === presetId) || settings.presets[0];
    const delay = (activePreset.replyDelay || 6) * 1000;

    if (messageTimer) clearTimeout(messageTimer);
    
    messageTimer = setTimeout(async () => {
        await processAIResponse(session, contact);
    }, delay);
}

async function processAIResponse(session, contact, retryCount = 0) {
    const MAX_RETRIES = 2;
    const settings = await getSettings();
    const presetId = settings.mainPresetId || settings.activePresetId || settings.presets[0].id;
    const activePreset = settings.presets.find(p => p.id === presetId) || settings.presets[0];
    
    if (!activePreset.apiKey) {
        showToast('请先配置 API Key');
        return;
    }

    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;

    // 只在首次调用时添加loading消息
    let loadingMsg = messagesDiv.querySelector('.message.loading');
    if (!loadingMsg) {
        loadingMsg = document.createElement('div');
        loadingMsg.className = 'message assistant loading';
        loadingMsg.innerHTML = '<div class="msg-content">对方正在输入中...</div>';
        messagesDiv.appendChild(loadingMsg);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } else if (retryCount > 0) {
        // 重试时更新提示
        loadingMsg.innerHTML = `<div class="msg-content">重试中... (${retryCount}/${MAX_RETRIES})</div>`;
    }

    try {
        // 获取聊天历史，onlyNormal参数为true时会自动过滤folded和recalled状态的消息
        const history = await db.getChatHistory(session.id, true);
        const contextCount = Math.min(settings.contextCount || 2000, 5000); // 确保不超过5000
        const recent = history.slice(-contextCount);

        const apiMessages = [];
        let systemContent = settings.systemPrompt || '';
        
        // 角色人设
        systemContent += `\n\n\n以下是角色人设：\n角色名：${contact.name}\n角色人设：\n${contact.description || '无'}`;

        // 用户人设
        let userName = '用户';
        if (session.userPersonaId) {
            const userPersona = await db.get(STORES.USER_PERSONAS, session.userPersonaId);
            if (userPersona) {
                 userName = userPersona.name || '用户';
                 systemContent += `\n\n\n以下是用户人设：\n用户名：${userName}\n用户人设：\n${userPersona.description || '无'}`;
            }
        }

        // 记忆板块
        const allMemories = await db.getAll(STORES.MEMORIES);
        const contactMemories = allMemories.filter(m => m.contactId === contact.id);
        if (contactMemories.length > 0) {
            systemContent += `\n\n\n以下是${contact.name}和${userName}的记忆：\n`;
            contactMemories.forEach(m => {
                systemContent += `- ${m.content}\n`;
            });
        }

        // 系统信息
        const now = new Date();
        let systemInfo = '';
        
        if (settings.includeDate !== false) {
             const dateStr = formatDate(now);
             systemInfo += `当前日期为：${dateStr}\n`;
        }
        
        if (settings.includeTime !== false) {
             const timeStr = now.toTimeString().split(' ')[0];
             systemInfo += `当前时间为：${timeStr}\n`;
        }

        if (settings.includeLocation) {
             const city = await getLocation();
             if (city) {
                 systemInfo += `用户当前定位：${city}\n`;

                 if (settings.includeWeather) {
                     const weather = await getWeather(city);
                     if (weather) {
                         systemInfo += `当前天气：${weather.temperature}, ${weather.description}, 风速 ${weather.wind}\n`;

                         if (settings.includeForecast && weather.forecast && weather.forecast.length > 0) {
                             const days = settings.forecastDays || 3;
                             const forecastList = weather.forecast.slice(0, days);
                             if (forecastList.length > 0) {
                                 systemInfo += `未来${forecastList.length}天预报：\n`;
                                 forecastList.forEach(f => {
                                     systemInfo += `- 第${f.day}天: ${f.temperature}, 风速 ${f.wind}\n`;
                                 });
                             }
                         }
                     }
                 }
             }
        }

        if (settings.includeBattery) {
            if ('getBattery' in navigator) {
                try {
                    const battery = await navigator.getBattery();
                    const level = Math.round(battery.level * 100);
                    const charging = battery.charging ? '充电中' : '未充电';
                    systemInfo += `当前电量：${level}% (${charging})\n`;
                } catch (e) {
                    console.warn('Failed to get battery info', e);
                }
            }
        }

        if (systemInfo) {
            systemContent += `\n\n系统信息：\n${systemInfo.trim()}`;
        }

        // 添加可用表情包列表
        const emojiList = await buildEmojiListForPrompt(contact.id);
        if (emojiList) {
            systemContent += emojiList;
        }

        apiMessages.push({ role: 'system', content: systemContent });
        for (const m of recent) {
            let content = m.content;
            let messageObj = null;
            
            if (m.sender === 'assistant') {
                const tag = m.type === 'text' ? 'words' : m.type;
                const timeStr = getCurrentTimestamp(new Date(typeof m.timestamp === 'number' ? m.timestamp * 1000 : m.timestamp));
                content = `<${tag} time="${timeStr}">${m.content}</${tag}>`;
                messageObj = {
                    role: 'assistant',
                    content: content
                };
            } else if (m.sender === 'user') {
                // 处理用户发送的特殊类型消息
                if (m.type === 'location') {
                    content = m.content; // 已经是 <location> 格式
                    messageObj = {
                        role: 'user',
                        content: content
                    };
                } else if (m.type === 'image') {
                    // 发送图片给支持视觉的 AI API（OpenAI Vision 格式）
                    messageObj = {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: '用户发送了一张图片，请查看并回应：'
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: m.content // base64 图片数据
                                }
                            }
                        ]
                    };
                } else if (m.type === 'emoji') {
                    const emoji = emojiCache[m.content];
                    const emojiMeaning = emoji?.meaning || m.content;
                    content = `[用户发送了表情包: ${emojiMeaning}]`;
                    messageObj = {
                        role: 'user',
                        content: content
                    };
                } else {
                    messageObj = {
                        role: 'user',
                        content: content
                    };
                }
            }
            
            if (messageObj) {
                apiMessages.push(messageObj);
            }
        }

        const requestBody = {
            model: activePreset.model,
            messages: apiMessages,
            temperature: contact.temperature || 1.0
        };

        await Logger.log(LOG_TYPES.API, {
            url: activePreset.apiUrl,
            request: requestBody
        });

        const response = await fetch(activePreset.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${activePreset.apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        await Logger.log(LOG_TYPES.API, {
            response: data
        });
        if (messagesDiv.contains(loadingMsg)) {
            messagesDiv.removeChild(loadingMsg);
        }

        if (data.choices && data.choices[0]) {
            const aiContent = data.choices[0].message.content;
            const now = getCurrentTimestamp();
            
            // 尝试解析 XML
            let parsedMessages = [];
            let additionData = {};

            try {
                // 提取 <output> 块，防止 AI 输出多余文本导致解析失败
                const xmlMatch = aiContent.match(/<output>[\s\S]*?<\/output>/);
                const xmlContent = xmlMatch ? xmlMatch[0] : aiContent;

                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
                
                // 检查解析错误
                const parserError = xmlDoc.querySelector('parsererror');
                if (parserError) throw new Error('XML Parser Error');

                const outputNode = xmlDoc.querySelector('output');
                if (outputNode) {
                    // 新版扁平化结构：直接遍历 output 的所有子节点
                    // 同时兼容旧版 message/addition 结构
                    let childNodes = [];
                    
                    // 检查是否有旧版 message 标签
                    const messageNode = outputNode.querySelector('message');
                    if (messageNode) {
                        childNodes = Array.from(messageNode.children);
                    } else {
                        // 新版扁平化结构，直接使用 output 的子节点
                        childNodes = Array.from(outputNode.children);
                    }
                    
                    for (const child of childNodes) {
                        let type = 'text';
                        let extraData = {};
                        
                        if (child.tagName === 'words') type = 'text';
                        else if (child.tagName === 'action') type = 'action';
                        else if (child.tagName === 'thought') type = 'thought';
                        else if (child.tagName === 'state') type = 'state';
                        else if (child.tagName === 'memory') type = 'memory';
                        else if (child.tagName === 'emoji') type = 'emoji';
                        else if (child.tagName === 'location') type = 'location';
                        else if (child.tagName === 'diary') {
                            // 日记标签 - 存入 additionData
                            if (child.textContent.trim()) {
                                additionData.diary = child.textContent.trim();
                            }
                            continue;
                        }
                        else if (child.tagName === 'moment') {
                            // 朋友圈标签 - 存入 additionData
                            if (child.textContent.trim()) {
                                additionData.moment = child.textContent.trim();
                            }
                            continue;
                        }
                        else if (child.tagName === 'redpacket') {
                            type = 'redpacket';
                            const amount = parseFloat(child.textContent.trim());
                            extraData.amount = isNaN(amount) ? 0 : amount;
                            extraData.message = child.getAttribute('message') || '恭喜发财，大吉大利';
                        }
                        else if (child.tagName === 'transfer') {
                            type = 'transfer';
                            const amount = parseFloat(child.textContent.trim());
                            extraData.amount = isNaN(amount) ? 0 : amount;
                            extraData.message = child.getAttribute('message') || '';
                        }
                        else if (child.tagName === 'product') {
                            type = 'product';
                            extraData.productName = child.getAttribute('name') || '商品';
                            extraData.price = child.getAttribute('price') || '';
                            extraData.image = child.getAttribute('image') || '';
                        }
                        else if (child.tagName === 'link') {
                            type = 'link';
                            extraData.linkTitle = child.getAttribute('title') || '链接';
                            extraData.url = child.getAttribute('url') || '';
                        }
                        else if (child.tagName === 'note') {
                            type = 'note';
                            extraData.noteTitle = child.getAttribute('title') || '备忘';
                        }
                        else if (child.tagName === 'message' || child.tagName === 'addition') {
                            // 跳过旧版的 message 和 addition 容器标签（已在上面处理）
                            continue;
                        }
                        
                        if (child.textContent.trim()) {
                            parsedMessages.push({
                                type: type,
                                content: child.textContent.trim(),
                                ...extraData
                            });
                        }
                    }

                    // 兼容旧版：解析额外内容 (addition)
                    const additionNode = outputNode.querySelector('addition');
                    if (additionNode) {
                        const diaryNode = additionNode.querySelector('diary');
                        if (diaryNode && diaryNode.textContent.trim() && !additionData.diary) {
                            additionData.diary = diaryNode.textContent.trim();
                        }

                        const momentNode = additionNode.querySelector('moment');
                        if (momentNode && momentNode.textContent.trim() && !additionData.moment) {
                            additionData.moment = momentNode.textContent.trim();
                        }

                        const memoryNode = additionNode.querySelector('memory');
                        if (memoryNode && memoryNode.textContent.trim()) {
                            // 旧版 addition 中的 memory 也存入 additionData
                            additionData.memory = memoryNode.textContent.trim();
                        }
                    }
                }
            } catch (e) {
                console.warn('XML Parsing failed or not XML, falling back to Regex', e);
            }

            // 如果 DOM 解析失败 (parsedMessages 为空)，尝试 Regex 解析
            if (parsedMessages.length === 0 && Object.keys(additionData).length === 0) {
                const tagRegex = /<(words|action|thought|state|emoji|location|redpacket|transfer|product|link|note|memory|diary|moment)(?:\s+[^>]*)?>(.*?)<\/\1>/gis;
                let match;
                while ((match = tagRegex.exec(aiContent)) !== null) {
                    let type = match[1].toLowerCase();
                    let extraData = {};
                    
                    // 处理生活轨迹标签（不在聊天中显示）
                    if (type === 'diary') {
                        if (match[2].trim()) additionData.diary = match[2].trim();
                        continue;
                    }
                    else if (type === 'moment') {
                        if (match[2].trim()) additionData.moment = match[2].trim();
                        continue;
                    }
                    
                    if (type === 'words') type = 'text';
                    else if (type === 'redpacket') {
                        const amount = parseFloat(match[2].trim());
                        extraData.amount = isNaN(amount) ? 0 : amount;
                        const messageMatch = match[0].match(/message="([^"]+)"/);
                        extraData.message = messageMatch ? messageMatch[1] : '恭喜发财，大吉大利';
                    }
                    else if (type === 'transfer') {
                        const amount = parseFloat(match[2].trim());
                        extraData.amount = isNaN(amount) ? 0 : amount;
                        const messageMatch = match[0].match(/message="([^"]+)"/);
                        extraData.message = messageMatch ? messageMatch[1] : '';
                    }
                    else if (type === 'product') {
                        const nameMatch = match[0].match(/name="([^"]+)"/);
                        const priceMatch = match[0].match(/price="([^"]+)"/);
                        const imageMatch = match[0].match(/image="([^"]+)"/);
                        extraData.productName = nameMatch ? nameMatch[1] : '商品';
                        extraData.price = priceMatch ? priceMatch[1] : '';
                        extraData.image = imageMatch ? imageMatch[1] : '';
                    }
                    else if (type === 'link') {
                        const titleMatch = match[0].match(/title="([^"]+)"/);
                        const urlMatch = match[0].match(/url="([^"]+)"/);
                        extraData.linkTitle = titleMatch ? titleMatch[1] : '链接';
                        extraData.url = urlMatch ? urlMatch[1] : '';
                    }
                    else if (type === 'note') {
                        const titleMatch = match[0].match(/title="([^"]+)"/);
                        extraData.noteTitle = titleMatch ? titleMatch[1] : '备忘';
                    }
                    
                    parsedMessages.push({
                        type: type,
                        content: match[2].trim(),
                        ...extraData
                    });
                }
            }

            // 处理额外内容存储
            if (additionData.diary) {
                const diaryEntry = {
                    id: generateId(),
                    title: `${contact.name}的日记本`,
                    date: new Date().toISOString().split('T')[0],
                    mood: '开心', // 默认为开心，后续可根据 state 优化
                    content: additionData.diary,
                    createdAt: now,
                    updatedAt: now,
                    source: 'ai_chat',
                    contactId: contact.id
                };
                await db.put(STORES.DIARIES, diaryEntry);
                showToast('已自动记录日记');
            }

            if (additionData.moment) {
                const momentEntry = {
                    id: generateId(),
                    contactId: contact.id,
                    content: additionData.moment,
                    date: now,
                    likes: [],
                    comments: []
                };
                await db.put(STORES.MOMENTS, momentEntry);
                showToast('已发布朋友圈动态');
            }

            if (additionData.memory) {
                const memoryEntry = {
                    id: generateId(),
                    contactId: contact.id,
                    content: additionData.memory,
                    date: now,
                    type: 'fact'
                };
                await db.put(STORES.MEMORIES, memoryEntry);
                showToast('已记录关键记忆');
            }

            // 处理备忘录消息 - 自动保存到备忘录应用
            for (const msg of parsedMessages) {
                if (msg.type === 'note' && msg.content) {
                    const noteEntry = {
                        id: generateId(),
                        title: msg.noteTitle || '来自聊天的备忘',
                        content: msg.content,
                        category: 'life',
                        isPinned: false,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };
                    await db.put(STORES.SETTINGS, noteEntry, `note_${noteEntry.id}`);
                    showToast('已添加备忘录');
                }
            }

            // 如果解析失败或为空，回退到纯文本
            if (parsedMessages.length === 0) {
                parsedMessages.push({ type: 'text', content: aiContent });
            }

            // 批量保存消息
            let lastMsgContent = '';
            let latestStatus = null;
            for (const msg of parsedMessages) {
                const aiMsg = {
                    chatId: session.id,
                    contactId: session.contactId,
                    sender: 'assistant',
                    type: msg.type,
                    content: msg.content,
                    status: 'normal',
                    timestamp: now,
                    // 保存红包/转账的额外属性
                    ...(msg.amount !== undefined && { amount: msg.amount }),
                    ...(msg.message !== undefined && { message: msg.message })
                };
                await db.put(STORES.CHAT_HISTORY, aiMsg);
                if (msg.type === 'text') lastMsgContent = msg.content;
                else if (msg.type === 'redpacket') lastMsgContent = `[红包] ¥${msg.amount}`;
                else if (msg.type === 'transfer') lastMsgContent = `[转账] ¥${msg.amount}`;
                else if (msg.type === 'product') lastMsgContent = `[商品] ${msg.productName}`;
                else if (msg.type === 'link') lastMsgContent = `[链接] ${msg.linkTitle}`;
                else if (msg.type === 'note') lastMsgContent = `[备忘] ${msg.noteTitle}`;
                else if (msg.type === 'state') latestStatus = msg.content;
                else if (msg.type === 'memory') {
                    // 自动存入记忆库
                    const memoryEntry = {
                        id: generateId(),
                        contactId: contact.id,
                        content: msg.content,
                        date: now,
                        type: 'fact'
                    };
                    await db.put(STORES.MEMORIES, memoryEntry);
                    showToast('已记录关键记忆');
                }
            }
            
            if (!lastMsgContent && parsedMessages.length > 0) {
                // 排除 state 和 memory 类型，找最后一条非状态消息
                const nonStateMessages = parsedMessages.filter(m => m.type !== 'state' && m.type !== 'memory');
                if (nonStateMessages.length > 0) {
                    lastMsgContent = nonStateMessages[nonStateMessages.length - 1].content;
                }
            }

            // 更新会话
            session.lastActive = now;
            session.lastMessage = lastMsgContent || '[新消息]';
            // 保存最新状态到会话
            if (latestStatus) {
                session.lastStatus = latestStatus;
            }
            await db.put(STORES.SESSIONS, session);

            if (currentChatId === session.id) {
                openChat(session.id);
            }
        } else {
            // API 返回了响应但没有有效内容
            const errorMsg = data.error?.message || 'API 响应为空或格式异常';
            throw new Error(errorMsg);
        }
    } catch (error) {
        await Logger.log(LOG_TYPES.ERROR, `AI Response Error (attempt ${retryCount + 1}): ${error.message}`);
        
        // 检查是否可以重试
        if (retryCount < MAX_RETRIES) {
            console.log(`AI response failed, retrying... (${retryCount + 1}/${MAX_RETRIES})`);
            // 延迟1秒后重试
            await new Promise(resolve => setTimeout(resolve, 1000));
            return processAIResponse(session, contact, retryCount + 1);
        }
        
        // 所有重试都失败，移除loading消息并显示错误弹窗
        if (messagesDiv && messagesDiv.contains(loadingMsg)) {
            messagesDiv.removeChild(loadingMsg);
        }
        
        // 显示详细错误弹窗
        showErrorDialog('AI 回复失败', error.message, {
            apiUrl: activePreset.apiUrl,
            model: activePreset.model,
            retryAttempts: retryCount + 1
        });
    }
}

async function processGroupMemberResponse(session, targetContact) {
    const settings = await getSettings();
    const presetId = settings.mainPresetId || settings.activePresetId || settings.presets[0].id;
    const activePreset = settings.presets.find(p => p.id === presetId) || settings.presets[0];
    
    if (!activePreset.apiKey) {
        console.warn('API Key not configured, skipping group response');
        return;
    }

    // 显示 "对方正在输入..." - 这里对于并发请求，可能会有多个 loading 状态
    // 我们暂时不在 UI 上显示具体的 loading，以免闪烁或混乱
    // 或者可以显示一个不带名字的通用 loading

    try {
        const history = await db.getChatHistory(session.id, true);
        const contextCount = Math.min(settings.contextCount || 2000, 5000);
        const recent = history.slice(-contextCount);

        // 获取群成员信息
        const contactIds = session.contactIds || [];
        const contacts = await Promise.all(contactIds.map(id => db.get(STORES.CONTACTS, id)));
        const validContacts = contacts.filter(c => c);

        // 构建 System Prompt - 使用单角色群聊 Prompt
        const groupPrompt = await getGroupPrompt();
        let systemContent = groupPrompt || '';
        
        // 注入当前角色身份
        systemContent += `\n\n## 你的身份\n`;
        systemContent += `你现在的角色是：${targetContact.name}\n`;
        systemContent += `你的ID是：${targetContact.id}\n`;
        systemContent += `你的人设：${targetContact.description || '无'}\n`;

        // 注入群成员列表
        systemContent += `\n## 群成员列表\n`;
        validContacts.forEach(c => {
            if (c.id !== targetContact.id) {
                systemContent += `- ${c.name} (ID: ${c.id}): ${c.description || '无'}\n`;
            } else {
                systemContent += `- ${c.name} (你自己)\n`;
            }
        });

        // 用户人设
        let userName = '用户';
        if (session.userPersonaId) {
            const userPersona = await db.get(STORES.USER_PERSONAS, session.userPersonaId);
            if (userPersona) {
                 userName = userPersona.name || '用户';
                 systemContent += `\n## 用户信息\n用户名：${userName}\n用户人设：${userPersona.description || '无'}\n`;
            }
        }

        // 系统信息 (时间、位置等)
        const now = new Date();
        let systemInfo = '';
        
        if (settings.includeDate !== false) {
             const dateStr = formatDate(now);
             systemInfo += `当前日期为：${dateStr}\n`;
        }
        
        if (settings.includeTime !== false) {
             const timeStr = now.toTimeString().split(' ')[0];
             systemInfo += `当前时间为：${timeStr}\n`;
        }

        if (settings.includeLocation) {
             const city = await getLocation();
             if (city) {
                 systemInfo += `用户当前定位：${city}\n`;

                 if (settings.includeWeather) {
                     const weather = await getWeather(city);
                     if (weather) {
                         systemInfo += `当前天气：${weather.temperature}, ${weather.description}, 风速 ${weather.wind}\n`;
                     }
                 }
             }
        }

        if (systemInfo) {
            systemContent += `\n## 环境信息\n${systemInfo.trim()}\n`;
        }

        // 构建消息历史
        const apiMessages = [{ role: 'system', content: systemContent }];
        
        for (const m of recent) {
            let content = m.content;
            let role = 'user';
            
            if (m.sender === 'assistant') {
                role = 'assistant';
                // 尝试找到发送者名字
                const senderContact = validContacts.find(c => c.id === m.contactId);
                const senderName = senderContact ? senderContact.name : '未知角色';
                
                // 历史消息格式化：[角色名]: 消息内容
                // 注意：这里要把所有消息都变成 user role，或者明确标记是谁说的，
                // 因为我们在让 AI 扮演 targetContact，所以其他 AI 的发言对它来说也是外部输入。
                // 简单的做法是全部作为 user 消息，或者用 name 属性。
                // OpenAI API 支持 name 属性，但为了兼容性，我们直接写在 content 里。
                
                if (m.contactId === targetContact.id) {
                    role = 'assistant'; // 自己说的话
                    content = m.content; // 直接内容
                } else {
                    role = 'user'; // 别人说的话（包括其他AI）
                    content = `[${senderName}]: ${m.content}`;
                }
            } else {
                // 用户消息
                role = 'user';
                content = `[${userName}]: ${m.content}`;
            }
            
            apiMessages.push({ role, content });
        }

        const requestBody = {
            model: activePreset.model,
            messages: apiMessages,
            temperature: targetContact.temperature || 1.0
        };

        await Logger.log(LOG_TYPES.API, {
            url: activePreset.apiUrl,
            request: requestBody,
            context: `Group Chat - Member: ${targetContact.name}`
        });

        const response = await fetch(activePreset.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${activePreset.apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        
        await Logger.log(LOG_TYPES.API, {
            response: data,
            context: `Group Chat - Member: ${targetContact.name}`
        });

        if (data.choices && data.choices[0]) {
            const aiContent = data.choices[0].message.content;
            
            // 检查是否为空消息
            if (aiContent.includes('<info>empty message</info>')) {
                console.log(`${targetContact.name} decided to stay silent.`);
                return;
            }

            const now = getCurrentTimestamp();
            
            // 解析内容（这里不需要解析 <role> 标签了，因为 AI 只是输出自己的话）
            // 直接复用 parseGroupRoleContent 来解析 <words>, <thought> 等标签
            // 虽然函数名带有 GroupRoleContent，但逻辑是通用的标签解析
            const parsedMessages = parseGroupRoleContent(aiContent);
            
            let lastMsgContent = '';
            
            for (const msg of parsedMessages) {
                const aiMsg = {
                    chatId: session.id,
                    contactId: targetContact.id,
                    sender: 'assistant',
                    type: msg.type,
                    content: msg.content,
                    status: 'normal',
                    timestamp: now,
                    ...(msg.amount !== undefined && { amount: msg.amount }),
                    ...(msg.message !== undefined && { message: msg.message }),
                    ...(msg.productName !== undefined && { productName: msg.productName }),
                    ...(msg.price !== undefined && { price: msg.price }),
                    ...(msg.image !== undefined && { image: msg.image }),
                    ...(msg.linkTitle !== undefined && { linkTitle: msg.linkTitle }),
                    ...(msg.url !== undefined && { url: msg.url }),
                    ...(msg.noteTitle !== undefined && { noteTitle: msg.noteTitle })
                };

                // 群聊中，如果AI发送了表情包，则自动为群内所有角色授权该表情包
                if (msg.type === 'emoji' && session.type === 'group') {
                    await authorizeEmojiForGroup(msg.content, session);
                }

                await db.put(STORES.CHAT_HISTORY, aiMsg);
                
                if (msg.type === 'text') lastMsgContent = msg.content;
                else lastMsgContent = `[${msg.type}]`;
            }

            // 更新会话
            session.lastActive = now;
            session.lastMessage = `${targetContact.name}: ${lastMsgContent || '[新消息]'}`;
            await db.put(STORES.SESSIONS, session);

            if (currentChatId === session.id) {
                await renderMessagesInManageMode();
            }
            
            // **关键一步**：有人说话了，触发新一轮的群聊循环
            // 这样其他想说话但没抢到的，或者想接话的角色，会在 delay 之后再次思考
            queueGroupAIResponse(session);

        } else {
            console.warn('API Response invalid', data);
        }

    } catch (error) {
        console.error(`Group Member (${targetContact.name}) Response Error:`, error);
        // 不弹窗报错，避免干扰用户，仅记录日志
    }
}

/**
 * 解析群聊角色内容中的消息标签
 * @param {string} content - 角色标签内的内容
 * @returns {Array} 解析后的消息数组
 */
function parseGroupRoleContent(content) {
    const messages = [];
    
    // 支持的标签类型
    const tagRegex = /<(words|action|thought|state|emoji|location|redpacket|transfer|product|link|note)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>/gi;
    let match;
    let hasMatch = false;
    
    while ((match = tagRegex.exec(content)) !== null) {
        hasMatch = true;
        let type = match[1].toLowerCase();
        const tagContent = match[2].trim();
        let extraData = {};
        
        // 转换 words 为 text
        if (type === 'words') type = 'text';
        
        // 提取红包属性
        if (type === 'redpacket') {
            const amount = parseFloat(tagContent);
            extraData.amount = isNaN(amount) ? 0 : amount;
            const messageMatch = match[0].match(/message="([^"]+)"/);
            extraData.message = messageMatch ? messageMatch[1] : '恭喜发财，大吉大利';
        }
        
        // 提取转账属性
        if (type === 'transfer') {
            const amount = parseFloat(tagContent);
            extraData.amount = isNaN(amount) ? 0 : amount;
            const messageMatch = match[0].match(/message="([^"]+)"/);
            extraData.message = messageMatch ? messageMatch[1] : '';
        }
        
        // 提取商品属性
        if (type === 'product') {
            const nameMatch = match[0].match(/name="([^"]+)"/);
            const priceMatch = match[0].match(/price="([^"]+)"/);
            const imageMatch = match[0].match(/image="([^"]+)"/);
            extraData.productName = nameMatch ? nameMatch[1] : '商品';
            extraData.price = priceMatch ? priceMatch[1] : '';
            extraData.image = imageMatch ? imageMatch[1] : '';
        }
        
        // 提取链接属性
        if (type === 'link') {
            const titleMatch = match[0].match(/title="([^"]+)"/);
            const urlMatch = match[0].match(/url="([^"]+)"/);
            extraData.linkTitle = titleMatch ? titleMatch[1] : '链接';
            extraData.url = urlMatch ? urlMatch[1] : '';
        }
        
        // 提取备忘录属性
        if (type === 'note') {
            const titleMatch = match[0].match(/title="([^"]+)"/);
            extraData.noteTitle = titleMatch ? titleMatch[1] : '备忘';
        }
        
        // state 和 thought 类型不保存到聊天记录，但仍然解析
        // memory 类型也不保存到聊天记录
        if (type !== 'state' && type !== 'memory') {
            messages.push({
                type: type,
                content: tagContent,
                ...extraData
            });
        }
    }
    
    // 如果没有匹配到任何标签，将整个内容作为文本消息
    if (!hasMatch && content.trim()) {
        messages.push({
            type: 'text',
            content: content.trim()
        });
    }
    
    return messages;
}

/**
 * 显示错误详情弹窗
 * @param {string} title - 错误标题
 * @param {string} message - 错误消息
 * @param {object} details - 额外的错误详情
 */
function showErrorDialog(title, message, details = {}) {
    // 移除已存在的错误弹窗
    const existingDialog = document.getElementById('error-dialog');
    if (existingDialog) {
        document.body.removeChild(existingDialog);
    }
    
    const dialog = document.createElement('div');
    dialog.id = 'error-dialog';
    dialog.className = 'error-dialog';
    
    // 构建详情内容
    let detailsHtml = '';
    if (details.apiUrl) {
        detailsHtml += `<div class="error-detail-item"><span class="error-detail-label">API 地址:</span><span class="error-detail-value">${details.apiUrl}</span></div>`;
    }
    if (details.model) {
        detailsHtml += `<div class="error-detail-item"><span class="error-detail-label">模型:</span><span class="error-detail-value">${details.model}</span></div>`;
    }
    if (details.retryAttempts) {
        detailsHtml += `<div class="error-detail-item"><span class="error-detail-label">重试次数:</span><span class="error-detail-value">${details.retryAttempts} 次</span></div>`;
    }
    
    dialog.innerHTML = `
        <div class="error-dialog-overlay"></div>
        <div class="error-dialog-content">
            <div class="error-dialog-header">
                <div class="error-dialog-icon">⚠️</div>
                <h3>${title}</h3>
            </div>
            <div class="error-dialog-body">
                <div class="error-message">${message}</div>
                ${detailsHtml ? `<div class="error-details">${detailsHtml}</div>` : ''}
            </div>
            <div class="error-dialog-actions">
                <button class="error-dialog-btn" id="error-close-btn">我知道了</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    // 绑定关闭事件
    const closeBtn = document.getElementById('error-close-btn');
    const overlay = dialog.querySelector('.error-dialog-overlay');
    
    const closeDialog = () => {
        dialog.classList.remove('visible');
        setTimeout(() => {
            if (document.body.contains(dialog)) {
                document.body.removeChild(dialog);
            }
        }, 300);
    };
    
    closeBtn.onclick = closeDialog;
    overlay.onclick = closeDialog;
    
    // 显示动画
    requestAnimationFrame(() => {
        dialog.classList.add('visible');
    });
}

async function getSettings() {
    const s = await db.get(STORES.SETTINGS, 'ai_settings');
    
    // 默认设置
    const defaultSettings = {
        activePresetId: 'default',
        mainPresetId: 'default',
        funcPresetId: 'same_as_main',
        presets: [
            {
                id: 'default',
                name: '默认预设',
                apiUrl: 'https://api.siliconflow.cn/v1/chat/completions',
                apiKey: '',
                model: 'vendor/model-name',
                replyDelay: 6
            }
        ],
        systemPrompt: await getDefaultSystemPrompt(),
        contextCount: 2000,
        includeDate: true,
        includeTime: true,
        includeLocation: true
    };

    if (!s) return defaultSettings;

    // 兼容旧版本数据结构
    if (!s.presets) {
        const oldPreset = {
            id: 'default',
            name: '默认预设',
            apiUrl: s.apiUrl || defaultSettings.presets[0].apiUrl,
            apiKey: s.apiKey || '',
            model: s.model || defaultSettings.presets[0].model,
            replyDelay: s.replyDelay || 6
        };
        return {
            ...defaultSettings,
            presets: [oldPreset],
            systemPrompt: s.systemPrompt || await getDefaultSystemPrompt(),
            contextCount: s.contextCount || 2000
        };
    }

    // 强制使用文件中的系统提示词，确保始终最新
    s.systemPrompt = await getDefaultSystemPrompt();

    // 确保新字段有默认值
    if (s.includeDate === undefined) s.includeDate = true;
    if (s.includeTime === undefined) s.includeTime = true;
    if (s.includeLocation === undefined) s.includeLocation = true;
    if (s.includeWeather === undefined) s.includeWeather = true;
    if (s.includeForecast === undefined) s.includeForecast = true;
    if (s.forecastDays === undefined) s.forecastDays = 3;
    if (s.includeBattery === undefined) s.includeBattery = true;

    return s;
}

/**
 * 切换扩展菜单的显示/隐藏
 */
function toggleExtensionMenu() {
    const extensionMenu = document.getElementById('extension-menu');
    const plusBtn = document.getElementById('plus-btn');
    if (!extensionMenu) return;
    
    if (extensionMenu.classList.contains('visible')) {
        extensionMenu.classList.remove('visible');
        plusBtn.classList.remove('active');
    } else {
        extensionMenu.classList.add('visible');
        plusBtn.classList.add('active');
    }
}

/**
 * 隐藏扩展菜单
 */
function hideExtensionMenu() {
    const extensionMenu = document.getElementById('extension-menu');
    const plusBtn = document.getElementById('plus-btn');
    if (extensionMenu) {
        extensionMenu.classList.remove('visible');
    }
    if (plusBtn) {
        plusBtn.classList.remove('active');
    }
}

/**
 * 处理扩展菜单项的操作
 */
async function handleExtensionAction(action, session, contact) {
    switch (action) {
        case 'photo':
            await handlePhotoAction(session, contact);
            break;
        case 'camera':
            await handleCameraAction(session, contact);
            break;
        case 'location':
            await handleLocationAction(session, contact);
            break;
        case 'gift':
            await handleGiftAction(session, contact);
            break;
        case 'redpacket':
            await handleRedpacketAction(session, contact);
            break;
        case 'transfer':
            await handleTransferAction(session, contact);
            break;
        case 'anniversary':
            await handleAnniversaryAction(session, contact);
            break;
        default:
            showToast('未知操作');
    }
}

/**
 * 处理纪念日功能 - 显示纪念日选择器
 */
async function handleAnniversaryAction(session, contact) {
    const anniversaries = await db.getAll(STORES.ANNIVERSARIES);
    
    if (anniversaries.length === 0) {
        showToast('还没有纪念日，去添加一个吧');
        return;
    }
    
    // 移除已存在的对话框
    const existingDialog = document.getElementById('anniversary-select-dialog');
    if (existingDialog) {
        document.body.removeChild(existingDialog);
    }
    
    const dialog = document.createElement('div');
    dialog.id = 'anniversary-select-dialog';
    dialog.className = 'anniversary-send-dialog';
    dialog.innerHTML = `
        <div class="anniversary-send-dialog-overlay"></div>
        <div class="anniversary-send-dialog-content">
            <div class="anniversary-send-dialog-header">
                <h3>选择纪念日</h3>
                <button class="close-btn">×</button>
            </div>
            <div class="anniversary-select-list">
                ${anniversaries.map(item => {
                    const days = calculateAnniversaryDays(item.targetDate, item.type);
                    const label = item.type === 'countdown' ? '还有' : '已经';
                    return `
                        <div class="anniversary-select-item" data-id="${item.id}">
                            <div class="anniversary-select-info">
                                <div class="anniversary-select-title">${item.title}</div>
                                <div class="anniversary-select-date">${formatAnniversaryDate(item.targetDate)}</div>
                            </div>
                            <div class="anniversary-select-days ${item.type}">
                                <span class="days-text">${label}</span>
                                <span class="days-number">${Math.abs(days)}</span>
                                <span class="days-unit">天</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    const closeBtn = dialog.querySelector('.close-btn');
    const overlay = dialog.querySelector('.anniversary-send-dialog-overlay');
    
    const closeDialog = () => {
        dialog.classList.remove('visible');
        setTimeout(() => {
            if (document.body.contains(dialog)) {
                document.body.removeChild(dialog);
            }
        }, 300);
    };
    
    closeBtn.onclick = closeDialog;
    overlay.onclick = closeDialog;
    
    // 选择纪念日
    dialog.querySelectorAll('.anniversary-select-item').forEach(item => {
        item.onclick = async () => {
            const anniversaryId = item.dataset.id;
            const anniversary = anniversaries.find(a => a.id === anniversaryId);
            if (anniversary) {
                await sendAnniversaryMessage(anniversary, session, contact);
            }
            closeDialog();
        };
    });
    
    requestAnimationFrame(() => {
        dialog.classList.add('visible');
    });
}

/**
 * 计算纪念日天数
 */
function calculateAnniversaryDays(targetDate, type = 'countdown') {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);
    
    const diffTime = type === 'countdown'
        ? target.getTime() - now.getTime()
        : now.getTime() - target.getTime();
    
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
}

/**
 * 格式化纪念日日期
 */
function formatAnniversaryDate(dateStr) {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const weekDay = weekDays[date.getDay()];
    
    return `${year}-${month}-${day} ${weekDay}`;
}

/**
 * 发送纪念日消息
 */
async function sendAnniversaryMessage(anniversary, session, contact) {
    const days = calculateAnniversaryDays(anniversary.targetDate, anniversary.type);
    const label = anniversary.type === 'countdown' ? '还有' : '已经';
    const background = anniversary.background || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800';
    
    // 创建纪念日消息
    const content = `<anniversary id="${anniversary.id}" title="${anniversary.title}" days="${Math.abs(days)}" label="${label}" date="${formatAnniversaryDate(anniversary.targetDate)}" background="${background}"></anniversary>`;
    
    const now = getCurrentTimestamp();
    const message = {
        chatId: currentChatId,
        contactId: session.contactId,
        sender: 'user',
        type: 'text',
        content: content,
        status: 'normal',
        timestamp: now
    };
    
    await db.put(STORES.CHAT_HISTORY, message);
    
    // 更新会话
    session.lastActive = now;
    session.lastMessage = `[纪念日] ${anniversary.title}`;
    await db.put(STORES.SESSIONS, session);
    
    await Logger.log(LOG_TYPES.ACTION, `User sent anniversary to ${contact.name}: ${anniversary.title}`);
    
    await renderMessagesInManageMode();
    queueAIResponse(session, contact);
}

/**
 * 处理礼物功能
 */
async function handleGiftAction(session, contact) {
    // 跳转到商城
    if (window.lnChat && window.lnChat.openApp) {
        window.lnChat.closeApp();
        setTimeout(() => window.lnChat.openApp('store'), 100);
    }
}

/**
 * 处理红包功能
 */
async function handleRedpacketAction(session, contact) {
    showAmountInputDialog('redpacket', session, contact);
}

/**
 * 处理转账功能
 */
async function handleTransferAction(session, contact) {
    showAmountInputDialog('transfer', session, contact);
}

/**
 * 显示金额输入对话框
 */
function showAmountInputDialog(type, session, contact) {
    const isRedpacket = type === 'redpacket';
    const title = isRedpacket ? '发红包' : '转账';
    const icon = isRedpacket ? '🧧' : '💰';
    const color = isRedpacket ? '#E53935' : '#4CAF50';
    
    // 移除已存在的对话框
    const existingDialog = document.getElementById('amount-input-dialog');
    if (existingDialog) {
        document.body.removeChild(existingDialog);
    }
    
    const dialog = document.createElement('div');
    dialog.id = 'amount-input-dialog';
    dialog.className = 'amount-input-dialog';
    dialog.innerHTML = `
        <div class="amount-dialog-overlay"></div>
        <div class="amount-dialog-content" style="border-top: 4px solid ${color};">
            <div class="amount-dialog-header">
                <div style="font-size: 40px; margin-bottom: 10px;">${icon}</div>
                <h3>${title}给 ${contact.name}</h3>
            </div>
            <div class="amount-dialog-body">
                <div class="amount-input-wrapper">
                    <span class="currency-symbol">¥</span>
                    <input type="number" id="amount-input" class="amount-input" placeholder="0.00" min="0.01" step="0.01" />
                </div>
                <div class="quick-amount-btns">
                    <button class="quick-amount-btn" data-amount="10">¥10</button>
                    <button class="quick-amount-btn" data-amount="50">¥50</button>
                    <button class="quick-amount-btn" data-amount="100">¥100</button>
                    <button class="quick-amount-btn" data-amount="200">¥200</button>
                    <button class="quick-amount-btn" data-amount="520">¥520</button>
                    <button class="quick-amount-btn" data-amount="1314">¥1314</button>
                </div>
                <div class="message-input-wrapper" style="margin-top: 15px;">
                    <input type="text" id="amount-message" class="redpacket-message-input" placeholder="${isRedpacket ? '恭喜发财，大吉大利' : '转账说明（可选）'}" maxlength="30" />
                </div>
            </div>
            <div class="amount-dialog-actions">
                <button class="amount-dialog-btn secondary" id="amount-cancel-btn">取消</button>
                <button class="amount-dialog-btn primary" id="amount-send-btn" style="background: ${color};">${title}</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    // 绑定事件
    const closeBtn = dialog.querySelector('.amount-dialog-overlay');
    const cancelBtn = document.getElementById('amount-cancel-btn');
    const sendBtn = document.getElementById('amount-send-btn');
    const amountInput = document.getElementById('amount-input');
    
    const closeDialog = () => {
        dialog.classList.remove('visible');
        setTimeout(() => {
            if (document.body.contains(dialog)) {
                document.body.removeChild(dialog);
            }
        }, 300);
    };
    
    closeBtn.onclick = closeDialog;
    cancelBtn.onclick = closeDialog;
    
    // 快捷金额按钮
    dialog.querySelectorAll('.quick-amount-btn').forEach(btn => {
        btn.onclick = () => {
            amountInput.value = btn.dataset.amount;
        };
    });
    
    sendBtn.onclick = async () => {
        const amount = parseFloat(amountInput.value);
        if (!amount || amount <= 0) {
            showToast('请输入有效金额');
            return;
        }
        
        const messageInput = document.getElementById('amount-message');
        const message = messageInput?.value || '';
        
        if (isRedpacket) {
            await sendRedpacketMessage(amount, message || '恭喜发财，大吉大利', session, contact);
        } else {
            await sendTransferMessage(amount, message, session, contact);
        }
        
        closeDialog();
    };
    
    // 显示动画
    requestAnimationFrame(() => {
        dialog.classList.add('visible');
        amountInput.focus();
    });
}

/**
 * 发送红包消息
 */
async function sendRedpacketMessage(amount, message, session, contact) {
    const now = getCurrentTimestamp();
    // 格式：<redpacket message="祝福语">金额</redpacket>
    const redpacketContent = `<redpacket message="${message}">${amount}</redpacket>`;
    const redpacketMsg = {
        chatId: currentChatId,
        contactId: session.contactId,
        sender: 'user',
        type: 'text',
        content: redpacketContent,
        status: 'normal',
        timestamp: now
    };
    await db.put(STORES.CHAT_HISTORY, redpacketMsg);
    
    session.lastActive = now;
    session.lastMessage = `[红包] ¥${amount}`;
    await db.put(STORES.SESSIONS, session);
    
    await Logger.log(LOG_TYPES.ACTION, `User sent redpacket to ${contact.name}: ¥${amount}`);
    
    await renderMessagesInManageMode();
    queueAIResponse(session, contact);
}

/**
 * 发送转账消息
 */
async function sendTransferMessage(amount, message, session, contact) {
    const now = getCurrentTimestamp();
    // 格式：<transfer message="备注">金额</transfer>
    const transferContent = message
        ? `<transfer message="${message}">${amount}</transfer>`
        : `<transfer>${amount}</transfer>`;
    const transferMsg = {
        chatId: currentChatId,
        contactId: session.contactId,
        sender: 'user',
        type: 'text',
        content: transferContent,
        status: 'normal',
        timestamp: now
    };
    await db.put(STORES.CHAT_HISTORY, transferMsg);
    
    session.lastActive = now;
    session.lastMessage = message ? `[转账] ¥${amount} ${message}` : `[转账] ¥${amount}`;
    await db.put(STORES.SESSIONS, session);
    
    await Logger.log(LOG_TYPES.ACTION, `User sent transfer to ${contact.name}: ¥${amount}${message ? ' - ' + message : ''}`);
    
    await renderMessagesInManageMode();
    queueAIResponse(session, contact);
}

/**
 * 处理相册选择
 */
async function handlePhotoAction(session, contact) {
    // 创建隐藏的文件输入
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = false;
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const imageData = await readFileAsBase64(file);
            await sendImageMessage(imageData, session, contact);
        } catch (error) {
            showToast('图片读取失败: ' + error.message);
        }
    };
    
    input.click();
}

/**
 * 处理拍照
 */
async function handleCameraAction(session, contact) {
    // 创建隐藏的文件输入，设置为capture模式
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // 使用后置摄像头
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const imageData = await readFileAsBase64(file);
            await sendImageMessage(imageData, session, contact);
        } catch (error) {
            showToast('图片读取失败: ' + error.message);
        }
    };
    
    input.click();
}

/**
 * 处理位置分享 - 弹出输入对话框让用户手动输入位置
 */
async function handleLocationAction(session, contact) {
    // 创建位置输入对话框
    showLocationInputDialog(session, contact);
}

/**
 * 显示位置输入对话框
 */
function showLocationInputDialog(session, contact) {
    // 移除已存在的对话框
    const existingDialog = document.getElementById('location-input-dialog');
    if (existingDialog) {
        document.body.removeChild(existingDialog);
    }

    const dialog = document.createElement('div');
    dialog.id = 'location-input-dialog';
    dialog.className = 'location-input-dialog';
    dialog.innerHTML = `
        <div class="location-dialog-overlay"></div>
        <div class="location-dialog-content">
            <div class="location-dialog-header">
                <h3>📍 分享位置</h3>
                <button class="close-btn">×</button>
            </div>
            <div class="location-dialog-body">
                <input type="text" id="location-input" class="location-input" placeholder="请输入位置信息，如：北京市朝阳区" />
                <p class="location-hint">提示：请手动输入您想分享的位置</p>
            </div>
            <div class="location-dialog-actions">
                <button class="location-dialog-btn secondary" id="location-cancel-btn">取消</button>
                <button class="location-dialog-btn primary" id="location-send-btn">发送</button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    // 绑定事件
    const closeBtn = dialog.querySelector('.close-btn');
    const overlay = dialog.querySelector('.location-dialog-overlay');
    const cancelBtn = document.getElementById('location-cancel-btn');
    const sendBtn = document.getElementById('location-send-btn');
    const input = document.getElementById('location-input');

    const closeDialog = () => {
        dialog.classList.remove('visible');
        setTimeout(() => {
            if (document.body.contains(dialog)) {
                document.body.removeChild(dialog);
            }
        }, 300);
    };

    closeBtn.onclick = closeDialog;
    overlay.onclick = closeDialog;
    cancelBtn.onclick = closeDialog;

    sendBtn.onclick = async () => {
        const location = input.value.trim();
        if (!location) {
            showToast('请输入位置信息');
            return;
        }
        
        await sendLocationMessage(location, session, contact);
        closeDialog();
    };

    // 回车发送
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendBtn.click();
        }
    };

    // 显示动画
    requestAnimationFrame(() => {
        dialog.classList.add('visible');
        input.focus();
    });
}

/**
 * 发送位置消息
 */
async function sendLocationMessage(location, session, contact) {
    const now = getCurrentTimestamp();
    const locationContent = `<location>${location}</location>`;
    const locationMsg = {
        chatId: currentChatId,
        contactId: session.contactId,
        sender: 'user',
        type: 'text', // 改为 text 类型，以便通过预处理器解析标签
        content: locationContent,
        status: 'normal',
        timestamp: now
    };
    await db.put(STORES.CHAT_HISTORY, locationMsg);
    
    session.lastActive = now;
    session.lastMessage = `[位置] ${location}`;
    await db.put(STORES.SESSIONS, session);
    
    await Logger.log(LOG_TYPES.ACTION, `User sent location to ${contact.name}: ${location}`);
    
    await renderMessagesInManageMode();
    queueAIResponse(session, contact);
}

/**
 * 读取文件为 Base64
 */
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
    });
}

/**
 * 发送图片消息
 */
async function sendImageMessage(imageData, session, contact) {
    const now = getCurrentTimestamp();
    const imageMsg = {
        chatId: currentChatId,
        contactId: session.contactId,
        sender: 'user',
        type: 'image',
        content: imageData,
        status: 'normal',
        timestamp: now
    };
    await db.put(STORES.CHAT_HISTORY, imageMsg);
    
    session.lastActive = now;
    session.lastMessage = '[图片]';
    await db.put(STORES.SESSIONS, session);
    
    await Logger.log(LOG_TYPES.ACTION, `User sent image to ${contact.name}`);
    
    await renderMessagesInManageMode();
    queueAIResponse(session, contact);
}
