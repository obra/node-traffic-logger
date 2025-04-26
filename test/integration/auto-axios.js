// Test file for automatic Axios instrumentation
// Run with: node --require ../../src/preload-interceptor.cjs auto-axios.js

// Load axios - should be automatically instrumented
const axios = require('axios');

async function testAutoInstrumentation() {
  console.log('Testing automatic Axios instrumentation');
  
  // Make a simple request
  try {
    const response = await axios.get('https://jsonplaceholder.typicode.com/posts/1');
    console.log(`Request succeeded with status ${response.status}`);
    console.log('Data:', response.data);
  } catch (error) {
    console.error('Request failed:', error.message);
  }
  
  // Test with a custom instance and explicit POST request
  try {
    const api = axios.create({
      baseURL: 'https://jsonplaceholder.typicode.com',
      headers: { 'X-Test': 'auto-instrumentation' }
    });
    
    const response = await api.request({
      method: 'POST',
      url: '/posts',
      data: {
        title: 'Auto-instrumentation test',
        body: 'This request should be logged automatically',
        userId: 1
      }
    });
    
    console.log(`Custom instance request succeeded with status ${response.status}`);
  } catch (error) {
    console.error('Custom instance request failed:', error.message);
  }
  
  console.log('Done - check http-logs directory for logged requests');
}

testAutoInstrumentation().catch(console.error);