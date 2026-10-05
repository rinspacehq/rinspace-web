import crypto from 'node:crypto';
import http from 'node:http';

const port = 4174;
const asset = 'window.__RINSPACE_FIXTURE_ASSET__ = true;';
const html = `<!doctype html>
<html><head><meta charset="utf-8"><script src="/assets/workbench.0123456789abcdef.js"></script></head>
<body><textarea id="editor">fixture</textarea><script>
for (const [name, value] of Object.entries({
  'rinspace-click-to-grant': 2,
  'rinspace-grant': 5,
  'rinspace-manager-lookup': 8,
  'rinspace-clone': 13,
  'rinspace-container-create': 21,
  'rinspace-container-start': 34,
  'rinspace-http-ready': 55,
  'rinspace-extension-host-ready': 89,
  'rinspace-target-file-ready': 110,
  'rinspace-first-input-ready': 120,
})) performance.mark(name, { startTime: value });
const connect = () => new WebSocket('ws://' + location.host + '/code/s/fixture/editor-ws');
connect();
window.addEventListener('online', connect);
</script></body></html>`;

const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    response.end('ok');
    return;
  }
  if (request.url === '/code/s/fixture/') {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'EO-Cache-Status': 'MISS',
      'EO-Log-UUID': 'fixture-request',
    });
    response.end(html);
    return;
  }
  if (request.url === '/assets/workbench.0123456789abcdef.js') {
    response.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    response.end(asset);
    return;
  }
  response.writeHead(404, { 'Cache-Control': 'no-store' });
  response.end('not found');
});

server.on('upgrade', (request, socket) => {
  if (request.url !== '/code/s/fixture/editor-ws' || !request.headers['sec-websocket-key']) {
    socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
    return;
  }
  const accept = crypto.createHash('sha1')
    .update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ].join('\r\n'));
  socket.on('error', () => {});
});

server.listen(port, '127.0.0.1');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
