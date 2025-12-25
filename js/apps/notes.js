/**
 * LNChat 备忘录模块
 * 
 * 功能：
 * - 创建/编辑备忘录
 * - 分类管理
 * - 搜索功能
 * - 置顶功能
 */

import { db, STORES } from '../db.js';
import { generateId, showToast, getCurrentTimestamp } from '../utils.js';

let container, headerActions;
let appTitleEl = null;
let backBtnEl = null;
let originalBackHandler = null;
let currentView = 'list'; // 'list' | 'edit' | 'view'
let currentNoteId = null;
let searchKeyword = '';

// 备忘录分类
const CATEGORIES = [
    { id: 'all', name: '全部', icon: '📋', color: '#2196F3' },
    { id: 'work', name: '工作', icon: '💼', color: '#4CAF50' },
    { id: 'life', name: '生活', icon: '🏠', color: '#FF9800' },
    { id: 'study', name: '学习', icon: '📚', color: '#9C27B0' },
    { id: 'ideas', name: '灵感', icon: '💡', color: '#E91E63' },
    { id: 'other', name: '其他', icon: '📝', color: '#607D8B' }
];

export async function init(target, actions) {
    container = target;
    headerActions = actions;
    
    appTitleEl = document.getElementById('app-title');
    backBtnEl = document.getElementById('app-back-btn');
    
    if (backBtnEl) {
        originalBackHandler = backBtnEl.onclick;
        backBtnEl.onclick = handleBack;
    }
    
    renderList();
}

function handleBack() {
    if (currentView === 'edit' || currentView === 'view') {
        currentView = 'list';
        currentNoteId = null;
        renderList();
    } else {
        if (originalBackHandler) {
            originalBackHandler();
        }
    }
}

function updateTitle(title) {
    if (appTitleEl) {
        appTitleEl.textContent = title;
    }
}

// 获取所有备忘录
async function getNotes() {
    try {
        const settings = await db.get(STORES.SETTINGS, 'notes_data');
        return settings?.notes || [];
    } catch (e) {
        console.error('获取备忘录失败', e);
        return [];
    }
}

// 保存备忘录
async function saveNotes(notes) {
    await db.put(STORES.SETTINGS, {
        key: 'notes_data',
        notes
    });
}

// 获取单个备忘录
async function getNote(id) {
    const notes = await getNotes();
    return notes.find(n => n.id === id);
}

