// ABOUTME: HAR-based HTTP traffic logger for node-traffic-logger
// ABOUTME: Provides HTTP logging using HAR format with full compatibility with existing logger API

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const util = require('util');
const harFormatter = require('./har-formatter.cjs');

// Configure logging
let logsDir;
let logFile = null;

// Maps and Sets to track request-response pairs
const requestMap = new Map();
const requestUrlMap = new Map();
const requestMethodMap = new Map();
const loggedRequests = new Set();
const loggedResponses = new Set();
const pendingRequestIds = new Set();

// Additional tracking for Axios requests
const axiosRequestIdMap = new Map();

/**
 * Initialize logging with optional custom directory
 * @param {string} customLogsDir - Optional custom logs directory
 * @returns {string} The path to the log file
 */
function initializeLogging(customLogsDir = null) {
  // Set up logs directory - check environment variable first, then parameter, then default
  if (process.env.NODE_TRAFFIC_LOGGER_DIR) {
    logsDir = process.env.NODE_TRAFFIC_LOGGER_DIR;
  } else if (customLogsDir) {
    logsDir = customLogsDir;
  } else {
    logsDir = path.join(process.cwd(), 'http-logs');
  }
  
  // Initialize the HAR formatter
  logFile = harFormatter.initializeLog(logsDir, {
    autoSave: true,
    autoSaveInterval: 5000 // Save every 5 seconds
  });
  
  // Add system log message
  harFormatter.addSystemLog('HTTP traffic logging initialized');
  
  return logFile;
}

/**
 * Log a message to the HAR file as a comment
 * @param {string} message - The message to log
 */
function log(message) {
  harFormatter.addSystemLog(message);
}

/**
 * Log a system message with timestamp
 * @param {string} message - The system message to log
 */
function logSystem(message) {
  harFormatter.addSystemLog(message);
}

/**
 * Format HTTP headers for logging
 * @param {Object} headers - HTTP headers object
 * @returns {Object} Formatted headers object
 */
function formatHeaders(headers) {
  // HAR formatter handles header formatting, 
  // but this function is needed for backwards compatibility
  return headers || {};
}

/**
 * Format content with enhanced JSON detection and pretty printing
 * @param {string} content - Content to format
 * @param {string} contentType - Content type header
 * @returns {string} Formatted content
 */
