#!/usr/bin/env node

/**
 * Cleanup Unfinished Uploads Script
 * 
 * This script helps manage and cleanup unfinished large file uploads in Backblaze B2.
 * It can list, analyze, and clean up orphaned upload sessions.
 * 
 * Usage:
 *   node scripts/cleanup-unfinished-uploads.js [options]
 * 
 * Options:
 *   --list                  List all unfinished uploads
 *   --cleanup-older=hours   Cleanup uploads older than X hours (default: 24)
 *   --force                 Skip confirmation prompts
 *   --dry-run              Show what would be cleaned up without actually doing it
 * 
 * Examples:
 *   node scripts/cleanup-unfinished-uploads.js --list
 *   node scripts/cleanup-unfinished-uploads.js --cleanup-older=48 --dry-run
 *   node scripts/cleanup-unfinished-uploads.js --cleanup-older=24 --force
 */

const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { 
  listUnfinishedUploads, 
  cancelLargeFileUpload,
  authorize 
} = require('../utils/chunkedUpload');

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    list: false,
    cleanupOlder: null,
    force: false,
    dryRun: false,
    help: false
  };
  
  for (const arg of args) {
    if (arg === '--list') {
      options.list = true;
    } else if (arg.startsWith('--cleanup-older=')) {
      options.cleanupOlder = parseInt(arg.split('=')[1]);
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }
  
  return options;
}

/**
 * Display help information
 */
