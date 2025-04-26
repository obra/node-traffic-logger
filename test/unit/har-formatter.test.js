const fs = require('fs');
const path = require('path');
const os = require('os');
const harFormatter = require('../../src/har-formatter.cjs');

// Create temp directory for test logs
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'har-test-'));

describe('HAR Formatter', () => {
  let logFile;
  
  beforeEach(() => {
    // Initialize log file before each test
    logFile = harFormatter.initializeLog(tempDir);
  });
  
  afterEach(() => {
    // Cleanup after each test
    harFormatter.cleanup();
  });
  
  afterAll(() => {
    // Clean up temp directory after all tests
    try {
      fs.rmSync(tempDir, { recursive: true });
    } catch (err) {
      console.error(`Error cleaning up temp directory: ${err.message}`);
    }
  });
  
  test('should initialize with valid HAR structure', () => {
    // Verify that the HAR file contains a valid structure
    const harData = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    
    expect(harData).toHaveProperty('log');
    expect(harData.log).toHaveProperty('version', '1.2');
    expect(harData.log).toHaveProperty('creator');
    expect(harData.log).toHaveProperty('entries');
    expect(Array.isArray(harData.log.entries)).toBe(true);
  });
  
  test('should create valid request entries', () => {
    // Create a test request
    const requestId = 'test-req-123';
    const entry = harFormatter.addRequest({
      requestId,
      method: 'GET',
      url: 'https://example.com/api/test',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Node-Traffic-Logger/1.0'
      },
      httpVersion: 'HTTP/1.1',
      isHttps: true
    });
    
    // Verify the entry was created with correct data
    expect(entry).toBeDefined();
    expect(entry.request.method).toBe('GET');
    expect(entry.request.url).toBe('https://example.com/api/test');
    
    // Verify headers were properly formatted
    const acceptHeader = entry.request.headers.find(h => h.name === 'Accept');
    expect(acceptHeader).toBeDefined();
    expect(acceptHeader.value).toBe('application/json');
    
    // Save the HAR file explicitly to ensure it's up to date
    harFormatter.saveHar();
    
    // Verify it was added to the HAR file
    const harData = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    expect(harData.log.entries.length).toBeGreaterThan(0);
  });
  
  test('should add and correlate response entries', () => {
    // First create a request
    const requestId = 'test-req-456';
    harFormatter.addRequest({
      requestId,
      method: 'POST',
      url: 'https://example.com/api/submit',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ test: true }),
      httpVersion: 'HTTP/1.1',
      isHttps: true
    });
    
    // Then add a response for that request
    const response = harFormatter.addResponse({
      requestId,
      statusCode: 201,
      statusText: 'Created',
      headers: {
        'Content-Type': 'application/json',
        'Location': '/api/items/123'
      },
      body: JSON.stringify({ id: 123, success: true }),
      httpVersion: 'HTTP/1.1'
    });
    
    // Verify the response was added and linked to the request
    expect(response).toBeDefined();
    expect(response.response.status).toBe(201);
    expect(response.response.statusText).toBe('Created');
    
    // Verify response content
    expect(response.response.content.mimeType).toBe('application/json');
    expect(response.response.content.text).toContain('success');
    
    // Verify timing data was generated
    expect(response.time).toBeGreaterThan(0);
    expect(response.timings.wait).toBeGreaterThan(-1);
    
    // Save the HAR file explicitly to ensure it's up to date
    harFormatter.saveHar();
    
    // Check HAR file content
    const harData = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    expect(harData.log.entries.length).toBeGreaterThan(0);
    
    // Find the entry for our test request
    const entry = harData.log.entries.find(e => 
      e.request && e.request.url === 'https://example.com/api/submit'
    );
    expect(entry).toBeDefined();
    expect(entry.response.status).toBe(201);
  });
  
  test('should handle array headers correctly', () => {
    const requestId = 'test-req-789';
    const entry = harFormatter.addRequest({
      requestId,
      method: 'GET',
      url: 'https://example.com/api/test',
      headers: {
        'Accept': ['text/html', 'application/json'],
        'X-Multi-Header': ['value1', 'value2', 'value3']
      },
      httpVersion: 'HTTP/1.1'
    });
    
    // Verify array headers were joined with commas
    const acceptHeader = entry.request.headers.find(h => h.name === 'Accept');
    expect(acceptHeader).toBeDefined();
    expect(acceptHeader.value).toBe('text/html, application/json');
    
    const multiHeader = entry.request.headers.find(h => h.name === 'X-Multi-Header');
    expect(multiHeader).toBeDefined();
    expect(multiHeader.value).toBe('value1, value2, value3');
  });
  
  test('should extract query parameters from URL', () => {
    const requestId = 'test-req-query';
    const entry = harFormatter.addRequest({
      requestId,
      method: 'GET',
      url: 'https://example.com/search?q=test&page=1&sort=desc',
      headers: {},
      httpVersion: 'HTTP/1.1'
    });
    
    // Check query parameters were extracted
    expect(entry.request.queryString.length).toBe(3);
    
    const qParam = entry.request.queryString.find(p => p.name === 'q');
    expect(qParam).toBeDefined();
    expect(qParam.value).toBe('test');
    
    const pageParam = entry.request.queryString.find(p => p.name === 'page');
    expect(pageParam).toBeDefined();
    expect(pageParam.value).toBe('1');
  });
  
  test('should extract cookies from Set-Cookie headers', () => {
    const requestId = 'test-req-cookies';
    
    // First create a request
    harFormatter.addRequest({
      requestId,
      method: 'GET',
      url: 'https://example.com/login',
      headers: {},
      httpVersion: 'HTTP/1.1'
    });
    
    // Then add a response with cookies
    const response = harFormatter.addResponse({
      requestId,
      statusCode: 200,
      statusText: 'OK',
      headers: {
        'Set-Cookie': [
          'sessionId=abc123; Path=/; HttpOnly; Secure',
          'preferences=dark-mode; Path=/; Expires=Wed, 01 Jan 2025 00:00:00 GMT'
        ]
      },
      body: 'Login successful',
      httpVersion: 'HTTP/1.1'
    });
    
    // Verify cookies were extracted
    expect(response.response.cookies.length).toBe(2);
    
    const sessionCookie = response.response.cookies.find(c => c.name === 'sessionId');
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie.value).toBe('abc123');
    expect(sessionCookie.path).toBe('/');
    expect(sessionCookie.httpOnly).toBe(true);
    expect(sessionCookie.secure).toBe(true);
    
    const prefsCookie = response.response.cookies.find(c => c.name === 'preferences');
    expect(prefsCookie).toBeDefined();
    expect(prefsCookie.value).toBe('dark-mode');
    expect(prefsCookie.path).toBe('/');
    expect(prefsCookie.expires).toBeDefined();
  });
  
  test('should handle redirects correctly', () => {
    const requestId = 'test-req-redirect';
    
    // Create a request
    harFormatter.addRequest({
      requestId,
      method: 'GET',
      url: 'http://example.com/old-page',
      headers: {},
      httpVersion: 'HTTP/1.1'
    });
    
    // Add a redirect response
    const response = harFormatter.addResponse({
      requestId,
      statusCode: 302,
      statusText: 'Found',
      headers: {
        'Location': 'http://example.com/new-page'
      },
      body: '',
      httpVersion: 'HTTP/1.1'
    });
    
    // Verify redirect URL was captured
    expect(response.response.redirectURL).toBe('http://example.com/new-page');
    expect(response.response.status).toBe(302);
  });
  
  test('should validate HAR format', () => {
    // Add some entries to the HAR file
    const requestId = 'test-req-validate';
    harFormatter.addRequest({
      requestId,
      method: 'GET',
      url: 'https://example.com/api/test',
      headers: {},
      httpVersion: 'HTTP/1.1'
    });
    
    harFormatter.addResponse({
      requestId,
      statusCode: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'text/plain' },
      body: 'Test response',
      httpVersion: 'HTTP/1.1'
    });
    
    // Validate the HAR
    const isValid = harFormatter.validateHar();
    expect(isValid).toBe(true);
    
    // Check structure against HAR schema requirements
    const harData = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    expect(harData.log.version).toBeDefined();
    expect(harData.log.creator).toBeDefined();
    expect(harData.log.creator.name).toBeDefined();
    expect(harData.log.creator.version).toBeDefined();
    expect(Array.isArray(harData.log.entries)).toBe(true);
  });
});
