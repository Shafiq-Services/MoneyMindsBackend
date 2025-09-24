const io = require('socket.io-client');

// ==========================================
// 🔧 EASY CONFIGURATION - CHANGE THESE VALUES
// ==========================================

const SETTINGS = {
  SERVER_URL: 'http://localhost:5000',
  USER_TOKEN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4M2YyN2IyYTRkNzdiNDRiMzc2ZTFhNCIsImlhdCI6MTc1MTcwNzE4MiwiZXhwIjoxNzUyMzExOTgyfQ.eZEKI3HRN-no3CviDXnu7wAWH7pnDI2S1qYoZRNnc1M',
  
  // Video Progress Testing
  VIDEO_ID: '6852a41cf586bebfaf0eba33',
  PROGRESS_SECONDS: 45,
  
  // Chat Testing
  CHANNEL_ID: 'your_channel_id_here',
  
  // Feed Testing
  FEED_ID: 'your_feed_id_here',
  
  // Book Testing
  BOOK_ID: '6867aaa49d7700cf7f947e73', // Set a real book ID here
};

// ==========================================
// 🧪 SOCKET CONNECTION
// ==========================================

let socket = null;
let isConnected = false;

function connectToServer() {
  console.log('🔌 Connecting to server...');
  
  socket = io(SETTINGS.SERVER_URL, {
    auth: { token: SETTINGS.USER_TOKEN },
    query: { token: SETTINGS.USER_TOKEN }
  });

  socket.on('connect', () => {
    isConnected = true;
    console.log('✅ Connected! Socket ID:', socket.id);
    
    // Auto-run example after connection is established
    setTimeout(() => {
      console.log('🚀 Auto-testing book opening...');
      sendBookOpened('6867aaa49d7700cf7f947e73'); // Use a real book ID
      
      // Exit after sending book opened event (for testing purposes)
      setTimeout(() => {
        console.log('✅ Book opened event sent successfully!');
        console.log('🔌 Disconnecting...');
        disconnect();
        process.exit(0);
      }, 3000); // Wait 3 seconds for server response
    }, 1000);
  });

  socket.on('disconnect', () => {
    isConnected = false;
    console.log('❌ Disconnected from server');
  });

  socket.on('connect_error', (error) => {
    console.error('❌ Connection error:', error.message);
  });

  // Listen to server events
  socket.on('new-message', (data) => console.log('📨 New message:', data));
  socket.on('user-typing', (data) => console.log('⌨️ User typing:', data));
  socket.on('typing-stopped', (data) => console.log('⌨️ Typing stopped:', data));
  socket.on('unread-count-updated', (data) => console.log('📊 Unread count:', data));
  
  // Book events
  socket.on('book-opened-confirmed', (data) => console.log('📖 Book opened confirmed:', data));
  socket.on('book-user-joined', (data) => console.log('👥 User joined book:', data));
  socket.on('book-opened-error', (data) => console.log('❌ Book opened error:', data));
}

// ==========================================
// 🎯 EASY TEST FUNCTIONS - CALL THESE DIRECTLY
// ==========================================

// Video Progress Functions
function sendVideoProgress(videoId = SETTINGS.VIDEO_ID, seconds = SETTINGS.PROGRESS_SECONDS) {
  if (!isConnected) {
    console.log('❌ Not connected! Call connectToServer() first');
    return;
  }
  
  const data = { videoId, progress: seconds };
  console.log('📹 Sending video progress:', data);
  socket.emit('video-progress', data);
}

function sendMultipleProgress(videoId = SETTINGS.VIDEO_ID, startSeconds = 30, endSeconds = 180, interval = 30) {
  console.log(`🎬 Sending multiple progress events: ${startSeconds}s to ${endSeconds}s`);
  
  let currentSeconds = startSeconds;
  const timer = setInterval(() => {
    sendVideoProgress(videoId, currentSeconds);
    currentSeconds += interval;
    
    if (currentSeconds > endSeconds) {
      clearInterval(timer);
      console.log('✅ Multiple progress sending completed');
    }
  }, 2000); // Send every 2 seconds
}

// Chat Functions
function sendTyping(channelId = SETTINGS.CHANNEL_ID) {
  if (!isConnected) {
    console.log('❌ Not connected! Call connectToServer() first');
    return;
  }
  
  console.log('⌨️ Sending typing event');
  socket.emit('user-typing', { channelId });
}

function sendStopTyping(channelId = SETTINGS.CHANNEL_ID) {
  if (!isConnected) {
    console.log('❌ Not connected! Call connectToServer() first');
    return;
  }
  
  console.log('⌨️ Sending stop typing event');
  socket.emit('typing-stopped', { channelId });
}

