const Queue = require('../src/queue');

jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/tmp',
  // simple in-memory mock implementation
  _content: '{}',
  exists: jest.fn(function() { return Promise.resolve(this._content !== '{}'); }),
  readFile: jest.fn(function() { return Promise.resolve(this._content === '{}' ? '[]' : this._content); }),
  writeFile: jest.fn(function(path, data) { this._content = data; return Promise.resolve(); }),
  copyFile: jest.fn(() => Promise.resolve())
}));

describe('queue', () => {
  test('enqueue and dequeue', async () => {
    await Queue.enqueue({type:'message', message:'hi'});
    const item = await Queue.dequeue();
    expect(item).toEqual({type:'message', message:'hi'});
  });

  test('processQueue calls sendCallback', async () => {
    const sent = [];
    // mock readFile to pretend queue has one item
    const rnfs = require('react-native-fs');
    // prime the in-memory content to emulate a queued item
    await rnfs.writeFile('/tmp/outgoing_queue.json', JSON.stringify([{item:{type:'message', message:'x'}}]));
    const res = await Queue.processQueue(async (itm) => { sent.push(itm); });
    expect(sent.length).toBeGreaterThanOrEqual(1);
    // reset
    rnfs._content = '{}';
  });
});
