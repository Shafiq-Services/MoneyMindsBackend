const stripe = require('../utils/stripe');
const User = require('../models/user');
const Subscription = require('../models/subscription');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { stripeWebhookSecret } = require('../config/config');
const sendEmail = require('../utils/sendEmail');
const socketManager = require('../utils/socketManager');

// Stripe Price IDs from environment variables
const MONTHLY_PRICE_ID = process.env.MONTHLY_PRICE_ID;
const YEARLY_PRICE_ID = process.env.YEARLY_PRICE_ID;

/**
 * Create a new subscription
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.createSubscription = async (req, res) => {
  try {
    // Authenticated user only
    const userId = req.userId;
    const { paymentMethod, plan, billingInfo } = req.body;
    
    if (!paymentMethod) return errorResponse(res, 400, 'Payment method is required');
    if (!plan || !['monthly', 'yearly'].includes(plan)) {
      return errorResponse(res, 400, 'Plan type must be either "monthly" or "yearly"');
    }

    const user = await User.findById(userId);
    if (!user) return errorResponse(res, 404, 'User not found');

    // Select price ID based on plan type
    const priceId = plan === 'monthly' ? MONTHLY_PRICE_ID : YEARLY_PRICE_ID;
    if (!priceId) {
      return errorResponse(res, 500, 'Price configuration not found');
    }

    // Create Stripe customer if needed
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.firstName + ' ' + user.lastName,
        phone: user.phone,
        payment_method: paymentMethod,
        invoice_settings: { default_payment_method: paymentMethod },
      });
      stripeCustomerId = customer.id;
      user.stripeCustomerId = stripeCustomerId;
      await user.save();
    }

    // Update customer with billing info if provided
    if (billingInfo) {
      await stripe.customers.update(stripeCustomerId, {
        name: billingInfo.name || user.firstName + ' ' + user.lastName,
        phone: billingInfo.phone || user.phone,
        address: {
          line1: billingInfo.address?.line1,
          line2: billingInfo.address?.line2,
          city: billingInfo.address?.city,
          state: billingInfo.address?.state,
          postal_code: billingInfo.address?.postal_code,
          country: billingInfo.address?.country
        }
      });
    }

    // Create the subscription in Stripe
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    // Save subscription details to your database
    const newSubscription = new Subscription({
      userId: user._id,
      provider: 'stripe',
      plan: plan,
      status: 'incomplete', // Will be updated by webhooks
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      metadata: { 
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId
      }
    });
    await newSubscription.save();

    // Send welcome email
    try {
      await sendEmail(
        user.email,
        'Welcome to Money Minds!',
        `Hello ${user.firstName},\n\nThank you for subscribing to Money Minds ${plan} plan!\n\nYour subscription is being processed. You'll receive a confirmation email once your payment is successful.\n\nIf you have any questions, please don't hesitate to contact us.\n\nBest regards,\nThe Money Minds Team`
      );
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
    }

    // Return clientSecret for Stripe.js
    return successResponse(res, 201, 'Subscription created successfully. Complete payment using the clientSecret.', {
      subscriptionId: subscription.id,
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
      paymentIntentId: subscription.latest_invoice.payment_intent.id,
      plan: plan,
      status: 'incomplete',
      nextStep: 'Complete payment using Stripe.js confirmCardPayment with the clientSecret'
    }, 'subscription');
  } catch (error) {
    console.error('Stripe Error:', error);
    return errorResponse(res, 500, 'Internal Server Error', error.message);
  }
};

/**
 * Cancel a subscription
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.cancelSubscription = async (req, res) => {
  try {
    const userId = req.userId;
    const { subscriptionId } = req.body;

    if (!subscriptionId) {
      return errorResponse(res, 400, 'Subscription ID is required');
    }

    // Find the subscription in our database
    const subscription = await Subscription.findOne({
      userId: userId,
      'metadata.stripeSubscriptionId': subscriptionId
    });

    if (!subscription) {
      return errorResponse(res, 404, 'Subscription not found');
    }

    const user = await User.findById(userId);

    // Cancel the subscription in Stripe
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });

    // Update our database
    subscription.status = 'canceled';
    await subscription.save();

    // Send cancellation email
    try {
      await sendEmail(
        user.email,
        'Subscription Cancellation Confirmed',
        `Hello ${user.firstName},\n\nYour Money Minds subscription has been successfully canceled.\n\nYou'll continue to have access to all features until the end of your current billing period (${new Date(subscription.currentPeriodEnd).toLocaleDateString()}).\n\nWe're sorry to see you go! If you change your mind, you can reactivate your subscription anytime.\n\nBest regards,\nThe Money Minds Team`
      );
    } catch (emailError) {
      console.error('Failed to send cancellation email:', emailError);
    }

    return successResponse(res, 200, 'Subscription canceled successfully');
  } catch (error) {
    console.error('Cancel Subscription Error:', error);
    return errorResponse(res, 500, 'Failed to cancel subscription', error.message);
  }
};

/**
 * Get user's subscription status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.userId;

    const subscription = await Subscription.findOne({
      userId: userId,
      status: { $in: ['active', 'past_due', 'incomplete'] }
    }).sort({ createdAt: -1 });

    if (!subscription) {
      return successResponse(res, 200, 'No active subscription found', {
        hasSubscription: false,
        subscription: null
      }, 'subscriptionStatus');
    }

    return successResponse(res, 200, 'Subscription status retrieved successfully', {
      hasSubscription: true,
      subscription: {
        _id: subscription._id,
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        createdAt: subscription.createdAt
      }
    }, 'subscriptionStatus');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to get subscription status', error.message);
  }
};

/**
 * Handle Stripe webhook events - FULLY AUTOMATED
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, stripeWebhookSecret);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return errorResponse(res, 400, `Webhook Error: ${err.message}`);
  }

  console.log(`Received webhook event: ${event.type}`);

  // Handle the event
  switch (event.type) {
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      console.log('Payment succeeded for invoice:', invoice.id);
      
      // If the invoice has a subscription ID, it's a recurring payment
      if (invoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const dbSubscription = await Subscription.findOne({ 
          'metadata.stripeSubscriptionId': subscription.id 
        });
        
        if (dbSubscription) {
          const wasIncomplete = dbSubscription.status === 'incomplete';
          dbSubscription.status = 'active';
          dbSubscription.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
          await dbSubscription.save();
          
          // Get user details
          const user = await User.findById(dbSubscription.userId);
          
          if (wasIncomplete) {
            // First payment - send confirmation email
            try {
              await sendEmail(
                user.email,
                'Welcome to Money Minds - Payment Confirmed!',
                `Hello ${user.firstName},\n\nGreat news! Your payment has been processed successfully and your Money Minds ${dbSubscription.plan} subscription is now active.\n\nYou now have full access to:\n• All premium courses and content\n• Exclusive member benefits\n• 24/7 support\n\nYour next billing date is: ${new Date(subscription.current_period_end * 1000).toLocaleDateString()}\n\nWelcome to the Money Minds community!\n\nBest regards,\nThe Money Minds Team`
              );
            } catch (emailError) {
              console.error('Failed to send confirmation email:', emailError);
            }
          } else {
            // Recurring payment - send renewal confirmation
            try {
              await sendEmail(
                user.email,
                'Payment Confirmed - Your Subscription Renewed',
                `Hello ${user.firstName},\n\nYour Money Minds ${dbSubscription.plan} subscription has been successfully renewed.\n\nPayment Details:\n• Amount: $${(invoice.amount_paid / 100).toFixed(2)}\n• Next billing date: ${new Date(subscription.current_period_end * 1000).toLocaleDateString()}\n\nThank you for continuing your journey with Money Minds!\n\nBest regards,\nThe Money Minds Team`
              );
            } catch (emailError) {
              console.error('Failed to send renewal email:', emailError);
            }
          }
          
          console.log('Subscription updated successfully for successful payment.');
        }
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      console.log('Payment failed for invoice:', invoice.id);
      
      const dbSubscription = await Subscription.findOne({ 
        'metadata.stripeSubscriptionId': invoice.subscription 
      });

      if (dbSubscription) {
        dbSubscription.status = 'past_due';
        await dbSubscription.save();
        console.log('Subscription marked as past due.');
      }

      // Send email notification to user
      if (invoice.customer) {
        const user = await User.findOne({ stripeCustomerId: invoice.customer });
        if (user) {
          try {
            await sendEmail(
              user.email,
              'Payment Failed - Action Required',
              `Hello ${user.firstName},\n\nWe were unable to process your recent payment for your Money Minds subscription.\n\nThis could be due to:\n• Insufficient funds in your account\n• Expired payment method\n• Bank restrictions\n\nTo avoid any interruption to your service, please:\n1. Update your payment method in your account settings\n2. Ensure sufficient funds are available\n3. Contact your bank if needed\n\nYour subscription will be retried automatically. If the issue persists, your access may be temporarily limited.\n\nIf you need help, please contact our support team.\n\nBest regards,\nThe Money Minds Team`
            );
          } catch (emailError) {
            console.error('Failed to send payment failed email:', emailError);
          }
          console.log(`Payment failed email sent to user: ${user.email}`);
        }
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      console.log('Subscription deleted:', subscription.id);
      
      const dbSubscription = await Subscription.findOne({ 
        'metadata.stripeSubscriptionId': subscription.id 
      });
      
      if (dbSubscription) {
        dbSubscription.status = 'canceled';
        await dbSubscription.save();
        
        // Get user details
        const user = await User.findById(dbSubscription.userId);
        if (user) {
          try {
            await sendEmail(
              user.email,
              'Subscription Ended - We\'ll Miss You!',
              `Hello ${user.firstName},\n\nYour Money Minds subscription has ended.\n\nWe're sorry to see you go! You've been an important part of our community.\n\nIf you'd like to continue your learning journey:\n• Reactivate your subscription anytime\n• Access your learning history\n• Download any materials you've purchased\n\nWe hope to see you back soon!\n\nBest regards,\nThe Money Minds Team`
            );
          } catch (emailError) {
            console.error('Failed to send subscription ended email:', emailError);
          }
        }
        
        console.log(`Subscription ${subscription.id} marked as canceled in DB.`);
      }
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      console.log('Subscription updated:', subscription.id);
      
      const dbSubscription = await Subscription.findOne({ 
        'metadata.stripeSubscriptionId': subscription.id 
      });
      
      if (dbSubscription) {
        const oldStatus = dbSubscription.status;
        dbSubscription.status = subscription.status;
        dbSubscription.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
        await dbSubscription.save();
        
        // Send email for status changes
        const user = await User.findById(dbSubscription.userId);
        if (user && oldStatus !== subscription.status) {
          try {
            let subject, message;
            
            if (subscription.status === 'active' && oldStatus === 'past_due') {
              subject = 'Payment Successful - Access Restored';
              message = `Hello ${user.firstName},\n\nGreat news! Your payment has been processed and your Money Minds subscription is now active again.\n\nYour access to all premium content has been restored.\n\nThank you for resolving the payment issue!\n\nBest regards,\nThe Money Minds Team`;
            } else if (subscription.status === 'past_due') {
              subject = 'Payment Overdue - Action Required';
              message = `Hello ${user.firstName},\n\nYour Money Minds subscription payment is overdue.\n\nTo maintain uninterrupted access to your premium content, please update your payment method or contact our support team.\n\nWe value your membership and want to ensure you continue to have access to all our resources.\n\nBest regards,\nThe Money Minds Team`;
            }
            
            if (subject && message) {
              await sendEmail(user.email, subject, message);
            }
          } catch (emailError) {
            console.error('Failed to send status update email:', emailError);
          }
        }
        
        console.log(`Subscription ${subscription.id} updated in DB.`);
      }
      break;
    }

    case 'invoice.upcoming': {
      const invoice = event.data.object;
      console.log('Upcoming invoice:', invoice.id);
      
      // Send reminder email for upcoming payment
      if (invoice.customer) {
        const user = await User.findOne({ stripeCustomerId: invoice.customer });
        if (user) {
          try {
            await sendEmail(
              user.email,
              'Upcoming Payment Reminder',
              `Hello ${user.firstName},\n\nThis is a friendly reminder that your Money Minds subscription will be charged on ${new Date(invoice.next_payment_attempt * 1000).toLocaleDateString()}.\n\nAmount: $${(invoice.amount_due / 100).toFixed(2)}\n\nYour payment method on file will be charged automatically. If you need to update your payment information, please do so before the due date.\n\nThank you for being a valued member!\n\nBest regards,\nThe Money Minds Team`
            );
          } catch (emailError) {
            console.error('Failed to send upcoming payment email:', emailError);
          }
        }
      }
      break;
    }

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  return successResponse(res, 200, 'Webhook received');
};

/**
 * Confirm payment completion and update subscription status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.confirmPayment = async (req, res) => {
  try {
    const userId = req.userId;
    const { subscriptionId, paymentIntentId } = req.body;

    if (!subscriptionId) {
      return errorResponse(res, 400, 'Subscription ID is required');
    }

    // Find the subscription in our database
    const subscription = await Subscription.findOne({
      userId: userId,
      'metadata.stripeSubscriptionId': subscriptionId
    });

    if (!subscription) {
      return errorResponse(res, 404, 'Subscription not found');
    }

    // Retrieve the payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status === 'succeeded') {
      // Update subscription status to active
      subscription.status = 'active';
      await subscription.save();

      // Get user details for email
      const user = await User.findById(userId);
      
      // Ensure customer has basic billing info
      const customer = await stripe.customers.retrieve(user.stripeCustomerId);
      if (!customer.name || !customer.phone) {
        await stripe.customers.update(user.stripeCustomerId, {
          name: customer.name || user.firstName + ' ' + user.lastName,
          phone: customer.phone || user.phone
        });
      }
      
      // Send confirmation email
      try {
        await sendEmail(
          user.email,
          'Welcome to Money Minds - Payment Confirmed!',
          `Hello ${user.firstName},\n\nGreat news! Your payment has been processed successfully and your Money Minds ${subscription.plan} subscription is now active.\n\nYou now have full access to:\n• All premium courses and content\n• Exclusive member benefits\n• 24/7 support\n\nYour next billing date is: ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}\n\nWelcome to the Money Minds community!\n\nBest regards,\nThe Money Minds Team`
        );
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
      }

      return successResponse(res, 200, 'Payment confirmed and subscription activated', {
        subscriptionId: subscriptionId,
        status: 'active'
      }, 'paymentConfirmation');
    } else {
      return errorResponse(res, 400, 'Payment not completed successfully', {
        status: paymentIntent.status
      });
    }
  } catch (error) {
    console.error('Confirm Payment Error:', error);
    return errorResponse(res, 500, 'Failed to confirm payment', error.message);
  }
};

/**
 * Check for subscription expiry warnings and send notifications
 * This function can be called periodically (e.g., via cron job)
 */
