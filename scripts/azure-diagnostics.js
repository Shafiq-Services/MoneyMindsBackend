#!/usr/bin/env node

/**
 * Azure Diagnostics Script
 * Run this script to check Azure App Service configuration and connectivity
 * Usage: node scripts/azure-diagnostics.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🔍 Azure App Service Diagnostics\n');

// Check if running on Azure
const isAzure = process.env.WEBSITE_SITE_NAME || process.env.WEBSITE_RESOURCE_GROUP;
console.log(`🌐 Environment: ${isAzure ? 'Azure App Service' : 'Local Development'}`);

if (isAzure) {
  console.log(`📍 Site Name: ${process.env.WEBSITE_SITE_NAME}`);
  console.log(`📍 Resource Group: ${process.env.WEBSITE_RESOURCE_GROUP}`);
  console.log(`📍 App URL: https://${process.env.WEBSITE_HOSTNAME}`);
}

console.log('\n📋 Environment Variables Check:');

// Required environment variables
const requiredVars = [
  'NODE_ENV',
  'PORT',
  'MONGO_URI',
  'JWT_SECRET',
  'B2_KEY_ID',
  'B2_APPLICATION_KEY', 
  'B2_BUCKET_ID',
  'B2_BUCKET_NAME',
  'AZURE_CDN_URL'
];

// Optional but recommended
const optionalVars = [
  'REDIS_HOST',
  'AZURE_REDIS_HOST',
  'REDIS_PASSWORD',
  'AZURE_REDIS_PASSWORD',
  'STRIPE_SECRET_KEY',
  'SENDGRID_API_KEY'
];

let missingRequired = [];
let missingOptional = [];

console.log('\n✅ Required Variables:');
requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    // Show partial value for security
    const displayValue = value.length > 20 
      ? `${value.substring(0, 10)}...${value.substring(value.length - 5)}`
      : `${value.substring(0, 8)}...`;
    console.log(`  ✅ ${varName}: ${displayValue}`);
  } else {
    console.log(`  ❌ ${varName}: NOT SET`);
    missingRequired.push(varName);
  }
});

console.log('\n⚠️ Optional Variables:');
optionalVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    const displayValue = value.length > 20 
      ? `${value.substring(0, 10)}...${value.substring(value.length - 5)}`
      : `${value.substring(0, 8)}...`;
    console.log(`  ✅ ${varName}: ${displayValue}`);
  } else {
    console.log(`  ⚠️ ${varName}: NOT SET`);
    missingOptional.push(varName);
  }
});

// File system checks
console.log('\n📁 File System Checks:');

const tempDir = process.env.TEMP || process.env.TMP || path.join(__dirname, '../temp');
console.log(`📂 Temp Directory: ${tempDir}`);

try {
  if (fs.existsSync(tempDir)) {
    const stats = fs.statSync(tempDir);
    console.log(`  ✅ Exists: ${stats.isDirectory() ? 'Directory' : 'File'}`);
    
    // Test write permissions
    const testFile = path.join(tempDir, 'write-test.txt');
    try {
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      console.log('  ✅ Write permissions: OK');
    } catch (writeError) {
      console.log('  ❌ Write permissions: FAILED -', writeError.message);
    }
  } else {
    console.log('  ⚠️ Does not exist, will attempt to create');
    try {
      fs.mkdirSync(tempDir, { recursive: true });
      console.log('  ✅ Created successfully');
    } catch (createError) {
      console.log('  ❌ Creation failed:', createError.message);
    }
  }
} catch (error) {
  console.log('  ❌ Access error:', error.message);
}

// System information
console.log('\n💻 System Information:');
console.log(`  OS: ${os.type()} ${os.release()}`);
console.log(`  Platform: ${os.platform()}`);
console.log(`  Architecture: ${os.arch()}`);
console.log(`  Node Version: ${process.version}`);
console.log(`  Memory: ${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB total, ${Math.round(os.freemem() / 1024 / 1024 / 1024)}GB free`);
console.log(`  CPU Cores: ${os.cpus().length}`);

// Azure specific checks
if (isAzure) {
  console.log('\n🌐 Azure App Service Information:');
  console.log(`  Instance ID: ${process.env.WEBSITE_INSTANCE_ID || 'Not available'}`);
  console.log(`  SCM Type: ${process.env.SCM_TYPE || 'Not available'}`);
  console.log(`  Home Directory: ${process.env.HOME || 'Not available'}`);
  console.log(`  Site Directory: ${process.env.WEBSITE_SITE_NAME ? `/home/site/wwwroot` : 'Not available'}`);
}

// Connection tests
console.log('\n🔌 Connection Tests:');

// Test MongoDB connection
if (process.env.MONGO_URI) {
  console.log('📊 Testing MongoDB connection...');
  try {
    const mongoose = require('mongoose');
    mongoose.connect(process.env.MONGO_URI, { 
      useNewUrlParser: true, 
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000
    }).then(() => {
      console.log('  ✅ MongoDB: Connected successfully');
      mongoose.disconnect();
    }).catch(error => {
      console.log('  ❌ MongoDB: Connection failed -', error.message);
    });
  } catch (error) {
    console.log('  ❌ MongoDB: Test failed -', error.message);
  }
} else {
  console.log('  ⚠️ MongoDB: Skipping (MONGO_URI not set)');
}

// Test Redis connection if configured
const redisHost = process.env.REDIS_HOST || process.env.AZURE_REDIS_HOST;
if (redisHost) {
  console.log('🔴 Testing Redis connection...');
  try {
    const redis = require('redis');
    const redisPort = process.env.REDIS_PORT || process.env.AZURE_REDIS_PORT || 6379;
    const redisPassword = process.env.REDIS_PASSWORD || process.env.AZURE_REDIS_PASSWORD;
    
    const client = redis.createClient({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      connect_timeout: 5000
    });
    
    client.on('connect', () => {
      console.log('  ✅ Redis: Connected successfully');
      client.quit();
    });
    
    client.on('error', (error) => {
      console.log('  ❌ Redis: Connection failed -', error.message);
    });
  } catch (error) {
    console.log('  ❌ Redis: Test failed -', error.message);
  }
} else {
  console.log('  ⚠️ Redis: Skipping (No Redis host configured)');
}

// Test B2 connection
if (process.env.B2_KEY_ID && process.env.B2_APPLICATION_KEY) {
  console.log('☁️ Testing Backblaze B2 connection...');
  try {
    const { testB2Connection } = require('../utils/b2OfficialMultithreaded');
    testB2Connection().then(success => {
      if (success) {
        console.log('  ✅ B2: Connection successful');
      } else {
        console.log('  ❌ B2: Connection failed');
      }
    }).catch(error => {
      console.log('  ❌ B2: Test failed -', error.message);
    });
  } catch (error) {
    console.log('  ❌ B2: Test failed -', error.message);
  }
} else {
  console.log('  ⚠️ B2: Skipping (Credentials not set)');
}

// Summary
console.log('\n📊 Summary:');
if (missingRequired.length > 0) {
  console.log(`❌ Missing ${missingRequired.length} required environment variables:`);
  missingRequired.forEach(varName => console.log(`   - ${varName}`));
}

if (missingOptional.length > 0) {
  console.log(`⚠️ Missing ${missingOptional.length} optional environment variables:`);
  missingOptional.forEach(varName => console.log(`   - ${varName}`));
}

if (missingRequired.length === 0) {
  console.log('✅ All required environment variables are set');
}

console.log('\n🚀 Recommendations for Azure:');
console.log('1. Set up Azure Redis Cache if you want to use queued uploads');
console.log('2. Ensure all environment variables are configured in Azure App Service Configuration');
console.log('3. Check that the web.config file is properly deployed');
console.log('4. Monitor logs during upload attempts to identify specific failures');
console.log('5. Consider scaling up the App Service plan for better performance with large files');

console.log('\n📝 Next Steps:');
console.log('- Run this script on your local machine: node scripts/azure-diagnostics.js');
console.log('- Run this script on Azure via console or deployment logs');
console.log('- Compare the outputs to identify discrepancies');
console.log('- Configure missing environment variables in Azure App Service');

process.exit(0);
