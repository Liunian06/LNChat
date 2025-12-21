/**
 * LNChat 朋友圈模块
 */

import { db, STORES } from '../db.js';
import { formatTime } from '../utils.js';

let container;

export async function init(target) {
    container = target;
    renderList();
}

async function renderList() {
    const moments = await db.getAll(STORES.MOMENTS);
    const contacts = await db.getAll(STORES.CONTACTS);
    const contactMap = Object.fromEntries(contacts.map(c => [c.id, c]));

    moments.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (moments.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>暂无动态</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="list-container" style="padding: 15px;">
            ${moments.map(m => {
                const contact = contactMap[m.contactId] || { name: '未知用户', avatar: '' };
                return `
                    <div class="moment-item" style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #eee;">
                        <div class="moment-header" style="display: flex; align-items: center; margin-bottom: 10px;">
                            <div class="avatar" style="width: 40px; height: 40px; border-radius: 50%; overflow: hidden; margin-right: 10px;">
                                ${contact.avatar ? `<img src="${contact.avatar}" style="width: 100%; height: 100%; object-fit: cover;">` : '<div style="width:100%;height:100%;background:#ddd;display:flex;align-items:center;justify-content:center;">👤</div>'}
                            </div>
                            <div class="info">
                                <div class="name" style="font-weight: bold;">${contact.name}</div>
                                <div class="time" style="font-size: 12px; color: #999;">${formatTime(m.date)}</div>
                            </div>
                        </div>
                        <div class="content" style="font-size: 15px; line-height: 1.5;">${m.content}</div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}
