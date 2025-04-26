// ABOUTME: Main entry point for node-traffic-logger package
// ABOUTME: Exports functions to instrument HTTP traffic logging

// This module is in CommonJS format for better compatibility

const fs = require('fs');
const path = require('path');
const logger = require('./har-logger.cjs');
const { createRequestWrapper, createGetWrapper } = require('./request-wrapper.cjs');
const { instrumentAxios } = require('./axios-wrapper.cjs');
const { setupFetchInterception, isFetchAvailable, cleanupFetchInterception } = require('./fetch-wrapper.cjs');

// Logging initialization is now centralized in initializeLogging() function

// Create the logger object to pass to request wrapper
const loggerInterface = {
  log: logger.log,
  logSystem: logger.logSystem,
  createRequestId: logger.createRequestId,
  trackRequest: logger.trackRequest,
  untrackRequest: logger.untrackRequest,
  logRequest: logger.logRequest,
  logRequestBody: logger.logRequestBody,
  logResponse: logger.logResponse,
  logResponseBody: logger.logResponseBody,
  getRequestInfo: logger.getRequestInfo,
  decompressResponseBody: logger.decompressResponseBody,
  isRequestMapped: logger.isRequestMapped
};

// Set up CommonJS module interception
function setupCommonJSInterception() {
  try {
    const Module = require('module');
    const originalLoad = Module._load;
    
    let httpPatched = false;
    let httpsPatched = false;
    
    Module._load = function(request, parent, isMain) {
      const originalModule = originalLoad.apply(this, arguments);
      
      if ((request === 'http' || request === 'http/') && !httpPatched) {
        httpPatched = true;
        
        const instrumentedRequest = createRequestWrapper(originalModule.request, false, loggerInterface);
        const instrumentedGet = createGetWrapper(instrumentedRequest);
        
        originalModule.request = instrumentedRequest;
        originalModule.get = instrumentedGet;
        
        logger.logSystem('HTTP module instrumented (CommonJS)');
      }
      
      if ((request === 'https' || request === 'https/') && !httpsPatched) {
        httpsPatched = true;
        
        const instrumentedRequest = createRequestWrapper(originalModule.request, true, loggerInterface);
        const instrumentedGet = createGetWrapper(instrumentedRequest);
        
        originalModule.request = instrumentedRequest;
        originalModule.get = instrumentedGet;
        
        logger.logSystem('HTTPS module instrumented (CommonJS)');
      }
      
      return originalModule;
    };
    
    logger.logSystem('Module interception installed');
  } catch (error) {
    logger.logSystem(`Module interception error: ${error.message}`);
  }
}

// Set up Fetch API interception
function setupFetchAPI() {
  try {
    // Check if native fetch is available
    if (isFetchAvailable()) {
      try {
        // Set up fetch-intercept
        const unregister = setupFetchInterception();
        
        // Store the unregister function for cleanup
        global.__fetchInterceptUnregister = unregister;
        
        logger.logSystem('Fetch API instrumented for HTTP traffic logging using fetch-intercept');
      } catch (e) {
        logger.logSystem(`Error setting up fetch-intercept: ${e.message}`);
        logger.logSystem('Make sure fetch-intercept is installed with: npm install fetch-intercept');
      }
    } else {
      logger.logSystem('Native fetch API not detected, skipping fetch instrumentation');
    }
  } catch (error) {
    logger.logSystem(`Error setting up fetch interception: ${error.message}`);
  }
}

// Create global trackers for modules
function setupGlobalTrackers() {
  try {
    // Import the modules to get their original functions
    const httpModule = require('http');
    const httpsModule = require('https');
    
    // Store original functions before instrumentation
    const originalHttpRequest = httpModule.request;
    const originalHttpGet = httpModule.get;
    const originalHttpsRequest = httpsModule.request;
    const originalHttpsGet = httpsModule.get;
    
    // Create instrumented versions
    const httpRequest = createRequestWrapper(httpModule.request, false, loggerInterface);
    const httpsRequest = createRequestWrapper(httpsModule.request, true, loggerInterface);
    
    const httpGet = createGetWrapper(httpRequest);
    const httpsGet = createGetWrapper(httpsRequest);
    
    // Store references globally
    global.__httpTracker = {
      httpRequest,
      httpGet,
      httpsRequest,
      httpsGet,
      // Add a flag to indicate if a module is already using the instrumented version
      isUsingInstrumented: new Map(),
      // Store original functions for cleanup
      original: {
        httpRequest: originalHttpRequest,
        httpGet: originalHttpGet,
        httpsRequest: originalHttpsRequest,
        httpsGet: originalHttpsGet
      }
    };
    
    // Create a registry of HTTP clients that used our intercepted version
    global.__interceptedHttpClients = new Set();
    
    // Now use a less aggressive approach - modify the global requires
    try {
      // First, we can set global http and https variables that some libraries use
      global.http = httpModule;
      global.https = httpsModule;
      
      // Override the key methods
      global.http.request = httpRequest;
      global.http.get = httpGet;
      global.https.request = httpsRequest;
      global.https.get = httpsGet;
      
      logger.logSystem('Applied global interception mechanisms');
    } catch (error) {
      logger.logSystem(`Error setting up global interception: ${error.message}`);
    }
    
    logger.logSystem('HTTP/HTTPS trackers registered globally');
  } catch (error) {
    logger.logSystem(`Global trackers error: ${error.message}`);
  }
}

