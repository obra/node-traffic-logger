// ABOUTME: Tests for CLI argument passing issues with node-traffic-logger
// ABOUTME: Focuses on specific issue where args might be incorrectly passed to the tool instead of the script

const { spawn } = require('child_process');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');
const binPath = path.join(rootDir, 'bin', 'node-traffic-logger.js');
const testScriptPath = path.join(__dirname, 'simple-arg-test.js');

describe('CLI argument passing issue', () => {
  // Simple test of passing through arguments after the script
  test('script arguments should pass through to the target script', async () => {
    const scriptArgs = ['--port', '3000', '--verbose']; 
    
    const result = await runWithCLI(testScriptPath, scriptArgs);
    
    // Verify the script received the arguments
    expect(result.args).toEqual([
      'ARG[0]: --port',
      'ARG[1]: 3000',
      'ARG[2]: --verbose'
    ]);
  }, 30000);
  
  // Test CLI options before the script
  test('CLI options before script are processed by the CLI', async () => {
    const cliArgs = ['-v']; // Version flag
    const scriptArgs = [];
    
    const result = await runWithCLI(testScriptPath, scriptArgs, cliArgs);
    
    // CLI should process the version flag
    expect(result.stdout).toContain('Node Traffic Logger v');
    
    // No arguments to the script
    expect(result.args).toEqual([]);
  }, 30000);
  
  // Important test case - CLI arguments with same name as script arguments
  test('script argument with same name as CLI option should go to script', async () => {
    const scriptArgs = ['--version', 'app-version'];
    
    const result = await runWithCLI(testScriptPath, scriptArgs);
    
    // Verify that --version was passed to the script and not intercepted by CLI
    expect(result.args).toEqual([
      'ARG[0]: --version',  
      'ARG[1]: app-version'
    ]);
  }, 30000);
  
  // Test both CLI and script arguments together
  test('should handle both CLI and script arguments', async () => {
    const cliArgs = ['-v'];
    const scriptArgs = ['--config', 'test.json'];
    
    const result = await runWithCLI(testScriptPath, scriptArgs, cliArgs);
    
    // CLI should process its own args
    expect(result.stdout).toContain('Node Traffic Logger v');
    
    // Script should still get its args
    expect(result.args).toEqual([
      'ARG[0]: --config',
      'ARG[1]: test.json'
    ]);
  }, 30000);
});

/**
 * Run a script through node-traffic-logger
 * @param {string} scriptPath - Path to the script to run
 * @param {string[]} scriptArgs - Arguments to pass to script
 * @param {string[]} cliArgs - CLI arguments for node-traffic-logger
 */
async function runWithCLI(scriptPath, scriptArgs = [], cliArgs = []) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    
    console.log(`Running: node ${binPath} ${cliArgs.join(' ')} ${scriptPath} ${scriptArgs.join(' ')}`);
    
    const childProcess = spawn('node', [...[binPath], ...cliArgs, scriptPath, ...scriptArgs], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    childProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    childProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    childProcess.on('close', (code) => {
      console.log('CLI stdout:', stdout);
      console.log('CLI stderr:', stderr);
      
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