exports.checkSubscriptionExpiryWarnings = async () => {
  try {
    console.log('🔔 [Subscription Expiry] Checking for subscriptions expiring in 3 days...');
    
    // Calculate date 3 days from now
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    threeDaysFromNow.setHours(23, 59, 59, 999); // End of day

    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
    twoDaysFromNow.setHours(0, 0, 0, 0); // Start of day

    // Find active subscriptions expiring in exactly 3 days
    const expiringSubscriptions = await Subscription.find({
      status: 'active',
      currentPeriodEnd: {
        $gte: twoDaysFromNow,
        $lte: threeDaysFromNow
      }
    });

    console.log(`🔔 [Subscription Expiry] Found ${expiringSubscriptions.length} subscriptions expiring in 3 days`);

    for (const subscription of expiringSubscriptions) {
      try {
        // Get user details
        const user = await User.findById(subscription.userId);
        if (!user) {
          console.log(`❌ [Subscription Expiry] User not found for subscription ${subscription._id}`);
          continue;
        }

        // For now, we'll use a generic campus title since subscriptions aren't necessarily tied to specific campuses
        const campusTitle = 'Money Minds';

        // Send socket notification
        await socketManager.broadcastSubscriptionExpiryWarning(subscription, user, campusTitle);

        // Send email notification
        try {
          await sendEmail(
            user.email,
            'Subscription Expiring Soon - Action Required',
            `Hello ${user.firstName},\n\nYour Money Minds ${subscription.plan} subscription is about to expire in 3 days (${new Date(subscription.currentPeriodEnd).toLocaleDateString()}).\n\nTo avoid any interruption to your service, please:\n• Check your payment method is up to date\n• Ensure sufficient funds are available\n• Contact support if you need assistance\n\nRenew now to continue enjoying all premium features and content.\n\nBest regards,\nThe Money Minds Team`
          );
          console.log(`✅ [Subscription Expiry] Notification sent to ${user.email}`);
        } catch (emailError) {
          console.error(`❌ [Subscription Expiry] Failed to send email to ${user.email}:`, emailError.message);
        }

      } catch (error) {
        console.error(`❌ [Subscription Expiry] Error processing subscription ${subscription._id}:`, error.message);
      }
    }

    console.log('✅ [Subscription Expiry] Finished checking subscription expiry warnings');
  } catch (error) {
    console.error('❌ [Subscription Expiry] Error in checkSubscriptionExpiryWarnings:', error.message);
  }
};

