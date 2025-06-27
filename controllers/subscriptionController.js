const stripe = require('../utils/stripe');
const User = require('../models/user');
const Subscription = require('../models/subscription');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { stripeWebhookSecret } = require('../config/config');

// Hardcoded for now, you should manage this in a more dynamic way (e.g., from a 'Product' model)
const PRICE_ID = 'price_...'; // REPLACE WITH YOUR STRIPE PRICE ID

/**
 * Create a new subscription
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.createSubscription = async (req, res) => {
  try {
    // Authenticated user only
    const userId = req.userId;
    const { paymentMethod } = req.body;
    if (!paymentMethod) return errorResponse(res, 400, 'Payment method is required');
    const user = await User.findById(userId);
    if (!user) return errorResponse(res, 404, 'User not found');
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
      items: [{ price: PRICE_ID }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });
    // Save subscription details to your database
    const newSubscription = new Subscription({
      userId: user._id,
      provider: 'stripe',
      plan: 'monthly', // This should be dynamic based on the PRICE_ID
      status: 'active', // This will be updated by webhooks
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      metadata: { stripeSubscriptionId: subscription.id }
    });
    await newSubscription.save();
    // Return clientSecret for Stripe.js
    return successResponse(res, 201, 'Subscription created successfully', {
      subscriptionId: subscription.id,
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
    }, 'subscription');
  } catch (error) {
    console.error('Stripe Error:', error);
    return errorResponse(res, 500, 'Internal Server Error', error.message);
  }
};

/**
 * Handle Stripe webhook events
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

  // Handle the event
  switch (event.type) {
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      // If the invoice has a subscription ID, it's a recurring payment
      if (invoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const dbSubscription = await Subscription.findOne({ 'metadata.stripeSubscriptionId': subscription.id });
        if (dbSubscription) {
          dbSubscription.status = 'active';
          dbSubscription.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
          await dbSubscription.save();
          console.log('Subscription updated successfully for successful payment.');
        }
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const stripeCustomerId = invoice.customer;
      
      const user = await User.findOne({ stripeCustomerId: stripeCustomerId });
      const dbSubscription = await Subscription.findOne({ 'metadata.stripeSubscriptionId': invoice.subscription });

      if (dbSubscription) {
        dbSubscription.status = 'past_due';
        await dbSubscription.save();
      }

      if (user) {
        // You can use your sendEmail utility here
        await sendEmail(user.email, 'Payment Failed', 'Your recent payment failed...');
        console.log(`Payment failed for user: ${user.email}. Notifying user.`);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const dbSubscription = await Subscription.findOne({ 'metadata.stripeSubscriptionId': subscription.id });
      if (dbSubscription) {
        dbSubscription.status = 'canceled';
        await dbSubscription.save();
        console.log(`Subscription ${subscription.id} marked as canceled in DB.`);
      }
      break;
    }

    // ... handle other event types
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  return successResponse(res, 200, 'Webhook received');
}; 