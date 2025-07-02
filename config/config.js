const fs = require('fs');
const path = require('path');

// Load environment variables from UTF-16 LE encoded .env file
function loadEnvUTF16() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    
    if (fs.existsSync(envPath)) {
      // Read file with UTF-16 LE encoding
      const content = fs.readFileSync(envPath, 'utf16le');
      
      // Split content into lines and process each line
      const lines = content.split('\n');
      lines.forEach(line => {
        // Remove BOM if present
        line = line.replace(/^\uFEFF/, '');
        
        // Skip empty lines and comments
        if (!line || line.trim().startsWith('#')) {
          return;
        }
        
        // Parse key-value pairs
        const equalIndex = line.indexOf('=');
        if (equalIndex > 0) {
          const key = line.substring(0, equalIndex).trim();
          let value = line.substring(equalIndex + 1).trim();
          
          // Remove quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          
          // Set environment variable if not already set
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      });
      
      console.log('Environment variables loaded from .env (UTF-16 LE)');
    }
  } catch (error) {
    console.error('Error loading UTF-16 LE environment file:', error.message);
  }
}

// Load environment variables before exporting config
loadEnvUTF16();

module.exports = {
    PORT: process.env.PORT || 5000,
    MONGO_URI: process.env.MONGO_URI,
    NODE_ENV: process.env.NODE_ENV || 'development',
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET
  };
  