function sendTypingSequence(channelId = SETTINGS.CHANNEL_ID) {
  console.log('⌨️ Sending typing sequence (3 seconds)');
  sendTyping(channelId);
  setTimeout(() => sendStopTyping(channelId), 3000);
}

// Feed Functions
function sendLikeFeed(feedId = SETTINGS.FEED_ID) {
  if (!isConnected) {
    console.log('❌ Not connected! Call connectToServer() first');
    return;
  }
  
  const data = { feedId, type: 'like' };
  console.log('❤️ Sending like feed event:', data);
  socket.emit('like-feed', data);
}

function sendUnlikeFeed(feedId = SETTINGS.FEED_ID) {
  if (!isConnected) {
    console.log('❌ Not connected! Call connectToServer() first');
    return;
  }
  
  const data = { feedId, type: 'unlike' };
  console.log('💔 Sending unlike feed event:', data);
  socket.emit('like-feed', data);
}

// Book Functions
function sendBookOpened(bookId = SETTINGS.BOOK_ID) {
  if (!isConnected) {
    console.log('❌ Not connected! Call connectToServer() first');
    return;
  }
  
  const data = { bookId };
  console.log('📖 Sending book opened event:', data);
  socket.emit('book-opened', data);
}

// Channel Functions
function exitChannelList() {
  if (!isConnected) {
    console.log('❌ Not connected! Call connectToServer() first');
    return;
  }
  
  console.log('🚪 Sending exit channel list event');
  socket.emit('exit-channel-list');
}

// Utility Functions
function disconnect() {
  if (socket) {
    socket.disconnect();
    console.log('🔌 Disconnected from server');
  }
}

function showSettings() {
  console.log('\n📋 CURRENT SETTINGS:');
  console.log('====================');
  Object.entries(SETTINGS).forEach(([key, value]) => {
    console.log(`${key}: ${value}`);
  });
  console.log('====================\n');
}

function showAvailableFunctions() {
  console.log('\n🎯 AVAILABLE FUNCTIONS:');
  console.log('=======================');
  console.log('📹 Video Progress:');
  console.log('  - sendVideoProgress(videoId, seconds)');
  console.log('  - sendMultipleProgress(videoId, startSeconds, endSeconds, interval)');
  console.log('');
  console.log('⌨️ Chat:');
  console.log('  - sendTyping(channelId)');
  console.log('  - sendStopTyping(channelId)');
  console.log('  - sendTypingSequence(channelId)');
  console.log('');
  console.log('❤️ Feed:');
  console.log('  - sendLikeFeed(feedId)');
  console.log('  - sendUnlikeFeed(feedId)');
  console.log('');
  console.log('📖 Books:');
  console.log('  - sendBookOpened(bookId)');
  console.log('');
  console.log('🔧 Utility:');
  console.log('  - connectToServer()');
  console.log('  - disconnect()');
  console.log('  - showSettings()');
  console.log('  - exitChannelList()');
  console.log('=======================\n');
}

// ==========================================
// 🚀 AUTO START
// ==========================================

console.log('🧪 SIMPLE SOCKET TESTER LOADED');
console.log('===============================');
console.log('✅ Ready to use!');
console.log('');
console.log('🔧 1. Edit SETTINGS object above to change values');
console.log('🚀 2. Call connectToServer() to connect');
console.log('🎯 3. Call any test function you want');
console.log('');
console.log('💡 Type showAvailableFunctions() to see all functions');
console.log('💡 Type showSettings() to see current settings');
console.log('===============================\n');

// Auto-connect (comment out if you don't want auto-connect)
connectToServer();

// ==========================================
// 🎯 QUICK EXAMPLES - UNCOMMENT TO USE
// ==========================================

// Example 1: Send single video progress after 2 seconds (DISABLED - now runs after connection)
// setTimeout(() => {
//   sendVideoProgress('686679d083b2aef4cde330bc', 120);
// }, 2000);

// Example 2: Send multiple progress events
// setTimeout(() => {
//   sendMultipleProgress('686679d083b2aef4cde330bc', 30, 180, 30);
// }, 3000);

// Example 3: Test typing sequence
// setTimeout(() => {
//   sendTypingSequence('your_channel_id');
// }, 4000);

// Example 4: Test like feed
// setTimeout(() => {
//   sendLikeFeed('your_feed_id');
// }, 5000);

// Example 5: Test book opened (ACTIVE - now runs after connection)
// setTimeout(() => {
//   sendBookOpened('6852a41cf586bebfaf0eba33');
// }, 6000); 