// 添加/更新备忘录
async function saveNote(note) {
    const notes = await getNotes();
    const index = notes.findIndex(n => n.id === note.id);
    
    if (index >= 0) {
        notes[index] = { ...notes[index], ...note, updatedAt: new Date().toISOString() };
    } else {
        notes.unshift({
            ...note,
            id: note.id || `note_${generateId()}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
    }
    
    await saveNotes(notes);
    return note.id || notes[0].id;
}

// 删除备忘录
async function deleteNote(id) {
    const notes = await getNotes();
    const filtered = notes.filter(n => n.id !== id);
    await saveNotes(filtered);
}

// 切换置顶
async function togglePin(id) {
    const notes = await getNotes();
    const note = notes.find(n => n.id === id);
    if (note) {
        note.pinned = !note.pinned;
        note.updatedAt = new Date().toISOString();
        await saveNotes(notes);
    }
}

// 渲染备忘录列表
async function renderList(category = 'all') {
    currentView = 'list';
    updateTitle('备忘录');
    
    let notes = await getNotes();
    
    // 过滤分类
    if (category !== 'all') {
        notes = notes.filter(n => n.category === category);
    }
    
    // 过滤搜索
    if (searchKeyword) {
        const keyword = searchKeyword.toLowerCase();
        notes = notes.filter(n => 
            n.title?.toLowerCase().includes(keyword) || 
            n.content?.toLowerCase().includes(keyword)
        );
    }
    
    // 排序：置顶优先，然后按更新时间
    notes.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
    
    headerActions.innerHTML = `
        <button class="add-btn" id="add-note-btn" title="新建备忘录">➕</button>
    `;
    
    container.innerHTML = `
        <div class="notes-container" style="display: flex; flex-direction: column; height: 100%;">
            <!-- 搜索栏 -->
            <div style="padding: 15px; border-bottom: 1px solid var(--glass-border);">
                <div style="display: flex; align-items: center; gap: 10px; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 12px; padding: 10px 15px;">
                    <span style="color: var(--text-secondary);">🔍</span>
                    <input type="text" id="notes-search-input" placeholder="搜索备忘录..." value="${searchKeyword}" style="flex: 1; background: transparent; border: none; color: white; font-size: 14px; outline: none;">
                    ${searchKeyword ? `<button id="clear-search-btn" style="background: none; border: none; color: var(--text-secondary); cursor: pointer;">✕</button>` : ''}
                </div>
            </div>
            
            <!-- 分类标签 -->
            <div style="padding: 10px 15px; overflow-x: auto; white-space: nowrap; border-bottom: 1px solid var(--glass-border);">
                ${CATEGORIES.map(cat => `
                    <button class="category-tab ${cat.id === category ? 'active' : ''}" data-category="${cat.id}" style="display: inline-flex; align-items: center; gap: 5px; padding: 8px 16px; margin-right: 8px; background: ${cat.id === category ? cat.color : 'var(--glass-bg)'}; border: 1px solid ${cat.id === category ? cat.color : 'var(--glass-border)'}; border-radius: 20px; color: white; font-size: 13px; cursor: pointer; transition: all 0.2s;">
                        <span>${cat.icon}</span>
                        <span>${cat.name}</span>
                    </button>
                `).join('')}
            </div>
            
            <!-- 备忘录列表 -->
            <div style="flex: 1; overflow-y: auto; padding: 15px;">
                ${notes.length > 0 ? `
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${notes.map(note => {
                            const cat = CATEGORIES.find(c => c.id === note.category) || CATEGORIES[5];
                            const preview = note.content ? note.content.substring(0, 100).replace(/\n/g, ' ') : '';
                            const date = new Date(note.updatedAt);
                            const dateStr = date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
                            
                            return `
                                <div class="note-card" data-id="${note.id}" style="background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 16px; padding: 16px; cursor: pointer; transition: all 0.3s; position: relative; ${note.pinned ? 'border-left: 3px solid #FFD700;' : ''}">
                                    ${note.pinned ? `<div style="position: absolute; top: 10px; right: 10px; color: #FFD700; font-size: 14px;">📌</div>` : ''}
                                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                        <span style="font-size: 16px;">${cat.icon}</span>
                                        <span style="font-size: 16px; font-weight: 600; color: white; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${note.title || '无标题'}</span>
                                    </div>
                                    <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 10px;">
                                        ${preview || '暂无内容'}
                                    </div>
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <span style="font-size: 12px; color: var(--text-secondary);">${dateStr}</span>
                                        <span style="font-size: 11px; padding: 3px 8px; background: ${cat.color}33; color: ${cat.color}; border-radius: 10px;">${cat.name}</span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                ` : `
                    <div class="empty-state" style="padding-top: 60px;">
                        <div class="empty-icon">📝</div>
                        <p>${searchKeyword ? '没有找到匹配的备忘录' : '还没有备忘录'}</p>
                        ${!searchKeyword ? `
                            <button id="create-first-note-btn" style="margin-top: 15px; padding: 12px 24px; background: var(--primary-color); border: none; border-radius: 20px; color: white; font-size: 14px; cursor: pointer;">
                                创建第一个备忘录
                            </button>
                        ` : ''}
                    </div>
                `}
            </div>
        </div>
    `;
    
    // 绑定事件
    document.getElementById('add-note-btn')?.addEventListener('click', () => renderEdit());
    document.getElementById('create-first-note-btn')?.addEventListener('click', () => renderEdit());
    
    const searchInput = document.getElementById('notes-search-input');
    searchInput?.addEventListener('input', (e) => {
        searchKeyword = e.target.value;
        // 防抖搜索
        clearTimeout(window.notesSearchTimeout);
        window.notesSearchTimeout = setTimeout(() => renderList(category), 300);
    });
    
    document.getElementById('clear-search-btn')?.addEventListener('click', () => {
        searchKeyword = '';
        renderList(category);
    });
    
    container.querySelectorAll('.category-tab').forEach(tab => {
        tab.onclick = () => renderList(tab.dataset.category);
    });
    
    container.querySelectorAll('.note-card').forEach(card => {
        card.onclick = () => {
            currentNoteId = card.dataset.id;
            renderView(currentNoteId);
        };
        
        card.onmouseenter = () => {
            card.style.transform = 'translateY(-2px)';
            card.style.background = 'rgba(255,255,255,0.15)';
        };
        card.onmouseleave = () => {
            card.style.transform = 'translateY(0)';
            card.style.background = 'var(--glass-bg)';
        };
    });
}

// 渲染备忘录查看页
async function renderView(noteId) {
    currentView = 'view';
    
    const note = await getNote(noteId);
    if (!note) {
        showToast('备忘录不存在');
        renderList();
        return;
    }
    
    updateTitle('备忘录');
    
    const cat = CATEGORIES.find(c => c.id === note.category) || CATEGORIES[5];
    const date = new Date(note.updatedAt);
    const dateStr = date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    
    headerActions.innerHTML = `
        <button class="add-btn" id="edit-note-btn" title="编辑">✏️</button>
        <button class="add-btn" id="pin-note-btn" title="${note.pinned ? '取消置顶' : '置顶'}" style="margin-left: 8px;">${note.pinned ? '📌' : '📍'}</button>
        <button class="add-btn" id="delete-note-btn" title="删除" style="margin-left: 8px;">🗑️</button>
    `;
    
    container.innerHTML = `
        <div class="note-view" style="padding: 20px; height: 100%; overflow-y: auto;">
            <!-- 标题 -->
            <h1 style="font-size: 24px; font-weight: 600; color: white; margin-bottom: 15px; line-height: 1.4;">
                ${note.title || '无标题'}
            </h1>
            
            <!-- 元信息 -->
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 25px; flex-wrap: wrap;">
                <span style="font-size: 12px; padding: 4px 10px; background: ${cat.color}33; color: ${cat.color}; border-radius: 12px; display: flex; align-items: center; gap: 4px;">
                    ${cat.icon} ${cat.name}
                </span>
                <span style="font-size: 12px; color: var(--text-secondary);">
                    ${dateStr}
                </span>
                ${note.pinned ? `<span style="font-size: 12px; color: #FFD700;">📌 已置顶</span>` : ''}
            </div>
            
            <!-- 内容 -->
            <div style="font-size: 16px; color: rgba(255,255,255,0.9); line-height: 1.8; white-space: pre-wrap; word-break: break-word;">
                ${note.content || '暂无内容'}
            </div>
        </div>
    `;
    
    // 绑定事件
    document.getElementById('edit-note-btn').onclick = () => renderEdit(noteId);
    
    document.getElementById('pin-note-btn').onclick = async () => {
        await togglePin(noteId);
        showToast(note.pinned ? '已取消置顶' : '已置顶');
        renderView(noteId);
    };
    
    document.getElementById('delete-note-btn').onclick = async () => {
        if (confirm('确定删除这个备忘录吗？')) {
            await deleteNote(noteId);
            showToast('备忘录已删除');
            renderList();
        }
    };
}

// 渲染编辑页面
async function renderEdit(noteId = null) {
    currentView = 'edit';
    
    let note = null;
    if (noteId) {
        note = await getNote(noteId);
        if (!note) {
            showToast('备忘录不存在');
            renderList();
            return;
        }
    }
    
    updateTitle(note ? '编辑备忘录' : '新建备忘录');
    
    headerActions.innerHTML = `
        <button class="add-btn" id="save-note-btn" title="保存" style="background: var(--primary-color);">💾</button>
    `;
    
    container.innerHTML = `
        <div class="note-edit" style="display: flex; flex-direction: column; height: 100%;">
            <!-- 标题输入 -->
            <div style="padding: 15px; border-bottom: 1px solid var(--glass-border);">
                <input type="text" id="note-title-input" placeholder="标题" value="${note?.title || ''}" style="width: 100%; background: transparent; border: none; color: white; font-size: 20px; font-weight: 600; outline: none;">
            </div>
            
            <!-- 分类选择 -->
            <div style="padding: 10px 15px; overflow-x: auto; white-space: nowrap; border-bottom: 1px solid var(--glass-border);">
                ${CATEGORIES.filter(c => c.id !== 'all').map(cat => `
                    <button class="category-select ${cat.id === (note?.category || 'other') ? 'selected' : ''}" data-category="${cat.id}" style="display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px; margin-right: 8px; background: ${cat.id === (note?.category || 'other') ? cat.color : 'transparent'}; border: 1px solid ${cat.color}; border-radius: 15px; color: white; font-size: 12px; cursor: pointer; transition: all 0.2s;">
                        <span>${cat.icon}</span>
                        <span>${cat.name}</span>
                    </button>
                `).join('')}
            </div>
            
            <!-- 内容输入 -->
            <div style="flex: 1; padding: 15px;">
                <textarea id="note-content-input" placeholder="开始记录..." style="width: 100%; height: 100%; background: transparent; border: none; color: rgba(255,255,255,0.9); font-size: 16px; line-height: 1.8; resize: none; outline: none;">${note?.content || ''}</textarea>
            </div>
        </div>
    `;
    
    let selectedCategory = note?.category || 'other';
    
    // 绑定分类选择
    container.querySelectorAll('.category-select').forEach(btn => {
        btn.onclick = () => {
            container.querySelectorAll('.category-select').forEach(b => {
                const cat = CATEGORIES.find(c => c.id === b.dataset.category);
                b.style.background = 'transparent';
                b.classList.remove('selected');
            });
            const cat = CATEGORIES.find(c => c.id === btn.dataset.category);
            btn.style.background = cat.color;
            btn.classList.add('selected');
            selectedCategory = btn.dataset.category;
        };
    });
    
    // 绑定保存
    document.getElementById('save-note-btn').onclick = async () => {
        const title = document.getElementById('note-title-input').value.trim();
        const content = document.getElementById('note-content-input').value.trim();
        
        if (!title && !content) {
            showToast('请输入标题或内容');
            return;
        }
        
        const noteData = {
            id: noteId || `note_${generateId()}`,
            title: title || '无标题',
            content,
            category: selectedCategory,
            pinned: note?.pinned || false
        };
        
        await saveNote(noteData);
        showToast('保存成功');
        renderList();
    };
    
    // 自动聚焦
    if (!note) {
        document.getElementById('note-title-input').focus();
    }
}

export function cleanup() {
    if (backBtnEl && originalBackHandler) {
        backBtnEl.onclick = originalBackHandler;
    }
    
    currentView = 'list';
    currentNoteId = null;
    searchKeyword = '';
    appTitleEl = null;
    backBtnEl = null;
    originalBackHandler = null;
}