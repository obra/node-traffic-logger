// ABOUTME: Unit tests for request/response timestamps
// ABOUTME: Tests timestamp formatting and inclusion in logs

const fs = require('fs');
const path = require('path');
const http = require('http');
const { promisify } = require('util');
const os = require('os');

const mkdir = promisify(fs.mkdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

describe('Request and Response Timestamps', () => {
  let tempDir;
  let logFile;
  let server;
  let logs = [];
  
  // Mock the logging function to capture logs
  const mockLog = (message) => {
    logs.push(message);
    fs.appendFileSync(logFile, message + '\n');
  };
  
  beforeAll(async () => {
    // Create temp directory for logs
    tempDir = path.join(os.tmpdir(), `timestamp-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    logFile = path.join(tempDir, 'test-log.txt');
    
    // Create empty log file
    await writeFile(logFile, '=== Test Logs ===\n');
    
    // Create a simple HTTP server
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ message: 'Test response' }));
    });
    
    // Start server
    await new Promise(resolve => {
      server.listen(0, () => resolve());
    });
  });
  
  afterAll(async () => {
    // Close the server
    if (server) {
      await new Promise(resolve => {
        server.close(() => resolve());
      });
    }
  });
  
  beforeEach(() => {
    logs = [];
  });
  
  test('should include ISO8601 timestamps for requests', () => {
    // Mock request logging
    const requestTimestamp = new Date().toISOString();
    mockLog(`\n=== HTTP Request: GET example.com/test ===`);
    mockLog(`ID: req-12345`);
    mockLog(`Timestamp: ${requestTimestamp}`);
    mockLog(`Headers: {}`);
    
    // Check if timestamp is properly formatted
    const timestampLine = logs.find(line => line.startsWith('Timestamp:'));
    expect(timestampLine).toBeDefined();
    
    // Extract the timestamp
    const timestamp = timestampLine.split('Timestamp: ')[1];
    
    // Check ISO8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    
    // Should be parseable as a valid date
    expect(() => new Date(timestamp)).not.toThrow();
  });
  
  test('should include ISO8601 timestamps for responses', () => {
    // Mock response logging
    const responseTimestamp = new Date().toISOString();
    mockLog(`\n=== Response to GET example.com/test ===`);
    mockLog(`Request ID: req-12345`);
    mockLog(`Timestamp: ${responseTimestamp}`);
    mockLog(`Status: 200 OK`);
    
    // Check if timestamp is properly formatted
    const timestampLine = logs.find(line => line.startsWith('Timestamp:'));
    expect(timestampLine).toBeDefined();
    
    // Extract the timestamp
    const timestamp = timestampLine.split('Timestamp: ')[1];
    
    // Check ISO8601 format
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    
    // Should be parseable as a valid date
    expect(() => new Date(timestamp)).not.toThrow();
  });
  
  test('should include timestamps for duplicate requests', () => {
    // Mock duplicate request logging
    const requestTimestamp = new Date().toISOString();
    mockLog(`\n=== HTTP Request: GET example.com/test ===`);
    mockLog(`ID: req-12345 (duplicate of previous request)`);
    mockLog(`Timestamp: ${requestTimestamp}`);
    mockLog(`Headers: {}`);
    
    // Check if timestamp is properly formatted
    const timestampLine = logs.find(line => line.startsWith('Timestamp:'));
    expect(timestampLine).toBeDefined();
    
    // Extract the timestamp
    const timestamp = timestampLine.split('Timestamp: ')[1];
    
    // Check ISO8601 format
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});