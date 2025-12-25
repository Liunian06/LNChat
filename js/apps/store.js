
/**
 * LNChat 商城模块 - 电商风格版
 * 
 * 功能：
 * - 瀑布式双列商品列表
 * - 预制商品图片和信息
 * - 购物车功能
 * - 商品搜索
 * - 分类筛选
 */

import { db, STORES } from '../db.js';
import { generateId, showToast } from '../utils.js';
import { spendCoins, getBalance } from './wallet.js';

let container, headerActions;
let appTitleEl = null;
let backBtnEl = null;
let originalBackHandler = null;
let currentView = 'main'; // 'main' | 'detail' | 'cart' | 'search'
let currentProductId = null;
let cart = [];
let searchKeyword = '';
let selectedCategory = 'all';

// 货币符号
const CURRENCY = '¥';

// 商品分类
const CATEGORIES = [
    { id: 'all', name: '全部', icon: '🏠' },
    { id: 'electronics', name: '数码', icon: '📱' },
    { id: 'clothing', name: '服饰', icon: '👕' },
    { id: 'food', name: '美食', icon: '🍜' },
    { id: 'beauty', name: '美妆', icon: '💄' },
    { id: 'home', name: '家居', icon: '🏡' },
    { id: 'books', name: '图书', icon: '📚' },
    { id: 'toys', name: '玩具', icon: '🧸' }
];

