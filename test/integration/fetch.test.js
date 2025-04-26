const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Import required modules
const harLogger = require('../../src/har-logger.cjs');
const harFormatter = require('../../src/har-formatter.cjs');
const { setupFetchInterception } = require('../../src/fetch-wrapper.cjs');

describe('Fetch API Instrumentation', () => {
  let server;
  let port;
  let tempDir;
  let logFile;
  let originalFetch;
  
  // Set up test server and fetch-intercept
  beforeAll(async () => {
    // Save original fetch if it exists
    if (typeof global.fetch === 'function') {
      originalFetch = global.fetch;
    }
    
    // Create a temporary directory for test logs
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-test-'));
    
    // Create a test server
    server = http.createServer((req, res) => {
      const urlParts = req.url.split('?');
      const pathname = urlParts[0];
      const headers = { 'Content-Type': 'application/json' };
      
      // Special handling for testing URL parameters
      if (req.url.includes('?')) {
        const params = new URLSearchParams(urlParts[1]);
        const paramObj = {};
        for (const [key, value] of params.entries()) {
          paramObj[key] = value;
        }
        
        res.writeHead(200, headers);
        res.end(JSON.stringify({
          method: req.method,
          url: req.url,
          params: paramObj,
          headers: req.headers
        }));
        return;
      }
      
      // Handle different paths
      if (pathname === '/echo') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        
        req.on('end', () => {
          res.writeHead(200, headers);
          res.end(JSON.stringify({
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: body || null
          }));
        });
      } else if (pathname === '/error') {
        res.writeHead(500, headers);
        res.end(JSON.stringify({ error: 'Test error' }));
      } else if (pathname === '/binary') {
        res.writeHead(200, {'Content-Type': 'application/octet-stream'});
        res.end(Buffer.from([0x01, 0x02, 0x03, 0x04]));
      } else {
        res.writeHead(200, headers);
        res.end(JSON.stringify({ message: 'Test endpoint' }));
      }
    });
    
    // Start server on a random port
    await new Promise(resolve => {
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
    
    // Set up fetch if needed
    if (!global.fetch) {
      // Use node-fetch for Node.js <18
      try {
        const nodeFetch = require('node-fetch');
        global.fetch = nodeFetch;
      } catch (e) {
        console.warn('node-fetch not available, tests may be skipped');
      }
    }
    
    // Initialize logging with temp directory
    logFile = harLogger.initializeLogging(tempDir);
    
    // Use our actual implementation to set up fetch interception
    const unregister = setupFetchInterception();
    
    // Store the unregister function for cleanup
    global.__fetchInterceptUnregister = unregister;
  });
  
  afterAll(async () => {
    // Clean up fetch-intercept
    if (global.__fetchInterceptUnregister) {
      global.__fetchInterceptUnregister();
      delete global.__fetchInterceptUnregister;
    }
    
    // Restore original fetch if needed
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }
    
    // Close server
    await new Promise(resolve => server.close(resolve));
    
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error(`Error cleaning up temp directory: ${e.message}`);
    }
  });
  
  // Utility to wait for HAR file updates
  const waitForHarUpdate = async () => {
    harFormatter.saveHar();
    await new Promise(resolve => setTimeout(resolve, 100));
  };
  
  test('should log basic GET requests', async () => {
    // Skip if fetch is not available
    if (!global.fetch) {
      console.warn('Fetch API not available, skipping test');
      return;
    }
    
    // Make a simple GET request
    const url = `http://localhost:${port}/test`;
    const response = await fetch(url);
    expect(response.status).toBe(200);
    
    // Read response body to complete request
    const data = await response.json();
    expect(data.message).toBe('Test endpoint');
    
    // Wait for HAR to update
    await waitForHarUpdate();
    
    // Check HAR file for the request
    const harData = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    
    // Find the entry for our request
    const entry = harData.log.entries.find(e => 
      e.request && 
      e.request.url.includes(`localhost:${port}/test`) && 
      e.request.method === 'GET'
    );
    
    // Verify entry details
    expect(entry).toBeDefined();
    expect(entry.request.method).toBe('GET');
    expect(entry.response.status).toBe(200);
    expect(entry.response.content.text).toContain('Test endpoint');
  });
  
  test('should log POST requests with JSON body', async () => {
    // Skip if fetch is not available
    if (!global.fetch) {
      console.warn('Fetch API not available, skipping test');
      return;
    }
    
    // Make a POST request with JSON body
    const url = `http://localhost:${port}/echo`;
    const requestBody = { test: true, name: 'fetch test' };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    expect(response.status).toBe(200);
    
    // Read response
    const data = await response.json();
    expect(data.method).toBe('POST');
    
    // Wait for HAR to update
    await waitForHarUpdate();
    
    // Check HAR file for the request
    const harData = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    
    // Find the entry for our POST request
    const entry = harData.log.entries.find(e => 
      e.request && 
      e.request.url.includes(`localhost:${port}/echo`) && 
      e.request.method === 'POST'
    );
    
    // Verify entry details
    expect(entry).toBeDefined();
    expect(entry.request.method).toBe('POST');
    expect(entry.request.postData).toBeDefined();
    expect(entry.request.postData.text).toContain('fetch test');
    expect(entry.response.status).toBe(200);
  });
  
  test('should handle query parameters in URLs', async () => {
    // Skip if fetch is not available
    if (!global.fetch) {
      console.warn('Fetch API not available, skipping test');
      return;
    }
    
    // Make a request with query parameters
    const url = `http://localhost:${port}/test?param1=value1&param2=value2`;
    const response = await fetch(url);
    expect(response.status).toBe(200);
    
    // Read response
    const data = await response.json();
    expect(data.params.param1).toBe('value1');
    expect(data.params.param2).toBe('value2');
    
    // Wait for HAR to update
    await waitForHarUpdate();
    
    // Check HAR file for the request
    const harData = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    
    // Find the entry for our request
    const entry = harData.log.entries.find(e => 
      e.request && 
      e.request.url.includes(`localhost:${port}/test?param1=value1`)
    );
    
    // Verify entry details
    expect(entry).toBeDefined();
    expect(entry.request.queryString).toBeDefined();
    
    // Check that query parameters were captured in HAR
    const param1 = entry.request.queryString.find(p => p.name === 'param1');
    const param2 = entry.request.queryString.find(p => p.name === 'param2');
    
    expect(param1).toBeDefined();
    expect(param1.value).toBe('value1');
    expect(param2).toBeDefined();
    expect(param2.value).toBe('value2');
  });
  
  test('should handle error responses', async () => {
    // Skip if fetch is not available
    if (!global.fetch) {
      console.warn('Fetch API not available, skipping test');
      return;
    }
    
    // Make a request that will result in an error response
    const url = `http://localhost:${port}/error`;
    
    const response = await fetch(url);
    expect(response.status).toBe(500);
    
    // Read error response
    const data = await response.json();
    expect(data.error).toBe('Test error');
    
    // Wait for HAR to update
    await waitForHarUpdate();
    
    // Check HAR file for the request
    const harData = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    
    // Find the entry for our error request
    const entry = harData.log.entries.find(e => 
      e.request && 
      e.request.url.includes(`localhost:${port}/error`)
    );
    
    // Verify entry details
    expect(entry).toBeDefined();
    expect(entry.response.status).toBe(500);
    expect(entry.response.content.text).toContain('Test error');
  });
  
  test('should handle binary responses', async () => {
    // Skip if fetch is not available
    if (!global.fetch) {
      console.warn('Fetch API not available, skipping test');
      return;
    }
    
    // Make a request that returns binary data
    const url = `http://localhost:${port}/binary`;
    
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    
    // Get binary data
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    expect(bytes.length).toBe(4);
    expect(bytes[0]).toBe(1);
    expect(bytes[3]).toBe(4);
    
    // Wait for HAR to update
    await waitForHarUpdate();
    
    // Check HAR file for the request
    const harData = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    
    // Find the entry for our binary request
    const entry = harData.log.entries.find(e => 
      e.request && 
      e.request.url.includes(`localhost:${port}/binary`)
    );
    
    // Verify entry details
    expect(entry).toBeDefined();
    expect(entry.response.status).toBe(200);
    expect(entry.response.content.mimeType).toBe('application/octet-stream');
    // Binary content should be noted in the log
    expect(entry.response.content.text).toContain('Binary');
  });
  
  test('should correctly handle request aborts', async () => {
    // Skip if fetch is not available
    if (!global.fetch) {
      console.warn('Fetch API not available, skipping test');
      return;
    }
    
    // Skip if AbortController is not available
    if (typeof AbortController !== 'function') {
      console.warn('AbortController not available, skipping test');
      return;
    }
    
    // Create abort controller
    const controller = new AbortController();
    const signal = controller.signal;
    
    // Start a request that we'll abort
    const fetchPromise = fetch(`http://localhost:${port}/test`, { signal });
    
    // Abort immediately
    controller.abort();
    
    // Verify request was aborted
    await expect(fetchPromise).rejects.toThrow();
    
    // Wait for HAR to update
    await waitForHarUpdate();
    
    // Verify request was logged despite being aborted
    const harData = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    
    // The request should be logged, but may not have a valid response
    // Find any entries with our test URL
    const entries = harData.log.entries.filter(e => 
      e.request && 
      e.request.url.includes(`localhost:${port}/test`)
    );
    
    // We should have at least one entry for the aborted request
    expect(entries.length).toBeGreaterThan(0);
  });
});