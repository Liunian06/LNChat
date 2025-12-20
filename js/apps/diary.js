/**
 * LNChat 日记模块
 */

import { db, STORES } from '../db.js';
import { generateId, formatDate, showToast, getMoodEmoji } from '../utils.js';

let container, headerActions;

export async function init(target, actions) {
    container = target;
    headerActions = actions;
    renderList();
}

async function renderList() {
    const diaries = await db.getAll(STORES.DIARIES);
    diaries.sort((a, b) => new Date(b.date) - new Date(a.date));

    headerActions.innerHTML = `<button class="add-btn" id="add-diary-btn">➕</button>`;
    document.getElementById('add-diary-btn').onclick = () => renderForm();

    if (diaries.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>记录今天的生活吧</p>
                <button onclick="document.getElementById('add-diary-btn').click()">写日记</button>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="list-container">
            ${diaries.map(d => `
                <div class="item diary-item" data-id="${d.id}">
                    <div class="mood-icon">${getMoodEmoji(d.mood)}</div>
                    <div class="info">
                        <div class="name">${d.title}</div>
                        <div class="desc">${formatDate(d.date)}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    container.querySelectorAll('.diary-item').forEach(item => {
        item.onclick = () => renderDetail(item.dataset.id);
    });
}

async function renderDetail(id) {
    const diary = await db.get(STORES.DIARIES, id);
    headerActions.innerHTML = `<button id="edit-diary-btn">✏️</button>`;
    document.getElementById('edit-diary-btn').onclick = () => renderForm(id);

    container.innerHTML = `
        <div class="detail-container">
            <h2>${diary.title}</h2>
            <div class="meta">${formatDate(diary.date)} | 心情: ${getMoodEmoji(diary.mood)} ${diary.mood}</div>
            <div class="content">${diary.content.replace(/\n/g, '<br>')}</div>
            <div class="form-actions" style="margin-top:20px">
                <button class="cancel-btn" id="back-list-btn">返回列表</button>
            </div>
        </div>
    `;
    document.getElementById('back-list-btn').onclick = () => renderList();
}

async function renderForm(id = null) {
    let diary = { title: '', date: new Date().toISOString().split('T')[0], mood: '开心', content: '' };
    if (id) {
        diary = await db.get(STORES.DIARIES, id);
    }

    headerActions.innerHTML = '';
    const moods = ['开心', '快乐', '平静', '忧郁', '悲伤', '愤怒', '焦虑', '兴奋', '疲惫', '感激'];

    container.innerHTML = `
        <div class="form-container">
            <div class="input-group">
                <label>标题</label>
                <input type="text" id="d-title" value="${diary.title}" placeholder="日记标题">
            </div>
            <div class="input-group">
                <label>日期</label>
                <input type="date" id="d-date" value="${diary.date}">
            </div>
            <div class="input-group">
                <label>心情</label>
                <select id="d-mood">
                    ${moods.map(m => `<option value="${m}" ${diary.mood === m ? 'selected' : ''}>${getMoodEmoji(m)} ${m}</option>`).join('')}
                </select>
            </div>
            <div class="input-group">
                <label>内容</label>
                <textarea id="d-content" placeholder="记录今天的事..." style="height: 200px">${diary.content}</textarea>
            </div>
            <div class="form-actions">
                ${id ? `<button class="delete-btn" id="del-btn">删除</button>` : ''}
                <button class="save-btn" id="save-btn">保存</button>
                <button class="cancel-btn" id="cancel-btn">取消</button>
            </div>
        </div>
    `;

    document.getElementById('save-btn').onclick = async () => {
        const title = document.getElementById('d-title').value.trim();
        const content = document.getElementById('d-content').value.trim();
        if (!title || !content) return showToast('请填写标题和内容');

        const newDiary = {
            ...diary,
            id: id || generateId(),
            title,
            date: document.getElementById('d-date').value,
            mood: document.getElementById('d-mood').value,
            content,
            updatedAt: new Date().toISOString()
        };
        if (!id) newDiary.createdAt = new Date().toISOString();

        await db.put(STORES.DIARIES, newDiary);
        showToast('保存成功');
        renderList();
    };

    if (id) {
        document.getElementById('del-btn').onclick = async () => {
            if (confirm('确定删除吗？')) {
                await db.delete(STORES.DIARIES, id);
                showToast('已删除');
                renderList();
            }
        };
    }

    document.getElementById('cancel-btn').onclick = () => id ? renderDetail(id) : renderList();
}
