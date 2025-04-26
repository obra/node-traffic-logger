// ABOUTME: Simple HTTP server for testing node-traffic-logger
// ABOUTME: Provides endpoints to test different HTTP features

import http from 'http';
import zlib from 'zlib';
import { promisify } from 'util';

// Create a simple HTTP server for testing
const server = http.createServer(async (req, res) => {
  // Extract path
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  
  // Collect request body if any
  const chunks = [];
  req.on('data', (chunk) => {
    chunks.push(chunk);
  });
  
  await new Promise(resolve => {
    req.on('end', resolve);
  });
  
  // Handle various test endpoints
  switch (path) {
    case '/json':
      // Return JSON response
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        data: {
          message: 'This is a JSON response',
          values: [1, 2, 3, 4, 5],
          timestamp: new Date().toISOString()
        }
      }));
      break;
      
    case '/gzip':
      // Return gzipped response
      const content = JSON.stringify({
        compressed: true,
        message: 'This response is compressed with gzip',
        timestamp: new Date().toISOString()
      });
      
      const gzipped = await promisify(zlib.gzip)(Buffer.from(content));
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Encoding', 'gzip');
      res.end(gzipped);
      break;
      
    case '/echo':
      // Echo back request data
      const body = Buffer.concat(chunks).toString();
      res.setHeader('Content-Type', req.headers['content-type'] || 'text/plain');
      res.end(body || 'No body provided');
      break;
      
    case '/headers':
      // Return request headers as JSON
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        headers: req.headers,
        method: req.method,
        url: req.url
      }));
      break;
      
    case '/slow':
      // Delayed response
      setTimeout(() => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          delayed: true,
          message: 'This response was delayed by 500ms',
          timestamp: new Date().toISOString()
        }));
      }, 500);
      break;
      
    case '/error':
      // Return error status
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: true,
        message: 'This is a simulated server error',
        code: 'SERVER_ERROR'
      }));
      break;
      
    default:
      // Default response
      res.setHeader('Content-Type', 'text/plain');
      res.end(`Hello from the test server! Requested: ${path}`);
  }
});

// Start the server and return it for testing
function startServer(port = 0) {
  return new Promise((resolve) => {
    server.listen(port, () => {
      const serverInfo = {
        port: server.address().port,
        close: () => {
          return new Promise(resolve => {
            server.close(resolve);
          });
        }
      };
      resolve(serverInfo);
    });
  });
}

export { startServer };
