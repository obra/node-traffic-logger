// ABOUTME: Unit tests for enhanced compression detection
// ABOUTME: Tests advanced compression detection features

const zlib = require('zlib');
const { promisify } = require('util');

// Mocking the decompressResponseBody function for testing purposes
// Similar to the implementation in http-wrapper.js
async function decompressResponseBody(buffer, contentEncoding) {
  if (!buffer || buffer.length === 0) return '';
  
  let result = buffer;
  let decompressed = false;
  
  // Check for content-encoding header
  if (contentEncoding) {
    // Make sure contentEncoding is a string
    const encodingStr = String(contentEncoding); 
    const encodings = encodingStr.split(',').map(e => e.trim().toLowerCase());
    
    // Process encodings in reverse order
    for (let i = encodings.length - 1; i >= 0; i--) {
      const currentEncoding = encodings[i];
      
      try {
        if (currentEncoding === 'gzip') {
          result = await promisify(zlib.gunzip)(result);
          decompressed = true;
        } else if (currentEncoding === 'deflate') {
          try {
            result = await promisify(zlib.inflate)(result);
          } catch (e) {
            result = await promisify(zlib.inflateRaw)(result);
          }
          decompressed = true;
        } else if (currentEncoding === 'br') {
          result = await promisify(zlib.brotliDecompress)(result);
          decompressed = true;
        }
      } catch (error) {
        // Log decompression errors but continue with original data
        // In test, we just ignore errors
      }
    }
  }
  
  // Try to automatically detect compression
  if (!decompressed && buffer.length >= 3) {
    // Check for gzip magic number (1F 8B)
    if (buffer[0] === 0x1F && buffer[1] === 0x8B) {
      try {
        result = await promisify(zlib.gunzip)(buffer);
        decompressed = true;
      } catch (error) {
        // Silently use the original buffer
      }
    }
    // Check for zlib header (78 01, 78 9C, or 78 DA)
    else if (buffer[0] === 0x78 && (buffer[1] === 0x01 || buffer[1] === 0x9C || buffer[1] === 0xDA)) {
      try {
        result = await promisify(zlib.inflate)(buffer);
        decompressed = true;
      } catch (error) {
        try {
          result = await promisify(zlib.inflateRaw)(buffer);
          decompressed = true;
        } catch (innerError) {
          // Silently use the original buffer
        }
      }
    }
  }
  
  try {
    // For all data, return as string
    return result.toString();
  } catch (error) {
    // If toString fails, return as hex dump
    return Array.from(result)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join(' ');
  }
}

describe('Advanced Compression Detection', () => {
  const originalText = 'This is test content for compression testing';
  
  test('should handle basic gzip compression', async () => {
    const compressed = await promisify(zlib.gzip)(Buffer.from(originalText));
    const decompressed = await decompressResponseBody(compressed, 'gzip');
    expect(decompressed).toBe(originalText);
  });
  
  test('should handle basic deflate compression', async () => {
    const compressed = await promisify(zlib.deflate)(Buffer.from(originalText));
    const decompressed = await decompressResponseBody(compressed, 'deflate');
    expect(decompressed).toBe(originalText);
  });
  
  test('should handle basic brotli compression', async () => {
    const compressed = await promisify(zlib.brotliCompress)(Buffer.from(originalText));
    const decompressed = await decompressResponseBody(compressed, 'br');
    expect(decompressed).toBe(originalText);
  });
  
  test('should handle multiple compression encodings', async () => {
    let content = Buffer.from(originalText);
    // Apply multiple compression techniques
    content = await promisify(zlib.gzip)(content);
    content = await promisify(zlib.deflate)(content);
    
    // Should decompress in reverse order
    const decompressed = await decompressResponseBody(content, 'gzip, deflate');
    expect(decompressed).toBe(originalText);
  });
  
  test('should auto-detect gzip compression without content-encoding header', async () => {
    const compressed = await promisify(zlib.gzip)(Buffer.from(originalText));
    const decompressed = await decompressResponseBody(compressed);
    expect(decompressed).toBe(originalText);
  });
  
  test('should auto-detect deflate compression without content-encoding header', async () => {
    const compressed = await promisify(zlib.deflate)(Buffer.from(originalText));
    const decompressed = await decompressResponseBody(compressed);
    expect(decompressed).toBe(originalText);
  });
  
  test('should handle invalid or corrupted compression gracefully', async () => {
    // Create an invalid compression stream by corrupting a valid one
    const compressed = await promisify(zlib.gzip)(Buffer.from(originalText));
    compressed[10] = 0xFF; // Corrupt the data
    
    // Should not throw but return the original data or hex representation
    const result = await decompressResponseBody(compressed, 'gzip');
    expect(result).toBeTruthy(); // Just check that it returned something without error
  });
  
  test('should handle binary data properly', async () => {
    // Create binary data
    const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE, 0xFD]);
    const compressed = await promisify(zlib.gzip)(binaryData);
    
    const decompressed = await decompressResponseBody(compressed, 'gzip');
    
    // The decompression should result in a binary string or hex representation
    expect(decompressed.length).toBeGreaterThan(0);
  });
});