/**
 * LNChat 设置模块
 */

import { db, STORES } from '../db.js';
import { showToast, generateId, getDefaultSystemPrompt, getCurrentTimestamp } from '../utils.js';
import { Logger, LOG_TYPES } from '../logger.js';
import { getLocation } from '../location.js';
import { getWeather } from '../weather.js';

let container, headerActions;
let originalBackBtnClick;

export async function init(target, actions) {
    container = target;
    headerActions = actions;
    originalBackBtnClick = window.lnChat.backBtn.onclick;
    renderMenu();
}

function setSubPageBackBehavior() {
    window.lnChat.backBtn.onclick = () => {
        renderMenu();
    };
}

function restoreBackBehavior() {
    window.lnChat.backBtn.onclick = originalBackBtnClick;
}

async function renderMenu() {
    restoreBackBehavior();
    window.lnChat.appTitle.textContent = '设置';
    headerActions.innerHTML = '';
    
    container.innerHTML = `
        <div class="list-container">
            <div class="item" id="menu-api">
                <div class="mood-icon">🔑</div>
                <div class="info">
                    <div class="name">API 设置</div>
                    <div class="desc">配置 AI 接口、密钥和模型</div>
                </div>
            </div>
            <div class="item" id="menu-prompt">
                <div class="mood-icon">📝</div>
                <div class="info">
                    <div class="name">提示词设置</div>
                    <div class="desc">自定义全局系统提示词</div>
                </div>
            </div>
            <div class="item" id="menu-appearance">
                <div class="mood-icon">🎨</div>
                <div class="info">
                    <div class="name">外观设置</div>
                    <div class="desc">壁纸与主题设置</div>
                </div>
            </div>
            <div class="item" id="menu-backup">
                <div class="mood-icon">💾</div>
                <div class="info">
                    <div class="name">数据备份与导出</div>
                    <div class="desc">导出或导入您的聊天记录和设置</div>
                </div>
            </div>
            <div class="item" id="menu-dev">
                <div class="mood-icon">🛠️</div>
                <div class="info">
                    <div class="name">开发者模式</div>
                    <div class="desc">日志记录与调试选项</div>
                </div>
            </div>
            <div class="item" id="menu-about">
                <div class="mood-icon">ℹ️</div>
                <div class="info">
                    <div class="name">关于</div>
                    <div class="desc">版本信息与说明</div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('menu-api').onclick = renderApiSettings;
    document.getElementById('menu-prompt').onclick = renderPromptSettings;
    document.getElementById('menu-appearance').onclick = renderAppearanceSettings;
    document.getElementById('menu-backup').onclick = renderBackupSettings;
    document.getElementById('menu-dev').onclick = renderDevSettings;
    document.getElementById('menu-about').onclick = renderAbout;
}

async function renderApiSettings() {
    setSubPageBackBehavior();
    window.lnChat.appTitle.textContent = 'API 设置';
    let settings = await getSettings();
    
    // 确保有默认值
    if (!settings.mainPresetId) settings.mainPresetId = settings.presets[0].id;
    if (!settings.funcPresetId) settings.funcPresetId = 'same_as_main'; // 特殊值：跟随主API

    // 当前正在编辑的预设
    let editingPreset = settings.presets.find(p => p.id === settings.activePresetId) || settings.presets[0];

    const renderUI = () => {
        const mainPresetName = settings.presets.find(p => p.id === settings.mainPresetId)?.name || '未知预设';
        const funcPresetName = settings.funcPresetId === 'same_as_main' ? '跟随主 API' : (settings.presets.find(p => p.id === settings.funcPresetId)?.name || '未知预设');

        container.innerHTML = `
            <div class="settings-container" style="padding: 20px">
                <!-- 全局 API 分配 -->
                <section style="margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid var(--glass-border);">
                    <h3 style="margin-bottom: 15px; font-size: 16px; color: var(--primary-color);">全局 API 分配</h3>
                    
                    <div class="input-group">
                        <label>聊天主 API</label>
                        <div style="position:relative;">
                            <div id="main-preset-trigger" style="padding:14px; border:1px solid var(--glass-border); background:rgba(255, 255, 255, 0.08); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); border-radius:14px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
                                <span>${mainPresetName}</span>
                                <span style="font-size:12px; opacity:0.7">▼</span>
                            </div>
                            <div id="main-preset-list" style="position:absolute; top:100%; left:0; right:0; z-index:101; margin-top:5px; max-height:200px; overflow-y:auto; display:none; background:rgba(30,30,30,0.95); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); border-radius:14px; border:1px solid var(--glass-border); box-shadow:var(--shadow);">
                                ${settings.presets.map(p => `
                                    <div class="main-preset-option" data-id="${p.id}" style="padding:12px 15px; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.1); font-size:14px; color:white; ${p.id === settings.mainPresetId ? 'background:rgba(255,255,255,0.1);' : ''}">
                                        ${p.name}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        <p style="font-size:12px; color:var(--text-secondary); margin-top:5px">用于聊天对话的主要接口</p>
                    </div>

                    <div class="input-group">
                        <label>功能副 API</label>
                        <div style="position:relative;">
                            <div id="func-preset-trigger" style="padding:14px; border:1px solid var(--glass-border); background:rgba(255, 255, 255, 0.08); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); border-radius:14px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
                                <span>${funcPresetName}</span>
                                <span style="font-size:12px; opacity:0.7">▼</span>
                            </div>
                            <div id="func-preset-list" style="position:absolute; top:100%; left:0; right:0; z-index:101; margin-top:5px; max-height:200px; overflow-y:auto; display:none; background:rgba(30,30,30,0.95); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); border-radius:14px; border:1px solid var(--glass-border); box-shadow:var(--shadow);">
                                <div class="func-preset-option" data-id="same_as_main" style="padding:12px 15px; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.1); font-size:14px; color:white; ${settings.funcPresetId === 'same_as_main' ? 'background:rgba(255,255,255,0.1);' : ''}">
                                    跟随主 API
                                </div>
                                ${settings.presets.map(p => `
                                    <div class="func-preset-option" data-id="${p.id}" style="padding:12px 15px; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.1); font-size:14px; color:white; ${p.id === settings.funcPresetId ? 'background:rgba(255,255,255,0.1);' : ''}">
                                        ${p.name}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        <p style="font-size:12px; color:var(--text-secondary); margin-top:5px">用于日记分析、记忆整理等后台功能</p>
                    </div>
                </section>

                <!-- 预设管理 -->
                <section>
                    <h3 style="margin-bottom: 15px; font-size: 16px; color: var(--primary-color);">预设管理与编辑</h3>
                    <div class="input-group">
                        <label>编辑预设</label>
                        <div style="display:flex; gap:10px; position:relative;">
                            <div style="flex:1; position:relative;">
                                <div id="preset-dropdown-trigger" style="padding:14px; border:1px solid var(--glass-border); background:rgba(255, 255, 255, 0.08); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); border-radius:14px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
                                    <span>${editingPreset.name}</span>
                                    <span style="font-size:12px; opacity:0.7">▼</span>
                                </div>
                                <div id="preset-list-container" style="position:absolute; top:100%; left:0; right:0; z-index:100; margin-top:5px; max-height:200px; overflow-y:auto; display:none; background:rgba(30,30,30,0.95); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); border-radius:14px; border:1px solid var(--glass-border); box-shadow:var(--shadow);">
                                    ${settings.presets.map(p => `
                                        <div class="preset-item" data-id="${p.id}" style="padding:12px 15px; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.1); font-size:14px; color:white; ${p.id === settings.activePresetId ? 'background:rgba(255,255,255,0.1);' : ''}">
                                            ${p.name}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            <button class="save-btn" id="add-preset-btn" style="width:auto; padding:0 15px; background:var(--glass-bg); border:1px solid var(--glass-border)">➕</button>
                            <button class="save-btn" id="del-preset-btn" style="width:auto; padding:0 15px; background:rgba(244, 67, 54, 0.5); border:1px solid var(--glass-border)">🗑️</button>
                        </div>
                    </div>

                    <div class="input-group">
                        <label>预设名称</label>
                        <input type="text" id="preset-name" value="${editingPreset.name}">
                    </div>

                    <div class="input-group">
                        <label>API URL</label>
                        <input type="text" id="api-url" value="${editingPreset.apiUrl}">
                    </div>
                    <div class="input-group">
                        <label>API Key</label>
                        <input type="password" id="api-key" value="${editingPreset.apiKey}">
                    </div>
                    <div class="input-group">
                        <label>模型名称</label>
                        <div style="display:flex; gap:10px">
                            <input type="text" id="api-model" value="${editingPreset.model}" style="flex:1">
                            <button class="save-btn" id="fetch-models-btn" style="width:auto; padding:0 15px; background:var(--glass-bg); border:1px solid var(--glass-border)">拉取模型列表</button>
                        </div>
                        <div id="model-list-container" style="margin-top:10px; max-height:200px; overflow-y:auto; display:none; background:rgba(30,30,30,0.95); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); border-radius:14px; border:1px solid var(--glass-border); box-shadow:var(--shadow);"></div>
                    </div>
                    <div class="input-group">
                        <label>回复延迟 (秒)</label>
                        <input type="number" id="reply-delay" value="${editingPreset.replyDelay}">
                    </div>
                    <button class="save-btn" id="save-api-settings">保存当前预设</button>
                </section>
            </div>
        `;

        // --- 绑定事件 ---

        // 1. 主 API 下拉
        const mainTrigger = document.getElementById('main-preset-trigger');
        const mainList = document.getElementById('main-preset-list');
        setupDropdown(mainTrigger, mainList);
        mainList.querySelectorAll('.main-preset-option').forEach(item => {
            item.onclick = async () => {
                settings.mainPresetId = item.dataset.id;
                await db.put(STORES.SETTINGS, { key: 'ai_settings', ...settings });
                renderUI();
            };
        });

        // 2. 副 API 下拉
        const funcTrigger = document.getElementById('func-preset-trigger');
        const funcList = document.getElementById('func-preset-list');
        setupDropdown(funcTrigger, funcList);
        funcList.querySelectorAll('.func-preset-option').forEach(item => {
            item.onclick = async () => {
                settings.funcPresetId = item.dataset.id;
                await db.put(STORES.SETTINGS, { key: 'ai_settings', ...settings });
                renderUI();
            };
        });

        // 3. 编辑预设下拉
        const editTrigger = document.getElementById('preset-dropdown-trigger');
        const editList = document.getElementById('preset-list-container');
        setupDropdown(editTrigger, editList);
        editList.querySelectorAll('.preset-item').forEach(item => {
            item.onclick = async () => {
                settings.activePresetId = item.dataset.id;
                editingPreset = settings.presets.find(p => p.id === settings.activePresetId);
                await db.put(STORES.SETTINGS, { key: 'ai_settings', ...settings });
                renderUI();
            };
        });

        // 通用下拉框逻辑
        function setupDropdown(trigger, list) {
            trigger.onclick = (e) => {
                e.stopPropagation();
                // 关闭其他打开的下拉框
                [mainList, funcList, editList].forEach(l => {
                    if (l !== list) l.style.display = 'none';
                });
                list.style.display = list.style.display === 'none' ? 'block' : 'none';
            };
        }

        // 点击空白处关闭所有下拉框
        document.addEventListener('click', () => {
            [mainList, funcList, editList].forEach(l => {
                if (l) l.style.display = 'none';
            });
        }, { once: true });


        // 4. 按钮事件
        document.getElementById('add-preset-btn').onclick = async () => {
            const name = prompt('请输入新预设名称', '新预设');
            if (!name) return;
            const newPreset = {
                id: generateId(),
                name: name,
                apiUrl: editingPreset.apiUrl,
                apiKey: editingPreset.apiKey,
                model: editingPreset.model,
                replyDelay: editingPreset.replyDelay
            };
            settings.presets.push(newPreset);
            settings.activePresetId = newPreset.id;
            editingPreset = newPreset;
            await db.put(STORES.SETTINGS, { key: 'ai_settings', ...settings });
            renderUI();
            showToast('预设已添加');
        };

        document.getElementById('del-preset-btn').onclick = async () => {
            if (settings.presets.length <= 1) {
                return showToast('至少保留一个预设');
            }
            if (!confirm(`确定删除预设 "${editingPreset.name}" 吗？`)) return;
            
            // 如果删除的是当前选中的主/副 API，重置为默认
            if (settings.mainPresetId === editingPreset.id) settings.mainPresetId = settings.presets.find(p => p.id !== editingPreset.id).id;
            if (settings.funcPresetId === editingPreset.id) settings.funcPresetId = 'same_as_main';

            settings.presets = settings.presets.filter(p => p.id !== editingPreset.id);
            settings.activePresetId = settings.presets[0].id;
            editingPreset = settings.presets[0];
            await db.put(STORES.SETTINGS, { key: 'ai_settings', ...settings });
            renderUI();
            showToast('预设已删除');
        };

        document.getElementById('save-api-settings').onclick = async () => {
            editingPreset.name = document.getElementById('preset-name').value.trim();
            editingPreset.apiUrl = document.getElementById('api-url').value.trim();
            editingPreset.apiKey = document.getElementById('api-key').value.trim();
            editingPreset.model = document.getElementById('api-model').value.trim();
            editingPreset.replyDelay = parseInt(document.getElementById('reply-delay').value) || 0;
            
            await db.put(STORES.SETTINGS, { key: 'ai_settings', ...settings });
            await Logger.log(LOG_TYPES.SETTING, `Updated API settings for preset: ${editingPreset.name}`);
            showToast('设置已保存');
            renderUI();
        };

        document.getElementById('fetch-models-btn').onclick = async () => {
            const apiUrl = document.getElementById('api-url').value.trim();
            const apiKey = document.getElementById('api-key').value.trim();
            
            if (!apiUrl || !apiKey) {
                return showToast('请先填写 API URL 和 API Key');
            }

            const btn = document.getElementById('fetch-models-btn');
            const listContainer = document.getElementById('model-list-container');
            
            try {
                btn.disabled = true;
                btn.textContent = '拉取中...';
                
                let modelsUrl = apiUrl.replace(/\/chat\/completions$/, '/models');
                if (modelsUrl === apiUrl) {
                    const urlObj = new URL(apiUrl);
                    urlObj.pathname = urlObj.pathname.split('/').slice(0, -1).join('/') + '/models';
                    modelsUrl = urlObj.toString();
                }

                const response = await fetch(modelsUrl, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                
                const data = await response.json();
                let models = [];
                
                if (Array.isArray(data)) {
                    models = data;
                } else if (data.data && Array.isArray(data.data)) {
                    models = data.data;
                }

                if (models.length === 0) {
                    showToast('未获取到模型列表');
                    return;
                }

                const modelIds = models.map(m => typeof m === 'string' ? m : m.id).sort((a, b) => a.localeCompare(b));

                listContainer.innerHTML = modelIds.map(id => `
                    <div class="model-item" style="padding:12px 15px; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.1); font-size:14px; color:white;">
                        ${id}
                    </div>
                `).join('');
                
                listContainer.style.display = 'block';
                
                listContainer.querySelectorAll('.model-item').forEach(item => {
                    item.onclick = () => {
                        document.getElementById('api-model').value = item.textContent.trim();
                        listContainer.style.display = 'none';
                    };
                });

                showToast(`成功获取 ${modelIds.length} 个模型`);
            } catch (err) {
                console.error('获取模型失败:', err);
                showToast('获取模型失败: ' + err.message);
            } finally {
                btn.disabled = false;
                btn.textContent = '拉取模型列表';
            }
        };
    };

    renderUI();
}

async function renderPromptSettings() {
    setSubPageBackBehavior();
    window.lnChat.appTitle.textContent = '提示词设置';
    const settings = await getSettings();
    
    // 确保默认值
    if (settings.includeDate === undefined) settings.includeDate = true;
    if (settings.includeTime === undefined) settings.includeTime = true;
    if (settings.includeLocation === undefined) settings.includeLocation = false;
    if (settings.includeWeather === undefined) settings.includeWeather = false;
    if (settings.includeForecast === undefined) settings.includeForecast = false;
    if (settings.forecastDays === undefined) settings.forecastDays = 3;
    if (settings.includeBattery === undefined) settings.includeBattery = true;

    container.innerHTML = `
        <div class="settings-container" style="padding: 20px">
            <section>
                <div class="input-group">
                    <label>全局系统提示词</label>
                    <div style="padding: 15px; background: rgba(255,255,255,0.05); border-radius: 10px; border: 1px solid var(--glass-border); color: var(--text-secondary); font-size: 13px; max-height: 200px; overflow-y: auto; white-space: pre-wrap;">${settings.systemPrompt || '正在加载...'}</div>
                    <p style="font-size:12px; color:var(--text-secondary); margin-top:8px">系统提示词已锁定为使用 assets/system_prompt.txt 文件内容，以确保最佳体验。</p>
                </div>

                <div class="input-group">
                    <label>系统信息注入</label>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <span>附带当前日期</span>
                        <label class="switch">
                            <input type="checkbox" id="include-date" ${settings.includeDate ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <span>附带当前时间</span>
                        <label class="switch">
                            <input type="checkbox" id="include-time" ${settings.includeTime ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span>附带当前定位</span>
                        <label class="switch">
                            <input type="checkbox" id="include-location" ${settings.includeLocation ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    
                    <div id="location-preview-area" style="margin-top:10px; padding:10px; background:rgba(255,255,255,0.05); border-radius:8px; display:${settings.includeLocation ? 'block' : 'none'};">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <div style="font-size:12px; color:var(--text-secondary);">
                                <div>当前定位: <span id="location-val">${settings.locationData?.city || '未知'}</span></div>
                                <div style="font-size:10px; opacity:0.7; margin-top:2px;">更新时间: <span id="location-time">${settings.locationData ? getCurrentTimestamp(new Date(settings.locationData.timestamp)) : '-'}</span></div>
                            </div>
                            <button id="test-location-btn" style="font-size:12px; padding:4px 8px; background:var(--glass-bg); border:1px solid var(--glass-border); border-radius:4px; color:white; cursor:pointer;">刷新/测试</button>
                        </div>
                        
                        <div style="margin-top:10px;">
                            <div style="font-size:12px; color:var(--text-secondary); margin-bottom:5px;">手动输入城市:</div>
                            <div style="display:flex; gap:8px;">
                                <input type="text" id="manual-location-input" placeholder="例如: 北京、上海" value="${settings.manualLocation || ''}" style="flex:1; padding:6px 10px; border-radius:6px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.08); color:white; font-size:12px;">
                                <button id="save-manual-location-btn" style="font-size:12px; padding:4px 10px; background:var(--primary-color); border:1px solid var(--glass-border); border-radius:4px; color:white; cursor:pointer;">保存</button>
                            </div>
                            <div style="font-size:10px; color:var(--text-secondary); margin-top:5px; opacity:0.7;">提示: 手动输入将覆盖自动定位，适用于定位不准确的情况</div>
                        </div>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
                        <span>附带当前天气</span>
                        <label class="switch">
                            <input type="checkbox" id="include-weather" ${settings.includeWeather ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    
                    <div id="weather-preview-area" style="margin-top:10px; padding:10px; background:rgba(255,255,255,0.05); border-radius:8px; display:${settings.includeWeather ? 'block' : 'none'};">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="font-size:12px; color:var(--text-secondary);">
                                <div>当前天气: <span id="weather-val">${settings.weatherData ? `${settings.weatherData.temperature}, ${settings.weatherData.description}` : '未知'}</span></div>
                                <div style="font-size:10px; opacity:0.7; margin-top:2px;">更新时间: <span id="weather-time">${settings.weatherData ? getCurrentTimestamp(new Date(settings.weatherData.timestamp)) : '-'}</span></div>
                            </div>
                            <button id="test-weather-btn" style="font-size:12px; padding:4px 8px; background:var(--glass-bg); border:1px solid var(--glass-border); border-radius:4px; color:white; cursor:pointer;">刷新/测试</button>
                        </div>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
                        <span>附带未来天气预报</span>
                        <label class="switch">
                            <input type="checkbox" id="include-forecast" ${settings.includeForecast ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    
                    <div id="forecast-days-container" style="display:${settings.includeForecast ? 'flex' : 'none'}; justify-content:space-between; align-items:center; margin-top:10px; padding-left:10px; border-left:2px solid var(--glass-border);">
                        <span style="font-size:13px;">预报天数 (1-3天)</span>
                        <input type="number" id="forecast-days" value="${settings.forecastDays}" min="1" max="3" style="width:60px; padding:5px; border-radius:4px; border:none;">
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
                        <span>附带系统电量</span>
                        <label class="switch">
                            <input type="checkbox" id="include-battery" ${settings.includeBattery ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    
                    <div id="battery-preview-area" style="margin-top:10px; padding:10px; background:rgba(255,255,255,0.05); border-radius:8px; display:${settings.includeBattery ? 'block' : 'none'};">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:12px; color:var(--text-secondary);">当前电量: <span id="battery-val">获取中...</span></span>
                            <button id="test-battery-btn" style="font-size:12px; padding:4px 8px; background:var(--glass-bg); border:1px solid var(--glass-border); border-radius:4px; color:white; cursor:pointer;">刷新</button>
                        </div>
                    </div>

                    <p style="font-size:12px; color:var(--text-secondary); margin-top:8px">开启后，AI 将知道当前的现实时间、位置、天气与电量。</p>
                </div>

                <div class="input-group">
                    <label>聊天记录上下文数量 (当前: ${settings.contextCount || 2000})</label>
                    <input type="number" id="context-count" value="${settings.contextCount || 2000}" min="1" max="5000">
                    <p style="font-size:12px; color:var(--text-secondary); margin-top:8px">控制发送给 AI 的历史消息数量，范围：1-5000。数值越大上下文越完整，但消耗更多 token。</p>
                </div>
                <button class="save-btn" id="save-prompt-settings">保存设置</button>
            </section>
        </div>
    `;

    document.getElementById('include-location').onchange = (e) => {
        document.getElementById('location-preview-area').style.display = e.target.checked ? 'block' : 'none';
    };

    document.getElementById('test-location-btn').onclick = async () => {
        const btn = document.getElementById('test-location-btn');
        const val = document.getElementById('location-val');
        const timeVal = document.getElementById('location-time');
        btn.disabled = true;
        btn.textContent = '获取中...';
        try {
            const city = await getLocation(true); // Force refresh
            val.textContent = city || '获取失败';
            timeVal.textContent = getCurrentTimestamp();
            showToast('定位已更新');
        } catch (e) {
            val.textContent = '错误';
            showToast('定位失败: ' + e.message);
        } finally {
            btn.disabled = false;
            btn.textContent = '刷新/测试';
        }
    };

    // 手动输入城市保存按钮事件
    document.getElementById('save-manual-location-btn').onclick = async () => {
        const input = document.getElementById('manual-location-input');
        const city = input.value.trim();
        
        if (!city) {
            showToast('请输入城市名称');
            return;
        }
        
        // 更新设置中的手动定位
        settings.manualLocation = city;
        settings.locationData = {
            city: city,
            timestamp: Date.now(),
            isManual: true
        };
        
        await db.put(STORES.SETTINGS, { key: 'ai_settings', ...settings });
        
        // 更新显示
        document.getElementById('location-val').textContent = city;
        document.getElementById('location-time').textContent = getCurrentTimestamp();
        
        showToast(`已手动设置城市为: ${city}`);
    };

    document.getElementById('include-weather').onchange = (e) => {
        document.getElementById('weather-preview-area').style.display = e.target.checked ? 'block' : 'none';
    };

    document.getElementById('include-forecast').onchange = (e) => {
        document.getElementById('forecast-days-container').style.display = e.target.checked ? 'flex' : 'none';
    };

    document.getElementById('include-battery').onchange = (e) => {
        document.getElementById('battery-preview-area').style.display = e.target.checked ? 'block' : 'none';
        if (e.target.checked) updateBatteryPreview();
    };

    const updateBatteryPreview = async () => {
        const val = document.getElementById('battery-val');
        if ('getBattery' in navigator) {
            try {
                const battery = await navigator.getBattery();
                const level = Math.round(battery.level * 100);
                const charging = battery.charging ? '充电中' : '未充电';
                val.textContent = `${level}% (${charging})`;
            } catch (e) {
                val.textContent = '获取失败';
            }
        } else {
            val.textContent = '不支持';
        }
    };

    document.getElementById('test-battery-btn').onclick = updateBatteryPreview;

    if (settings.includeBattery) {
        updateBatteryPreview();
    }

    document.getElementById('test-weather-btn').onclick = async () => {
        const btn = document.getElementById('test-weather-btn');
        const val = document.getElementById('weather-val');
        const timeVal = document.getElementById('weather-time');
        
        // Need location first
        // Re-fetch settings to get latest location if updated
        const currentSettings = await getSettings();
        const city = currentSettings.locationData?.city;
        
        if (!city) {
            return showToast('请先获取定位');
        }

        btn.disabled = true;
        btn.textContent = '获取中...';
        try {
            const weather = await getWeather(city, true); // Force refresh
            if (weather) {
                val.textContent = `${weather.temperature}, ${weather.description}`;
                timeVal.textContent = getCurrentTimestamp(new Date(weather.timestamp));
                showToast('天气已更新');
            } else {
                val.textContent = '获取失败';
                showToast('获取天气失败');
            }
        } catch (e) {
            val.textContent = '错误';
            showToast('天气失败: ' + e.message);
        } finally {
            btn.disabled = false;
            btn.textContent = '刷新/测试';
        }
    };

    document.getElementById('save-prompt-settings').onclick = async () => {
        const contextCount = parseInt(document.getElementById('context-count').value);
        if (isNaN(contextCount) || contextCount < 1 || contextCount > 5000) {
            showToast('聊天记录数量必须在 1-5000 之间');
            return;
        }
        
        // 获取手动输入的城市
        const manualLocation = document.getElementById('manual-location-input').value.trim();
        
        const newSettings = {
            ...settings,
            // systemPrompt: document.getElementById('system-prompt').value.trim(), // 已移除自定义编辑
            contextCount: contextCount,
            includeDate: document.getElementById('include-date').checked,
            includeTime: document.getElementById('include-time').checked,
            includeLocation: document.getElementById('include-location').checked,
            includeWeather: document.getElementById('include-weather').checked,
            includeForecast: document.getElementById('include-forecast').checked,
            forecastDays: parseInt(document.getElementById('forecast-days').value) || 3,
            includeBattery: document.getElementById('include-battery').checked,
            manualLocation: manualLocation
        };
        
        // 如果手动输入了城市且与当前不同，更新位置数据
        if (manualLocation && manualLocation !== settings.manualLocation) {
            newSettings.locationData = {
                city: manualLocation,
                timestamp: Date.now(),
                isManual: true
            };
        }
        
        await db.put(STORES.SETTINGS, { key: 'ai_settings', ...newSettings });
        await Logger.log(LOG_TYPES.SETTING, `Updated prompt settings. Context count: ${contextCount}`);
        showToast('设置已保存');
    };
}

async function renderAppearanceSettings() {
    setSubPageBackBehavior();
    window.lnChat.appTitle.textContent = '外观设置';
    const settings = await getSettings();
    
    // 获取当前自定义壁纸（如果有）
    let customWallpaperUrl = '';
    try {
        const imgData = await db.get(STORES.IMAGES, 'custom_wallpaper');
        if (imgData && imgData.blob) {
            customWallpaperUrl = URL.createObjectURL(imgData.blob);
        }
    } catch (e) {
        console.error('获取自定义壁纸失败', e);
    }

    container.innerHTML = `
        <div class="settings-container" style="padding: 20px">
            <section>
                <div class="input-group" style="display:flex; justify-content:space-between; align-items:center;">
                    <label style="margin-bottom:0">启用 Bing 每日壁纸</label>
                    <label class="switch">
                        <input type="checkbox" id="bing-wallpaper-switch" ${settings.bingWallpaper ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
                <p style="font-size:12px; color:var(--text-secondary); margin-bottom:20px">自动获取 Bing 每日美图作为背景。</p>

                <div id="custom-wallpaper-section" style="display: ${settings.bingWallpaper ? 'none' : 'block'}">
                    <h3 style="font-size:16px; margin-bottom:15px; color:var(--primary-color)">自定义壁纸</h3>
                    
                    <div class="avatar-upload" id="wallpaper-upload-area" style="width:100%; height:200px; border-radius:15px; margin-bottom:15px;">
                        ${customWallpaperUrl
                            ? `<img src="${customWallpaperUrl}" style="width:100%; height:100%; object-fit:cover">`
                            : `<div class="upload-placeholder"><span>🖼️</span><p>点击上传图片</p></div>`
                        }
                    </div>
                    <input type="file" id="wallpaper-input" accept="image/*" style="display:none">
                    
                    <p style="font-size:12px; color:var(--text-secondary);">建议上传 16:9 或 9:16 的高清图片。</p>
                </div>
            </section>

            <section style="margin-top: 30px; padding-top: 20px; border-top: 1px solid var(--glass-border);">
                <h3 style="font-size:16px; margin-bottom:20px; color:var(--primary-color)">气泡样式</h3>
                
                <!-- 用户气泡 -->
                <div style="margin-bottom: 30px;">
                    <h4 style="font-size:14px; margin-bottom:10px; color:white;">用户气泡</h4>
                    <div id="preview-user" style="padding:12px 16px; border-radius:20px; border-bottom-right-radius:4px; display:inline-block; margin-bottom:15px; font-size:15px;">
                        你好，这是一条预览消息
                    </div>
                    
                    <div class="input-group" style="display:flex; gap:10px; align-items:center;">
                        <label style="width:80px; margin:0;">背景颜色</label>
                        <input type="color" id="user-bg-color" style="width:50px; height:30px; padding:0; border:none; border-radius:4px;">
                        <input type="range" id="user-bg-alpha" min="0" max="100" style="flex:1;">
                        <span id="user-bg-alpha-val" style="width:40px; text-align:right; font-size:12px;">100%</span>
                    </div>
                    <div class="input-group" style="display:flex; gap:10px; align-items:center;">
                        <label style="width:80px; margin:0;">文字颜色</label>
                        <input type="color" id="user-text-color" style="width:50px; height:30px; padding:0; border:none; border-radius:4px;">
                    </div>
                    <div class="input-group" style="display:flex; gap:10px; align-items:center;">
                        <label style="width:80px; margin:0;">圆角大小</label>
                        <input type="range" id="user-radius" min="0" max="30" style="flex:1;">
                        <span id="user-radius-val" style="width:40px; text-align:right; font-size:12px;">20px</span>
                    </div>
                </div>

                <!-- AI 气泡 -->
                <div style="margin-bottom: 20px;">
                    <h4 style="font-size:14px; margin-bottom:10px; color:white;">AI 气泡</h4>
                    <div id="preview-ai" style="padding:12px 16px; border-radius:20px; border-bottom-left-radius:4px; border:1px solid var(--glass-border); display:inline-block; margin-bottom:15px; font-size:15px;">
                        收到，正在为您处理...
                    </div>
                    
                    <div class="input-group" style="display:flex; gap:10px; align-items:center;">
                        <label style="width:80px; margin:0;">背景颜色</label>
                        <input type="color" id="ai-bg-color" style="width:50px; height:30px; padding:0; border:none; border-radius:4px;">
                        <input type="range" id="ai-bg-alpha" min="0" max="100" style="flex:1;">
                        <span id="ai-bg-alpha-val" style="width:40px; text-align:right; font-size:12px;">100%</span>
                    </div>
                    <div class="input-group" style="display:flex; gap:10px; align-items:center;">
                        <label style="width:80px; margin:0;">文字颜色</label>
                        <input type="color" id="ai-text-color" style="width:50px; height:30px; padding:0; border:none; border-radius:4px;">
                    </div>
                    <div class="input-group" style="display:flex; gap:10px; align-items:center;">
                        <label style="width:80px; margin:0;">圆角大小</label>
                        <input type="range" id="ai-radius" min="0" max="30" style="flex:1;">
                        <span id="ai-radius-val" style="width:40px; text-align:right; font-size:12px;">20px</span>
                    </div>
                </div>

                <button class="save-btn" id="reset-bubble-btn" style="background:rgba(255,255,255,0.1); border:1px solid var(--glass-border); margin-top:10px;">重置气泡样式</button>

                <!-- 高级 CSS -->
                <div style="margin-top: 20px; border-top: 1px solid var(--glass-border); padding-top: 20px;">
                    <div style="padding: 10px 0;">
                        <h4 style="font-size:14px; color:white; margin:0;">高级自定义 (CSS)</h4>
                    </div>
                    
                    <div style="margin-top:15px;">
                        <p style="font-size:12px; color:var(--text-secondary); margin-bottom:10px;">在此输入 CSS 属性，将直接应用到气泡元素。此设置优先级高于上方可视化设置。</p>
                        
                        <div class="input-group">
                            <label>用户气泡 (.message.user)</label>
                            <textarea id="user-custom-css" placeholder="例如: background: linear-gradient(45deg, #ff0000, #0000ff); border: 2px solid white;" style="height:80px; font-family:monospace; font-size:12px;"></textarea>
                        </div>

                        <div class="input-group">
                            <label>AI 普通回复 (<words>)</label>
                            <textarea id="ai-custom-css" placeholder="例如: box-shadow: 0 0 10px rgba(255,255,255,0.5);" style="height:80px; font-family:monospace; font-size:12px;"></textarea>
                        </div>

                        <div class="input-group">
                            <label>AI 动作 (<action>)</label>
                            <textarea id="action-custom-css" placeholder="例如: font-style: italic; color: #aaa;" style="height:80px; font-family:monospace; font-size:12px;"></textarea>
                        </div>

                        <div class="input-group">
                            <label>AI 思考 (<thought>)</label>
                            <textarea id="thought-custom-css" placeholder="例如: border: 1px dashed #666; opacity: 0.8;" style="height:80px; font-family:monospace; font-size:12px;"></textarea>
                        </div>

                        <div class="input-group">
                            <label>AI 状态/旁白 (<state>)</label>
                            <textarea id="state-custom-css" placeholder="例如: background: rgba(0,0,0,0.5); border-radius: 10px;" style="height:80px; font-family:monospace; font-size:12px;"></textarea>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    `;

    const switchBtn = document.getElementById('bing-wallpaper-switch');
    const customSection = document.getElementById('custom-wallpaper-section');
    const uploadArea = document.getElementById('wallpaper-upload-area');
    const fileInput = document.getElementById('wallpaper-input');

    // 切换 Bing 壁纸
    switchBtn.onchange = async (e) => {
        const isEnabled = e.target.checked;
        customSection.style.display = isEnabled ? 'none' : 'block';
        
        const newSettings = { ...settings, bingWallpaper: isEnabled };
        await db.put(STORES.SETTINGS, { key: 'ai_settings', ...newSettings });
        
        // 立即应用
        if (window.lnChat && window.lnChat.initWallpaper) {
            window.lnChat.initWallpaper();
        }
        showToast(isEnabled ? '已启用 Bing 壁纸' : '已切换至自定义壁纸');
    };

    // 上传自定义壁纸
    uploadArea.onclick = () => fileInput.click();
    
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            showToast('图片大小不能超过 5MB');
            return;
        }

        try {
            // 保存图片到 IndexedDB
            await db.put(STORES.IMAGES, {
                id: 'custom_wallpaper',
                blob: file,
                timestamp: Date.now()
            });

            // 更新预览
            const url = URL.createObjectURL(file);
            uploadArea.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover">`;
            
            // 确保设置已更新为禁用 Bing 壁纸（虽然 UI 上已经是这样，但为了保险）
            if (switchBtn.checked) {
                switchBtn.checked = false;
                const newSettings = { ...settings, bingWallpaper: false };
                await db.put(STORES.SETTINGS, { key: 'ai_settings', ...newSettings });
            }

            // 立即应用
            if (window.lnChat && window.lnChat.initWallpaper) {
                window.lnChat.initWallpaper();
            }
            showToast('壁纸已更新');
        } catch (err) {
            console.error(err);
            showToast('保存壁纸失败');
        }
    };

    // --- 气泡设置逻辑 ---
    
    const bubbleSettings = settings.bubbleSettings || {
        user: { bgColor: '#2196F3', textColor: '#ffffff', radius: 20 },
        assistant: { bgColor: 'rgba(255, 255, 255, 0.12)', textColor: '#ffffff', radius: 20 }
    };

    // 初始化控件值
    const initControls = (type, data) => {
        const { hex, alpha } = parseColorToHexAndAlpha(data.bgColor);
        document.getElementById(`${type}-bg-color`).value = hex;
        document.getElementById(`${type}-bg-alpha`).value = Math.round(alpha * 100);
        document.getElementById(`${type}-bg-alpha-val`).textContent = Math.round(alpha * 100) + '%';
        
        document.getElementById(`${type}-text-color`).value = data.textColor;
        
        document.getElementById(`${type}-radius`).value = data.radius;
        document.getElementById(`${type}-radius-val`).textContent = data.radius + 'px';

        updatePreview(type);
    };

    const updatePreview = (type) => {
        const hex = document.getElementById(`${type}-bg-color`).value;
        const alpha = document.getElementById(`${type}-bg-alpha`).value / 100;
        const bgColor = hexAndAlphaToRgba(hex, alpha);
        const textColor = document.getElementById(`${type}-text-color`).value;
        const radius = document.getElementById(`${type}-radius`).value;

        const preview = document.getElementById(`preview-${type}`);
        preview.style.backgroundColor = bgColor;
        preview.style.color = textColor;
        preview.style.borderRadius = radius + 'px';
        if (type === 'user') preview.style.borderBottomRightRadius = '4px';
        if (type === 'ai') preview.style.borderBottomLeftRadius = '4px';

        // 实时应用到全局
        const root = document.documentElement;
        if (type === 'user') {
            root.style.setProperty('--user-msg-bg', bgColor);
            root.style.setProperty('--user-msg-text', textColor);
            root.style.setProperty('--user-msg-radius', radius + 'px');
        } else {
            root.style.setProperty('--ai-msg-bg', bgColor);
            root.style.setProperty('--ai-msg-text', textColor);
            root.style.setProperty('--ai-msg-radius', radius + 'px');
        }
    };

    const saveBubbleSettings = async () => {
        const getUserData = () => {
            const hex = document.getElementById('user-bg-color').value;
            const alpha = document.getElementById('user-bg-alpha').value / 100;
            return {
                bgColor: hexAndAlphaToRgba(hex, alpha),
                textColor: document.getElementById('user-text-color').value,
                radius: parseInt(document.getElementById('user-radius').value)
            };
        };

        const getAiData = () => {
            const hex = document.getElementById('ai-bg-color').value;
            const alpha = document.getElementById('ai-bg-alpha').value / 100;
            return {
                bgColor: hexAndAlphaToRgba(hex, alpha),
                textColor: document.getElementById('ai-text-color').value,
                radius: parseInt(document.getElementById('ai-radius').value)
            };
        };

        const newSettings = {
            ...settings,
            bubbleSettings: {
                user: getUserData(),
                assistant: getAiData()
            }
        };

        await db.put(STORES.SETTINGS, { key: 'ai_settings', ...newSettings });
        // 更新本地 settings 对象，防止覆盖
        Object.assign(settings, newSettings);
    };

    // 绑定事件
    ['user', 'ai'].forEach(type => {
        initControls(type, type === 'user' ? bubbleSettings.user : bubbleSettings.assistant);

        const inputs = [
            `${type}-bg-color`, `${type}-bg-alpha`,
            `${type}-text-color`, `${type}-radius`
        ];

        inputs.forEach(id => {
            document.getElementById(id).oninput = (e) => {
                if (id.includes('alpha')) {
                    document.getElementById(`${type}-bg-alpha-val`).textContent = e.target.value + '%';
                }
                if (id.includes('radius')) {
                    document.getElementById(`${type}-radius-val`).textContent = e.target.value + 'px';
                }
                updatePreview(type);
                // 使用防抖保存，或者在 change 时保存
            };
            
            // 在 change 时保存 (松开滑块或关闭颜色选择器)
            document.getElementById(id).onchange = () => {
                saveBubbleSettings();
            };
        });
    });

    // 重置按钮
    document.getElementById('reset-bubble-btn').onclick = async () => {
        if (!confirm('确定要重置气泡样式为默认值吗？')) return;
        
        const defaultBubbles = {
            user: { bgColor: '#2196F3', textColor: '#ffffff', radius: 20 },
            assistant: { bgColor: 'rgba(255, 255, 255, 0.12)', textColor: '#ffffff', radius: 20 }
        };

        const newSettings = {
            ...settings,
            bubbleSettings: defaultBubbles
        };

        await db.put(STORES.SETTINGS, { key: 'ai_settings', ...newSettings });
        Object.assign(settings, newSettings);
        
        initControls('user', defaultBubbles.user);
        initControls('ai', defaultBubbles.assistant);
        showToast('气泡样式已重置');
    };

    // --- 高级 CSS 逻辑 ---
    const customCss = settings.customCss || { user: '', assistant: '', action: '', thought: '', state: '' };
    
    document.getElementById('user-custom-css').value = customCss.user || '';
    document.getElementById('ai-custom-css').value = customCss.assistant || '';
    document.getElementById('action-custom-css').value = customCss.action || '';
    document.getElementById('thought-custom-css').value = customCss.thought || '';
    document.getElementById('state-custom-css').value = customCss.state || '';

    // 实时预览 CSS
    const updateCssPreview = () => {
        let styleTag = document.getElementById('custom-bubble-css');
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'custom-bubble-css';
            document.head.appendChild(styleTag);
        }

        const userCss = document.getElementById('user-custom-css').value;
        const aiCss = document.getElementById('ai-custom-css').value;
        const actionCss = document.getElementById('action-custom-css').value;
        const thoughtCss = document.getElementById('thought-custom-css').value;
        const stateCss = document.getElementById('state-custom-css').value;
        
        let cssText = '';
        if (userCss) cssText += `.message.user { ${userCss} } \n`;
        if (aiCss) cssText += `.message.assistant.text { ${aiCss} } \n`;
        if (actionCss) cssText += `.message.assistant.action { ${actionCss} } \n`;
        if (thoughtCss) cssText += `.message.assistant.thought { ${thoughtCss} } \n`;
        if (stateCss) cssText += `.message.assistant.state { ${stateCss} } \n`;
        
        styleTag.textContent = cssText;
    };

    document.getElementById('user-custom-css').oninput = updateCssPreview;
    document.getElementById('ai-custom-css').oninput = updateCssPreview;
    document.getElementById('action-custom-css').oninput = updateCssPreview;
    document.getElementById('thought-custom-css').oninput = updateCssPreview;
    document.getElementById('state-custom-css').oninput = updateCssPreview;

    // 保存 CSS
    const saveCustomCss = async () => {
        const newSettings = {
            ...settings,
            customCss: {
                user: document.getElementById('user-custom-css').value,
                assistant: document.getElementById('ai-custom-css').value,
                action: document.getElementById('action-custom-css').value,
                thought: document.getElementById('thought-custom-css').value,
                state: document.getElementById('state-custom-css').value
            }
        };
        await db.put(STORES.SETTINGS, { key: 'ai_settings', ...newSettings });
        Object.assign(settings, newSettings);
    };

    document.getElementById('user-custom-css').onchange = saveCustomCss;
    document.getElementById('ai-custom-css').onchange = saveCustomCss;
    document.getElementById('action-custom-css').onchange = saveCustomCss;
    document.getElementById('thought-custom-css').onchange = saveCustomCss;
    document.getElementById('state-custom-css').onchange = saveCustomCss;
}

async function renderBackupSettings() {
    setSubPageBackBehavior();
    window.lnChat.appTitle.textContent = '数据备份与导出';
    
    container.innerHTML = `
        <div class="settings-container" style="padding: 20px">
            <section>
                <p style="font-size:14px; color:var(--text-secondary); margin-bottom:20px">由于使用了 IndexedDB，数据将更安全地存储在浏览器中。您可以定期导出备份以防数据丢失。</p>
                <div style="display:flex; flex-direction:column; gap:15px">
                    <button class="save-btn" id="export-btn" style="background:#4CAF50">导出备份 (.json)</button>
                    <button class="save-btn" id="import-btn" style="background:#FF9800">导入备份 (.json)</button>
                    <button class="save-btn" id="clear-data-btn" style="background:#f44336; margin-top: 20px;">⚠️ 清空所有数据</button>
                    <input type="file" id="import-input" accept=".json" style="display:none">
                </div>
            </section>
        </div>
    `;

    document.getElementById('export-btn').onclick = exportData;
    
    const importInput = document.getElementById('import-input');
    document.getElementById('import-btn').onclick = () => importInput.click();
    importInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) importData(file);
    };

    document.getElementById('clear-data-btn').onclick = async () => {
        if (confirm('⚠️ 警告：此操作将永久删除所有聊天记录、联系人、设置和图片！\n\n确定要继续吗？')) {
            if (confirm('再次确认：数据一旦删除无法恢复！\n\n真的要清空所有数据吗？')) {
                try {
                    await Logger.log(LOG_TYPES.ACTION, 'User cleared all data');
                    for (const store of Object.values(STORES)) {
                        await db.clear(store);
                    }
                    showToast('所有数据已清空，即将重启应用');
                    setTimeout(() => location.reload(), 1500);
                } catch (err) {
                    showToast('清空失败: ' + err.message);
                }
            }
        }
    };
}

