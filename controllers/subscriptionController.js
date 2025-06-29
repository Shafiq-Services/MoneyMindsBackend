const stripe = require('../utils/stripe');
const User = require('../models/user');
const Subscription = require('../models/subscription');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { stripeWebhookSecret } = require('../config/config');
const sendEmail = require('../utils/sendEmail');

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
    const { paymentMethod, plan } = req.body;
    
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
        payment_method: paymentMethod,
        invoice_settings: { default_payment_method: paymentMethod },
      });
      stripeCustomerId = customer.id;
      user.stripeCustomerId = stripeCustomerId;
      await user.save();
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
    return successResponse(res, 201, 'Subscription created successfully', {
      subscriptionId: subscription.id,
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
      plan: plan
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