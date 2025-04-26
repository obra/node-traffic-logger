// ABOUTME: End-to-end tests for node-traffic-logger
// ABOUTME: Tests the complete flow by running the CLI with a client script

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const TestServer = require('./server.cjs');

const execFileAsync = promisify(execFile);
const rootDir = path.join(__dirname, '..', '..');
const binPath = path.join(rootDir, 'bin', 'node-traffic-logger.js');
const clientPath = path.join(__dirname, 'client.js');

describe('node-traffic-logger end-to-end', () => {
  let server;
  let tempDir;
  let serverBaseUrl;
  
  // Set up test server and temp directory
  beforeAll(async () => {
    // Create temp directory for logs
    tempDir = path.join(os.tmpdir(), `node-traffic-logger-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    // Start the test server
    server = new TestServer();
    const port = await server.start();
    serverBaseUrl = `http://localhost:${port}`;
  }, 10000);
  
  // Clean up resources
  afterAll(async () => {
    // Stop the server
    if (server) {
      await server.stop();
    }
    
    // Optionally clean up temp directory
    try {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    } catch (err) {
      // Ignore cleanup errors
    }
  });
  
  test('should log all HTTP traffic through the client', async () => {
    // Run the traffic logger with the client
    const env = {
      ...process.env,
      NODE_TRAFFIC_LOGGER_DIR: tempDir,
      NODE_TRAFFIC_LOGGER_ROOT: path.resolve(__dirname, '../..'), // Add project root path
      NODE_OPTIONS: '--no-warnings --unhandled-rejections=strict', // Remove warnings and handle rejections
      TEST_SERVER_URL: serverBaseUrl,
      NODE_ENV: 'test', // Ensure we're in test mode
      FORCE_EXIT: 'true' // Signal to runner.cjs to force exit
    };
    
    // Ensure temp dir exists
    await fs.mkdir(tempDir, { recursive: true });
    
    // Run the client script directly with the -r flag to preload our interceptor
    const preloadInterceptorPath = path.resolve(__dirname, '../../src/preload-interceptor.cjs');
    
    try {
      // Use child_process.spawn directly with pipes for better control over the process
      const { spawn } = require('child_process');
      
      // Create a promise that resolves when the client script completes
      const clientPromise = new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        let timeoutId;
        
        // Use -r flag to require the preload interceptor directly
        const childProcess = spawn('node', [
          '--require', preloadInterceptorPath,
          clientPath
        ], { 
          env,
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        // Collect stdout and stderr
        childProcess.stdout.on('data', (data) => {
          const chunk = data.toString();
          stdout += chunk;
          // If we see the success message, we can resolve early
          if (chunk.includes('All tests completed successfully')) {
            if (timeoutId) clearTimeout(timeoutId);
            childProcess.kill('SIGKILL');
            resolve({ stdout, stderr });
          }
        });
        
        childProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        // Handle process exit
        childProcess.on('close', (code) => {
          if (timeoutId) clearTimeout(timeoutId);
          if (code === 0 || stdout.includes('All tests completed successfully')) {
            resolve({ stdout, stderr });
          } else {
            reject(new Error(`Client process exited with code ${code}\nStdout: ${stdout}\nStderr: ${stderr}`));
          }
        });
        
        childProcess.on('error', (err) => {
          if (timeoutId) clearTimeout(timeoutId);
          reject(new Error(`Failed to start client process: ${err.message}`));
        });
        
        // Set a timeout to kill the process if it runs too long
        timeoutId = setTimeout(() => {
          childProcess.kill('SIGKILL'); // Use SIGKILL instead of SIGTERM
          resolve({ stdout, stderr }); // Just resolve with what we have so far
        }, 5000); // Shorter timeout to avoid test hanging
      });
      
      // Wait for client process to complete
      const result = await clientPromise;
      
      expect(result.stdout).toContain('All tests completed successfully');
      
      // Wait a moment for file system operations to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Find the log file - now looking for HAR files
      const files = await fs.readdir(tempDir);
      const logFile = files.find(file => file.startsWith('http-archive-') && file.endsWith('.har'));
      expect(logFile).toBeDefined();
      
      const logPath = path.join(tempDir, logFile);
      const logContent = await fs.readFile(logPath, 'utf8');
      
      // Check that the file is valid JSON
      expect(() => JSON.parse(logContent)).not.toThrow();
      
      const harData = JSON.parse(logContent);
      
      // Check HAR structure
      expect(harData).toHaveProperty('log');
      expect(harData.log).toHaveProperty('entries');
      expect(Array.isArray(harData.log.entries)).toBe(true);
      expect(harData.log.entries.length).toBeGreaterThan(0);
      
      // Check for various HTTP methods
      const methods = harData.log.entries.map(entry => entry.request.method);
      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
      
      // Check for specific URLs in the entries
      const urls = harData.log.entries.map(entry => entry.request.url);
      expect(urls.some(url => url.includes('/json'))).toBe(true);
      expect(urls.some(url => url.includes('/methods'))).toBe(true);
      
      // Check for request and response bodies
      const postEntry = harData.log.entries.find(entry => 
        entry.request.method === 'POST' && entry.request.postData
      );
      
      if (postEntry) {
        expect(postEntry.request.postData.text).toContain('Test User');
      }
      
      // Check status codes
      const statusCodes = harData.log.entries.map(entry => entry.response.status);
      expect(statusCodes).toContain(200);
    } catch (error) {
      console.error('Test execution error:', error);
      throw error;
    }
  }, 15000);
  
  test('should work through the CLI', async () => {
    // Run the traffic logger CLI with the client
    const env = {
      ...process.env,
      NODE_TRAFFIC_LOGGER_DIR: tempDir,
      NODE_TRAFFIC_LOGGER_ROOT: path.resolve(__dirname, '../..'), // Add project root path
      NODE_OPTIONS: '--no-warnings --unhandled-rejections=strict', // Remove warnings and handle rejections
      TEST_SERVER_URL: serverBaseUrl,
      NODE_ENV: 'test', // Ensure we're in test mode
      FORCE_EXIT: 'true' // Signal to CLI to force exit
    };
    
    // Ensure temp dir exists
    await fs.mkdir(tempDir, { recursive: true });
    
    try {
      // Use child_process.spawn directly with pipes for better control over the process
      const { spawn } = require('child_process');
      
      // Create a promise that resolves when the CLI process completes
      const cliPromise = new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        let timeoutId;
        
        const childProcess = spawn('node', [binPath, clientPath], {
          env,
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        // Collect stdout and stderr
        childProcess.stdout.on('data', (data) => {
          const chunk = data.toString();
          stdout += chunk;
          // If we see the success message, we can resolve early
          if (chunk.includes('All tests completed successfully')) {
            if (timeoutId) clearTimeout(timeoutId);
            childProcess.kill('SIGKILL');
            resolve({ stdout, stderr });
          }
        });
        
        childProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        // Handle process exit
        childProcess.on('close', (code) => {
          if (timeoutId) clearTimeout(timeoutId);
          if (code === 0 || stdout.includes('All tests completed successfully')) {
            resolve({ stdout, stderr });
          } else {
            reject(new Error(`CLI process exited with code ${code}\nStdout: ${stdout}\nStderr: ${stderr}`));
          }
        });
        
        childProcess.on('error', (err) => {
          if (timeoutId) clearTimeout(timeoutId);
          reject(new Error(`Failed to start CLI process: ${err.message}`));
        });
        
        // Set a timeout to kill the process if it runs too long
        timeoutId = setTimeout(() => {
          childProcess.kill('SIGKILL'); // Use SIGKILL instead of SIGTERM
          resolve({ stdout, stderr }); // Just resolve with what we have so far instead of rejecting
        }, 5000); // Shorter timeout to avoid test hanging
      });
      
      // Wait for CLI process to complete
      const result = await cliPromise;
      
      expect(result.stdout).toContain('All tests completed successfully');
      
      // Wait a moment for file system operations to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Find the HAR log file (most recent one)
      const files = await fs.readdir(tempDir);
      const logFiles = files.filter(file => file.startsWith('http-archive-') && file.endsWith('.har'));
      const mostRecentLogFile = logFiles.sort().pop(); // Sort alphabetically to get most recent by timestamp
      
      expect(mostRecentLogFile).toBeDefined();
      
      const logPath = path.join(tempDir, mostRecentLogFile);
      const logContent = await fs.readFile(logPath, 'utf8');
      
      // Verify log content has HTTP traffic in HAR format
      try {
        const harData = JSON.parse(logContent);
        expect(harData).toHaveProperty('log');
        expect(harData.log).toHaveProperty('entries');
        expect(harData.log.entries.length).toBeGreaterThan(0);
      } catch (e) {
        console.error('Invalid HAR JSON:', e);
        throw e;
      }
    } catch (error) {
      console.error('CLI test error:', error);
      throw error;
    }
  }, 15000);
});
