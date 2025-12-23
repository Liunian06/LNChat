/**
 * LNChat 日记模块
 */

import { db, STORES } from '../db.js';
import { generateId, formatDate, showToast, getMoodEmoji, getDefaultSystemPrompt, getCurrentTimestamp, getExchangeDiaryPrompt } from '../utils.js';
import { Logger, LOG_TYPES } from '../logger.js';

let container, headerActions;
let currentTab = 'traditional'; // 'traditional' | 'exchange'

export async function init(target, actions) {
    container = target;
    headerActions = actions;
    renderDiaryHome();
}

// 渲染日记主页（带标签切换）
async function renderDiaryHome() {
    window.lnChat.appTitle.textContent = '日记';
    
    // 右上角添加新建交换日记按钮
    headerActions.innerHTML = `
        <button class="add-btn" id="add-exchange-diary-btn" title="新建交换日记">📝</button>
    `;
    document.getElementById('add-exchange-diary-btn').onclick = () => showExchangeDiaryCreator();
    
    // 渲染标签栏和内容
    container.innerHTML = `
        <div id="diary-content" style="height: calc(100% - 50px); overflow-y: auto;"></div>
        <div class="tab-bar" style="height: 50px; display: flex; border-top: 1px solid var(--glass-border); background: rgba(0,0,0,0.2); position: absolute; bottom: 0; width: 100%;">
            <div class="tab-item" id="tab-traditional" style="flex: 1; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.3s;">
                <span style="font-size: 14px;">📔 传统日记</span>
            </div>
            <div class="tab-item" id="tab-exchange" style="flex: 1; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.3s;">
                <span style="font-size: 14px;">📝 交换日记</span>
            </div>
        </div>
    `;
    
    const updateTabStyles = () => {
        const traditionalTab = document.getElementById('tab-traditional');
        const exchangeTab = document.getElementById('tab-exchange');
        
        if (currentTab === 'traditional') {
            traditionalTab.style.color = 'var(--primary-color)';
            traditionalTab.style.fontWeight = 'bold';
            exchangeTab.style.color = 'var(--text-secondary)';
            exchangeTab.style.fontWeight = 'normal';
        } else {
            traditionalTab.style.color = 'var(--text-secondary)';
            traditionalTab.style.fontWeight = 'normal';
            exchangeTab.style.color = 'var(--primary-color)';
            exchangeTab.style.fontWeight = 'bold';
        }
    };
    
    document.getElementById('tab-traditional').onclick = () => {
        currentTab = 'traditional';
        updateTabStyles();
        renderCurrentTab();
    };
    document.getElementById('tab-exchange').onclick = () => {
        currentTab = 'exchange';
        updateTabStyles();
        renderCurrentTab();
    };
    
    updateTabStyles();
    renderCurrentTab();
}

async function renderCurrentTab() {
    const content = document.getElementById('diary-content');
    if (currentTab === 'traditional') {
        await renderList(content);
    } else {
        await renderExchangeDiaryList(content);
    }
}

async function renderList(target) {
    const diaries = await db.getAll(STORES.DIARIES);
    const contacts = await db.getAll(STORES.CONTACTS);
    
    // 按角色分组日记
    const diaryBooks = {};
    for (const diary of diaries) {
        if (diary.contactId) {
            if (!diaryBooks[diary.contactId]) {
                diaryBooks[diary.contactId] = [];
            }
            diaryBooks[diary.contactId].push(diary);
        }
    }
    
    // 为每个角色计算最新日记日期
    const bookList = Object.keys(diaryBooks).map(contactId => {
        const contact = contacts.find(c => c.id === contactId);
        const diariesList = diaryBooks[contactId];
        diariesList.sort((a, b) => new Date(b.date) - new Date(a.date));
        return {
            contactId,
            contactName: contact ? contact.name : '未知角色',
            contactAvatar: contact ? contact.avatar : '',
            diaryCount: diariesList.length,
            latestDate: diariesList[0].date,
            latestMood: diariesList[0].mood
        };
    });
    
    // 按最新日记日期排序
    bookList.sort((a, b) => new Date(b.latestDate) - new Date(a.latestDate));

    if (bookList.length === 0) {
        target.innerHTML = `
            <div class="empty-state">
                <p>还没有任何传统日记</p>
                <p style="font-size: 14px; color: var(--text-secondary); margin-top: 10px;">请先在聊天中与角色对话，系统会自动生成日记</p>
            </div>
        `;
        return;
    }

    target.innerHTML = `
        <div class="list-container" style="padding-bottom: 60px;">
            ${bookList.map(book => `
                <div class="item diary-book-item" data-contact-id="${book.contactId}">
                    <div class="avatar">${book.contactAvatar ? `<img src="${book.contactAvatar}">` : getMoodEmoji(book.latestMood)}</div>
                    <div class="info">
                        <div class="name">${book.contactName}的日记本</div>
                        <div class="desc">${formatDate(book.latestDate)} · 共${book.diaryCount}篇</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    target.querySelectorAll('.diary-book-item').forEach(item => {
        item.onclick = () => renderDiaryBookDetail(item.dataset.contactId);
    });
}

async function renderDiaryBookDetail(contactId) {
    const diaries = await db.getAll(STORES.DIARIES);
    const contact = await db.get(STORES.CONTACTS, contactId);
    
    const contactDiaries = diaries.filter(d => d.contactId === contactId);
    // 按最新日期排序（最新的在最前面）
    contactDiaries.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    headerActions.innerHTML = `<button class="add-btn" id="add-diary-btn">➕</button>`;
    document.getElementById('add-diary-btn').onclick = () => renderForm(null, contactId);

    if (contactDiaries.length === 0) {
        container.innerHTML = `
            <div class="detail-container">
                <h2>${contact ? contact.name : '未知角色'}的日记本</h2>
                <div class="empty-state">
                    <p>还没有日记</p>
                    <button onclick="document.getElementById('add-diary-btn').click()">写第一篇日记</button>
                </div>
                <div class="form-actions" style="margin-top:20px">
                    <button class="cancel-btn" id="back-list-btn">返回列表</button>
                </div>
            </div>
        `;
        document.getElementById('back-list-btn').onclick = () => renderDiaryHome();
        return;
    }

    // 使用横线本样式显示第一篇日记
    renderDiaryWithNotebook(contactDiaries, 0, contact);
}

