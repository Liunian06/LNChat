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

// 格式化时间 (HH:mm)
export function formatTime(dateInput) {
    const date = new Date(dateInput);
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

// 简单的 Markdown 转 HTML (处理换行和加粗)
export function simpleMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
}
