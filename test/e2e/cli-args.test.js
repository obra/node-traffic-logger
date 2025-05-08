// ABOUTME: Tests for command line argument passing via node-traffic-logger
// ABOUTME: Verifies arguments are passed correctly to the target script

const { spawn } = require('child_process');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');
const binPath = path.join(rootDir, 'bin', 'node-traffic-logger.js');
const testScriptPath = path.join(__dirname, 'simple-arg-test.js');

describe('CLI argument passing', () => {
  test('should correctly pass arguments to the target script', async () => {
    const testArgs = ['--test', 'value', '--flag'];
    
    // Run via the CLI
    const cliResult = await runWithCLI(testScriptPath, testArgs);
    
    // Run directly with node for comparison
    const directResult = await runDirectly(testScriptPath, testArgs);
    
    // The args should be identical whether run with the CLI or directly
    expect(cliResult.args).toEqual(directResult.args);
    
    // Specific test to ensure all arguments are passed
    expect(cliResult.args).toContain('ARG[0]: --test');
    expect(cliResult.args).toContain('ARG[1]: value');
    expect(cliResult.args).toContain('ARG[2]: --flag');
  }, 30000); // Increase timeout
});

/**
 * Run a script through node-traffic-logger
 */
async function runWithCLI(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    
    const childProcess = spawn('node', [binPath, scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    childProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    childProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    childProcess.on('close', (code) => {
      // Extract argument output lines
      const output = stdout.split('\n');
      const startIndex = output.findIndex(line => line === 'ARGS_START');
      const endIndex = output.findIndex(line => line === 'ARGS_END');
      
      const args = startIndex !== -1 && endIndex !== -1 
        ? output.slice(startIndex + 1, endIndex)
        : [];
      
      resolve({
        code,
        stdout,
        stderr,
        args
      });
    });
    
    childProcess.on('error', reject);
  });
}

/**
 * Run a script directly with node (for comparison)
 */
async function runDirectly(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    
    const childProcess = spawn('node', [scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    childProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    childProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    childProcess.on('close', (code) => {
      // Extract argument output lines
      const output = stdout.split('\n');
      const startIndex = output.findIndex(line => line === 'ARGS_START');
      const endIndex = output.findIndex(line => line === 'ARGS_END');
      
      const args = startIndex !== -1 && endIndex !== -1 
        ? output.slice(startIndex + 1, endIndex)
        : [];
      
      resolve({
        code,
        stdout,
        stderr,
        args
      });
    });
    
    childProcess.on('error', reject);
  });
}