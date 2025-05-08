// ABOUTME: Simple test script for CLI argument passing
// ABOUTME: Outputs command line arguments received

console.log('ARGS_START');
process.argv.slice(2).forEach((arg, i) => {
  console.log(`ARG[${i}]: ${arg}`);
});
console.log('ARGS_END');

// Explicitly exit to avoid hanging
process.exit(0);