// 预制商品数据
const PRODUCTS = [
    // 数码类
    { id: 'p001', name: '无线蓝牙耳机 降噪长续航', category: 'electronics', price: 299, originalPrice: 399, sales: 12580, rating: 4.8, image: 'https://picsum.photos/seed/earphone/400/400', tags: ['热销', '新品'] },
    { id: 'p002', name: '智能手表 运动健康监测', category: 'electronics', price: 599, originalPrice: 799, sales: 8956, rating: 4.7, image: 'https://picsum.photos/seed/watch/400/400', tags: ['智能'] },
    { id: 'p003', name: '便携充电宝 20000mAh', category: 'electronics', price: 129, originalPrice: 169, sales: 25680, rating: 4.9, image: 'https://picsum.photos/seed/powerbank/400/400', tags: ['爆款'] },
    { id: 'p004', name: '机械键盘 青轴RGB背光', category: 'electronics', price: 259, originalPrice: 329, sales: 6789, rating: 4.6, image: 'https://picsum.photos/seed/keyboard/400/400', tags: [] },
    { id: 'p005', name: '无线鼠标 静音办公', category: 'electronics', price: 79, originalPrice: 99, sales: 18956, rating: 4.5, image: 'https://picsum.photos/seed/mouse/400/400', tags: ['办公'] },
    // 服饰类
    { id: 'p006', name: '纯棉T恤 简约百搭', category: 'clothing', price: 69, originalPrice: 99, sales: 35680, rating: 4.7, image: 'https://picsum.photos/seed/tshirt/400/400', tags: ['热销'] },
    { id: 'p007', name: '牛仔裤 修身显瘦', category: 'clothing', price: 159, originalPrice: 219, sales: 15680, rating: 4.6, image: 'https://picsum.photos/seed/jeans/400/400', tags: [] },
    { id: 'p008', name: '运动卫衣 加绒保暖', category: 'clothing', price: 189, originalPrice: 259, sales: 9856, rating: 4.8, image: 'https://picsum.photos/seed/hoodie/400/400', tags: ['冬季'] },
    { id: 'p009', name: '羽绒服 轻薄防寒', category: 'clothing', price: 499, originalPrice: 699, sales: 6523, rating: 4.9, image: 'https://picsum.photos/seed/jacket/400/400', tags: ['新品'] },
    { id: 'p010', name: '休闲运动鞋 透气舒适', category: 'clothing', price: 239, originalPrice: 329, sales: 12356, rating: 4.7, image: 'https://picsum.photos/seed/shoes/400/400', tags: ['爆款'] },
    // 美食类
    { id: 'p011', name: '坚果礼盒 每日混合装', category: 'food', price: 89, originalPrice: 128, sales: 45680, rating: 4.8, image: 'https://picsum.photos/seed/nuts/400/400', tags: ['热销', '年货'] },
    { id: 'p012', name: '巧克力礼盒 进口原料', category: 'food', price: 128, originalPrice: 168, sales: 8956, rating: 4.7, image: 'https://picsum.photos/seed/chocolate/400/400', tags: ['送礼'] },
    { id: 'p013', name: '零食大礼包 网红爆款', category: 'food', price: 59, originalPrice: 89, sales: 65890, rating: 4.6, image: 'https://picsum.photos/seed/snacks/400/400', tags: ['爆款'] },
    { id: 'p014', name: '蜂蜜柚子茶 冲饮必备', category: 'food', price: 35, originalPrice: 49, sales: 23560, rating: 4.5, image: 'https://picsum.photos/seed/tea/400/400', tags: [] },
    { id: 'p015', name: '进口牛排套餐 原切新鲜', category: 'food', price: 199, originalPrice: 299, sales: 5623, rating: 4.9, image: 'https://picsum.photos/seed/steak/400/400', tags: ['优选'] },
    // 美妆类
    { id: 'p016', name: '口红套装 滋润持久', category: 'beauty', price: 159, originalPrice: 229, sales: 18956, rating: 4.7, image: 'https://picsum.photos/seed/lipstick/400/400', tags: ['热销'] },
    { id: 'p017', name: '护肤套装 补水保湿', category: 'beauty', price: 299, originalPrice: 399, sales: 9856, rating: 4.8, image: 'https://picsum.photos/seed/skincare/400/400', tags: ['套装'] },
    { id: 'p018', name: '眼影盘 大地色系', category: 'beauty', price: 89, originalPrice: 129, sales: 12356, rating: 4.6, image: 'https://picsum.photos/seed/eyeshadow/400/400', tags: [] },
    { id: 'p019', name: '香水 清新花香', category: 'beauty', price: 259, originalPrice: 359, sales: 6589, rating: 4.9, image: 'https://picsum.photos/seed/perfume/400/400', tags: ['新品'] },
    { id: 'p020', name: '面膜 补水修复 10片装', category: 'beauty', price: 69, originalPrice: 99, sales: 35680, rating: 4.7, image: 'https://picsum.photos/seed/mask/400/400', tags: ['爆款'] },
    // 家居类
    { id: 'p021', name: '四件套 纯棉亲肤', category: 'home', price: 199, originalPrice: 299, sales: 15680, rating: 4.8, image: 'https://picsum.photos/seed/bedding/400/400', tags: ['热销'] },
    { id: 'p022', name: '收纳盒 多功能整理', category: 'home', price: 39, originalPrice: 59, sales: 45680, rating: 4.6, image: 'https://picsum.photos/seed/storage/400/400', tags: [] },
    { id: 'p023', name: '台灯 护眼阅读', category: 'home', price: 129, originalPrice: 179, sales: 8956, rating: 4.7, image: 'https://picsum.photos/seed/lamp/400/400', tags: ['护眼'] },
    { id: 'p024', name: '保温杯 316不锈钢', category: 'home', price: 89, originalPrice: 129, sales: 25680, rating: 4.8, image: 'https://picsum.photos/seed/bottle/400/400', tags: ['爆款'] },
    { id: 'p025', name: '空气加湿器 静音大容量', category: 'home', price: 159, originalPrice: 219, sales: 6589, rating: 4.5, image: 'https://picsum.photos/seed/humidifier/400/400', tags: ['冬季'] },
    // 图书类
    { id: 'p026', name: '畅销小说 经典文学', category: 'books', price: 35, originalPrice: 49, sales: 12580, rating: 4.9, image: 'https://picsum.photos/seed/novel/400/400', tags: ['热销'] },
    { id: 'p027', name: '编程入门 Python基础', category: 'books', price: 59, originalPrice: 79, sales: 8956, rating: 4.8, image: 'https://picsum.photos/seed/programming/400/400', tags: ['学习'] },
    { id: 'p028', name: '心理学入门 通俗易懂', category: 'books', price: 45, originalPrice: 65, sales: 9856, rating: 4.7, image: 'https://picsum.photos/seed/psychology/400/400', tags: [] },
    { id: 'p029', name: '儿童绘本 精装彩印', category: 'books', price: 29, originalPrice: 45, sales: 35680, rating: 4.9, image: 'https://picsum.photos/seed/kids/400/400', tags: ['童书'] },
    { id: 'p030', name: '职场提升 成功学', category: 'books', price: 49, originalPrice: 69, sales: 6589, rating: 4.6, image: 'https://picsum.photos/seed/business/400/400', tags: [] },
    // 玩具类
    { id: 'p031', name: '积木套装 创意拼装', category: 'toys', price: 129, originalPrice: 189, sales: 15680, rating: 4.8, image: 'https://picsum.photos/seed/blocks/400/400', tags: ['热销'] },
    { id: 'p032', name: '遥控汽车 高速越野', category: 'toys', price: 199, originalPrice: 279, sales: 8956, rating: 4.7, image: 'https://picsum.photos/seed/rccar/400/400', tags: ['男孩'] },
    { id: 'p033', name: '毛绒玩偶 可爱公仔', category: 'toys', price: 69, originalPrice: 99, sales: 25680, rating: 4.9, image: 'https://picsum.photos/seed/plush/400/400', tags: ['爆款'] },
    { id: 'p034', name: '拼图 1000片 风景', category: 'toys', price: 49, originalPrice: 69, sales: 6589, rating: 4.6, image: 'https://picsum.photos/seed/puzzle/400/400', tags: [] },
    { id: 'p035', name: '芭比娃娃 豪华套装', category: 'toys', price: 159, originalPrice: 229, sales: 9856, rating: 4.8, image: 'https://picsum.photos/seed/doll/400/400', tags: ['女孩'] }
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
    
    await loadCart();
    renderMain();
}

