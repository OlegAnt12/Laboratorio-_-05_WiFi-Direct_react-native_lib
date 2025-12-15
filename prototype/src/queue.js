const RNFS = require('react-native-fs');

const QUEUE_PATH = RNFS.DocumentDirectoryPath + '/outgoing_queue.json';

async function loadQueue() {
  try {
    const exists = await RNFS.exists(QUEUE_PATH);
    if (!exists) return [];
    const content = await RNFS.readFile(QUEUE_PATH, 'utf8');
    return JSON.parse(content || '[]');
  } catch (e) {
    console.error('Failed to load queue', e);
    return [];
  }
}

async function saveQueue(queue) {
  try {
    await RNFS.writeFile(QUEUE_PATH, JSON.stringify(queue), 'utf8');
  } catch (e) { console.error('Failed to save queue', e); }
}

async function enqueue(item) {
  const queue = await loadQueue();
  queue.push({item, ts: Date.now()});
  await saveQueue(queue);
}

async function dequeue() {
  const queue = await loadQueue();
  if (queue.length === 0) return null;
  const [first, ...rest] = queue;
  await saveQueue(rest);
  return first.item;
}

async function processQueue(sendCallback, opts = {maxRetries:3}) {
  let queue = await loadQueue();
  const results = [];
  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i];
    try {
      await sendCallback(entry.item);
      results.push({ok:true, item:entry.item});
    } catch (e) {
      console.error('send failed for queued item', e);
      results.push({ok:false, item:entry.item, err: String(e)});
    }
  }
  // remove successful ones
  const remaining = queue.filter((_,idx) => !results[idx].ok);
  await saveQueue(remaining);
  return results;
}

module.exports = {enqueue, dequeue, processQueue};
