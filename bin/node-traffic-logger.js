#!/usr/bin/env node

// ABOUTME: CLI script for node-traffic-logger
// ABOUTME: Provides command-line interface to run instrumented node scripts

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

// Read package.json for version info
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Parse command line arguments
const args = process.argv.slice(2);

// If no arguments provided, show help
if (args.length === 0) {
  console.log(`
  Node Traffic Logger v${packageJson.version}

  Usage: node-traffic-logger [options] <script.js> [script-args...]

  Options:
    -h, --help      Show this help menu
    -v, --version   Show version information

  Examples:
    node-traffic-logger script.js
    node-traffic-logger script.js --port 3000
    node-traffic-logger -v script.js --arg value
  `);
  process.exit(0);
}

// Process CLI options that come before the script path
let cliArgs = [];
let scriptIndex = 0;

// Handle CLI arguments that come before the script
while (scriptIndex < args.length) {
  const arg = args[scriptIndex];
  
  // Check if this is a CLI option
  if (arg === '-h' || arg === '--help') {
    console.log(`
    Node Traffic Logger v${packageJson.version}

    Usage: node-traffic-logger [options] <script.js> [script-args...]

    Options:
      -h, --help      Show this help menu
      -v, --version   Show version information

    Examples:
      node-traffic-logger script.js
      node-traffic-logger script.js --port 3000
      node-traffic-logger -v script.js --arg value
    `);
    process.exit(0);
  } 
  else if (arg === '-v' || arg === '--version') {
    console.log(`Node Traffic Logger v${packageJson.version}`);
    cliArgs.push(arg);
    scriptIndex++;
  }
  // If it's not a CLI option, it's the script path
  else {
    break;
  }
}

// Get the target script
const targetScript = args[scriptIndex];

// No script provided
if (!targetScript) {
  console.error('Error: No script specified');
  process.exit(1);
}

// Verify target script exists
if (!fs.existsSync(targetScript)) {
  console.error(`Error: Script not found: ${targetScript}`);
  process.exit(1);
}

// Get script arguments (everything after the script path)
const scriptArgs = args.slice(scriptIndex + 1);

// Resolve absolute path for the target script
const absoluteTargetPath = path.resolve(process.cwd(), targetScript);

// Path to our runner script
const runnerPath = path.join(__dirname, '..', 'src', 'runner.cjs');

// Environment variables for the child process
const childEnv = {
  ...process.env,
  NODE_TRAFFIC_LOGGER_ENABLED: 'true',
  NODE_TRAFFIC_LOGGER_DIR: process.env.NODE_TRAFFIC_LOGGER_DIR || path.join(process.cwd(), 'http-logs'),
  
  // Add project root path to help with module resolution
  NODE_TRAFFIC_LOGGER_ROOT: path.join(__dirname, '..')
};

// Use a child process to run our runner script with the target script
const result = spawnSync('node', [
  runnerPath,
  absoluteTargetPath,
  ...scriptArgs
], {
  stdio: 'inherit',
  env: childEnv
});

// Exit with the same code as the child process
process.exit(result.status);