#!/usr/bin/env node

// ABOUTME: Tool to display HAR files on the console
// ABOUTME: Provides functionality to display and format HTTP Archive (HAR) data

const fs = require('fs');
const path = require('path');
const chalk = require('chalk'); // For colorful display
const streamDecoder = require('../src/stream-decoder.cjs');

// Check if we need to install chalk
try {
  require.resolve('chalk');
} catch (e) {
  console.log('Installing chalk package...');
  require('child_process').execSync('npm install chalk@4 --no-save');
  console.log('Done!');
}

/**
 * Display usage information
 */
function showUsage() {
  console.log(`
  ${chalk.bold('HAR File Viewer')}
  
  Usage: node-traffic-logger-view <har-file-path> [options]
  
  Options:
    --summary                Show only request summary (default: false)
    --format=json            Output format (json, table, default: table)
    --filter=<url>           Filter by URL pattern (supports glob patterns)
    --stream-display=<mode>  Stream display mode (reconstructed, raw, events, default: reconstructed)
    --help, -h               Show this help message
  
  Examples:
    node-traffic-logger-view ../http-logs/http-archive-1234567890.har
    node-traffic-logger-view ../http-logs/http-archive-1234567890.har --summary
    node-traffic-logger-view ../http-logs/http-archive-1234567890.har --filter="*api*"
    node-traffic-logger-view ../http-logs/http-archive-1234567890.har --stream-display=raw
  `);
  process.exit(0);
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = {
    filePath: null,
    summary: false,
    format: 'table',
    filter: null,
    streamDisplay: 'reconstructed' // Default to reconstructed view
  };
  
  // Skip the first two arguments (node and script path)
  const cliArgs = process.argv.slice(2);
  
  if (cliArgs.length === 0 || cliArgs.includes('--help') || cliArgs.includes('-h')) {
    showUsage();
  }
  
  for (const arg of cliArgs) {
    if (arg.startsWith('--')) {
      // Parse options
      if (arg === '--summary') {
        args.summary = true;
      } else if (arg.startsWith('--format=')) {
        args.format = arg.split('=')[1];
      } else if (arg.startsWith('--filter=')) {
        args.filter = arg.split('=')[1];
      } else if (arg.startsWith('--stream-display=')) {
        args.streamDisplay = arg.split('=')[1];
      }
    } else {
      // Assume it's the file path
      args.filePath = arg;
    }
  }
  
  return args;
}

/**
 * Load and parse HAR file
 * @param {string} filePath - Path to HAR file
 * @returns {Object} Parsed HAR data
 */
