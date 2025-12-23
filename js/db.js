/**
 * LNChat IndexedDB 数据库管理模块
 */

const DB_NAME = 'LNChatDB';
const DB_VERSION = 7;

export const STORES = {
    CONTACTS: 'contacts',
    CHAT_HISTORY: 'chat_history',
    DIARIES: 'diaries',
    SETTINGS: 'settings',
    IMAGES: 'images',
    SESSIONS: 'sessions',
    LOGS: 'logs',
    MOMENTS: 'moments',
    MEMORIES: 'memories',
    USER_PERSONAS: 'user_personas',
    EXCHANGE_DIARIES: 'exchange_diaries',
    EXCHANGE_DIARY_ENTRIES: 'exchange_diary_entries'
};

class LNChatDB {
    constructor() {
        this.db = null;
    }

    async init() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;

                // 联系人存储
                if (!db.objectStoreNames.contains(STORES.CONTACTS)) {
                    db.createObjectStore(STORES.CONTACTS, { keyPath: 'id' });
                }

                // 聊天历史存储
                if (!db.objectStoreNames.contains(STORES.CHAT_HISTORY)) {
                    const chatStore = db.createObjectStore(STORES.CHAT_HISTORY, { keyPath: 'id', autoIncrement: true });
                    chatStore.createIndex('contactId', 'contactId', { unique: false });
                    chatStore.createIndex('chatId', 'chatId', { unique: false });
                } else {
                    const chatStore = event.target.transaction.objectStore(STORES.CHAT_HISTORY);
                    if (!chatStore.indexNames.contains('chatId')) {
                        chatStore.createIndex('chatId', 'chatId', { unique: false });
                    }
                }

                // 日记存储
                if (!db.objectStoreNames.contains(STORES.DIARIES)) {
                    const diaryStore = db.createObjectStore(STORES.DIARIES, { keyPath: 'id' });
                    diaryStore.createIndex('contactId', 'contactId', { unique: false });
                } else if (oldVersion < 6) {
                    const diaryStore = event.target.transaction.objectStore(STORES.DIARIES);
                    if (!diaryStore.indexNames.contains('contactId')) {
                        diaryStore.createIndex('contactId', 'contactId', { unique: false });
                    }
                }

                // 设置存储
                if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
                    db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
                }

                // 图片存储 (Blob/Base64)
                if (!db.objectStoreNames.contains(STORES.IMAGES)) {
                    db.createObjectStore(STORES.IMAGES, { keyPath: 'id' });
                }

                // 会话存储
                if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
                    const sessionStore = db.createObjectStore(STORES.SESSIONS, { keyPath: 'id' });
                    sessionStore.createIndex('contactId', 'contactId', { unique: false });
                }

                // 日志存储
                if (!db.objectStoreNames.contains(STORES.LOGS)) {
                    const logStore = db.createObjectStore(STORES.LOGS, { keyPath: 'id', autoIncrement: true });
                    logStore.createIndex('timestamp', 'timestamp', { unique: false });
                    logStore.createIndex('type', 'type', { unique: false });
                }

                // 朋友圈存储
                if (!db.objectStoreNames.contains(STORES.MOMENTS)) {
                    const momentStore = db.createObjectStore(STORES.MOMENTS, { keyPath: 'id' });
                    momentStore.createIndex('contactId', 'contactId', { unique: false });
                    momentStore.createIndex('date', 'date', { unique: false });
                }

                // 记忆存储
                if (!db.objectStoreNames.contains(STORES.MEMORIES)) {
                    const memoryStore = db.createObjectStore(STORES.MEMORIES, { keyPath: 'id' });
                    memoryStore.createIndex('contactId', 'contactId', { unique: false });
                    memoryStore.createIndex('date', 'date', { unique: false });
                }

                // 用户人设存储
                if (!db.objectStoreNames.contains(STORES.USER_PERSONAS)) {
                    db.createObjectStore(STORES.USER_PERSONAS, { keyPath: 'id' });
                }

                // 交换日记本存储
                if (!db.objectStoreNames.contains(STORES.EXCHANGE_DIARIES)) {
                    const exchangeDiaryStore = db.createObjectStore(STORES.EXCHANGE_DIARIES, { keyPath: 'id' });
                    exchangeDiaryStore.createIndex('contactId', 'contactId', { unique: false });
                }

                // 交换日记条目存储
                if (!db.objectStoreNames.contains(STORES.EXCHANGE_DIARY_ENTRIES)) {
                    const exchangeEntryStore = db.createObjectStore(STORES.EXCHANGE_DIARY_ENTRIES, { keyPath: 'id' });
                    exchangeEntryStore.createIndex('diaryId', 'diaryId', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                reject('数据库初始化失败: ' + event.target.error);
            };
        });
    }

    // 通用增删改查方法
    async getAll(storeName) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async get(storeName, id) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async put(storeName, data) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName, id) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async clear(storeName) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // 特殊查询：根据会话ID获取聊天记录
    async getChatHistory(chatId, onlyNormal = false) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORES.CHAT_HISTORY, 'readonly');
            const store = transaction.objectStore(STORES.CHAT_HISTORY);
            const index = store.index('chatId');
            const request = index.getAll(chatId);

            request.onsuccess = () => {
                let history = request.result;
                if (onlyNormal) {
                    history = history.filter(m => m.status === 'normal');
                }
                resolve(history);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // 特殊查询：根据联系人ID获取所有会话
    async getSessionsByContact(contactId) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORES.SESSIONS, 'readonly');
            const store = transaction.objectStore(STORES.SESSIONS);
            const index = store.index('contactId');
            const request = index.getAll(contactId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

export const db = new LNChatDB();
