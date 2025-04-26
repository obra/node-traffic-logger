// ABOUTME: Unit tests for enhanced JSON formatting
// ABOUTME: Tests advanced JSON formatting capabilities

const { formatJson, isLikelyJson, formatContent } = require('../../src/json-formatter.cjs');

describe('Enhanced JSON Formatting', () => {
  test('formatJson should handle regular JSON objects with compact arrays', () => {
    const input = { 
      items: [1, 2, 3, 4], 
      nested: { array: [5, 6, 7] },
      info: { name: "Test" }
    };
    
    const formatted = formatJson(input);
    
    // Arrays should be on a single line
    expect(formatted).toContain('[1, 2, 3, 4]');
    expect(formatted).toContain('[5, 6, 7]');
    expect(formatted).not.toContain('[\n');
    
    // But objects should be properly indented
    expect(formatted).toContain('{\n');
    expect(formatted).toContain('"name": "Test"');
  });
  
  test('formatJson should handle deeply nested objects', () => {
    const deeplyNested = {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                level6: { data: "Too deep" }
              }
            }
          }
        }
      }
    };
    
    const formatted = formatJson(deeplyNested);
    
    // Should prevent infinite nesting but still format properly
    expect(formatted).toContain('level5');
    // Should not fail on deeply nested objects
    expect(formatted).toBeDefined();
  });
  
  test('formatJson should handle circular references', () => {
    const circular = { name: "Circular" };
    circular.self = circular;
    
    const formatted = formatJson(circular);
    
    // Should handle circular references
    expect(formatted).toContain('Error formatting JSON: Maximum call stack size exceeded');
  });
  
  test('formatJson should handle very large arrays without truncation', () => {
    const largeArray = { items: Array.from({ length: 100 }, (_, i) => i) };
    
    const formatted = formatJson(largeArray);
    
    // Should contain all items
    for (let i = 0; i < 100; i++) {
      expect(formatted).toContain(String(i));
    }
  });
  
  test('formatJson should handle very long string values without truncation', () => {
    const longString = { 
      description: "A".repeat(2000)
    };
    
    const formatted = formatJson(longString);
    
    // Should not truncate the long string
    expect(formatted).toContain("A".repeat(2000));
    // Should contain the full string
    expect(formatted).not.toContain('chars truncated');
  });
  
  test('isLikelyJson should correctly identify JSON strings', () => {
    // Valid JSON
    expect(isLikelyJson('{"name":"Test"}')).toBe(true);
    expect(isLikelyJson('[1,2,3]')).toBe(true);
    expect(isLikelyJson('{"items":[1,2,3]}')).toBe(true);
    
    // Not JSON
    expect(isLikelyJson('This is not JSON')).toBe(false);
    expect(isLikelyJson('<html>Not JSON</html>')).toBe(false);
    expect(isLikelyJson('')).toBe(false);
    expect(isLikelyJson(null)).toBe(false);
  });
  
  test('formatContent should auto-detect and format JSON even without content-type', () => {
    const jsonContent = '{"user":{"name":"Test","items":[1,2,3]}}';
    
    // Without content-type
    const formatted1 = formatContent(jsonContent);
    expect(formatted1).toContain('"name": "Test"');
    expect(formatted1).toContain('[1, 2, 3]');
    
    // With explicit JSON content-type
    const formatted2 = formatContent(jsonContent, 'application/json');
    expect(formatted2).toContain('"name": "Test"');
    expect(formatted2).toContain('[1, 2, 3]');
  });
  
  test('formatContent should handle binary data and non-JSON content', () => {
    // Non-JSON content
    const nonJson = 'Hello, world!';
    expect(formatContent(nonJson)).toBe(nonJson);
    
    // Invalid JSON that looks like JSON
    const invalidJson = '{"broken": true, missing: quote}';
    expect(formatContent(invalidJson)).toBe(invalidJson);
  });
  
  test('formatContent should handle various JSON-like content types', () => {
    const json = '{"value": 123}';
    
    // Different content types that indicate JSON
    expect(formatContent(json, 'application/json')).toContain('"value": 123');
    expect(formatContent(json, 'application/vnd.api+json')).toContain('"value": 123');
    expect(formatContent(json, 'application/ld+json')).toContain('"value": 123');
    expect(formatContent(json, 'text/json')).toContain('"value": 123');
  });
});
