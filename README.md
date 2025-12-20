# LNChat

LNChat 是一个基于 Web 的移动端风格 AI 聊天应用，采用 PWA 技术，提供流畅的原生 App 级体验。

## ✨ 核心特性

- **模块化架构**：使用 ES Modules 进行重构，代码逻辑清晰，易于扩展和维护。
- **海量存储 (IndexedDB)**：全面采用 IndexedDB 替代传统的 localStorage，支持存储大量的聊天记录、图片和数据，不再受 5MB 容量限制。
- **AI 智能对话**：
  - 支持 OpenAI 兼容格式的 API 调用。
  - **消息队列机制**：支持多消息合并发送，提供更自然的对话体验。
  - **上下文理解**：支持配置历史消息条数，让 AI 更好地理解对话背景。
- **联系人管理**：支持创建多个 AI 角色，可自定义人设、头像和模型参数（如 Temperature）。
- **个性化体验**：
  - **动态壁纸**：集成 Bing 每日壁纸。
  - **日记本**：记录心情与生活点滴。
- **数据自主**：支持完整的数据导出备份与导入恢复。
- **PWA 支持**：可安装至手机主屏幕，像原生应用一样运行。

## 📁 项目结构

```text
/
├── index.html           # 应用入口
├── manifest.json        # PWA 配置文件
├── css/
│   └── styles.css       # 核心视觉样式
└── js/
    ├── main.js          # 系统内核，处理 App 加载与系统功能
    ├── db.js            # 基于 Promise 的 IndexedDB 数据库封装
    ├── utils.js         # 通用工具函数库
    └── apps/            # 独立 App 模块目录
        ├── chat.js      # 聊天功能逻辑
        ├── contacts.js  # 联系人管理逻辑
        ├── diary.js     # 日记功能逻辑
        ├── settings.js  # 设置与数据备份逻辑
        └── placeholder.js # 占位模块
```

## 🚀 快速开始

### 本地预览
由于项目使用了 **ES Modules**，直接双击 `index.html` 打开会触发浏览器的跨域限制。

**推荐方式：**
1.  在 VS Code 中安装 **Live Server** 插件。
2.  右键点击 `index.html`，选择 **"Open with Live Server"**。

### 在线部署
您可以直接将本项目上传至 GitHub Pages、Netlify 或 Vercel。本项目已针对生产环境路径进行了优化，无需额外配置即可上线。

## 🛠️ 如何配置 AI？
1.  打开 LNChat，点击主页的 **“设置”** 图标。
2.  输入您的 **API URL**（如 SiliconFlow 或 OpenAI 兼容接口）。
3.  输入您的 **API Key**。
4.  指定 **模型名称**（如 `deepseek-ai/DeepSeek-V3`）。
5.  点击“保存”，即可开始与您的 AI 联系人聊天。

## ⚖️ 许可证
MIT License
