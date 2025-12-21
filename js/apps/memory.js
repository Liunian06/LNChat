/**
 * LNChat 记忆模块
 */

import { db, STORES } from '../db.js';
import { formatTime } from '../utils.js';

let container;

export async function init(target) {
    container = target;
    renderList();
}

async function renderList() {
    const memories = await db.getAll(STORES.MEMORIES);
    const contacts = await db.getAll(STORES.CONTACTS);
    const contactMap = Object.fromEntries(contacts.map(c => [c.id, c]));

    memories.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (memories.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>暂无记忆</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="list-container" style="padding: 15px;">
            ${memories.map(m => {
                const contact = contactMap[m.contactId] || { name: '未知用户' };
                return `
                    <div class="memory-item" style="background: #f5f5f5; padding: 15px; border-radius: 10px; margin-bottom: 15px;">
                        <div class="header" style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px; color: #666;">
                            <span class="tag" style="background: #e3f2fd; color: #2196f3; padding: 2px 6px; border-radius: 4px;">${m.type || '记忆'}</span>
                            <span>${formatTime(m.date)}</span>
                        </div>
                        <div class="content" style="font-size: 14px;">${m.content}</div>
                        <div class="source" style="margin-top: 8px; font-size: 12px; color: #999; text-align: right;">
                            — 来自与 ${contact.name} 的对话
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}
