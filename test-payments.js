require('./config/config');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function testPaymentSystem() {
  try {
    console.log('🚀 Testing Payment System...\n');
    
    // Check environment variables
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY not set');
    }
    if (!process.env.MONTHLY_PRICE_ID) {
      throw new Error('MONTHLY_PRICE_ID not set');
    }
    
    console.log('✅ Environment variables loaded');
    console.log('📋 Using price ID:', process.env.MONTHLY_PRICE_ID);
    
    // Create test customer
    console.log('🔄 Creating test customer...');
    const customer = await stripe.customers.create({
      email: 'test@example.com',
      name: 'Test User'
    });
    console.log('✅ Customer created:', customer.id);
    
    // Create payment method with test card
    console.log('🔄 Creating payment method...');
    const paymentMethod = await stripe.paymentMethods.create({
      type: 'card',
      card: {
        number: '4242424242424242',
        exp_month: 12,
        exp_year: 2025,
        cvc: '123',
      },
    });
    console.log('✅ Payment method created:', paymentMethod.id);
    
    // Attach payment method to customer
    console.log('🔄 Attaching payment method to customer...');
    await stripe.paymentMethods.attach(paymentMethod.id, {
      customer: customer.id,
    });
    console.log('✅ Payment method attached');
    
    // Set as default payment method
    await stripe.customers.update(customer.id, {
      invoice_settings: {
        default_payment_method: paymentMethod.id,
      },
    });
    console.log('✅ Set as default payment method');
    
    // Create test subscription
    console.log('🔄 Creating test subscription...');
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: process.env.MONTHLY_PRICE_ID }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    });
    console.log('✅ Subscription created:', subscription.id);
    
    // Clean up
    console.log('🔄 Cleaning up...');
    await stripe.subscriptions.del(subscription.id);
    await stripe.paymentMethods.detach(paymentMethod.id);
    await stripe.customers.del(customer.id);
    console.log('✅ Cleanup completed');
    
    console.log('\n🎉 Payment system test successful!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.type) {
      console.error('Error type:', error.type);
    }
  }
}

testPaymentSystem(); 