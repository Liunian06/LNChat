/**
 * LNChat 纪念日模块 (Days Matter / 倒数日)
 */

import { db, STORES } from '../db.js';
import { generateId, showToast, formatDate } from '../utils.js';

let container, headerActions;
let currentView = 'list'; // 'list', 'detail', 'edit'
let currentAnniversary = null;
let isManageMode = false;
let selectedItems = new Set();

// 预设背景图片
const PRESET_BACKGROUNDS = [
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800', // 海滩
    'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800', // 雪山
    'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800', // 湖泊
    'https://images.unsplash.com/photo-1492571350019-22de08371fd3?w=800', // 城市夜景
    'https://images.unsplash.com/photo-1518173946687-a4c036bc9c57?w=800', // 樱花
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800', // 自然风景
];

// 获取星期几
function getWeekDay(date) {
    const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return weekDays[date.getDay()];
}

// 计算天数差
function calculateDays(targetDate, type = 'countdown') {
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

// 格式化目标日期
function formatTargetDate(dateStr) {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const weekDay = getWeekDay(date);
    
    return `${year}-${month}-${day} ${weekDay}`;
}

export async function init(target, actions) {
    container = target;
    headerActions = actions;
    isManageMode = false;
    selectedItems.clear();
    currentView = 'list';
    currentAnniversary = null;
    
    await renderList();
}

// 渲染主列表
async function renderList() {
    currentView = 'list';
    const anniversaries = await db.getAll(STORES.ANNIVERSARIES);
    
    // 按天数排序：正在倒计时的在前，已过去的在后
    anniversaries.sort((a, b) => {
        const daysA = calculateDays(a.targetDate, a.type);
        const daysB = calculateDays(b.targetDate, b.type);
        
        // 倒计时类型排在前面
        if (a.type === 'countdown' && b.type === 'countup') return -1;
        if (a.type === 'countup' && b.type === 'countdown') return 1;
        
        // 同类型按天数排序
        if (a.type === 'countdown') {
            return daysA - daysB; // 倒计时：天数少的在前
        } else {
            return daysB - daysA; // 正计时：天数多的在前
        }
    });
    
    // 更新标题
    if (isManageMode) {
        window.lnChat.appTitle.textContent = selectedItems.size > 0 ? `已选择 ${selectedItems.size} 项` : '选择纪念日';
        headerActions.innerHTML = `<button id="cancel-manage-btn" style="font-size:14px; background:none; border:none; color:white;">完成</button>`;
        document.getElementById('cancel-manage-btn').onclick = () => {
            isManageMode = false;
            selectedItems.clear();
            renderList();
        };
    } else {
        window.lnChat.appTitle.textContent = '纪念日';
        headerActions.innerHTML = `
            <button id="manage-btn" style="margin-right:10px; font-size:14px; background:none; border:none; color:white;">管理</button>
            <button id="add-anniversary-btn" class="add-btn">➕</button>
        `;
        document.getElementById('manage-btn').onclick = () => {
            isManageMode = true;
            renderList();
        };
        document.getElementById('add-anniversary-btn').onclick = () => renderEditForm(null);
    }
    
    // 返回按钮恢复
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        window.lnChat.closeApp();
    };
    
    if (anniversaries.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📅</div>
                <p>还没有纪念日</p>
                <button id="start-add-btn">添加纪念日</button>
            </div>
        `;
        document.getElementById('start-add-btn').onclick = () => renderEditForm(null);
        return;
    }
    
    // 找到置顶的纪念日（第一个）
    const topAnniversary = anniversaries[0];
    const topDays = calculateDays(topAnniversary.targetDate, topAnniversary.type);
    const topLabel = topAnniversary.type === 'countdown' ? '还有' : '已经';
    
    container.innerHTML = `
        <div class="anniversary-container">
            <!-- 顶部大卡片 -->
            <div class="anniversary-hero-card" data-id="${topAnniversary.id}" 
                 style="background-image: url('${topAnniversary.background || PRESET_BACKGROUNDS[0]}');">
                <div class="anniversary-hero-overlay"></div>
                <div class="anniversary-hero-content">
                    <div class="anniversary-hero-title">${topAnniversary.title}${topLabel}</div>
                    <div class="anniversary-hero-days">${Math.abs(topDays)}</div>
                    <div class="anniversary-hero-date">目标日: ${formatTargetDate(topAnniversary.targetDate)}</div>
                </div>
            </div>
            
            <!-- 列表 -->
            <div class="anniversary-list" style="padding-bottom: 80px;">
                ${anniversaries.map(item => {
                    const days = calculateDays(item.targetDate, item.type);
                    const label = item.type === 'countdown' ? '还有' : '已经';
                    const isSelected = selectedItems.has(item.id);
                    const colorClass = item.type === 'countdown' ? 'countdown' : 'countup';
                    
                    return `
                        <div class="anniversary-item ${isManageMode ? 'manage-mode' : ''} ${isSelected ? 'selected' : ''}" data-id="${item.id}">
                            <div class="checkbox-wrapper">
                                <div class="custom-checkbox"></div>
                            </div>
                            <div class="anniversary-item-info">
                                <div class="anniversary-item-title">${item.title}${label}</div>
                            </div>
                            <div class="anniversary-item-days ${colorClass}">
                                <span class="days-number">${Math.abs(days)}</span>
                                <span class="days-unit">天</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            
            <!-- 底部操作栏 -->
            <div class="bottom-action-bar ${isManageMode ? 'visible' : ''}">
                <button class="action-btn delete" id="batch-delete-btn" ${selectedItems.size === 0 ? 'disabled' : ''}>
                    删除 (${selectedItems.size})
                </button>
            </div>
        </div>
    `;
    
    // 绑定事件
    const heroCard = container.querySelector('.anniversary-hero-card');
    if (heroCard) {
        heroCard.onclick = () => {
            if (!isManageMode) {
                renderDetail(topAnniversary.id);
            }
        };
    }
    
    container.querySelectorAll('.anniversary-item').forEach(item => {
        item.onclick = async () => {
            const id = item.dataset.id;
            
            if (isManageMode) {
                if (selectedItems.has(id)) {
                    selectedItems.delete(id);
                } else {
                    selectedItems.add(id);
                }
                renderList();
            } else {
                renderDetail(id);
            }
        };
    });
    
    // 批量删除按钮
    const deleteBtn = document.getElementById('batch-delete-btn');
    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            if (selectedItems.size === 0) return;
            
            if (confirm(`确定删除选中的 ${selectedItems.size} 个纪念日吗？`)) {
                for (const id of selectedItems) {
                    await db.delete(STORES.ANNIVERSARIES, id);
                }
                selectedItems.clear();
                isManageMode = false;
                showToast('删除成功');
                renderList();
            }
        };
    }
}

// 渲染详情页
async function renderDetail(id) {
    currentView = 'detail';
    const anniversary = await db.get(STORES.ANNIVERSARIES, id);
    if (!anniversary) {
        showToast('纪念日不存在');
        renderList();
        return;
    }
    
    currentAnniversary = anniversary;
    const days = calculateDays(anniversary.targetDate, anniversary.type);
    const label = anniversary.type === 'countdown' ? '还有' : '已经';
    
    window.lnChat.appTitle.textContent = anniversary.title;
    headerActions.innerHTML = `<button id="edit-anniversary-btn" style="font-size:20px; background:none; border:none; color:white;">✏️</button>`;
    document.getElementById('edit-anniversary-btn').onclick = () => renderEditForm(anniversary);
    
    // 返回到列表
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        renderList();
    };
    
    container.innerHTML = `
        <div class="anniversary-detail" style="background-image: url('${anniversary.background || PRESET_BACKGROUNDS[0]}');">
            <div class="anniversary-detail-overlay"></div>
            <div class="anniversary-detail-content">
                <div class="anniversary-detail-card">
                    <div class="anniversary-detail-title">${anniversary.title}${label}</div>
                    <div class="anniversary-detail-days">${Math.abs(days)}</div>
                    <div class="anniversary-detail-date">目标日: ${formatTargetDate(anniversary.targetDate)}</div>
                </div>
            </div>
            
            <div class="anniversary-detail-actions">
                <button class="anniversary-action-btn" id="share-btn">
                    <span>📤</span>
                    <span>分享</span>
                </button>
                <button class="anniversary-action-btn" id="save-image-btn">
                    <span>💾</span>
                    <span>存为图片</span>
                </button>
                <button class="anniversary-action-btn" id="change-bg-btn">
                    <span>🖼️</span>
                    <span>背景</span>
                </button>
                <button class="anniversary-action-btn" id="send-chat-btn">
                    <span>💬</span>
                    <span>发送</span>
                </button>
            </div>
        </div>
    `;
    
    // 绑定按钮事件
    document.getElementById('share-btn').onclick = () => {
        showToast('分享功能开发中');
    };
    
    document.getElementById('save-image-btn').onclick = () => {
        showToast('保存图片功能开发中');
    };
    
    document.getElementById('change-bg-btn').onclick = () => {
        showBackgroundSelector(anniversary);
    };
    
    document.getElementById('send-chat-btn').onclick = () => {
        showSendToChatDialog(anniversary);
    };
}

// 渲染编辑表单
async function renderEditForm(anniversary) {
    currentView = 'edit';
    const isEdit = !!anniversary;
    
    window.lnChat.appTitle.textContent = isEdit ? '编辑纪念日' : '添加纪念日';
    headerActions.innerHTML = '';
    
    // 返回
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        if (isEdit) {
            renderDetail(anniversary.id);
        } else {
            renderList();
        }
    };
    
    // 获取今天的日期作为默认值
    const today = new Date();
    const defaultDate = anniversary?.targetDate || today.toISOString().split('T')[0];
    const defaultType = anniversary?.type || 'countdown';
    
    container.innerHTML = `
        <div class="form-container">
            <div class="input-group">
                <label>纪念日名称</label>
                <input type="text" id="anniversary-title" placeholder="例如：生日、结婚纪念日" value="${anniversary?.title || ''}" />
            </div>
            
            <div class="input-group">
                <label>目标日期</label>
                <input type="date" id="anniversary-date" value="${defaultDate}" />
            </div>
            
            <div class="input-group">
                <label>类型</label>
                <select id="anniversary-type">
                    <option value="countdown" ${defaultType === 'countdown' ? 'selected' : ''}>倒计时（距离目标日还有多少天）</option>
                    <option value="countup" ${defaultType === 'countup' ? 'selected' : ''}>正计时（从目标日起已过多少天）</option>
                </select>
            </div>
            
            <div class="input-group">
                <label>背景图片</label>
                <div class="anniversary-bg-selector">
                    ${PRESET_BACKGROUNDS.map((bg, index) => `
                        <div class="anniversary-bg-option ${(anniversary?.background || PRESET_BACKGROUNDS[0]) === bg ? 'selected' : ''}" 
                             data-bg="${bg}"
                             style="background-image: url('${bg}');">
                        </div>
                    `).join('')}
                    <div class="anniversary-bg-option custom-bg" id="custom-bg-btn">
                        <span>+</span>
                    </div>
                </div>
                <input type="hidden" id="anniversary-background" value="${anniversary?.background || PRESET_BACKGROUNDS[0]}" />
            </div>
            
            <div class="form-actions">
                <button class="cancel-btn" id="cancel-btn">取消</button>
                <button class="save-btn" id="save-btn">保存</button>
            </div>
            
            ${isEdit ? `
                <div class="form-actions" style="margin-top: 20px;">
                    <button class="delete-btn" id="delete-btn">删除此纪念日</button>
                </div>
            ` : ''}
        </div>
    `;
    
    // 背景选择
    container.querySelectorAll('.anniversary-bg-option:not(.custom-bg)').forEach(option => {
        option.onclick = () => {
            container.querySelectorAll('.anniversary-bg-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            document.getElementById('anniversary-background').value = option.dataset.bg;
        };
    });
    
    // 自定义背景
    document.getElementById('custom-bg-btn').onclick = () => {
        const url = prompt('请输入背景图片URL：');
        if (url) {
            document.getElementById('anniversary-background').value = url;
            container.querySelectorAll('.anniversary-bg-option').forEach(o => o.classList.remove('selected'));
            document.getElementById('custom-bg-btn').classList.add('selected');
            document.getElementById('custom-bg-btn').style.backgroundImage = `url('${url}')`;
            document.getElementById('custom-bg-btn').innerHTML = '';
        }
    };
    
    // 取消按钮
    document.getElementById('cancel-btn').onclick = () => {
        if (isEdit) {
            renderDetail(anniversary.id);
        } else {
            renderList();
        }
    };
    
    // 保存按钮
    document.getElementById('save-btn').onclick = async () => {
        const title = document.getElementById('anniversary-title').value.trim();
        const targetDate = document.getElementById('anniversary-date').value;
        const type = document.getElementById('anniversary-type').value;
        const background = document.getElementById('anniversary-background').value;
        
        if (!title) {
            showToast('请输入纪念日名称');
            return;
        }
        
        if (!targetDate) {
            showToast('请选择目标日期');
            return;
        }
        
        const data = {
            id: anniversary?.id || generateId(),
            title,
            targetDate,
            type,
            background,
            createdAt: anniversary?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        await db.put(STORES.ANNIVERSARIES, data);
        showToast(isEdit ? '保存成功' : '添加成功');
        renderDetail(data.id);
    };
    
    // 删除按钮
    if (isEdit) {
        document.getElementById('delete-btn').onclick = async () => {
            if (confirm('确定删除这个纪念日吗？')) {
                await db.delete(STORES.ANNIVERSARIES, anniversary.id);
                showToast('删除成功');
                renderList();
            }
        };
    }
}

// 显示背景选择器
function showBackgroundSelector(anniversary) {
    const existingDialog = document.getElementById('bg-selector-dialog');
    if (existingDialog) {
        document.body.removeChild(existingDialog);
    }
    
    const dialog = document.createElement('div');
    dialog.id = 'bg-selector-dialog';
    dialog.className = 'anniversary-bg-dialog';
    dialog.innerHTML = `
        <div class="anniversary-bg-dialog-overlay"></div>
        <div class="anniversary-bg-dialog-content">
            <div class="anniversary-bg-dialog-header">
                <h3>选择背景</h3>
                <button class="close-btn">×</button>
            </div>
            <div class="anniversary-bg-dialog-grid">
                ${PRESET_BACKGROUNDS.map((bg, index) => `
                    <div class="anniversary-bg-dialog-option ${anniversary.background === bg ? 'selected' : ''}" 
                         data-bg="${bg}"
                         style="background-image: url('${bg}');">
                    </div>
                `).join('')}
            </div>
            <div class="anniversary-bg-dialog-actions">
                <button class="custom-url-btn">使用自定义URL</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    const closeBtn = dialog.querySelector('.close-btn');
    const overlay = dialog.querySelector('.anniversary-bg-dialog-overlay');
    
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
    
    // 选择背景
    dialog.querySelectorAll('.anniversary-bg-dialog-option').forEach(option => {
        option.onclick = async () => {
            anniversary.background = option.dataset.bg;
            await db.put(STORES.ANNIVERSARIES, anniversary);
            showToast('背景已更新');
            closeDialog();
            renderDetail(anniversary.id);
        };
    });
    
    // 自定义URL
    dialog.querySelector('.custom-url-btn').onclick = async () => {
        const url = prompt('请输入背景图片URL：');
        if (url) {
            anniversary.background = url;
            await db.put(STORES.ANNIVERSARIES, anniversary);
            showToast('背景已更新');
            closeDialog();
            renderDetail(anniversary.id);
        }
    };
    
    requestAnimationFrame(() => {
        dialog.classList.add('visible');
    });
}

// 显示发送到聊天对话框
async function showSendToChatDialog(anniversary) {
    const sessions = await db.getAll(STORES.SESSIONS);
    const contacts = await db.getAll(STORES.CONTACTS);
    const contactMap = Object.fromEntries(contacts.map(c => [c.id, c]));
    
    if (sessions.length === 0) {
        showToast('暂无可发送的聊天');
        return;
    }
    
    const existingDialog = document.getElementById('send-chat-dialog');
    if (existingDialog) {
        document.body.removeChild(existingDialog);
    }
    
    const dialog = document.createElement('div');
    dialog.id = 'send-chat-dialog';
    dialog.className = 'anniversary-send-dialog';
    dialog.innerHTML = `
        <div class="anniversary-send-dialog-overlay"></div>
        <div class="anniversary-send-dialog-content">
            <div class="anniversary-send-dialog-header">
                <h3>发送到聊天</h3>
                <button class="close-btn">×</button>
            </div>
            <div class="anniversary-send-dialog-list">
                ${sessions.map(s => {
                    const contact = contactMap[s.contactId] || { name: '未知角色', avatar: '' };
                    return `
                        <div class="anniversary-send-dialog-item" data-session-id="${s.id}" data-contact-id="${s.contactId}">
                            <div class="avatar">${contact.avatar ? `<img src="${contact.avatar}">` : '👤'}</div>
                            <div class="name">${contact.name}</div>
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
    
    // 选择会话
    dialog.querySelectorAll('.anniversary-send-dialog-item').forEach(item => {
        item.onclick = async () => {
            const sessionId = item.dataset.sessionId;
            await sendAnniversaryToChat(anniversary, sessionId);
            closeDialog();
            showToast('纪念日已发送');
        };
    });
    
    requestAnimationFrame(() => {
        dialog.classList.add('visible');
    });
}

// 发送纪念日到聊天
async function sendAnniversaryToChat(anniversary, sessionId) {
    const session = await db.get(STORES.SESSIONS, sessionId);
    if (!session) return;
    
    const days = calculateDays(anniversary.targetDate, anniversary.type);
    const label = anniversary.type === 'countdown' ? '还有' : '已经';
    
    // 创建纪念日消息
    const content = `<anniversary id="${anniversary.id}" title="${anniversary.title}" days="${Math.abs(days)}" label="${label}" date="${formatTargetDate(anniversary.targetDate)}" background="${anniversary.background || PRESET_BACKGROUNDS[0]}"></anniversary>`;
    
    const now = new Date().toISOString();
    const message = {
        chatId: sessionId,
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
}

// 导出供外部调用（如聊天模块）
export function getAnniversaryCardHtml(id, title, days, label, date, background) {
    return `
        <div class="anniversary-card-message" style="background-image: url('${background}');">
            <div class="anniversary-card-overlay"></div>
            <div class="anniversary-card-content">
                <div class="anniversary-card-title">${title}${label}</div>
                <div class="anniversary-card-days">${days}</div>
                <div class="anniversary-card-date">目标日: ${date}</div>
            </div>
        </div>
    `;
}