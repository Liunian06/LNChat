/**
 * LNChat X应用模块 (类似Twitter/X的社交媒体)
 */

import { db, STORES } from '../db.js';
import { generateId, showToast, formatTime } from '../utils.js';

let container, headerActions;
let currentView = 'feed'; // 'feed', 'following', 'compose', 'profile'
let currentTab = 'forYou'; // 'forYou', 'following'

// 预设头像
const DEFAULT_AVATARS = [
    '👤', '😀', '🐱', '🐶', '🦊', '🐼', '🐨', '🐯', '🦁', '🐮'
];

// 生成随机用户名
function generateUsername() {
    const prefixes = ['cool', 'happy', 'smart', 'fast', 'bright', 'star', 'moon', 'sun'];
    const suffixes = ['user', 'coder', 'dev', 'gamer', 'lover', 'fan', 'pro', 'master'];
    const num = Math.floor(Math.random() * 1000);
    return `${prefixes[Math.floor(Math.random() * prefixes.length)]}${suffixes[Math.floor(Math.random() * suffixes.length)]}${num}`;
}

// 格式化时间为相对时间
function formatRelativeTime(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟`;
    if (diffHours < 24) return `${diffHours}小时`;
    if (diffDays < 7) return `${diffDays}天`;
    
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

// 格式化数字
function formatNumber(num) {
    if (num >= 10000) {
        return (num / 10000).toFixed(1) + '万';
    }
    return num.toString();
}

export async function init(target, actions) {
    container = target;
    headerActions = actions;
    currentView = 'feed';
    currentTab = 'forYou';
    
    // 初始化默认用户数据
    await initDefaultData();
    
    await renderFeed();
}

// 初始化默认数据
async function initDefaultData() {
    const users = await db.getAll(STORES.X_USERS);
    
    if (users.length === 0) {
        // 创建一些默认用户
        const defaultUsers = [
            {
                id: 'user_1',
                username: 'jianlvup',
                displayName: '简律（私信互关）',
                avatar: '',
                bio: '戏仿账号',
                verified: true,
                followers: 42300,
                following: 128,
                createdAt: new Date().toISOString()
            },
            {
                id: 'user_2',
                username: 'RockstarGames',
                displayName: 'Rockstar Games',
                avatar: '',
                bio: 'Official Rockstar Games account',
                verified: true,
                followers: 15200000,
                following: 23,
                createdAt: new Date().toISOString()
            },
            {
                id: 'user_me',
                username: 'me',
                displayName: '我',
                avatar: '',
                bio: '',
                verified: false,
                followers: 0,
                following: 0,
                createdAt: new Date().toISOString()
            }
        ];
        
        for (const user of defaultUsers) {
            await db.put(STORES.X_USERS, user);
        }
        
        // 创建一些示例帖子
        const defaultPosts = [
            {
                id: generateId(),
                userId: 'user_2',
                content: 'Status is everything. Take your rightful place amongst the city\'s elite with a lavish new mansion property.\n\nGTA Online: A Safehouse in the Hills, now available.',
                image: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
                likes: 15200,
                retweets: 2340,
                replies: 892,
                views: 2500000,
                createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            }
        ];
        
        for (const post of defaultPosts) {
            await db.put(STORES.X_POSTS, post);
        }
    }
}

// 渲染主页Feed
async function renderFeed() {
    currentView = 'feed';
    const posts = await db.getAll(STORES.X_POSTS);
    const users = await db.getAll(STORES.X_USERS);
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    
    // 按时间排序
    posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    window.lnChat.appTitle.innerHTML = `<span class="x-logo">𝕏</span>`;
    headerActions.innerHTML = `
        <span class="x-upgrade-btn">升级</span>
        <button class="x-menu-btn">⋮</button>
    `;
    
    // 返回按钮
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        window.lnChat.closeApp();
    };
    
    container.innerHTML = `
        <div class="x-container">
            <!-- 头部用户头像 -->
            <div class="x-header-avatar">
                <div class="x-avatar-small">👤</div>
            </div>
            
            <!-- 标签栏 -->
            <div class="x-tab-bar">
                <div class="x-tab ${currentTab === 'forYou' ? 'active' : ''}" data-tab="forYou">为你推荐</div>
                <div class="x-tab ${currentTab === 'following' ? 'active' : ''}" data-tab="following">正在关注</div>
            </div>
            
            <!-- 帖子列表 -->
            <div class="x-feed">
                ${posts.map(post => {
                    const user = userMap[post.userId] || { displayName: '未知用户', username: 'unknown' };
                    return renderPostCard(post, user);
                }).join('')}
            </div>
            
            <!-- 发帖按钮 -->
            <button class="x-fab" id="compose-btn">
                <span>+</span>
            </button>
            
            <!-- 底部导航 -->
            <div class="x-bottom-nav">
                <div class="x-nav-item active" data-view="home">
                    <span class="x-nav-icon">🏠</span>
                </div>
                <div class="x-nav-item" data-view="search">
                    <span class="x-nav-icon">🔍</span>
                </div>
                <div class="x-nav-item" data-view="grok">
                    <span class="x-nav-icon">✨</span>
                </div>
                <div class="x-nav-item" data-view="notifications">
                    <span class="x-nav-icon">🔔</span>
                    <span class="x-nav-badge">2</span>
                </div>
                <div class="x-nav-item" data-view="messages">
                    <span class="x-nav-icon">✉️</span>
                </div>
            </div>
        </div>
    `;
    
    // 绑定标签切换
    container.querySelectorAll('.x-tab').forEach(tab => {
        tab.onclick = () => {
            currentTab = tab.dataset.tab;
            renderFeed();
        };
    });
    
    // 绑定发帖按钮
    document.getElementById('compose-btn').onclick = () => {
        showComposeDialog();
    };
    
    // 绑定帖子交互
    container.querySelectorAll('.x-post-card').forEach(card => {
        card.onclick = (e) => {
            if (e.target.closest('.x-post-action')) {
                return; // 让操作按钮自己处理
            }
            const postId = card.dataset.id;
            showPostDetail(postId);
        };
    });
    
    // 绑定操作按钮
    container.querySelectorAll('.x-post-action').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            const postId = btn.closest('.x-post-card').dataset.id;
            await handlePostAction(action, postId);
        };
    });
    
    // 底部导航
    container.querySelectorAll('.x-nav-item').forEach(nav => {
        nav.onclick = () => {
            const view = nav.dataset.view;
            if (view === 'home') {
                renderFeed();
            } else {
                showToast('功能开发中');
            }
        };
    });
}

// 渲染帖子卡片
function renderPostCard(post, user) {
    return `
        <div class="x-post-card" data-id="${post.id}">
            <div class="x-post-avatar">
                ${user.avatar ? `<img src="${user.avatar}">` : '<span>👤</span>'}
            </div>
            <div class="x-post-content">
                <div class="x-post-header">
                    <span class="x-post-name">${user.displayName}</span>
                    ${user.verified ? '<span class="x-verified">✓</span>' : ''}
                    <span class="x-post-username">@${user.username}</span>
                    <span class="x-post-time">· ${formatRelativeTime(post.createdAt)}</span>
                    <button class="x-post-more">⋮</button>
                </div>
                <div class="x-post-text">${post.content}</div>
                ${post.quotedContent ? `
                    <div class="x-post-quote">
                        <div class="x-quote-content">${post.quotedContent}</div>
                    </div>
                ` : ''}
                ${post.image ? `
                    <div class="x-post-image">
                        <img src="${post.image}" alt="Post image">
                    </div>
                ` : ''}
                <div class="x-post-actions">
                    <button class="x-post-action" data-action="reply">
                        <span>💬</span>
                        <span>${post.replies || 0}</span>
                    </button>
                    <button class="x-post-action" data-action="retweet">
                        <span>🔁</span>
                        <span>${post.retweets || 0}</span>
                    </button>
                    <button class="x-post-action" data-action="like">
                        <span>❤️</span>
                        <span>${post.likes || 0}</span>
                    </button>
                    <button class="x-post-action" data-action="views">
                        <span>📊</span>
                        <span>${formatNumber(post.views || 0)}</span>
                    </button>
                    <button class="x-post-action" data-action="bookmark">
                        <span>🔖</span>
                    </button>
                    <button class="x-post-action" data-action="share">
                        <span>📤</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// 处理帖子操作
async function handlePostAction(action, postId) {
    const post = await db.get(STORES.X_POSTS, postId);
    if (!post) return;
    
    switch (action) {
        case 'like':
            post.likes = (post.likes || 0) + 1;
            post.liked = true;
            await db.put(STORES.X_POSTS, post);
            showToast('已点赞');
            renderFeed();
            break;
        case 'retweet':
            post.retweets = (post.retweets || 0) + 1;
            await db.put(STORES.X_POSTS, post);
            showToast('已转发');
            renderFeed();
            break;
        case 'reply':
            showReplyDialog(post);
            break;
        case 'bookmark':
            showToast('已收藏');
            break;
        case 'share':
            showToast('分享功能开发中');
            break;
        default:
            break;
    }
}

// 显示发帖对话框
function showComposeDialog() {
    const existingDialog = document.getElementById('x-compose-dialog');
    if (existingDialog) {
        document.body.removeChild(existingDialog);
    }
    
    const dialog = document.createElement('div');
    dialog.id = 'x-compose-dialog';
    dialog.className = 'x-dialog';
    dialog.innerHTML = `
        <div class="x-dialog-overlay"></div>
        <div class="x-dialog-content x-compose-content">
            <div class="x-compose-header">
                <button class="x-compose-cancel">取消</button>
                <button class="x-compose-post" id="post-btn">发帖</button>
            </div>
            <div class="x-compose-body">
                <div class="x-compose-avatar">👤</div>
                <textarea id="compose-text" class="x-compose-textarea" placeholder="有什么新鲜事？"></textarea>
            </div>
            <div class="x-compose-tools">
                <button class="x-compose-tool">🖼️</button>
                <button class="x-compose-tool">📊</button>
                <button class="x-compose-tool">😊</button>
                <button class="x-compose-tool">📍</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    const cancelBtn = dialog.querySelector('.x-compose-cancel');
    const overlay = dialog.querySelector('.x-dialog-overlay');
    const postBtn = document.getElementById('post-btn');
    
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
    
    postBtn.onclick = async () => {
        const content = document.getElementById('compose-text').value.trim();
        if (!content) {
            showToast('请输入内容');
            return;
        }
        
        const post = {
            id: generateId(),
            userId: 'user_me',
            content,
            likes: 0,
            retweets: 0,
            replies: 0,
            views: Math.floor(Math.random() * 100),
            createdAt: new Date().toISOString()
        };
        
        await db.put(STORES.X_POSTS, post);
        showToast('发帖成功');
        closeDialog();
        renderFeed();
    };
    
    requestAnimationFrame(() => {
        dialog.classList.add('visible');
        document.getElementById('compose-text').focus();
    });
}

// 显示回复对话框
function showReplyDialog(post) {
    const existingDialog = document.getElementById('x-reply-dialog');
    if (existingDialog) {
        document.body.removeChild(existingDialog);
    }
    
    const dialog = document.createElement('div');
    dialog.id = 'x-reply-dialog';
    dialog.className = 'x-dialog';
    dialog.innerHTML = `
        <div class="x-dialog-overlay"></div>
        <div class="x-dialog-content x-compose-content">
            <div class="x-compose-header">
                <button class="x-compose-cancel">取消</button>
                <button class="x-compose-post" id="reply-btn">回复</button>
            </div>
            <div class="x-reply-original">
                <div class="x-reply-content">${post.content.substring(0, 100)}${post.content.length > 100 ? '...' : ''}</div>
            </div>
            <div class="x-compose-body">
                <div class="x-compose-avatar">👤</div>
                <textarea id="reply-text" class="x-compose-textarea" placeholder="发布你的回复"></textarea>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    const cancelBtn = dialog.querySelector('.x-compose-cancel');
    const overlay = dialog.querySelector('.x-dialog-overlay');
    const replyBtn = document.getElementById('reply-btn');
    
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
    
    replyBtn.onclick = async () => {
        const content = document.getElementById('reply-text').value.trim();
        if (!content) {
            showToast('请输入回复内容');
            return;
        }
        
        // 增加回复数
        post.replies = (post.replies || 0) + 1;
        await db.put(STORES.X_POSTS, post);
        
        showToast('回复成功');
        closeDialog();
        renderFeed();
    };
    
    requestAnimationFrame(() => {
        dialog.classList.add('visible');
        document.getElementById('reply-text').focus();
    });
}

// 显示帖子详情
async function showPostDetail(postId) {
    const post = await db.get(STORES.X_POSTS, postId);
    if (!post) return;
    
    const users = await db.getAll(STORES.X_USERS);
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    const user = userMap[post.userId] || { displayName: '未知用户', username: 'unknown' };
    
    currentView = 'detail';
    
    window.lnChat.appTitle.textContent = '帖子';
    headerActions.innerHTML = '';
    
    // 返回按钮
    const originalBack = window.lnChat.backBtn.onclick;
    window.lnChat.backBtn.onclick = () => {
        window.lnChat.backBtn.onclick = originalBack;
        renderFeed();
    };
    
    container.innerHTML = `
        <div class="x-detail-view">
            <div class="x-post-detail">
                <div class="x-post-detail-header">
                    <div class="x-post-avatar">
                        ${user.avatar ? `<img src="${user.avatar}">` : '<span>👤</span>'}
                    </div>
                    <div class="x-post-user-info">
                        <div class="x-post-name">${user.displayName}</div>
                        <div class="x-post-username">@${user.username}</div>
                    </div>
                    <button class="x-follow-btn">关注</button>
                </div>
                <div class="x-post-detail-content">
                    <div class="x-post-text-large">${post.content}</div>
                    ${post.quotedContent ? `
                        <div class="x-post-quote">
                            <div class="x-quote-content">${post.quotedContent}</div>
                        </div>
                    ` : ''}
                    ${post.image ? `
                        <div class="x-post-image-large">
                            <img src="${post.image}" alt="Post image">
                        </div>
                    ` : ''}
                </div>
                <div class="x-post-detail-time">
                    ${new Date(post.createdAt).toLocaleString('zh-CN')}
                </div>
                <div class="x-post-detail-stats">
                    <span><strong>${formatNumber(post.retweets || 0)}</strong> 转发</span>
                    <span><strong>${formatNumber(post.likes || 0)}</strong> 喜欢</span>
                    <span><strong>${formatNumber(post.views || 0)}</strong> 查看</span>
                </div>
                <div class="x-post-actions x-post-actions-large">
                    <button class="x-post-action" data-action="reply">
                        <span>💬</span>
                    </button>
                    <button class="x-post-action" data-action="retweet">
                        <span>🔁</span>
                    </button>
                    <button class="x-post-action" data-action="like">
                        <span>❤️</span>
                    </button>
                    <button class="x-post-action" data-action="bookmark">
                        <span>🔖</span>
                    </button>
                    <button class="x-post-action" data-action="share">
                        <span>📤</span>
                    </button>
                </div>
            </div>
            
            <!-- 回复区域 -->
            <div class="x-replies-section">
                <div class="x-replies-header">回复</div>
                <div class="x-replies-empty">暂无回复</div>
            </div>
        </div>
    `;
    
    // 绑定操作按钮
    container.querySelectorAll('.x-post-action').forEach(btn => {
        btn.onclick = async () => {
            const action = btn.dataset.action;
            await handlePostAction(action, postId);
        };
    });
}