exports.getCurrentSubscription = async (req, res) => {
  try {
    const userId = req.userId;
    const subscription = await Subscription.findOne({
      userId: userId,
      status: { $in: ['active', 'past_due', 'incomplete'] }
    }).sort({ createdAt: -1 });

    if (!subscription) {
      return res.status(200).json({
        status: true,
        message: 'No active subscription found',
        plan: null
      });
    }

    return res.status(200).json({
      status: true,
      message: 'Current subscription retrieved',
      plan: {
        _id: subscription._id,
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        createdAt: subscription.createdAt
      }
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: 'Failed to get current subscription', error: err.message });
  }
};

// Payment Methods
exports.listPaymentMethods = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.stripeCustomerId) return successResponse(res, 200, 'No cards found', [], 'paymentMethods');
    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: 'card'
    });
    const cards = paymentMethods.data.map(pm => ({
      _id: pm.id,
      brand: pm.card.brand,
      last4: pm.card.last4,
      exp_month: pm.card.exp_month,
      exp_year: pm.card.exp_year,
      is_default: user.stripeCustomerId && user.stripeCustomerId === pm.customer && pm.id === (user.invoice_settings?.default_payment_method || null)
    }));
    return successResponse(res, 200, 'Payment methods retrieved', cards, 'paymentMethods');
  } catch (err) {
    return errorResponse(res, 500, 'Failed to list payment methods', err.message);
  }
};

