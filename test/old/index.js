// ABOUTME: Test runner for node-traffic-logger
// ABOUTME: Runs all tests to validate functionality

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import path from 'path';

// Get the current module directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';

// Test result tracking
let passed = 0;
let failed = 0;
let total = 0;

// Simple test utility
function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`${PASS} ${name}`);
    passed++;
  } catch (error) {
    console.log(`${FAIL} ${name}`);
    console.error(`  Error: ${error.message}`);
    if (error.stack) {
      console.error(`  ${error.stack.split('\n')[1].trim()}`);
    }
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  
  if (actualStr !== expectedStr) {
    throw new Error(
      message || `Expected ${expectedStr}, but got ${actualStr}`
    );
  }
}

async function runTests() {
  console.log('\nRunning node-traffic-logger tests...\n');
  
  // Check if a specific test file was specified as an argument
  const specifiedTestFile = process.argv[2];
  
  let testFiles = [];
  
  if (specifiedTestFile) {
    // If a specific file was specified, only run that file
    const fileName = path.basename(specifiedTestFile);
    if (fs.existsSync(specifiedTestFile) && fileName.endsWith('.test.js')) {
      testFiles = [fileName];
      console.log(`Running specific test file: ${fileName}\n`);
    } else {
      console.error(`Error: Specified test file ${specifiedTestFile} not found or not a .test.js file`);
      process.exit(1);
    }
  } else {
    // Otherwise, run all test files
    testFiles = fs.readdirSync(__dirname)
      .filter(file => file.endsWith('.test.js'));
    
    // No test files found
    if (testFiles.length === 0) {
      console.log('No test files found. Create files with the .test.js extension.');
      return;
    }
  }
  
  // Run each test file
  for (const file of testFiles) {
    try {
      const testFilePath = specifiedTestFile || join(__dirname, file);
      console.log(`Running tests in: ${file}`);
      const testModule = await import(testFilePath);
      if (typeof testModule.runTests === 'function') {
        await testModule.runTests({ test, assert, assertDeepEqual });
      }
    } catch (error) {
      console.error(`Error loading test file ${file}:`, error);
      failed++;
    }
  }
  
  // Print summary
  console.log('\nTest Results:');
  console.log(`  Total: ${total}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  
  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(error => {
  console.error('Error running tests:', error);
  process.exit(1);
});
