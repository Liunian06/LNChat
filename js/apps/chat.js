/**
 * LNChat 聊天模块
 */

import { db, STORES } from '../db.js';
import { formatTime, simpleMarkdown, showToast, generateId, getDefaultSystemPrompt, getCurrentTimestamp, formatDate } from '../utils.js';
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

export async function init(target, actions) {
    container = target;
    headerActions = actions;
    isManageMode = false;
    selectedSessions.clear();
    // 初始化时加载表情包缓存
    await loadEmojiCache();
    renderMainSessionList();
}

/**
 * 加载表情包缓存
 */
async function loadEmojiCache() {
    const allEmojis = await db.getAll(STORES.EMOJIS);
    emojiCache = {};
    for (const emoji of allEmojis) {
        emojiCache[emoji.id] = emoji;
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
 * 根据表情ID获取表情图片数据
 * @param {string} emojiId - 表情ID
 * @returns {string|null} 表情图片的base64数据，如果不存在则返回null
 */
function getEmojiImageById(emojiId) {
    if (!emojiCache) return null;
    const emoji = emojiCache[emojiId];
    return emoji ? emoji.imageData : null;
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
    const sessions = await db.getAll(STORES.SESSIONS);
    const contacts = await db.getAll(STORES.CONTACTS);
    const contactMap = Object.fromEntries(contacts.map(c => [c.id, c]));

    if (isManageMode) {
        window.lnChat.appTitle.textContent = selectedSessions.size > 0 ? `已选择 ${selectedSessions.size} 项` : '选择会话';
        headerActions.innerHTML = `<button id="cancel-manage-btn" style="font-size:14px; background:none; border:none; color:white;">完成</button>`;
        document.getElementById('cancel-manage-btn').onclick = () => toggleManageMode(false);
    } else {
        window.lnChat.appTitle.textContent = '聊天';
        headerActions.innerHTML = `
            <button id="manage-btn" style="margin-right:10px; font-size:14px; background:none; border:none; color:white;">管理</button>
            <button id="add-chat-btn">➕</button>
        `;
        document.getElementById('manage-btn').onclick = () => toggleManageMode(true);
        document.getElementById('add-chat-btn').onclick = () => showContactSelector();
    }

    if (sessions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💬</div>
                <p>暂无聊天会话</p>
                <button id="start-chat-btn">发起新聊天</button>
            </div>
        `;
        document.getElementById('start-chat-btn').onclick = () => showContactSelector();
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
                const contact = contactMap[s.contactId] || { name: '未知角色', avatar: '' };
                const isSelected = selectedSessions.has(s.id.toString());
                return `
                    <div class="chat-item session-item ${isManageMode ? 'manage-mode' : ''} ${isSelected ? 'selected' : ''}" data-id="${s.id}">
                        <div class="checkbox-wrapper">
                            <div class="custom-checkbox"></div>
                        </div>
                        <div class="avatar">${contact.avatar ? `<img src="${contact.avatar}">` : '👤'}</div>
                        <div class="info">
                            <div class="name">${contact.name}</div>
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

async function createSession(contactId, userPersonaId) {
    const contact = await db.get(STORES.CONTACTS, contactId);
    const newSession = {
        id: generateId(),
        contactId: contactId,
        userPersonaId: userPersonaId,
        title: `与 ${contact.name} 的对话`,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        lastMessage: '新开启的对话'
    };
    await db.put(STORES.SESSIONS, newSession);
    openChat(newSession.id);
}

/**
 * 更新聊天界面头部
 */
function updateChatHeader(contactName) {
    if (isMessageManageMode) {
        window.lnChat.appTitle.textContent = selectedMessages.size > 0 ? `已选择 ${selectedMessages.size} 条` : '选择消息';
        headerActions.innerHTML = `<button id="cancel-message-manage-btn" style="font-size:14px; background:none; border:none; color:white;">完成</button>`;
        document.getElementById('cancel-message-manage-btn').onclick = () => toggleMessageManageMode(false);
    } else {
        window.lnChat.appTitle.textContent = contactName;
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
            const contact = await db.get(STORES.CONTACTS, session.contactId);
            if (contact) {
                updateChatHeader(contact.name);
                renderMessagesInManageMode();
            }
        }
    });
}

/**
 * 在管理模式下重新渲染消息
 */
async function renderMessagesInManageMode() {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;
    
    const history = await db.getChatHistory(currentChatId);
    
    // 更新容器类名
    if (isMessageManageMode) {
        messagesDiv.classList.add('manage-mode');
    } else {
        messagesDiv.classList.remove('manage-mode');
    }
    
    // 预处理历史记录
    const expandedHistory = [];
    for (const msg of history) {
        if (msg.sender === 'assistant' && msg.type === 'text' && /<(words|action|thought|state|emoji)(?:\s+[^>]*)?>/i.test(msg.content)) {
            const parsedParts = [];
            const tagRegex = /<(words|action|thought|state|emoji)(?:\s+[^>]*)?>(.*?)<\/\1>/gis;
            let match;
            while ((match = tagRegex.exec(msg.content)) !== null) {
                let type = match[1].toLowerCase();
                if (type === 'words') type = 'text';
                parsedParts.push({
                    type: type,
                    content: match[2].trim()
                });
            }
            
            if (parsedParts.length > 0) {
                parsedParts.forEach((part, index) => {
                    expandedHistory.push({
                        ...msg,
                        virtualId: `${msg.id}_${index}`,
                        type: part.type,
                        content: part.content
                    });
                });
            } else {
                expandedHistory.push(msg);
            }
        } else {
            expandedHistory.push(msg);
        }
    }
    
    messagesDiv.innerHTML = expandedHistory.map(msg => {
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
            const emojiImage = getEmojiImageById(msg.content);
            if (emojiImage) {
                contentHtml = `<img src="${emojiImage}" class="emoji-message-img" style="max-width: 120px; max-height: 120px; border-radius: 10px;">`;
            } else {
                contentHtml = `<span class="emoji-not-found">[表情包: ${msg.content}]</span>`;
            }
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
        
        return `
            <div class="message ${msg.sender} ${msg.type} ${msg.status} ${isMessageManageMode ? 'manage-mode' : ''} ${isSelected ? 'selected' : ''}"
                 data-id="${msg.virtualId || msg.id}" data-real-id="${msg.id}">
                <div class="message-checkbox-wrapper">
                    <div class="custom-checkbox"></div>
                </div>
                <div class="message-content-wrapper">
                    <div class="msg-content">${contentHtml}${foldedTag}</div>
                    <div class="msg-time">${timeDisplay}</div>
                </div>
            </div>
        `;
    }).join('');
    
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
    
    // 绑定事件
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
 * 聊天窗口
 */
async function openChat(chatId) {
    currentChatId = chatId;
    isMessageManageMode = false;
    selectedMessages.clear();
    
    const session = await db.get(STORES.SESSIONS, chatId);
    if (!session) return renderMainSessionList();
    
    const contact = await db.get(STORES.CONTACTS, session.contactId);
    
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        isMessageManageMode = false;
        selectedMessages.clear();
        renderMainSessionList();
    };
    
    updateChatHeader(contact.name);

    container.innerHTML = `
        <div class="chat-container">
            <div class="messages" id="chat-messages"></div>
            <div class="input-area">
                <textarea id="chat-input" placeholder="输入消息..."></textarea>
                <button id="emoji-btn" class="icon-btn">😊</button>
                <button id="send-btn">发送</button>
            </div>
        </div>
    `;

    const messagesDiv = document.getElementById('chat-messages');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const emojiBtn = document.getElementById('emoji-btn');

    await renderMessagesInManageMode();

    // 绑定表情包按钮事件
    emojiBtn.onclick = async () => {
        await showEmojiSelector(session.contactId);
    };

    sendBtn.onclick = async () => {
        const content = input.value.trim();
        if (!content) return;
        input.value = '';

        const now = getCurrentTimestamp();
        const userMsg = {
            chatId,
            contactId: session.contactId,
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

        await Logger.log(LOG_TYPES.ACTION, `User sent message to ${contact.name}: ${content}`);

        await renderMessagesInManageMode();
        queueAIResponse(session, contact);
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
    
    const contact = await db.get(STORES.CONTACTS, session.contactId);
    if (!contact) {
        showToast('角色不存在');
        return;
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
    await queueAIResponse(session, contact);
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

async function processAIResponse(session, contact) {
    const settings = await getSettings();
    const presetId = settings.mainPresetId || settings.activePresetId || settings.presets[0].id;
    const activePreset = settings.presets.find(p => p.id === presetId) || settings.presets[0];
    
    if (!activePreset.apiKey) {
        showToast('请先配置 API Key');
        return;
    }

    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;

    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'message assistant loading';
    loadingMsg.innerHTML = '<div class="msg-content">对方正在输入中...</div>';
    messagesDiv.appendChild(loadingMsg);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

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
        apiMessages.push(...recent.map(m => {
            let content = m.content;
            if (m.sender === 'assistant') {
                const tag = m.type === 'text' ? 'words' : m.type;
                const timeStr = getCurrentTimestamp(new Date(typeof m.timestamp === 'number' ? m.timestamp * 1000 : m.timestamp));
                content = `<${tag} time="${timeStr}">${m.content}</${tag}>`;
            }
            return {
                role: m.sender === 'user' ? 'user' : 'assistant',
                content: content
            };
        }));

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
                    const messageNode = outputNode.querySelector('message');
                    if (messageNode) {
                        for (const child of messageNode.children) {
                            let type = 'text';
                            if (child.tagName === 'words') type = 'text';
                            else if (child.tagName === 'action') type = 'action';
                            else if (child.tagName === 'thought') type = 'thought';
                            else if (child.tagName === 'state') type = 'state';
                            else if (child.tagName === 'emoji') type = 'emoji';
                            
                            if (child.textContent.trim()) {
                                parsedMessages.push({
                                    type: type,
                                    content: child.textContent.trim()
                                });
                            }
                        }
                    }

                    // 解析额外内容 (addition)
                    const additionNode = outputNode.querySelector('addition');
                    if (additionNode) {
                        const diaryNode = additionNode.querySelector('diary');
                        if (diaryNode && diaryNode.textContent.trim()) {
                            additionData.diary = diaryNode.textContent.trim();
                        }

                        const momentNode = additionNode.querySelector('moment');
                        if (momentNode && momentNode.textContent.trim()) {
                            additionData.moment = momentNode.textContent.trim();
                        }

                        const memoryNode = additionNode.querySelector('memory');
                        if (memoryNode && memoryNode.textContent.trim()) {
                            additionData.memory = memoryNode.textContent.trim();
                        }
                    }
                }
            } catch (e) {
                console.warn('XML Parsing failed or not XML, falling back to Regex', e);
            }

            // 如果 DOM 解析失败 (parsedMessages 为空)，尝试 Regex 解析
            if (parsedMessages.length === 0) {
                const tagRegex = /<(words|action|thought|state|emoji)(?:\s+[^>]*)?>(.*?)<\/\1>/gis;
                let match;
                while ((match = tagRegex.exec(aiContent)) !== null) {
                    let type = match[1].toLowerCase();
                    if (type === 'words') type = 'text';
                    parsedMessages.push({
                        type: type,
                        content: match[2].trim()
                    });
                }
                
                // Regex for addition
                const diaryMatch = aiContent.match(/<diary>(.*?)<\/diary>/is);
                if (diaryMatch) additionData.diary = diaryMatch[1].trim();

                const momentMatch = aiContent.match(/<moment>(.*?)<\/moment>/is);
                if (momentMatch) additionData.moment = momentMatch[1].trim();

                const memoryMatch = aiContent.match(/<memory>(.*?)<\/memory>/is);
                if (memoryMatch) additionData.memory = memoryMatch[1].trim();
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

            // 如果解析失败或为空，回退到纯文本
            if (parsedMessages.length === 0) {
                parsedMessages.push({ type: 'text', content: aiContent });
            }

            // 批量保存消息
            let lastMsgContent = '';
            for (const msg of parsedMessages) {
                const aiMsg = {
                    chatId: session.id,
                    contactId: session.contactId,
                    sender: 'assistant',
                    type: msg.type,
                    content: msg.content,
                    status: 'normal',
                    timestamp: now
                };
                await db.put(STORES.CHAT_HISTORY, aiMsg);
                if (msg.type === 'text') lastMsgContent = msg.content;
            }
            
            if (!lastMsgContent && parsedMessages.length > 0) {
                lastMsgContent = parsedMessages[parsedMessages.length - 1].content;
            }

            // 更新会话
            session.lastActive = now;
            session.lastMessage = lastMsgContent || '[新消息]';
            await db.put(STORES.SESSIONS, session);

            if (currentChatId === session.id) {
                openChat(session.id);
            }
        } else {
            throw new Error(data.error?.message || 'API 响应异常');
        }
    } catch (error) {
        if (messagesDiv && messagesDiv.contains(loadingMsg)) {
            messagesDiv.removeChild(loadingMsg);
        }
        await Logger.log(LOG_TYPES.ERROR, `AI Response Error: ${error.message}`);
        showToast('AI 回复失败: ' + error.message);
    }
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
