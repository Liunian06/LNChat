/**
 * LNChat IndexedDB 数据库管理模块
 */

const DB_NAME = 'LNChatDB';
const DB_VERSION = 12;

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
    EXCHANGE_DIARY_ENTRIES: 'exchange_diary_entries',
    EMOJI_LIBRARIES: 'emoji_libraries',
    EMOJIS: 'emojis',
    WALLET: 'wallet',
    TRANSACTIONS: 'transactions',
    STORE_ITEMS: 'store_items',
    PURCHASES: 'purchases',
    GIFTS: 'gifts',
    ANNIVERSARIES: 'anniversaries',
    POMODORO_TASKS: 'pomodoro_tasks',
    POMODORO_RECORDS: 'pomodoro_records',
    X_POSTS: 'x_posts',
    X_USERS: 'x_users'
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

                // 表情库存储
                if (!db.objectStoreNames.contains(STORES.EMOJI_LIBRARIES)) {
                    const emojiLibraryStore = db.createObjectStore(STORES.EMOJI_LIBRARIES, { keyPath: 'id' });
                    emojiLibraryStore.createIndex('type', 'type', { unique: false }); // 'global' 或 'private'
                    emojiLibraryStore.createIndex('contactId', 'contactId', { unique: false }); // 独立表情库关联的角色
                }

                // 表情存储
                if (!db.objectStoreNames.contains(STORES.EMOJIS)) {
                    const emojiStore = db.createObjectStore(STORES.EMOJIS, { keyPath: 'id' });
                    emojiStore.createIndex('libraryId', 'libraryId', { unique: false });
                }

                // 钱包存储
                if (!db.objectStoreNames.contains(STORES.WALLET)) {
                    db.createObjectStore(STORES.WALLET, { keyPath: 'id' });
                }

                // 交易记录存储
                if (!db.objectStoreNames.contains(STORES.TRANSACTIONS)) {
                    const transactionStore = db.createObjectStore(STORES.TRANSACTIONS, { keyPath: 'id' });
                    transactionStore.createIndex('timestamp', 'timestamp', { unique: false });
                    transactionStore.createIndex('type', 'type', { unique: false });
                }

                // 商城商品存储
                if (!db.objectStoreNames.contains(STORES.STORE_ITEMS)) {
                    const storeItemStore = db.createObjectStore(STORES.STORE_ITEMS, { keyPath: 'id' });
                    storeItemStore.createIndex('category', 'category', { unique: false });
                }

                // 购买记录存储
                if (!db.objectStoreNames.contains(STORES.PURCHASES)) {
                    const purchaseStore = db.createObjectStore(STORES.PURCHASES, { keyPath: 'id' });
                    purchaseStore.createIndex('itemId', 'itemId', { unique: false });
                    purchaseStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // 礼物记录存储
                if (!db.objectStoreNames.contains(STORES.GIFTS)) {
                    const giftStore = db.createObjectStore(STORES.GIFTS, { keyPath: 'id' });
                    giftStore.createIndex('contactId', 'contactId', { unique: false });
                    giftStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // 纪念日存储
                if (!db.objectStoreNames.contains(STORES.ANNIVERSARIES)) {
                    const anniversaryStore = db.createObjectStore(STORES.ANNIVERSARIES, { keyPath: 'id' });
                    anniversaryStore.createIndex('targetDate', 'targetDate', { unique: false });
                    anniversaryStore.createIndex('type', 'type', { unique: false }); // 'countdown' 或 'countup'
                }

                // 番茄钟任务存储
                if (!db.objectStoreNames.contains(STORES.POMODORO_TASKS)) {
                    const pomodoroTaskStore = db.createObjectStore(STORES.POMODORO_TASKS, { keyPath: 'id' });
                    pomodoroTaskStore.createIndex('createdAt', 'createdAt', { unique: false });
                    pomodoroTaskStore.createIndex('status', 'status', { unique: false }); // 'active', 'completed', 'archived'
                }

                // 番茄钟记录存储
                if (!db.objectStoreNames.contains(STORES.POMODORO_RECORDS)) {
                    const pomodoroRecordStore = db.createObjectStore(STORES.POMODORO_RECORDS, { keyPath: 'id' });
                    pomodoroRecordStore.createIndex('taskId', 'taskId', { unique: false });
                    pomodoroRecordStore.createIndex('date', 'date', { unique: false });
                }

                // X应用帖子存储
                if (!db.objectStoreNames.contains(STORES.X_POSTS)) {
                    const xPostStore = db.createObjectStore(STORES.X_POSTS, { keyPath: 'id' });
                    xPostStore.createIndex('userId', 'userId', { unique: false });
                    xPostStore.createIndex('createdAt', 'createdAt', { unique: false });
                }

                // X应用用户存储
                if (!db.objectStoreNames.contains(STORES.X_USERS)) {
                    const xUserStore = db.createObjectStore(STORES.X_USERS, { keyPath: 'id' });
                    xUserStore.createIndex('username', 'username', { unique: true });
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
