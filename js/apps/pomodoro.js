
/**
 * LNChat 番茄钟模块 (Pomodoro Timer / 待办)
 */

import { db, STORES } from '../db.js';
import { generateId, showToast } from '../utils.js';

let container, headerActions;
let currentView = 'tasks'; // 'tasks', 'tasksets', 'stats', 'timeline', 'timer'
let currentTask = null;
let currentTaskSet = null;
let timerInterval = null;
let timerSeconds = 0;
let isTimerRunning = false;
let timerType = 'countup';
let countdownMinutes = 25;
let originalBackHandler = null; // 保存原始返回处理器

// 预设背景图片
const PRESET_BACKGROUNDS = [
    'https://images.unsplash.com/photo-1518173946687-a4c036bc9c57?w=800',
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
    'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800',
    'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800',
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800',
    'https://images.unsplash.com/photo-1492571350019-22de08371fd3?w=800',
];

// 励志语句
const QUOTES = [
    '月缺不改光，剑折不改刚。',
    '不积跬步，无以至千里。',
    '宝剑锋从磨砺出，梅花香自苦寒来。',
    '学如逆水行舟，不进则退。',
    '千里之行，始于足下。',
    '天行健，君子以自强不息。',
    '业精于勤，荒于嬉。',
    '读书破万卷，下笔如有神。'
];

// 任务颜色
const TASK_COLORS = [
    { bg: 'rgba(194, 147, 88, 0.9)', name: '棕色' },
    { bg: 'rgba(100, 180, 255, 0.9)', name: '蓝色' },
    { bg: 'rgba(150, 200, 150, 0.9)', name: '绿色' },
    { bg: 'rgba(255, 150, 150, 0.9)', name: '红色' },
    { bg: 'rgba(200, 150, 255, 0.9)', name: '紫色' },
];

// 格式化时间
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getRandomQuote() {
    return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

function getRandomBackground() {
    return PRESET_BACKGROUNDS[Math.floor(Math.random() * PRESET_BACKGROUNDS.length)];
}

function getTaskColor(index) {
    return TASK_COLORS[index % TASK_COLORS.length].bg;
}

// 获取中文星期
function getWeekdayName(day) {
    const names = ['日', '一', '二', '三', '四', '五', '六'];
    return names[day];
}

// 获取某月的天数
function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

// 获取某月第一天是星期几
function getFirstDayOfMonth(year, month) {
    return new Date(year, month, 1).getDay();
}

export async function init(target, actions) {
    container = target;
    headerActions = actions;
    currentView = 'tasks';
    currentTask = null;
    currentTaskSet = null;
    
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    // 保存原始返回处理器（只在init时保存一次）
    originalBackHandler = window.lnChat.backBtn.onclick;
    
    // 设置统一的返回处理器
    window.lnChat.backBtn.onclick = handleBack;
    
    await renderTaskList();
}

export function cleanup() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    // 恢复原始返回处理器
    if (originalBackHandler) {
        window.lnChat.backBtn.onclick = originalBackHandler;
        originalBackHandler = null;
    }
}

// 统一的返回处理器
function handleBack() {
    switch (currentView) {
        case 'timer':
            if (isTimerRunning) {
                if (confirm('计时中，确定要退出吗？')) {
                    stopTimer();
                    renderTaskList();
                }
            } else {
                renderTaskList();
            }
            break;
        case 'tasksets':
        case 'stats':
        case 'timeline':
            renderTaskList();
            break;
        case 'tasks':
        default:
            cleanup();
            window.lnChat.closeApp();
            break;
    }
}

