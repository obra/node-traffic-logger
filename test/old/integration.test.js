// ABOUTME: Integration tests for node-traffic-logger
// ABOUTME: Tests actual HTTP interception and logging

import fs from 'fs';
import path from 'path';
import http from 'http';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { startServer } from './http-server.js';

// Get the current module directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import package for testing
import { instrument } from '../index.js';

async function runTests({ test, assert }) {
  // Set up test log directory
  const testLogsDir = path.join(__dirname, 'test-logs');
  if (fs.existsSync(testLogsDir)) {
    fs.rmSync(testLogsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testLogsDir, { recursive: true });
  
  // Configure logger to use test directory
  const logFile = instrument({ logsDir: testLogsDir });
  
  // Start test server - defined at the function level to ensure it's available to all tests
  const server = await startServer();
  
  test('Initialization should create log file', () => {
    assert(fs.existsSync(logFile), 'Log file should be created');
    
    const content = fs.readFileSync(logFile, 'utf8');
    assert(content.includes('HTTP Traffic Log'), 'Log file should have header');
  });
  
  test('Test server should start', () => {
    assert(server.port > 0, 'Server should be running on a port');
  });
  
  test('HTTP GET request should be logged', async () => {
    // Make a test request
    await new Promise((resolve) => {
      http.get(`http://localhost:${server.port}/json`, (res) => {
        // Consume the response
        const chunks = [];
        res.on('data', chunks.push.bind(chunks));
        res.on('end', () => {
          // Wait a moment for logging to complete
          setTimeout(resolve, 100);
        });
      });
    });
    
    // Check if the request was logged
    const content = fs.readFileSync(logFile, 'utf8');
    assert(content.includes('HTTP Request: GET localhost'), 'Request should be logged');
    assert(content.includes('=== Response to GET'), 'Response should be logged');
    assert(content.includes('"success": true'), 'JSON response should be parsed and logged');
  });
  
  test('POST request with body should be logged', async () => {
    const postData = JSON.stringify({
      test: 'data',
      array: [1, 2, 3]
    });
    
    // Make a POST request
    await new Promise((resolve) => {
      const req = http.request({
        method: 'POST',
        hostname: 'localhost',
        port: server.port,
        path: '/echo',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        // Consume the response
        const chunks = [];
        res.on('data', chunks.push.bind(chunks));
        res.on('end', () => {
          // Wait a moment for logging to complete
          setTimeout(resolve, 100);
        });
      });
      
      req.write(postData);
      req.end();
    });
    
    // Check if the request body was logged
    const content = fs.readFileSync(logFile, 'utf8');
    assert(content.includes('"test": "data"'), 'Request body should be logged');
    assert(content.includes('[1, 2, 3]'), 'Request body arrays should be formatted');
  });
  
  // Clean up
  test('Clean up resources', async () => {
    await server.close();
  });
}

export { runTests };
