// ABOUTME: CommonJS version of request-wrapper for use in preload context
// ABOUTME: Core functionality for intercepting Node.js HTTP traffic

/**
 * Normalizes HTTP request parameters from different calling patterns
 * @param {string|URL|Object} urlOrOptions - URL string, URL object, or options object
 * @param {Object|Function} [optionsOrCallback] - Options object or callback function
 * @return {Object} Normalized request parameters
 */
function normalizeRequestParams(urlOrOptions, optionsOrCallback) {
  let url, options, method, host, path, headers;
  
  // Handle different function signatures
  if (typeof urlOrOptions === 'string' || (urlOrOptions && typeof urlOrOptions.href === 'string')) {
    url = urlOrOptions;
    options = typeof optionsOrCallback === 'object' ? optionsOrCallback : {};
  } else {
    options = urlOrOptions || {};
  }
  
  // Extract request details
  if (url) {
    const urlObj = typeof url === 'string' ? new URL(url) : url;
    host = urlObj.host;
    path = urlObj.pathname + urlObj.search;
    method = (options && options.method) || 'GET';
    headers = (options && options.headers) || {};
    url = urlObj.href; // Ensure we have the full URL
  } else {
    method = options.method || 'GET';
    host = options.host || options.hostname || 'localhost';
    path = options.path || '/';
    headers = options.headers || {};
    url = options.href || null;
  }
  
  // Construct full URL if not provided
  if (!url) {
    const protocol = options._isHttps ? 'https' : 'http';
    url = `${protocol}://${host}${path}`;
  }
  
  return { url, method, host, path, headers, options };
}

/**
 * Creates a wrapped version of an HTTP/HTTPS request function
 * @param {Function} originalFn - Original request function to wrap
 * @param {boolean} isHttps - Whether this is the HTTPS module
 * @param {Object} logger - Logger instance with tracking functions
 * @return {Function} Wrapped request function
 */