exports.addPaymentMethod = async (req, res) => {
  try {
    const { paymentMethodId } = req.body;
    if (!paymentMethodId) return errorResponse(res, 400, 'paymentMethodId is required');
    const user = await User.findById(req.userId);
    await stripe.paymentMethods.attach(paymentMethodId, { customer: user.stripeCustomerId });
    await stripe.customers.update(user.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId }
    });
    return successResponse(res, 201, 'Payment method added successfully');
  } catch (err) {
    return errorResponse(res, 500, 'Failed to add payment method', err.message);
  }
};

exports.editPaymentMethod = async (req, res) => {
  try {
    const { paymentMethodId } = req.body;
    if (!paymentMethodId) return errorResponse(res, 400, 'paymentMethodId is required');
    const user = await User.findById(req.userId);
    await stripe.customers.update(user.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId }
    });
    return successResponse(res, 200, 'Default payment method updated');
  } catch (err) {
    return errorResponse(res, 500, 'Failed to update payment method', err.message);
  }
};

exports.deletePaymentMethod = async (req, res) => {
  try {
    const { paymentMethodId } = req.query;
    if (!paymentMethodId) return errorResponse(res, 400, 'paymentMethodId is required');
    await stripe.paymentMethods.detach(paymentMethodId);
    return successResponse(res, 200, 'Payment method deleted');
  } catch (err) {
    return errorResponse(res, 500, 'Failed to delete payment method', err.message);
  }
};

