// ABOUTME: Axios instrumentation module for node-traffic-logger
// ABOUTME: Captures and logs all Axios HTTP requests and responses

const logger = require('./har-logger.cjs');

/**
 * Instrument an Axios instance for HTTP traffic logging using interceptors
 * @param {Object} axios - The Axios instance to instrument
 * @return {Object} The instrumented Axios instance
 */
function instrumentAxios(axios) {
  // Store original create method to handle new instances
  const originalCreate = axios.create;
  
  // Add request interceptor to capture and log requests
  axios.interceptors.request.use(function (config) {
    // Create unique request ID
    const requestId = logger.createRequestId();
    
    // Add request ID to the config for correlating with response
    config.requestId = requestId;
    
    // Get request details
    const method = (config.method || 'get').toUpperCase();
    let url = config.url || '';
    
    // Parse URL to get host and path
    let host, path;
    try {
      const urlObj = new URL(url, config.baseURL);
      host = urlObj.host;
      path = urlObj.pathname + urlObj.search;
      url = urlObj.toString(); // Full URL
    } catch (e) {
      // Handle relative URLs or invalid URLs
      host = 'unknown-host';
      path = url || '/';
      if (config.baseURL) {
        url = `${config.baseURL.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
      }
    }
    
    // Determine if HTTPS
    const isHttps = (url.startsWith('https:') || 
                   (config.baseURL && config.baseURL.startsWith('https:')));
    
    // Create a deep copy of headers to avoid modifying the original
    const headersCopy = config.headers ? JSON.parse(JSON.stringify(config.headers)) : {};
    
    // Log the request with the copied headers
    logger.logRequest(method, host, path, headersCopy, requestId, isHttps, 'axios');
    
    // Log request body if present
    if (config.data) {
      const contentType = config.headers && 
        (config.headers['Content-Type'] || config.headers['content-type']) || '';
      
      // Get exactly what would be sent over the wire
      // Axios uses JSON.stringify internally for objects and this is what actually goes on the wire
      let bodyStr;
      
      if (typeof config.data === 'string') {
        // String data is sent as-is
        bodyStr = config.data;
      } else if (Buffer.isBuffer(config.data) || config.data instanceof Uint8Array) {
        // Binary data is converted to string (as Axios would do)
        bodyStr = Buffer.from(config.data).toString();
      } else if (typeof config.data === 'object' && config.data !== null) {
        // For objects, we want exactly what Axios would send (JSON.stringify result)
        try {
          // This is what Axios does internally before sending
          bodyStr = JSON.stringify(config.data);
        } catch (e) {
          // This would actually cause an Axios error in a real request
          bodyStr = `[Error: Object with circular reference cannot be JSON serialized: ${e.message}]`;
        }
      } else {
        // For other types (like numbers), convert to string
        bodyStr = String(config.data);
      }
      
      // Pass requestId for proper correlation
      logger.logRequestBody(bodyStr, contentType, requestId);
    }
    
    return config;
  }, function (error) {
    logger.logSystem(`Axios request interceptor error: ${error.message}`);
    return Promise.reject(error);
  });
  
  // Add response interceptor to capture and log responses
  axios.interceptors.response.use(function (response) {
    // Get the request ID from the config
    const requestId = response.config.requestId;
    if (!requestId) {
      logger.logSystem('Axios response has no requestId - cannot correlate');
      return response;
    }
    
    // Get request details for logging
    const method = (response.config.method || 'get').toUpperCase();
    let url = response.config.url || '';
    
    // Get full URL
    if (response.config.baseURL && !url.startsWith('http')) {
      url = `${response.config.baseURL.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
    }
    
    // Create a deep copy of headers to avoid modifying the original
    const headersCopy = response.headers ? JSON.parse(JSON.stringify(response.headers)) : {};
    
    // Log the response with copied data
    logger.logResponse(
      requestId,
      method,
      url,
      response.status,
      response.statusText || '',
      headersCopy
    );
    
    // Log response body
    if (response.data) {
      const contentType = response.headers && 
        (response.headers['content-type'] || response.headers['Content-Type']) || '';
      
      // Log response exactly as received from the server
      let responseBodyStr;
      
      if (typeof response.data === 'string') {
        // String data is received as-is
        responseBodyStr = response.data;
      } else if (Buffer.isBuffer(response.data) || response.data instanceof Uint8Array) {
        // Binary data is converted to string
        responseBodyStr = Buffer.from(response.data).toString();
      } else if (typeof response.data === 'object' && response.data !== null) {
        // For objects, we want to log the raw JSON that came over the wire
        // However, Axios has already parsed this - we need to re-stringify it
        try {
          responseBodyStr = JSON.stringify(response.data);
        } catch (e) {
          // This shouldn't happen for data received from the server
          // (as it was already parsed from JSON), but handling just in case
          responseBodyStr = `[Cannot serialize response: ${e.message}]`;
        }
      } else {
        // For other types (like numbers), convert to string
        responseBodyStr = String(response.data);
      }
      
      // Pass requestId for proper correlation
      logger.logResponseBody(responseBodyStr, contentType, requestId);
    }
    
    return response;
  }, function (error) {
    // Handle error responses (4xx, 5xx)
    if (error.response && error.config) {
      const requestId = error.config.requestId;
      if (!requestId) {
        logger.logSystem('Axios error response has no requestId - cannot correlate');
        return Promise.reject(error);
      }
      
      // Get request details for logging
      const method = (error.config.method || 'get').toUpperCase();
      let url = error.config.url || '';
      
      // Get full URL
      if (error.config.baseURL && !url.startsWith('http')) {
        url = `${error.config.baseURL.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
      }
      
      // Create a deep copy of headers to avoid modifying the original
      const headersCopy = error.response.headers ? JSON.parse(JSON.stringify(error.response.headers)) : {};
      
      // Log the error response with copied data
      logger.logResponse(
        requestId,
        method,
        url,
        error.response.status,
        error.response.statusText || '',
        headersCopy
      );
      
      // Log error response body
      if (error.response.data) {
        const contentType = error.response.headers && 
          (error.response.headers['content-type'] || error.response.headers['Content-Type']) || '';
        
        // Log error response exactly as received from the server
        let responseBodyStr;
        
        if (typeof error.response.data === 'string') {
          // String data is received as-is
          responseBodyStr = error.response.data;
        } else if (Buffer.isBuffer(error.response.data) || error.response.data instanceof Uint8Array) {
          // Binary data is converted to string
          responseBodyStr = Buffer.from(error.response.data).toString();
        } else if (typeof error.response.data === 'object' && error.response.data !== null) {
          // For objects, we want to log the raw JSON that came over the wire
          // However, Axios has already parsed this - we need to re-stringify it
          try {
            responseBodyStr = JSON.stringify(error.response.data);
          } catch (e) {
            // This shouldn't happen for data received from the server
            // (as it was already parsed from JSON), but handling just in case
            responseBodyStr = `[Cannot serialize error response: ${e.message}]`;
          }
        } else if (error.response.data !== undefined && error.response.data !== null) {
          // For other types (like numbers), convert to string
          responseBodyStr = String(error.response.data);
        } else {
          responseBodyStr = '';
        }
        
        // Pass requestId for proper correlation
        logger.logResponseBody(responseBodyStr, contentType, requestId);
      }
    } else {
      // Network errors, etc. where no response exists
      logger.logSystem(`Axios error without response: ${error.message}`);
    }
    
    return Promise.reject(error);
  });
  
  // Handle instance creation to ensure new instances are also instrumented
  axios.create = function(...args) {
    const instance = originalCreate.apply(this, args);
    return instrumentAxios(instance);
  };
  
  logger.logSystem('Axios instance has been instrumented for HTTP traffic logging');
  return axios;
}

// Export the instrumentation function

module.exports = { instrumentAxios };