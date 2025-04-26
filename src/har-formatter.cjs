// ABOUTME: HAR format implementation for node-traffic-logger
// ABOUTME: Provides functionality to log HTTP requests/responses in HAR 1.2 format

const path = require('path');
const fs = require('fs');
const util = require('util');
const os = require('os');
const url = require('url');
const harSchema = require('har-schema');
const crypto = require('crypto');
const EventEmitter = require('events');

/**
 * HAR formatter for node-traffic-logger
 * Implements HTTP Archive (HAR) format 1.2 for HTTP traffic logging
 */
class HarFormatter extends EventEmitter {
  constructor() {
    super();
    
    // Initialize HAR data structure
    this.harData = {
      log: {
        version: '1.2',
        creator: {
          name: 'node-traffic-logger',
          version: this.getPackageVersion()
        },
        pages: [],
        entries: []
      }
    };
    
    this.logFile = null;
    this.requestMap = new Map(); // Maps requestId to entry index
    this.requestTimings = new Map(); // Store request start times
    this.pageRef = `page_${Date.now()}`;
    this.startTime = Date.now();
    this.entryMap = new Map(); // Maps requestId to entry
    
    // Add default page
    this.addPage({
      id: this.pageRef,
      title: `HTTP Traffic Log - ${new Date().toISOString()}`
    });
    
    // Auto-save HAR file periodically
    this.autoSaveInterval = null;
  }
  
  /**
   * Get package version from package.json
   * @returns {string} Package version
   */
  getPackageVersion() {
    try {
      const packageJson = require('../package.json');
      return packageJson.version || '1.0.0';
    } catch (e) {
      return '1.0.0';
    }
  }
  
  /**
   * Initialize HAR log
   * @param {string} logsDir - Directory to save HAR files
   * @param {Object} options - Optional configuration
   * @returns {string} Path to HAR file
   */
  initializeLog(logsDir, options = {}) {
    // Set up logs directory
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Create HAR file with timestamp
    this.logFile = path.join(logsDir, `http-archive-${Date.now()}.har`);
    
    // Add browser and system info
    this.harData.log.browser = {
      name: 'Node.js',
      version: process.version
    };
    
    // Setup auto-save if enabled
    if (options.autoSave !== false) {
      const interval = options.autoSaveInterval || 10000; // Default: 10 seconds
      this.autoSaveInterval = setInterval(() => this.saveHar(), interval);
    }
    
    // Save initial HAR file
    this.saveHar();
    
    return this.logFile;
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
    
    // Final save
    this.saveHar();
  }
  
  /**
   * Add a new page to the HAR data
   * @param {Object} pageData - Page information
   * @returns {string} Page ID
   */
  addPage(pageData) {
    const page = {
      startedDateTime: new Date().toISOString(),
      id: pageData.id || `page_${Date.now()}`,
      title: pageData.title || 'Untitled Page',
      pageTimings: {
        onContentLoad: -1,
        onLoad: -1
      }
    };
    
    this.harData.log.pages.push(page);
    return page.id;
  }
  
  /**
   * Mark the start of a request for timing
   * @param {string} requestId - Unique request ID
   * @param {Object} timingData - Optional initial timing data
   */
  startRequest(requestId, timingData = {}) {
    this.requestTimings.set(requestId, {
      startTime: Date.now(),
      phases: {
        blocked: -1,
        dns: -1,
        connect: -1,
        ssl: -1,
        send: timingData.send || 0,
        wait: 0,
        receive: 0
      },
      ...timingData
    });
  }
  
  /**
   * Update the timing for a request phase
   * @param {string} requestId - Request ID
   * @param {string} phase - Timing phase (dns, connect, send, wait, receive, etc)
   * @param {number} duration - Duration in milliseconds
   */
  updateTiming(requestId, phase, duration) {
    const timing = this.requestTimings.get(requestId);
    if (timing && timing.phases) {
      timing.phases[phase] = duration;
    }
  }
  