// 渲染任务列表
async function renderTaskList() {
    currentView = 'tasks';
    const tasks = await db.getAll(STORES.POMODORO_TASKS);
    const activeTasks = tasks.filter(t => t.status === 'active' && !t.taskSetId);
    
    window.lnChat.appTitle.textContent = '待办';
    headerActions.innerHTML = `
        <button id="add-task-btn" class="add-btn">➕</button>
    `;
    document.getElementById('add-task-btn').onclick = () => showAddTaskDialog();
    
    container.innerHTML = `
        <div class="pomodoro-container">
            <div class="pomodoro-header-bar">
                <span class="pomodoro-badge">学霸模式白名单等选项</span>
                <div class="pomodoro-header-actions">
                    <span class="pomodoro-header-text">必开权限</span>
                    <button class="pomodoro-header-btn">🕐</button>
                    <button class="pomodoro-header-btn" id="stats-btn">📊</button>
                </div>
            </div>
            
            <div class="pomodoro-task-list">
                ${activeTasks.length === 0 ? `
                    <div class="pomodoro-empty">
                        <div class="pomodoro-empty-icon">📝</div>
                        <p>还没有待办任务</p>
                        <button id="start-add-btn" class="pomodoro-add-btn">添加任务</button>
                    </div>
                ` : activeTasks.map((task, index) => `
                    <div class="pomodoro-task-item" data-id="${task.id}" 
                         style="background: ${getTaskColor(task.colorIndex || index)};">
                        <div class="pomodoro-task-info">
                            <div class="pomodoro-task-title">${task.title}</div>
                            <div class="pomodoro-task-type">${task.duration || 25} 分钟</div>
                        </div>
                        <button class="pomodoro-start-btn" data-id="${task.id}">开始</button>
                    </div>
                `).join('')}
            </div>
            
            ${renderBottomNav('tasks')}
        </div>
    `;
    
    bindTaskEvents();
    bindNavEvents();
}

// 渲染待办集
async function renderTaskSets() {
    currentView = 'tasksets';
    const tasks = await db.getAll(STORES.POMODORO_TASKS);
    
    // 获取所有待办集（通过 taskSetId 分组）
    const taskSets = {};
    const standaloneTasks = [];
    
    tasks.filter(t => t.status === 'active').forEach(task => {
        if (task.taskSetId) {
            if (!taskSets[task.taskSetId]) {
                taskSets[task.taskSetId] = {
                    id: task.taskSetId,
                    name: task.taskSetName || '待办集',
                    tasks: []
                };
            }
            taskSets[task.taskSetId].tasks.push(task);
        }
    });
    
    const taskSetList = Object.values(taskSets);
    
    window.lnChat.appTitle.textContent = '待办集';
    headerActions.innerHTML = `
        <button id="add-taskset-btn" class="add-btn">➕</button>
    `;
    document.getElementById('add-taskset-btn').onclick = () => showAddTaskSetDialog();
    
    container.innerHTML = `
        <div class="pomodoro-container">
            <div class="pomodoro-header-bar">
                <span class="pomodoro-badge">学霸模式白名单等选项</span>
                <div class="pomodoro-header-actions">
                    <span class="pomodoro-header-text">必开权限</span>
                    <button class="pomodoro-header-btn">🕐</button>
                    <button class="pomodoro-header-btn">⚙️</button>
                    <button class="pomodoro-header-btn">➕</button>
                </div>
            </div>
            
            <div class="pomodoro-tasksets-list">
                ${taskSetList.length === 0 ? `
                    <div class="pomodoro-empty">
                        <div class="pomodoro-empty-icon">📋</div>
                        <p>还没有待办集</p>
                        <button id="start-add-taskset-btn" class="pomodoro-add-btn">创建待办集</button>
                    </div>
                ` : taskSetList.map(set => `
                    <div class="pomodoro-taskset-card" data-id="${set.id}">
                        <div class="pomodoro-taskset-header">
                            <span class="pomodoro-taskset-name">${set.name}</span>
                            <div class="pomodoro-taskset-actions">
                                <button class="pomodoro-taskset-action">✓</button>
                                <button class="pomodoro-taskset-action">🕐</button>
                                <button class="pomodoro-taskset-action">⚙️</button>
                                <button class="pomodoro-taskset-action add-task-to-set" data-set-id="${set.id}">➕</button>
                            </div>
                        </div>
                        <div class="pomodoro-taskset-tasks">
                            ${set.tasks.map((task, index) => `
                                <div class="pomodoro-taskset-task" data-id="${task.id}" 
                                     style="background: ${getTaskColor(task.colorIndex || index)};">
                                    <div class="pomodoro-taskset-task-info">
                                        <div class="pomodoro-taskset-task-title">${task.title}</div>
                                        <div class="pomodoro-taskset-task-duration">${task.duration || 25} 分钟</div>
                                    </div>
                                    <button class="pomodoro-start-btn" data-id="${task.id}">开始</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
            
            ${renderBottomNav('tasksets')}
        </div>
    `;
    
    // 绑定事件
    if (document.getElementById('start-add-taskset-btn')) {
        document.getElementById('start-add-taskset-btn').onclick = () => showAddTaskSetDialog();
    }
    
    container.querySelectorAll('.add-task-to-set').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const setId = btn.dataset.setId;
            const taskSet = taskSetList.find(s => s.id === setId);
            if (taskSet) {
                showAddTaskToSetDialog(taskSet);
            }
        };
    });
    
    container.querySelectorAll('.pomodoro-start-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const taskId = btn.dataset.id;
            const task = await db.get(STORES.POMODORO_TASKS, taskId);
            if (task) {
                startTimer(task);
            }
        };
    });
    
    container.querySelectorAll('.pomodoro-taskset-task').forEach(item => {
        item.onclick = async () => {
            const taskId = item.dataset.id;
            showTaskOptions(taskId);
        };
    });
    
    bindNavEvents();
}

