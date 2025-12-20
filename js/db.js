/**
 * LNChat IndexedDB 数据库管理模块
 */

const DB_NAME = 'LNChatDB';
const DB_VERSION = 1;

export const STORES = {
    CONTACTS: 'contacts',
    CHAT_HISTORY: 'chat_history',
    DIARIES: 'diaries',
    SETTINGS: 'settings',
    IMAGES: 'images'
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

                // 联系人存储
                if (!db.objectStoreNames.contains(STORES.CONTACTS)) {
                    db.createObjectStore(STORES.CONTACTS, { keyPath: 'id' });
                }

                // 聊天历史存储
                if (!db.objectStoreNames.contains(STORES.CHAT_HISTORY)) {
                    const chatStore = db.createObjectStore(STORES.CHAT_HISTORY, { keyPath: 'id', autoIncrement: true });
                    chatStore.createIndex('contactId', 'contactId', { unique: false });
                }

                // 日记存储
                if (!db.objectStoreNames.contains(STORES.DIARIES)) {
                    db.createObjectStore(STORES.DIARIES, { keyPath: 'id' });
                }

                // 设置存储
                if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
                    db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
                }

                // 图片存储 (Blob/Base64)
                if (!db.objectStoreNames.contains(STORES.IMAGES)) {
                    db.createObjectStore(STORES.IMAGES, { keyPath: 'id' });
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

    // 特殊查询：根据联系人ID获取聊天记录
    async getChatHistory(contactId) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORES.CHAT_HISTORY, 'readonly');
            const store = transaction.objectStore(STORES.CHAT_HISTORY);
            const index = store.index('contactId');
            const request = index.getAll(contactId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

export const db = new LNChatDB();