  /**
   * Convert raw headers object to HAR format headers array
   * @param {Object} headers - Raw headers object
   * @returns {Array} HAR format headers array
   */
  formatHeaders(headers) {
    if (!headers || typeof headers !== 'object') return [];
    
    // In test mode, debug the headers we're receiving
    if (process.env.NODE_ENV === 'test') {
    }
    
    // Process headers, handling different formats
    let result = [];
    
    try {
      if (Array.isArray(headers)) {
        // If headers is already an array (e.g. [{name: 'Content-Type', value: '...'}])
        result = headers.map(h => ({
          name: h.name || '',
          value: h.value === null || h.value === undefined ? '' 
            : (typeof h.value === 'string' ? h.value : String(h.value))
        }));
      } else {
        // If headers is an object (e.g. {'Content-Type': '...'})
        result = Object.entries(headers).map(([name, value]) => {
          // Handle array values
          if (Array.isArray(value)) {
            return {
              name,
              value: value.join(', ')
            };
          }
          
          return {
            name,
            value: value === null || value === undefined ? '' 
              : (typeof value === 'string' ? value : String(value))
          };
        });
      }
    } catch (error) {
      console.error("Error formatting headers:", error.message);
      // Return empty array on error to avoid breaking
      return [];
    }
    
    return result;
  }
  
  /**
   * Extract cookies from headers
   * @param {Object} headers - Headers object
   * @returns {Array} Cookies in HAR format
   */
  extractCookies(headers) {
    if (!headers) return [];
    
    const cookies = [];
    const cookieHeader = headers.cookie || headers.Cookie || '';
    
    if (typeof cookieHeader === 'string' && cookieHeader.length > 0) {
      const parts = cookieHeader.split(';');
      
      for (const part of parts) {
        const [name, value] = part.trim().split('=');
        if (name) {
          cookies.push({
            name,
            value: value || ''
          });
        }
      }
    }
    
    return cookies;
  }
  
  /**
   * Extract set-cookies headers to cookies array
   * @param {Object} headers - Response headers
   * @returns {Array} Cookies in HAR format
   */
  extractSetCookies(headers) {
    if (!headers) return [];
    
    const cookies = [];
    const setCookieHeader = headers['set-cookie'] || headers['Set-Cookie'];
    
    if (!setCookieHeader) return [];
    
    const cookieStrings = Array.isArray(setCookieHeader) 
      ? setCookieHeader 
      : [setCookieHeader];
    
    for (const cookieStr of cookieStrings) {
      const parts = cookieStr.split(';');
      const [nameValue, ...attributes] = parts;
      
      if (!nameValue) continue;
      
      const [name, value] = nameValue.trim().split('=');
      if (!name) continue;
      
      const cookie = {
        name,
        value: value || ''
      };
      
      // Process cookie attributes
      for (const attr of attributes) {
        const [attrName, attrValue] = attr.trim().split('=');
        const lowerName = (attrName || '').toLowerCase();
        
        if (lowerName === 'expires') cookie.expires = attrValue;
        if (lowerName === 'path') cookie.path = attrValue;
        if (lowerName === 'domain') cookie.domain = attrValue;
        if (lowerName === 'httponly') cookie.httpOnly = true;
        if (lowerName === 'secure') cookie.secure = true;
      }
      
      cookies.push(cookie);
    }
    
    return cookies;
  }
  