// 渲染时间轴
async function renderTimeline() {
    currentView = 'timeline';
    const records = await db.getAll(STORES.POMODORO_RECORDS);
    
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();
    
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    // 计算日历格子
    const calendarDays = [];
    // 填充月初空白
    for (let i = 0; i < firstDay; i++) {
        calendarDays.push({ day: '', empty: true });
    }
    // 填充日期
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayRecords = records.filter(r => r.date === dateStr);
        calendarDays.push({
            day: d,
            isToday: d === today,
            hasRecords: dayRecords.length > 0,
            records: dayRecords
        });
    }
    // 填充月末空白
    const remainingDays = (7 - (calendarDays.length % 7)) % 7;
    for (let i = 0; i < remainingDays; i++) {
        calendarDays.push({ day: '', empty: true, nextMonth: true });
    }
    
    // 获取今天的记录
    const todayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(today).padStart(2, '0')}`;
    const todayRecords = records.filter(r => r.date === todayStr);
    
    window.lnChat.appTitle.textContent = '专注历史记录';
    headerActions.innerHTML = `
        <button class="pomodoro-header-btn">🕐</button>
        <button class="pomodoro-header-btn">⋮</button>
    `;
    
    container.innerHTML = `
        <div class="pomodoro-container pomodoro-timeline">
            <!-- 日期头部 -->
            <div class="pomodoro-timeline-header">
                <div class="pomodoro-timeline-date">
                    <span class="pomodoro-timeline-month">${month + 1} 月 ${today} 日</span>
                    <span class="pomodoro-timeline-year">${year}</span>
                </div>
            </div>
            
            <!-- 日历 -->
            <div class="pomodoro-calendar">
                <div class="pomodoro-calendar-weekdays">
                    ${['一', '二', '三', '四', '五', '六', '日'].map(d => 
                        `<div class="pomodoro-calendar-weekday">${d}</div>`
                    ).join('')}
                </div>
                <div class="pomodoro-calendar-days">
                    ${calendarDays.map(d => `
                        <div class="pomodoro-calendar-day ${d.empty ? 'empty' : ''} ${d.isToday ? 'today' : ''} ${d.hasRecords ? 'has-records' : ''} ${d.nextMonth ? 'next-month' : ''}" 
                             data-date="${d.day}">
                            ${d.day}
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- 日历工具栏 -->
            <div class="pomodoro-calendar-toolbar">
                <button class="pomodoro-calendar-tool">📅</button>
                <button class="pomodoro-calendar-tool">📊</button>
                <button class="pomodoro-calendar-tool">➕</button>
                <button class="pomodoro-calendar-tool">📤</button>
                <button class="pomodoro-calendar-tool">📈</button>
            </div>
            
            <!-- 今日记录 -->
            <div class="pomodoro-timeline-records">
                ${todayRecords.length === 0 ? `
                    <div class="pomodoro-timeline-empty">
                        <div class="pomodoro-timeline-empty-icon">📋</div>
                        <p>没有专注记录</p>
                    </div>
                ` : `
                    <div class="pomodoro-timeline-record-list">
                        ${todayRecords.map(r => `
                            <div class="pomodoro-timeline-record">
                                <div class="pomodoro-timeline-record-title">${r.taskTitle || '任务'}</div>
                                <div class="pomodoro-timeline-record-time">${formatTime(r.seconds || 0)}</div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
            
            ${renderBottomNav('timeline')}
        </div>
    `;
    
    bindNavEvents();
}

// 渲染底部导航
function renderBottomNav(active) {
    return `
        <div class="pomodoro-bottom-nav">
            <div class="pomodoro-nav-item ${active === 'tasks' ? 'active' : ''}" data-view="tasks">
                <span class="pomodoro-nav-icon">☰</span>
                <span class="pomodoro-nav-label">待办</span>
            </div>
            <div class="pomodoro-nav-item ${active === 'tasksets' ? 'active' : ''}" data-view="tasksets">
                <span class="pomodoro-nav-icon">≡</span>
                <span class="pomodoro-nav-label">待办集</span>
            </div>
            <div class="pomodoro-nav-item ${active === 'stats' ? 'active' : ''}" data-view="stats">
                <span class="pomodoro-nav-icon">📊</span>
                <span class="pomodoro-nav-label">统计数据</span>
            </div>
            <div class="pomodoro-nav-item ${active === 'timeline' ? 'active' : ''}" data-view="timeline">
                <span class="pomodoro-nav-icon">📋</span>
                <span class="pomodoro-nav-label">时间轴</span>
            </div>
        </div>
    `;
}

// 绑定任务事件
function bindTaskEvents() {
    if (document.getElementById('start-add-btn')) {
        document.getElementById('start-add-btn').onclick = () => showAddTaskDialog();
    }
    
    container.querySelectorAll('.pomodoro-start-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const taskId = btn.dataset.id;
            const task = await db.get(STORES.POMODORO_TASKS, taskId);
            if (task) {
                startTimer(task);
            }
        };
    });
    
    container.querySelectorAll('.pomodoro-task-item').forEach(item => {
        item.onclick = async () => {
            const taskId = item.dataset.id;
            showTaskOptions(taskId);
        };
    });
}

// 绑定导航事件
function bindNavEvents() {
    container.querySelectorAll('.pomodoro-nav-item').forEach(nav => {
        nav.onclick = () => {
            const view = nav.dataset.view;
            switch (view) {
                case 'tasks':
                    renderTaskList();
                    break;
                case 'tasksets':
                    renderTaskSets();
                    break;
                case 'stats':
                    showStats();
                    break;
                case 'timeline':
                    renderTimeline();
                    break;
            }
        };
    });
}

// 显示添加任务对话框
function showAddTaskDialog(taskSetId = null, taskSetName = null) {
    const existingDialog = document.getElementById('add-task-dialog');
    if (existingDialog) {
        document.body.removeChild(existingDialog);
    }
    
    const dialog = document.createElement('div');
    dialog.id = 'add-task-dialog';
    dialog.className = 'pomodoro-dialog';
    dialog.innerHTML = `
        <div class="pomodoro-dialog-overlay"></div>
        <div class="pomodoro-dialog-content">
            <div class="pomodoro-dialog-header">
                <h3>添加待办任务</h3>
                <button class="close-btn">×</button>
            </div>
            <div class="pomodoro-dialog-body">
                <div class="input-group">
                    <label>任务名称</label>
                    <input type="text" id="task-title" placeholder="例如：英语、数学" />
                </div>
                <div class="input-group">
                    <label>时长（分钟）</label>
                    <input type="number" id="task-duration" value="25" min="1" max="120" />
                </div>
                <div class="input-group">
                    <label>颜色</label>
                    <div class="pomodoro-color-picker">
                        ${TASK_COLORS.map((color, i) => `
                            <div class="pomodoro-color-option ${i === 0 ? 'selected' : ''}" 
                                 data-index="${i}" 
                                 style="background: ${color.bg};"></div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="pomodoro-dialog-actions">
                <button class="cancel-btn" id="cancel-add-btn">取消</button>
                <button class="save-btn" id="confirm-add-btn">添加</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    let selectedColorIndex = 0;
    
    dialog.querySelectorAll('.pomodoro-color-option').forEach(opt => {
        opt.onclick = () => {
            dialog.querySelectorAll('.pomodoro-color-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedColorIndex = parseInt(opt.dataset.index);
        };
    });
    
    const closeBtn = dialog.querySelector('.close-btn');
    const overlay = dialog.querySelector('.pomodoro-dialog-overlay');
    const cancelBtn = document.getElementById('cancel-add-btn');
    const confirmBtn = document.getElementById('confirm-add-btn');
    
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
    
    confirmBtn.onclick = async () => {
        const title = document.getElementById('task-title').value.trim();
        const duration = parseInt(document.getElementById('task-duration').value) || 25;
        
        if (!title) {
            showToast('请输入任务名称');
            return;
        }
        
        const task = {
            id: generateId(),
            title,
            duration,
            colorIndex: selectedColorIndex,
            timerType: 'countdown',
            totalSeconds: 0,
            status: 'active',
            taskSetId: taskSetId,
            taskSetName: taskSetName,
            createdAt: new Date().toISOString()
        };
        
        await db.put(STORES.POMODORO_TASKS, task);
        showToast('任务已添加');
        closeDialog();
        
        if (taskSetId) {
            renderTaskSets();
        } else {
            renderTaskList();
        }
    };
    
    requestAnimationFrame(() => {
        dialog.classList.add('visible');
        document.getElementById('task-title').focus();
    });
}

// 显示添加待办集对话框
function showAddTaskSetDialog() {
    const existingDialog = document.getElementById('add-taskset-dialog');
    if (existingDialog) {
        document.body.removeChild(existingDialog);
    }
    
    const dialog = document.createElement('div');
    dialog.id = 'add-taskset-dialog';
    dialog.className = 'pomodoro-dialog';
    dialog.innerHTML = `
        <div class="pomodoro-dialog-overlay"></div>
        <div class="pomodoro-dialog-content">
            <div class="pomodoro-dialog-header">
                <h3>创建待办集</h3>
                <button class="close-btn">×</button>
            </div>
            <div class="pomodoro-dialog-body">
                <div class="input-group">
                    <label>待办集名称</label>
                    <input type="text" id="taskset-name" placeholder="例如：高考复习、项目开发" />
                </div>
            </div>
            <div class="pomodoro-dialog-actions">
                <button class="cancel-btn" id="cancel-taskset-btn">取消</button>
                <button class="save-btn" id="confirm-taskset-btn">创建</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    const closeBtn = dialog.querySelector('.close-btn');
    const overlay = dialog.querySelector('.pomodoro-dialog-overlay');
    const cancelBtn = document.getElementById('cancel-taskset-btn');
    const confirmBtn = document.getElementById('confirm-taskset-btn');
    
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
    
    confirmBtn.onclick = async () => {
        const name = document.getElementById('taskset-name').value.trim();
        
        if (!name) {
            showToast('请输入待办集名称');
            return;
        }
        
        const taskSetId = generateId();
        showToast('待办集已创建');
        closeDialog();
        showAddTaskToSetDialog({ id: taskSetId, name: name });
    };
    
    requestAnimationFrame(() => {
        dialog.classList.add('visible');
        document.getElementById('taskset-name').focus();
    });
}

// 添加任务到待办集
function showAddTaskToSetDialog(taskSet) {
    showAddTaskDialog(taskSet.id, taskSet.name);
}

// 显示任务选项
async function showTaskOptions(taskId) {
    const task = await db.get(STORES.POMODORO_TASKS, taskId);
    if (!task) return;
    
    const existingDialog = document.getElementById('task-options-dialog');
    if (existingDialog) {
        document.body.removeChild(existingDialog);
    }
    
    const dialog = document.createElement('div');
    dialog.id = 'task-options-dialog';
    dialog.className = 'pomodoro-dialog';
    dialog.innerHTML = `
        <div class="pomodoro-dialog-overlay"></div>
        <div class="pomodoro-dialog-content" style="max-width: 300px;">
            <div class="pomodoro-dialog-header">
                <h3>${task.title}</h3>
                <button class="close-btn">×</button>
            </div>
            <div class="pomodoro-task-options">
                <button class="pomodoro-option-btn" id="start-task-btn">
                    <span>▶️</span>
                    <span>开始计时</span>
                </button>
                <button class="pomodoro-option-btn" id="edit-task-btn">
                    <span>✏️</span>
                    <span>编辑任务</span>
                </button>
                <button class="pomodoro-option-btn" id="complete-task-btn">
                    <span>✅</span>
                    <span>完成任务</span>
                </button>
                <button class="pomodoro-option-btn danger" id="delete-task-btn">
                    <span>🗑️</span>
                    <span>删除任务</span>
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    const closeBtn = dialog.querySelector('.close-btn');
    const overlay = dialog.querySelector('.pomodoro-dialog-overlay');
    
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
    
    document.getElementById('start-task-btn').onclick = () => {
        closeDialog();
        startTimer(task);
    };
    
    document.getElementById('edit-task-btn').onclick = () => {
        closeDialog();
        showEditTaskDialog(task);
    };
    
    document.getElementById('complete-task-btn').onclick = async () => {
        task.status = 'completed';
        task.completedAt = new Date().toISOString();
        await db.put(STORES.POMODORO_TASKS, task);
        showToast('任务已完成');
        closeDialog();
        renderTaskList();
    };
    
    document.getElementById('delete-task-btn').onclick = async () => {
        if (confirm('确定删除此任务吗？')) {
            await db.delete(STORES.POMODORO_TASKS, taskId);
            showToast('任务已删除');
            closeDialog();
            renderTaskList();
        }
    };
    
    requestAnimationFrame(() => {
        dialog.classList.add('visible');
    });
}

// 显示编辑任务对话框
function showEditTaskDialog(task) {
    const existingDialog = document.getElementById('edit-task-dialog');
    if (existingDialog) {
        document.body.removeChild(existingDialog);
    }
    
    const dialog = document.createElement('div');
    dialog.id = 'edit-task-dialog';
    dialog.className = 'pomodoro-dialog';
    dialog.innerHTML = `
        <div class="pomodoro-dialog-overlay"></div>
        <div class="pomodoro-dialog-content">
            <div class="pomodoro-dialog-header">
                <h3>编辑任务</h3>
                <button class="close-btn">×</button>
            </div>
            <div class="pomodoro-dialog-body">
                <div class="input-group">
                    <label>任务名称</label>
                    <input type="text" id="edit-task-title" value="${task.title}" />
                </div>
                <div class="input-group">
                    <label>时长（分钟）</label>
                    <input type="number" id="edit-task-duration" value="${task.duration || 25}" min="1" max="120" />
                </div>
            </div>
            <div class="pomodoro-dialog-actions">
                <button class="cancel-btn" id="cancel-edit-btn">取消</button>
                <button class="save-btn" id="confirm-edit-btn">保存</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    const closeBtn = dialog.querySelector('.close-btn');
    const overlay = dialog.querySelector('.pomodoro-dialog-overlay');
    const cancelBtn = document.getElementById('cancel-edit-btn');
    const confirmBtn = document.getElementById('confirm-edit-btn');
    
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
    
    confirmBtn.onclick = async () => {
        const title = document.getElementById('edit-task-title').value.trim();
        const duration = parseInt(document.getElementById('edit-task-duration').value) || 25;
        
        if (!title) {
            showToast('请输入任务名称');
            return;
        }
        
        task.title = title;
        task.duration = duration;
        task.updatedAt = new Date().toISOString();
        await db.put(STORES.POMODORO_TASKS, task);
        showToast('任务已更新');
        closeDialog();
        renderTaskList();
    };
    
    requestAnimationFrame(() => {
        dialog.classList.add('visible');
        document.getElementById('edit-task-title').focus();
    });
}

// 开始计时
function startTimer(task) {
    currentTask = task;
    currentView = 'timer';
    timerSeconds = (task.duration || 25) * 60;
    timerType = 'countdown';
    countdownMinutes = task.duration || 25;
    isTimerRunning = true;
    
    const quote = getRandomQuote();
    const background = getRandomBackground();
    
    window.lnChat.appTitle.textContent = '计时中';
    headerActions.innerHTML = '';
    
    container.innerHTML = `
        <div class="pomodoro-timer-view" style="background-image: url('${background}');">
            <div class="pomodoro-timer-overlay"></div>
            
            <div class="pomodoro-timer-content">
                <div class="pomodoro-quote">
                    <span class="quote-mark">"</span>
                    <span class="quote-text">${quote}</span>
                </div>
                
                <div class="pomodoro-timer-display">
                    <span id="timer-display">${formatTime(timerSeconds)}</span>
                </div>
                
                <div class="pomodoro-timer-task">
                    <div class="pomodoro-timer-task-title">${task.title}</div>
                    <div class="pomodoro-timer-task-status">进行中</div>
                </div>
                
                <div class="pomodoro-timer-hint">
                    请适量增加音量以播放通知铃声
                </div>
                
                <div class="pomodoro-timer-controls">
                    <button class="pomodoro-control-btn" id="settings-btn">⚙️</button>
                    <button class="pomodoro-control-btn" id="minimize-btn">🔽</button>
                    <button class="pomodoro-control-btn" id="pause-btn">⏸️</button>
                    <button class="pomodoro-control-btn" id="restart-btn">🔄</button>
                    <button class="pomodoro-control-btn" id="apps-btn">📱</button>
                    <button class="pomodoro-control-btn" id="stop-btn">⏹️</button>
                </div>
            </div>
        </div>
    `;
    
    startTimerInterval();
    
    document.getElementById('pause-btn').onclick = () => {
        if (isTimerRunning) {
            pauseTimer();
            document.getElementById('pause-btn').textContent = '▶️';
        } else {
            resumeTimer();
            document.getElementById('pause-btn').textContent = '⏸️';
        }
    };
    
    document.getElementById('stop-btn').onclick = async () => {
        if (confirm('确定结束此次计时吗？')) {
            await stopTimer();
            renderTaskList();
        }
    };
    
    document.getElementById('restart-btn').onclick = () => {
        if (confirm('确定重新开始计时吗？')) {
            timerSeconds = countdownMinutes * 60;
            updateTimerDisplay();
        }
    };
    
    document.getElementById('settings-btn').onclick = () => showToast('设置功能开发中');
    document.getElementById('minimize-btn').onclick = () => showToast('最小化功能开发中');
    document.getElementById('apps-btn').onclick = () => showToast('应用功能开发中');
}

function startTimerInterval() {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
    timerInterval = setInterval(() => {
        if (!isTimerRunning) return;
        
        timerSeconds--;
        if (timerSeconds <= 0) {
            timerSeconds = 0;
            completeTimer();
        }
        
        updateTimerDisplay();
    }, 1000);
}

function updateTimerDisplay() {
    const display = document.getElementById('timer-display');
    if (display) {
        display.textContent = formatTime(timerSeconds);
    }
}

function pauseTimer() {
    isTimerRunning = false;
}

function resumeTimer() {
    isTimerRunning = true;
}

async function stopTimer() {
    isTimerRunning = false;
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    if (currentTask) {
        const elapsedSeconds = (countdownMinutes * 60) - timerSeconds;
        if (elapsedSeconds > 0) {
            const record = {
                id: generateId(),
                taskId: currentTask.id,
                taskTitle: currentTask.title,
                seconds: elapsedSeconds,
                type: 'countdown',
                date: new Date().toISOString().split('T')[0],
                createdAt: new Date().toISOString()
            };
            await db.put(STORES.POMODORO_RECORDS, record);
            
            currentTask.totalSeconds = (currentTask.totalSeconds || 0) + elapsedSeconds;
            await db.put(STORES.POMODORO_TASKS, currentTask);
        }
    }
    
    currentTask = null;
    timerSeconds = 0;
}

async function completeTimer() {
    isTimerRunning = false;
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQQBWajUx5J0KwNXodHDgW4jB1uc0bxycioQWZfLtWdrKxRbk8axX2spGl2PyqhUZCkeXozMplZjJCJilM2hTWAfIGCXz5xJXx0hXpnRmEVdHSNemNCVQlweJl6Y0pFBWh0oXpjUjT1YHilemteKOFYeK16Y2IY1Uh4sXpnbgzJPHy5dm92AMFALX5jffjFKC');
        audio.play();
    } catch (e) {
        console.log('无法播放通知音');
    }
    
    showToast('🎉 番茄钟完成！');
    
    if (currentTask) {
        const record = {
            id: generateId(),
            taskId: currentTask.id,
            taskTitle: currentTask.title,
            seconds: countdownMinutes * 60,
            type: 'countdown',
            completed: true,
            date: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString()
        };
        await db.put(STORES.POMODORO_RECORDS, record);
        
        currentTask.totalSeconds = (currentTask.totalSeconds || 0) + record.seconds;
        await db.put(STORES.POMODORO_TASKS, currentTask);
    }
    
    currentTask = null;
    
    setTimeout(() => {
        renderTaskList();
    }, 2000);
}

// 显示统计
async function showStats() {
    currentView = 'stats';
    const records = await db.getAll(STORES.POMODORO_RECORDS);
    const tasks = await db.getAll(STORES.POMODORO_TASKS);
    
    const today = new Date().toISOString().split('T')[0];
    const todayRecords = records.filter(r => r.date === today);
    const todaySeconds = todayRecords.reduce((sum, r) => sum + (r.seconds || 0), 0);
    const todayCount = todayRecords.length;
    
    const totalSeconds = records.reduce((sum, r) => sum + (r.seconds || 0), 0);
    const totalCount = records.length;
    
    window.lnChat.appTitle.textContent = '统计';
    headerActions.innerHTML = '';
    
    container.innerHTML = `
        <div class="pomodoro-stats-view">
            <div class="pomodoro-stats-content">
                <div class="pomodoro-stats-card">
                    <div class="pomodoro-stats-title">今日专注</div>
                    <div class="pomodoro-stats-value">${formatTime(todaySeconds)}</div>
                    <div class="pomodoro-stats-sub">${todayCount} 个番茄钟</div>
                </div>
                <div class="pomodoro-stats-card">
                    <div class="pomodoro-stats-title">累计专注</div>
                    <div class="pomodoro-stats-value">${Math.floor(totalSeconds / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m</div>
                    <div class="pomodoro-stats-sub">${totalCount} 个番茄钟</div>
                </div>
                
                <div class="pomodoro-stats-card">
                    <div class="pomodoro-stats-title">任务数</div>
                    <div class="pomodoro-stats-value">${tasks.length}</div>
                    <div class="pomodoro-stats-sub">活跃: ${tasks.filter(t => t.status === 'active').length} / 完成: ${tasks.filter(t => t.status === 'completed').length}</div>
                </div>
                
                <div class="pomodoro-recent-records">
                    <h3>最近记录</h3>
                    ${records.slice(-10).reverse().map(r => `
                        <div class="pomodoro-record-item">
                            <div class="pomodoro-record-title">${r.taskTitle || '未知任务'}</div>
                            <div class="pomodoro-record-time">${formatTime(r.seconds || 0)}</div>
                            <div class="pomodoro-record-date">${r.date}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            ${renderBottomNav('stats')}
        </div>
    `;
    
    bindNavEvents();
}