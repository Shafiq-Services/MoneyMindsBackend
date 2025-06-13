const socketManager = require('./socketManager');

class SocketTester {
  constructor() {
    this.testClient = null;
  }

  initialize() {
    // Create a test client that connects to our socket server
    this.testClient = socketManager.io.of('/').sockets.get(socketManager.io.sockets.sockets.keys().next().value);
    
    if (!this.testClient) {
      console.log('⚠️ Socket Tester: No active socket connection found');
      return;
    }

    // Listen for upload progress events
    this.testClient.on('uploadProgress', (progress) => {
      console.log('\n📊 Upload Progress Update:');
      console.log('📦 Progress Data:', {
        id: progress.id,
        type: progress.type,
        status: progress.status,
        uploadProgress: progress.uploadProgress,
        transcodingProgress: progress.transcodingProgress,
        overallProgress: progress.overallProgress,
        message: progress.message
      });
    });

    console.log('✅ Socket Tester initialized - Monitoring video upload progress');
  }
}

// Create singleton instance
const socketTester = new SocketTester();

module.exports = socketTester; 