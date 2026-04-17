const http = require('http');

const TARGET_IP = '172.31.28.219';
const TARGET_PORT = 11434;
const LISTEN_PORT = 11434;

const server = http.createServer((req, res) => {
    const options = {
        hostname: TARGET_IP,
        port: TARGET_PORT,
        path: req.url,
        method: req.method,
        headers: req.headers
    };

    const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
    });

    req.pipe(proxyReq, { end: true });

    proxyReq.on('error', (e) => {
        console.error(`Bridge Error: ${e.message}`);
        res.statusCode = 502;
        res.end(`Bridge Error: ${e.message}`);
    });
});

server.listen(LISTEN_PORT, '127.0.0.1', () => {
    console.log(`Stability Bridge active: http://127.0.0.1:${LISTEN_PORT} -> http://${TARGET_IP}:${TARGET_PORT}`);
});