function createRequestWrapper(originalFn, isHttps, logger) {
  return function wrappedRequest() {
    // Create a unique ID for this request
    const requestId = logger.createRequestId();
    
    // Normalize the request parameters
    const { url, method, host, path, headers } = normalizeRequestParams(
      arguments[0], arguments[1]
    );
    
    // Make the original request first to make sure Node.js sets up the internal structures
    const req = originalFn.apply(this, arguments);
    
    // For some requests like GET, the headers may come from internal Node.js defaults
    // that aren't in the options object, so we need to try to get them from the request
    let finalHeaders = {}; 
    
    // Make a proper deep copy of headers that preserves array structures
    for (const [key, value] of Object.entries(headers)) {
      if (Array.isArray(value)) {
        // For arrays, create a new array with the same elements
        finalHeaders[key] = [...value];
      } else {
        // For other values, copy directly
        finalHeaders[key] = value;
      }
    }
    
    // For POST/PUT requests with Content-Type, use the headers from options object
    // For GET/HEAD/DELETE without explicit headers, let's try to get them from the request
    if (method === 'POST' || method === 'PUT' || Object.keys(headers).length > 0) {
        // These methods typically have explicit headers set by the user
        // Additionally if headers were explicitly set in options, use those
        logger.logRequest(method, host, path, finalHeaders, requestId, isHttps, 'http');
    } else {
        // For GET/etc without explicit headers, try to get headers from the request
        try {
            if (req.getHeaders && typeof req.getHeaders === 'function') {
                const reqHeaders = req.getHeaders();
                if (Object.keys(reqHeaders).length > 0) {
                    // Merge with existing headers, preserving array structures
                    for (const [key, value] of Object.entries(reqHeaders)) {
                        if (Array.isArray(value)) {
                            // For arrays, create a new array with the same elements
                            finalHeaders[key] = [...value];
                        } else {
                            // For other values, copy directly
                            finalHeaders[key] = value;
                        }
                    }
                }
            } else if (req._headers && Object.keys(req._headers).length > 0) {
                // Merge with existing headers, preserving array structures
                for (const [key, value] of Object.entries(req._headers)) {
                    if (Array.isArray(value)) {
                        // For arrays, create a new array with the same elements
                        finalHeaders[key] = [...value];
                    } else {
                        // For other values, copy directly
                        finalHeaders[key] = value;
                    }
                }
            }
        } catch (e) {
            // Ignore errors, we'll use the original headers
        }
        
        // Now log with the best headers we have
        logger.logRequest(method, host, path, finalHeaders, requestId, isHttps, 'http');
    }
    
    // Track the request for correlation
    logger.trackRequest(req, requestId, url, method);
    
    // Track request body chunks
    const chunks = [];
    
    // Intercept write to capture request body
    const originalWrite = req.write;
    req.write = function(chunk, encoding, callback) {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      return originalWrite.apply(this, arguments);
    };
    
    // Intercept end to finalize request and process body
    const originalEnd = req.end;
    req.end = function(chunk, encoding, callback) {
      // Handle any final chunk in the end() call
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      
      // Process request body
      if (chunks.length > 0) {
        try {
          const bodyBuffer = Buffer.concat(chunks);
          
          // Get content type from headers, properly handling case insensitivity
          let contentType = '';
          if (headers['content-type']) {
            contentType = headers['content-type'];
          } else if (headers['Content-Type']) {
            contentType = headers['Content-Type'];
          }

          // Use the enhanced JSON formatter
          const bodyString = bodyBuffer.toString();
          const jsonFormatter = require('./json-formatter.cjs');
          const formattedBody = jsonFormatter.formatContent(bodyString, contentType);
          
          // Pass requestId for proper correlation
          logger.logRequestBody(formattedBody, contentType, requestId);
        } catch (error) {
          logger.log(`Error processing request body: ${error.message}`);
        }
      }
      
      // Intercept response
      req.on('response', async (res) => {
        // Get response info
        const statusCode = res.statusCode;
        const statusMessage = res.statusMessage || '';
        const responseHeaders = res.headers || {};
        
        // Check if this response uses chunked transfer encoding
        const chunkedDecoder = require('./chunked-decoder.cjs');
        const isChunked = chunkedDecoder.isChunkedResponse(responseHeaders);
        
        // Untrack the request since we've received a response
        logger.untrackRequest(requestId);
        
        // Get request info for logging
        const { method: requestMethod, url: requestUrl } = logger.getRequestInfo(requestId);
        
        // Log response headers
        const isDuplicate = logger.logResponse(
          requestId, 
          requestMethod, 
          requestUrl,
          statusCode, 
          statusMessage, 
          responseHeaders
        );
        
        // If this is a duplicate response, don't process it again
        if (isDuplicate) {
          return;
        }
        
        // Collect response body
        const responseChunks = [];
        
        res.on('data', (chunk) => {
          responseChunks.push(chunk);
        });
        
        res.on('end', async () => {
          if (responseChunks.length > 0) {
            try {
              // Make sure all chunks are Buffer instances before using Buffer.concat
              const bufferChunks = responseChunks.map(chunk => {
                if (Buffer.isBuffer(chunk)) {
                  return chunk;
                } else if (chunk instanceof Uint8Array) {
                  return Buffer.from(chunk);
                } else if (typeof chunk === 'string') {
                  return Buffer.from(chunk);
                } else {
                  return Buffer.from(String(chunk));
                }
              });
              
              const responseBuffer = Buffer.concat(bufferChunks);
              const contentEncoding = responseHeaders['content-encoding'] || '';
              const contentType = responseHeaders['content-type'] || '';
              
              // Decompress the response body
              const responseBody = await logger.decompressResponseBody(responseBuffer, contentEncoding);
              
              // Log the response body with requestId for proper correlation
              logger.logResponseBody(responseBody, contentType, requestId);
              
              // If this is a chunked response, also log the reconstructed body
              if (isChunked) {
                try {
                  const decodedChunked = chunkedDecoder.decodeChunkedResponse(responseBuffer);
                  
                  // Use enhanced formatter for chunked bodies
                  chunkedDecoder.formatChunkedResponseBody(responseBuffer, contentType);
                } catch (chunkError) {
                  logger.log(`Error decoding chunked response: ${chunkError.message}`);
                }
              }
            } catch (error) {
              logger.log(`Error processing response body: ${error.message}`);
            }
          }
        });
      });
      
      // Log errors
      req.on('error', (error) => {
        logger.log(`Error for request ${requestId}: ${error.message}`);
      });
      
      return originalEnd.apply(this, arguments);
    };
    
    return req;
  };
}

/**
 * Creates a wrapped version of an HTTP/HTTPS get function
 * @param {Function} requestFn - Wrapped request function
 * @return {Function} Wrapped get function
 */
function createGetWrapper(requestFn) {
  return function wrappedGet() {
    const req = requestFn.apply(this, arguments);
    req.end();
    return req;
  };
}

/**
 * Extract single-value header when it might be an array
 * @param {string|string[]} header - Header value which might be an array
 * @return {string} Normalized header value
 */
function normalizeHeaderValue(header) {
  if (!header) return '';
  
  // Preserve arrays as-is if they're meant to stay as arrays
  if (Array.isArray(header)) {
    // Check if it's an empty array
    if (header.length === 0) {
      return '';
    }
    
    // Some headers are meant to be joined with commas
    if (header.every(h => typeof h === 'string')) {
      return header.join(', ');
    }
    
    // Otherwise return first value
    return String(header[0] || '');
  }
  
  // Handle non-array values
  return String(header);
}

// Export CommonJS module
module.exports = {
  normalizeRequestParams,
  createRequestWrapper,
  createGetWrapper,
  normalizeHeaderValue
};