import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const build = path.resolve(import.meta.dirname, '../build');
const port = Number(process.env.PORT || 4173);
const types = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2' };

http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url || '/', `http://${request.headers.host}`).pathname);
  const relative = pathname.replace(/^\/rinspace\//, '/').replace(/^\/+/, '');
  const candidate = path.resolve(build, relative || 'index.html');
  const safe = candidate.startsWith(`${build}${path.sep}`) && fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  const target = safe ? candidate : path.join(build, 'index.html');
  response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(target).pipe(response);
}).listen(port, '127.0.0.1', () => console.log(`Rinspace artifact server listening on http://127.0.0.1:${port}`));
