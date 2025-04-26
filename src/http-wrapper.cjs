// ABOUTME: HTTP wrapper module for node-traffic-logger
// ABOUTME: Provides instrumented versions of http/https modules

const http = require('http');
const https = require('https');
const logger = require('./har-logger.cjs');
const { createRequestWrapper, createGetWrapper } = require('./request-wrapper.cjs');

// Initialize logging will be handled by main module

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
  decompressResponseBody: logger.decompressResponseBody
};

// Create the wrapped HTTP module
const request = createRequestWrapper(http.request, false, loggerInterface);
const get = createGetWrapper(request);

// Create the wrapped HTTPS module
const httpsRequest = createRequestWrapper(https.request, true, loggerInterface);
const httpsGet = createGetWrapper(httpsRequest);

// Export other properties from the original modules
const Agent = http.Agent;
const Server = http.Server;
const createServer = http.createServer;
const STATUS_CODES = http.STATUS_CODES;
const globalAgent = http.globalAgent;
const METHODS = http.METHODS;

// HTTPS specific exports
const httpsAgent = https.Agent;
const httpsServer = https.Server;
const createHttpsServer = https.createServer;
const httpsGlobalAgent = https.globalAgent;

// Register orphaned request check on exit
logger.registerExitHandler();

module.exports = {
  request,
  get,
  httpsRequest,
  httpsGet,
  Agent,
  Server,
  createServer,
  STATUS_CODES,
  globalAgent,
  METHODS,
  httpsAgent,
  httpsServer,
  createHttpsServer,
  httpsGlobalAgent
};