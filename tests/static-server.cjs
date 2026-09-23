const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
exports.start = (port = 8765) => {
    const root = path.resolve(__dirname, '..');
    return http.createServer((req, res) => {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        fs.readFile(file, (error, data) => {
            res.statusCode = error ? 404 : 200;
            res.setHeader('Content-Type', ({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.mp3':'audio/mpeg','.png':'image/png'})[path.extname(file)] || 'application/octet-stream');
            res.end(error ? '' : data);
        });
    }).listen(port, '127.0.0.1');
};
if (require.main === module) exports.start();
