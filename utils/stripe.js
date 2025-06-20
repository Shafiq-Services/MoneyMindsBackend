const { stripeSecretKey } = require('../config/config');
const stripe = require('stripe')(stripeSecretKey);

module.exports = stripe; 