  /**
   * Parse URL to extract query parameters for HAR format
   * @param {string} urlString - URL string
   * @returns {Array} Query parameters in HAR format
   */
  extractQueryParams(urlString) {
    try {
      // Handle relative URLs
      if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
        urlString = `http://example.com${urlString.startsWith('/') ? '' : '/'}${urlString}`;
      }
      
      const parsedUrl = new URL(urlString);
      const result = [];
      
      for (const [name, value] of parsedUrl.searchParams.entries()) {
        result.push({ name, value });
      }
      
      return result;
    } catch (e) {
      return [];
    }
  }
  
  /**
   * Calculate the size of headers
   * @param {Array} harHeaders - Headers in HAR format
   * @returns {number} Size in bytes
   */
  calculateHeadersSize(harHeaders) {
    if (!harHeaders || !Array.isArray(harHeaders)) return -1;
    
    let size = 0;
    for (const header of harHeaders) {
      // name: value\r\n
      size += header.name.length + 2 + String(header.value).length + 2;
    }
    
    // Add the final \r\n
    size += 2;
    
    return size;
  }
  
  /**
   * Add a request entry to the HAR data
   * @param {Object} requestData - Request information
   * @returns {Object} The created entry
   */
  addRequest(requestData) {
    const {
      requestId,
      method,
      url: requestUrl,
      headers,
      body = null,
      httpVersion = 'HTTP/1.1',
      isHttps = false,
      interceptorType = 'http' // Default to http if not specified
    } = requestData;
    
    // Start timing for this request
    this.startRequest(requestId);
    
    // Format headers for HAR
    const harHeaders = this.formatHeaders(headers);
    
    // Create HAR entry for this request
    const entry = {
      pageref: this.pageRef,
      startedDateTime: new Date().toISOString(),
      time: 0, // Will be updated when response is received
      request: {
        method,
        url: requestUrl,
        httpVersion,
        cookies: this.extractCookies(headers),
        headers: harHeaders,
        queryString: this.extractQueryParams(requestUrl),
        headersSize: this.calculateHeadersSize(harHeaders),
        bodySize: body ? Buffer.byteLength(String(body)) : 0
      },
      response: {
        status: 0,
        statusText: '',
        httpVersion: 'HTTP/1.1',
        cookies: [],
        headers: [],
        content: {
          size: 0,
          mimeType: '',
          text: ''
        },
        redirectURL: '',
        headersSize: -1,
        bodySize: -1
      },
      cache: {},
      timings: {
        blocked: -1,
        dns: -1,
        connect: -1,
        ssl: -1,
        send: 0,
        wait: 0,
        receive: 0
      },
      serverIPAddress: '',
      _securityDetails: isHttps ? {
        protocol: 'TLS'
      } : null,
      _meta: {
        interceptorType // Store the interceptor type in a _meta field
      }
    };
    
    // If we have a request body, add post data
    if (body) {
      const contentType = headers['Content-Type'] || headers['content-type'] || '';
      const bodyText = typeof body === 'string' ? body : JSON.stringify(body);
      
      entry.request.postData = {
        mimeType: contentType,
        text: bodyText
      };
      
      // If it's URL encoded form data, parse it
      if (contentType.includes('application/x-www-form-urlencoded')) {
        try {
          const params = [];
          const searchParams = new URLSearchParams(bodyText);
          
          for (const [name, value] of searchParams.entries()) {
            params.push({ name, value });
          }
          
          if (params.length > 0) {
            entry.request.postData.params = params;
          }
        } catch (e) {
          // If we can't parse it, just keep the text version
        }
      }
    }
    
    // Store entry by request ID for later correlation with response
    this.entryMap.set(requestId, entry);
    this.requestMap.set(requestId, this.harData.log.entries.length);
    this.harData.log.entries.push(entry);
    
    return entry;
  }
  
  /**
   * Update an entry with response data
   * @param {Object} responseData - Response information
   * @returns {Object} Updated entry
   */
  addResponse(responseData) {
    const {
      requestId,
      statusCode,
      statusText,
      headers,
      body = null,
      httpVersion = 'HTTP/1.1'
    } = responseData;
    
    // Find the entry with this request ID
    const entryIndex = this.requestMap.get(requestId);
    if (entryIndex === undefined) {
      console.error(`No matching request found for response with ID ${requestId}`);
      return null;
    }
    
    const entry = this.harData.log.entries[entryIndex];
    const timing = this.requestTimings.get(requestId);
    
    // Format headers for HAR
    const harHeaders = this.formatHeaders(headers);
    const headersSize = this.calculateHeadersSize(harHeaders);
    
    // Determine content type from headers
    const contentType = headers['content-type'] || headers['Content-Type'] || '';
    const bodySize = body ? Buffer.byteLength(String(body)) : 0;
    
    // Calculate timings
    let totalTime = 0;
    if (timing) {
      totalTime = Date.now() - timing.startTime;
      
      // Distribute time across phases based on what we know
      // In a real implementation we'd collect true timing data during request/response
      entry.timings = {
        blocked: timing.phases.blocked || -1,
        dns: timing.phases.dns || -1,
        connect: timing.phases.connect || -1,
        ssl: timing.phases.ssl || -1,
        send: timing.phases.send || Math.round(totalTime * 0.1), // Default 10% for send
        wait: timing.phases.wait || Math.round(totalTime * 0.7), // Default 70% for wait
        receive: timing.phases.receive || Math.round(totalTime * 0.2) // Default 20% for receive
      };
      
      // Update the total time
      entry.time = Math.max(1, Object.values(entry.timings)
        .filter(time => time >= 0)
        .reduce((sum, time) => sum + time, 0));
    }
    
    // Set response properties
    entry.response = {
      status: statusCode,
      statusText: statusText || '',
      httpVersion,
      cookies: this.extractSetCookies(headers),
      headers: harHeaders,
      content: {
        size: bodySize,
        compression: 0, // We don't currently track compression levels
        mimeType: contentType || 'text/plain',
        text: body ? String(body) : ''
      },
      redirectURL: headers.location || headers.Location || '',
      headersSize,
      bodySize
    };
    
    // If this was a redirect, check for the Location header
    if (statusCode >= 300 && statusCode < 400) {
      const location = headers.location || headers.Location;
      if (location) {
        entry.response.redirectURL = location;
      }
    }
    
    // Clean up timing data
    this.requestTimings.delete(requestId);
    
    // Save HAR file with updates
    this.saveHar();
    
    // Emit entry completion event
    this.emit('entry-complete', entry);
    
    return entry;
  }
  
  /**
   * Add a simple system log entry (not proper HAR format, but useful)
   * @param {string} message - System message
   */
  addSystemLog(message) {
    if (!message) return;
    
    // Add a comment to the log
    if (!this.harData.log.comment) {
      this.harData.log.comment = '';
    }
    
    this.harData.log.comment += `${new Date().toISOString()} - ${message}\n`;
    
    // We don't autosave here to avoid too many file writes
  }
  
  /**
   * Save the HAR file
   */
  saveHar() {
    if (this.logFile) {
      try {
        // Ensure the directory exists
        const dir = path.dirname(this.logFile);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(this.logFile, JSON.stringify(this.harData, null, 2));
      } catch (error) {
        console.error(`Error saving HAR file: ${error.message}`);
      }
    }
  }
  
  /**
   * Get HAR data as string
   * @returns {string} HAR data JSON string
   */
  getHarString() {
    return JSON.stringify(this.harData, null, 2);
  }
  
  /**
   * Get a single entry as JSON Lines format
   * @param {string} requestId - Request ID
   * @returns {string} Entry as JSON string
   */
  getEntryAsJsonl(requestId) {
    const entryIndex = this.requestMap.get(requestId);
    if (entryIndex === undefined) {
      return '';
    }
    
    return JSON.stringify(this.harData.log.entries[entryIndex]);
  }
  
  /**
   * Validate the HAR file against the schema
   * @returns {boolean} True if valid
   */
  validateHar() {
    try {
      // Basic structure validation
      if (!this.harData || !this.harData.log) {
        return false;
      }
      
      // Check required fields based on HAR schema
      // This is a simplified version - in a production implementation 
      // we would use a full HAR validator
      const required = ['version', 'creator', 'entries'];
      for (const field of required) {
        if (!this.harData.log[field]) {
          return false;
        }
      }
      
      return true;
    } catch (e) {
      return false;
    }
  }
}

// Export singleton instance
module.exports = new HarFormatter();
