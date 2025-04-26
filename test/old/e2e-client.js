// ABOUTME: Client script for end-to-end testing of node-traffic-logger
// ABOUTME: Makes various HTTP requests to demonstrate logging capabilities

import http from 'http';
import https from 'https';

// Minimal test server
const server = http.createServer((req, res) => {
  // Extract request details
  const url = new URL(req.url, `http://${req.headers.host}`);
  const chunks = [];
  
  // Collect request body if any
  req.on('data', (chunk) => chunks.push(chunk));
  
  // Process request when complete
  req.on('end', () => {
    const body = chunks.length ? Buffer.concat(chunks).toString() : '';
    let responseBody;
    
    // Respond based on path
    if (url.pathname === '/echo') {
      // Echo the request details back
      responseBody = JSON.stringify({
        method: req.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        headers: req.headers,
        body: body ? JSON.parse(body) : undefined
      });
    } else {
      // Default response
      responseBody = JSON.stringify({
        message: 'Hello from test server',
        path: url.pathname,
        method: req.method,
        timestamp: new Date().toISOString()
      });
    }
    
    // Send response
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(responseBody);
  });
});

// Make test requests
async function runTests() {
  // Start local server
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`[Client] Test server running on port ${port}`);
  
  try {
    // Test 1: Simple GET request to our test server
    console.log('\n[Client] Making simple GET request...');
    await makeRequest(`http://localhost:${port}/simple`);
    
    // Test 2: GET request with query parameters
    console.log('\n[Client] Making GET request with query parameters...');
    await makeRequest(`http://localhost:${port}/query?id=123&name=test`);
    
    // Test 3: POST request with JSON body
    console.log('\n[Client] Making POST request with JSON body...');
    await makePostRequest(`http://localhost:${port}/echo`, {
      name: 'Test User',
      items: [1, 2, 3],
      nested: { key: 'value' }
    });
    
    // Test 4: External HTTPS request
    console.log('\n[Client] Making external HTTPS request...');
    await makeRequest('https://httpbin.org/get?param=test');
    
    console.log('\n[Client] All test requests completed successfully');
  } catch (error) {
    console.error('[Client] Error during test:', error.message);
  } finally {
    // Clean up
    await new Promise(resolve => server.close(resolve));
    console.log('[Client] Test server closed');
  }
}

// Helper for making GET requests
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    
    lib.get(url, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString();
          console.log(`[Client] Response (${res.statusCode}):`, 
            body.length > 100 ? body.substring(0, 100) + '...' : body);
          resolve(body);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

// Helper for making POST requests with JSON body
function makePostRequest(url, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString();
          console.log(`[Client] Response (${res.statusCode}):`, 
            body.length > 100 ? body.substring(0, 100) + '...' : body);
          resolve(body);
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Run all tests
runTests().catch(error => {
  console.error('[Client] Unhandled error:', error);
  process.exit(1);
});