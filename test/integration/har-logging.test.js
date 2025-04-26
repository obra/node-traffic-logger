const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const axios = require('axios');
const { promisify } = require('util');

// Import our instrumentation modules
const harLogger = require('../../src/har-logger.cjs');
const harFormatter = require('../../src/har-formatter.cjs');
const { createRequestWrapper, createGetWrapper } = require('../../src/request-wrapper.cjs');
const { instrumentAxios } = require('../../src/axios-wrapper.cjs');

// Create temp directory for test logs
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'har-integration-test-'));

describe('HAR Logging Integration', () => {
  let server;
  let serverPort;
  let harFilePath;
  let originalHttpRequest;
  let originalHttpsRequest;
  
  // Start a test server before all tests
  beforeAll((done) => {
    // Save original request functions
    originalHttpRequest = http.request;
    originalHttpsRequest = https.request;
    
    // Create a simple server for testing
    server = http.createServer((req, res) => {
      
      let body = '';
      
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      
      req.on('end', () => {
        
        // Parse the URL
        const urlParts = req.url.split('?');
        const path = urlParts[0];
        
        // Set default headers
        res.setHeader('Content-Type', 'application/json');
        
        // Handle different routes
        
        if (path === '/api/test') {
          res.statusCode = 200;
          const responseBody = JSON.stringify({ 
            message: 'Test endpoint', 
            method: req.method, 
            headers: req.headers 
          });
          res.end(responseBody);
        } else if (path === '/api/echo') {
          res.statusCode = 200;
          const responseBody = JSON.stringify({ 
            echo: body || '(empty body)',
            contentType: req.headers['content-type'] || 'none'
          });
          res.end(responseBody);
        } else if (path === '/api/redirect') {
          res.statusCode = 302;
          res.setHeader('Location', '/api/test');
          res.end();
        } else if (path === '/api/error') {
          res.statusCode = 500;
          const responseBody = JSON.stringify({ error: 'Test error' });
          res.end(responseBody);
        } else {
          res.statusCode = 404;
          const responseBody = JSON.stringify({ error: 'Not found' });
          res.end(responseBody);
        }
      });
    });
    
    // Start the server on a random port
    server.listen(0, () => {
      serverPort = server.address().port;
      done();
    });
  });
  
  // Stop the server after all tests
  afterAll((done) => {
    // Restore original request functions
    http.request = originalHttpRequest;
    https.request = originalHttpsRequest;
    
    // Close the server
    server.close(() => {
      // Clean up temp directory
      try {
        fs.rmSync(tempDir, { recursive: true });
      } catch (err) {
      }
      done();
    });
  });
  
  // Initialize HAR logging before each test
  beforeEach(() => {
    // Initialize logging
    harFilePath = harLogger.initializeLogging(tempDir);
    
    // Instrument HTTP(S) for this test
    http.request = createRequestWrapper(originalHttpRequest, false, harLogger);
    http.get = createGetWrapper(http.request);
    https.request = createRequestWrapper(originalHttpsRequest, true, harLogger);
    https.get = createGetWrapper(https.request);
    
    // Register exit handler
    harLogger.registerExitHandler();
    
    // Add listeners to verify if Node.js is accessing the actual HTTP modules directly
    const events = require('events');
    const oldEmit = events.EventEmitter.prototype.emit;
    events.EventEmitter.prototype.emit = function(type, ...args) {
      if (type === 'request' && this.constructor && this.constructor.name === 'Server') {
      }
      return oldEmit.apply(this, arguments);
    };
  });
  
  // Clean up after each test
  afterEach(() => {
    // Remove exit handler
    harLogger.removeExitHandler();
  });
  
  // Utility to wait for file to be updated
  const waitForFileUpdate = async (filePath, timeout = 1000) => {
    const start = Date.now();
    
    let attempts = 0;
    
    while (Date.now() - start < timeout) {
      attempts++;
      try {
        const stats = fs.statSync(filePath);
        
        if (stats.size > 0) {
          return true;
        }
      } catch (err) {
      }
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return false;
  };
  
  test('should log HTTP requests to HAR file', async () => {
    try {
      
      // Directly use a HTTP client that doesn't depend on monkey patching
      const requestData = await new Promise((resolve, reject) => {
        // Create request manually
        const req = originalHttpRequest({
          hostname: 'localhost',
          port: serverPort,
          path: '/api/test',
          method: 'GET'
        });
        
        req.on('response', (res) => {
          
          let body = '';
          res.on('data', (chunk) => {
            body += chunk.toString();
          });
          
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              body
            });
          });
          
          res.on('error', (err) => {
            reject(err);
          });
        });
        
        req.on('error', (err) => {
          reject(err);
        });
        
        req.end();
      });
      
      
      // Now make the same request using the wrapped HTTP client
      
      // We'll use the test's http module which should be wrapped
      const wrappedRequestData = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: 'localhost',
          port: serverPort,
          path: '/api/test',
          method: 'GET'
        });
        
        req.on('response', (res) => {
          
          let body = '';
          res.on('data', (chunk) => {
            body += chunk.toString();
          });
          
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              body
            });
          });
          
          res.on('error', (err) => {
            reject(err);
          });
        });
        
        req.on('error', (err) => {
          reject(err);
        });
        
        req.end();
      });
      
      
      // Force save of HAR file
      harFormatter.saveHar();
      
      // Give it a little extra time to ensure the file is written
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Wait for the HAR file to be updated
      const updated = await waitForFileUpdate(harFilePath, 2000);
    } catch (err) {
      throw err;
    }
    
    // Verify the HAR file contains the request and response
    let harData;
    
    try {
      const data = fs.readFileSync(harFilePath, 'utf8');
      
      harData = JSON.parse(data);
      
      
      if (harData.log && harData.log.entries) {
        
        harData.log.entries.forEach((entry, i) => {
        });
      }
      
      // Check HAR structure
      expect(harData).toHaveProperty('log');
      expect(harData.log).toHaveProperty('entries');
      expect(Array.isArray(harData.log.entries)).toBe(true);
      expect(harData.log.entries.length).toBeGreaterThan(0);
      
      // Find the entry for our request
      const entry = harData.log.entries.find(e => 
        e.request && 
        e.request.url.includes(`/api/test`) && 
        e.request.method === 'GET'
      );
      
      // Check that we found a matching entry
      
      expect(entry).toBeDefined();
      
      // Check response details if we have an entry
      if (entry) {
        expect(entry.response.status).toBe(200);
        expect(entry.response.content.mimeType).toContain('application/json');
        expect(entry.response.content.text).toContain('Test endpoint');
      }
    } catch (err) {
      throw err;
    }
  });
  
  test('should log POST requests with bodies', async () => {
    
    try {
      // Create POST options
      const options = {
        hostname: 'localhost',
        port: serverPort,
        path: '/api/echo',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      
      // Create request and send body in a Promise - using more robust handling
      const reqData = await new Promise((resolve, reject) => {
        // Setup error handling
        const timeoutId = setTimeout(() => {
          reject(new Error('Request timed out after 5 seconds'));
        }, 5000);
        
        const req = http.request(options);
        
        // Debug the actual headers being sent
        
        // Handle request errors
        req.on('error', (err) => {
          clearTimeout(timeoutId);
          reject(err);
        });
        
        // Handle response
        req.on('response', (res) => {
          
          let responseBody = '';
          
          // Handle response data
          res.on('data', chunk => {
            responseBody += chunk.toString();
          });
          
          // Handle response completion
          res.on('end', () => {
            clearTimeout(timeoutId);
            resolve({ statusCode: res.statusCode, body: responseBody });
          });
          
          // Handle response errors
          res.on('error', (err) => {
            clearTimeout(timeoutId);
            reject(err);
          });
        });
        
        // Send the request with a body
        const reqBody = JSON.stringify({ test: 'body content', number: 42 });
        req.write(reqBody);
        req.end();
      });
      
      
      // Force save of HAR file
      harFormatter.saveHar();
      
      // Give it a little extra time to ensure the file is written
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Wait for the HAR file to be updated
      const updated = await waitForFileUpdate(harFilePath, 2000);
      
      // Verify the HAR file contains the request and response
      
      const data = fs.readFileSync(harFilePath, 'utf8');
      
      const harData = JSON.parse(data);
      
      
      // Find the entry for our POST request
      const entry = harData.log.entries.find(e => 
        e.request && 
        e.request.url.includes(`/api/echo`) && 
        e.request.method === 'POST'
      );
      
      // Check that we found a matching entry
      expect(entry).toBeDefined();
      
      // Check request details if we found the entry
      if (entry) {
        // Check request body
        expect(entry.request).toHaveProperty('postData');
        
        if (entry.request.postData) {
          
          expect(entry.request.postData.mimeType).toBe('application/json');
          expect(entry.request.postData.text).toContain('body content');
        }
        
        // Check response
        
        expect(entry.response.status).toBe(200);
        expect(entry.response.content.text).toContain('echo');
      }
    } catch (err) {
      throw err;
    }
  });
  
  test('should log Axios requests', async () => {
    // Instrument Axios
    const instrumentedAxios = instrumentAxios(axios);
    
    // Make an Axios request
    await instrumentedAxios.get(`http://localhost:${serverPort}/api/test`);
    
    // Wait for the HAR file to be updated
    await waitForFileUpdate(harFilePath);
    
    // Verify the HAR file contains the request and response
    const harData = JSON.parse(fs.readFileSync(harFilePath, 'utf8'));
    
    // Check that we have entries
    expect(harData.log.entries.length).toBeGreaterThan(0);
    
    // Find the Axios request (may not be the first one)
    const axiosEntry = harData.log.entries.find(entry => 
      entry.request.headers.some(h => 
        h.name === 'User-Agent' && h.value.includes('axios')
      )
    );
    
    // Check request details
    expect(axiosEntry).toBeDefined();
    expect(axiosEntry.request.method).toBe('GET');
    expect(axiosEntry.request.url).toContain(`/api/test`);
    
    // Check response details
    expect(axiosEntry.response.status).toBe(200);
    expect(axiosEntry.response.content.mimeType).toContain('application/json');
  });
  
  test('should log redirects correctly', async () => {
    try {
      
      // Create request manually for better control
      const reqData = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: 'localhost',
          port: serverPort,
          path: '/api/redirect',
          method: 'GET'
        });
        
        req.on('response', (res) => {
          
          let body = '';
          res.on('data', (chunk) => {
            body += chunk.toString();
          });
          
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body
            });
          });
          
          res.on('error', (err) => {
            reject(err);
          });
        });
        
        req.on('error', (err) => {
          reject(err);
        });
        
        req.end();
      });
      
      
      // Force save of HAR file
      harFormatter.saveHar();
      
      // Give it a little extra time to ensure the file is written
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Wait for the HAR file to be updated
      const updated = await waitForFileUpdate(harFilePath, 2000);
      
      // Verify the HAR file contains the redirect
      
      const data = fs.readFileSync(harFilePath, 'utf8');
      
      const harData = JSON.parse(data);
      
      
      // Find the redirect entry
      const redirectEntry = harData.log.entries.find(entry => 
        entry.request && 
        entry.request.url.includes('/api/redirect')
      );
      
      // Check that we found the redirect entry
      expect(redirectEntry).toBeDefined();
      
      // Check redirect details if we found the entry
      if (redirectEntry) {
        
        expect(redirectEntry.response.status).toBe(302);
        expect(redirectEntry.response.redirectURL).toBe('/api/test');
      }
      
      // There should also be a subsequent request to the target URL if http follows redirects
      const targetEntry = harData.log.entries.find(entry => 
        entry.request && 
        entry.request.url.includes('/api/test') && 
        entry.request.method === 'GET'
      );
      
      
      // This may not be present if http module doesn't follow redirects automatically
      if (targetEntry) {
        expect(targetEntry.response.status).toBe(200);
      }
    } catch (err) {
      throw err;
    }
  });
  
  test('should log error responses', async () => {
    // Make a request that will result in an error
    try {
      const getPromise = promisify(http.get);
      await getPromise(`http://localhost:${serverPort}/api/error`);
    } catch (err) {
      // Ignore errors, we're just testing the logging
    }
    
    // Wait for the HAR file to be updated
    await waitForFileUpdate(harFilePath);
    
    // Verify the HAR file contains the error
    const harData = JSON.parse(fs.readFileSync(harFilePath, 'utf8'));
    
    // Find the error entry
    const errorEntry = harData.log.entries.find(entry => 
      entry.request.url.includes('/api/error')
    );
    
    // Check error details
    expect(errorEntry).toBeDefined();
    expect(errorEntry.response.status).toBe(500);
    expect(errorEntry.response.content.text).toContain('error');
  });
  
  test('should calculate timing information', async () => {
    
    try {
      
      // Create request manually for better control
      const reqData = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: 'localhost',
          port: serverPort,
          path: '/api/test',
          method: 'GET'
        });
        
        req.on('response', (res) => {
          
          let body = '';
          res.on('data', (chunk) => {
            body += chunk.toString();
          });
          
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              body
            });
          });
          
          res.on('error', (err) => {
            reject(err);
          });
        });
        
        req.on('error', (err) => {
          reject(err);
        });
        
        req.end();
      });
      
      
      // Force save of HAR file
      harFormatter.saveHar();
      
      // Give it a little extra time to ensure the file is written
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Wait for the HAR file to be updated
      const updated = await waitForFileUpdate(harFilePath, 2000);
      
      // Verify the HAR file contains timing information
      
      const data = fs.readFileSync(harFilePath, 'utf8');
      
      const harData = JSON.parse(data);
      
      
      // Find the entry for our test request
      const entry = harData.log.entries.find(e => 
        e.request && 
        e.request.url.includes(`/api/test`) && 
        e.request.method === 'GET'
      );
      
      // Check that we found a matching entry
      expect(entry).toBeDefined();
      
      // Check timing details if we found the entry
      if (entry) {
        
        expect(entry.time).toBeGreaterThan(0);
        expect(entry.timings).toBeDefined();
        expect(entry.timings.send).toBeGreaterThanOrEqual(0);
        expect(entry.timings.wait).toBeGreaterThanOrEqual(0);
        expect(entry.timings.receive).toBeGreaterThanOrEqual(0);
      }
    } catch (err) {
      throw err;
    }
  });
});
