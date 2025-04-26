# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands
- Run tests: `npm test`
- Run a specific test: `node test/index.js`
- Lint code: `npm run lint`
- Run the CLI: `node bin/node-traffic-logger.js <script.js>`

## Code Style
- Each file should start with "ABOUTME:" comments describing its purpose (2 lines)
- Use CommonJS for all modules (files should end with .cjs)
- This is a command-line tool, not a library, so ESM is unnecessary
- Use camelCase for variables and functions
- Keep functions small and focused on a single responsibility
- Provide descriptive comments for complex functions
- Prefer async/await over callbacks where possible
- Format JSON with compact arrays
- Use proper error handling with detailed error messages
- NEVER implement mock mode for testing - use real data and APIs

## HTTP Interception
- Use CommonJS only for core interception functionality
- All request wrapper logic must be CommonJS (.cjs) for preload compatibility
- HTTP interception happens ONLY through the preload context
- All core functionality should be in .cjs files
- The ESM/CJS hybrid approach adds needless complexity - stick with CJS for core
- Handle all HTTP/HTTPS traffic formats
- Support automatic decompression of responses
- Track request-response pairs with unique IDs
- Log all details including headers, body, timing