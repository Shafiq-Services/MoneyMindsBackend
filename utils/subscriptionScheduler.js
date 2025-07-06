const cron = require('node-cron');
const { checkSubscriptionExpiryWarnings } = require('../controllers/subscriptionController');

/**
 * Initialize subscription expiry warning scheduler
 * Runs daily at 9 AM to check for subscriptions expiring in 3 days
 */
const initializeSubscriptionScheduler = () => {
  console.log('🕘 [Subscription Scheduler] Initializing subscription expiry warning scheduler...');
  
  // Run daily at 9 AM (0 9 * * *)
  cron.schedule('0 9 * * *', async () => {
    console.log('🔔 [Subscription Scheduler] Running daily subscription expiry check...');
    await checkSubscriptionExpiryWarnings();
  }, {
    scheduled: true,
    timezone: "America/New_York"
  });

  // Also run once immediately on startup for testing
  setTimeout(async () => {
    console.log('🔔 [Subscription Scheduler] Running initial subscription expiry check...');
    await checkSubscriptionExpiryWarnings();
  }, 5000); // Wait 5 seconds after startup

  console.log('✅ [Subscription Scheduler] Subscription expiry warning scheduler initialized');
};

module.exports = { initializeSubscriptionScheduler }; 