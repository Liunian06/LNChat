
/**
 * LNChat 钱包模块
 * 
 * 功能：
 * - 人民币余额管理
 * - 每日签到
 * - 交易记录
 * - 成就系统
 * - 余额修改
 */

import { db, STORES } from '../db.js';
import { generateId, showToast, getCurrentTimestamp } from '../utils.js';

let container, headerActions;
let appTitleEl = null;
let backBtnEl = null;
let originalBackHandler = null;
let currentView = 'main'; // 'main' | 'transactions' | 'achievements'

// 货币符号和名称
const CURRENCY = '¥';
const CURRENCY_NAME = '元';

// 默认钱包数据
const DEFAULT_WALLET = {
    id: 'user_wallet',
    balance: 1000, // 初始赠送1000元
    totalEarned: 1000,
    totalSpent: 0,
    consecutiveSignIn: 0,
    lastSignInDate: null,
    achievements: [],
    level: 1,
    exp: 0,
    createdAt: new Date().toISOString()
};

// 成就定义
const ACHIEVEMENTS = [
    { id: 'first_signin', name: '初次签到', desc: '完成第一次签到', icon: '🌟', reward: 10 },
    { id: 'signin_3', name: '三日连签', desc: '连续签到3天', icon: '🔥', reward: 30 },
    { id: 'signin_7', name: '周签达人', desc: '连续签到7天', icon: '⭐', reward: 70 },
    { id: 'signin_30', name: '月签大师', desc: '连续签到30天', icon: '👑', reward: 300 },
    { id: 'first_gift', name: '第一份心意', desc: '第一次送出礼物', icon: '🎁', reward: 20 },
    { id: 'gift_10', name: '慷慨达人', desc: '送出10份礼物', icon: '💝', reward: 100 },
    { id: 'rich', name: '小富翁', desc: '累计获得1000元', icon: '💰', reward: 50 },
    { id: 'super_rich', name: '大富翁', desc: '累计获得10000元', icon: '🏆', reward: 500 }
];

// 签到奖励配置
const SIGNIN_REWARDS = {
    base: 10,
    consecutive: [
        { days: 3, bonus: 5 },
        { days: 7, bonus: 15 },
        { days: 14, bonus: 30 },
        { days: 30, bonus: 50 }
    ]
};

export async function init(target, actions) {
    container = target;
    headerActions = actions;
    
    appTitleEl = document.getElementById('app-title');
    backBtnEl = document.getElementById('app-back-btn');
    
    if (backBtnEl) {
        originalBackHandler = backBtnEl.onclick;
        backBtnEl.onclick = handleBack;
    }
    
    // 确保钱包数据存在
    await ensureWalletExists();
    
    renderMain();
}

