#!/usr/bin/env node

/**
 * Script to quickly test the Review Page with a specific session ID
 * Usage: node scripts/test-review.js [sessionId]
 */

const { spawn } = require('child_process');
const path = require('path');

// Get session ID from command line or use default
const sessionId = process.argv[2] || 'cc8fb903-f5a0-4c88-877b-d4ef05d408dc';

console.log('🚀 Starting Review Page test mode...');
console.log(`📝 Session ID: ${sessionId}`);
console.log('');

// Set environment variable for test mode
process.env.TEST_MODE = 'review';
process.env.TEST_SESSION_ID = sessionId;

// Start the Electron app
const electron = spawn('electron', ['.'], {
  env: {
    ...process.env,
    TEST_MODE: 'review',
    TEST_SESSION_ID: sessionId
  },
  stdio: 'inherit'
});

electron.on('close', (code) => {
  console.log(`\n✅ Test completed with code ${code}`);
  process.exit(code);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Stopping test...');
  electron.kill();
  process.exit(0);
});