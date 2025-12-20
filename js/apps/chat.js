/**
 * LNChat 聊天模块
 */

import { db, STORES } from '../db.js';
import { formatTime, simpleMarkdown, showToast } from '../utils.js';

let container, headerActions;
let currentContactId = null;
let messageQueue = [];
let messageTimer = null;

export async function init(target, actions) {
    container = target;
    headerActions = actions;
    renderContactList();
}

async function renderContactList() {
    const contacts = await db.getAll(STORES.CONTACTS);
    headerActions.innerHTML = '';
    
    if (contacts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💬</div>
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
                <div class="chat-item" data-id="${c.id}">
                    <div class="avatar">${c.avatar ? `<img src="${c.avatar}">` : '👤'}</div>
                    <div class="info">
                        <div class="name">${c.name}</div>
                        <div class="desc">${c.description || ''}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    container.querySelectorAll('.chat-item').forEach(item => {
        item.onclick = () => openChat(item.dataset.id);
    });
}

async function openChat(contactId) {
    currentContactId = contactId;
    const contact = await db.get(STORES.CONTACTS, contactId);
    
    headerActions.innerHTML = `
        <button id="clear-chat-btn">🗑️</button>
    `;
    document.getElementById('clear-chat-btn').onclick = async () => {
        if (confirm('确定清空聊天记录吗？')) {
            const history = await db.getChatHistory(contactId);
            for (const msg of history) {
                await db.delete(STORES.CHAT_HISTORY, msg.id);
            }
            openChat(contactId);
        }
    };

    container.innerHTML = `
        <div class="chat-container">
            <div class="messages" id="chat-messages"></div>
            <div class="input-area">
                <textarea id="chat-input" placeholder="输入消息..."></textarea>
                <button id="send-btn">发送</button>
            </div>
        </div>
    `;

    const messagesDiv = document.getElementById('chat-messages');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');

    const renderMessages = async () => {
        const history = await db.getChatHistory(contactId);
        messagesDiv.innerHTML = history.map(msg => `
            <div class="message ${msg.role}">
                <div class="msg-content">${simpleMarkdown(msg.content)}</div>
                <div class="msg-time">${formatTime(msg.timestamp)}</div>
            </div>
        `).join('');
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    };

    await renderMessages();

    sendBtn.onclick = async () => {
        const content = input.value.trim();
        if (!content) return;
        input.value = '';

        const userMsg = {
            contactId,
            role: 'user',
            content,
            timestamp: new Date().toISOString()
        };
        await db.put(STORES.CHAT_HISTORY, userMsg);
        await renderMessages();

        // 加入队列处理
        queueAIResponse(contact);
    };

    input.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    };
}

async function queueAIResponse(contact) {
    const settings = await getSettings();
    const delay = (settings.replyDelay || 6) * 1000;

    if (messageTimer) clearTimeout(messageTimer);
    
    messageTimer = setTimeout(async () => {
        await processAIResponse(contact);
    }, delay);
}

async function processAIResponse(contact) {
    const settings = await getSettings();
    if (!settings.apiKey) {
        showToast('请先配置 API Key');
        return;
    }

    const messagesDiv = document.getElementById('chat-messages');
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'message assistant loading';
    loadingMsg.innerHTML = '<div class="msg-content">正在思考中...</div>';
    messagesDiv.appendChild(loadingMsg);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    try {
        const history = await db.getChatHistory(contact.id);
        const contextCount = settings.contextCount || 20;
        const recent = history.slice(-contextCount);

        const apiMessages = [
            { role: 'system', content: `你是一个名为${contact.name}的AI助手。人设：${contact.description || '无'}` },
            ...recent.map(m => ({ role: m.role, content: m.content }))
        ];

        const response = await fetch(settings.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify({
                model: settings.model,
                messages: apiMessages,
                temperature: contact.temperature || 1.0
            })
        });

        const data = await response.json();
        messagesDiv.removeChild(loadingMsg);

        if (data.choices && data.choices[0]) {
            const aiContent = data.choices[0].message.content;
            const aiMsg = {
                contactId: contact.id,
                role: 'assistant',
                content: aiContent,
                timestamp: new Date().toISOString()
            };
            await db.put(STORES.CHAT_HISTORY, aiMsg);
            
            // 局部刷新或全局刷新
            if (currentContactId === contact.id) {
                const history = await db.getChatHistory(contact.id);
                messagesDiv.innerHTML = history.map(msg => `
                    <div class="message ${msg.role}">
                        <div class="msg-content">${simpleMarkdown(msg.content)}</div>
                        <div class="msg-time">${formatTime(msg.timestamp)}</div>
                    </div>
                `).join('');
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
        } else {
            throw new Error(data.error?.message || 'API 响应异常');
        }
    } catch (error) {
        messagesDiv.removeChild(loadingMsg);
        showToast('AI 回复失败: ' + error.message);
    }
}

async function getSettings() {
    const s = await db.get(STORES.SETTINGS, 'ai_settings');
    return s || {
        apiUrl: 'https://api.siliconflow.cn/v1/chat/completions',
        apiKey: '',
        model: 'vendor/model-name',
        contextCount: 20,
        replyDelay: 6
    };
}
