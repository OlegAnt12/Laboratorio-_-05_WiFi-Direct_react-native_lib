const TcpSocket = require('react-native-tcp-socket');
const RNFS = require('react-native-fs');

const CHUNK_SIZE = 64 * 1024; // 64KB

function _makeHeader(obj) {
  return JSON.stringify(obj) + '\n';
}

// Simple newline-terminated message protocol: headerJSON\nbase64chunk\n.\n
async function sendFileChunked(path, host, port = 8080, onProgress = () => {}) {
  const stat = await RNFS.stat(path);
  const total = Number(stat.size);
  let offset = 0;
  let seq = 0;

  return new Promise((resolve, reject) => {
    const client = TcpSocket.createConnection({port, host}, async () => {
      try {
        // pre-create transfer header
        const header = {type: 'start', name: path.split('/').pop(), size: total};
        client.write(_makeHeader(header));

        while (offset < total) {
          const toRead = Math.min(CHUNK_SIZE, total - offset);
          const b64 = await RNFS.read(path, toRead, offset, 'base64');
          const chunkHeader = {type: 'chunk', seq: seq, len: b64.length};
          client.write(_makeHeader(chunkHeader));
          client.write(b64 + '\n.\n');
          offset += toRead;
          seq += 1;
          onProgress({bytesSent: offset, total});
        }

        client.write(_makeHeader({type: 'end'}));
        onProgress({bytesSent: total, total});
        client.destroy();
        resolve();
      } catch (e) {
        client.destroy();
        reject(e);
      }
    });

    client.on('error', err => reject(err));
  });
}

// Start a server that accepts chunked uploads and writes to DocumentDirectoryPath
function startChunkedServer(onFileReceived = () => {}, port = 8080) {
  const RNDocument = RNFS.DocumentDirectoryPath;
  const server = TcpSocket.createServer(socket => {
    let buf = '';
    let current = null; // {name, size, chunksReceived, path}

    socket.on('data', data => {
      buf += data.toString();
      // process messages separated by '\n.\n'
      let idx;
      while ((idx = buf.indexOf('\n.\n')) !== -1) {
        const segment = buf.slice(0, idx);
        buf = buf.slice(idx + 3);
        // segment is header\n or header\nbase64
        const nl = segment.indexOf('\n');
        if (nl === -1) continue;
        const headerStr = segment.slice(0, nl);
        const payload = segment.slice(nl + 1);
        let header;
        try { header = JSON.parse(headerStr); } catch (e) { continue; }

        if (header.type === 'start') {
          const name = header.name || ('recv_' + Date.now());
          const outPath = RNDocument + '/' + name;
          // create/overwrite file
          RNFS.writeFile(outPath, '', 'base64').catch(() => {});
          current = {name, size: header.size, received: 0, path: outPath};
        } else if (header.type === 'chunk' && current) {
          // payload is base64
          RNFS.appendFile(current.path, payload, 'base64').then(() => {
            current.received += header.len; // approximate
            // notify progress
            onFileReceived({name: current.name, bytesReceived: current.received, total: current.size, path: current.path});
          }).catch(() => {});
        } else if (header.type === 'end' && current) {
          onFileReceived({name: current.name, bytesReceived: current.received, total: current.size, complete: true, path: current.path});
          current = null;
        }
      }
    });

    socket.on('error', (err) => {});
  });

  server.listen({port, host: '0.0.0.0'}, () => {});
  server.on('error', () => {});
  return server;
}

module.exports = { sendFileChunked, startChunkedServer };
