// ABOUTME: JSON formatting module for node-traffic-logger
// ABOUTME: Provides enhanced JSON formatting functions for HTTP logs

const util = require('util');

/**
 * Format JSON objects for better readability with compact arrays and smart indentation
 * @param {any} obj - Object to format
 * @param {Object} options - Formatting options
 * @returns {string} Formatted JSON string
 */
function formatJson(obj, options = {}) {
  const {
    maxLength = Number.MAX_SAFE_INTEGER, // No truncation by default
    maxArrayItems = Number.MAX_SAFE_INTEGER, // No array item limit by default
    maxObjectKeys = Number.MAX_SAFE_INTEGER, // No object key limit by default
    indentSize = 2,           // Number of spaces for indentation
    compactArrays = true,     // Keep arrays on a single line when possible
    maxValueLength = Number.MAX_SAFE_INTEGER, // No value length limit by default
    maxNestedDepth = 100      // Very deep nesting allowed
  } = options;

  try {
    // For null/undefined values
    if (obj === null || obj === undefined) {
      return String(obj);
    }
    
    // For simple primitives
    if (typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    
    // Special case for obviously circular objects
    // but use a more generic circular reference detection in replacerFunction
    
    // Create a safe copy with depth limiting and value truncation
    const safeObj = limitObjectDepth(obj, maxNestedDepth, maxValueLength);
    
    // Pretty print the safe object
    const formatted = JSON.stringify(safeObj, replacerFunction(maxArrayItems, maxObjectKeys, maxValueLength), indentSize);
    
    // Apply compact arrays formatting if enabled
    const result = compactArrays 
      ? formatted
          .replace(/\[\n\s+/g, '[')
          .replace(/,\n\s+(?=[^{[])/g, ', ')  // Only compact non-object/array items
          .replace(/\n\s+\]/g, ']')
      : formatted;
    
    // We never truncate responses
    // The maxLength parameter is effectively disabled by setting it to MAX_SAFE_INTEGER
    
    return result;
  } catch (error) {
    return `[Error formatting JSON: ${error.message}] ${String(obj).substring(0, 200)}`;
  }
}

/**
 * Create a replacer function for JSON.stringify that handles circular references
 * but does not limit or truncate content
 */
function replacerFunction(maxArrayItems, maxObjectKeys, maxValueLength) {
  // Use array instead of sets to track object references directly
  const seenObjects = [];
  const seenPaths = [];
  
  return function(key, value) {
    // Special case for top-level object
    if (key === '') {
      return value;
    }
    
    // Only check for circular references for objects (not null, arrays are objects too)
    if (typeof value === 'object' && value !== null) {
      // Get the current path in the object graph
      const path = this.path || '';
      
      // Check if we've seen this exact object reference before
      // This is the key fix - only mark as circular if it's the SAME object reference
      // Previous implementation was incorrectly marking similar objects as circular
      // which caused issues with complex objects 
      const index = seenObjects.indexOf(value);
      
      if (index !== -1) {
        // We've seen this exact object before - it's a circular reference
        return '[Circular reference]';
      }
      
      // Remember we've seen this object and its path
      seenObjects.push(value);
      seenPaths.push(path);
    }
    
    // We never truncate arrays, objects, or string values
    // to ensure all information is preserved in logs
    return value;
  };
}

/**
 * Process objects for formatting without limiting depth or truncating content
 */
function limitObjectDepth(obj, maxDepth, maxValueLength, currentDepth = 0) {
  // We preserve full depth and content, but still need to handle 
  // objects correctly for formatting
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (typeof item === 'object' && item !== null) {
        return limitObjectDepth(item, maxDepth, maxValueLength, currentDepth + 1);
      }
      return item;
    });
  }
  
  // Handle regular objects
  if (typeof obj === 'object' && obj !== null) {
    // Handle Date objects
    if (obj instanceof Date) {
      return obj;
    }
    
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        result[key] = limitObjectDepth(value, maxDepth, maxValueLength, currentDepth + 1);
      } else {
        // Never truncate string values
        result[key] = value;
      }
    }
    return result;
  }
  
  return obj;
}

/**
 * Detects if a string is likely JSON content
 * @param {string} content - Content to check
 * @returns {boolean} True if likely JSON 
 */
function isLikelyJson(content) {
  if (!content || typeof content !== 'string') return false;
  
  const trimmed = content.trim();
  // Simple heuristic: JSON typically starts with { or [
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch (e) {
      // Not valid JSON
      return false;
    }
  }
  
  // Check for common JSON patterns
  const jsonPatterns = [
    /"[\w-]+":/,              // Property name pattern
    /\{[\s\n]*"[\w-]+":/,     // Object with property
    /\[[\s\n]*\{[\s\n]*"/     // Array of objects
  ];
  
  return jsonPatterns.some(pattern => pattern.test(trimmed));
}

/**
 * Format content with enhanced detection of JSON data
 * @param {string} content - Content to format
 * @param {string} contentType - Content type header
 * @returns {string} Formatted content
 */
function formatContent(content, contentType) {
  if (!content) return '';
  
  const contentTypeStr = contentType ? String(contentType) : '';
  const isJsonContentType = contentTypeStr.toLowerCase().includes('json');
  
  // Check if it's explicitly JSON or looks like JSON
  if (isJsonContentType || isLikelyJson(content)) {
    try {
      const jsonData = JSON.parse(content);
      return formatJson(jsonData);
    } catch (e) {
      // Not valid JSON, return as-is
      return content;
    }
  }
  
  return content;
}

// Export module functions
module.exports = {
  formatJson,
  isLikelyJson,
  formatContent
};