function handleBack() {
    if (currentView !== 'main') {
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

async function ensureWalletExists() {
    let wallet = await db.get(STORES.WALLET, 'user_wallet');
    if (!wallet) {
        wallet = { ...DEFAULT_WALLET };
        await db.put(STORES.WALLET, wallet);
        
        // 添加初始交易记录
        await addTransaction('income', 1000, '新用户奖励', '🎉 欢迎使用LNChat！');
    }
    return wallet;
}

async function getWallet() {
    return await db.get(STORES.WALLET, 'user_wallet');
}

async function updateWallet(updates) {
    const wallet = await getWallet();
    const updated = { ...wallet, ...updates, updatedAt: new Date().toISOString() };
    await db.put(STORES.WALLET, updated);
    return updated;
}

async function addTransaction(type, amount, title, description = '') {
    const transaction = {
        id: generateId(),
        type, // 'income' | 'expense'
        amount,
        title,
        description,
        timestamp: new Date().toISOString()
    };
    await db.put(STORES.TRANSACTIONS, transaction);
    return transaction;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 172800000) return '昨天';
    
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function isSameDay(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

function isYesterday(dateStr) {
    const date = new Date(dateStr);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return isSameDay(date, yesterday);
}

// 计算等级
function calculateLevel(exp) {
    // 每100经验升一级，逐级递增
    let level = 1;
    let required = 100;
    let totalRequired = 0;
    
    while (exp >= totalRequired + required) {
        totalRequired += required;
        level++;
        required = level * 100;
    }
    
    return {
        level,
        currentExp: exp - totalRequired,
        nextLevelExp: required,
        progress: ((exp - totalRequired) / required) * 100
    };
}

async function checkAndUnlockAchievements(wallet) {
    const unlockedIds = wallet.achievements || [];
    const newlyUnlocked = [];
    
    for (const achievement of ACHIEVEMENTS) {
        if (unlockedIds.includes(achievement.id)) continue;
        
        let unlocked = false;
        
        switch (achievement.id) {
            case 'first_signin':
                unlocked = wallet.consecutiveSignIn >= 1;
                break;
            case 'signin_3':
                unlocked = wallet.consecutiveSignIn >= 3;
                break;
            case 'signin_7':
                unlocked = wallet.consecutiveSignIn >= 7;
                break;
            case 'signin_30':
                unlocked = wallet.consecutiveSignIn >= 30;
                break;
            case 'rich':
                unlocked = wallet.totalEarned >= 1000;
                break;
            case 'super_rich':
                unlocked = wallet.totalEarned >= 10000;
                break;
            // first_gift 和 gift_10 由商城模块触发
        }
        
        if (unlocked) {
            newlyUnlocked.push(achievement);
            unlockedIds.push(achievement.id);
        }
    }
    
    if (newlyUnlocked.length > 0) {
        // 更新钱包成就列表和余额
        let bonusReward = 0;
        for (const ach of newlyUnlocked) {
            bonusReward += ach.reward;
            await addTransaction('income', ach.reward, '成就奖励', `解锁成就: ${ach.name}`);
        }
        
        await updateWallet({
            achievements: unlockedIds,
            balance: wallet.balance + bonusReward,
            totalEarned: wallet.totalEarned + bonusReward
        });
        
        // 显示成就解锁提示
        for (const ach of newlyUnlocked) {
            setTimeout(() => {
                showAchievementNotification(ach);
            }, 300);
        }
    }
    
    return newlyUnlocked;
}

function showAchievementNotification(achievement) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%) translateY(-20px);
        background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
        color: #333;
        padding: 15px 25px;
        border-radius: 15px;
        box-shadow: 0 10px 40px rgba(255, 215, 0, 0.4);
        z-index: 5000;
        display: flex;
        align-items: center;
        gap: 12px;
        opacity: 0;
        transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;
    notification.innerHTML = `
        <span style="font-size: 32px;">${achievement.icon}</span>
        <div>
            <div style="font-weight: 600; font-size: 14px;">🎉 成就解锁！</div>
            <div style="font-size: 16px; font-weight: bold;">${achievement.name}</div>
            <div style="font-size: 12px; opacity: 0.8;">+${CURRENCY}${achievement.reward}</div>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(-50%) translateY(0)';
    }, 50);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

async function handleSignIn() {
    const wallet = await getWallet();
    const today = new Date().toISOString().split('T')[0];
    
    // 检查是否已签到
    if (wallet.lastSignInDate === today) {
        showToast('今天已经签到过了哦~');
        return;
    }
    
    // 计算连续签到天数
    let consecutive = 1;
    if (wallet.lastSignInDate) {
        if (isYesterday(wallet.lastSignInDate)) {
            consecutive = wallet.consecutiveSignIn + 1;
        }
    }
    
    // 计算奖励
    let reward = SIGNIN_REWARDS.base;
    let bonusText = '';
    
    for (const bonus of SIGNIN_REWARDS.consecutive) {
        if (consecutive >= bonus.days) {
            reward += bonus.bonus;
            bonusText = `(连续${bonus.days}天额外+${bonus.bonus})`;
        }
    }
    
    // 更新钱包
    const newBalance = wallet.balance + reward;
    const newTotalEarned = wallet.totalEarned + reward;
    const newExp = wallet.exp + reward;
    
    await updateWallet({
        balance: newBalance,
        totalEarned: newTotalEarned,
        consecutiveSignIn: consecutive,
        lastSignInDate: today,
        exp: newExp
    });
    
    // 添加交易记录
    await addTransaction('income', reward, '每日签到', `连续签到${consecutive}天 ${bonusText}`);
    
    // 检查成就
    const updatedWallet = await getWallet();
    await checkAndUnlockAchievements(updatedWallet);
    
    // 显示签到成功动画
    showSignInSuccess(reward, consecutive);
    
    // 刷新界面
    setTimeout(() => renderMain(), 1500);
}

function showSignInSuccess(reward, consecutive) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        z-index: 4000;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s;
    `;
    
    overlay.innerHTML = `
        <div style="text-align: center; transform: scale(0.8); transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);" id="signin-success-content">
            <div style="font-size: 80px; margin-bottom: 20px; animation: bounce 0.6s;">🎉</div>
            <div style="font-size: 28px; font-weight: bold; color: #FFD700; margin-bottom: 10px;">签到成功！</div>
            <div style="font-size: 42px; font-weight: bold; color: #4CAF50; margin-bottom: 15px;">+${CURRENCY}${reward}</div>
            <div style="font-size: 16px; color: var(--text-secondary);">连续签到 ${consecutive} 天</div>
            <div style="margin-top: 20px; display: flex; justify-content: center; gap: 5px;">
                ${Array(Math.min(consecutive, 7)).fill('<span style="font-size: 24px;">⭐</span>').join('')}
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    setTimeout(() => {
        overlay.style.opacity = '1';
        overlay.querySelector('#signin-success-content').style.transform = 'scale(1)';
    }, 50);
    
    overlay.onclick = () => {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300);
    };
    
    setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300);
    }, 2500);
}

// 显示余额修改对话框
async function showEditBalanceDialog() {
    const wallet = await getWallet();
    
    // 移除已存在的对话框
    const existingDialog = document.getElementById('edit-balance-dialog');
    if (existingDialog) {
        document.body.removeChild(existingDialog);
    }
    
    const dialog = document.createElement('div');
    dialog.id = 'edit-balance-dialog';
    dialog.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        z-index: 4000;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s;
    `;
    
    dialog.innerHTML = `
        <div style="background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 20px; padding: 25px; width: 90%; max-width: 350px; transform: scale(0.9); transition: transform 0.3s;" id="edit-balance-content">
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 40px; margin-bottom: 10px;">💰</div>
                <div style="font-size: 18px; font-weight: 600; color: white;">修改余额</div>
                <div style="font-size: 13px; color: var(--text-secondary); margin-top: 5px;">当前余额：${CURRENCY}${wallet.balance.toLocaleString()}</div>
            </div>
            
            <div style="margin-bottom: 20px;">
                <label style="display: block; font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">设置新余额</label>
                <input type="number" id="new-balance-input" value="${wallet.balance}" 
                    style="width: 100%; padding: 14px; background: rgba(255,255,255,0.1); border: 1px solid var(--glass-border); border-radius: 12px; color: white; font-size: 18px; text-align: center; box-sizing: border-box;"
                    placeholder="输入新余额" min="0" step="0.01">
            </div>
            
            <div style="display: flex; gap: 12px;">
                <button id="cancel-edit-balance" style="flex: 1; padding: 14px; background: rgba(255,255,255,0.1); border: 1px solid var(--glass-border); border-radius: 12px; color: white; font-size: 14px; cursor: pointer;">取消</button>
                <button id="confirm-edit-balance" style="flex: 1; padding: 14px; background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%); border: none; border-radius: 12px; color: white; font-size: 14px; font-weight: 600; cursor: pointer;">确认</button>
            </div>
            
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--glass-border);">
                <div style="font-size: 12px; color: var(--text-secondary); text-align: center; margin-bottom: 10px;">快捷操作</div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;">
                    <button class="quick-add-btn" data-amount="100" style="padding: 8px 16px; background: rgba(76, 175, 80, 0.2); border: 1px solid rgba(76, 175, 80, 0.5); border-radius: 20px; color: #4CAF50; font-size: 12px; cursor: pointer;">+${CURRENCY}100</button>
                    <button class="quick-add-btn" data-amount="500" style="padding: 8px 16px; background: rgba(76, 175, 80, 0.2); border: 1px solid rgba(76, 175, 80, 0.5); border-radius: 20px; color: #4CAF50; font-size: 12px; cursor: pointer;">+${CURRENCY}500</button>
                    <button class="quick-add-btn" data-amount="1000" style="padding: 8px 16px; background: rgba(76, 175, 80, 0.2); border: 1px solid rgba(76, 175, 80, 0.5); border-radius: 20px; color: #4CAF50; font-size: 12px; cursor: pointer;">+${CURRENCY}1000</button>
                    <button class="quick-add-btn" data-amount="5000" style="padding: 8px 16px; background: rgba(76, 175, 80, 0.2); border: 1px solid rgba(76, 175, 80, 0.5); border-radius: 20px; color: #4CAF50; font-size: 12px; cursor: pointer;">+${CURRENCY}5000</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    // 显示动画
    setTimeout(() => {
        dialog.style.opacity = '1';
        dialog.querySelector('#edit-balance-content').style.transform = 'scale(1)';
    }, 50);
    
    const closeDialog = () => {
        dialog.style.opacity = '0';
        dialog.querySelector('#edit-balance-content').style.transform = 'scale(0.9)';
        setTimeout(() => {
            if (document.body.contains(dialog)) {
                document.body.removeChild(dialog);
            }
        }, 300);
    };
    
    // 取消按钮
    document.getElementById('cancel-edit-balance').onclick = closeDialog;
    
    // 点击背景关闭
    dialog.onclick = (e) => {
        if (e.target === dialog) closeDialog();
    };
    
    // 快捷添加按钮
    dialog.querySelectorAll('.quick-add-btn').forEach(btn => {
        btn.onclick = () => {
            const amount = parseInt(btn.dataset.amount);
            const input = document.getElementById('new-balance-input');
            input.value = parseFloat(input.value || 0) + amount;
        };
    });
    
    // 确认按钮
    document.getElementById('confirm-edit-balance').onclick = async () => {
        const input = document.getElementById('new-balance-input');
        const newBalance = parseFloat(input.value);
        
        if (isNaN(newBalance) || newBalance < 0) {
            showToast('请输入有效的金额');
            return;
        }
        
        const wallet = await getWallet();
        const diff = newBalance - wallet.balance;
        
        if (diff !== 0) {
            // 更新钱包余额
            const updates = { balance: newBalance };
            
            if (diff > 0) {
                updates.totalEarned = wallet.totalEarned + diff;
                await addTransaction('income', diff, '余额调整', '手动增加余额');
            } else {
                updates.totalSpent = wallet.totalSpent + Math.abs(diff);
                await addTransaction('expense', Math.abs(diff), '余额调整', '手动减少余额');
            }
            
            await updateWallet(updates);
            
            // 检查成就
            const updatedWallet = await getWallet();
            await checkAndUnlockAchievements(updatedWallet);
            
            showToast(`余额已更新为 ${CURRENCY}${newBalance.toLocaleString()}`);
        }
        
        closeDialog();
        renderMain();
    };
    
    // 聚焦输入框
    setTimeout(() => {
        document.getElementById('new-balance-input').focus();
        document.getElementById('new-balance-input').select();
    }, 100);
}

async function renderMain() {
    currentView = 'main';
    updateTitle('钱包');
    
    const wallet = await getWallet();
    const today = new Date().toISOString().split('T')[0];
    const hasSignedIn = wallet.lastSignInDate === today;
    const levelInfo = calculateLevel(wallet.exp);
    
    // 获取最近交易
    const allTransactions = await db.getAll(STORES.TRANSACTIONS);
    const recentTransactions = allTransactions
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 5);
    
    headerActions.innerHTML = `
        <button class="add-btn" id="edit-balance-btn" title="修改余额" style="margin-right: 8px;">✏️</button>
        <button class="add-btn" id="achievements-btn" title="成就">🏆</button>
    `;
    
    container.innerHTML = `
        <div class="wallet-container" style="padding: 20px; padding-bottom: 80px;">
            <!-- 余额卡片 -->
            <div class="wallet-card" style="background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 50%, #1B5E20 100%); border-radius: 24px; padding: 30px; color: white; position: relative; overflow: hidden; box-shadow: 0 15px 40px rgba(76, 175, 80, 0.4);">
                <div style="position: absolute; top: -50px; right: -50px; width: 150px; height: 150px; background: rgba(255,255,255,0.1); border-radius: 50%;"></div>
                <div style="position: absolute; bottom: -30px; left: -30px; width: 100px; height: 100px; background: rgba(255,255,255,0.1); border-radius: 50%;"></div>
                
                <div style="position: relative; z-index: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <div style="font-size: 14px; opacity: 0.9;">账户余额</div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 12px; background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 20px;">Lv.${levelInfo.level}</span>
                        </div>
                    </div>
                    
                    <div style="display: flex; align-items: baseline; gap: 5px; margin-bottom: 25px;">
                        <span style="font-size: 24px; font-weight: bold;">${CURRENCY}</span>
                        <span style="font-size: 48px; font-weight: bold;">${wallet.balance.toLocaleString()}</span>
                    </div>
                    
                    <!-- 经验条 -->
                    <div style="margin-bottom: 15px;">
                        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 5px; opacity: 0.8;">
                            <span>EXP</span>
                            <span>${levelInfo.currentExp}/${levelInfo.nextLevelExp}</span>
                        </div>
                        <div style="height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; overflow: hidden;">
                            <div style="height: 100%; width: ${levelInfo.progress}%; background: white; border-radius: 2px; transition: width 0.5s;"></div>
                        </div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; font-size: 13px; opacity: 0.9;">
                        <div>累计收入: ${CURRENCY}${wallet.totalEarned.toLocaleString()}</div>
                        <div>累计支出: ${CURRENCY}${wallet.totalSpent.toLocaleString()}</div>
                    </div>
                </div>
            </div>
            
            <!-- 签到区域 -->
            <div style="margin-top: 20px; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 20px; padding: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-size: 16px; font-weight: 600; color: white; margin-bottom: 5px;">每日签到</div>
                        <div style="font-size: 13px; color: var(--text-secondary);">
                            ${hasSignedIn 
                                ? `✅ 今日已签到 · 连续${wallet.consecutiveSignIn}天` 
                                : `连续签到${wallet.consecutiveSignIn}天 · 今日可领${CURRENCY}${SIGNIN_REWARDS.base}+`}
                        </div>
                    </div>
                    <button id="signin-btn" style="padding: 12px 24px; background: ${hasSignedIn ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)'}; border: none; border-radius: 25px; color: ${hasSignedIn ? 'var(--text-secondary)' : '#333'}; font-weight: 600; font-size: 14px; cursor: ${hasSignedIn ? 'not-allowed' : 'pointer'}; transition: all 0.3s;">
                        ${hasSignedIn ? '已签到 ✓' : '签到领钱'}
                    </button>
                </div>
                
                <!-- 签到日历 -->
                <div style="display: flex; justify-content: space-between; margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--glass-border);">
                    ${renderSignInWeek(wallet)}
                </div>
            </div>
            
            <!-- 快捷操作 -->
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-top: 20px;">
                <div class="wallet-action-card" id="goto-store" style="background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 16px; padding: 20px; text-align: center; cursor: pointer; transition: all 0.3s;">
                    <div style="font-size: 32px; margin-bottom: 10px;">🛒</div>
                    <div style="font-size: 14px; font-weight: 500; color: white;">去商城</div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 5px;">购买礼物送给TA</div>
                </div>
                <div class="wallet-action-card" id="view-transactions" style="background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 16px; padding: 20px; text-align: center; cursor: pointer; transition: all 0.3s;">
                    <div style="font-size: 32px; margin-bottom: 10px;">📊</div>
                    <div style="font-size: 14px; font-weight: 500; color: white;">交易记录</div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 5px;">查看收支明细</div>
                </div>
            </div>
            
            <!-- 最近交易 -->
            <div style="margin-top: 25px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <div style="font-size: 16px; font-weight: 600; color: white;">最近交易</div>
                    <button id="view-all-transactions" style="background: none; border: none; color: var(--primary-color); font-size: 13px; cursor: pointer;">查看全部 →</button>
                </div>
                
                ${recentTransactions.length > 0 ? `
                    <div style="background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 16px; overflow: hidden;">
                        ${recentTransactions.map((t, i) => `
                            <div style="display: flex; align-items: center; padding: 15px; ${i < recentTransactions.length - 1 ? 'border-bottom: 1px solid var(--glass-border);' : ''}">
                                <div style="width: 40px; height: 40px; background: ${t.type === 'income' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)'}; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-right: 12px;">
                                    <span style="font-size: 18px;">${t.type === 'income' ? '💰' : '💸'}</span>
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-size: 14px; color: white; font-weight: 500;">${t.title}</div>
                                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">${formatDate(t.timestamp)}</div>
                                </div>
                                <div style="font-size: 16px; font-weight: 600; color: ${t.type === 'income' ? '#4CAF50' : '#f44336'};">
                                    ${t.type === 'income' ? '+' : '-'}${CURRENCY}${t.amount}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div style="text-align: center; padding: 30px; color: var(--text-secondary);">
                        <div style="font-size: 40px; margin-bottom: 10px;">📭</div>
                        <div>暂无交易记录</div>
                    </div>
                `}
            </div>
        </div>
    `;
    
    // 绑定事件
    if (!hasSignedIn) {
        document.getElementById('signin-btn').onclick = handleSignIn;
    }
    
    document.getElementById('goto-store').onclick = () => {
        // 返回主界面，然后打开商城
        if (window.lnChat && window.lnChat.openApp) {
            window.lnChat.closeApp();
            setTimeout(() => window.lnChat.openApp('store'), 100);
        }
    };
    
    document.getElementById('view-transactions').onclick = () => renderTransactions();
    document.getElementById('view-all-transactions').onclick = () => renderTransactions();
    document.getElementById('achievements-btn').onclick = () => renderAchievements();
    document.getElementById('edit-balance-btn').onclick = () => showEditBalanceDialog();
    
    // 添加悬停效果
    container.querySelectorAll('.wallet-action-card').forEach(card => {
        card.onmouseenter = () => {
            card.style.transform = 'translateY(-3px)';
            card.style.background = 'rgba(255, 255, 255, 0.15)';
        };
        card.onmouseleave = () => {
            card.style.transform = 'translateY(0)';
            card.style.background = 'var(--glass-bg)';
        };
    });
}

function renderSignInWeek(wallet) {
    const today = new Date();
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    const todayStr = today.toISOString().split('T')[0];
    
    let html = '';
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - today.getDay() + i);
        const dateStr = date.toISOString().split('T')[0];
        const isToday = dateStr === todayStr;
        const isPast = date < today && !isToday;
        
        // 检查这一天是否签到过（简化：只检查今天和连续签到）
        let isSignedIn = false;
        if (wallet.lastSignInDate) {
            const lastSignIn = new Date(wallet.lastSignInDate);
            const daysDiff = Math.floor((today - date) / (1000 * 60 * 60 * 24));
            if (daysDiff >= 0 && daysDiff < wallet.consecutiveSignIn) {
                isSignedIn = true;
            }
            if (dateStr === wallet.lastSignInDate) {
                isSignedIn = true;
            }
        }
        
        html += `
            <div style="text-align: center; flex: 1;">
                <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;">${days[i]}</div>
                <div style="width: 32px; height: 32px; margin: 0 auto; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px;
                    background: ${isSignedIn ? 'linear-gradient(135deg, #FFD700, #FFA500)' : isToday ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)'};
                    color: ${isSignedIn || isToday ? 'white' : 'var(--text-secondary)'};
                    border: ${isToday && !isSignedIn ? '2px dashed var(--primary-color)' : 'none'};
                    box-sizing: border-box;">
                    ${isSignedIn ? '✓' : date.getDate()}
                </div>
            </div>
        `;
    }
    
    return html;
}

