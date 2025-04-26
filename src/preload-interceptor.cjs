// ABOUTME: Preload script for HTTP traffic interception
// ABOUTME: Works in both CommonJS and ESM application environments

// This is a CommonJS file because --require always uses CommonJS
// But the interceptors we set up will work with both module systems
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const Module = require('module');

// Import shared request wrapper utility
const { 
  normalizeRequestParams,
  createRequestWrapper, 
  createGetWrapper 
} = require('./request-wrapper.cjs');

// Import the HAR logger
const logger = require('./har-logger.cjs');

// Import the index module for centralized logging initialization
const loggerManager = require('./index.cjs');

// Initialize directly (simpler than deferring)
try {
  // Save original request methods
  const originalHttpRequest = http.request;
  const originalHttpsRequest = https.request;
  
  // Use the centralized logging initialization
  loggerManager.initializeLogging();
  
  // Apply wrappers using the shared utility functions
  http.request = createRequestWrapper(originalHttpRequest, false, logger);
  http.get = createGetWrapper(http.request);
  https.request = createRequestWrapper(originalHttpsRequest, true, logger);
  https.get = createGetWrapper(https.request);
  
  // Register exit handler
  logger.registerExitHandler();
  
  // Add Axios detection and instrumentation
  const originalRequire = Module.prototype.require;
  
  // Override require to detect Axios
  Module.prototype.require = function(id) {
    const module = originalRequire.apply(this, arguments);
    
    // When Axios is imported, automatically instrument it
    if (id === 'axios') {
      logger.logSystem('Detected Axios import, instrumenting automatically');
      try {
        const { instrumentAxios } = require('./axios-wrapper.cjs');
        return instrumentAxios(module);
      } catch (err) {
        logger.logSystem(`Failed to instrument Axios: ${err.message}`);
      }
    }
    
    return module;
  };
  
  logger.logSystem('Axios detection enabled');
} catch (err) {
  console.error('Failed to initialize HTTP traffic logger:', err.message);
  console.error('Error stack:', err.stack);
}