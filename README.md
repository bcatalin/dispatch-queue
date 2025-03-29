# DispatchQueue

A versatile and persistent queueing mechanism for Node.js applications. Supports disk persistence, webhook or handler processing, retry logic with exponential backoff, and strict FIFO processing.

## Features

- ✅ **Persistent**: Queue state is saved to disk
- 🔁 **FIFO**: Items processed in strict first-in-first-out order
- 🕸️ **Webhook Support**: Send items to external APIs
- ⚙️ **Handler Support**: Register local functions to process queue items
- 🔂 **Retry Logic**: Configurable retry limit and exponential backoff


## Installation

```bash
npm install dispatch-queue
```

## Usage

```js
const { createQueue } = require('@bcdme/dispatch-queue');
// 1. Create a queue
const myQueue = createQueue('myQueue', 5000, 'queues', 100);

// 2. Register a webhook
myQueue.registerWebhook('https://example.com/webhook', 'API_KEY', 'POST');

// 3. Add Items to the queue
myQueue.addItem({ id: 1, name: 'Item 1' });
myQueue.addItem({ id: 2, name: 'Item 2' });

// 4. Get queue information
console.log('Queue length:', myQueue.getLength());
console.log('Max queue size:', myQueue.getMaxSize());
console.log('Discarded items:', myQueue.getDiscardedItems());
console.log('Queue UUID:', myQueue.getUUID());

// 5. Get items from the queue
console.log('Get item 1:', myQueue.getItem());           // { id: 1, data: 'Item 1' }
console.log('Queue length after getItem:', myQueue.getLength()); // 4

console.log('Get item 2 without removing:', myQueue.getItem(false)); // { id: 2, data: 'Item 2' }
console.log('Queue length after getItem(false):', myQueue.getLength()); // 4

// 6. Register a handler
// myQueue.registerHandler((item, queueName) => {
//  console.log(`Handler processing item from ${queueName}:`, item);
  // Process the item here
// });

// 6. Register a webhook
// myQueue.registerWebhook('https://your-webhook-endpoint.com', 'YOUR_API_KEY', 'POST');

// 7. Drain the queue
// myQueue.drain();
// console.log('Queue length after drain:', myQueue.getLength());

// 8. Convert queue to array
console.log('Queue as array:', myQueue.toArray());
//  [
//    { id: 2, data: 'Item 2' },
//    { id: 3, data: 'Item 3' },
//    { id: 4, data: 'Item 4' },
//    { id: 5, data: 'Item 5' }
//  ]

// 9.  Destroy the queue
// myQueue.destroy(); // Clean up resources
setTimeout(()=> {
     myQueue.destroy();
}, 5000)

```

## API

### `createQueue(name, persistenceInterval, persistenceDirectory, maxSize)`
Creates a new queue instance.

- `name` (string): Name of the queue
- `persistenceInterval` (ms): How often to save the queue to disk
- `persistenceDirectory` (string): Where to store queue files
- `maxSize` (number): Max items in queue (0 for unlimited)

### `.addItem(item)`
Adds an item to the queue.

### `.registerHandler(fn)`
Register a function to process each item.

### `.registerWebhook(url, apiKey, method?)`
Send each item to a webhook URL. Optional `method` defaults to `POST`.

### `.drain()`
Clears all items from the queue.

### `.toArray()`
Returns a shallow copy of queue items.

### `.getLength()`
Returns the current queue length.

### `.getDiscardedItems()`
Returns items discarded due to queue overflow.

### `.getUUID()`
Returns the unique queue ID.

## Retry Logic

If a webhook or handler fails:
- `_retries` is incremented on the item
- Queue uses exponential backoff: `100ms, 200ms, 400ms...`
- Max of 5 retries per item


## License

MIT © 2025

Copyright (c) 2025 Catalin Batrinu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES