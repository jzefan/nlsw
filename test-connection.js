const http = require('http');

function testConnection(host, port) {
    console.log(`Testing connection to ${host}:${port}...`);
    const req = http.request({
        host: host,
        port: port,
        path: '/',
        method: 'GET',
        timeout: 2000
    }, (res) => {
        console.log(`Success connecting to ${host}:${port}. Status: ${res.statusCode}`);
    });

    req.on('error', (e) => {
        console.error(`Error connecting to ${host}:${port}: ${e.code} - ${e.message}`);
    });

    req.on('timeout', () => {
        console.error(`Timeout connecting to ${host}:${port}`);
        req.destroy();
    });

    req.end();
}

testConnection('127.0.0.1', 1080);
testConnection('localhost', 1080);