function loadHarFile(filePath) {
  try {
    // Resolve to absolute path if relative
    const resolvedPath = path.resolve(process.cwd(), filePath);
    
    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      console.error(chalk.red(`Error: File not found: ${resolvedPath}`));
      process.exit(1);
    }
    
    // Read and parse the file
    const fileContent = fs.readFileSync(resolvedPath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(chalk.red(`Error loading HAR file: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Check if a URL matches a filter pattern
 * @param {string} url - URL to check
 * @param {string} pattern - Filter pattern (glob-like)
 * @returns {boolean} True if matches
 */
function urlMatchesFilter(url, pattern) {
  if (!pattern) return true;
  
  // Simple pattern matching (convert glob pattern to regex)
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*');
  
  const regex = new RegExp(regexPattern, 'i');
  return regex.test(url);
}

/**
 * Format file size in a human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
function formatSize(bytes) {
  if (bytes === -1) return 'unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format request time in a human-readable format
 * @param {number} timeMs - Time in milliseconds
 * @returns {string} Formatted time
 */
function formatTime(timeMs) {
  if (timeMs < 10) return `${timeMs.toFixed(1)}ms`;
  if (timeMs < 1000) return `${Math.round(timeMs)}ms`;
  return `${(timeMs / 1000).toFixed(2)}s`;
}

/**
 * Display the HAR data in table format
 * @param {Object} harData - Parsed HAR data
 * @param {Object} options - Display options
 */
function displayHarTable(harData, options) {
  const { summary, filter, streamDisplay } = options;
  
  console.log(chalk.bold(`\nHAR File: ${options.filePath}`));
  console.log(chalk.gray(`Creator: ${harData.log.creator.name} v${harData.log.creator.version}`));
  console.log(chalk.gray(`Entries: ${harData.log.entries.length}\n`));
  
  const filteredEntries = harData.log.entries.filter(entry => 
    urlMatchesFilter(entry.request.url, filter)
  );
  
  console.log(chalk.gray(`Showing ${filteredEntries.length} of ${harData.log.entries.length} requests\n`));
  
  // Headers
  console.log(
    chalk.bold(padEnd('#', 4)),
    chalk.bold(padEnd('Method', 7)),
    chalk.bold(padEnd('Status', 8)),
    chalk.bold(padEnd('Type', 20)),
    chalk.bold(padEnd('Size', 10)),
    chalk.bold(padEnd('Time', 10)),
    chalk.bold('URL')
  );
  
  console.log(chalk.gray('─'.repeat(120)));
  
  // Rows
  filteredEntries.forEach((entry, index) => {
    const { request, response } = entry;
    
    // Get content type and format it
    const contentType = (response.content.mimeType || '').split(';')[0].trim() || 'unknown';
    const shortContentType = contentType.split('/').pop() || contentType;
    
    // Check if this is an SSE stream
    const isStream = streamDecoder.isSSEStream(response);
    const typeDisplay = isStream ? `${shortContentType} (stream)` : shortContentType;
    
    // Format status with color
    let statusColor = chalk.green;
    if (response.status >= 400) statusColor = chalk.red;
    else if (response.status >= 300) statusColor = chalk.yellow;
    
    // Format method with color
    let methodColor = chalk.blue;
    if (request.method === 'POST') methodColor = chalk.yellow;
    else if (['PUT', 'PATCH', 'DELETE'].includes(request.method)) methodColor = chalk.red;
    
    console.log(
      chalk.gray(padEnd(String(index + 1), 4)),
      methodColor(padEnd(request.method, 7)),
      statusColor(padEnd(String(response.status), 8)),
      chalk.cyan(padEnd(typeDisplay, 20)),
      chalk.yellow(padEnd(formatSize(response.content.size), 10)),
      chalk.magenta(padEnd(formatTime(entry.time), 10)),
      chalk.white(trimUrl(request.url, 80))
    );
    
    // If not in summary mode, show details
    if (!summary) {
      if (request.postData && request.postData.text) {
        console.log(chalk.gray('  Request Body:'));
        console.log(chalk.whiteBright('  ' + formatBody(request.postData.text, request.postData.mimeType)));
      }
      
      if (response.content && response.content.text) {
        displayResponseBody(entry, streamDisplay);
      }
      
      console.log('');
    }
  });
}

/**
 * Display response body with special handling for SSE streams
 * @param {Object} entry - HAR entry
 * @param {string} streamDisplay - Stream display mode
 */
function displayResponseBody(entry, streamDisplay) {
  const { response } = entry;
  
  if (!response.content || !response.content.text) {
    return;
  }
  
  // Check if this is an SSE stream
  if (streamDecoder.isSSEStream(response)) {
    console.log(chalk.cyan('  Response Body: (Server-Sent Event Stream)'));
    
    // Parse the stream
    const parsed = streamDecoder.parseSSEStream(response.content.text);
    
    // Display based on the selected mode
    switch (streamDisplay) {
      case 'raw':
        // Display raw response
        console.log(chalk.whiteBright('  ' + response.content.text));
        break;
        
      case 'events':
        // Display event list
        console.log(chalk.gray('  Events:'));
        parsed.events.forEach((event, index) => {
          const formattedData = typeof event.data === 'object' 
            ? formatRequestResponseText(JSON.stringify(event.data), 'application/json').replace(/^  /gm, '    ') 
            : event.data.replace(/\\n/g, '\n    ');
          console.log(chalk.whiteBright(`  [${index}] ${event.type}:`));
          console.log(chalk.whiteBright(`    ${formattedData}`));
        });
        break;
        
      case 'summary':
        // Display event summary
        const summary = streamDecoder.getEventSummary(parsed.events);
        console.log(chalk.gray(`  Total Events: ${summary.total}`));
        for (const [type, count] of Object.entries(summary.by_type)) {
          console.log(chalk.gray(`  - ${type}: ${count}`));
        }
        break;
        
      case 'reconstructed':
      default:
        // Display reconstructed message
        displayReconstructedMessage(parsed.reconstructedMessage);
        break;
    }
  } else {
    // Regular response body handling
    console.log(chalk.gray('  Response Body:'));
    console.log(chalk.whiteBright('  ' + formatBody(response.content.text, response.content.mimeType)));
  }
}

/**
 * Generic function to display object contents with proper formatting
 * @param {Object} obj - The object to display
 * @param {string} prefix - Prefix for indentation (optional)
 */
function displayReconstructedMessage(obj) {
  displayObjectContents(obj, '  ');
}

/**
 * Generic function to display object contents with proper formatting
 * @param {Object} obj - The object to display
 * @param {string} prefix - Prefix for indentation (optional)
 */
function displayObjectContents(obj, prefix = '  ') {
  if (!obj) return;
  
  // Display header
  console.log(chalk.bold(`${prefix}Reconstructed Message:`));
  
  // Display basic metadata properties
  if (obj.id) console.log(chalk.gray(`${prefix}ID: ${obj.id}`));
  if (obj.role) console.log(chalk.gray(`${prefix}Role: ${obj.role}`));
  if (obj.model) console.log(chalk.gray(`${prefix}Model: ${obj.model}`));
  
  // Handle arrays of content blocks
  if (obj.content && Array.isArray(obj.content)) {
    obj.content.forEach((block, index) => {
      console.log(chalk.yellow(`\n${prefix}[Content Block ${index}] ${block.type || 'unknown'}`));
      
      // Handle different types of content blocks
      if (block.type === 'text' && block.text) {
        // Text content
        console.log(chalk.whiteBright(`${prefix}${block.text.split('\n').join(`\n${prefix}`)}`));
      } else if (block.type === 'tool_use' && block.tool_use) {
        // Tool use content - display as formatted JSON
        const formattedJson = formatRequestResponseText(JSON.stringify(block.tool_use), 'application/json');
        console.log(chalk.whiteBright(`${prefix}${formattedJson}`));
      } else if (block.type === 'thinking' && block.thinking) {
        // Thinking content
        console.log(chalk.gray(`${prefix}${block.thinking.split('\n').join(`\n${prefix}`)}`));
      } else if (typeof block === 'object') {
        // Generic object - recurse with increased indentation
        displayObjectContents(block, prefix + '  ');
      } else {
        // Simple value
        console.log(chalk.whiteBright(`${prefix}${String(block).split('\n').join(`\n${prefix}`)}`));
      }
    });
  }
  
  // Stop reason
  if (obj.stop_reason) {
    console.log(chalk.gray(`\n${prefix}Stop reason: ${obj.stop_reason}`));
  }
  
  // Handle usage data (like token counts)
  if (obj.usage) {
    const formattedUsage = formatRequestResponseText(JSON.stringify(obj.usage), 'application/json');
    console.log(chalk.whiteBright(`${prefix}Tokens: ${formattedUsage}`));
  }
  
  // Handle error information
  if (obj.error) {
    const formattedError = formatRequestResponseText(JSON.stringify(obj.error), 'application/json');
    console.log(chalk.red(`${prefix}Error: ${formattedError}`));
  }
  
  // Handle errors list
  if (obj.errors && Array.isArray(obj.errors)) {
    console.log(chalk.red(`${prefix}Processing Errors: ${obj.errors.length}`));
    obj.errors.forEach((err, i) => {
      const errStr = typeof err === 'object' 
        ? `${err.error || 'Unknown error'} (in ${err.event_type || 'unknown'} event)`
        : String(err);
      console.log(chalk.red(`${prefix}- Error ${i+1}: ${errStr}`));
    });
  }
}

/**
 * Display the HAR data in JSON format
 * @param {Object} harData - Parsed HAR data
 * @param {Object} options - Display options
 */
function displayHarJson(harData, options) {
  const { summary, filter, streamDisplay } = options;
  
  const filteredEntries = harData.log.entries.filter(entry => 
    urlMatchesFilter(entry.request.url, filter)
  );
  
  // Process SSE streams if not in summary mode
  if (!summary) {
    filteredEntries.forEach(entry => {
      const { response } = entry;
      
      if (streamDecoder.isSSEStream(response) && response.content && response.content.text) {
        // Add parsed stream data to the entry
        const parsed = streamDecoder.parseSSEStream(response.content.text);
        
        // Attach based on display mode
        switch (streamDisplay) {
          case 'events':
            entry.stream_events = parsed.events;
            break;
          case 'reconstructed':
          default:
            entry.reconstructed_message = parsed.reconstructedMessage;
            break;
        }
      }
    });
  }
  
  if (summary) {
    // Create summaries for JSON output
    const summaries = filteredEntries.map((entry, index) => {
      const { request, response } = entry;
      const isStream = streamDecoder.isSSEStream(response);
      
      return {
        index: index + 1,
        url: request.url,
        method: request.method,
        status: response.status,
        contentType: response.content.mimeType,
        isStream: isStream,
        size: response.content.size,
        time: entry.time
      };
    });
    
    // JSON formatter for summary output
    console.log(JSON.stringify(summaries, null, 2));
  } else {
    // Full entries with JSON formatter
    console.log(JSON.stringify(filteredEntries, null, 2));
  }
}

/**
 * Format response body based on content type
 * @param {string} body - Response body
 * @param {string} mimeType - MIME type
 * @returns {string} Formatted body
 */
function formatBody(body, mimeType) {
  return formatRequestResponseText(body, mimeType);
}

/**
 * Format request/response text based on content type directly
 * @param {string} text - The text to format
 * @param {string} mimeType - MIME type of the content
 * @returns {string} Formatted text with proper newlines
 */
function formatRequestResponseText(text, mimeType) {
  if (!text) return '';
  
  let result = text;
  
  try {
    // If it looks like JSON, try to pretty-print it
    if (mimeType && (mimeType.includes('application/json') || 
        (text.trim().startsWith('{') && text.trim().endsWith('}')) || 
        (text.trim().startsWith('[') && text.trim().endsWith(']')))) {
      
      // Special handling for embedded newlines in JSON strings
      // First, replace escaped newlines with a unique marker
      const marker = "___NEWLINE_MARKER___";
      let processedText = text.replace(/\\n/g, marker);
      
      // Parse and re-stringify with indentation
      const parsed = JSON.parse(processedText);
      
      // Custom replacer function to handle newlines in strings
      result = JSON.stringify(parsed, (key, value) => {
        if (typeof value === 'string' && value.includes(marker)) {
          // Replace markers with actual newlines
          return value.replace(new RegExp(marker, 'g'), '\n');
        }
        return value;
      }, 2);
      
      // Fix any remaining escaped newlines
      result = result.replace(/\\n/g, '\n');
    }
  } catch (e) {
    // If parsing fails, just use the original text
    result = text;
    
    // Also replace escaped newlines in plain text
    result = result.replace(/\\n/g, '\n');
  }
  
  // Ensure all newlines are preserved and properly indented
  return result.split('\n').join('\n  ');
}

/**
 * Return the full URL without truncation
 * @param {string} url - URL to display
 * @param {number} maxLength - No longer used, kept for compatibility
 * @returns {string} The full URL
 */
function trimUrl(url, maxLength) {
  return url;
}

/**
 * Pad a string to a specific length
 * @param {string} str - String to pad
 * @param {number} length - Desired length
 * @returns {string} Padded string
 */
function padEnd(str, length) {
  str = String(str);
  if (str.length >= length) return str;
  return str + ' '.repeat(length - str.length);
}

/**
 * Main function
 */
function main() {
  // Parse command line arguments
  const args = parseArgs();
  
  // Load HAR file
  const harData = loadHarFile(args.filePath);
  
  // Display in the specified format
  if (args.format === 'json') {
    displayHarJson(harData, args);
  } else {
    displayHarTable(harData, args);
  }
}

// Run the program
main();