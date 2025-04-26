// ABOUTME: End-to-end tests for node-traffic-logger
// ABOUTME: Tests the complete flow by running the tool as a subprocess

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

// Convert execFile to promise-based
const execFileAsync = promisify(execFile);

// Get the current module directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define paths
const clientScriptPath = path.join(__dirname, 'e2e-client.js');
const logsDir = path.join(__dirname, 'e2e-logs');
const binPath = path.join(__dirname, '..', 'bin', 'node-traffic-logger.js');

async function runTests({ test, assert }) {
  // Set up a clean logs directory
  if (fs.existsSync(logsDir)) {
    fs.rmSync(logsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(logsDir, { recursive: true });
  
  // Single test that includes both running the CLI and checking the logs
  test('Traffic logger should capture HTTP traffic', async () => {
    // Run the traffic logger as a subprocess with our client script
    process.env.NODE_TRAFFIC_LOGGER_DIR = logsDir; // Use env var to specify logs directory
    
    console.log(`Running: node ${binPath} ${clientScriptPath}`);
    const result = await execFileAsync('node', [binPath, clientScriptPath], {
      timeout: 15000, // 15 second timeout
      env: process.env
    });
    
    // Check that the process completed successfully
    assert(result.stdout.includes('All test requests completed successfully'), 
      'Client script should run to completion');
    
    console.log('Process output:', result.stdout);
    
    // Find the log file path from the output
    const match = result.stdout.match(/Logs will be written to: (.+)/);
    assert(match && match[1], 'Should find log file path in output');
    
    const logFilePath = match[1];
    assert(fs.existsSync(logFilePath), 'Log file should exist');
    
    // List all files in the log directory
    const files = fs.readdirSync(logsDir);
    console.log('Files in log directory:', files);
    
    // Now check the log file content
    const logContent = fs.readFileSync(logFilePath, 'utf8');
    console.log('Log file content (first 500 chars):', logContent.substring(0, 500) + '...');
    
    // Check for HTTP request logs
    assert(logContent.includes('=== HTTP Request:'), 'Log should contain HTTP requests');
    assert(logContent.includes('=== Response to'), 'Log should contain HTTP responses');
    
    // Check for specific endpoints we called in the client
    assert(logContent.includes('/simple'), 'Log should contain the /simple request');
    assert(logContent.includes('/query?id=123'), 'Log should contain the query parameters');
    assert(logContent.includes('/echo'), 'Log should contain the /echo request');
    
    // Check for POST request with JSON body
    assert(logContent.includes('POST'), 'Log should contain POST requests');
    assert(logContent.includes('"Content-Type": "application/json"'), 'Log should contain content-type headers');
    
    // Check for request and response bodies
    assert(logContent.includes('"name": "Test User"'), 'Log should contain request body content');
    assert(logContent.includes('"items": [1, 2, 3]'), 'Log should contain formatted JSON arrays');
    
    // Check for HTTPS request
    assert(logContent.includes('=== HTTPS Request:') || logContent.includes('httpbin.org'), 
      'Log should contain HTTPS request to httpbin.org');
  });
}

export { runTests };