// 将文本内容分页
function paginateContent(content, maxHeight) {
    // 粗略估算行高 (字体16px * 1.8 行高 ≈ 29px)
    // 这里使用保守估计，避免溢出
    const lineHeight = 29;
    const maxLines = Math.floor(maxHeight / lineHeight);
    
    // 按段落分割
    const paragraphs = content.split('\n');
    const pages = [];
    let currentPageContent = [];
    let currentHeight = 0;
    
    for (const paragraph of paragraphs) {
        // 如果是空行，增加一点间距
        if (!paragraph.trim()) {
            if (currentHeight + lineHeight <= maxHeight) {
                currentPageContent.push('');
                currentHeight += lineHeight;
            }
            continue;
        }
        
        // 估算段落高度 (假设每行约 24 个汉字/48个英文字符)
        // 增加 letter-spacing 后一行大约容纳更少字符
        const charsPerLine = 24;
        const linesNeeded = Math.ceil(Math.max(1, paragraph.length / charsPerLine));
        const paragraphHeight = linesNeeded * lineHeight + 10; // 增加段间距
        
        if (currentHeight + paragraphHeight > maxHeight && currentPageContent.length > 0) {
            // 当前页放不下了，开启新页
            pages.push(currentPageContent.join('\n\n')); // 增加段落间距
            currentPageContent = [paragraph];
            currentHeight = paragraphHeight;
        } else {
            currentPageContent.push(paragraph);
            currentHeight += paragraphHeight;
        }
    }
    
    if (currentPageContent.length > 0) {
        pages.push(currentPageContent.join('\n\n'));
    }
    
    return pages.length > 0 ? pages : [content];
}

