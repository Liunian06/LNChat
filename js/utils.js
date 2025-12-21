/**
 * LNChat 通用工具函数模块
 */

// 生成唯一ID
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 格式化日期 (YYYY年MM月DD日 星期X)
export function formatDate(dateInput) {
    const date = new Date(dateInput);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const weekDay = weekDays[date.getDay()];
    
    return `${year}年${month}月${day}日 ${weekDay}`;
}

// 获取当前时间戳 (YYYY-MM-DD HH:mm:SS)
export function getCurrentTimestamp(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 格式化时间 (HH:mm)
export function formatTime(dateInput) {
    let date;
    if (typeof dateInput === 'string' && dateInput.includes(':')) {
        // 尝试解析 YYYY-MM-DD HH:mm:SS 或 ISO 字符串
        date = new Date(dateInput.replace(/-/g, '/')); // 尝试兼容 Safari
        if (isNaN(date.getTime())) date = new Date(dateInput);
    } else {
        date = new Date(dateInput);
    }

    if (isNaN(date.getTime())) return '';

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// 显示 Toast 提示
export function showToast(message, duration = 3000) {
    let toast = document.querySelector('.ln-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'ln-toast';
        document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.classList.add('visible');
    
    setTimeout(() => {
        toast.classList.remove('visible');
    }, duration);
}

// 获取心情表情
export function getMoodEmoji(mood) {
    const moodEmojis = {
        '开心': '😊',
        '快乐': '😄',
        '平静': '😌',
        '忧郁': '😔',
        '悲伤': '😢',
        '愤怒': '😠',
        '焦虑': '😰',
        '兴奋': '🤩',
        '疲惫': '😴',
        '感激': '🙏'
    };
    return moodEmojis[mood] || '😐';
}

// 获取默认的全局系统提示词 (从文件加载)
let cachedPrompt = null;
export async function getDefaultSystemPrompt() {
    if (cachedPrompt !== null) return cachedPrompt;
    
    try {
        const response = await fetch('assets/system_prompt.txt');
        if (response.ok) {
            cachedPrompt = await response.text();
        } else {
            console.error('Failed to load system prompt:', response.status);
            cachedPrompt = '';
        }
    } catch (error) {
        console.error('Error loading system prompt:', error);
        cachedPrompt = '';
    }
    return cachedPrompt;
}

// Markdown 转 HTML (使用 marked 库)
export function simpleMarkdown(text) {
    if (!text) return '';
    
    // 检查是否引入了 marked 库
    if (typeof marked !== 'undefined') {
        try {
            return marked.parse(text, {
                breaks: true, // 启用换行符转 <br>
                gfm: true     // 启用 GitHub 风格 Markdown
            });
        } catch (e) {
            console.error('Markdown parsing failed:', e);
        }
    }

    // 降级处理：简单的正则替换
    return text
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
}