function formatContent(content, contentType = '') {
  // We'll keep this for backwards compatibility
  if (!content) return '';
  
  const contentTypeStr = contentType ? String(contentType) : '';
  const isJsonContentType = contentTypeStr.toLowerCase().includes('json');
  
  // Check if it's explicitly JSON or looks like JSON
  if (isJsonContentType || isLikelyJson(content)) {
    try {
      const jsonData = JSON.parse(content);
      return JSON.stringify(jsonData, null, 2);
    } catch (e) {
      // Not valid JSON, return as-is
      return content;
    }
  }
  
  return content;
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
 * Decompress HTTP response body
 * @param {Buffer} buffer - The compressed buffer
 * @param {string} contentEncoding - Content-Encoding header value
 * @returns {Promise<string>} Decompressed content as string
 */
async function decompressResponseBody(buffer, contentEncoding) {
  if (!buffer || buffer.length === 0) return '';
  
  // Handle case where input is already a string
  if (typeof buffer === 'string') {
    return buffer;
  }
  
  // Ensure we have a buffer
  if (!(buffer instanceof Buffer) && !(buffer instanceof Uint8Array)) {
    try {
      // Try to convert to Buffer if possible
      buffer = Buffer.from(buffer);
    } catch (e) {
      return String(buffer); // Last resort: convert to string
    }
  }
  
  let result = buffer;
  let decompressed = false;
  
  // Use util.promisify for zlib functions
  const gunzip = util.promisify(zlib.gunzip);
  const inflate = util.promisify(zlib.inflate);
  const inflateRaw = util.promisify(zlib.inflateRaw);
  const brotliDecompress = util.promisify(zlib.brotliDecompress);
  
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
          result = await gunzip(result);
          decompressed = true;
        } else if (currentEncoding === 'deflate') {
          try {
            result = await inflate(result);
          } catch (e) {
            result = await inflateRaw(result);
          }
          decompressed = true;
        } else if (currentEncoding === 'br') {
          result = await brotliDecompress(result);
          decompressed = true;
        }
      } catch (error) {
        // Log decompression errors but continue with original data
        logSystem(`Decompression error (${currentEncoding}): ${error.message}`);
      }
    }
  }
  
  // Try to automatically detect compression
  if (!decompressed && buffer.length >= 3) {
    // Check for gzip magic number (1F 8B)
    if (buffer[0] === 0x1F && buffer[1] === 0x8B) {
      try {
        result = await gunzip(buffer);
        decompressed = true;
        harFormatter.addSystemLog('Auto-detected gzip compression and decompressed successfully');
      } catch (error) {
        // Silently use the original buffer
      }
    }
    // Check for zlib header (78 01, 78 9C, or 78 DA)
    else if (buffer[0] === 0x78 && (buffer[1] === 0x01 || buffer[1] === 0x9C || buffer[1] === 0xDA)) {
      try {
        result = await inflate(buffer);
        decompressed = true;
        harFormatter.addSystemLog('Auto-detected zlib compression and decompressed successfully');
      } catch (error) {
        try {
          result = await inflateRaw(buffer);
          decompressed = true;
          harFormatter.addSystemLog('Auto-detected raw deflate compression and decompressed successfully');
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

/**
 * Create a unique request ID
 * @returns {string} Unique request ID
 */
function createRequestId() {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;
}

/**
 * Generate a unique key for a request
 * @param {string} method - HTTP method
 * @param {string} host - Host/hostname
 * @param {string} path - URL path
 * @returns {string} Unique request key
 */
function getRequestKey(method, host, path) {
  return `${method}:${host}:${path}`;
}

/**
 * Generate a unique key for a response
 * @param {string} requestId - Request ID
 * @param {number} statusCode - HTTP status code
 * @returns {string} Unique response key
 */
function getResponseKey(requestId, statusCode) {
  return `${requestId}:${statusCode}`;
}

/**
 * Track a request for correlation
 * @param {Object} req - Request object
 * @param {string} requestId - Request ID
 * @param {string} url - Full URL
 * @param {string} method - HTTP method
 */
function trackRequest(req, requestId, url, method) {
  req.__requestId = requestId;
  requestMap.set(req, requestId);
  requestUrlMap.set(requestId, url);
  requestMethodMap.set(requestId, method);
  pendingRequestIds.add(requestId);
  
  // Check for Axios tracking header
  if (req.getHeader && typeof req.getHeader === 'function') {
    const trackingId = req.getHeader('X-Request-Tracking-ID');
    if (trackingId) {
      axiosRequestIdMap.set(trackingId, requestId);
      logSystem(`Mapped Axios tracking ID ${trackingId} to request ID ${requestId}`);
    }
  } else if (req._headers) {
    const trackingId = req._headers['x-request-tracking-id'];
    if (trackingId) {
      axiosRequestIdMap.set(trackingId, requestId);
      logSystem(`Mapped Axios tracking ID ${trackingId} to request ID ${requestId}`);
    }
  }
}

/**
 * Remove request from pending list
 * @param {string} requestId - Request ID to remove
 */
function untrackRequest(requestId) {
  pendingRequestIds.delete(requestId);
}

/**
 * Log an HTTP request
 * @param {string} method - HTTP method
 * @param {string} host - Host/hostname
 * @param {string} path - URL path
 * @param {Object} headers - Request headers
 * @param {string} requestId - Request ID
 * @param {boolean} isHttps - Whether request is HTTPS
 * @param {string} [interceptorType='http'] - Type of interceptor that caught this request
 * @returns {boolean} Whether this is a duplicate request
 */
function logRequest(method, host, path, headers, requestId, isHttps, interceptorType = 'http') {
  const requestKey = getRequestKey(method, host, path);
  const isDuplicate = loggedRequests.has(requestKey);
  
  // Construct full URL
  const protocol = isHttps ? 'https' : 'http';
  const fullUrl = `${protocol}://${host}${path}`;
  
  // Create HAR request entry
  harFormatter.addRequest({
    requestId,
    method,
    url: fullUrl,
    headers,
    httpVersion: 'HTTP/1.1',
    isHttps,
    interceptorType // Add the interceptor type to the request data
  });
  
  if (!isDuplicate) {
    loggedRequests.add(requestKey);
  }
  
  return isDuplicate;
}

/**
 * Log request body
 * @param {string} body - Request body string
 * @param {string} contentType - Content-Type header
 * @param {string} requestId - Request ID to correlate with the request
 */
function logRequestBody(body, contentType, requestId) {
  if (!body || body.length === 0) return;
  
  if (!requestId) {
    logSystem('Warning: logRequestBody called without requestId, body may be incorrectly associated');
  }
  
  // Get the entry by request ID if provided
  const entryIndex = requestId ? harFormatter.requestMap.get(requestId) : -1;
  let entry = null;
  
  if (entryIndex !== undefined && entryIndex >= 0) {
    // Get entry by ID
    entry = harFormatter.harData.log.entries[entryIndex];
  } else if (!requestId) {
    // Fallback to latest entry if no ID provided (legacy behavior)
    const entries = harFormatter.harData.log.entries;
    if (entries.length > 0) {
      entry = entries[entries.length - 1];
    }
  }
  
  if (entry) {
    // Add body to the request
    entry.request.postData = {
      mimeType: contentType || 'text/plain',
      text: body
    };
    
    // Update the bodySize
    entry.request.bodySize = Buffer.byteLength(body);
    
    // Save the updated HAR file
    harFormatter.saveHar();
  } else if (requestId) {
    logSystem(`Could not find entry for request ID ${requestId} to log request body`);
  }
}

/**
 * Log HTTP response
 * @param {string} requestId - Request ID
 * @param {string} method - HTTP method
 * @param {string} url - Request URL
 * @param {number} statusCode - HTTP status code
 * @param {string} statusMessage - HTTP status message
 * @param {Object} headers - Response headers
 * @returns {boolean} Whether this is a duplicate response
 */
function logResponse(requestId, method, url, statusCode, statusMessage, headers) {
  const responseKey = getResponseKey(requestId, statusCode);
  const isDuplicate = loggedResponses.has(responseKey);
  
  if (isDuplicate) {
    return true;
  }
  
  loggedResponses.add(responseKey);
  
  // Update entry with response data
  harFormatter.addResponse({
    requestId,
    statusCode,
    statusText: statusMessage,
    headers,
    httpVersion: 'HTTP/1.1'
  });
  
  return false;
}

/**
 * Log response body
 * @param {string} body - Response body string
 * @param {string} contentType - Content-Type header
 * @param {string} requestId - Request ID to correlate with the response
 */
function logResponseBody(body, contentType, requestId) {
  if (!body || body.length === 0) return;
  
  if (!requestId) {
    logSystem('Warning: logResponseBody called without requestId, body may be incorrectly associated');
  }
  
  // Get the entry by request ID if provided
  const entryIndex = requestId ? harFormatter.requestMap.get(requestId) : -1;
  let entry = null;
  
  if (entryIndex !== undefined && entryIndex >= 0) {
    // Get entry by ID
    entry = harFormatter.harData.log.entries[entryIndex];
  } else if (!requestId) {
    // Fallback to latest entry if no ID provided (legacy behavior)
    const entries = harFormatter.harData.log.entries;
    if (entries.length > 0) {
      entry = entries[entries.length - 1];
    }
  }
  
  if (entry && entry.response) {
    // Add body to the response content
    entry.response.content = {
      size: Buffer.byteLength(body),
      mimeType: contentType || 'text/plain',
      text: body
    };
    
    // Update the bodySize
    entry.response.bodySize = Buffer.byteLength(body);
    
    // Save the updated HAR file
    harFormatter.saveHar();
  } else if (requestId) {
    logSystem(`Could not find valid entry for request ID ${requestId} to log response body`);
  }
}

/**
 * Get request method and URL from request ID
 * @param {string} requestId - Request ID
 * @returns {Object} Object with method and url properties
 */
function getRequestInfo(requestId) {
  return {
    method: requestMethodMap.get(requestId) || 'unknown method',
    url: requestUrlMap.get(requestId) || 'unknown URL'
  };
}

/**
 * Check if a request object has been mapped
 * @param {Object} req - Request object
 * @returns {boolean} Whether request is mapped
 */
function isRequestMapped(req) {
  return requestMap.has(req);
}

/**
 * Get a Node.js request ID from an Axios tracking ID
 * @param {string} axiosTrackingId - Axios tracking ID
 * @returns {string|null} Node.js request ID or null if not found
 */
function getRequestIdFromAxiosId(axiosTrackingId) {
  return axiosRequestIdMap.get(axiosTrackingId) || null;
}

// Store reference to our exit handler function
let exitHandlerRegistered = false;
let exitHandlerFunction = null;

/**
 * Register exit handler to log orphaned requests
 * @returns {Function} Cleanup function to remove the exit handler
 */
function registerExitHandler() {
  if (exitHandlerRegistered) {
    logSystem('Exit handler already registered, skipping registration');
    return () => removeExitHandler();
  }
  
  exitHandlerFunction = () => {
    if (pendingRequestIds.size > 0) {
      logSystem(`WARNING: Found ${pendingRequestIds.size} requests without matching responses`);
      for (const orphanedId of pendingRequestIds) {
        const requestUrl = requestUrlMap.get(orphanedId) || 'unknown URL';
        const requestMethod = requestMethodMap.get(orphanedId) || 'unknown method';
        logSystem(`- Orphaned request: ${requestMethod} ${requestUrl} (ID: ${orphanedId})`);
      }
    }
    
    // Final save of HAR file
    harFormatter.cleanup();
  };
  
  process.on('beforeExit', exitHandlerFunction);
  exitHandlerRegistered = true;
  
  return () => removeExitHandler();
}

/**
 * Remove the registered exit handler
 */
function removeExitHandler() {
  if (exitHandlerRegistered && exitHandlerFunction) {
    process.removeListener('beforeExit', exitHandlerFunction);
    exitHandlerRegistered = false;
    exitHandlerFunction = null;
    logSystem('Exit handler removed');
    return true;
  }
  return false;
}

// Export CommonJS module
module.exports = {
  initializeLogging,
  log,
  logSystem,
  formatHeaders,
  formatContent,
  decompressResponseBody,
  createRequestId,
  getRequestKey,
  getResponseKey,
  trackRequest,
  untrackRequest,
  logRequest,
  logRequestBody,
  logResponse,
  logResponseBody,
  getRequestInfo,
  isRequestMapped,
  getRequestIdFromAxiosId,
  registerExitHandler,
  removeExitHandler
};