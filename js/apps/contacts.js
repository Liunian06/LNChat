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
        <button class="add-btn" id="add-contact-btn" title="添加联系人">＋</button>
    `;
    document.getElementById('add-contact-btn').onclick = () => renderForm();

    if (contacts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">👥</div>
                <p>你的联系人列表空空如也</p>
                <button id="empty-add-btn">创建第一个角色</button>
            </div>
        `;
        document.getElementById('empty-add-btn').onclick = () => renderForm();
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
            <div class="avatar-upload" id="avatar-container" title="点击上传头像">
                ${contact.avatar ? `<img src="${contact.avatar}" id="avatar-preview">` : '<div class="upload-placeholder"><span>📸</span><p>上传头像</p></div>'}
                <input type="file" id="avatar-input" accept="image/*" style="display:none">
            </div>
            <div class="input-group">
                <label>角色名称</label>
                <input type="text" id="c-name" value="${contact.name}" placeholder="给你的角色起个名字...">
            </div>
            <div class="input-group">
                <label>角色人设</label>
                <textarea id="c-desc" rows="5" placeholder="描述角色的性格、背景和说话风格...">${contact.description || ''}</textarea>
            </div>
            <div class="input-group">
                <label>思维活跃度 (Temperature: ${contact.temperature})</label>
                <input type="range" id="c-temp" min="0" max="2" step="0.1" value="${contact.temperature}" style="padding: 0; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; appearance: none; outline: none;">
                <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary); margin-top: 8px;">
                    <span>严谨</span>
                    <span id="temp-val">${contact.temperature}</span>
                    <span>创造</span>
                </div>
            </div>
            <div class="form-actions">
                ${id ? `<button class="delete-btn" id="del-btn">删除角色</button>` : ''}
                <button class="save-btn" id="save-btn">保存角色</button>
                <button class="cancel-btn" id="cancel-btn">返回列表</button>
            </div>
        </div>
    `;

    const tempInput = document.getElementById('c-temp');
    const tempVal = document.getElementById('temp-val');
    tempInput.oninput = () => {
        tempVal.textContent = tempInput.value;
    };

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
