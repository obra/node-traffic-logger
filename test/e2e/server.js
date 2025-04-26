// ABOUTME: Test server for node-traffic-logger e2e tests
// ABOUTME: Responds to HTTP requests with various content types and status codes

import http from 'http';
import { URL } from 'url';

/**
 * Test server that can respond to various HTTP request types
 */
class TestServer {
  constructor() {
    this.server = null;
    this.port = null;
    this.requests = [];
  }

  /**
   * Start the server on a random port
   */
  async start() {
    this.server = http.createServer(this.handleRequest.bind(this));
    
    return new Promise((resolve) => {
      this.server.listen(0, () => {
        this.port = this.server.address().port;
        resolve(this.port);
      });
    });
  }

  /**
   * Stop the server
   */
  async stop() {
    if (!this.server) return;
    
    return new Promise((resolve) => {
      this.server.close(() => {
        this.server = null;
        this.port = null;
        resolve();
      });
    });
  }

  /**
   * Get the server's base URL
   */
  getBaseUrl() {
    if (!this.port) throw new Error('Server not started');
    return `http://localhost:${this.port}`;
  }

  /**
   * Get list of all requests received by the server
   */
  getRequestLog() {
    return [...this.requests];
  }

  /**
   * Clear the request log
   */
  clearRequestLog() {
    this.requests = [];
  }

  /**
   * Handle incoming HTTP requests
   */
  handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method;
    
    // Collect request body
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    
    // Process when request is complete
    req.on('end', () => {
      const requestBody = Buffer.concat(chunks).toString();
      let parsedBody = null;
      
      try {
        if (requestBody && req.headers['content-type']?.includes('application/json')) {
          parsedBody = JSON.parse(requestBody);
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
      
      // Log the request
      this.requests.push({
        method,
        url: req.url,
        pathname,
        headers: { ...req.headers },
        body: parsedBody || requestBody || null
      });
      
      // Determine response based on path
      this.routeRequest(pathname, method, parsedBody || requestBody, url.searchParams, req, res);
    });
  }

  /**
   * Route the request to the appropriate handler
   */
  routeRequest(pathname, method, body, params, req, res) {
    // Status code endpoints
    if (pathname.startsWith('/status/')) {
      const statusCode = parseInt(pathname.split('/')[2], 10) || 200;
      return this.respondWithStatus(res, statusCode);
    }
    
    // Echo endpoint
    if (pathname === '/echo') {
      return this.respondWithEcho(res, method, body, params, req.headers);
    }
    
    // JSON endpoints
    if (pathname === '/json') {
      return this.respondWithJson(res);
    }
    
    // Delayed response
    if (pathname === '/delay') {
      const delayMs = parseInt(params.get('ms'), 10) || 500;
      return this.respondWithDelay(res, delayMs);
    }
    
    // Handle different HTTP methods
    if (pathname === '/methods') {
      switch (method) {
        case 'GET':
          return this.respondWithJson(res, { method: 'GET', message: 'GET request received' });
        case 'POST':
          return this.respondWithJson(res, { method: 'POST', message: 'POST request received', body });
        case 'PUT':
          return this.respondWithJson(res, { method: 'PUT', message: 'PUT request received', body });
        case 'DELETE':
          return this.respondWithJson(res, { method: 'DELETE', message: 'DELETE request received' });
        default:
          return this.respondWithJson(res, { method, message: `${method} request received` });
      }
    }
    
    // Default response
    this.respondWithText(res, `Hello from test server! Requested: ${pathname} with method: ${method}`);
  }

  /**
   * Respond with plain text
   */
  respondWithText(res, text, statusCode = 200) {
    res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
    res.end(text);
  }

  /**
   * Respond with JSON
   */
  respondWithJson(res, data = null, statusCode = 200) {
    const jsonData = data || {
      success: true,
      data: {
        message: 'This is a JSON response',
        timestamp: new Date().toISOString()
      }
    };
    
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(jsonData));
  }

  /**
   * Respond with status code
   */
  respondWithStatus(res, statusCode) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: statusCode,
      message: http.STATUS_CODES[statusCode] || 'Unknown Status'
    }));
  }

  /**
   * Echo the request back to the client
   */
  respondWithEcho(res, method, body, params, headers) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      method,
      params: Object.fromEntries(params),
      headers,
      body
    }));
  }

  /**
   * Respond after a delay
   */
  respondWithDelay(res, delayMs) {
    setTimeout(() => {
      this.respondWithJson(res, {
        message: `Response delayed by ${delayMs}ms`,
        timestamp: new Date().toISOString()
      });
    }, delayMs);
  }
}

export default TestServer;