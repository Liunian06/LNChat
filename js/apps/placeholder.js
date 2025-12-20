/**
 * LNChat 通用占位应用模块
 */

export function init(container) {
    const appId = container.parentElement.id; // 简单模拟
    container.innerHTML = `
        <div class="placeholder-app" style="padding: 40px; text-align: center; color: #999">
            <div style="font-size: 64px; margin-bottom: 20px">🚧</div>
            <h3>应用开发中</h3>
            <p>更多功能敬请期待...</p>
        </div>
    `;
}
