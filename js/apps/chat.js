/**
 * LNChat 聊天模块
 */

import { db, STORES } from '../db.js';
import { formatTime, simpleMarkdown, showToast, generateId, getDefaultSystemPrompt, getCurrentTimestamp, formatDate } from '../utils.js';
import { getLocation } from '../location.js';
import { getWeather } from '../weather.js';
import { Logger, LOG_TYPES } from '../logger.js';

let container, headerActions;
let currentChatId = null;
let messageTimer = null;
let isManageMode = false;
let selectedSessions = new Set();

export async function init(target, actions) {
    container = target;
    headerActions = actions;
    isManageMode = false;
    selectedSessions.clear();
    renderMainSessionList();
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
 * 聊天窗口
 */
async function openChat(chatId) {
    currentChatId = chatId;
    const session = await db.get(STORES.SESSIONS, chatId);
    if (!session) return renderMainSessionList();
    
    const contact = await db.get(STORES.CONTACTS, session.contactId);
    
    window.lnChat.appTitle.textContent = contact.name;
    headerActions.innerHTML = `
        <button id="clear-chat-btn">🗑️</button>
    `;

    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        renderMainSessionList();
    };

    document.getElementById('clear-chat-btn').onclick = async () => {
        if (confirm('确定清空当前会话的聊天记录吗？')) {
            const history = await db.getChatHistory(chatId);
            for (const msg of history) {
                await db.delete(STORES.CHAT_HISTORY, msg.id);
            }
            openChat(chatId);
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
        const history = await db.getChatHistory(chatId);
        
        // 预处理历史记录，展开未正确解析的消息
        const expandedHistory = [];
        for (const msg of history) {
            // 检查是否是包含 XML 标签的 Assistant 文本消息
            if (msg.sender === 'assistant' && msg.type === 'text' && /<(words|action|thought|state)(?:\s+[^>]*)?>/i.test(msg.content)) {
                const parsedParts = [];
                const tagRegex = /<(words|action|thought|state)(?:\s+[^>]*)?>(.*?)<\/\1>/gis;
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
                return `<div class="message system"><div class="msg-content">消息已撤回</div></div>`;
            }
            
            let contentHtml = '';
            if (msg.type === 'text' || msg.type === 'action' || msg.type === 'thought' || msg.type === 'state') {
                contentHtml = simpleMarkdown(msg.content);
            } else if (msg.type === 'image') {
                contentHtml = `<img src="${msg.content}" style="max-width: 100%; border-radius: 10px;">`;
            } else {
                contentHtml = `[暂不支持的消息类型: ${msg.type}]`;
            }

            if (msg.status === 'folded') {
                contentHtml = `<div class="folded-msg">消息已折叠 (点击展开)</div>`;
            }

            let timeDisplay = '';
            if (typeof msg.timestamp === 'number') {
                timeDisplay = formatTime(msg.timestamp * 1000);
            } else {
                timeDisplay = formatTime(msg.timestamp);
            }

            return `
                <div class="message ${msg.sender} ${msg.type} ${msg.status}" data-id="${msg.virtualId || msg.id}">
                    <div class="msg-content">${contentHtml}</div>
                    <div class="msg-time">${timeDisplay}</div>
                </div>
            `;
        }).join('');
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        messagesDiv.querySelectorAll('.message').forEach(el => {
            el.onclick = async () => {
                const id = parseInt(el.dataset.id);
                const msg = await db.get(STORES.CHAT_HISTORY, id);
                if (msg && msg.status === 'folded') {
                    if (confirm('是否展开此消息？')) {
                        msg.status = 'normal';
                        await db.put(STORES.CHAT_HISTORY, msg);
                        renderMessages();
                    }
                }
            };
        });
    };

    await renderMessages();

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

        await renderMessages();
        queueAIResponse(session, contact);
    };

    input.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    };
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
        const history = await db.getChatHistory(session.id, true);
        const contextCount = Math.min(settings.contextCount || 2000, 5000); // 确保不超过5000
        const recent = history.slice(-contextCount);

        const apiMessages = [];
        let systemContent = settings.systemPrompt || '';
        
        // 角色人设
        systemContent += `\n\n\n以下是角色人设：\n角色名：${contact.name}\n角色人设：\n${contact.description || '无'}`;

        // 用户人设
        if (session.userPersonaId) {
            const userPersona = await db.get(STORES.USER_PERSONAS, session.userPersonaId);
            if (userPersona) {
                 systemContent += `\n\n\n以下是用户人设：\n用户名：${userPersona.name || '用户'}\n用户人设：\n${userPersona.description || '无'}`;
            }
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
                const tagRegex = /<(words|action|thought|state)(?:\s+[^>]*)?>(.*?)<\/\1>/gis;
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
