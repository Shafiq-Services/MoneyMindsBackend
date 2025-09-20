const io = require('socket.io-client');

// ==========================================
// 🚨 SOCKET CONNECTION DEBUGGER
// ==========================================
// This script tests various socket connection scenarios
// to help identify why frontend sockets disconnect

const TEST_SCENARIOS = {
  VALID_TOKEN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4M2YyN2IyYTRkNzdiNDRiMzc2ZTFhNCIsImlhdCI6MTc1MTcwNzE4MiwiZXhwIjoxNzUyMzExOTgyfQ.eZEKI3HRN-no3CviDXnu7wAWH7pnDI2S1qYoZRNnc1M',
  INVALID_TOKEN: 'invalid.token.here',
  EXPIRED_TOKEN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4M2YyN2IyYTRkNzdiNDRiMzc2ZTFhNCIsImlhdCI6MTAwMCwiZXhwIjoxMDAxfQ.invalid',
  NO_TOKEN: null
};

const SERVER_URL = 'http://localhost:5000';

function testSocketConnection(scenarioName, token) {
  return new Promise((resolve) => {
    console.log(`\n🧪 Testing Scenario: ${scenarioName}`);
    console.log(`🔐 Token: ${token ? token.substring(0, 20) + '...' : 'NO TOKEN'}`);
    
    const socketConfig = {
      forceNew: true,
      timeout: 5000
    };
    
    if (token) {
      socketConfig.auth = { token };
      socketConfig.query = { token };
    }
    
    const socket = io(SERVER_URL, socketConfig);
    
    let result = {
      scenario: scenarioName,
      connected: false,
      setupCompleted: false,
      error: null,
      disconnectReason: null
    };
    
    const cleanup = () => {
      if (socket) {
        socket.disconnect();
      }
      resolve(result);
    };
    
    // Set timeout for test
    const timeout = setTimeout(() => {
      result.error = 'TIMEOUT - No response within 5 seconds';
      cleanup();
    }, 5000);
    
    socket.on('connect', () => {
      console.log(`✅ Connected! Socket ID: ${socket.id}`);
      result.connected = true;
    });
    
    socket.on('connection_success', (data) => {
      console.log(`🎉 Setup completed:`, data);
      result.setupCompleted = true;
      clearTimeout(timeout);
      setTimeout(cleanup, 1000); // Allow time for any delayed disconnections
    });
    
    socket.on('connection_error', (error) => {
      console.log(`❌ Connection error:`, error);
      result.error = error;
      clearTimeout(timeout);
      setTimeout(cleanup, 500);
    });
    
    socket.on('disconnect', (reason) => {
      console.log(`💔 Disconnected. Reason: ${reason}`);
      result.disconnectReason = reason;
      if (!result.setupCompleted) {
        clearTimeout(timeout);
        setTimeout(cleanup, 500);
      }
    });
    
    socket.on('connect_error', (error) => {
      console.log(`🚨 Connection error: ${error.message}`);
      result.error = error.message;
      clearTimeout(timeout);
      setTimeout(cleanup, 500);
    });
  });
}

async function runAllTests() {
  console.log('🚀 Starting Socket Connection Debug Tests...');
  console.log(`🎯 Target Server: ${SERVER_URL}`);
  console.log('📋 Testing 4 scenarios: Valid Token, Invalid Token, Expired Token, No Token\n');
  
  const results = [];
  
  for (const [scenarioName, token] of Object.entries(TEST_SCENARIOS)) {
    const result = await testSocketConnection(scenarioName, token);
    results.push(result);
    
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Print summary
  console.log('\n📊 TEST RESULTS SUMMARY:');
  console.log('='
    .repeat(60));
  
  results.forEach(result => {
    const status = result.setupCompleted ? '✅ SUCCESS' : 
                   result.connected ? '⚠️  PARTIAL' : 
                   '❌ FAILED';
    
    console.log(`${status} | ${result.scenario.padEnd(15)} | Connected: ${result.connected} | Setup: ${result.setupCompleted}`);
    if (result.error) {
      console.log(`     Error: ${JSON.stringify(result.error)}`);
    }
    if (result.disconnectReason) {
      console.log(`     Disconnect: ${result.disconnectReason}`);
    }
  });
  
  console.log('\n💡 RECOMMENDATIONS:');
  
  const validTokenResult = results.find(r => r.scenario === 'VALID_TOKEN');
  if (validTokenResult && validTokenResult.setupCompleted) {
    console.log('✅ Socket connection works with valid token');
    console.log('🔍 Frontend issue is likely: Invalid/missing/expired JWT token');
  } else if (validTokenResult && validTokenResult.connected && !validTokenResult.setupCompleted) {
    console.log('⚠️  Authentication works but database setup fails');
    console.log('🔍 Check MongoDB connection and user data integrity');
  } else {
    console.log('❌ Socket connection fails even with valid token');
    console.log('🔍 Check backend server status, database connection, or JWT_SECRET');
  }
  
  console.log('\n📝 For Frontend Developer:');
  console.log('1. Ensure JWT token is valid and not expired');
  console.log('2. Pass token in both auth.token and query.token');
  console.log('3. Listen for "connection_error" and "connection_success" events');
  console.log('4. Check browser console for detailed error messages');
  console.log('5. Verify frontend origin is in allowed CORS list');
  
  console.log('\n🏁 Debug test completed!');
}

// Run tests if called directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { runAllTests, testSocketConnection };
