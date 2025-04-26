// Test file for chunked decoder module
const { decodeChunkedResponse, isChunkedResponse } = require('../../src/chunked-decoder.cjs');

describe('Chunked Transfer Decoder', () => {
  describe('isChunkedResponse', () => {
    test('detects chunked encoding in headers', () => {
      // Test with lowercase header
      expect(isChunkedResponse({
        'transfer-encoding': 'chunked'
      })).toBe(true);
      
      // Test with mixed case header
      expect(isChunkedResponse({
        'Transfer-Encoding': 'chunked'
      })).toBe(true);
      
      // Test with multiple encodings
      expect(isChunkedResponse({
        'transfer-encoding': 'gzip, chunked'
      })).toBe(true);
      
      // Test with non-chunked encoding
      expect(isChunkedResponse({
        'transfer-encoding': 'gzip'
      })).toBe(false);
      
      // Test with no transfer-encoding header
      expect(isChunkedResponse({
        'content-type': 'application/json'
      })).toBe(false);
      
      // Test with null/undefined
      expect(isChunkedResponse(null)).toBe(false);
      expect(isChunkedResponse(undefined)).toBe(false);
    });
  });
  
  describe('decodeChunkedResponse', () => {
    test('decodes a simple chunked response', () => {
      const chunkedData = 
        "5\r\nHello\r\n" +
        "7\r\n World!\r\n" +
        "0\r\n\r\n";
      
      const result = decodeChunkedResponse(chunkedData);
      
      expect(result.body.toString()).toBe('Hello World!');
      expect(result.chunks.length).toBe(3); // 2 data chunks + 1 terminator
      expect(result.chunks[0].size).toBe(5);
      expect(result.chunks[1].size).toBe(7);
      expect(result.chunks[2].size).toBe(0);
    });
    
    test('handles chunked response with trailers', () => {
      const chunkedData = 
        "5\r\nHello\r\n" +
        "6\r\n World\r\n" +
        "0\r\n" +
        "X-Test: value\r\n" +
        "X-Another: test\r\n" +
        "\r\n";
      
      const result = decodeChunkedResponse(chunkedData);
      
      expect(result.body.toString()).toBe('Hello World');
      expect(result.chunks.length).toBe(3);
      expect(result.trailers['X-Test']).toBe('value');
      expect(result.trailers['X-Another']).toBe('test');
    });
    
    test('handles chunked response with chunk extensions', () => {
      const chunkedData = 
        "5;ext=value\r\nHello\r\n" +
        "7;another=ext\r\n World!\r\n" +
        "0\r\n\r\n";
      
      const result = decodeChunkedResponse(chunkedData);
      
      expect(result.body.toString()).toBe('Hello World!');
      expect(result.chunks.length).toBe(3);
    });
    
    test('throws error on invalid chunked format', () => {
      // Invalid chunk size delimiter
      const invalidChunkedData = "5Hello\r\n0\r\n\r\n";
      
      expect(() => {
        decodeChunkedResponse(invalidChunkedData);
      }).toThrow('Invalid chunked encoding');
    });
    
    test('handles Buffer input', () => {
      const chunkedData = Buffer.from(
        "5\r\nHello\r\n" +
        "6\r\n World\r\n" +
        "0\r\n\r\n"
      );
      
      const result = decodeChunkedResponse(chunkedData);
      
      expect(result.body.toString()).toBe('Hello World');
      expect(result.chunks.length).toBe(3);
    });
    
    test('throws error on non-string/buffer input', () => {
      expect(() => {
        decodeChunkedResponse(123);
      }).toThrow('Input must be a Buffer or string');
    });
  });
});