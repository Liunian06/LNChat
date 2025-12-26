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

    async base64ToBlob(base64) {
        const parts = base64.split(';base64,');
        const contentType = parts[0].split(':')[1];
        const raw = window.atob(parts[1]);
        const rawLength = raw.length;
        const uInt8Array = new Uint8Array(rawLength);
        for (let i = 0; i < rawLength; ++i) {
            uInt8Array[i] = raw.charCodeAt(i);
        }
        return new Blob([uInt8Array], { type: contentType });
    }

    async migrateEmojis() {
        try {
            const emojis = await this.getAll(STORES.EMOJIS);
            let count = 0;
            for (const emoji of emojis) {
                if (typeof emoji.imageData === 'string' && emoji.imageData.startsWith('data:image')) {
                    try {
                        const blob = await this.base64ToBlob(emoji.imageData);
                        emoji.imageData = blob;
                        await this.put(STORES.EMOJIS, emoji);
                        count++;
                    } catch (e) {
                        console.error('Migration failed for emoji:', emoji.id, e);
                    }
                }
            }
            if (count > 0) console.log(`Migrated ${count} emojis to Blob format.`);
        } catch (e) {
            console.error('Emoji migration error:', e);
        }
    }

    // 通用增删改查方法
    async getAll(storeName, count = null) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = count ? store.getAll(null, count) : store.getAll();

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

    // 特殊查询：根据会话ID获取聊天记录 (支持分页)
    // limit: 获取数量
    // beforeId: 获取该ID之前的消息（用于向上加载更多）
    async getChatHistory(chatId, limit = null, beforeId = null) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORES.CHAT_HISTORY, 'readonly');
            const store = transaction.objectStore(STORES.CHAT_HISTORY);
            const index = store.index('chatId');
            
            // 如果不需要分页，使用原生 getAll (兼容旧逻辑，但建议逐步废弃无限制查询)
            if (!limit && !beforeId) {
                const request = index.getAll(chatId);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
                return;
            }

            const range = IDBKeyRange.only(chatId);
            const request = index.openCursor(range, 'prev'); // 倒序查询：最新的在最前
            const results = [];
            let skipped = false;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (!cursor) {
                    resolve(results.reverse()); // 返回时按时间正序
                    return;
                }

                const msg = cursor.value;

                // 如果指定了 beforeId，先跳过直到找到该 ID
                if (beforeId && !skipped) {
                    if (msg.id === beforeId) {
                        skipped = true;
                        cursor.continue(); // 跳过基准消息本身
                    } else {
                        // 还在找 beforeId，或者当前消息比 beforeId 更新（id更大），继续找
                        // 注意：这里 id 是自增的，prev 顺序 id 递减
                        // 如果当前 msg.id > beforeId，说明是更晚的消息，跳过
                        if (msg.id > beforeId) {
                             cursor.continue();
                        } else {
                             // 理论上不会直接跳到 < beforeId 除非 beforeId 不存在
                             // 如果找不到 beforeId，这个逻辑可能会失效。
                             // 简单处理：一旦遇到 <= beforeId 的情况就视为找到（如果 == 则在上面分支处理了）
                             skipped = true;
                             results.push(msg);
                             if (limit && results.length >= limit) {
                                 resolve(results.reverse());
                                 return;
                             }
                             cursor.continue();
                        }
                    }
                    return;
                }

                results.push(msg);

                if (limit && results.length >= limit) {
                    resolve(results.reverse());
                } else {
                    cursor.continue();
                }
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
