const cron = require('node-cron');
const { 
  checkSubscriptionExpiryWarnings,
  // sendIncompletePaymentReminder,
  sendPostCancellationFollowUps,
  sendPostExpiryEmail
} = require('../controllers/subscriptionController');

/**
 * Initialize subscription expiry warning scheduler
 * Runs daily at 9 AM to check for subscriptions expiring in 3 days
 */
const initializeSubscriptionScheduler = () => {
  console.log('🕘 [Subscription Scheduler] Initializing subscription email schedulers...');
  
  // Run daily at 9 AM (0 9 * * *) - Subscription expiry warnings
  cron.schedule('0 9 * * *', async () => {
    console.log('🔔 [Subscription Scheduler] Running daily subscription expiry check...');
    await checkSubscriptionExpiryWarnings();
  }, {
    scheduled: true,
    timezone: "America/New_York"
  });

  // Run every 15 minutes (*/15 * * * *) - Incomplete payment reminders
  cron.schedule('*/15 * * * *', async () => {
    console.log('📧 [Subscription Scheduler] Running incomplete payment reminder check...');
    await sendIncompletePaymentReminder();
  }, {
    scheduled: true,
    timezone: "America/New_York"
  });

  // Run daily at 10 AM (0 10 * * *) - Post cancellation follow-ups
  cron.schedule('0 10 * * *', async () => {
    console.log('📧 [Subscription Scheduler] Running post-cancellation follow-up check...');
    await sendPostCancellationFollowUps();
  }, {
    scheduled: true,
    timezone: "America/New_York"
  });

  // Run daily at 11 AM (0 11 * * *) - Post expiry emails
  cron.schedule('0 11 * * *', async () => {
    console.log('📧 [Subscription Scheduler] Running post-expiry email check...');
    await sendPostExpiryEmail();
  }, {
    scheduled: true,
    timezone: "America/New_York"
  });

  console.log('✅ [Subscription Scheduler] All subscription email schedulers initialized');
};

module.exports = { initializeSubscriptionScheduler }; 