// Billing Info
exports.getBillingInfo = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user.stripeCustomerId) {
      return successResponse(res, 200, 'No billing info available - customer not created yet', {
        _id: null,
        name: null,
        address: null,
        city: null,
        state: null,
        zip: null,
        country: null,
        phone: null,
        createdAt: null
      }, 'billingInfo');
    }
    
    const customer = await stripe.customers.retrieve(user.stripeCustomerId);
    const billingInfo = {
      _id: customer.id,
      name: customer.name,
      address: customer.address,
      city: customer.address?.city,
      state: customer.address?.state,
      zip: customer.address?.postal_code,
      country: customer.address?.country,
      phone: customer.phone,
      createdAt: customer.created
    };
    return successResponse(res, 200, 'Billing info retrieved', billingInfo, 'billingInfo');
  } catch (err) {
    console.error('Get Billing Info Error:', err);
    return errorResponse(res, 500, 'Failed to get billing info', err.message);
  }
};

exports.editBillingInfo = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const update = req.body;
    const customer = await stripe.customers.update(user.stripeCustomerId, update);
    return successResponse(res, 200, 'Billing info updated', customer, 'billingInfo');
  } catch (err) {
    return errorResponse(res, 500, 'Failed to update billing info', err.message);
  }
};

exports.deleteBillingInfo = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const customer = await stripe.customers.update(user.stripeCustomerId, {
      address: null, name: null, phone: null
    });
    return successResponse(res, 200, 'Billing info deleted', customer, 'billingInfo');
  } catch (err) {
    return errorResponse(res, 500, 'Failed to delete billing info', err.message);
  }
}; 

