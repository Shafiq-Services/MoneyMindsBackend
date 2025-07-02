require('./config/config');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function validateStripeEnvironment() {
  console.log('🔍 Validating Stripe Environment Variables...\n');
  
  const results = {
    valid: [],
    invalid: []
  };

  // 1. Check STRIPE_SECRET_KEY
  console.log('1️⃣ Checking STRIPE_SECRET_KEY...');
  if (!process.env.STRIPE_SECRET_KEY) {
    results.invalid.push('STRIPE_SECRET_KEY: Not set');
  } else if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
    results.invalid.push('STRIPE_SECRET_KEY: Not a test key (should start with sk_test_)');
  } else {
    try {
      // Test the key by making a simple API call
      const account = await stripe.accounts.retrieve();
      results.valid.push('STRIPE_SECRET_KEY: Valid test key');
    } catch (error) {
      results.invalid.push(`STRIPE_SECRET_KEY: ${error.message}`);
    }
  }

  // 2. Check STRIPE_PUBLISHABLE_KEY
  console.log('2️⃣ Checking STRIPE_PUBLISHABLE_KEY...');
  if (!process.env.STRIPE_PUBLISHABLE_KEY) {
    results.invalid.push('STRIPE_PUBLISHABLE_KEY: Not set');
  } else if (!process.env.STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_')) {
    results.invalid.push('STRIPE_PUBLISHABLE_KEY: Not a test key (should start with pk_test_)');
  } else {
    results.valid.push('STRIPE_PUBLISHABLE_KEY: Valid test key format');
  }

  // 3. Check MONTHLY_PRICE_ID
  console.log('3️⃣ Checking MONTHLY_PRICE_ID...');
  if (!process.env.MONTHLY_PRICE_ID) {
    results.invalid.push('MONTHLY_PRICE_ID: Not set');
  } else {
    try {
      const price = await stripe.prices.retrieve(process.env.MONTHLY_PRICE_ID);
      results.valid.push(`MONTHLY_PRICE_ID: Valid (${price.nickname || 'No nickname'})`);
    } catch (error) {
      results.invalid.push(`MONTHLY_PRICE_ID: ${error.message}`);
    }
  }

  // 4. Check YEARLY_PRICE_ID
  console.log('4️⃣ Checking YEARLY_PRICE_ID...');
  if (!process.env.YEARLY_PRICE_ID) {
    results.invalid.push('YEARLY_PRICE_ID: Not set');
  } else {
    try {
      const price = await stripe.prices.retrieve(process.env.YEARLY_PRICE_ID);
      results.valid.push(`YEARLY_PRICE_ID: Valid (${price.nickname || 'No nickname'})`);
    } catch (error) {
      results.invalid.push(`YEARLY_PRICE_ID: ${error.message}`);
    }
  }

  // 5. Check STRIPE_WEBHOOK_SECRET
  console.log('5️⃣ Checking STRIPE_WEBHOOK_SECRET...');
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    results.invalid.push('STRIPE_WEBHOOK_SECRET: Not set');
  } else if (!process.env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) {
    results.invalid.push('STRIPE_WEBHOOK_SECRET: Invalid format (should start with whsec_)');
  } else {
    results.valid.push('STRIPE_WEBHOOK_SECRET: Valid format');
  }

  // 6. Check PRODUCT IDs if they exist
  console.log('6️⃣ Checking PRODUCT IDs...');
  if (process.env.MONTHLY_PRODUCT_ID) {
    try {
      const product = await stripe.products.retrieve(process.env.MONTHLY_PRODUCT_ID);
      results.valid.push(`MONTHLY_PRODUCT_ID: Valid (${product.name})`);
    } catch (error) {
      results.invalid.push(`MONTHLY_PRODUCT_ID: ${error.message}`);
    }
  }

  if (process.env.YEARLY_PRODUCT_ID) {
    try {
      const product = await stripe.products.retrieve(process.env.YEARLY_PRODUCT_ID);
      results.valid.push(`YEARLY_PRODUCT_ID: Valid (${product.name})`);
    } catch (error) {
      results.invalid.push(`YEARLY_PRODUCT_ID: ${error.message}`);
    }
  }

  // Print results
  console.log('\n📊 VALIDATION RESULTS:');
  console.log('✅ VALID:');
  results.valid.forEach(item => console.log(`   ${item}`));
  
  if (results.invalid.length > 0) {
    console.log('\n❌ INVALID:');
    results.invalid.forEach(item => console.log(`   ${item}`));
  }

  console.log(`\n🎯 Summary: ${results.valid.length} valid, ${results.invalid.length} invalid`);
  
  if (results.invalid.length > 0) {
    console.log('\n💡 To fix invalid items:');
    console.log('   1. Go to Stripe Dashboard');
    console.log('   2. Switch to "Test mode" (top right toggle)');
    console.log('   3. Update the invalid keys in your .env file');
    process.exit(1);
  } else {
    console.log('\n🎉 All Stripe environment variables are valid!');
  }
}

validateStripeEnvironment(); 