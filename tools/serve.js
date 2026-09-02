/**
 * CardVerse — a static server for local development.
 *
 *     node tools/serve.js [port]      → http://localhost:8080
 *
 * No dependencies. Serves the project folder read-only; anything with `..`
 * in it is refused. You do not need this to play — index.html opens from
 * disk — but a browser is stricter about a few things on `file://`, and
 * this is the honest way to see what GitHub Pages will show.
 */

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2]) || 8080;

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.md':   'text/markdown; charset=utf-8',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
    '.ico':  'image/x-icon',
};

http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url.endsWith('/')) url += 'index.html';
    if (url.includes('..')) { res.writeHead(403); return res.end('No.'); }

    const file = path.join(ROOT, url);
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('Not found: ' + url); }
        res.writeHead(200, {
            'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store',
        });
        res.end(data);
    });
}).listen(PORT, () => console.log(`CardVerse → http://localhost:${PORT}/`));
