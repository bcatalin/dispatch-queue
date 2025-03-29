/**
 * queue.js - A versatile and persistent queueing mechanism for Node.js.
 */

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const MAX_RETRIES = 5;

class SimpleQueue {
    constructor(name, persistenceInterval = 0, persistenceDirectory = 'queues', maxSize = 0) {
        if (typeof name !== 'string' || !name) {
            throw new Error('Queue name must be a non-empty string.');
        }
        if (typeof persistenceInterval !== 'number' || persistenceInterval < 0) {
            throw new TypeError('Persistence interval must be a non-negative number.');
        }
        if (typeof persistenceDirectory !== 'string') {
            throw new TypeError('Persistence directory must be a string.');
        }
        if (typeof maxSize !== 'number' || maxSize < 0) {
            throw new TypeError('Max size must be a non-negative number.');
        }

        this.name = name;
        this._uuid = uuidv4();
        this.data = [];
        this.handler = null;
        this.webhookUrl = null;
        this.webhookMethod = 'POST';
        this.webhookApiKey = null;
        this.eventEmitter = new EventEmitter();
        this.persistenceInterval = persistenceInterval;
        this.persistenceDirectory = persistenceDirectory;
        this.persistenceFilename = path.join(persistenceDirectory, `${name}.json`);
        this.persistenceTimer = null;
        this.maxSize = maxSize;
        this.discardedItems = [];
        this.processing = false;

        this.initializePersistence();
    }

    initializePersistence() {
        if (!fs.existsSync(this.persistenceDirectory)) {
            fs.mkdirSync(this.persistenceDirectory, { recursive: true });
        }

        this.loadData();

        if (this.persistenceInterval > 0) {
            this.persistenceTimer = setInterval(() => {
                this.saveData();
            }, this.persistenceInterval);
        }
    }

    loadData() {
        if (fs.existsSync(this.persistenceFilename)) {
            try {
                const raw = fs.readFileSync(this.persistenceFilename, 'utf8');
                const parsed = JSON.parse(raw);
                this.data = parsed.map(item => ({ ...item, _retries: item._retries || 0 }));
                if (this.maxSize > 0 && this.data.length > this.maxSize) {
                    this.data = this.data.slice(0, this.maxSize);
                }
            } catch {
                this.data = [];
            }
        } else {
            this.data = [];
        }
    }

    saveData() {
        try {
            const serializable = this.data.map(item => ({ ...item, _retries: item._retries || 0 }));
            const data = JSON.stringify(serializable);
            fs.writeFileSync(this.persistenceFilename, data, 'utf8');
        } catch (error) {
            console.error(`Error saving data for queue ${this.name}: ${error.message}`);
        }
    }

    async processQueue() {
        if (this.processing) return;
        this.processing = true;

        if (!this.handler && !this.webhookUrl) {
            this.processing = false;
            return;
        }

        while (this.data.length > 0) {
            const item = this.getItem(true);
            const retries = item._retries || 0;

            try {
                if (this.handler) {
                    await Promise.resolve(this.handler(item, this.name));
                } else if (this.webhookUrl) {
                    const success = await this.triggerWebhook(item);
                    if (!success) {
                        if (retries < MAX_RETRIES) {
                            item._retries = retries + 1;
                            const delay = Math.pow(2, retries) * 100;
                            setTimeout(() => {
                                this.data.unshift(item);
                                this.processQueue();
                            }, delay);
                        } else {
                            console.error(`Max retries exceeded for item in queue ${this.name}:`, item);
                        }
                    }
                }
            } catch (err) {
                if (retries < MAX_RETRIES) {
                    item._retries = retries + 1;
                    const delay = Math.pow(2, retries) * 100;
                    setTimeout(() => {
                        this.data.unshift(item);
                        this.processQueue();
                    }, delay);
                } else {
                    console.error(`Max retries exceeded for item in queue ${this.name}:`, item);
                }
            }
        }

        this.processing = false;
    }

    async addItem(item) {
        if (item === undefined) {
            throw new TypeError('Cannot add undefined to the queue.');
        }

        if (this.maxSize > 0 && this.data.length >= this.maxSize) {
            this.eventEmitter.emit('discarded', item);
            this.discardedItems.push(item);
            return;
        }
        item._retries = 0;
        this.data.push(item);
        this.eventEmitter.emit('itemAdded', item);
        this.saveData();
        this.processQueue();
    }

    getItem(shift = true) {
        if (this.data.length === 0) return undefined;
        const item = this.data[0];
        if (shift) this.data.shift();
        return item;
    }

    getLength() {
        return this.data.length;
    }

    registerHandler(handler) {
        if (typeof handler !== 'function') {
            throw new TypeError('Handler must be a function.');
        }
        if (this.webhookUrl) {
            throw new Error('Cannot register a handler when a webhook is already registered.');
        }

        this.handler = handler;
        this.webhookUrl = null;
        this.webhookApiKey = null;
        this.eventEmitter.removeAllListeners('itemAdded');
        this.eventEmitter.on('itemAdded', (item) => {
            Promise.resolve(handler(item, this.name)).catch(err => console.error(err));
        });

        this.processQueue();
    }

    async registerWebhook(url, apiKey, method = 'POST') {
        if (typeof url !== 'string' || typeof apiKey !== 'string') {
            throw new TypeError('Webhook URL and API key must be strings.');
        }
        if (!['GET', 'POST'].includes(method.toUpperCase())) {
            throw new TypeError('Invalid HTTP method.');
        }
        if (this.handler) {
            throw new Error('Cannot register a webhook when a handler is already registered.');
        }

        this.webhookUrl = url;
        this.webhookMethod = method.toUpperCase();
        this.webhookApiKey = apiKey;
        this.handler = null;

        await this.processQueue();
    }

    async triggerWebhook(item) {
        try {
            const cloned = { ...item };
            delete cloned._retries;
            const config = {
                method: this.webhookMethod,
                url: this.webhookUrl,
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.webhookApiKey,
                },
                data: this.webhookMethod === 'POST' ? JSON.stringify(cloned) : undefined,
            };

            await axios(config);
            return true;
        } catch (error) {
            console.error(`Error sending webhook: ${error.message}`);
            return false;
        }
    }

    drain() {
        this.data = [];
        this.saveData();
        if (this.persistenceTimer) {
            clearInterval(this.persistenceTimer);
            this.persistenceTimer = null;
        }
    }

    toArray() {
        return [...this.data];
    }

    stopPersistence() {
        if (this.persistenceTimer) {
            clearInterval(this.persistenceTimer);
            this.persistenceTimer = null;
        }
    }

    destroy() {
        this.stopPersistence();
        this.eventEmitter.removeAllListeners();
        this.data = [];
    }

    getMaxSize() {
        return this.maxSize;
    }

    getDiscardedItems() {
        return this.discardedItems;
    }

    getUUID() {
        return this._uuid;
    }
}

function createQueue(name, persistenceInterval = 0, persistenceDirectory = 'queues', maxSize = 0) {
    return new SimpleQueue(name, persistenceInterval, persistenceDirectory, maxSize);
}

module.exports = {
    SimpleQueue,
    createQueue,
};
