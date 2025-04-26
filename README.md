# Node Traffic Logger

Node Traffic Logger is a lightweight tool that logs all HTTP/HTTPS traffic from Node.js applications in HAR (HTTP Archive) format. It captures request and response details including headers, body content, and timing information using the standardized HAR format.

## Features

- Automatically intercepts and logs all HTTP/HTTPS traffic
- Records in standardized HAR 1.2 format for easy analysis
- Handles both CommonJS and ESM modules seamlessly
- Automatic Axios HTTP client instrumentation
- Decompresses gzip, deflate, and brotli encoded responses
- Pretty-prints JSON with compact arrays
- Complete request and response logging
- Universal module support without configuration

## Installation

```bash
npm install node-traffic-logger
```

## Usage

### From the command line

```bash
node-traffic-logger your-script.js [script arguments...]


To view a more readable version of a dumped HAR
```bash
node-traffic-logger-view path/to/archive.har
```

## How It Works

Node Traffic Logger is a command-line tool that uses Node.js module interception to monitor HTTP traffic:

1. **Preload Interceptor**: Uses Node.js `--require` flag to preload a CommonJS script that wraps the native HTTP/HTTPS module methods before your application runs.

2. **Module Interception**: Intercepts and wraps the native Node.js HTTP/HTTPS modules to capture all traffic

3. **Axios Instrumentation**: Automatically detects when Axios is imported and instruments it to capture all HTTP client requests, including custom instances.

4. **Pure CommonJS Implementation**: The entire tool is implemented using CommonJS for simplicity and compatibility with Node's preload mechanism.

The interceptors maintain a correlation system using unique request IDs to match requests with their corresponding responses, even in asynchronous environments.

## Output

Logs are saved to the `http-logs` directory with timestamps in HAR (HTTP Archive) format. Each log file contains detailed information about:

- HTTP method, URL, and headers for each request
- Request body content (if any)
- Response status code and headers
- Decompressed and formatted response body
- Error tracking for orphaned requests
- Timestamps and performance metrics
- Cookies, query parameters, and more

## HAR Format

The HTTP Archive (HAR) format is a standardized JSON format for logging HTTP transactions. It's widely supported by browser developer tools and network analysis applications. Here's a simplified example of what the HAR output looks like:

```json
{
  "log": {
    "version": "1.2",
    "creator": {
      "name": "node-traffic-logger",
      "version": "1.0.0"
    },
    "entries": [
      {
        "startedDateTime": "2025-04-28T19:41:13.526Z",
        "time": 100,
        "request": {
          "method": "GET",
          "url": "https://api.example.com/users",
          "httpVersion": "HTTP/1.1",
          "headers": [
            { "name": "accept", "value": "application/json" },
            { "name": "user-agent", "value": "node-fetch/1.0" }
          ],
          "queryString": [],
          "cookies": [],
          "headersSize": 75,
          "bodySize": 0
        },
        "response": {
          "status": 200,
          "statusText": "OK",
          "httpVersion": "HTTP/1.1",
          "headers": [
            { "name": "content-type", "value": "application/json" },
            { "name": "content-length", "value": "245" }
          ],
          "content": {
            "size": 245,
            "mimeType": "application/json",
            "text": "{\"users\":[{\"id\":1,\"name\":\"Alice\"},{\"id\":2,\"name\":\"Bob\"}]}"
          },
          "redirectURL": "",
          "headersSize": 87,
          "bodySize": 245
        },
        "cache": {},
        "timings": {
          "send": 10,
          "wait": 70,
          "receive": 20
        }
      }
    ]
  }
}
```

HAR files can be loaded into browser developer tools, Postman, and other HTTP analysis tools for visual inspection and debugging.

## Advanced Features

### Content Processing

- **Automatic Decompression**: Automatically detects and decompresses gzip, deflate, and brotli encoded responses, even if Content-Encoding headers are missing.
- **Smart Content Formatting**: Detects and formats JSON content with readable indentation and compact arrays.

### Error Handling

- **Orphaned Request Tracking**: Identifies requests that don't receive responses.
- **Error Logging**: Captures and logs network errors and processing exceptions.

### Environment Support

- **Target Application Compatibility**: Works with target applications using either CommonJS or ESM.
- **No Dependencies**: Zero external dependencies for maximum compatibility.
- **Pure CommonJS**: Implemented entirely in CommonJS for simplicity and maintainability.

## License

MIT
