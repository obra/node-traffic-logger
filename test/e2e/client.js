// ABOUTME: Test client for node-traffic-logger e2e tests
// ABOUTME: Makes various HTTP requests to test HTTP traffic logging

// Since we now use the runner script with preloading,
// we can simply require the native modules directly
// The logger will intercept them if used through the runner
const http = require('http');
const https = require('https');

/**
 * Makes various HTTP requests to test HTTP traffic logging
 */
class TestClient {
  /**
   * Make all test requests to a server
   * @param {string} baseUrl - Base URL of the test server
   */
  async runAllTests(baseUrl) {
    try {
      // Make GET requests
      await this.makeGetRequest(`${baseUrl}/json`);
      await this.makeGetRequest(`${baseUrl}/methods`);
      await this.makeGetRequest(`${baseUrl}/status/200`);
      await this.makeGetRequest(`${baseUrl}/echo?param1=value1&param2=value2`);
      
      // Make POST request with JSON body
      await this.makePostRequest(
        `${baseUrl}/methods`,
        {
          name: 'Test User',
          items: [1, 2, 3],
          metadata: {
            type: 'test',
            source: 'node-traffic-logger'
          }
        }
      );
      
      // Make PUT request
      await this.makePutRequest(
        `${baseUrl}/methods`,
        {
          id: 123,
          name: 'Updated User',
          active: true
        }
      );
      
      // Make DELETE request
      await this.makeDeleteRequest(`${baseUrl}/methods`);
      
      // Skip external requests in tests - they're unreliable and can cause timeouts
      
      return true;
    } catch (error) {
      console.error('Error running tests:', error.message);
      return false;
    }
  }

  /**
   * Make a GET request
   * @param {string} url - URL to request
   */
  makeGetRequest(url) {
    return new Promise((resolve, reject) => {
      const lib = url.startsWith('https') ? https : http;
      
      const req = lib.get(url, (res) => {
        const chunks = [];
        
        res.on('data', chunk => chunks.push(chunk));
        
        res.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString();
            resolve({ statusCode: res.statusCode, headers: res.headers, body });
          } catch (error) {
            reject(error);
          }
        });
      });
      
      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Make a POST request with JSON body
   * @param {string} url - URL to request
   * @param {object} data - JSON data to send
   */
  makePostRequest(url, data) {
    return this.makeRequestWithBody('POST', url, data);
  }

  /**
   * Make a PUT request with JSON body
   * @param {string} url - URL to request
   * @param {object} data - JSON data to send
   */
  makePutRequest(url, data) {
    return this.makeRequestWithBody('PUT', url, data);
  }

  /**
   * Make a DELETE request
   * @param {string} url - URL to request
   */
  makeDeleteRequest(url) {
    return new Promise((resolve, reject) => {
      const lib = url.startsWith('https') ? https : http;
      
      const options = {
        method: 'DELETE'
      };
      
      const req = lib.request(url, options, (res) => {
        const chunks = [];
        
        res.on('data', chunk => chunks.push(chunk));
        
        res.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString();
            resolve({ statusCode: res.statusCode, headers: res.headers, body });
          } catch (error) {
            reject(error);
          }
        });
      });
      
      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Make a request with a JSON body
   * @param {string} method - HTTP method
   * @param {string} url - URL to request
   * @param {object} data - JSON data to send
   */
  makeRequestWithBody(method, url, data) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(data);
      const lib = url.startsWith('https') ? https : http;
      
      const options = {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };
      
      const req = lib.request(url, options, (res) => {
        const chunks = [];
        
        res.on('data', chunk => chunks.push(chunk));
        
        res.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString();
            resolve({ statusCode: res.statusCode, headers: res.headers, body });
          } catch (error) {
            reject(error);
          }
        });
      });
      
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }
}

// Always run the tests when this script is executed
// Getting the server URL either from arguments or environment
const getServerUrl = () => {
  let url;
  
  // First check if passed as command line argument
  if (process.argv.length > 2 && process.argv[2].startsWith('http')) {
    url = process.argv[2];
  }
  // Then check if set in environment
  else if (process.env.TEST_SERVER_URL) {
    url = process.env.TEST_SERVER_URL;
  }
  // Default to localhost:3000
  else {
    url = 'http://localhost:3000';
  }
  
  // Validate the URL
  try {
    new URL(url);
    return url;
  } catch (e) {
    console.error(`Invalid server URL: ${url}`);
    return 'http://localhost:3000';
  }
};

// Run tests when module is executed
const client = new TestClient();
const serverUrl = getServerUrl();
client.runAllTests(serverUrl).then(success => {
  if (success) {
    console.log('All tests completed successfully');
  } else {
    console.error('Tests failed');
    process.exit(1);
  }
});

module.exports = TestClient;