async function renderDevSettings() {
    setSubPageBackBehavior();
    window.lnChat.appTitle.textContent = '开发者模式';
    const settings = await getSettings();
    
    container.innerHTML = `
        <div class="settings-container" style="padding: 20px">
            <section>
                <div class="input-group" style="display:flex; justify-content:space-between; align-items:center;">
                    <label style="margin-bottom:0">启用日志记录</label>
                    <label class="switch">
                        <input type="checkbox" id="dev-mode-switch" ${settings.devMode !== false ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
                <p style="font-size:12px; color:var(--text-secondary); margin-bottom:20px">记录 API 请求、错误和用户操作，便于调试。</p>

                <div class="input-group">
                    <label>日志保留天数 (1-30天)</label>
                    <input type="number" id="log-retention" value="${settings.logRetention || 7}" min="1" max="30">
                </div>

                <button class="save-btn" id="save-dev-settings">保存设置</button>
                
                <div style="margin-top: 30px; border-top: 1px solid var(--glass-border); padding-top: 20px;">
                    <h3 style="font-size:16px; margin-bottom:10px;">日志查看</h3>
                    <button class="save-btn" id="view-logs-btn" style="background:var(--glass-bg); border:1px solid var(--glass-border)">查看/导出日志</button>
                </div>
            </section>
        </div>
    `;

    document.getElementById('save-dev-settings').onclick = async () => {
        const devMode = document.getElementById('dev-mode-switch').checked;
        const retention = parseInt(document.getElementById('log-retention').value);
        
        if (isNaN(retention) || retention < 1 || retention > 30) {
            showToast('保留天数必须在 1-30 之间');
            return;
        }

        const newSettings = {
            ...settings,
            devMode: devMode,
            logRetention: retention
        };
        await db.put(STORES.SETTINGS, { key: 'ai_settings', ...newSettings });
        await Logger.log(LOG_TYPES.SETTING, `Updated dev settings. DevMode: ${devMode}, Retention: ${retention}`);
        showToast('设置已保存');
    };

    document.getElementById('view-logs-btn').onclick = async () => {
        const logs = await Logger.getLogs();
        const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // 格式化文件名: LNChat_Logs_YYYY-MM-DD-HH-mm-SS.json
        const timestamp = getCurrentTimestamp().replace(/ /g, '-').replace(/:/g, '-');
        a.download = `LNChat_Logs_${timestamp}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`已导出 ${logs.length} 条日志`);
    };
}

async function renderAbout() {
    setSubPageBackBehavior();
    window.lnChat.appTitle.textContent = '关于';
    
    container.innerHTML = `
        <div class="settings-container" style="padding: 20px">
            <div style="text-align: center; margin: 30px 0">
                <div style="font-size: 64px; margin-bottom: 10px">⚙️</div>
                <h2 style="margin-bottom: 5px">LNChat</h2>
                <p style="color: var(--text-secondary)">版本 1.0.0</p>
            </div>
            
            <section style="margin-bottom: 25px">
                <h3 style="margin-bottom: 10px; font-size: 16px">✨ 核心特性</h3>
                <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 15px; border: 1px solid var(--glass-border); font-size: 14px; line-height: 1.6">
                    <p>• <b>模块化架构</b>：基于 ES Modules 重构，逻辑清晰。</p>
                    <p>• <b>海量存储</b>：采用 IndexedDB，突破 5MB 限制。</p>
                    <p>• <b>AI 智能对话</b>：支持 OpenAI 兼容接口及上下文理解。</p>
                    <p>• <b>联系人管理</b>：自定义 AI 角色人设与模型参数。</p>
                    <p>• <b>个性化体验</b>：集成 Bing 每日壁纸与心情日记。</p>
                </div>
            </section>
 
            <section style="margin-bottom: 25px">
                <h3 style="margin-bottom: 10px; font-size: 16px">⚖️ 许可证</h3>
                <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 15px; border: 1px solid var(--glass-border); font-size: 13px; color: var(--text-secondary); line-height: 1.5">
                    <p>本项目采用 <b>CC BY-NC-SA 4.0</b> 许可协议。</p>
                    <p style="margin-top: 8px">• 允许二次传播与修改，但必须保留原作者署名。</p>
                    <p>• 严禁任何形式的商业销售行为。</p>
                    <p>• 衍生物（如角色卡、提示词）允许商业化。</p>
                </div>
            </section>

            <div style="text-align: center; margin-top: 40px; font-size: 12px; color: var(--text-secondary)">
                <p style="margin-bottom: 8px">GitHub: <a href="https://github.com/Liunian06/LNChat" target="_blank" style="color: var(--primary-color); text-decoration: none">Liunian06/LNChat</a></p>
                <p>© 2024 LNChat Team</p>
                <p style="margin-top: 5px">基于 Web 的 mobile 风格 AI 聊天应用</p>
            </div>
        </div>
    `;
}

async function getSettings() {
    const s = await db.get(STORES.SETTINGS, 'ai_settings');
    
    // 默认设置
    const defaultSettings = {
        activePresetId: 'default',
        mainPresetId: 'default',
        funcPresetId: 'same_as_main',
        presets: [
            {
                id: 'default',
                name: '默认预设',
                apiUrl: 'https://api.siliconflow.cn/v1/chat/completions',
                apiKey: '',
                model: 'vendor/model-name',
                replyDelay: 6
            }
        ],
        systemPrompt: await getDefaultSystemPrompt(),
        contextCount: 2000,
        devMode: true,
        logRetention: 7,
        bingWallpaper: true,
        includeDate: true,
        includeTime: true,
        includeLocation: false,
        includeWeather: false,
        includeForecast: false,
        forecastDays: 3,
        includeBattery: true,
        manualLocation: ''
    };

    if (!s) return defaultSettings;

    // 兼容旧版本数据结构
    if (!s.presets) {
        const oldPreset = {
            id: 'default',
            name: '默认预设',
            apiUrl: s.apiUrl || defaultSettings.presets[0].apiUrl,
            apiKey: s.apiKey || '',
            model: s.model || defaultSettings.presets[0].model,
            replyDelay: s.replyDelay || 6
        };
        return {
            ...defaultSettings,
            presets: [oldPreset],
            systemPrompt: s.systemPrompt || await getDefaultSystemPrompt(),
            contextCount: s.contextCount || 2000,
            devMode: s.devMode !== undefined ? s.devMode : true,
            logRetention: s.logRetention || 7,
            bingWallpaper: true,
            includeDate: s.includeDate !== undefined ? s.includeDate : true,
            includeTime: s.includeTime !== undefined ? s.includeTime : true,
            includeLocation: s.includeLocation !== undefined ? s.includeLocation : false,
            includeWeather: s.includeWeather !== undefined ? s.includeWeather : false,
            includeForecast: s.includeForecast !== undefined ? s.includeForecast : false,
            forecastDays: s.forecastDays || 3,
            includeBattery: s.includeBattery !== undefined ? s.includeBattery : true,
            manualLocation: s.manualLocation || ''
        };
    }

    // 确保新字段存在
    if (s.bingWallpaper === undefined) s.bingWallpaper = true;
    if (s.includeDate === undefined) s.includeDate = true;
    if (s.includeTime === undefined) s.includeTime = true;
    if (s.includeLocation === undefined) s.includeLocation = false;
    if (s.includeWeather === undefined) s.includeWeather = false;
    if (s.includeForecast === undefined) s.includeForecast = false;
    if (s.forecastDays === undefined) s.forecastDays = 3;
    if (s.includeBattery === undefined) s.includeBattery = true;
    if (s.manualLocation === undefined) s.manualLocation = '';
    
    // 气泡设置默认值
    if (!s.bubbleSettings) {
        s.bubbleSettings = {
            user: {
                bgColor: '#2196F3',
                textColor: '#ffffff',
                radius: 20
            },
            assistant: {
                bgColor: 'rgba(255, 255, 255, 0.12)',
                textColor: '#ffffff',
                radius: 20
            }
        };
    }

    // 自定义 CSS 默认值
    if (!s.customCss) {
        s.customCss = { user: '', assistant: '', action: '', thought: '', state: '' };
    }

    // 强制使用文件中的系统提示词，确保始终最新
    s.systemPrompt = await getDefaultSystemPrompt();

    return s;
}

// 颜色处理辅助函数
function parseColorToHexAndAlpha(colorStr) {
    let hex = '#000000';
    let alpha = 1;

    if (!colorStr) return { hex, alpha };

    if (colorStr.startsWith('#')) {
        hex = colorStr.slice(0, 7);
        if (colorStr.length === 9) {
            alpha = parseInt(colorStr.slice(7, 9), 16) / 255;
        }
    } else if (colorStr.startsWith('rgb')) {
        const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (match) {
            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);
            const a = match[4] !== undefined ? parseFloat(match[4]) : 1;
            hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
            alpha = a;
        }
    }
    return { hex, alpha };
}

function hexAndAlphaToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
    
    // 格式化时间戳为 YYYY-MM-DD-HH-mm-SS
    const timestamp = getCurrentTimestamp().replace(/ /g, '-').replace(/:/g, '-');
    
    a.download = `LNChat_Backup_${timestamp}.json`;
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
