/**
 * LNChat 设置模块
 */

import { db, STORES } from '../db.js';
import { showToast } from '../utils.js';

let container;

export async function init(target) {
    container = target;
    renderSettings();
}

async function renderSettings() {
    const settings = await getSettings();
    
    container.innerHTML = `
        <div class="settings-container" style="padding: 20px">
            <section>
                <h3>AI 配置</h3>
                <div class="input-group">
                    <label>API URL</label>
                    <input type="text" id="api-url" value="${settings.apiUrl}">
                </div>
                <div class="input-group">
                    <label>API Key</label>
                    <input type="password" id="api-key" value="${settings.apiKey}">
                </div>
                <div class="input-group">
                    <label>模型名称</label>
                    <input type="text" id="api-model" value="${settings.model}">
                </div>
                <div class="input-group">
                    <label>回复延迟 (秒)</label>
                    <input type="number" id="reply-delay" value="${settings.replyDelay}">
                </div>
                <button class="save-btn" id="save-settings">保存 AI 设置</button>
            </section>

            <section style="margin-top: 40px">
                <h3>数据管理</h3>
                <p style="font-size:12px; color:#666; margin-bottom:10px">由于使用了 IndexedDB，数据将更安全地存储在浏览器中。</p>
                <div style="display:flex; gap:10px">
                    <button class="save-btn" id="export-btn" style="background:#4CAF50">导出备份</button>
                    <button class="save-btn" id="import-btn" style="background:#FF9800">导入备份</button>
                    <input type="file" id="import-input" accept=".json" style="display:none">
                </div>
            </section>
        </div>
    `;

    document.getElementById('save-settings').onclick = async () => {
        const newSettings = {
            apiUrl: document.getElementById('api-url').value.trim(),
            apiKey: document.getElementById('api-key').value.trim(),
            model: document.getElementById('api-model').value.trim(),
            replyDelay: parseInt(document.getElementById('reply-delay').value) || 0,
            contextCount: 20
        };
        await db.put(STORES.SETTINGS, { key: 'ai_settings', ...newSettings });
        showToast('设置已保存');
    };

    document.getElementById('export-btn').onclick = exportData;
    
    const importInput = document.getElementById('import-input');
    document.getElementById('import-btn').onclick = () => importInput.click();
    importInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) importData(file);
    };
}

async function getSettings() {
    const s = await db.get(STORES.SETTINGS, 'ai_settings');
    return s || {
        apiUrl: 'https://api.siliconflow.cn/v1/chat/completions',
        apiKey: '',
        model: 'vendor/model-name',
        replyDelay: 6
    };
}

async function exportData() {
    const data = {};
    for (const store of Object.values(STORES)) {
        data[store] = await db.getAll(store);
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LNChat_Backup_${new Date().getTime()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('备份导出成功');
}

async function importData(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!confirm('导入将覆盖当前所有数据，确定吗？')) return;
            
            for (const [store, items] of Object.entries(data)) {
                if (Object.values(STORES).includes(store)) {
                    await db.clear(store);
                    for (const item of items) {
                        await db.put(store, item);
                    }
                }
            }
            showToast('导入成功，即将刷新');
            setTimeout(() => location.reload(), 1500);
        } catch (err) {
            showToast('导入失败: ' + err.message);
        }
    };
    reader.readAsText(file);
}