/**
 * Get subscription plans from Stripe
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getSubscriptionPlans = async (req, res) => {
  try {
    console.log('🔍 [Subscription Plans] Fetching subscription plans from Stripe...');
    
    // Fetch all active prices from Stripe
    const prices = await stripe.prices.list({
      active: true,
      type: 'recurring',
      limit: 100
    });

    console.log(`📊 [Subscription Plans] Found ${prices.data.length} active recurring prices`);

    // Format the prices for frontend consumption
    const formattedPlans = [];
    
    for (const price of prices.data) {
      try {
        // Get the product details
        const product = await stripe.products.retrieve(price.product);
        
        // Only include active products
        if (!product.active) continue;
        
        // Format the plan data
        const plan = {
          id: price.id,
          productId: product.id,
          name: product.name,
          description: product.description,
          amount: price.unit_amount,
          currency: price.currency,
          interval: price.recurring.interval,
          intervalCount: price.recurring.interval_count,
          trialPeriodDays: price.recurring.trial_period_days,
          formattedAmount: (price.unit_amount / 100).toFixed(2),
          formattedInterval: price.recurring.interval === 'month' ? 'Monthly' : 
                           price.recurring.interval === 'year' ? 'Yearly' : 
                           `Every ${price.recurring.interval_count} ${price.recurring.interval}(s)`,
          metadata: product.metadata || {},
          images: product.images || [],
          features: product.features || [],
          createdAt: new Date(price.created * 1000),
          updatedAt: new Date(price.updated * 1000)
        };
        
        formattedPlans.push(plan);
      } catch (productError) {
        console.warn(`⚠️ [Subscription Plans] Could not fetch product for price ${price.id}:`, productError.message);
      }
    }

    // Sort plans by amount (ascending)
    formattedPlans.sort((a, b) => a.amount - b.amount);

    console.log(`✅ [Subscription Plans] Successfully formatted ${formattedPlans.length} subscription plans`);

    return successResponse(res, 200, 'Subscription plans retrieved successfully', {
      plans: formattedPlans,
      total: formattedPlans.length
    }, 'subscriptionPlans');

  } catch (error) {
    console.error('❌ [Subscription Plans] Error fetching subscription plans:', error.message);
    return errorResponse(res, 500, 'Failed to fetch subscription plans', error.message);
  }
};

/**
 * Get a specific subscription plan from Stripe
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getSubscriptionPlan = async (req, res) => {
  try {
    const { priceId } = req.query;
    
    if (!priceId) {
      return errorResponse(res, 400, 'Price ID is required as query parameter');
    }

    console.log(`🔍 [Subscription Plan] Fetching plan details for price ID: ${priceId}`);
    
    // Fetch the specific price from Stripe
    const price = await stripe.prices.retrieve(priceId);
    
    if (!price.active) {
      return errorResponse(res, 404, 'Subscription plan not found or inactive');
    }

    // Get the product details
    const product = await stripe.products.retrieve(price.product);
    
    if (!product.active) {
      return errorResponse(res, 404, 'Product not found or inactive');
    }

    // Format the plan data
    const plan = {
      id: price.id,
      productId: product.id,
      name: product.name,
      description: product.description,
      amount: price.unit_amount,
      currency: price.currency,
      interval: price.recurring.interval,
      intervalCount: price.recurring.interval_count,
      trialPeriodDays: price.recurring.trial_period_days,
      formattedAmount: (price.unit_amount / 100).toFixed(2),
      formattedInterval: price.recurring.interval === 'month' ? 'Monthly' : 
                       price.recurring.interval === 'year' ? 'Yearly' : 
                       `Every ${price.recurring.interval_count} ${price.recurring.interval}(s)`,
      metadata: product.metadata || {},
      images: product.images || [],
      features: product.features || [],
      createdAt: new Date(price.created * 1000),
      updatedAt: new Date(price.updated * 1000)
    };

    console.log(`✅ [Subscription Plan] Successfully retrieved plan: ${plan.name}`);

    return successResponse(res, 200, 'Subscription plan retrieved successfully', plan, 'subscriptionPlan');

  } catch (error) {
    console.error('❌ [Subscription Plan] Error fetching subscription plan:', error.message);
    
    if (error.type === 'StripeInvalidRequestError') {
      return errorResponse(res, 404, 'Subscription plan not found');
    }
    
    return errorResponse(res, 500, 'Failed to fetch subscription plan', error.message);
  }
}; 