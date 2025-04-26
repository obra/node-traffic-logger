// ABOUTME: Decoder for a  server-sent event stream protocol
// ABOUTME: Parses and reconstructs messages from SSE streams

/**
 * Detect if a response is an SSE stream
 * @param {Object} response - HAR response object
 * @returns {boolean} True if it's an SSE stream
 */
function isSSEStream(response) {
  if (!response) return false;

  // Check content type header
  const contentTypeHeader = response.headers && response.headers.find(h => 
    h.name.toLowerCase() === 'content-type'
  );
  const contentType = contentTypeHeader ? contentTypeHeader.value : '';
  
  // Check for SSE content type
  if (contentType && contentType.includes('text/event-stream')) return true;
  
  // Check response body for SSE format
  const body = response.content && response.content.text ? response.content.text : '';
  return body.includes('event: message_start') && 
         body.includes('data: {') &&
         body.includes('event: message_stop');
}

/**
 * Parse SSE stream content
 * @param {string} content - Raw SSE stream content
 * @returns {Object} Parsed stream with events and reconstructed message
 */
function parseSSEStream(content) {
  if (!content || typeof content !== 'string') {
    return {
      events: [],
      reconstructedMessage: { content: [] }
    };
  }

  // Split by double newlines (event boundaries)
  const eventChunks = content.split(/\n\n/);
  const events = [];
  const reconstructedMessage = {
    content: [],
    metadata: {}
  };
  
  for (const chunk of eventChunks) {
    // Skip empty chunks
    if (!chunk.trim()) continue;
    
    // Extract event type and data
    const eventMatch = chunk.match(/^event: (.+)$/m);
    const dataMatch = chunk.match(/^data: (.+)$/m);
    
    if (!eventMatch || !dataMatch) continue;
    
    const eventType = eventMatch[1];
    let eventData;
    
    try {
      eventData = JSON.parse(dataMatch[1]);
    } catch (e) {
      eventData = { raw: dataMatch[1], parse_error: e.message };
    }
    
    // Add to events array
    events.push({
      type: eventType,
      data: eventData
    });
    
    // Process based on event type
    processEvent(eventType, eventData, reconstructedMessage);
  }
  
  return {
    events,
    reconstructedMessage
  };
}

/**
 * Process a single event and update the reconstructed message
 * @param {string} eventType - Type of event
 * @param {Object} eventData - Event data
 * @param {Object} message - Reconstructed message to update
 */
function processEvent(eventType, eventData, message) {
  try {
    switch (eventType) {
      case 'message_start':
        // Initialize message
        if (eventData.message) {
          message.id = eventData.message.id;
          message.role = eventData.message.role;
          message.model = eventData.message.model;
          message.usage = eventData.message.usage;
          message.stop_reason = eventData.message.stop_reason;
          message.stop_sequence = eventData.message.stop_sequence;
        }
        break;
        
      case 'content_block_start':
        // Initialize a content block
        const index = eventData.index;
        const blockType = eventData.content_block?.type || 'unknown';
        
        // Add empty content block
        message.content[index] = {
          type: blockType,
          text: blockType === 'text' ? '' : null,
          tool_use: blockType === 'tool_use' ? {} : null,
          thinking: blockType === 'thinking' ? '' : null
        };
        break;
        
      case 'content_block_delta':
        // Update content block with delta
        const blockIndex = eventData.index;
        const delta = eventData.delta;
        
        if (!message.content[blockIndex]) {
          message.content[blockIndex] = { 
            type: 'unknown',
            text: ''
          };
        }
        
        const block = message.content[blockIndex];
        
        // Handle different delta types
        if (delta.type === 'text_delta') {
          block.text = (block.text || '') + (delta.text || '');
        } else if (delta.type === 'tool_use_delta') {
          block.tool_use = { 
            ...block.tool_use || {},
            ...delta.tool_use || {}
          };
        } else if (delta.type === 'thinking_delta') {
          block.thinking = (block.thinking || '') + (delta.thinking || '');
        }
        break;
        
      case 'message_delta':
        // Update message metadata
        if (eventData.delta) {
          message.stop_reason = eventData.delta.stop_reason || message.stop_reason;
          message.stop_sequence = eventData.delta.stop_sequence || message.stop_sequence;
          message.usage = {
            ...(message.usage || {}),
            ...(eventData.delta.usage || {})
          };
        }
        break;
      
      case 'error':
        // Handle error events
        message.error = eventData;
        break;
        
      case 'ping':
        // Ping events don't modify the message
        break;
    }
  } catch (error) {
    // Handle errors during event processing
    if (!message.errors) message.errors = [];
    message.errors.push({
      event_type: eventType,
      error: error.message,
      data: eventData
    });
  }
}

/**
 * Format a reconstructed message for console display
 * @param {Object} message - Reconstructed message
 * @returns {string} Formatted message for display
 */
function formatReconstructedMessage(message) {
  // This function is implemented in dump-har.cjs since it requires chalk
  // We keep this as a placeholder in case we want to add basic formatting later
  return JSON.stringify(message, null, 2);
}

/**
 * Get a summary of the events in a stream
 * @param {Array} events - Array of parsed events
 * @returns {Object} Summary counts of event types
 */
function getEventSummary(events) {
  const summary = {
    total: events.length,
    by_type: {}
  };
  
  for (const event of events) {
    summary.by_type[event.type] = (summary.by_type[event.type] || 0) + 1;
  }
  
  return summary;
}

module.exports = {
  isSSEStream,
  parseSSEStream,
  processEvent,
  formatReconstructedMessage,
  getEventSummary
};
