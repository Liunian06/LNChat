/**
 * LNChat 朋友圈模块 - 类微信朋友圈风格
 */

import { db, STORES } from '../db.js';
import { formatTime, generateId, showToast } from '../utils.js';

let container, headerActions;
let currentView = 'feed'; // 'feed', 'compose', 'detail'

// 格式化相对时间
function formatRelativeTime(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    
    return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export async function init(target, actions) {
    container = target;
    headerActions = actions;
    currentView = 'feed';
    
    await renderFeed();
}

// 渲染朋友圈主页
async function renderFeed() {
    currentView = 'feed';
    const moments = await db.getAll(STORES.MOMENTS);
    const contacts = await db.getAll(STORES.CONTACTS);
    const contactMap = Object.fromEntries(contacts.map(c => [c.id, c]));

    moments.sort((a, b) => new Date(b.date) - new Date(a.date));

    window.lnChat.appTitle.textContent = '朋友圈';
    headerActions.innerHTML = `
        <button id="camera-btn" class="moments-header-btn">📷</button>
    `;
    
    document.getElementById('camera-btn').onclick = () => showComposeDialog();

    // 返回按钮
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        window.lnChat.closeApp();
    };

    // 获取设置中的用户信息或使用默认值
    let coverImage = 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800';
    let userAvatar = '';
    let userName = '我';
    
    try {
        const settings = await db.get(STORES.SETTINGS, 'ai_settings');
        if (settings) {
            coverImage = settings.momentsCover || coverImage;
        }
        
        // 从用户设定中获取头像和名称
        const personas = await db.getAll(STORES.USER_PERSONAS);
        if (personas && personas.length > 0) {
            // 使用第一个用户设定的头像和名称
            const firstPersona = personas[0];
            if (firstPersona.avatar) {
                userAvatar = firstPersona.avatar;
            }
            if (firstPersona.name) {
                userName = firstPersona.name;
            }
        }
    } catch (e) {
        console.log('加载朋友圈设置失败');
    }

    container.innerHTML = `
        <div class="moments-container">
            <!-- 封面区域 -->
            <div class="moments-cover" style="background-image: url('${coverImage}');">
                <div class="moments-cover-overlay"></div>
                <div class="moments-profile">
                    <div class="moments-profile-info">
                        <span class="moments-profile-name">${userName}</span>
                    </div>
                    <div class="moments-profile-avatar">
                        ${userAvatar ? `<img src="${userAvatar}">` : '👤'}
                    </div>
                </div>
            </div>
            
            <!-- 动态列表 -->
            <div class="moments-feed">
                ${moments.length === 0 ? `
                    <div class="moments-empty">
                        <div class="moments-empty-icon">📷</div>
                        <p>还没有朋友圈动态</p>
                        <p class="moments-empty-hint">角色聊天时会自动发布动态</p>
                    </div>
                ` : moments.map(m => {
                    const contact = contactMap[m.contactId] || { name: '未知用户', avatar: '' };
                    return renderMomentCard(m, contact);
                }).join('')}
            </div>
        </div>
    `;
    
    // 绑定点赞和评论按钮事件
    container.querySelectorAll('.moments-action-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            const momentId = btn.closest('.moments-card').dataset.id;
            
            if (action === 'like') {
                await handleLike(momentId);
            } else if (action === 'comment') {
                showCommentDialog(momentId);
            }
        };
    });
    
    // 绑定卡片点击查看详情
    container.querySelectorAll('.moments-card').forEach(card => {
        card.onclick = (e) => {
            if (e.target.closest('.moments-action-btn') || e.target.closest('.moments-images')) {
                return;
            }
            const momentId = card.dataset.id;
            showMomentDetail(momentId);
        };
    });
    
    // 绑定图片点击预览
    container.querySelectorAll('.moments-image-item').forEach(img => {
        img.onclick = (e) => {
            e.stopPropagation();
            showImagePreview(img.querySelector('img').src);
        };
    });
}

