import http from 'node:http';
const request = http.get(
  {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/network?limit=1',
    headers: { host: 'vergecommon.com' },
    timeout: 8000,
  },
  (response) => {
    let bytes = 0;
    response.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 1000000) request.destroy(new Error('Response limit'));
    });
    response.on('end', () => process.exit(response.statusCode === 200 ? 0 : 1));
  },
);
request.on('timeout', () => request.destroy(new Error('Timeout')));
request.on('error', () => process.exit(1));
