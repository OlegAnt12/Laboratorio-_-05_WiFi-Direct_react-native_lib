jest.mock('react-native-tcp-socket', () => ({
  createConnection: jest.fn((opts, cb) => {
    const conn = { write: jest.fn(), on: jest.fn((ev, h) => {}), destroy: jest.fn() };
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
  });

  test('startChunkedServer sets up server', () => {
    const received = [];
    const server = Tcp.startChunkedServer((info) => received.push(info), 8080);
    expect(TcpSocket.createServer).toHaveBeenCalled();
    expect(server.listen).toBeDefined();
  });
});