async function renderTransactions() {
    currentView = 'transactions';
    updateTitle('交易记录');
    
    headerActions.innerHTML = '';
    
    const allTransactions = await db.getAll(STORES.TRANSACTIONS);
    const transactions = allTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // 按月分组
    const grouped = {};
    transactions.forEach(t => {
        const date = new Date(t.timestamp);
        const key = `${date.getFullYear()}年${date.getMonth() + 1}月`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(t);
    });
    
    container.innerHTML = `
        <div style="padding: 20px; padding-bottom: 80px;">
            ${Object.keys(grouped).length > 0 ? Object.entries(grouped).map(([month, items]) => {
                const income = items.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
                const expense = items.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
                return `
                    <div style="margin-bottom: 25px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <div style="font-size: 15px; font-weight: 600; color: white;">${month}</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">
                                <span style="color: #4CAF50;">+${CURRENCY}${income}</span>
                                <span style="margin: 0 5px;">/</span>
                                <span style="color: #f44336;">-${CURRENCY}${expense}</span>
                            </div>
                        </div>
                        <div style="background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 16px; overflow: hidden;">
                            ${items.map((t, i) => `
                                <div style="display: flex; align-items: center; padding: 15px; ${i < items.length - 1 ? 'border-bottom: 1px solid var(--glass-border);' : ''}">
                                    <div style="width: 40px; height: 40px; background: ${t.type === 'income' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)'}; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-right: 12px;">
                                        <span style="font-size: 18px;">${t.type === 'income' ? '💰' : '💸'}</span>
                                    </div>
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-size: 14px; color: white; font-weight: 500;">${t.title}</div>
                                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">${t.description || formatDate(t.timestamp)}</div>
                                    </div>
                                    <div style="font-size: 16px; font-weight: 600; color: ${t.type === 'income' ? '#4CAF50' : '#f44336'};">
                                        ${t.type === 'income' ? '+' : '-'}${CURRENCY}${t.amount}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }).join('') : `
                <div style="text-align: center; padding: 60px 20px; color: var(--text-secondary);">
                    <div style="font-size: 64px; margin-bottom: 15px;">📭</div>
                    <div style="font-size: 16px;">暂无交易记录</div>
                </div>
            `}
        </div>
    `;
}

async function renderAchievements() {
    currentView = 'achievements';
    updateTitle('成就');
    
    headerActions.innerHTML = '';
    
    const wallet = await getWallet();
    const unlockedIds = wallet.achievements || [];
    
    container.innerHTML = `
        <div style="padding: 20px; padding-bottom: 80px;">
            <!-- 成就统计 -->
            <div style="background: linear-gradient(135deg, #9C27B0 0%, #673AB7 100%); border-radius: 20px; padding: 25px; color: white; margin-bottom: 20px; box-shadow: 0 10px 30px rgba(156, 39, 176, 0.3);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-size: 14px; opacity: 0.9; margin-bottom: 5px;">已解锁成就</div>
                        <div style="font-size: 36px; font-weight: bold;">${unlockedIds.length} / ${ACHIEVEMENTS.length}</div>
                    </div>
                    <div style="font-size: 60px;">🏆</div>
                </div>
                <div style="margin-top: 15px; height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px; overflow: hidden;">
                    <div style="height: 100%; width: ${(unlockedIds.length / ACHIEVEMENTS.length) * 100}%; background: #FFD700; border-radius: 3px;"></div>
                </div>
            </div>
            
            <!-- 成就列表 -->
            <div style="display: grid; gap: 12px;">
                ${ACHIEVEMENTS.map(ach => {
                    const isUnlocked = unlockedIds.includes(ach.id);
                    return `
                        <div style="background: ${isUnlocked ? 'linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 165, 0, 0.1))' : 'var(--glass-bg)'}; border: 1px solid ${isUnlocked ? 'rgba(255, 215, 0, 0.3)' : 'var(--glass-border)'}; border-radius: 16px; padding: 18px; display: flex; align-items: center; gap: 15px; ${!isUnlocked ? 'opacity: 0.6;' : ''}">
                            <div style="width: 50px; height: 50px; background: ${isUnlocked ? 'linear-gradient(135deg, #FFD700, #FFA500)' : 'rgba(255,255,255,0.1)'}; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 26px; ${!isUnlocked ? 'filter: grayscale(1);' : ''}">
                                ${ach.icon}
                            </div>
                            <div style="flex: 1;">
                                <div style="font-size: 15px; font-weight: 600; color: ${isUnlocked ? '#FFD700' : 'white'};">${ach.name}</div>
                                <div style="font-size: 13px; color: var(--text-secondary); margin-top: 3px;">${ach.desc}</div>
                            </div>
                            <div style="text-align: right;">
                                ${isUnlocked
                                    ? '<div style="font-size: 20px;">✅</div>'
                                    : `<div style="font-size: 13px; color: var(--text-secondary);">+${CURRENCY}${ach.reward}</div>`
                                }
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// 导出给商城模块使用的工具函数
export async function spendCoins(amount, title, description = '') {
    const wallet = await getWallet();
    
    if (wallet.balance < amount) {
        return { success: false, message: '余额不足' };
    }
    
    await updateWallet({
        balance: wallet.balance - amount,
        totalSpent: wallet.totalSpent + amount
    });
    
    await addTransaction('expense', amount, title, description);
    
    return { success: true, newBalance: wallet.balance - amount };
}

export async function earnCoins(amount, title, description = '') {
    const wallet = await getWallet();
    
    await updateWallet({
        balance: wallet.balance + amount,
        totalEarned: wallet.totalEarned + amount,
        exp: wallet.exp + amount
    });
    
    await addTransaction('income', amount, title, description);
    
    // 检查成就
    const updatedWallet = await getWallet();
    await checkAndUnlockAchievements(updatedWallet);
    
    return { success: true, newBalance: wallet.balance + amount };
}

export async function getBalance() {
    const wallet = await getWallet();
    return wallet.balance;
}

export async function unlockAchievement(achievementId) {
    const wallet = await getWallet();
    const unlockedIds = wallet.achievements || [];
    
    if (unlockedIds.includes(achievementId)) {
        return false;
    }
    
    const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
    if (!achievement) return false;
    
    unlockedIds.push(achievementId);
    
    await updateWallet({
        achievements: unlockedIds,
        balance: wallet.balance + achievement.reward,
        totalEarned: wallet.totalEarned + achievement.reward
    });
    
    await addTransaction('income', achievement.reward, '成就奖励', `解锁成就: ${achievement.name}`);
    
    showAchievementNotification(achievement);
    
    return true;
}

export function cleanup() {
    if (backBtnEl && originalBackHandler) {
        backBtnEl.onclick = originalBackHandler;
    }
    
    currentView = 'main';
    appTitleEl = null;
    backBtnEl = null;
    originalBackHandler = null;
}