// ABOUTME: Unit tests for the server-sent event stream decoder
// ABOUTME: Verifies parsing, reconstruction, and event handling for SSE streams

const streamDecoder = require('../../src/stream-decoder.cjs');

describe('stream-decoder', () => {
  describe('isSSEStream', () => {
    test('should detect SSE stream based on content type', () => {
      const response = {
        headers: [
          { name: 'content-type', value: 'text/event-stream' }
        ],
        content: {
          text: 'some body content'
        }
      };
      
      expect(streamDecoder.isSSEStream(response)).toBe(true);
    });
    
    test('should detect SSE stream based on body content', () => {
      const response = {
        headers: [
          { name: 'content-type', value: 'application/json' }
        ],
        content: {
          text: 'event: message_start\ndata: {}\n\nevent: message_stop\ndata: {}'
        }
      };
      
      expect(streamDecoder.isSSEStream(response)).toBe(true);
    });
    
    test('should return false for non-SSE responses', () => {
      const response = {
        headers: [
          { name: 'content-type', value: 'application/json' }
        ],
        content: {
          text: '{"foo": "bar"}'
        }
      };
      
      expect(streamDecoder.isSSEStream(response)).toBe(false);
    });
    
    test('should handle null/undefined values gracefully', () => {
      expect(streamDecoder.isSSEStream(null)).toBe(false);
      expect(streamDecoder.isSSEStream(undefined)).toBe(false);
      expect(streamDecoder.isSSEStream({})).toBe(false);
      expect(streamDecoder.isSSEStream({ headers: [], content: null })).toBe(false);
    });
  });
  
  describe('parseSSEStream', () => {
    test('should parse a complete SSE stream', () => {
      const sseContent = `event: message_start
data: {"type":"message_start","message":{"id":"msg_1234","type":"message","role":"assistant","content":[],"model":"test-model-1","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":null}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null,"usage":{"output_tokens":10}}}

event: message_stop
data: {"type":"message_stop"}`;
      
      const result = streamDecoder.parseSSEStream(sseContent);
      
      // Check events were parsed correctly
      expect(result.events.length).toBe(7);
      expect(result.events[0].type).toBe('message_start');
      expect(result.events[1].type).toBe('content_block_start');
      expect(result.events[2].type).toBe('content_block_delta');
      
      // Check reconstructed message
      expect(result.reconstructedMessage.id).toBe('msg_1234');
      expect(result.reconstructedMessage.role).toBe('assistant');
      expect(result.reconstructedMessage.model).toBe('test-model-1');
      expect(result.reconstructedMessage.content[0].text).toBe('Hello world');
      expect(result.reconstructedMessage.stop_reason).toBe('end_turn');
    });
    
    test('should handle tool use blocks', () => {
      const sseContent = `event: message_start
data: {"type":"message_start","message":{"id":"msg_9876","type":"message","role":"assistant","content":[],"model":"test-model-2"}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","tool_use":{"name":"calculator","input":{},"id":"tu_01"}}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"tool_use_delta","tool_use":{"input":{"formula":"2+2"}}}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_stop
data: {"type":"message_stop"}`;
      
      const result = streamDecoder.parseSSEStream(sseContent);
      
      // Check events were parsed correctly
      expect(result.events.length).toBe(5);
      
      // Check reconstructed message - tool use
      expect(result.reconstructedMessage.content[0].type).toBe('tool_use');
      expect(result.reconstructedMessage.content[0].tool_use.input.formula).toBe('2+2');
    });
    
    test('should handle thinking blocks', () => {
      const sseContent = `event: message_start
data: {"type":"message_start","message":{"id":"msg_5555","role":"assistant"}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let me consider..."}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":" This is a complex problem."}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_stop
data: {"type":"message_stop"}`;
      
      const result = streamDecoder.parseSSEStream(sseContent);
      
      // Check reconstructed message - thinking
      expect(result.reconstructedMessage.content[0].type).toBe('thinking');
      expect(result.reconstructedMessage.content[0].thinking).toBe('Let me consider... This is a complex problem.');
    });
    
    test('should handle error events', () => {
      const sseContent = `event: error
data: {"type":"error","error":{"type":"service_unavailable","message":"The service is currently unavailable"}}`;
      
      const result = streamDecoder.parseSSEStream(sseContent);
      
      expect(result.events.length).toBe(1);
      expect(result.events[0].type).toBe('error');
      expect(result.reconstructedMessage.error.error.type).toBe('service_unavailable');
    });
    
    test('should handle ping events', () => {
      const sseContent = `event: ping
data: {"type":"ping"}`;
      
      const result = streamDecoder.parseSSEStream(sseContent);
      
      expect(result.events.length).toBe(1);
      expect(result.events[0].type).toBe('ping');
      // Ping events don't modify the message
      expect(result.reconstructedMessage.content).toEqual([]);
    });
    
    test('should handle malformed events gracefully', () => {
      const sseContent = `event: message_start
data: {"type":"message_start","message":{INVALID_JSON

event: content_block_start
data: {"type":"content_block_start"}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}`;
      
      const result = streamDecoder.parseSSEStream(sseContent);
      
      // Should still parse valid events
      expect(result.events.length).toBe(3);
      expect(result.events[0].data).toHaveProperty('parse_error');
      // Partial message reconstruction should work for valid events
      expect(result.reconstructedMessage.content[0].text).toBe('Hello');
    });
    
    test('should handle empty or invalid input', () => {
      expect(streamDecoder.parseSSEStream('')).toEqual({
        events: [],
        reconstructedMessage: { content: [] }
      });
      
      expect(streamDecoder.parseSSEStream(null)).toEqual({
        events: [],
        reconstructedMessage: { content: [] }
      });
      
      expect(streamDecoder.parseSSEStream(undefined)).toEqual({
        events: [],
        reconstructedMessage: { content: [] }
      });
      
      expect(streamDecoder.parseSSEStream(123)).toEqual({
        events: [],
        reconstructedMessage: { content: [] }
      });
    });
  });
  
  describe('getEventSummary', () => {
    test('should provide accurate event counts', () => {
      const events = [
        { type: 'message_start', data: {} },
        { type: 'content_block_start', data: {} },
        { type: 'content_block_delta', data: {} },
        { type: 'content_block_delta', data: {} },
        { type: 'content_block_delta', data: {} },
        { type: 'content_block_stop', data: {} },
        { type: 'message_delta', data: {} },
        { type: 'message_stop', data: {} },
        { type: 'ping', data: {} },
      ];
      
      const summary = streamDecoder.getEventSummary(events);
      
      expect(summary.total).toBe(9);
      expect(summary.by_type).toEqual({
        message_start: 1,
        content_block_start: 1,
        content_block_delta: 3,
        content_block_stop: 1,
        message_delta: 1,
        message_stop: 1,
        ping: 1
      });
    });
    
    test('should handle empty event array', () => {
      const summary = streamDecoder.getEventSummary([]);
      
      expect(summary.total).toBe(0);
      expect(summary.by_type).toEqual({});
    });
  });
});