// ABOUTME: Tests for utility functions in node-traffic-logger
// ABOUTME: Validates formatting and string handling functions

import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the current module directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import package code without instrumenting HTTP
const packagePath = path.join(__dirname, '..');

// Helper to get private functions for testing
async function getInternalFunctions() {
  // Read the index.js file to extract private functions for testing
  const indexPath = path.join(packagePath, 'index.js');
  const code = fs.readFileSync(indexPath, 'utf8');
  
  // Use dynamic import with a modified version of the index code
  // that exposes private functions for testing
  const testModule = `
    ${code}
    // Export private functions for testing
    export const __test = {
      formatJson,
      formatHeaders,
      formatContent,
      getRequestKey,
      getResponseKey,
      createRequestId,
      decompressResponseBody
    };
  `;
  
  // Create a temporary module file
  const tempFile = path.join(__dirname, 'temp-test-module.js');
  fs.writeFileSync(tempFile, testModule);
  
  try {
    // Import the temporary module
    const mod = await import(tempFile);
    return mod.__test;
  } finally {
    // Clean up the temporary file
    fs.unlinkSync(tempFile);
  }
}

async function runTests({ test, assert, assertDeepEqual }) {
  // Get internal functions for testing
  const internal = await getInternalFunctions();
  
  test('formatJson should properly format JSON', () => {
    const input = { items: [1, 2, 3, 4], nested: { array: [5, 6, 7] } };
    const formatted = internal.formatJson(input);
    
    // Check that arrays are on a single line
    assert(formatted.includes('[1, 2, 3, 4]'), 'Arrays should be compact');
    assert(formatted.includes('[5, 6, 7]'), 'Nested arrays should be compact');
  });
  
  test('formatHeaders should properly format HTTP headers', () => {
    const headers = {
      'content-type': 'application/json',
      'x-powered-by': 'Express',
      'set-cookie': ['sessionId=123', 'user=abc']
    };
    
    const formatted = internal.formatHeaders(headers);
    
    // Check that headers are properly formatted
    assert(formatted.includes('"content-type": "application/json"'), 'Should format string headers');
    assert(formatted.includes('["sessionId=123", "user=abc"]'), 'Should format array headers');
  });
  
  test('formatContent should pretty-print JSON content', () => {
    const jsonContent = '{"user":{"name":"Test","items":[1,2,3]}}';
    const formatted = internal.formatContent(jsonContent, 'application/json');
    
    // Verify JSON is pretty printed with compact arrays
    assert(formatted.includes('[1, 2, 3]'), 'JSON arrays should be compact');
    assert(formatted.includes('"name": "Test"'), 'JSON properties should be formatted');
  });
  
  test('getRequestKey should generate consistent keys', () => {
    const key1 = internal.getRequestKey('GET', 'example.com', '/api/users');
    const key2 = internal.getRequestKey('GET', 'example.com', '/api/users');
    
    assert(key1 === key2, 'Keys should be identical for same inputs');
    assert(key1 === 'GET:example.com:/api/users', 'Key format should be method:host:path');
  });
  
  test('createRequestId should generate unique IDs', () => {
    const id1 = internal.createRequestId();
    const id2 = internal.createRequestId();
    
    assert(id1 !== id2, 'Request IDs should be unique');
    assert(id1.startsWith('req-'), 'Request ID should have the correct prefix');
  });
  
  test('decompressResponseBody should handle gzip content', async () => {
    // Prepare compressed content
    const original = 'test content for compression';
    const compressed = await promisify(zlib.gzip)(Buffer.from(original));
    
    // Test decompression
    const result = await internal.decompressResponseBody(compressed, 'gzip');
    assert(result === original, 'Should correctly decompress gzip content');
  });
}

export { runTests };