// 渲染单条动态卡片
function renderMomentCard(moment, contact) {
    const likes = moment.likes || [];
    const comments = moment.comments || [];
    const images = moment.images || [];
    
    // 判断图片网格布局
    let imageGridClass = 'moments-images';
    if (images.length === 1) imageGridClass += ' single';
    else if (images.length === 2 || images.length === 4) imageGridClass += ' grid-2';
    else if (images.length >= 3) imageGridClass += ' grid-3';
    
    return `
        <div class="moments-card" data-id="${moment.id}">
            <div class="moments-card-avatar">
                ${contact.avatar ? `<img src="${contact.avatar}">` : '<span>👤</span>'}
            </div>
            <div class="moments-card-content">
                <div class="moments-card-header">
                    <span class="moments-card-name">${contact.name}</span>
                </div>
                <div class="moments-card-text">${moment.content}</div>
                
                ${images.length > 0 ? `
                    <div class="${imageGridClass}">
                        ${images.map(img => `
                            <div class="moments-image-item">
                                <img src="${img}" alt="moment image">
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                
                <div class="moments-card-footer">
                    <span class="moments-card-time">${formatRelativeTime(moment.date)}</span>
                    <div class="moments-card-actions">
                        <button class="moments-action-btn" data-action="like">
                            ${likes.length > 0 ? '❤️' : '🤍'} ${likes.length > 0 ? likes.length : ''}
                        </button>
                        <button class="moments-action-btn" data-action="comment">
                            💬 ${comments.length > 0 ? comments.length : ''}
                        </button>
                    </div>
                </div>
                
                ${(likes.length > 0 || comments.length > 0) ? `
                    <div class="moments-card-interactions">
                        ${likes.length > 0 ? `
                            <div class="moments-likes">
                                <span class="moments-likes-icon">❤️</span>
                                <span class="moments-likes-text">${likes.join('、')}</span>
                            </div>
                        ` : ''}
                        ${comments.length > 0 ? `
                            <div class="moments-comments">
                                ${comments.map(c => `
                                    <div class="moments-comment">
                                        <span class="moments-comment-author">${c.author}:</span>
                                        <span class="moments-comment-text">${c.text}</span>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// 处理点赞
async function handleLike(momentId) {
    const moment = await db.get(STORES.MOMENTS, momentId);
    if (!moment) return;
    
    if (!moment.likes) moment.likes = [];
    
    const userName = '我';
    const likeIndex = moment.likes.indexOf(userName);
    
    if (likeIndex > -1) {
        moment.likes.splice(likeIndex, 1);
    } else {
        moment.likes.push(userName);
    }
    
    await db.put(STORES.MOMENTS, moment);
    renderFeed();
}

// 显示评论对话框
function showCommentDialog(momentId) {
    const existingDialog = document.getElementById('comment-dialog');
    if (existingDialog) {
        document.body.removeChild(existingDialog);
    }
    
    const dialog = document.createElement('div');
    dialog.id = 'comment-dialog';
    dialog.className = 'moments-dialog';
    dialog.innerHTML = `
        <div class="moments-dialog-overlay"></div>
        <div class="moments-dialog-content moments-comment-dialog">
            <div class="moments-dialog-header">
                <h3>发表评论</h3>
                <button class="close-btn">×</button>
            </div>
            <div class="moments-dialog-body">
                <textarea id="comment-text" class="moments-comment-input" placeholder="写下你的评论..."></textarea>
            </div>
            <div class="moments-dialog-actions">
                <button class="cancel-btn" id="cancel-comment-btn">取消</button>
                <button class="save-btn" id="submit-comment-btn">发布</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    const closeBtn = dialog.querySelector('.close-btn');
    const overlay = dialog.querySelector('.moments-dialog-overlay');
    const cancelBtn = document.getElementById('cancel-comment-btn');
    const submitBtn = document.getElementById('submit-comment-btn');
    
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
    cancelBtn.onclick = closeDialog;
    
    submitBtn.onclick = async () => {
        const text = document.getElementById('comment-text').value.trim();
        if (!text) {
            showToast('请输入评论内容');
            return;
        }
        
        const moment = await db.get(STORES.MOMENTS, momentId);
        if (!moment) {
            showToast('动态不存在');
            closeDialog();
            return;
        }
        
        if (!moment.comments) moment.comments = [];
        moment.comments.push({
            author: '我',
            text: text,
            time: new Date().toISOString()
        });
        
        await db.put(STORES.MOMENTS, moment);
        showToast('评论成功');
        closeDialog();
        renderFeed();
    };
    
    requestAnimationFrame(() => {
        dialog.classList.add('visible');
        document.getElementById('comment-text').focus();
    });
}

// 显示发布动态对话框
function showComposeDialog() {
    const existingDialog = document.getElementById('compose-moment-dialog');
    if (existingDialog) {
        document.body.removeChild(existingDialog);
    }
    
    const dialog = document.createElement('div');
    dialog.id = 'compose-moment-dialog';
    dialog.className = 'moments-dialog';
    dialog.innerHTML = `
        <div class="moments-dialog-overlay"></div>
        <div class="moments-dialog-content moments-compose-dialog">
            <div class="moments-dialog-header">
                <button class="moments-compose-cancel">取消</button>
                <h3>发朋友圈</h3>
                <button class="moments-compose-submit" id="submit-moment-btn">发布</button>
            </div>
            <div class="moments-compose-body">
                <textarea id="moment-text" class="moments-compose-textarea" placeholder="这一刻的想法..."></textarea>
                <div class="moments-compose-images" id="compose-images"></div>
                <input type="file" id="image-input" accept="image/*" multiple style="display: none;">
            </div>
            <div class="moments-compose-tools">
                <button class="moments-compose-tool" id="add-image-btn">🖼️ 图片</button>
                <button class="moments-compose-tool" id="add-location-btn">📍 位置</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    const cancelBtn = dialog.querySelector('.moments-compose-cancel');
    const overlay = dialog.querySelector('.moments-dialog-overlay');
    const submitBtn = document.getElementById('submit-moment-btn');
    const addImageBtn = document.getElementById('add-image-btn');
    const imageInput = document.getElementById('image-input');
    const composeImages = document.getElementById('compose-images');
    
    let selectedImages = [];
    
    const closeDialog = () => {
        dialog.classList.remove('visible');
        setTimeout(() => {
            if (document.body.contains(dialog)) {
                document.body.removeChild(dialog);
            }
        }, 300);
    };
    
    cancelBtn.onclick = closeDialog;
    overlay.onclick = closeDialog;
    
    addImageBtn.onclick = () => {
        imageInput.click();
    };
    
    imageInput.onchange = (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
                selectedImages.push(event.target.result);
                updateImagePreview();
            };
            reader.readAsDataURL(file);
        });
    };
    
    function updateImagePreview() {
        composeImages.innerHTML = selectedImages.map((img, index) => `
            <div class="moments-compose-image-item">
                <img src="${img}">
                <button class="moments-compose-image-remove" data-index="${index}">×</button>
            </div>
        `).join('');
        
        composeImages.querySelectorAll('.moments-compose-image-remove').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                selectedImages.splice(index, 1);
                updateImagePreview();
            };
        });
    }
    
    submitBtn.onclick = async () => {
        const text = document.getElementById('moment-text').value.trim();
        if (!text && selectedImages.length === 0) {
            showToast('请输入内容或添加图片');
            return;
        }
        
        // 创建一个"我"的用户ID，如果不存在则创建
        let myContactId = 'user_me';
        let myContact = await db.get(STORES.CONTACTS, myContactId);
        if (!myContact) {
            myContact = {
                id: myContactId,
                name: '我',
                avatar: '',
                description: '用户本人'
            };
            await db.put(STORES.CONTACTS, myContact);
        }
        
        const moment = {
            id: generateId(),
            contactId: myContactId,
            content: text,
            images: selectedImages,
            date: new Date().toISOString(),
            likes: [],
            comments: []
        };
        
        await db.put(STORES.MOMENTS, moment);
        showToast('发布成功');
        closeDialog();
        renderFeed();
    };
    
    document.getElementById('add-location-btn').onclick = () => {
        showToast('位置功能开发中');
    };
    
    requestAnimationFrame(() => {
        dialog.classList.add('visible');
        document.getElementById('moment-text').focus();
    });
}