function showHelp() {
  console.log(`
🧹 Cleanup Unfinished Uploads Script

This script helps manage and cleanup unfinished large file uploads in Backblaze B2.

Usage:
  node scripts/cleanup-unfinished-uploads.js [options]

Options:
  --list                  List all unfinished uploads
  --cleanup-older=hours   Cleanup uploads older than X hours (default: 24)
  --force                 Skip confirmation prompts
  --dry-run              Show what would be cleaned up without actually doing it
  --help, -h             Show this help message

Examples:
  node scripts/cleanup-unfinished-uploads.js --list
  node scripts/cleanup-unfinished-uploads.js --cleanup-older=48 --dry-run
  node scripts/cleanup-unfinished-uploads.js --cleanup-older=24 --force

Environment Variables Required:
  B2_KEY_ID              Backblaze B2 Application Key ID
  B2_APPLICATION_KEY     Backblaze B2 Application Key
  B2_BUCKET_ID          Backblaze B2 Bucket ID
`);
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
  if (!bytes || bytes === 'Unknown') return 'Unknown';
  
  const sizes = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < sizes.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(1)} ${sizes[i]}`;
}

/**
 * Format duration for display
 */
function formatDuration(hours) {
  if (hours < 1) {
    return `${Math.round(hours * 60)} minutes`;
  } else if (hours < 24) {
    return `${Math.round(hours)} hours`;
  } else {
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return `${days} days, ${remainingHours} hours`;
  }
}

/**
 * List all unfinished uploads
 */
async function listUnfinishedFiles() {
  try {
    console.log('📋 Listing unfinished large file uploads...\n');
    
    const unfinishedFiles = await listUnfinishedUploads();
    
    if (unfinishedFiles.length === 0) {
      console.log('✅ No unfinished uploads found!');
      return;
    }
    
    console.log(`📋 Found ${unfinishedFiles.length} unfinished uploads:\n`);
    
    // Sort by upload timestamp (oldest first)
    unfinishedFiles.sort((a, b) => a.uploadTimestamp - b.uploadTimestamp);
    
    let totalSize = 0;
    
    unfinishedFiles.forEach((file, index) => {
      const ageHours = (Date.now() - file.uploadTimestamp) / (1000 * 60 * 60);
      const uploadDate = new Date(file.uploadTimestamp).toISOString().slice(0, 19).replace('T', ' ');
      const fileSize = file.fileInfo?.file_size || 'Unknown';
      
      if (typeof fileSize === 'number') {
        totalSize += fileSize;
      }
      
      console.log(`${index + 1}. File ID: ${file.fileId}`);
      console.log(`   Name: ${file.fileName || 'Unknown'}`);
      console.log(`   Size: ${formatFileSize(fileSize)}`);
      console.log(`   Started: ${uploadDate}`);
      console.log(`   Age: ${formatDuration(ageHours)}`);
      console.log(`   Content Type: ${file.contentType || 'Unknown'}`);
      console.log('');
    });
    
    console.log(`📊 Total: ${unfinishedFiles.length} files, estimated ${formatFileSize(totalSize)} storage usage`);
    
  } catch (error) {
    console.error('❌ Failed to list unfinished uploads:', error.message);
    process.exit(1);
  }
}

/**
 * Cleanup old unfinished uploads
 */
async function cleanupOldFiles(olderThanHours, force = false, dryRun = false) {
  try {
    console.log(`🧹 ${dryRun ? 'Analyzing' : 'Cleaning up'} uploads older than ${olderThanHours} hours...\n`);
    
    const unfinishedFiles = await listUnfinishedUploads();
    const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
    
    const filesToCleanup = unfinishedFiles.filter(file => file.uploadTimestamp < cutoffTime);
    
    if (filesToCleanup.length === 0) {
      console.log(`✅ No uploads older than ${olderThanHours} hours found.`);
      console.log(`📋 Total unfinished uploads: ${unfinishedFiles.length}`);
      return;
    }
    
    console.log(`📋 Found ${filesToCleanup.length} uploads to ${dryRun ? 'analyze' : 'cleanup'}:`);
    console.log(`📋 Total unfinished uploads: ${unfinishedFiles.length}`);
    console.log('');
    
    // Show details of files to be cleaned
    let totalSize = 0;
    filesToCleanup.forEach((file, index) => {
      const ageHours = (Date.now() - file.uploadTimestamp) / (1000 * 60 * 60);
      const uploadDate = new Date(file.uploadTimestamp).toISOString().slice(0, 19).replace('T', ' ');
      const fileSize = file.fileInfo?.file_size || 'Unknown';
      
      if (typeof fileSize === 'number') {
        totalSize += fileSize;
      }
      
      console.log(`${index + 1}. ${file.fileName || 'Unknown'}`);
      console.log(`   File ID: ${file.fileId}`);
      console.log(`   Size: ${formatFileSize(fileSize)}`);
      console.log(`   Age: ${formatDuration(ageHours)}`);
      console.log('');
    });
    
    console.log(`📊 Total to ${dryRun ? 'analyze' : 'cleanup'}: ${filesToCleanup.length} files, estimated ${formatFileSize(totalSize)} storage`);
    
    if (dryRun) {
      console.log('\n🔍 This was a dry run. Use --force to actually cleanup these uploads.');
      return;
    }
    
    // Confirmation prompt
    if (!force) {
      console.log('\n⚠️  This action cannot be undone!');
      console.log('Are you sure you want to cleanup these uploads? (y/N)');
      
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise(resolve => {
        rl.question('', resolve);
      });
      
      rl.close();
      
      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log('❌ Cleanup canceled');
        return;
      }
    }
    
    // Perform cleanup
    console.log('\n🧹 Starting cleanup...');
    
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };
    
    // Clean up files in batches to avoid overwhelming the API
    const BATCH_SIZE = 5;
    for (let i = 0; i < filesToCleanup.length; i += BATCH_SIZE) {
      const batch = filesToCleanup.slice(i, i + BATCH_SIZE);
      
      console.log(`📤 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(filesToCleanup.length / BATCH_SIZE)}...`);
      
      const promises = batch.map(async (file) => {
        try {
          await cancelLargeFileUpload(file.fileId);
          results.success++;
          console.log(`✅ Cleaned: ${file.fileName || file.fileId}`);
        } catch (error) {
          results.failed++;
          results.errors.push({
            fileId: file.fileId,
            fileName: file.fileName,
            error: error.message
          });
          console.error(`❌ Failed: ${file.fileName || file.fileId} - ${error.message}`);
        }
      });
      
      await Promise.all(promises);
      
      // Small delay between batches
      if (i + BATCH_SIZE < filesToCleanup.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log('\n📊 Cleanup Results:');
    console.log(`✅ Successfully cleaned: ${results.success}`);
    console.log(`❌ Failed to clean: ${results.failed}`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ Errors:');
      results.errors.forEach(error => {
        console.log(`   ${error.fileName || error.fileId}: ${error.error}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs();
  
  if (options.help) {
    showHelp();
    return;
  }
  
  // Validate environment variables
  if (!process.env.B2_KEY_ID || !process.env.B2_APPLICATION_KEY || !process.env.B2_BUCKET_ID) {
    console.error('❌ Missing required environment variables:');
    console.error('   B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_ID');
    console.error('   Please check your .env file');
    process.exit(1);
  }
  
  try {
    // Test B2 authorization
    console.log('🔐 Authorizing with Backblaze B2...');
    await authorize();
    console.log('✅ Authorization successful\n');
    
    if (options.list) {
      await listUnfinishedFiles();
    } else if (options.cleanupOlder !== null) {
      await cleanupOldFiles(options.cleanupOlder, options.force, options.dryRun);
    } else {
      // Default behavior: list files
      await listUnfinishedFiles();
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = {
  listUnfinishedFiles,
  cleanupOldFiles,
  parseArgs,
  showHelp
}; 