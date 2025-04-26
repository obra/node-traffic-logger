// ABOUTME: Fetch API instrumentation module for node-traffic-logger
// ABOUTME: Captures and logs all Fetch API HTTP requests and responses using fetch-intercept

const logger = require('./har-logger.cjs');
const jsonFormatter = require('./json-formatter.cjs');

/**
 * Check if fetch-intercept is available and throw error if not
 * @returns {Object} The fetch-intercept module
 */
function getFetchIntercept() {
  try {
    return require('fetch-intercept');
  } catch (e) {
    throw new Error('fetch-intercept package is required but not installed. Please run: npm install fetch-intercept');
  }
}

/**
 * Check if native fetch is available
 * @returns {boolean} True if native fetch is available
 */
function isFetchAvailable() {
  return typeof globalThis.fetch === 'function';
}

/**
 * Setup fetch interception using fetch-intercept
 * @returns {Function} Cleanup function to unregister the interceptors
 */
function setupFetchInterception() {
  // Ensure fetch-intercept is available
  const fetchIntercept = getFetchIntercept();
  
  logger.logSystem('Setting up fetch-intercept for HTTP traffic logging');
  
  // Register the interceptors
  const unregister = fetchIntercept.register({
    request: function(url, config) {
      // Create unique request ID
      const requestId = logger.createRequestId();
      
      // Add tracking ID to config
      if (!config) config = {};
      if (!config.headers) config.headers = {};
      
      // Store our request ID in a custom header for correlation
      config.headers['X-Request-Tracking-ID'] = requestId;
      
      // Extract request information
      const method = (config.method || 'GET').toUpperCase();
      
      // Parse URL
      let host, path;
      try {
        const urlObj = new URL(url);
        host = urlObj.host;
        path = urlObj.pathname + urlObj.search;
      } catch (e) {
        host = 'unknown-host';
        path = '/';
      }
      
      // Determine if HTTPS
      const isHttps = url.startsWith('https:');
      
      // Log the request
      logger.logRequest(method, host, path, config.headers, requestId, isHttps, 'fetch');
      
      // Log request body if present
      if (config.body) {
        const contentType = config.headers['Content-Type'] || config.headers['content-type'] || '';
        
        // Convert body to string based on type
        let bodyStr;
        if (typeof config.body === 'string') {
          bodyStr = config.body;
        } else if (config.body instanceof URLSearchParams) {
          bodyStr = config.body.toString();
        } else if (config.body instanceof FormData) {
          bodyStr = '[FormData]'; // FormData isn't easily stringifiable
        } else if (config.body instanceof Blob) {
          bodyStr = '[Blob data]';
        } else if (config.body instanceof ArrayBuffer || config.body instanceof Uint8Array) {
          bodyStr = '[Binary data]';
        } else if (typeof config.body === 'object' && config.body !== null) {
          try {
            // Use the jsonFormatter to maintain consistent formatting
            bodyStr = jsonFormatter.formatJson(config.body);
          } catch (e) {
            bodyStr = `[Unstringifiable data: ${e.message}]`;
          }
        } else {
          bodyStr = String(config.body);
        }
        
        logger.logRequestBody(bodyStr, contentType, requestId);
      }
      
      return [url, config];
    },
    
    requestError: function(error) {
      logger.logSystem(`Fetch request error: ${error.message}`);
      return Promise.reject(error);
    },
    
    response: function(response) {
      // Extract request ID from headers
      let requestId = null;
      
      // Try to get the request ID from the request
      // In fetch-intercept, the original request is attached to the response as response.request
      if (response.request && response.request.headers) {
        // For a Request object, headers is a Headers instance
        const requestTrackingId = response.request.headers.get('X-Request-Tracking-ID');
        if (requestTrackingId) {
          requestId = requestTrackingId;
        }
      }
      
      if (!requestId) {
        logger.logSystem('Fetch response has no requestId - cannot correlate');
        return response;
      }
      
      // Extract response information
      const method = (response.request && response.request.method) || 'GET';
      const url = response.url;
      
      // Get response headers
      const responseHeaders = {};
      response.headers.forEach((value, name) => {
        responseHeaders[name] = value;
      });
      
      // Log the response
      logger.logResponse(
        requestId,
        method,
        url,
        response.status,
        response.statusText,
        responseHeaders
      );
      
      // Clone the response to read its body without consuming it
      const clonedResponse = response.clone();
      
      // Get content type
      const contentType = responseHeaders['content-type'] || '';
      
      // Check if this is a binary response
      const isTextResponse = !contentType.match(/^(image|audio|video|application\/octet-stream)/i);
      
      // Process response body asynchronously to avoid blocking
      if (isTextResponse) {
        clonedResponse.text().then(bodyText => {
          // Use the jsonFormatter for consistent handling of JSON content
          const formattedBody = jsonFormatter.formatContent(bodyText, contentType);
          logger.logResponseBody(formattedBody, contentType, requestId);
        }).catch(error => {
          logger.logSystem(`Error reading fetch response body: ${error.message}`);
        });
      } else {
        logger.logResponseBody(`[Binary ${contentType} content]`, contentType, requestId);
      }
      
      return response;
    },
    
    responseError: function(error) {
      logger.logSystem(`Fetch response error: ${error.message}`);
      return Promise.reject(error);
    }
  });
  
  logger.logSystem('fetch-intercept successfully registered');
  return unregister;
}

/**
 * Clean up fetch interception
 * @param {Function} unregisterFunction - The unregister function returned by setupFetchInterception
 */
function cleanupFetchInterception(unregisterFunction) {
  if (typeof unregisterFunction === 'function') {
    unregisterFunction();
    logger.logSystem('Unregistered fetch interception');
  }
}

module.exports = {
  setupFetchInterception,
  isFetchAvailable,
  cleanupFetchInterception
};