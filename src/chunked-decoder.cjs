// ABOUTME: Utility module for decoding chunked HTTP responses
// ABOUTME: Provides functions to reconstruct HTTP responses delivered using Transfer-Encoding: chunked

const jsonFormatter = require('./json-formatter.cjs');

/**
 * Decode a chunked HTTP response body
 * Handles the HTTP/1.1 Transfer-Encoding: chunked format
 * 
 * Chunk format:
 * [chunk size in hex][CRLF]
 * [chunk data][CRLF]
 * ...
 * 0[CRLF]
 * [optional trailers][CRLF]
 * 
 * @param {Buffer|string} responseBuffer - The raw response with chunked encoding
 * @returns {Object} Object containing the decoded body and trailer headers
 */
function decodeChunkedResponse(responseBuffer) {
  // Ensure we have a buffer to work with
  if (typeof responseBuffer === 'string') {
    responseBuffer = Buffer.from(responseBuffer);
  }

  if (!Buffer.isBuffer(responseBuffer)) {
    throw new Error('Input must be a Buffer or string');
  }

  // Convert to string for easier processing
  const responseText = responseBuffer.toString();
  
  // Results
  const result = {
    body: Buffer.alloc(0),
    trailers: {},
    chunks: []
  };

  // Position trackers
  let pos = 0;
  let endOfMessage = false;

  // Process chunks until we find the terminating chunk
  while (!endOfMessage && pos < responseText.length) {
    // Find chunk size line
    const crlfPos = responseText.indexOf('\r\n', pos);
    if (crlfPos === -1) {
      throw new Error('Invalid chunked encoding: missing chunk size delimiter');
    }

    // Parse chunk size (in hex)
    const chunkSizeLine = responseText.substring(pos, crlfPos);
    const chunkExtensionPos = chunkSizeLine.indexOf(';');
    const chunkSizeHex = chunkExtensionPos !== -1 
      ? chunkSizeLine.substring(0, chunkExtensionPos).trim() 
      : chunkSizeLine.trim();
    
    const chunkSize = parseInt(chunkSizeHex, 16);
    
    // Record chunk metadata
    const chunkMeta = {
      offset: pos,
      sizeHex: chunkSizeHex,
      size: chunkSize,
      dataOffset: crlfPos + 2
    };
    
    // Move position past chunk size line
    pos = crlfPos + 2;
    
    // Check for terminating chunk
    if (chunkSize === 0) {
      chunkMeta.data = Buffer.alloc(0);
      chunkMeta.endOffset = pos;
      result.chunks.push(chunkMeta);
      endOfMessage = true;
      
      // Parse trailers if any
      const trailersStart = pos;
      const trailersEnd = responseText.indexOf('\r\n\r\n', pos);
      
      if (trailersEnd !== -1 && trailersEnd > trailersStart) {
        const trailersText = responseText.substring(trailersStart, trailersEnd);
        const trailerLines = trailersText.split('\r\n').filter(line => line.trim().length > 0);
        
        trailerLines.forEach(line => {
          const colonPos = line.indexOf(':');
          if (colonPos > 0) {
            const name = line.substring(0, colonPos).trim();
            const value = line.substring(colonPos + 1).trim();
            result.trailers[name] = value;
          }
        });
      }
      break;
    }
    
    // Extract chunk data
    const chunkEndPos = pos + chunkSize;
    if (chunkEndPos + 2 > responseText.length) {
      throw new Error('Invalid chunked encoding: incomplete chunk data');
    }
    
    const chunkData = responseBuffer.slice(pos, chunkEndPos);
    chunkMeta.data = chunkData;
    chunkMeta.endOffset = chunkEndPos + 2; // +2 for the trailing CRLF
    result.chunks.push(chunkMeta);
    
    // Append chunk data to the result body
    result.body = Buffer.concat([result.body, chunkData]);
    
    // Move position to the next chunk
    pos = chunkEndPos + 2; // Skip the CRLF after the chunk data
  }

  return result;
}

/**
 * Detect if a response uses chunked transfer encoding
 * @param {Object} headers - Response headers object
 * @returns {boolean} True if the response uses chunked encoding
 */
function isChunkedResponse(headers) {
  if (!headers) return false;
  
  // Case-insensitive check for Transfer-Encoding header
  const transferEncoding = headers['transfer-encoding'] || 
                          headers['Transfer-Encoding'] || '';
  
  // Convert to string in case it's an array and check for 'chunked'
  return String(transferEncoding).toLowerCase().includes('chunked');
}

/**
 * Format chunked response body with JSON pretty printing if applicable
 * @param {Buffer|string} responseBuffer - The raw chunked response
 * @param {string} contentType - Content-Type header value
 * @returns {string} Formatted body content
 */
function formatChunkedResponseBody(responseBuffer, contentType) {
  try {
    const decoded = decodeChunkedResponse(responseBuffer);
    const bodyString = decoded.body.toString();
    
    // Use the JSON formatter to pretty-print the body if it's JSON
    return jsonFormatter.formatContent(bodyString, contentType);
  } catch (error) {
    // If decoding fails, return the raw buffer as string
    if (typeof responseBuffer === 'string') {
      return responseBuffer;
    }
    return responseBuffer.toString();
  }
}

module.exports = {
  decodeChunkedResponse,
  isChunkedResponse,
  formatChunkedResponseBody
};