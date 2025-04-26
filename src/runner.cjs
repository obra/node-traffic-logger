// ABOUTME: Runner script for node-traffic-logger
// ABOUTME: Runs a target script with HTTP/HTTPS interception

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

// Process arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Error: No target script provided');
  console.error('Usage: node runner.js <script.js|executable> [args...]');
  process.exit(1);
}

const targetPath = args[0];
const targetArgs = args.slice(1);

// Make sure the target exists
if (!fs.existsSync(targetPath)) {
  console.error(`Error: Target not found: ${targetPath}`);
  process.exit(1);
}

// Convert to absolute path if it's not already
const absoluteTargetPath = path.isAbsolute(targetPath)
  ? targetPath
  : path.resolve(process.cwd(), targetPath);

console.log(`Instrumenting HTTP traffic from ${absoluteTargetPath}`);

// Create a temp directory for our preload script
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-traffic-logger-'));
const preloadPath = path.join(tempDir, 'preload.js');

// Get path to the preload interceptor (always use the .cjs version for --require)
const projectRoot = process.env.NODE_TRAFFIC_LOGGER_ROOT || path.resolve(__dirname, '..');
const preloadInterceptorPath = path.resolve(projectRoot, 'src', 'preload-interceptor.cjs');

// Create a minimal preload script that loads our interceptor
const preloadContent = `
// This is a simple wrapper that loads our interceptor
require(${JSON.stringify(preloadInterceptorPath)});
`;

// Write the preload script
fs.writeFileSync(preloadPath, preloadContent);

try {
  // Determine if the target is a JS file or executable
  const isJsFile = targetPath.endsWith('.js') || targetPath.endsWith('.mjs') || targetPath.endsWith('.cjs');
  let result;
  
  // For JS files, use Node with --require flag to preload our interceptor
  if (isJsFile) {
    result = spawnSync('node', [
      '--require', preloadPath,
      absoluteTargetPath,
      ...targetArgs
    ], {
      stdio: 'inherit',
      env: process.env
    });
  } else {
    // Try to detect if it's a Node.js script or just a regular executable
    try {
      const fileContent = fs.readFileSync(absoluteTargetPath, 'utf8', { encoding: 'utf8' }).slice(0, 1000);
      
      // Check if it's a Node.js script (look for shebang)
      if (fileContent.startsWith('#!/usr/bin/env node') || 
          fileContent.includes('node ') || 
          fileContent.includes('node\n')) {
        // Use Node.js with the --require flag for the preload script
        result = spawnSync('node', [
          '--require', preloadPath,
          absoluteTargetPath,
          ...targetArgs
        ], {
          stdio: 'inherit',
          env: process.env
        });
      } else {
        // For regular executables, simply run the target
        // Note: this won't intercept HTTP traffic for non-Node.js executables
        // Check and properly append to NODE_OPTIONS
        let nodeOptions = process.env.NODE_OPTIONS || '';
        if (!nodeOptions.includes(`--require ${preloadPath}`)) {
          nodeOptions = `${nodeOptions} --require ${preloadPath}`.trim();
        }
        
        result = spawnSync(absoluteTargetPath, targetArgs, {
          stdio: 'inherit',
          env: {
            ...process.env,
            NODE_OPTIONS: nodeOptions
          }
        });
      }
    } catch (error) {
      // If we can't read the file, assume it's a binary executable
      // Check and properly append to NODE_OPTIONS
      let nodeOptions = process.env.NODE_OPTIONS || '';
      if (!nodeOptions.includes(`--require ${preloadPath}`)) {
        nodeOptions = `${nodeOptions} --require ${preloadPath}`.trim();
      }
      
      result = spawnSync(absoluteTargetPath, targetArgs, {
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_OPTIONS: nodeOptions
        }
      });
    }
  }

  // Force cleanup of resources - required to terminate process correctly in test environment
  try {
    // Clean up any module-level resources that could be keeping the process alive
    // This ensures the process exits cleanly even during tests
    const logger = require('./har-logger.cjs');
    const harFormatter = require('./har-formatter.cjs');
    
    // Ensure loggers are cleaned up properly
    if (logger && typeof logger.removeExitHandler === 'function') {
      logger.removeExitHandler();
    }
    
    if (harFormatter && typeof harFormatter.cleanup === 'function') {
      harFormatter.cleanup();
    }
    
    // Clear any intervals that might be keeping the process alive
    for (let i = 1; i < 1000; i++) {
      if (global.clearInterval) {
        clearInterval(i);
      }
    }
    
    // Clear all event listeners if in test mode and FORCE_EXIT is set
    if (process.env.NODE_ENV === 'test' && process.env.FORCE_EXIT === 'true') {
      // Remove all listeners from process events that might keep it alive
      process.removeAllListeners();
      
      // Remove listeners from http module if exists
      if (require('http').globalAgent) {
        require('http').globalAgent.removeAllListeners();
      }
      
      // Remove listeners from https module if exists
      if (require('https').globalAgent) {
        require('https').globalAgent.removeAllListeners();
      }
    }
  } catch (cleanupError) {
    // Ignore errors in cleanup, we need to exit anyway
    console.error('Cleanup error, proceeding with exit:', cleanupError.message);
  }
  
  // Exit with the same code
  process.exit(result?.status || 0);
} finally {
  // Clean up the temporary directory
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (err) {
    // Ignore cleanup errors
  }
}