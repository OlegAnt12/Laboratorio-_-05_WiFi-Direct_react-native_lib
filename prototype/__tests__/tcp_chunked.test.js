jest.mock('react-native-tcp-socket', () => ({
  createConnection: jest.fn((opts, cb) => {
    const handlers = {};
    const conn = {
      write: jest.fn((data) => {
        // simulate immediate ACK on end header
        try {
          const s = data.toString();
          if (s.includes('"type":"end"')) {
            setImmediate(() => {
              if (handlers.data) handlers.data('ACK_OK\n');
            });
          }
        } catch (e) {}
      }),
      on: jest.fn((ev, h) => { handlers[ev] = h; }),
      destroy: jest.fn()
    };
    if (typeof cb === 'function') setImmediate(cb);
    return conn;
  }),
  createServer: jest.fn(cb => {
    // return a fake server object
    const server = { listen: jest.fn(), on: jest.fn(), _cb: cb };
    return server;
  })
}));

jest.mock('react-native-fs', () => ({
  stat: jest.fn(async (p) => ({size: 200000})),
  read: jest.fn(async (path, length, position, encoding) => {
    // return a base64 string of requested length (approx)
    return Buffer.from('x'.repeat(length)).toString('base64');
  }),
  DocumentDirectoryPath: '/tmp',
  writeFile: jest.fn(() => Promise.resolve()),
  appendFile: jest.fn(() => Promise.resolve()),
}));

const Tcp = require('../src/tcp_chunked');
const TcpSocket = require('react-native-tcp-socket');
const RNFS = require('react-native-fs');

describe('tcp_chunked', () => {
  test('sendFileChunked sends chunks and reports progress', async () => {
    const progressCalls = [];
    const promise = Tcp.sendFileChunked('/some/path/file.bin', '127.0.0.1', 8080, (p) => progressCalls.push(p));
    await expect(promise).resolves.toBeUndefined();
    // ensure stat was called
    expect(RNFS.stat).toHaveBeenCalledWith('/some/path/file.bin');
    expect(progressCalls.length).toBeGreaterThan(0);
    const last = progressCalls[progressCalls.length - 1];
    expect(last.bytesSent).toBeGreaterThanOrEqual(last.total);
    // should include speed and eta
    expect(typeof last.speed).toBe('number');
    expect(typeof last.eta === 'number' || last.eta === null).toBeTruthy();
  });

  test('startChunkedServer sets up server', async () => {
    const received = [];
    const server = Tcp.startChunkedServer((info) => received.push(info), 8080);
    expect(TcpSocket.createServer).toHaveBeenCalled();
    expect(server.listen).toBeDefined();

    // simulate a client uploading a small payload and end header with matching checksum
    const handler = server._cb;
    // create fake socket
    const handlers = {};
    const fakeSocket = {
      write: jest.fn(),
      on: (ev, h) => { handlers[ev] = h; }
    };
    // bind
    handler(fakeSocket);

    const payload = 'aGVsbG8='; // 'hello' base64
    const chunkHeader = JSON.stringify({type:'chunk', seq:0, len: payload.length});
    const startHeader = JSON.stringify({type:'start', name:'f', size: payload.length});
    const endChecksum = require('js-sha256').create();
    endChecksum.update(payload);
    const checksum = endChecksum.hex();
    // send start header as header + '\n.\n' to match client
    handlers.data && handlers.data(startHeader + '\n.\n');
    // send chunk header + payload + delim
    handlers.data && handlers.data(chunkHeader + '\n' + payload + '.\n');
    // wait for appendFile promise microtask to run
    await new Promise(res => setImmediate(res));
    // send end header with checksum
    handlers.data && handlers.data(JSON.stringify({type:'end', checksum}) + '\n.\n');
    // wait microtask for processing
    await new Promise(res => setImmediate(res));

    // after processing, callback should have received a complete entry
    expect(received.some(r => r.complete === true && r.checksum === checksum)).toBeTruthy();
    expect(fakeSocket.write).toHaveBeenCalledWith('ACK_OK\n');
  });
});