// Cleanup function to restore original HTTP/HTTPS methods
function cleanupGlobalTrackers() {
  try {
    if (global.__httpTracker) {
      // Get reference to modules
      const httpModule = require('http');
      const httpsModule = require('https');
      
      // Restore original methods
      if (global.__httpTracker.original) {
        const { original } = global.__httpTracker;
        
        // Restore global.http and global.https if they exist
        if (global.http) {
          global.http.request = original.httpRequest;
          global.http.get = original.httpGet;
        }
        
        if (global.https) {
          global.https.request = original.httpsRequest;
          global.https.get = original.httpsGet;
        }
        
        // Restore module functions
        httpModule.request = original.httpRequest;
        httpModule.get = original.httpGet;
        httpsModule.request = original.httpsRequest;
        httpsModule.get = original.httpsGet;
      }
      
      // Clean up global objects
      delete global.__httpTracker;
      delete global.__interceptedHttpClients;
      
      logger.logSystem('Cleaned up global HTTP/HTTPS trackers');
    }
    
    // Clean up fetch interception
    if (global.__fetchInterceptUnregister) {
      cleanupFetchInterception(global.__fetchInterceptUnregister);
      delete global.__fetchInterceptUnregister;
    }
  } catch (error) {
    logger.logSystem(`Error cleaning up global trackers: ${error.message}`);
  }
}

// Register orphaned request check on exit
function registerExitHandler() {
  logger.registerExitHandler();
}

// Track whether logging has been initialized
let loggingInitialized = false;
let logFilePath = null;
let exitHandlerRegistered = false;

// Initialize logging (now with singleton pattern)
function initializeLogging(customLogsDir = null) {
  // Only initialize once
  if (!loggingInitialized) {
    logFilePath = logger.initializeLogging(customLogsDir);
    loggingInitialized = true;
    logger.logSystem('Logging initialized (singleton pattern)');
    
    // Make sure we clean up properly
    if (!exitHandlerRegistered) {
      process.on('exit', () => {
        cleanupLogging();
      });
      exitHandlerRegistered = true;
    }
  } else {
    logger.logSystem('Logging already initialized, skipping duplicate initialization');
  }
  return logFilePath;
}

// Clean up logging resources
function cleanupLogging() {
  if (loggingInitialized) {
    try {
      // Remove the exit handler to avoid duplicate cleanups
      if (logger.removeExitHandler) {
        logger.removeExitHandler();
      }
      
      loggingInitialized = false;
      logger.logSystem('Cleaned up logging (singleton pattern)');
    } catch (err) {
      console.error('Error cleaning up logging:', err.message);
    }
  }
}

// Main instrumentation function
function instrument(options = {}) {
  const customLogsDir = options.logsDir || null;
  
  // Initialize logging (using the singleton pattern)
  const logFilePath = initializeLogging(customLogsDir);
  
  // Apply all interception techniques
  setupCommonJSInterception();
  setupGlobalTrackers();
  setupFetchAPI(); // Add fetch interception
  
  // Register exit handler
  registerExitHandler();
  
  return logFilePath;
}

// Run a target module with instrumentation
function runInstrumented(targetFilePath, args = []) {
  if (!targetFilePath) {
    throw new Error('Target file path is required');
  }
  
  // Initialize logging (using the singleton pattern)
  initializeLogging();
  
  // Register exit handler
  registerExitHandler();
  
  // Convert to absolute path if it's not already
  const absoluteTargetPath = path.isAbsolute(targetFilePath)
    ? targetFilePath
    : path.resolve(process.cwd(), targetFilePath);
    
  // Modify process.argv for the target script
  const originalArgv = process.argv;
  process.argv = [process.argv[0], absoluteTargetPath, ...args];
  
  try {
    // Import the module using require since we're in CommonJS
    require(absoluteTargetPath);
  } catch (error) {
    console.error(`Error loading ${absoluteTargetPath}:`, error);
    process.exit(1);
  } finally {
    // Restore original argv
    process.argv = originalArgv;
  }
}

// Export CommonJS module
module.exports = {
  instrument,
  runInstrumented,
  initializeLogging,
  cleanupGlobalTrackers,
  cleanupLogging
};