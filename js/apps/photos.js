/**
 * LNChat 相册模块
 * 
 * 功能：
 * - 创建相册
 * - 上传照片
 * - 查看照片
 * - 照片预览
 */

import { db, STORES } from '../db.js';
import { generateId, showToast } from '../utils.js';

let container, headerActions;
let appTitleEl = null;
let backBtnEl = null;
let originalBackHandler = null;
let currentView = 'albums'; // 'albums' | 'album-detail' | 'photo-view'
let currentAlbumId = null;
let currentPhotoIndex = 0;

// 默认相册封面颜色
const ALBUM_COLORS = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)'
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
    
    renderAlbums();
}

function handleBack() {
    if (currentView === 'album-detail') {
        currentView = 'albums';
        currentAlbumId = null;
        renderAlbums();
    } else if (currentView === 'photo-view') {
        currentView = 'album-detail';
        renderAlbumDetail(currentAlbumId);
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

// 获取所有相册
async function getAlbums() {
    try {
        const albums = await db.getAll(STORES.IMAGES);
        return albums.filter(item => item.type === 'album');
    } catch (e) {
        console.error('获取相册失败', e);
        return [];
    }
}

// 获取相册中的照片
async function getPhotos(albumId) {
    try {
        const photos = await db.getAll(STORES.IMAGES);
        return photos.filter(item => item.type === 'photo' && item.albumId === albumId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (e) {
        console.error('获取照片失败', e);
        return [];
    }
}

// 渲染相册列表
async function renderAlbums() {
    currentView = 'albums';
    updateTitle('相册');
    
    const albums = await getAlbums();
    
    headerActions.innerHTML = `
        <button class="add-btn" id="add-album-btn" title="创建相册">➕</button>
    `;
    
    // 获取每个相册的照片数量和封面
    const albumsWithInfo = await Promise.all(albums.map(async album => {
        const photos = await getPhotos(album.id);
        return {
            ...album,
            photoCount: photos.length,
            coverPhoto: photos[0] || null
        };
    }));
    
    container.innerHTML = `
        <div class="photos-container" style="padding: 20px;">
            ${albumsWithInfo.length > 0 ? `
                <div class="album-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                    ${albumsWithInfo.map(album => `
                        <div class="album-card" data-id="${album.id}" style="background: ${album.coverPhoto ? `url(${URL.createObjectURL(album.coverPhoto.blob)})` : album.color || ALBUM_COLORS[0]}; background-size: cover; background-position: center; border-radius: 16px; overflow: hidden; aspect-ratio: 1; cursor: pointer; position: relative; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.6) 100%);"></div>
                            <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 15px;">
                                <div style="font-size: 16px; font-weight: 600; color: white; text-shadow: 0 1px 3px rgba(0,0,0,0.5);">${album.name}</div>
                                <div style="font-size: 12px; color: rgba(255,255,255,0.8); margin-top: 4px;">${album.photoCount} 张照片</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <div class="empty-state">
                    <div class="empty-icon">📷</div>
                    <p>还没有相册</p>
                    <button id="create-first-album-btn" style="margin-top: 15px; padding: 12px 24px; background: var(--primary-color); border: none; border-radius: 20px; color: white; font-size: 14px; cursor: pointer;">
                        创建第一个相册
                    </button>
                </div>
            `}
        </div>
    `;
    
    // 绑定事件
    document.getElementById('add-album-btn')?.addEventListener('click', showCreateAlbumDialog);
    document.getElementById('create-first-album-btn')?.addEventListener('click', showCreateAlbumDialog);
    
    container.querySelectorAll('.album-card').forEach(card => {
        card.onclick = () => {
            currentAlbumId = card.dataset.id;
            renderAlbumDetail(currentAlbumId);
        };
    });
}

// 显示创建相册对话框
function showCreateAlbumDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'photos-dialog visible';
    dialog.innerHTML = `
        <div class="photos-dialog-overlay"></div>
        <div class="photos-dialog-content">
            <div class="photos-dialog-header">
                <h3>创建相册</h3>
                <button class="close-btn">×</button>
            </div>
            <div class="photos-dialog-body">
                <div class="input-group">
                    <label>相册名称</label>
                    <input type="text" id="album-name-input" placeholder="输入相册名称" maxlength="20">
                </div>
                <div style="margin-top: 15px;">
                    <label style="display: block; font-size: 14px; color: var(--text-secondary); margin-bottom: 10px;">选择封面颜色</label>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
                        ${ALBUM_COLORS.map((color, i) => `
                            <div class="album-color-option ${i === 0 ? 'selected' : ''}" data-color="${color}" style="background: ${color}; aspect-ratio: 1; border-radius: 12px; cursor: pointer; border: 3px solid ${i === 0 ? 'white' : 'transparent'}; transition: all 0.2s;"></div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="photos-dialog-actions">
                <button class="cancel-btn">取消</button>
                <button class="save-btn" id="create-album-confirm">创建</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    let selectedColor = ALBUM_COLORS[0];
    
    dialog.querySelectorAll('.album-color-option').forEach(opt => {
        opt.onclick = () => {
            dialog.querySelectorAll('.album-color-option').forEach(o => {
                o.style.borderColor = 'transparent';
                o.classList.remove('selected');
            });
            opt.style.borderColor = 'white';
            opt.classList.add('selected');
            selectedColor = opt.dataset.color;
        };
    });
    
    dialog.querySelector('.close-btn').onclick = () => dialog.remove();
    dialog.querySelector('.cancel-btn').onclick = () => dialog.remove();
    dialog.querySelector('.photos-dialog-overlay').onclick = () => dialog.remove();
    
    dialog.querySelector('#create-album-confirm').onclick = async () => {
        const name = document.getElementById('album-name-input').value.trim();
        if (!name) {
            showToast('请输入相册名称');
            return;
        }
        
        const album = {
            id: `album_${generateId()}`,
            type: 'album',
            name,
            color: selectedColor,
            createdAt: new Date().toISOString()
        };
        
        await db.put(STORES.IMAGES, album);
        showToast('相册创建成功');
        dialog.remove();
        renderAlbums();
    };
}

// 渲染相册详情
async function renderAlbumDetail(albumId) {
    currentView = 'album-detail';
    
    const album = await db.get(STORES.IMAGES, albumId);
    if (!album) {
        showToast('相册不存在');
        renderAlbums();
        return;
    }
    
    updateTitle(album.name);
    
    const photos = await getPhotos(albumId);
    
    headerActions.innerHTML = `
        <button class="add-btn" id="add-photo-btn" title="添加照片">📷</button>
        <button class="add-btn" id="delete-album-btn" title="删除相册" style="margin-left: 8px;">🗑️</button>
    `;
    
    container.innerHTML = `
        <div class="photos-container" style="padding: 20px;">
            ${photos.length > 0 ? `
                <div class="photo-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;">
                    ${photos.map((photo, index) => `
                        <div class="photo-item" data-index="${index}" style="aspect-ratio: 1; overflow: hidden; cursor: pointer;">
                            <img src="${URL.createObjectURL(photo.blob)}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s;">
                        </div>
                    `).join('')}
                </div>
            ` : `
                <div class="empty-state">
                    <div class="empty-icon">🖼️</div>
                    <p>相册是空的</p>
                    <button id="add-first-photo-btn" style="margin-top: 15px; padding: 12px 24px; background: var(--primary-color); border: none; border-radius: 20px; color: white; font-size: 14px; cursor: pointer;">
                        添加第一张照片
                    </button>
                </div>
            `}
        </div>
    `;
    
    // 绑定事件
    document.getElementById('add-photo-btn')?.addEventListener('click', () => showAddPhotoDialog(albumId));
    document.getElementById('add-first-photo-btn')?.addEventListener('click', () => showAddPhotoDialog(albumId));
    document.getElementById('delete-album-btn')?.addEventListener('click', async () => {
        if (confirm(`确定删除相册"${album.name}"吗？相册中的所有照片也将被删除。`)) {
            // 删除相册中的所有照片
            for (const photo of photos) {
                await db.delete(STORES.IMAGES, photo.id);
            }
            // 删除相册
            await db.delete(STORES.IMAGES, albumId);
            showToast('相册已删除');
            renderAlbums();
        }
    });
    
    container.querySelectorAll('.photo-item').forEach(item => {
        item.onclick = () => {
            currentPhotoIndex = parseInt(item.dataset.index);
            showPhotoViewer(photos, currentPhotoIndex);
        };
        
        item.onmouseenter = () => {
            item.querySelector('img').style.transform = 'scale(1.1)';
        };
        item.onmouseleave = () => {
            item.querySelector('img').style.transform = 'scale(1)';
        };
    });
}

// 显示添加照片对话框
function showAddPhotoDialog(albumId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    
    input.onchange = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        
        let addedCount = 0;
        
        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;
            
            const photo = {
                id: `photo_${generateId()}`,
                type: 'photo',
                albumId: albumId,
                name: file.name,
                blob: file,
                createdAt: new Date().toISOString()
            };
            
            await db.put(STORES.IMAGES, photo);
            addedCount++;
        }
        
        showToast(`成功添加 ${addedCount} 张照片`);
        renderAlbumDetail(albumId);
    };
    
    input.click();
}

// 显示照片查看器
function showPhotoViewer(photos, index) {
    currentView = 'photo-view';
    currentPhotoIndex = index;
    
    const viewer = document.createElement('div');
    viewer.className = 'photo-viewer';
    viewer.innerHTML = `
        <div class="photo-viewer-overlay"></div>
        <div class="photo-viewer-content">
            <button class="photo-viewer-close">×</button>
            <button class="photo-viewer-prev ${index === 0 ? 'hidden' : ''}">‹</button>
            <div class="photo-viewer-image-container">
                <img src="${URL.createObjectURL(photos[index].blob)}" class="photo-viewer-image">
            </div>
            <button class="photo-viewer-next ${index === photos.length - 1 ? 'hidden' : ''}">›</button>
            <div class="photo-viewer-info">
                <span class="photo-viewer-counter">${index + 1} / ${photos.length}</span>
                <button class="photo-viewer-delete" title="删除照片">🗑️</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(viewer);
    
    setTimeout(() => viewer.classList.add('visible'), 10);
    
    const closeViewer = () => {
        viewer.classList.remove('visible');
        setTimeout(() => {
            viewer.remove();
            currentView = 'album-detail';
        }, 300);
    };
    
    const updateViewer = (newIndex) => {
        if (newIndex < 0 || newIndex >= photos.length) return;
        currentPhotoIndex = newIndex;
        
        const img = viewer.querySelector('.photo-viewer-image');
        img.src = URL.createObjectURL(photos[newIndex].blob);
        
        viewer.querySelector('.photo-viewer-counter').textContent = `${newIndex + 1} / ${photos.length}`;
        viewer.querySelector('.photo-viewer-prev').classList.toggle('hidden', newIndex === 0);
        viewer.querySelector('.photo-viewer-next').classList.toggle('hidden', newIndex === photos.length - 1);
    };
    
    viewer.querySelector('.photo-viewer-overlay').onclick = closeViewer;
    viewer.querySelector('.photo-viewer-close').onclick = closeViewer;
    
    viewer.querySelector('.photo-viewer-prev').onclick = () => updateViewer(currentPhotoIndex - 1);
    viewer.querySelector('.photo-viewer-next').onclick = () => updateViewer(currentPhotoIndex + 1);
    
    viewer.querySelector('.photo-viewer-delete').onclick = async () => {
        if (confirm('确定删除这张照片吗？')) {
            await db.delete(STORES.IMAGES, photos[currentPhotoIndex].id);
            showToast('照片已删除');
            closeViewer();
            renderAlbumDetail(currentAlbumId);
        }
    };
    
    // 键盘导航
    const handleKeydown = (e) => {
        if (e.key === 'ArrowLeft') updateViewer(currentPhotoIndex - 1);
        if (e.key === 'ArrowRight') updateViewer(currentPhotoIndex + 1);
        if (e.key === 'Escape') closeViewer();
    };
    
    document.addEventListener('keydown', handleKeydown);
    
    // 清理键盘监听
    viewer.addEventListener('remove', () => {
        document.removeEventListener('keydown', handleKeydown);
    });
}

export function cleanup() {
    if (backBtnEl && originalBackHandler) {
        backBtnEl.onclick = originalBackHandler;
    }
    
    currentView = 'albums';
    currentAlbumId = null;
    currentPhotoIndex = 0;
    appTitleEl = null;
    backBtnEl = null;
    originalBackHandler = null;
}