function handleBack() {
    if (currentView === 'detail') {
        currentView = 'main';
        currentProductId = null;
        renderMain();
    } else if (currentView === 'cart' || currentView === 'search') {
        currentView = 'main';
        renderMain();
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

async function loadCart() {
    try {
        const settings = await db.get(STORES.SETTINGS, 'shopping_cart');
        cart = settings?.items || [];
    } catch (e) {
        cart = [];
    }
}

async function saveCart() {
    await db.put(STORES.SETTINGS, {
        key: 'shopping_cart',
        items: cart
    });
}

async function addToCart(productId, quantity = 1) {
    const product = PRODUCTS.find(p => p.id === productId);
    if (!product) return;
    
    const existingItem = cart.find(item => item.productId === productId);
    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        cart.push({ productId, quantity });
    }
    
    await saveCart();
    showToast('已添加到购物车');
    updateCartBadge();
}

async function updateCartQuantity(productId, quantity) {
    const item = cart.find(i => i.productId === productId);
    if (item) {
        if (quantity <= 0) {
            cart = cart.filter(i => i.productId !== productId);
        } else {
            item.quantity = quantity;
        }
        await saveCart();
    }
}

function getCartCount() {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
}

function getCartTotal() {
    return cart.reduce((sum, item) => {
        const product = PRODUCTS.find(p => p.id === item.productId);
        return sum + (product ? product.price * item.quantity : 0);
    }, 0);
}

function updateCartBadge() {
    const badge = document.getElementById('cart-badge');
    const count = getCartCount();
    if (badge) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

function formatSales(sales) {
    if (sales >= 10000) {
        return (sales / 10000).toFixed(1) + '万';
    }
    return sales.toString();
}

function getFilteredProducts() {
    let products = [...PRODUCTS];
    
    if (selectedCategory !== 'all') {
        products = products.filter(p => p.category === selectedCategory);
    }
    
    if (searchKeyword) {
        const keyword = searchKeyword.toLowerCase();
        products = products.filter(p => p.name.toLowerCase().includes(keyword));
    }
    
    return products;
}

async function renderMain() {
    currentView = 'main';
    updateTitle('商城');
    
    const products = getFilteredProducts();
    const balance = await getBalance();
    
    headerActions.innerHTML = `
        <button class="add-btn" id="search-btn" title="搜索">🔍</button>
        <button class="add-btn" id="cart-btn" title="购物车" style="margin-left: 8px; position: relative;">
            🛒
            <span id="cart-badge" style="position: absolute; top: -5px; right: -5px; background: #f44336; color: white; font-size: 10px; min-width: 16px; height: 16px; border-radius: 8px; display: ${getCartCount() > 0 ? 'flex' : 'none'}; align-items: center; justify-content: center;">${getCartCount()}</span>
        </button>
    `;
    
    const leftColumn = [];
    const rightColumn = [];
    let leftHeight = 0;
    let rightHeight = 0;
    
    products.forEach((product) => {
        const estimatedHeight = 280 + (product.tags.length > 0 ? 20 : 0);
        if (leftHeight <= rightHeight) {
            leftColumn.push(product);
            leftHeight += estimatedHeight;
        } else {
            rightColumn.push(product);
            rightHeight += estimatedHeight;
        }
    });
    
    container.innerHTML = `
        <div class="store-container" style="display: flex; flex-direction: column; height: 100%; background: #f5f5f5;">
            <div style="padding: 10px 15px; background: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%);">
                <div style="display: flex; align-items: center; gap: 10px; background: white; border-radius: 20px; padding: 8px 15px; cursor: pointer;" id="search-bar">
                    <span style="color: #999;">🔍</span>
                    <span style="color: #999; font-size: 14px;">${searchKeyword || '搜索商品'}</span>
                </div>
            </div>
            
            <div style="background: white; padding: 10px 0; overflow-x: auto; white-space: nowrap; border-bottom: 1px solid #eee;">
                ${CATEGORIES.map(cat => `
                    <button class="store-category-btn" data-category="${cat.id}" style="display: inline-flex; flex-direction: column; align-items: center; padding: 8px 15px; background: none; border: none; cursor: pointer;">
                        <span style="font-size: 20px; margin-bottom: 4px;">${cat.icon}</span>
                        <span style="font-size: 11px; color: ${cat.id === selectedCategory ? '#FF6B6B' : '#666'}; font-weight: ${cat.id === selectedCategory ? 'bold' : 'normal'};">${cat.name}</span>
                    </button>
                `).join('')}
            </div>
            
            <div style="flex: 1; overflow-y: auto; padding: 10px;">
                ${products.length > 0 ? `
                    <div style="display: flex; gap: 10px;">
                        <div style="flex: 1; display: flex; flex-direction: column; gap: 10px;">
                            ${leftColumn.map(product => renderProductCard(product)).join('')}
                        </div>
                        <div style="flex: 1; display: flex; flex-direction: column; gap: 10px;">
                            ${rightColumn.map(product => renderProductCard(product)).join('')}
                        </div>
                    </div>
                ` : `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; color: #999;">
                        <div style="font-size: 48px; margin-bottom: 15px;">🔍</div>
                        <div>没有找到相关商品</div>
                    </div>
                `}
            </div>
            
            <div style="padding: 12px 15px; background: white; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="color: #666; font-size: 13px;">余额:</span>
                    <span style="color: #FF6B6B; font-size: 18px; font-weight: bold;">${CURRENCY}${balance.toLocaleString()}</span>
                </div>
                <button id="goto-wallet-btn" style="padding: 8px 16px; background: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%); border: none; border-radius: 16px; color: white; font-size: 13px; cursor: pointer;">
                    去充值
                </button>
            </div>
        </div>
    `;
    
    document.getElementById('search-btn').onclick = () => renderSearch();
    document.getElementById('search-bar').onclick = () => renderSearch();
    document.getElementById('cart-btn').onclick = () => renderCart();
    document.getElementById('goto-wallet-btn').onclick = () => {
        if (window.lnChat && window.lnChat.openApp) {
            window.lnChat.closeApp();
            setTimeout(() => window.lnChat.openApp('wallet'), 100);
        }
    };
    
    container.querySelectorAll('.store-category-btn').forEach(btn => {
        btn.onclick = () => {
            selectedCategory = btn.dataset.category;
            renderMain();
        };
    });
    
    container.querySelectorAll('.product-card').forEach(card => {
        card.onclick = () => {
            currentProductId = card.dataset.id;
            renderDetail(currentProductId);
        };
    });
}

function renderProductCard(product) {
    const discount = Math.round((1 - product.price / product.originalPrice) * 100);
    
    return `
        <div class="product-card" data-id="${product.id}" style="background: white; border-radius: 12px; overflow: hidden; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
            <div style="position: relative;">
                <img src="${product.image}" style="width: 100%; aspect-ratio: 1; object-fit: cover;" onerror="this.src='https://via.placeholder.com/200?text=商品'">
                ${product.tags.length > 0 ? `
                    <div style="position: absolute; top: 8px; left: 8px; display: flex; gap: 4px;">
                        ${product.tags.slice(0, 2).map(tag => `
                            <span style="padding: 2px 6px; background: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%); color: white; font-size: 10px; border-radius: 4px;">${tag}</span>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
            <div style="padding: 10px;">
                <div style="font-size: 13px; color: #333; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 36px;">${product.name}</div>
                <div style="display: flex; align-items: baseline; gap: 5px; margin-top: 8px;">
                    <span style="color: #FF6B6B; font-size: 16px; font-weight: bold;">${CURRENCY}${product.price}</span>
                    <span style="color: #999; font-size: 11px; text-decoration: line-through;">${CURRENCY}${product.originalPrice}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                    <span style="color: #999; font-size: 11px;">${formatSales(product.sales)}人付款</span>
                    <span style="color: #FF9800; font-size: 11px;">⭐${product.rating}</span>
                </div>
            </div>
        </div>
    `;
}

async function renderDetail(productId) {
    currentView = 'detail';
    
    const product = PRODUCTS.find(p => p.id === productId);
    if (!product) {
        showToast('商品不存在');
        renderMain();
        return;
    }
    
    updateTitle('商品详情');
    
    const balance = await getBalance();
    const canAfford = balance >= product.price;
    const category = CATEGORIES.find(c => c.id === product.category);
    
    headerActions.innerHTML = `
        <button class="add-btn" id="cart-btn-detail" title="购物车" style="position: relative;">
            🛒
            <span id="cart-badge" style="position: absolute; top: -5px; right: -5px; background: #f44336; color: white; font-size: 10px; min-width: 16px; height: 16px; border-radius: 8px; display: ${getCartCount() > 0 ? 'flex' : 'none'}; align-items: center; justify-content: center;">${getCartCount()}</span>
        </button>
    `;
    
    container.innerHTML = `
        <div class="product-detail" style="display: flex; flex-direction: column; height: 100%; background: #f5f5f5;">
            <div style="background: white;">
                <img src="${product.image}" style="width: 100%; aspect-ratio: 1; object-fit: cover;" onerror="this.src='https://via.placeholder.com/400?text=商品图片'">
            </div>
            
            <div style="flex: 1; overflow-y: auto;">
                <div style="background: white; padding: 15px; margin-bottom: 10px;">
                    <div style="display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px;">
                        <span style="color: #FF6B6B; font-size: 28px; font-weight: bold;">${CURRENCY}${product.price}</span>
                        <span style="color: #999; font-size: 14px; text-decoration: line-through;">${CURRENCY}${product.originalPrice}</span>
                        <span style="color: white; font-size: 12px; padding: 2px 8px; background: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%); border-radius: 4px;">省${CURRENCY}${product.originalPrice - product.price}</span>
                    </div>
                    <div style="font-size: 16px; color: #333; font-weight: 500; line-height: 1.5; margin-bottom: 10px;">${product.name}</div>
                    <div style="display: flex; gap: 15px; color: #999; font-size: 13px;">
                        <span>⭐ ${product.rating} 好评</span>
                        <span>${formatSales(product.sales)}人付款</span>
                        <span>${category?.name || '其他'}</span>
                    </div>
                </div>
                
                <div style="background: white; padding: 15px; margin-bottom: 10px;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                        <span style="color: #FF6B6B; font-size: 12px; padding: 2px 6px; border: 1px solid #FF6B6B; border-radius: 3px;">满减</span>
                        <span style="color: #666; font-size: 13px;">满199减20，满399减50</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="color: #4CAF50; font-size: 12px; padding: 2px 6px; border: 1px solid #4CAF50; border-radius: 3px;">包邮</span>
                        <span style="color: #666; font-size: 13px;">全国包邮（偏远地区除外）</span>
                    </div>
                </div>
                
                <div style="background: white; padding: 15px;">
                    <div style="font-size: 14px; font-weight: 500; color: #333; margin-bottom: 15px;">商品评价 (${Math.floor(product.sales * 0.3)})</div>
                    <div style="display: flex; flex-direction: column; gap: 15px;">
                        <div style="display: flex; gap: 10px;">
                            <div style="width: 36px; height: 36px; border-radius: 50%; background: #eee; display: flex; align-items: center; justify-content: center;">👤</div>
                            <div style="flex: 1;">
                                <div style="font-size: 13px; color: #333; margin-bottom: 4px;">用户***${Math.floor(Math.random() * 1000)}</div>
                                <div style="font-size: 12px; color: #FF9800; margin-bottom: 6px;">⭐⭐⭐⭐⭐</div>
                                <div style="font-size: 13px; color: #666; line-height: 1.5;">质量很好，物流也快，非常满意！</div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 10px;">
                            <div style="width: 36px; height: 36px; border-radius: 50%; background: #eee; display: flex; align-items: center; justify-content: center;">👤</div>
                            <div style="flex: 1;">
                                <div style="font-size: 13px; color: #333; margin-bottom: 4px;">用户***${Math.floor(Math.random() * 1000)}</div>
                                <div style="font-size: 12px; color: #FF9800; margin-bottom: 6px;">⭐⭐⭐⭐</div>
                                <div style="font-size: 13px; color: #666; line-height: 1.5;">性价比很高，推荐购买！</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div style="padding: 12px 15px; background: white; border-top: 1px solid #eee; display: flex; gap: 10px;">
                <button id="add-to-cart-btn" style="flex: 1; padding: 12px; background: #FF9800; border: none; border-radius: 20px; color: white; font-size: 14px; font-weight: 500; cursor: pointer;">
                    加入购物车
                </button>
                <button id="buy-now-btn" style="flex: 1; padding: 12px; background: ${canAfford ? 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)' : '#ccc'}; border: none; border-radius: 20px; color: white; font-size: 14px; font-weight: 500; cursor: ${canAfford ? 'pointer' : 'not-allowed'};">
                    ${canAfford ? '立即购买' : '余额不足'}
                </button>
            </div>
        </div>
    `;
    
    document.getElementById('cart-btn-detail').onclick = () => renderCart();
    
    document.getElementById('add-to-cart-btn').onclick = async () => {
        await addToCart(productId);
        updateCartBadge();
    };
    
    document.getElementById('buy-now-btn').onclick = async () => {
        if (!canAfford) {
            showToast('余额不足，请先充值');
            return;
        }
        
        const result = await spendCoins(product.price, '购买商品', product.name);
        if (result.success) {
            showToast('购买成功！');
            renderMain();
        } else {
            showToast(result.message || '购买失败');
        }
    };
}

async function renderSearch() {
    currentView = 'search';
    updateTitle('搜索');
    
    headerActions.innerHTML = '';
    
    container.innerHTML = `
        <div style="display: flex; flex-direction: column; height: 100%; background: #f5f5f5;">
            <div style="padding: 15px; background: white; border-bottom: 1px solid #eee;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="flex: 1; display: flex; align-items: center; gap: 10px; background: #f5f5f5; border-radius: 20px; padding: 10px 15px;">
                        <span style="color: #999;">🔍</span>
                        <input type="text" id="search-input" placeholder="搜索商品" value="${searchKeyword}" style="flex: 1; background: transparent; border: none; font-size: 14px; outline: none; color: #333;">
                        ${searchKeyword ? '<button id="clear-search" style="background: none; border: none; color: #999; cursor: pointer;">✕</button>' : ''}
                    </div>
                    <button id="do-search-btn" style="background: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%); border: none; border-radius: 16px; padding: 10px 16px; color: white; font-size: 14px; cursor: pointer;">搜索</button>
                </div>
            </div>
            
            <div style="flex: 1; overflow-y: auto; padding: 15px;">
                <div style="font-size: 14px; color: #666; margin-bottom: 15px;">热门搜索</div>
                <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                    ${['耳机', '手表', 'T恤', '零食', '面膜', '保温杯', '小说', '积木'].map(kw => `
                        <button class="hot-keyword" data-keyword="${kw}" style="padding: 8px 16px; background: white; border: 1px solid #eee; border-radius: 16px; color: #666; font-size: 13px; cursor: pointer;">${kw}</button>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    const searchInput = document.getElementById('search-input');
    searchInput.focus();
    
    const doSearch = () => {
        searchKeyword = searchInput.value.trim();
        renderMain();
    };
    
    document.getElementById('do-search-btn').onclick = doSearch;
    searchInput.onkeypress = (e) => {
        if (e.key === 'Enter') doSearch();
    };
    
    document.getElementById('clear-search')?.addEventListener('click', () => {
        searchKeyword = '';
        searchInput.value = '';
        searchInput.focus();
    });
    
    container.querySelectorAll('.hot-keyword').forEach(btn => {
        btn.onclick = () => {
            searchKeyword = btn.dataset.keyword;
            renderMain();
        };
    });
}

async function renderCart() {
    currentView = 'cart';
    updateTitle('购物车');
    
    headerActions.innerHTML = '';
    
    const balance = await getBalance();
    const total = getCartTotal();
    const canAfford = balance >= total;
    
    container.innerHTML = `
        <div style="display: flex; flex-direction: column; height: 100%; background: #f5f5f5;">
            <div style="flex: 1; overflow-y: auto; padding: 15px;">
                ${cart.length > 0 ? `
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        ${cart.map(item => {
                            const product = PRODUCTS.find(p => p.id === item.productId);
                            if (!product) return '';
                            return `
                                <div class="cart-item" data-id="${item.productId}" style="display: flex; gap: 12px; padding: 15px; background: white; border-radius: 12px;">
                                    <img src="${product.image}" style="width: 80px; height: 80px; border-radius: 8px; object-fit: cover;" onerror="this.src='https://via.placeholder.com/80?text=商品'">
                                    <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                                        <div style="font-size: 14px; color: #333; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${product.name}</div>
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <span style="color: #FF6B6B; font-size: 16px; font-weight: bold;">${CURRENCY}${product.price}</span>
                                            <div style="display: flex; align-items: center; gap: 10px;">
                                                <button class="qty-btn minus" data-id="${item.productId}" style="width: 28px; height: 28px; border-radius: 50%; border: 1px solid #ddd; background: white; color: #666; font-size: 16px; cursor: pointer;">-</button>
                                                <span style="font-size: 14px; min-width: 20px; text-align: center;">${item.quantity}</span>
                                                <button class="qty-btn plus" data-id="${item.productId}" style="width: 28px; height: 28px; border-radius: 50%; border: 1px solid #ddd; background: white; color: #666; font-size: 16px; cursor: pointer;">+</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                ` : `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px;">
                        <div style="font-size: 64px; margin-bottom: 20px;">🛒</div>
                        <div style="color: #999; font-size: 16px; margin-bottom: 20px;">购物车是空的</div>
                        <button id="go-shopping-btn" style="padding: 12px 24px; background: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%); border: none; border-radius: 20px; color: white; font-size: 14px; cursor: pointer;">去逛逛</button>
                    </div>
                `}
            </div>
            
            ${cart.length > 0 ? `
                <div style="padding: 15px; background: white; border-top: 1px solid #eee;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="color: #666; font-size: 13px;">余额:</span>
                            <span style="color: #FF6B6B; font-size: 16px; font-weight: bold;">${CURRENCY}${balance.toLocaleString()}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <span style="color: #666; font-size: 14px;">合计:</span>
                            <span style="color: #FF6B6B; font-size: 20px; font-weight: bold;">${CURRENCY}${total.toLocaleString()}</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="clear-cart-btn" style="flex: 1; padding: 12px; background: #f5f5f5; border: none; border-radius: 20px; color: #666; font-size: 14px; cursor: pointer;">清空购物车</button>
                        <button id="checkout-btn" style="flex: 2; padding: 12px; background: ${canAfford ? 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)' : '#ccc'}; border: none; border-radius: 20px; color: white; font-size: 14px; font-weight: 500; cursor: ${canAfford ? 'pointer' : 'not-allowed'};">
                            ${canAfford ? '结算 (' + getCartCount() + ')' : '余额不足'}
                        </button>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
    
    document.getElementById('go-shopping-btn')?.addEventListener('click', () => renderMain());
    
    container.querySelectorAll('.qty-btn.minus').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const productId = btn.dataset.id;
            const item = cart.find(i => i.productId === productId);
            if (item) {
                await updateCartQuantity(productId, item.quantity - 1);
                renderCart();
            }
        };
    });
    
    container.querySelectorAll('.qty-btn.plus').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const productId = btn.dataset.id;
            const item = cart.find(i => i.productId === productId);
            if (item) {
                await updateCartQuantity(productId, item.quantity + 1);
                renderCart();
            }
        };
    });
    
    document.getElementById('clear-cart-btn')?.addEventListener('click', async () => {
        if (confirm('确定清空购物车吗？')) {
            cart = [];
            await saveCart();
            renderCart();
        }
    });
    
    document.getElementById('checkout-btn')?.addEventListener('click', async () => {
        if (!canAfford) {
            showToast('余额不足，请先充值');
            return;
        }
        
        const result = await spendCoins(total, '购买商品', `购买${getCartCount()}件商品`);
        if (result.success) {
            cart = [];
            await saveCart();
            showToast('购买成功！');
            renderMain();
        } else {
            showToast(result.message || '购买失败');
        }
    });
}

export function cleanup() {
    if (backBtnEl && originalBackHandler) {
        backBtnEl.onclick = originalBackHandler;
    }
    
    currentView = 'main';
    currentProductId = null;
    searchKeyword = '';
    selectedCategory = 'all';
    appTitleEl = null;
    backBtnEl = null;
    originalBackHandler = null;
}