// 显示动态详情
async function showMomentDetail(momentId) {
    const moment = await db.get(STORES.MOMENTS, momentId);
    if (!moment) return;
    
    const contacts = await db.getAll(STORES.CONTACTS);
    const contactMap = Object.fromEntries(contacts.map(c => [c.id, c]));
    const contact = contactMap[moment.contactId] || { name: '未知用户', avatar: '' };
    
    currentView = 'detail';
    
    window.lnChat.appTitle.textContent = '详情';
    headerActions.innerHTML = '';
    
    // 返回按钮
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        renderFeed();
    };
    
    const images = moment.images || [];
    const likes = moment.likes || [];
    const comments = moment.comments || [];
    
    container.innerHTML = `
        <div class="moments-detail">
            <div class="moments-detail-header">
                <div class="moments-detail-avatar">
                    ${contact.avatar ? `<img src="${contact.avatar}">` : '<span>👤</span>'}
                </div>
                <div class="moments-detail-info">
                    <div class="moments-detail-name">${contact.name}</div>
                    <div class="moments-detail-time">${formatRelativeTime(moment.date)}</div>
                </div>
            </div>
            
            <div class="moments-detail-content">
                <div class="moments-detail-text">${moment.content}</div>
                
                ${images.length > 0 ? `
                    <div class="moments-detail-images">
                        ${images.map(img => `
                            <div class="moments-detail-image">
                                <img src="${img}" alt="moment image">
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
            
            <div class="moments-detail-stats">
                <div class="moments-detail-likes">
                    <span>❤️ ${likes.length} 赞</span>
                </div>
                <div class="moments-detail-comments">
                    <span>💬 ${comments.length} 评论</span>
                </div>
            </div>
            
            <div class="moments-detail-actions">
                <button class="moments-detail-action-btn" id="like-btn">
                    ${likes.includes('我') ? '❤️ 已赞' : '🤍 点赞'}
                </button>
                <button class="moments-detail-action-btn" id="comment-btn">
                    💬 评论
                </button>
            </div>
            
            ${comments.length > 0 ? `
                <div class="moments-detail-comment-list">
                    <h4>评论 (${comments.length})</h4>
                    ${comments.map(c => `
                        <div class="moments-detail-comment-item">
                            <div class="moments-detail-comment-avatar">👤</div>
                            <div class="moments-detail-comment-content">
                                <div class="moments-detail-comment-author">${c.author}</div>
                                <div class="moments-detail-comment-text">${c.text}</div>
                                <div class="moments-detail-comment-time">${formatRelativeTime(c.time)}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;
    
    // 绑定点赞按钮
    document.getElementById('like-btn').onclick = async () => {
        await handleLike(momentId);
        showMomentDetail(momentId);
    };
    
    // 绑定评论按钮
    document.getElementById('comment-btn').onclick = () => {
        showCommentDialog(momentId);
    };
    
    // 绑定图片预览
    container.querySelectorAll('.moments-detail-image img').forEach(img => {
        img.onclick = () => {
            showImagePreview(img.src);
        };
    });
}

// 显示图片预览
function showImagePreview(src) {
    const existingPreview = document.getElementById('image-preview');
    if (existingPreview) {
        document.body.removeChild(existingPreview);
    }
    
    const preview = document.createElement('div');
    preview.id = 'image-preview';
    preview.className = 'moments-image-preview';
    preview.innerHTML = `
        <div class="moments-image-preview-overlay"></div>
        <div class="moments-image-preview-content">
            <img src="${src}" alt="preview">
        </div>
        <button class="moments-image-preview-close">×</button>
    `;
    
    document.body.appendChild(preview);
    
    const closePreview = () => {
        preview.classList.remove('visible');
        setTimeout(() => {
            if (document.body.contains(preview)) {
                document.body.removeChild(preview);
            }
        }, 300);
    };
    
    preview.querySelector('.moments-image-preview-overlay').onclick = closePreview;
    preview.querySelector('.moments-image-preview-close').onclick = closePreview;
    
    requestAnimationFrame(() => {
        preview.classList.add('visible');
    });
}
