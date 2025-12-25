/**
 * LNChat 查手机模块 - 以角色视角查看手机内容
 */

import { db, STORES } from '../db.js';
import { formatTime, formatDate, showToast, simpleMarkdown, getMoodEmoji } from '../utils.js';

let container, headerActions;
let currentContactId = null;
let currentView = 'select'; // 'select', 'home', 'chat', 'moments', 'diary', 'gifts', 'calls', 'gallery'

// 格式化相对时间
function formatRelativeTime(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    
    return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export async function init(target, actions) {
    container = target;
    headerActions = actions;
    currentContactId = null;
    currentView = 'select';
    
    await renderContactSelector();
}

export function cleanup() {
    currentContactId = null;
    currentView = 'select';
}

/**
 * 角色选择界面
 */
async function renderContactSelector() {
    currentView = 'select';
    const contacts = await db.getAll(STORES.CONTACTS);
    
    // 过滤掉"我"这个系统用户
    const filteredContacts = contacts.filter(c => c.id !== 'user_me');
    
    window.lnChat.appTitle.textContent = '查手机';
    headerActions.innerHTML = '';
    
    if (filteredContacts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📱</div>
                <p>还没有可以查看的角色</p>
                <p style="font-size: 14px; color: var(--text-secondary); margin-top: 10px;">请先在联系人中创建角色</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="phone-contact-selector">
            <div class="phone-selector-header">
                <div class="phone-selector-icon">📱</div>
                <h2>选择要查看谁的手机</h2>
                <p>以角色的视角查看手机内容</p>
            </div>
            <div class="phone-contact-list">
                ${filteredContacts.map(c => `
                    <div class="phone-contact-item" data-id="${c.id}">
                        <div class="phone-contact-avatar">
                            ${c.avatar ? `<img src="${c.avatar}">` : '👤'}
                        </div>
                        <div class="phone-contact-info">
                            <div class="phone-contact-name">${c.name}</div>
                            <div class="phone-contact-desc">${c.description || '点击查看TA的手机'}</div>
                        </div>
                        <div class="phone-contact-arrow">→</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    container.querySelectorAll('.phone-contact-item').forEach(item => {
        item.onclick = () => {
            currentContactId = item.dataset.id;
            renderPhoneHome();
        };
    });
}

/**
 * 角色手机主界面 - 模拟手机桌面
 */
async function renderPhoneHome() {
    currentView = 'home';
    const contact = await db.get(STORES.CONTACTS, currentContactId);
    if (!contact) {
        showToast('角色不存在');
        renderContactSelector();
        return;
    }
    
    window.lnChat.appTitle.textContent = `${contact.name}的手机`;
    headerActions.innerHTML = '';
    
    // 设置返回按钮行为
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        renderContactSelector();
    };
    
    // 获取各类数据统计
    const sessions = await db.getAll(STORES.SESSIONS);
    const contactSessions = sessions.filter(s => s.contactId === currentContactId);
    const chatCount = contactSessions.length;
    
    const moments = await db.getAll(STORES.MOMENTS);
    const contactMoments = moments.filter(m => m.contactId === currentContactId);
    const momentCount = contactMoments.length;
    
    const diaries = await db.getAll(STORES.DIARIES);
    const contactDiaries = diaries.filter(d => d.contactId === currentContactId);
    const diaryCount = contactDiaries.length;
    
    const gifts = await db.getAll(STORES.GIFTS);
    const contactGifts = gifts.filter(g => g.contactId === currentContactId);
    const giftCount = contactGifts.length;

    // 获取相册数据
    const images = await db.getAll(STORES.IMAGES);
    // 假设相册是全局的，或者我们可以根据某种规则关联到角色。
    // 这里暂时显示所有相册，或者如果未来有基于角色的相册，可以在这里过滤。
    // 目前 photos.js 中没有明确的角色关联，所以我们显示所有相册数量作为示例，
    // 或者如果想更真实，可以只显示该角色上传的照片（如果有记录上传者）。
    // 简化起见，这里显示相册总数。
    const albums = images.filter(img => img.type === 'album');
    const albumCount = albums.length;
    
    container.innerHTML = `
        <div class="phone-home-container">
            <!-- 手机壁纸和状态栏 -->
            <div class="phone-wallpaper">
                <div class="phone-wallpaper-overlay"></div>
                <div class="phone-owner-info">
                    <div class="phone-owner-avatar">
                        ${contact.avatar ? `<img src="${contact.avatar}">` : '👤'}
                    </div>
                    <div class="phone-owner-name">${contact.name}的手机</div>
                </div>
            </div>
            
            <!-- 手机应用网格 -->
            <div class="phone-app-grid">
                <div class="phone-app-item" data-app="chat">
                    <div class="phone-app-icon chat-icon">💬</div>
                    <div class="phone-app-name">聊天</div>
                </div>
                <div class="phone-app-item" data-app="moments">
                    <div class="phone-app-icon moments-icon">🌟</div>
                    <div class="phone-app-name">朋友圈</div>
                </div>
                <div class="phone-app-item" data-app="diary">
                    <div class="phone-app-icon diary-icon">📔</div>
                    <div class="phone-app-name">日记</div>
                </div>
                <div class="phone-app-item" data-app="gallery">
                    <div class="phone-app-icon gallery-icon">🖼️</div>
                    <div class="phone-app-name">相册</div>
                </div>
                <div class="phone-app-item" data-app="gifts">
                    <div class="phone-app-icon gifts-icon">🎁</div>
                    <div class="phone-app-name">礼物</div>
                </div>
            </div>
            
            <div class="phone-hint">
                <span>💡</span>
                <span>你正在以${contact.name}的视角查看TA的手机</span>
            </div>
        </div>
    `;
    
    // 绑定应用点击事件
    container.querySelectorAll('.phone-app-item').forEach(item => {
        item.onclick = () => {
            const app = item.dataset.app;
            if (app === 'chat') {
                renderPhoneChat();
            } else if (app === 'moments') {
                renderPhoneMoments();
            } else if (app === 'diary') {
                renderPhoneDiary();
            } else if (app === 'gifts') {
                renderPhoneGifts();
            } else if (app === 'gallery') {
                renderPhoneGallery();
            }
        };
    });
}

/**
 * 查看角色的聊天记录（角色视角，用户和角色身份对调）
 */
async function renderPhoneChat() {
    currentView = 'chat';
    const contact = await db.get(STORES.CONTACTS, currentContactId);
    if (!contact) return;
    
    window.lnChat.appTitle.textContent = `${contact.name}的聊天`;
    
    // 设置返回按钮
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        renderPhoneHome();
    };
    
    // 获取与该角色的所有会话
    const sessions = await db.getAll(STORES.SESSIONS);
    const contactSessions = sessions.filter(s => s.contactId === currentContactId);
    
    if (contactSessions.length === 0) {
        container.innerHTML = `
            <div class="phone-empty-state">
                <div class="phone-empty-icon">💬</div>
                <p>${contact.name}还没有聊天记录</p>
            </div>
        `;
        return;
    }
    
    // 按最后活跃时间排序
    contactSessions.sort((a, b) => {
        const timeA = new Date(a.lastActive || a.createdAt);
        const timeB = new Date(b.lastActive || b.createdAt);
        return timeB - timeA;
    });
    
    // 获取用户人设信息
    const userPersonas = await db.getAll(STORES.USER_PERSONAS);
    const personaMap = Object.fromEntries(userPersonas.map(p => [p.id, p]));
    
    container.innerHTML = `
        <div class="phone-chat-list">
            ${contactSessions.map(s => {
                const persona = s.userPersonaId ? personaMap[s.userPersonaId] : null;
                const userName = persona ? persona.name : '用户';
                return `
                    <div class="phone-chat-item" data-session-id="${s.id}">
                        <div class="phone-chat-avatar">👤</div>
                        <div class="phone-chat-info">
                            <div class="phone-chat-name">${userName}</div>
                            <div class="phone-chat-preview">${s.lastMessage || '新对话'}</div>
                        </div>
                        <div class="phone-chat-time">${formatRelativeTime(s.lastActive || s.createdAt)}</div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    container.querySelectorAll('.phone-chat-item').forEach(item => {
        item.onclick = () => {
            renderPhoneChatDetail(item.dataset.sessionId);
        };
    });
}

/**
 * 查看具体的聊天记录（角色视角）
 */
async function renderPhoneChatDetail(sessionId) {
    const contact = await db.get(STORES.CONTACTS, currentContactId);
    const session = await db.get(STORES.SESSIONS, sessionId);
    if (!contact || !session) return;
    
    // 获取用户人设
    const userPersona = session.userPersonaId ? await db.get(STORES.USER_PERSONAS, session.userPersonaId) : null;
    const userName = userPersona ? userPersona.name : '用户';
    
    window.lnChat.appTitle.textContent = `与${userName}的聊天`;
    
    // 设置返回按钮
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        renderPhoneChat();
    };
    
    // 获取聊天记录
    const history = await db.getChatHistory(sessionId);
    
    if (history.length === 0) {
        container.innerHTML = `
            <div class="phone-empty-state">
                <div class="phone-empty-icon">💬</div>
                <p>暂无聊天记录</p>
            </div>
        `;
        return;
    }
    
    // 预处理消息，展开XML标签
    const expandedHistory = [];
    for (const msg of history) {
        if (msg.status === 'recalled') continue;
        
        if (msg.type === 'text' && /<(words|action|thought|state|emoji|location|redpacket|transfer)(?:\s+[^>]*)?>/i.test(msg.content)) {
            const tagRegex = /<(words|action|thought|state|emoji|location|redpacket|transfer)(?:\s+[^>]*)?>(.*?)<\/\1>/gis;
            let match;
            while ((match = tagRegex.exec(msg.content)) !== null) {
                let type = match[1].toLowerCase();
                if (type === 'words') type = 'text';
                if (type === 'state') continue; // 跳过状态消息
                
                expandedHistory.push({
                    ...msg,
                    type: type,
                    content: match[2].trim()
                });
            }
        } else if (msg.type !== 'state') {
            expandedHistory.push(msg);
        }
    }
    
    container.innerHTML = `
        <div class="phone-chat-container">
            <div class="phone-messages" id="phone-messages">
                ${expandedHistory.map(msg => {
                    // 角色视角：
                    // msg.sender === 'assistant' (角色自己发的消息) -> 显示在右边，使用 .user 样式
                    // msg.sender === 'user' (对方/用户发的消息) -> 显示在左边，使用 .assistant 样式
                    const displayClass = msg.sender === 'assistant' ? 'user' : 'assistant';
                    
                    let contentHtml = '';
                    if (msg.type === 'text' || msg.type === 'action' || msg.type === 'thought') {
                        contentHtml = simpleMarkdown(msg.content);
                    } else if (msg.type === 'image') {
                        contentHtml = `<img src="${msg.content}" style="max-width: 100%; border-radius: 10px;">`;
                    } else if (msg.type === 'emoji') {
                        // 简单处理表情包显示，若有缓存机制可优化
                        contentHtml = `<span class="phone-emoji-placeholder">[表情包]</span>`;
                    } else if (msg.type === 'location') {
                        contentHtml = `<div class="location-message">
                            <div class="location-icon">📍</div>
                            <div class="location-info">
                                <div class="location-title">${msg.content}</div>
                                <div class="location-address">位置分享</div>
                            </div>
                            <div class="location-label">位置</div>
                        </div>`;
                    } else if (msg.type === 'redpacket') {
                        const amount = msg.amount || 0;
                        const message = msg.message || '恭喜发财，大吉大利';
                        contentHtml = `<div class="redpacket-message">
                            <div class="redpacket-icon">🧧</div>
                            <div class="redpacket-info">
                                <div class="redpacket-amount">¥${amount}</div>
                                <div class="redpacket-msg">${message}</div>
                            </div>
                            <div class="redpacket-label">红包</div>
                        </div>`;
                    } else if (msg.type === 'transfer') {
                        const amount = msg.amount || 0;
                        const message = msg.message || '转账给你';
                        contentHtml = `<div class="transfer-message">
                            <div class="transfer-icon">💰</div>
                            <div class="transfer-info">
                                <div class="transfer-amount">¥${amount}</div>
                                <div class="transfer-label-text">${message}</div>
                            </div>
                            <div class="transfer-label">转账</div>
                        </div>`;
                    } else {
                        contentHtml = msg.content;
                    }
                    
                    return `
                        <div class="message ${displayClass} ${msg.type}">
                            <div class="message-content-wrapper">
                                <div class="msg-content">${contentHtml}</div>
                                <div class="msg-time">${formatTime(msg.timestamp)}</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
    
    // 滚动到底部
    const messagesDiv = document.getElementById('phone-messages');
    if (messagesDiv) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
}

/**
 * 查看角色的朋友圈
 */
async function renderPhoneMoments() {
    currentView = 'moments';
    const contact = await db.get(STORES.CONTACTS, currentContactId);
    if (!contact) return;
    
    window.lnChat.appTitle.textContent = `${contact.name}的朋友圈`;
    
    // 设置返回按钮
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        renderPhoneHome();
    };
    
    // 获取该角色的朋友圈动态
    const moments = await db.getAll(STORES.MOMENTS);
    const contactMoments = moments.filter(m => m.contactId === currentContactId);
    contactMoments.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (contactMoments.length === 0) {
        container.innerHTML = `
            <div class="phone-empty-state">
                <div class="phone-empty-icon">🌟</div>
                <p>${contact.name}还没有发布朋友圈</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="phone-moments-container">
            <!-- 封面区域 -->
            <div class="phone-moments-cover">
                <div class="phone-moments-cover-overlay"></div>
                <div class="phone-moments-profile">
                    <div class="phone-moments-profile-avatar">
                        ${contact.avatar ? `<img src="${contact.avatar}">` : '👤'}
                    </div>
                    <div class="phone-moments-profile-name">${contact.name}</div>
                </div>
            </div>
            
            <!-- 动态列表 -->
            <div class="phone-moments-feed">
                ${contactMoments.map(m => renderMomentCard(m, contact)).join('')}
            </div>
        </div>
    `;
}

/**
 * 渲染朋友圈卡片
 */
function renderMomentCard(moment, contact) {
    const images = moment.images || [];
    const likes = moment.likes || [];
    const comments = moment.comments || [];
    
    let imageGridClass = 'phone-moments-images';
    if (images.length === 1) imageGridClass += ' single';
    else if (images.length === 2 || images.length === 4) imageGridClass += ' grid-2';
    else if (images.length >= 3) imageGridClass += ' grid-3';
    
    return `
        <div class="phone-moments-card">
            <div class="phone-moments-card-avatar">
                ${contact.avatar ? `<img src="${contact.avatar}">` : '👤'}
            </div>
            <div class="phone-moments-card-content">
                <div class="phone-moments-card-name">${contact.name}</div>
                <div class="phone-moments-card-text">${moment.content}</div>
                
                ${images.length > 0 ? `
                    <div class="${imageGridClass}">
                        ${images.map(img => `
                            <div class="phone-moments-image-item">
                                <img src="${img}" alt="moment image">
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                
                <div class="phone-moments-card-footer">
                    <span class="phone-moments-card-time">${formatRelativeTime(moment.date)}</span>
                </div>
                
                ${(likes.length > 0 || comments.length > 0) ? `
                    <div class="phone-moments-interactions">
                        ${likes.length > 0 ? `
                            <div class="phone-moments-likes">
                                <span>❤️</span>
                                <span>${likes.join('、')}</span>
                            </div>
                        ` : ''}
                        ${comments.length > 0 ? `
                            <div class="phone-moments-comments">
                                ${comments.map(c => `
                                    <div class="phone-moments-comment">
                                        <span class="phone-moments-comment-author">${c.author}:</span>
                                        <span>${c.text}</span>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * 查看角色的日记
 */
async function renderPhoneDiary() {
    currentView = 'diary';
    const contact = await db.get(STORES.CONTACTS, currentContactId);
    if (!contact) return;
    
    window.lnChat.appTitle.textContent = `${contact.name}的日记`;
    
    // 设置返回按钮
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        renderPhoneHome();
    };
    
    // 获取该角色的日记
    const diaries = await db.getAll(STORES.DIARIES);
    const contactDiaries = diaries.filter(d => d.contactId === currentContactId);
    contactDiaries.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (contactDiaries.length === 0) {
        container.innerHTML = `
            <div class="phone-empty-state">
                <div class="phone-empty-icon">📔</div>
                <p>${contact.name}还没有写日记</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="phone-diary-container">
            <div class="phone-diary-header">
                <div class="phone-diary-owner">
                    <div class="phone-diary-owner-avatar">
                        ${contact.avatar ? `<img src="${contact.avatar}">` : '👤'}
                    </div>
                    <div class="phone-diary-owner-info">
                        <div class="phone-diary-owner-name">${contact.name}的日记本</div>
                        <div class="phone-diary-owner-count">共 ${contactDiaries.length} 篇</div>
                    </div>
                </div>
            </div>
            <div class="phone-diary-list">
                ${contactDiaries.map(d => `
                    <div class="phone-diary-item" data-id="${d.id}">
                        <div class="phone-diary-item-date">
                            <div class="phone-diary-item-day">${new Date(d.date).getDate()}</div>
                            <div class="phone-diary-item-month">${new Date(d.date).getMonth() + 1}月</div>
                        </div>
                        <div class="phone-diary-item-content">
                            <div class="phone-diary-item-title">
                                <span class="phone-diary-item-mood">${getMoodEmoji(d.mood)}</span>
                                <span>${d.title}</span>
                            </div>
                            <div class="phone-diary-item-preview">${d.content.substring(0, 50)}${d.content.length > 50 ? '...' : ''}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    container.querySelectorAll('.phone-diary-item').forEach(item => {
        item.onclick = () => {
            renderPhoneDiaryDetail(item.dataset.id);
        };
    });
}

/**
 * 查看日记详情
 */
async function renderPhoneDiaryDetail(diaryId) {
    const contact = await db.get(STORES.CONTACTS, currentContactId);
    const diary = await db.get(STORES.DIARIES, diaryId);
    if (!contact || !diary) return;
    
    window.lnChat.appTitle.textContent = diary.title;
    
    // 设置返回按钮
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        renderPhoneDiary();
    };
    
    container.innerHTML = `
        <div class="phone-diary-detail">
            <div class="phone-diary-detail-header">
                <div class="phone-diary-detail-date">${formatDate(diary.date)}</div>
                <div class="phone-diary-detail-mood">${getMoodEmoji(diary.mood)} ${diary.mood}</div>
            </div>
            <div class="phone-diary-detail-title">${diary.title}</div>
            <div class="phone-diary-detail-content">${diary.content}</div>
        </div>
    `;
}

/**
 * 查看角色收到的礼物
 */
async function renderPhoneGifts() {
    currentView = 'gifts';
    const contact = await db.get(STORES.CONTACTS, currentContactId);
    if (!contact) return;
    
    window.lnChat.appTitle.textContent = `${contact.name}的礼物`;
    
    // 设置返回按钮
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        renderPhoneHome();
    };
    
    // 获取该角色收到的礼物
    const gifts = await db.getAll(STORES.GIFTS);
    const contactGifts = gifts.filter(g => g.contactId === currentContactId);
    contactGifts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // 获取商品信息
    const storeItems = await db.getAll(STORES.STORE_ITEMS);
    const itemMap = Object.fromEntries(storeItems.map(i => [i.id, i]));
    
    if (contactGifts.length === 0) {
        container.innerHTML = `
            <div class="phone-empty-state">
                <div class="phone-empty-icon">🎁</div>
                <p>${contact.name}还没有收到礼物</p>
                <p style="font-size: 14px; color: var(--text-secondary); margin-top: 10px;">去商城给TA买点礼物吧~</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="phone-gifts-container">
            <div class="phone-gifts-header">
                <div class="phone-gifts-count">
                    <span class="phone-gifts-count-number">${contactGifts.length}</span>
                    <span class="phone-gifts-count-label">份礼物</span>
                </div>
            </div>
            <div class="phone-gifts-grid">
                ${contactGifts.map(g => {
                    const item = itemMap[g.itemId];
                    return `
                        <div class="phone-gift-item">
                            <div class="phone-gift-icon">${item?.icon || '🎁'}</div>
                            <div class="phone-gift-name">${item?.name || '未知礼物'}</div>
                            <div class="phone-gift-time">${formatRelativeTime(g.timestamp)}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

/**
 * 查看相册
 */
async function renderPhoneGallery() {
    currentView = 'gallery';
    const contact = await db.get(STORES.CONTACTS, currentContactId);
    if (!contact) return;
    
    window.lnChat.appTitle.textContent = `${contact.name}的相册`;
    
    // 设置返回按钮
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        renderPhoneHome();
    };
    
    // 获取所有相册
    const allImages = await db.getAll(STORES.IMAGES);
    const albums = allImages.filter(item => item.type === 'album');
    
    if (albums.length === 0) {
        container.innerHTML = `
            <div class="phone-empty-state">
                <div class="phone-empty-icon">🖼️</div>
                <p>暂无相册</p>
            </div>
        `;
        return;
    }
    
    // 获取每个相册的封面
    const albumsWithCover = await Promise.all(albums.map(async album => {
        const photos = allImages.filter(item => item.type === 'photo' && item.albumId === album.id);
        return {
            ...album,
            photoCount: photos.length,
            cover: photos.length > 0 ? photos[0] : null
        };
    }));
    
    container.innerHTML = `
        <div class="phone-gallery-container">
            <div class="phone-gallery-grid">
                ${albumsWithCover.map(album => `
                    <div class="phone-album-card" data-id="${album.id}">
                        <div class="phone-album-cover">
                            ${album.cover ? `<img src="${URL.createObjectURL(album.cover.blob)}">` : `<div class="phone-album-placeholder" style="background: ${album.color || '#ccc'}"></div>`}
                        </div>
                        <div class="phone-album-info">
                            <div class="phone-album-name">${album.name}</div>
                            <div class="phone-album-count">${album.photoCount} 张</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    container.querySelectorAll('.phone-album-card').forEach(card => {
        card.onclick = () => {
            renderPhoneAlbumDetail(card.dataset.id);
        };
    });
}

/**
 * 查看相册详情
 */
async function renderPhoneAlbumDetail(albumId) {
    const album = await db.get(STORES.IMAGES, albumId);
    if (!album) return;
    
    window.lnChat.appTitle.textContent = album.name;
    
    // 设置返回按钮
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        renderPhoneGallery();
    };
    
    const allImages = await db.getAll(STORES.IMAGES);
    const photos = allImages.filter(item => item.type === 'photo' && item.albumId === albumId);
    photos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    if (photos.length === 0) {
        container.innerHTML = `
            <div class="phone-empty-state">
                <div class="phone-empty-icon">🖼️</div>
                <p>相册是空的</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="phone-photos-grid">
            ${photos.map(photo => `
                <div class="phone-photo-item">
                    <img src="${URL.createObjectURL(photo.blob)}">
                </div>
            `).join('')}
        </div>
    `;
}