function renderDiaryWithNotebook(diaries, diaryIndex, spreadIndex = 0, contact = null) {
    const diary = diaries[diaryIndex];
    
    // 如果没有传contact，尝试获取
    if (!contact && diary.contactId) {
        db.get(STORES.CONTACTS, diary.contactId).then(c => {
            contact = c;
        });
    }
    
    headerActions.innerHTML = `<button id="edit-diary-btn">✏️</button>`;
    document.getElementById('edit-diary-btn').onclick = () => renderForm(diary.id, diary.contactId);

    // 分页处理
    // 页面总高度 600px - padding 80px = 520px 可用
    // 第一页头部占用约 120px (标题+元信息+间距)
    
    const firstPageHeight = 380;
    // 减小可用高度以避免底部遮挡，留出更多余地
    const normalPageHeight = 480;
    
    // 先对整个内容进行分页，第一页使用较小高度
    const pages = [];
    // 按段落分割，这里使用更健壮的换行符分割
    const paragraphs = diary.content.split(/\r?\n/);
    let currentPageContent = [];
    let currentHeight = 0;
    let isFirstPage = true;
    
    const lineHeight = 29; // 16px * 1.8
    const charsPerLine = 22; // 略微减少每行字符数以适应新版式
    
    for (const paragraph of paragraphs) {
        const maxHeight = isFirstPage ? firstPageHeight : normalPageHeight;
        
        // 处理空行
        if (!paragraph.trim()) {
            if (currentHeight + lineHeight <= maxHeight) {
                currentPageContent.push('');
                currentHeight += lineHeight;
            }
            continue;
        }
        
        const linesNeeded = Math.ceil(Math.max(1, paragraph.length / charsPerLine));
        // 段落高度：行数 * 行高 + 段间距(10px)
        const paragraphHeight = linesNeeded * lineHeight + 10;
        
        if (currentHeight + paragraphHeight > maxHeight && currentPageContent.length > 0) {
            pages.push(currentPageContent.join('\n\n'));
            currentPageContent = [paragraph];
            currentHeight = paragraphHeight;
            isFirstPage = false;
        } else {
            currentPageContent.push(paragraph);
            currentHeight += paragraphHeight;
        }
    }
    
    if (currentPageContent.length > 0) {
        pages.push(currentPageContent.join('\n\n'));
    }
    
    // 如果没有内容，至少显示一页
    if (pages.length === 0) {
        pages.push('');
    }
    
    const allPages = pages;
    
    // 计算双页跨页：每个spread包含左右两页
    // spreadIndex=0: 左：第1页（含标题），右：第2页
    // spreadIndex=1: 左：第3页，右：第4页
    
    let leftPageContent = '';
    let rightPageContent = '';
    let leftHasContent = false;
    let rightHasContent = false;
    
    const leftPageIndex = spreadIndex * 2;
    const rightPageIndex = spreadIndex * 2 + 1;
    
    // 左页
    if (leftPageIndex < allPages.length) {
        if (leftPageIndex === 0) {
            // 第一页包含标题
            leftPageContent = `
                <div class="diary-page-header">
                    <div class="diary-page-title">${diary.title}</div>
                    <div class="diary-page-meta">
                        <div class="diary-page-meta-item">
                            <span>📅</span>
                            <span>${formatDate(diary.date)}</span>
                        </div>
                        <div class="diary-page-meta-item">
                            <span>${getMoodEmoji(diary.mood)}</span>
                            <span>${diary.mood}</span>
                        </div>
                        ${contact ? `
                        <div class="diary-page-meta-item">
                            <span>👤</span>
                            <span>${contact.name}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="diary-page-content">${allPages[leftPageIndex]}</div>
            `;
        } else {
            leftPageContent = `<div class="diary-page-content">${allPages[leftPageIndex]}</div>`;
        }
        leftHasContent = true;
    }
    
    // 右页
    if (rightPageIndex < allPages.length) {
        rightPageContent = `<div class="diary-page-content">${allPages[rightPageIndex]}</div>`;
        rightHasContent = true;
    }
    
    // 计算总跨页数
    const totalSpreads = Math.ceil(allPages.length / 2);
    
    // 判断导航
    const hasPrevSpread = spreadIndex > 0;
    const hasNextSpread = spreadIndex < totalSpreads - 1;
    const hasPrevDiary = diaryIndex < diaries.length - 1;
    const hasNextDiary = diaryIndex > 0;

    // 预加载下一页内容
    let nextLeftContent = '';
    let nextRightContent = '';
    if (hasNextSpread) {
        const nextLeftPageIndex = (spreadIndex + 1) * 2;
        const nextRightPageIndex = (spreadIndex + 1) * 2 + 1;
        
        if (nextLeftPageIndex < allPages.length) {
            if (nextLeftPageIndex === 0) {
                nextLeftContent = `
                    <div class="diary-page-header">
                        <div class="diary-page-title">${diary.title}</div>
                        <div class="diary-page-meta">
                            <div class="diary-page-meta-item">
                                <span>📅</span>
                                <span>${formatDate(diary.date)}</span>
                            </div>
                            <div class="diary-page-meta-item">
                                <span>${getMoodEmoji(diary.mood)}</span>
                                <span>${diary.mood}</span>
                            </div>
                            ${contact ? `
                            <div class="diary-page-meta-item">
                                <span>👤</span>
                                <span>${contact.name}</span>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    <div class="diary-page-content">${allPages[nextLeftPageIndex]}</div>
                `;
            } else {
                nextLeftContent = `<div class="diary-page-content">${allPages[nextLeftPageIndex]}</div>`;
            }
        }
        
        if (nextRightPageIndex < allPages.length) {
            nextRightContent = `<div class="diary-page-content">${allPages[nextRightPageIndex]}</div>`;
        }
    }

    container.innerHTML = `
        <div class="diary-notebook">
            <div class="diary-book-container">
                <div class="diary-book">
                    <!-- 下层：下一页内容 -->
                    <div class="diary-page-underneath">
                        <div class="diary-page-left">
                            ${nextLeftContent || `<div style="display: flex; align-items: center; justify-content: center; height: 100%; opacity: 0.2;">&#8203;</div>`}
                        </div>
                        <div class="diary-page-right">
                            ${nextRightContent || `<div style="display: flex; align-items: center; justify-content: center; height: 100%; opacity: 0.2;">&#8203;</div>`}
                        </div>
                    </div>
                    
                    <!-- 当前层：当前页内容 -->
                    <div class="diary-pages-current">
                        <div class="diary-page-left" id="left-page">
                            ${leftHasContent ? leftPageContent : `
                                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; opacity: 0.2; text-align: center;">
                                    <div style="font-size: 24px; margin-bottom: 10px;">${getMoodEmoji(diary.mood)}</div>
                                    <div style="font-size: 14px; color: #7f8c8d;">
                                        ${contact ? contact.name + '的' : ''}日记本
                                    </div>
                                </div>
                            `}
                        </div>
                        
                        <div class="diary-page-right" id="right-page">
                            ${rightHasContent ? rightPageContent : `
                                <div style="display: flex; align-items: center; justify-content: center; height: 100%; opacity: 0.3; font-size: 14px; color: #7f8c8d;">
                                    ${hasNextDiary ? '翻页查看下一篇' : '已是最后一页'}
                                </div>
                            `}
                        </div>
                    </div>
                    
                    <!-- 书脊 -->
                    <div class="diary-book-spine"></div>
                </div>
            </div>
            
            <div class="diary-nav-buttons">
                <button class="diary-nav-btn" id="prev-btn" ${!hasPrevSpread && !hasPrevDiary ? 'disabled' : ''}>
                    <span>←</span>
                    <span>上一页</span>
                </button>
                <div class="diary-page-indicator">
                    第 ${spreadIndex + 1} / ${totalSpreads} 页 · 日记 ${diaryIndex + 1}/${diaries.length}
                </div>
                <button class="diary-nav-btn" id="next-btn" ${!hasNextSpread && !hasNextDiary ? 'disabled' : ''}>
                    <span>${hasNextSpread ? '下一页' : '下一篇'}</span>
                    <span>→</span>
                </button>
            </div>
            <div class="form-actions" style="margin-top:20px">
                <button class="cancel-btn" id="back-list-btn">返回列表</button>
            </div>
        </div>
    `;

    const rightPage = document.getElementById('right-page');
    
    // 上一页按钮
    document.getElementById('prev-btn').onclick = () => {
        if (hasPrevSpread) {
            // 当前日记的上一个跨页
            rightPage.classList.add('flipping');
            setTimeout(() => {
                renderDiaryWithNotebook(diaries, diaryIndex, spreadIndex - 1, contact);
            }, 800);
        } else if (hasPrevDiary) {
            // 上一篇日记的最后一个跨页
            rightPage.classList.add('flipping');
            setTimeout(() => {
                // 计算上一篇日记的总页数
                const prevDiary = diaries[diaryIndex + 1];
                
                // 使用相同的逻辑重新计算上一篇的分页
                const prevPages = [];
                const prevParagraphs = prevDiary.content.split('\n');
                let prevCurrentPageContent = [];
                let prevCurrentHeight = 0;
                let prevIsFirstPage = true;
                
                const lineHeight = 29;
                const charsPerLine = 24;
                const firstPageHeight = 380;
                // 同样减小上一篇计算时的可用高度
                const normalPageHeight = 480;
                
                for (const paragraph of prevParagraphs) {
                    const maxHeight = prevIsFirstPage ? firstPageHeight : normalPageHeight;
                    
                    if (!paragraph.trim()) {
                        if (prevCurrentHeight + lineHeight <= maxHeight) {
                            prevCurrentPageContent.push('');
                            prevCurrentHeight += lineHeight;
                        }
                        continue;
                    }
                    
                    const linesNeeded = Math.ceil(Math.max(1, paragraph.length / charsPerLine));
                    const paragraphHeight = linesNeeded * lineHeight + 10;
                    
                    if (prevCurrentHeight + paragraphHeight > maxHeight && prevCurrentPageContent.length > 0) {
                        prevPages.push(prevCurrentPageContent.join('\n\n'));
                        prevCurrentPageContent = [paragraph];
                        prevCurrentHeight = paragraphHeight;
                        prevIsFirstPage = false;
                    } else {
                        prevCurrentPageContent.push(paragraph);
                        prevCurrentHeight += paragraphHeight;
                    }
                }
                
                if (prevCurrentPageContent.length > 0) {
                    prevPages.push(prevCurrentPageContent.join('\n\n'));
                }
                
                const prevTotalSpreads = Math.ceil(prevPages.length / 2);
                
                renderDiaryWithNotebook(diaries, diaryIndex + 1, prevTotalSpreads - 1, contact);
            }, 800);
        }
    };

    // 下一页按钮
    document.getElementById('next-btn').onclick = () => {
        if (hasNextSpread) {
            // 当前日记的下一个跨页
            rightPage.classList.add('flipping');
            setTimeout(() => {
                renderDiaryWithNotebook(diaries, diaryIndex, spreadIndex + 1, contact);
            }, 800);
        } else if (hasNextDiary) {
            // 下一篇日记的第一个跨页
            rightPage.classList.add('flipping');
            setTimeout(() => {
                renderDiaryWithNotebook(diaries, diaryIndex - 1, 0, contact);
            }, 800);
        }
    };

    document.getElementById('back-list-btn').onclick = () => renderDiaryHome();
}

async function renderDiaryDetail(id) {
    const diary = await db.get(STORES.DIARIES, id);
    const contact = diary.contactId ? await db.get(STORES.CONTACTS, diary.contactId) : null;
    
    // 获取同一角色的所有日记
    const diaries = await db.getAll(STORES.DIARIES);
    const contactDiaries = diaries.filter(d => d.contactId === diary.contactId);
    contactDiaries.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // 找到当前日记在列表中的索引
    const currentIndex = contactDiaries.findIndex(d => d.id === id);
    
    // 使用横线本样式显示
    renderDiaryWithNotebook(contactDiaries, currentIndex, contact);
}

async function renderForm(id = null, contactId = null) {
    let diary = { title: '', date: new Date().toISOString().split('T')[0], mood: '开心', content: '', contactId: contactId };
    if (id) {
        diary = await db.get(STORES.DIARIES, id);
    }
    
    const contacts = await db.getAll(STORES.CONTACTS);

    headerActions.innerHTML = '';
    const moods = ['开心', '快乐', '平静', '忧郁', '悲伤', '愤怒', '焦虑', '兴奋', '疲惫', '感激'];

    container.innerHTML = `
        <div class="form-container">
            <div class="input-group">
                <label>关联角色</label>
                <select id="d-contact">
                    <option value="">无关联角色</option>
                    ${contacts.map(c => `<option value="${c.id}" ${diary.contactId === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                </select>
            </div>
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
        
        const selectedContactId = document.getElementById('d-contact').value || null;

        const newDiary = {
            ...diary,
            id: id || generateId(),
            title,
            date: document.getElementById('d-date').value,
            mood: document.getElementById('d-mood').value,
            content,
            contactId: selectedContactId,
            updatedAt: new Date().toISOString()
        };
        if (!id) newDiary.createdAt = new Date().toISOString();

        await db.put(STORES.DIARIES, newDiary);
        showToast('保存成功');
        
        if (selectedContactId) {
            renderDiaryBookDetail(selectedContactId);
        } else {
            renderList();
        }
    };

    if (id) {
        document.getElementById('del-btn').onclick = async () => {
            if (confirm('确定删除吗？')) {
                await db.delete(STORES.DIARIES, id);
                showToast('已删除');
                if (diary.contactId) {
                    renderDiaryBookDetail(diary.contactId);
                } else {
                    renderList();
                }
            }
        };
    }

    document.getElementById('cancel-btn').onclick = () => {
        if (id) {
            renderDiaryDetail(id);
        } else if (diary.contactId) {
            renderDiaryBookDetail(diary.contactId);
        } else {
            renderDiaryHome();
        }
    };
}

// ===== 交换日记功能 =====

// 渲染交换日记列表
async function renderExchangeDiaryList(target) {
    const exchangeDiaries = await db.getAll(STORES.EXCHANGE_DIARIES);
    const contacts = await db.getAll(STORES.CONTACTS);
    const entries = await db.getAll(STORES.EXCHANGE_DIARY_ENTRIES);
    
    // 按最后更新时间排序
    exchangeDiaries.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    
    if (exchangeDiaries.length === 0) {
        target.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📝</div>
                <p>还没有交换日记</p>
                <p style="font-size: 14px; color: var(--text-secondary); margin-top: 10px;">点击右上角按钮创建第一本交换日记</p>
                <button id="create-exchange-diary-btn" style="margin-top: 20px;">创建交换日记</button>
            </div>
        `;
        document.getElementById('create-exchange-diary-btn').onclick = () => showExchangeDiaryCreator();
        return;
    }
    
    target.innerHTML = `
        <div class="list-container" style="padding-bottom: 60px;">
            ${exchangeDiaries.map(diary => {
                const contact = contacts.find(c => c.id === diary.contactId);
                const diaryEntries = entries.filter(e => e.diaryId === diary.id);
                const latestEntry = diaryEntries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
                const isUserTurn = diary.currentTurn === 'user';
                
                return `
                    <div class="item exchange-diary-item" data-id="${diary.id}">
                        <div class="avatar" style="position: relative;">
                            ${contact && contact.avatar ? `<img src="${contact.avatar}">` : '📝'}
                            <span class="turn-indicator ${isUserTurn ? 'user-turn' : 'ai-turn'}" style="position: absolute; bottom: -2px; right: -2px; font-size: 12px; background: ${isUserTurn ? '#4CAF50' : '#2196F3'}; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center;">
                                ${isUserTurn ? '✏️' : '🤖'}
                            </span>
                        </div>
                        <div class="info">
                            <div class="name">${diary.title}</div>
                            <div class="desc" style="display: flex; align-items: center; gap: 5px;">
                                <span style="font-size: 11px; padding: 2px 6px; background: ${isUserTurn ? 'rgba(76,175,80,0.2)' : 'rgba(33,150,243,0.2)'}; border-radius: 10px; color: ${isUserTurn ? '#4CAF50' : '#2196F3'};">
                                    ${isUserTurn ? '等待你写' : '等待AI写'}
                                </span>
                                <span>共${diaryEntries.length}篇</span>
                            </div>
                        </div>
                        <div class="meta" style="text-align: right; font-size: 11px; color: var(--text-secondary);">
                            ${latestEntry ? formatDate(latestEntry.createdAt).split(' ')[0] : formatDate(diary.createdAt).split(' ')[0]}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    target.querySelectorAll('.exchange-diary-item').forEach(item => {
        item.onclick = () => renderExchangeDiaryDetail(item.dataset.id);
    });
}

// 显示交换日记创建器
async function showExchangeDiaryCreator() {
    const contacts = await db.getAll(STORES.CONTACTS);
    const personas = await db.getAll(STORES.USER_PERSONAS);
    
    window.lnChat.appTitle.textContent = '创建交换日记';
    headerActions.innerHTML = '';
    
    // 保存返回按钮的原始行为
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        renderDiaryHome();
    };
    
    if (contacts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">👥</div>
                <p>还没有可以交换日记的角色</p>
                <button id="go-to-contacts">去创建角色</button>
            </div>
        `;
        document.getElementById('go-to-contacts').onclick = () => window.lnChat.openApp('contacts');
        return;
    }
    
    container.innerHTML = `
        <div class="form-container" style="padding: 20px;">
            <div class="input-group">
                <label>日记本标题</label>
                <input type="text" id="exchange-title" placeholder="例如：我和小明的交换日记" value="">
            </div>
            
            <div class="input-group">
                <label>选择交换对象（角色）</label>
                <select id="exchange-contact">
                    <option value="">请选择角色</option>
                    ${contacts.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                </select>
            </div>
            
            <div class="input-group">
                <label>选择你的身份（可选）</label>
                <select id="exchange-persona">
                    <option value="">默认（无特定身份）</option>
                    ${personas.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                </select>
            </div>
            
            <!-- AI设置区域 -->
            <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 12px; margin-top: 20px; border: 1px solid var(--glass-border);">
                <h4 style="margin: 0 0 15px 0; font-size: 14px; color: rgb(33, 150, 243);">🤖 AI 生成设置</h4>
                
                <!-- 温度设置 - 滑块+输入框 -->
                <div class="input-group" style="margin-bottom: 15px;">
                    <label style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span>温度 (Temperature)</span>
                        <input type="number" id="exchange-temperature-input" min="0" max="2" step="0.1" value="1.0"
                               style="width: 80px; padding: 6px 10px; text-align: center; border: 1px solid var(--glass-border); border-radius: 8px; background: var(--glass-bg); color: var(--text-color);">
                    </label>
                    <input type="range" id="exchange-temperature-slider" min="0" max="2" step="0.1" value="1.0"
                           style="width: 100%; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.2); outline: none; -webkit-appearance: none; appearance: none;">
                    <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-secondary); margin-top: 5px;">
                        <span>0 = 严谨</span>
                        <span>2 = 创意</span>
                    </div>
                </div>
                
                <!-- 携带聊天记录开关 -->
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--glass-border);">
                    <div style="flex: 1;">
                        <div style="font-size: 14px;">💬 携带聊天记录</div>
                        <div style="font-size: 11px; color: var(--text-secondary);">让AI参考你们的聊天内容</div>
                    </div>
                    <label class="switch" style="position: relative; display: inline-block; width: 50px; height: 26px;">
                        <input type="checkbox" id="include-chat-history" checked style="opacity: 0; width: 0; height: 0;">
                        <span class="slider exchange-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; transition: .3s; border-radius: 26px;"></span>
                    </label>
                </div>
                <div id="chat-history-count-container" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--glass-border);">
                    <span style="font-size: 13px;">聊天记录条数</span>
                    <input type="number" id="chat-history-count" min="1" max="5000" step="1" value="2000"
                           style="width: 100px; padding: 6px 10px; text-align: center; border: 1px solid var(--glass-border); border-radius: 8px; background: var(--glass-bg); color: var(--text-color);">
                </div>
                
                <!-- 携带记忆开关 -->
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--glass-border);">
                    <div style="flex: 1;">
                        <div style="font-size: 14px;">🧠 携带记忆</div>
                        <div style="font-size: 11px; color: var(--text-secondary);">让AI参考已保存的记忆</div>
                    </div>
                    <label class="switch" style="position: relative; display: inline-block; width: 50px; height: 26px;">
                        <input type="checkbox" id="include-memory" checked style="opacity: 0; width: 0; height: 0;">
                        <span class="slider exchange-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; transition: .3s; border-radius: 26px;"></span>
                    </label>
                </div>
                <div id="memory-count-container" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 0;">
                    <span style="font-size: 13px;">记忆条数</span>
                    <input type="number" id="memory-count" min="1" max="5000" step="1" value="2000"
                           style="width: 100px; padding: 6px 10px; text-align: center; border: 1px solid var(--glass-border); border-radius: 8px; background: var(--glass-bg); color: var(--text-color);">
                </div>
            </div>
            
            <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 12px; margin-top: 20px; border: 1px solid var(--glass-border);">
                <h4 style="margin: 0 0 10px 0; font-size: 14px; color: var(--primary-color);">📝 写下你的第一篇日记</h4>
                <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 15px;">交换日记由你先写第一篇，然后AI角色会根据你的日记和聊天记录回复</p>
                
                <div class="input-group">
                    <label>日期</label>
                    <input type="date" id="first-entry-date" value="${new Date().toISOString().split('T')[0]}">
                </div>
                
                <div class="input-group">
                    <label>内容</label>
                    <textarea id="first-entry-content" placeholder="写下你想分享的事情、心情、想法..." style="height: 150px;"></textarea>
                </div>
            </div>
            
            <div class="form-actions" style="margin-top: 20px;">
                <button class="save-btn" id="create-exchange-btn" style="background: rgb(33, 150, 243);">创建并开始交换</button>
                <button class="cancel-btn" id="cancel-exchange-btn">取消</button>
            </div>
        </div>
        
        <style>
            .exchange-slider {
                background-color: rgba(255, 255, 255, 0.3);
            }
            .switch input:checked + .exchange-slider {
                background-color: rgb(33, 150, 243) !important;
            }
            .exchange-slider:before {
                position: absolute;
                content: "";
                height: 20px;
                width: 20px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                transition: .3s;
                border-radius: 50%;
            }
            .switch input:checked + .exchange-slider:before {
                transform: translateX(24px);
            }
            #exchange-temperature-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 18px;
                height: 18px;
                background: rgb(33, 150, 243);
                border-radius: 50%;
                cursor: pointer;
                border: 2px solid white;
                box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            }
            #exchange-temperature-slider::-moz-range-thumb {
                width: 18px;
                height: 18px;
                background: rgb(33, 150, 243);
                border-radius: 50%;
                cursor: pointer;
                border: 2px solid white;
                box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            }
        </style>
    `;
    
    // 绑定温度滑块和输入框的同步事件
    const temperatureSlider = document.getElementById('exchange-temperature-slider');
    const temperatureInput = document.getElementById('exchange-temperature-input');
    
    temperatureSlider.oninput = () => {
        temperatureInput.value = temperatureSlider.value;
    };
    
    temperatureInput.oninput = () => {
        let val = parseFloat(temperatureInput.value);
        if (isNaN(val)) val = 1.0;
        if (val < 0) val = 0;
        if (val > 2) val = 2;
        temperatureSlider.value = val;
    };
    
    temperatureInput.onblur = () => {
        let val = parseFloat(temperatureInput.value);
        if (isNaN(val)) val = 1.0;
        if (val < 0) val = 0;
        if (val > 2) val = 2;
        temperatureInput.value = val.toFixed(1);
        temperatureSlider.value = val;
    };
    
    // 绑定开关事件 - 控制数量输入框的显示/隐藏
    const includeChatHistoryCheckbox = document.getElementById('include-chat-history');
    const chatHistoryCountContainer = document.getElementById('chat-history-count-container');
    includeChatHistoryCheckbox.onchange = () => {
        chatHistoryCountContainer.style.display = includeChatHistoryCheckbox.checked ? 'flex' : 'none';
    };
    
    const includeMemoryCheckbox = document.getElementById('include-memory');
    const memoryCountContainer = document.getElementById('memory-count-container');
    includeMemoryCheckbox.onchange = () => {
        memoryCountContainer.style.display = includeMemoryCheckbox.checked ? 'flex' : 'none';
    };
    
    document.getElementById('create-exchange-btn').onclick = async () => {
        const title = document.getElementById('exchange-title').value.trim();
        const contactId = document.getElementById('exchange-contact').value;
        const personaId = document.getElementById('exchange-persona').value || null;
        const firstEntryDate = document.getElementById('first-entry-date').value;
        const firstEntryContent = document.getElementById('first-entry-content').value.trim();
        
        // 获取AI设置
        const temperature = parseFloat(document.getElementById('exchange-temperature-input').value);
        const includeChatHistorySetting = document.getElementById('include-chat-history').checked;
        const chatHistoryCount = parseInt(document.getElementById('chat-history-count').value);
        const includeMemorySetting = document.getElementById('include-memory').checked;
        const memoryCount = parseInt(document.getElementById('memory-count').value);
        
        if (!title) return showToast('请输入日记本标题');
        if (!contactId) return showToast('请选择交换对象');
        if (!firstEntryContent) return showToast('请写下你的第一篇日记');
        
        const contact = contacts.find(c => c.id === contactId);
        
        // 创建交换日记本，包含AI设置
        const exchangeDiary = {
            id: generateId(),
            title: title,
            contactId: contactId,
            userPersonaId: personaId,
            currentTurn: 'ai', // 用户写完后轮到AI
            // AI生成设置
            temperature: temperature,
            includeChatHistory: includeChatHistorySetting,
            chatHistoryCount: chatHistoryCount,
            includeMemory: includeMemorySetting,
            memoryCount: memoryCount,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await db.put(STORES.EXCHANGE_DIARIES, exchangeDiary);
        
        // 创建第一篇日记条目
        const firstEntry = {
            id: generateId(),
            diaryId: exchangeDiary.id,
            author: 'user',
            date: firstEntryDate,
            content: firstEntryContent,
            createdAt: new Date().toISOString()
        };
        await db.put(STORES.EXCHANGE_DIARY_ENTRIES, firstEntry);
        
        showToast('交换日记已创建');
        
        // 进入日记详情页面
        window.lnChat.backBtn.onclick = originalBack;
        renderExchangeDiaryDetail(exchangeDiary.id);
    };
    
    document.getElementById('cancel-exchange-btn').onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        renderDiaryHome();
    };
}

// 渲染交换日记详情
async function renderExchangeDiaryDetail(diaryId) {
    const diary = await db.get(STORES.EXCHANGE_DIARIES, diaryId);
    if (!diary) {
        showToast('日记不存在');
        renderDiaryHome();
        return;
    }
    
    const contact = await db.get(STORES.CONTACTS, diary.contactId);
    const persona = diary.userPersonaId ? await db.get(STORES.USER_PERSONAS, diary.userPersonaId) : null;
    const entries = await db.getAll(STORES.EXCHANGE_DIARY_ENTRIES);
    const diaryEntries = entries.filter(e => e.diaryId === diaryId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    window.lnChat.appTitle.textContent = diary.title;
    
    // 设置返回行为
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        currentTab = 'exchange';
        renderDiaryHome();
    };
    
    // 右上角操作按钮
    headerActions.innerHTML = `
        <button class="add-btn" id="delete-exchange-diary-btn" title="删除日记本" style="background: rgba(244,67,54,0.2);">🗑️</button>
    `;
    document.getElementById('delete-exchange-diary-btn').onclick = async () => {
        if (confirm('确定要删除这本交换日记吗？所有条目都将被删除。')) {
            // 删除所有条目
            for (const entry of diaryEntries) {
                await db.delete(STORES.EXCHANGE_DIARY_ENTRIES, entry.id);
            }
            // 删除日记本
            await db.delete(STORES.EXCHANGE_DIARIES, diaryId);
            showToast('已删除');
            window.lnChat.backBtn.onclick = originalBack;
            currentTab = 'exchange';
            renderDiaryHome();
        }
    };
    
    const isUserTurn = diary.currentTurn === 'user';
    const userName = persona ? persona.name : '我';
    const aiName = contact ? contact.name : 'AI';
    
    container.innerHTML = `
        <div class="exchange-diary-detail" style="padding: 15px; height: 100%; display: flex; flex-direction: column;">
            <!-- 日记信息头 -->
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 12px; margin-bottom: 15px; border: 1px solid var(--glass-border);">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 40px; height: 40px; border-radius: 10px; background: var(--glass-bg); display: flex; align-items: center; justify-content: center; font-size: 20px;">
                        ${contact && contact.avatar ? `<img src="${contact.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px;">` : '📝'}
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 600;">${userName} ⇄ ${aiName}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">共 ${diaryEntries.length} 篇日记</div>
                    </div>
                    <div style="text-align: right;">
                        <span style="font-size: 11px; padding: 4px 10px; background: ${isUserTurn ? 'rgba(76,175,80,0.2)' : 'rgba(33,150,243,0.2)'}; border-radius: 15px; color: ${isUserTurn ? '#4CAF50' : '#2196F3'};">
                            ${isUserTurn ? '轮到你写了' : `等待${aiName}回复`}
                        </span>
                    </div>
                </div>
            </div>
            
            <!-- 日记条目列表 -->
            <div class="exchange-entries-list" id="entries-list" style="flex: 1; overflow-y: auto; margin-bottom: 15px;">
                ${diaryEntries.length === 0 ? `
                    <div class="empty-state" style="padding: 40px;">
                        <p>还没有日记条目</p>
                    </div>
                ` : diaryEntries.map((entry, index) => `
                    <div class="exchange-entry ${entry.author}" style="margin-bottom: 15px;">
                        <div style="display: flex; align-items: flex-start; gap: 10px; ${entry.author === 'user' ? 'flex-direction: row-reverse;' : ''}">
                            <div style="width: 36px; height: 36px; border-radius: 50%; background: ${entry.author === 'user' ? 'rgba(76,175,80,0.2)' : 'rgba(33,150,243,0.2)'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                ${entry.author === 'user' ? '✏️' : (contact && contact.avatar ? `<img src="${contact.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">` : '🤖')}
                            </div>
                            <div style="flex: 1; max-width: calc(100% - 50px); background: rgba(255,255,255,0.05); padding: 12px 15px; border-radius: 15px; border: 1px solid var(--glass-border); ${entry.author === 'user' ? 'border-bottom-right-radius: 4px;' : 'border-bottom-left-radius: 4px;'}">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                    <span style="font-weight: 600; font-size: 13px; color: ${entry.author === 'user' ? '#4CAF50' : '#2196F3'};">
                                        ${entry.author === 'user' ? userName : aiName}
                                    </span>
                                    <span style="font-size: 11px; color: var(--text-secondary);">
                                        ${formatDate(entry.date).split(' ')[0]}
                                    </span>
                                </div>
                                <div style="font-size: 14px; line-height: 1.7; white-space: pre-wrap; word-break: break-word;">${entry.content}</div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <!-- 底部操作区 -->
            <div class="exchange-action-area" style="border-top: 1px solid var(--glass-border); padding-top: 15px;">
                ${isUserTurn ? `
                    <div id="user-write-area">
                        <div class="input-group" style="margin-bottom: 10px;">
                            <input type="date" id="new-entry-date" value="${new Date().toISOString().split('T')[0]}" style="padding: 10px;">
                        </div>
                        <div class="input-group" style="margin-bottom: 10px;">
                            <textarea id="new-entry-content" placeholder="写下你的日记..." style="height: 100px;"></textarea>
                        </div>
                        <button class="save-btn" id="submit-entry-btn" style="width: 100%;">📝 发送日记</button>
                    </div>
                ` : `
                    <div id="ai-write-area" style="text-align: center;">
                        <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 15px;">
                            现在轮到 ${aiName} 写日记了
                        </p>
                        <button class="save-btn" id="generate-ai-entry-btn" style="width: 100%;">
                            🤖 让${aiName}写日记
                        </button>
                    </div>
                `}
            </div>
        </div>
    `;
    
    // 滚动到底部
    setTimeout(() => {
        const entriesList = document.getElementById('entries-list');
        if (entriesList) {
            entriesList.scrollTop = entriesList.scrollHeight;
        }
    }, 100);
    
    if (isUserTurn) {
        // 用户写日记
        document.getElementById('submit-entry-btn').onclick = async () => {
            const date = document.getElementById('new-entry-date').value;
            const content = document.getElementById('new-entry-content').value.trim();
            
            if (!content) return showToast('请写下日记内容');
            
            const newEntry = {
                id: generateId(),
                diaryId: diaryId,
                author: 'user',
                date: date,
                content: content,
                createdAt: new Date().toISOString()
            };
            await db.put(STORES.EXCHANGE_DIARY_ENTRIES, newEntry);
            
            // 更新轮次
            diary.currentTurn = 'ai';
            diary.updatedAt = new Date().toISOString();
            await db.put(STORES.EXCHANGE_DIARIES, diary);
            
            showToast('日记已发送，正在等待AI回复...');
            
            // 重新渲染页面并自动调用AI生成
            await renderExchangeDiaryDetailAndTriggerAI(diaryId);
        };
    } else {
        // AI写日记
        document.getElementById('generate-ai-entry-btn').onclick = async () => {
            await generateAIEntry(diary, contact, persona, diaryEntries);
        };
    }
}

// 渲染交换日记详情并自动触发AI生成
async function renderExchangeDiaryDetailAndTriggerAI(diaryId) {
    const diary = await db.get(STORES.EXCHANGE_DIARIES, diaryId);
    if (!diary) {
        showToast('日记不存在');
        renderDiaryHome();
        return;
    }
    
    const contact = await db.get(STORES.CONTACTS, diary.contactId);
    const persona = diary.userPersonaId ? await db.get(STORES.USER_PERSONAS, diary.userPersonaId) : null;
    const entries = await db.getAll(STORES.EXCHANGE_DIARY_ENTRIES);
    const diaryEntries = entries.filter(e => e.diaryId === diaryId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    window.lnChat.appTitle.textContent = diary.title;
    
    // 设置返回行为
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        currentTab = 'exchange';
        renderDiaryHome();
    };
    
    // 右上角操作按钮
    headerActions.innerHTML = `
        <button class="add-btn" id="delete-exchange-diary-btn" title="删除日记本" style="background: rgba(244,67,54,0.2);">🗑️</button>
    `;
    document.getElementById('delete-exchange-diary-btn').onclick = async () => {
        if (confirm('确定要删除这本交换日记吗？所有条目都将被删除。')) {
            for (const entry of diaryEntries) {
                await db.delete(STORES.EXCHANGE_DIARY_ENTRIES, entry.id);
            }
            await db.delete(STORES.EXCHANGE_DIARIES, diaryId);
            showToast('已删除');
            window.lnChat.backBtn.onclick = originalBack;
            currentTab = 'exchange';
            renderDiaryHome();
        }
    };
    
    const userName = persona ? persona.name : '我';
    const aiName = contact ? contact.name : 'AI';
    
    // 显示等待AI的界面
    container.innerHTML = `
        <div class="exchange-diary-detail" style="padding: 15px; height: 100%; display: flex; flex-direction: column;">
            <!-- 日记信息头 -->
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 12px; margin-bottom: 15px; border: 1px solid var(--glass-border);">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 40px; height: 40px; border-radius: 10px; background: var(--glass-bg); display: flex; align-items: center; justify-content: center; font-size: 20px;">
                        ${contact && contact.avatar ? `<img src="${contact.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px;">` : '📝'}
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 600;">${userName} ⇄ ${aiName}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">共 ${diaryEntries.length} 篇日记</div>
                    </div>
                    <div style="text-align: right;">
                        <span style="font-size: 11px; padding: 4px 10px; background: rgba(33,150,243,0.2); border-radius: 15px; color: #2196F3;">
                            ${aiName}正在写日记...
                        </span>
                    </div>
                </div>
            </div>
            
            <!-- 日记条目列表 -->
            <div class="exchange-entries-list" id="entries-list" style="flex: 1; overflow-y: auto; margin-bottom: 15px;">
                ${diaryEntries.map((entry, index) => `
                    <div class="exchange-entry ${entry.author}" style="margin-bottom: 15px;">
                        <div style="display: flex; align-items: flex-start; gap: 10px; ${entry.author === 'user' ? 'flex-direction: row-reverse;' : ''}">
                            <div style="width: 36px; height: 36px; border-radius: 50%; background: ${entry.author === 'user' ? 'rgba(76,175,80,0.2)' : 'rgba(33,150,243,0.2)'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                ${entry.author === 'user' ? '✏️' : (contact && contact.avatar ? `<img src="${contact.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">` : '🤖')}
                            </div>
                            <div style="flex: 1; max-width: calc(100% - 50px); background: rgba(255,255,255,0.05); padding: 12px 15px; border-radius: 15px; border: 1px solid var(--glass-border); ${entry.author === 'user' ? 'border-bottom-right-radius: 4px;' : 'border-bottom-left-radius: 4px;'}">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                    <span style="font-weight: 600; font-size: 13px; color: ${entry.author === 'user' ? '#4CAF50' : '#2196F3'};">
                                        ${entry.author === 'user' ? userName : aiName}
                                    </span>
                                    <span style="font-size: 11px; color: var(--text-secondary);">
                                        ${formatDate(entry.date).split(' ')[0]}
                                    </span>
                                </div>
                                <div style="font-size: 14px; line-height: 1.7; white-space: pre-wrap; word-break: break-word;">${entry.content}</div>
                            </div>
                        </div>
                    </div>
                `).join('')}
                
                <!-- AI正在写的提示 -->
                <div class="exchange-entry ai" style="margin-bottom: 15px;">
                    <div style="display: flex; align-items: flex-start; gap: 10px;">
                        <div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(33,150,243,0.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            ${contact && contact.avatar ? `<img src="${contact.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">` : '🤖'}
                        </div>
                        <div style="flex: 1; max-width: calc(100% - 50px); background: rgba(255,255,255,0.05); padding: 12px 15px; border-radius: 15px; border: 1px solid var(--glass-border); border-bottom-left-radius: 4px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-weight: 600; font-size: 13px; color: #2196F3;">${aiName}</span>
                                <span style="font-size: 12px; color: var(--text-secondary);">正在写日记...</span>
                            </div>
                            <div style="margin-top: 10px; display: flex; gap: 4px;">
                                <span class="typing-dot" style="width: 8px; height: 8px; background: #2196F3; border-radius: 50%; animation: typingDot 1.4s infinite ease-in-out; animation-delay: 0s;"></span>
                                <span class="typing-dot" style="width: 8px; height: 8px; background: #2196F3; border-radius: 50%; animation: typingDot 1.4s infinite ease-in-out; animation-delay: 0.2s;"></span>
                                <span class="typing-dot" style="width: 8px; height: 8px; background: #2196F3; border-radius: 50%; animation: typingDot 1.4s infinite ease-in-out; animation-delay: 0.4s;"></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <style>
            @keyframes typingDot {
                0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
                40% { transform: scale(1); opacity: 1; }
            }
        </style>
    `;
    
    // 滚动到底部
    setTimeout(() => {
        const entriesList = document.getElementById('entries-list');
        if (entriesList) {
            entriesList.scrollTop = entriesList.scrollHeight;
        }
    }, 100);
    
    // 自动调用AI生成日记
    await generateAIEntry(diary, contact, persona, diaryEntries);
}

// 生成AI日记条目
async function generateAIEntry(diary, contact, persona, existingEntries) {
    const btn = document.getElementById('generate-ai-entry-btn');
    let originalText = '';
    if (btn) {
        originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '🤖 正在思考...';
    }
    
    try {
        // 获取设置
        const settings = await db.get(STORES.SETTINGS, 'ai_settings');
        if (!settings || !settings.presets || settings.presets.length === 0) {
            showToast('请先配置 API 设置');
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
            return;
        }
        
        // 使用交换日记专用API设置，如果没有设置或设置为"同主API"则使用主API
        let presetId = settings.exchangeDiaryPresetId;
        if (!presetId || presetId === 'same_as_main') {
            presetId = settings.mainPresetId || settings.activePresetId || settings.presets[0].id;
        }
        const activePreset = settings.presets.find(p => p.id === presetId) || settings.presets[0];
        
        if (!activePreset.apiKey) {
            showToast('请先配置 API Key');
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
            return;
        }
        
        // 从日记设置中获取参数，使用默认值作为fallback
        const temperature = diary.temperature !== undefined ? diary.temperature : 1.0;
        const includeChatHistory = diary.includeChatHistory !== undefined ? diary.includeChatHistory : true;
        const chatHistoryCount = diary.chatHistoryCount || 50;
        const includeMemory = diary.includeMemory !== undefined ? diary.includeMemory : true;
        const memoryCount = diary.memoryCount || 20;
        
        const userName = persona ? persona.name : '用户';
        const userDesc = persona ? persona.description : '';
        
        // 获取交换日记提示词
        const exchangeDiaryPrompt = await getExchangeDiaryPrompt();
        
        // 构建聊天记录文本
        let chatHistoryText = '';
        if (includeChatHistory && contact) {
            const sessions = await db.getAll(STORES.SESSIONS);
            const contactSessions = sessions.filter(s => s.contactId === contact.id);
            
            if (contactSessions.length > 0) {
                const recentSession = contactSessions.sort((a, b) =>
                    new Date(b.lastActive || b.createdAt) - new Date(a.lastActive || a.createdAt)
                )[0];
                const chatHistory = await db.getChatHistory(recentSession.id, true);
                const recentChats = chatHistory.slice(-chatHistoryCount);
                
                if (recentChats.length > 0) {
                    const chatLines = recentChats.map(msg => {
                        const sender = msg.sender === 'user' ? userName : contact.name;
                        return `${sender}: ${msg.content}`;
                    });
                    chatHistoryText = chatLines.join('\n');
                }
            }
        }
        
        // 构建记忆文本
        let memoryText = '';
        if (includeMemory && contact) {
            const memories = await db.getAll(STORES.MEMORIES);
            const contactMemories = memories
                .filter(m => m.contactId === contact.id)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, memoryCount);
            
            if (contactMemories.length > 0) {
                const memoryLines = contactMemories.map(m => `- ${m.content}`);
                memoryText = memoryLines.join('\n');
            }
        }
        
        // 获取当前日期时间
        const now = new Date();
        const currentDate = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().split(' ')[0];
        
        // 构建系统提示词
        let systemPrompt = exchangeDiaryPrompt;
        
        // 添加角色和用户信息
        systemPrompt += `\n\n以下是角色名称：${contact.name}`;
        systemPrompt += `\n以下是角色人设：${contact.description || '无特殊设定'}`;
        systemPrompt += `\n以下是用户名称：${userName}`;
        if (userDesc) {
            systemPrompt += `\n以下是用户人设：${userDesc}`;
        }
        systemPrompt += `\n当前系统日期是：${currentDate}`;
        systemPrompt += `\n当前系统时间为：${currentTime}`;
        
        // 添加记忆（如果有）
        if (memoryText) {
            systemPrompt += `\n\n以下是${contact.name}和${userName}的记忆：\n${memoryText}`;
        }
        
        // 添加聊天记录（如果有）
        if (chatHistoryText) {
            systemPrompt += `\n\n以下是${contact.name}和${userName}的聊天记录：\n${chatHistoryText}`;
        }
        
        // 构建messages数组，使用多轮对话格式
        const messages = [
            { role: 'system', content: systemPrompt }
        ];
        
        // 将已有日记条目转换为user/assistant消息
        for (const entry of existingEntries) {
            if (entry.author === 'user') {
                messages.push({
                    role: 'user',
                    content: entry.content
                });
            } else {
                messages.push({
                    role: 'assistant',
                    content: entry.content
                });
            }
        }
        
        // 如果最后一条是用户的日记，不需要额外添加提示
        // 如果没有条目或最后一条是AI的，添加一个触发提示
        if (existingEntries.length === 0 || existingEntries[existingEntries.length - 1].author === 'ai') {
            messages.push({
                role: 'user',
                content: '请写一篇今天的日记'
            });
        }

        const requestBody = {
            model: activePreset.model,
            messages: messages,
            temperature: temperature
        };

        await Logger.log(LOG_TYPES.API, {
            source: 'exchange_diary',
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
            source: 'exchange_diary',
            response: data
        });
        
        if (data.choices && data.choices[0]) {
            let aiContent = data.choices[0].message.content;
            
            // 清理可能的XML标签和多余空白
            aiContent = aiContent.replace(/<[^>]+>/g, '').trim();
            
            // 创建AI日记条目
            const aiEntry = {
                id: generateId(),
                diaryId: diary.id,
                author: 'ai',
                date: new Date().toISOString().split('T')[0],
                content: aiContent,
                createdAt: new Date().toISOString()
            };
            await db.put(STORES.EXCHANGE_DIARY_ENTRIES, aiEntry);
            
            // 更新轮次
            diary.currentTurn = 'user';
            diary.updatedAt = new Date().toISOString();
            await db.put(STORES.EXCHANGE_DIARIES, diary);
            
            showToast(`${contact.name}写好了日记`);
            renderExchangeDiaryDetail(diary.id);
        } else {
            throw new Error(data.error?.message || 'API 响应异常');
        }
    } catch (error) {
        console.error('生成AI日记失败:', error);
        await Logger.log(LOG_TYPES.ERROR, {
            source: 'exchange_diary',
            error: error.message
        });
        showToast('生成失败: ' + error.message);
        // 如果有按钮，恢复按钮状态
        const btn = document.getElementById('generate-ai-entry-btn');
        if (btn) {
            btn.disabled = false;
            btn.textContent = `🤖 让${contact.name}写日记`;
        }
        // 回退到正常页面
        renderExchangeDiaryDetail(diary.id);
    }
}
