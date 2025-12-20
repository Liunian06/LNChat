/**
 * LNChat 联系人模块
 */

import { db, STORES } from '../db.js';
import { generateId, showToast } from '../utils.js';

let container, headerActions;

export async function init(target, actions) {
    container = target;
    headerActions = actions;
    renderList();
}

async function renderList() {
    const contacts = await db.getAll(STORES.CONTACTS);
    
    headerActions.innerHTML = `
        <button class="add-btn" id="add-contact-btn">➕</button>
    `;
    document.getElementById('add-contact-btn').onclick = () => renderForm();

    if (contacts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>暂无联系人</p>
                <button onclick="document.getElementById('add-contact-btn').click()">添加第一个</button>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="list-container">
            ${contacts.map(c => `
                <div class="item contact-item" data-id="${c.id}">
                    <div class="avatar">${c.avatar ? `<img src="${c.avatar}">` : '👤'}</div>
                    <div class="info">
                        <div class="name">${c.name}</div>
                        <div class="desc">${c.description || ''}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    container.querySelectorAll('.contact-item').forEach(item => {
        item.onclick = () => renderForm(item.dataset.id);
    });
}

async function renderForm(id = null) {
    let contact = { name: '', description: '', temperature: 1.5, avatar: '' };
    if (id) {
        contact = await db.get(STORES.CONTACTS, id);
    }

    headerActions.innerHTML = '';
    container.innerHTML = `
        <div class="form-container">
            <div class="avatar-upload" id="avatar-container">
                ${contact.avatar ? `<img src="${contact.avatar}" id="avatar-preview">` : '点击上传头像'}
                <input type="file" id="avatar-input" accept="image/*" style="display:none">
            </div>
            <div class="input-group">
                <label>名称</label>
                <input type="text" id="c-name" value="${contact.name}" placeholder="角色名">
            </div>
            <div class="input-group">
                <label>人设</label>
                <textarea id="c-desc" placeholder="角色描述/人设">${contact.description || ''}</textarea>
            </div>
            <div class="input-group">
                <label>温度 (0-2)</label>
                <input type="number" id="c-temp" step="0.1" min="0" max="2" value="${contact.temperature}">
            </div>
            <div class="form-actions">
                ${id ? `<button class="delete-btn" id="del-btn">删除</button>` : ''}
                <button class="save-btn" id="save-btn">保存</button>
                <button class="cancel-btn" id="cancel-btn">取消</button>
            </div>
        </div>
    `;

    const avatarInput = document.getElementById('avatar-input');
    const avatarContainer = document.getElementById('avatar-container');
    avatarContainer.onclick = () => avatarInput.click();
    
    avatarInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                contact.avatar = ev.target.result;
                avatarContainer.innerHTML = `<img src="${contact.avatar}" id="avatar-preview">`;
            };
            reader.readAsDataURL(file);
        }
    };

    document.getElementById('save-btn').onclick = async () => {
        const name = document.getElementById('c-name').value.trim();
        if (!name) return showToast('请输入名称');

        const newContact = {
            ...contact,
            id: id || generateId(),
            name,
            description: document.getElementById('c-desc').value,
            temperature: parseFloat(document.getElementById('c-temp').value),
            updatedAt: new Date().toISOString()
        };
        if (!id) newContact.createdAt = new Date().toISOString();

        await db.put(STORES.CONTACTS, newContact);
        showToast('保存成功');
        renderList();
    };

    if (id) {
        document.getElementById('del-btn').onclick = async () => {
            if (confirm('确定删除吗？')) {
                await db.delete(STORES.CONTACTS, id);
                showToast('已删除');
                renderList();
            }
        };
    }

    document.getElementById('cancel-btn').onclick = () => renderList();
}
