/**
 * LNChat 记忆模块
 */

import { db, STORES } from '../db.js';
import { formatTime } from '../utils.js';

let container, headerActions;
let isManageMode = false;
let selectedMemories = new Set();

export async function init(target, actions) {
    container = target;
    headerActions = actions;
    isManageMode = false;
    selectedMemories.clear();
    renderContactList();
}

async function renderContactList() {
    const contacts = await db.getAll(STORES.CONTACTS);
    window.lnChat.appTitle.textContent = '记忆碎片';
    headerActions.innerHTML = '';

    if (contacts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>暂无角色</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="list-container" style="padding: 10px;">
            ${contacts.map(c => `
                <div class="item contact-item" data-id="${c.id}" style="background: rgba(255, 255, 255, 0.05); margin-bottom: 10px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
                    <div class="avatar">${c.avatar ? `<img src="${c.avatar}">` : '👤'}</div>
                    <div class="info">
                        <div class="name">${c.name}</div>
                        <div class="desc">点击查看记忆</div>
                    </div>
                    <div class="arrow" style="opacity: 0.5;">›</div>
                </div>
            `).join('')}
        </div>
    `;

    container.querySelectorAll('.contact-item').forEach(item => {
        item.onclick = () => renderMemoryList(item.dataset.id);
    });
}

async function renderMemoryList(contactId) {
    const contact = await db.get(STORES.CONTACTS, contactId);
    const allMemories = await db.getAll(STORES.MEMORIES);
    const memories = allMemories.filter(m => m.contactId === contactId);

    if (isManageMode) {
        window.lnChat.appTitle.textContent = selectedMemories.size > 0 ? `已选 ${selectedMemories.size} 项` : '选择记忆';
        headerActions.innerHTML = `<button id="cancel-manage-btn" style="font-size:14px; background:none; border:none; color:white;">完成</button>`;
        document.getElementById('cancel-manage-btn').onclick = () => {
            isManageMode = false;
            selectedMemories.clear();
            renderMemoryList(contactId);
        };
    } else {
        window.lnChat.appTitle.textContent = `${contact.name} 的记忆`;
        headerActions.innerHTML = `<button id="manage-btn" style="font-size:14px; background:none; border:none; color:white;">管理</button>`;
        document.getElementById('manage-btn').onclick = () => {
            isManageMode = true;
            renderMemoryList(contactId);
        };
    }

    // Handle Back Button
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        isManageMode = false;
        selectedMemories.clear();
        renderContactList();
    };

    memories.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (memories.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>暂无关于 ${contact.name} 的记忆</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="list-container" style="padding: 15px; padding-bottom: 80px;">
            ${memories.map(m => {
                const isSelected = selectedMemories.has(m.id);
                return `
                <div class="memory-item ${isManageMode ? 'manage-mode' : ''} ${isSelected ? 'selected' : ''}" data-id="${m.id}" style="background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); padding: 15px; border-radius: 10px; margin-bottom: 15px; display: flex;">
                    ${isManageMode ? `
                    <div class="checkbox-wrapper" style="margin-right: 15px; display: flex; align-items: center;">
                        <div class="custom-checkbox"></div>
                    </div>
                    ` : ''}
                    <div style="flex: 1;">
                        <div class="content" style="font-size: 14px; color: #fff; line-height: 1.4; margin-bottom: 6px;">${m.content}</div>
                        <div class="footer" style="display: flex; justify-content: flex-end; font-size: 12px; color: rgba(255, 255, 255, 0.6);">
                            <span>${formatDateTime(m.date)}</span>
                        </div>
                    </div>
                </div>
                `;
            }).join('')}
        </div>

        <div class="bottom-action-bar ${isManageMode ? 'visible' : ''}">
            <button class="action-btn delete" id="batch-delete-btn" ${selectedMemories.size === 0 ? 'disabled' : ''}>
                删除 (${selectedMemories.size})
            </button>
        </div>
    `;

    if (isManageMode) {
        container.querySelectorAll('.memory-item').forEach(item => {
            item.onclick = () => {
                const id = item.dataset.id;
                if (selectedMemories.has(id)) {
                    selectedMemories.delete(id);
                } else {
                    selectedMemories.add(id);
                }
                renderMemoryList(contactId);
            };
        });

        const deleteBtn = document.getElementById('batch-delete-btn');
        if (deleteBtn) {
            deleteBtn.onclick = async () => {
                if (selectedMemories.size === 0) return;
                if (confirm(`确定删除选中的 ${selectedMemories.size} 条记忆吗？`)) {
                    for (const id of selectedMemories) {
                        await db.delete(STORES.MEMORIES, id);
                    }
                    selectedMemories.clear();
                    isManageMode = false;
                    renderMemoryList(contactId);
                }
            };
        }
    }
}

function formatDateTime(dateInput) {
    const date = new Date(dateInput);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}
