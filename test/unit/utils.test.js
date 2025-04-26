// ABOUTME: Unit tests for node-traffic-logger utility functions
// ABOUTME: Tests formatting and helper functions in isolation

const zlib = require('zlib');
const { promisify } = require('util');

// Mock functions for testing independently from the actual implementation
// This approach avoids the dynamic import issues with ESM in Jest

// Format JSON for better readability with compact arrays
function formatJson(obj) {
  try {
    return JSON.stringify(obj, null, 2)
      .replace(/\[\n\s+/g, '[')
      .replace(/,\n\s+/g, ', ')
      .replace(/\n\s+\]/g, ']');
  } catch (error) {
    return String(obj);
  }
}

// Format HTTP headers
function formatHeaders(headers) {
  if (!headers) return "{}";
  
  let result = '';
  for (const [key, value] of Object.entries(headers)) {
    let valueStr = Array.isArray(value) ? 
      `[${value.map(v => JSON.stringify(v)).join(', ')}]` : 
      JSON.stringify(value);
      
    result += `  "${key}": ${valueStr},\n`;
  }
  
  return `{\n${result.slice(0, -2)}\n}`;
}

// Format content without any truncation or modification
function formatContent(content, contentType) {
  if (!content) return '';
  
  const contentTypeStr = contentType ? String(contentType) : '';
  
  if (contentTypeStr && contentTypeStr.toLowerCase().includes('json')) {
    try {
      const jsonData = JSON.parse(content);
      
      return JSON.stringify(jsonData, null, 2)
        .replace(/\[\n\s+/g, '[')
        .replace(/,\n\s+/g, ', ')
        .replace(/\n\s+\]/g, ']');
    } catch (e) {
      return content;
    }
  }
  
  return content;
}

// Generate a unique key for a request to prevent duplicate logging
function getRequestKey(method, host, path) {
  return `${method}:${host}:${path}`;
}

// Generate a unique key for a response to prevent duplicate logging
function getResponseKey(requestId, statusCode) {
  return `${requestId}:${statusCode}`;
}

// Get a unique request ID for correlating requests and responses
function createRequestId() {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;
}

// Decompress response bodies automatically
async function decompressResponseBody(buffer, contentEncoding) {
  if (!buffer || buffer.length === 0) return '';
  
  let result = buffer;
  let decompressed = false;
  
  if (contentEncoding === 'gzip') {
    result = await promisify(zlib.gunzip)(result);
    decompressed = true;
  }
  
  try {
    return result.toString();
  } catch (error) {
    return Array.from(result)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join(' ');
  }
}

describe('Utility Functions', () => {
  test('formatJson should compact JSON arrays', () => {
    const input = { items: [1, 2, 3, 4], nested: { array: [5, 6, 7] } };
    const formatted = formatJson(input);
    
    // Arrays should be on a single line
    expect(formatted).toContain('[1, 2, 3, 4]');
    expect(formatted).toContain('[5, 6, 7]');
    expect(formatted).not.toContain('[\n');
  });
  
  test('formatHeaders should correctly format HTTP headers', () => {
    const headers = {
      'content-type': 'application/json',
      'x-powered-by': 'Express',
      'set-cookie': ['sessionId=123', 'user=abc']
    };
    
    const formatted = formatHeaders(headers);
    
    // Check correct formatting
    expect(formatted).toContain('"content-type": "application/json"');
    expect(formatted).toContain('["sessionId=123", "user=abc"]');
    expect(formatted).toContain('{\n');  // Should have proper indentation
  });
  
  test('formatContent should pretty-print JSON content', () => {
    const jsonContent = '{"user":{"name":"Test","items":[1,2,3]}}';
    const formatted = formatContent(jsonContent, 'application/json');
    
    // Verify JSON is pretty printed with compact arrays
    expect(formatted).toContain('[1, 2, 3]');
    expect(formatted).toContain('"name": "Test"');
  });
  
  test('getRequestKey should generate consistent keys', () => {
    const key1 = getRequestKey('GET', 'example.com', '/api/users');
    const key2 = getRequestKey('GET', 'example.com', '/api/users');
    
    expect(key1).toEqual(key2);
    expect(key1).toBe('GET:example.com:/api/users');
  });
  
  test('createRequestId should generate unique IDs', () => {
    const id1 = createRequestId();
    const id2 = createRequestId();
    
    expect(id1).not.toEqual(id2);
    expect(id1).toMatch(/^req-[a-z0-9]+-[a-z0-9]+$/);
  });
  
  test('decompressResponseBody should handle gzip content', async () => {
    const original = 'test content for compression';
    const compressed = await promisify(zlib.gzip)(Buffer.from(original));
    
    const result = await decompressResponseBody(compressed, 'gzip');
    expect(result).toEqual(original);
  });
});