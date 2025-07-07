# Backblaze B2 Setup Guide

## 🚀 Quick Setup

### 1. Create .env file
Create a `.env` file in your project root with your B2 credentials:

```env
# Backblaze B2 Configuration
B2_KEY_ID=your_key_id_here
B2_APPLICATION_KEY=your_application_key_here
B2_BUCKET_ID=your_bucket_id_here
B2_BUCKET_NAME=your_bucket_name_here
B2_REGION=us-east-005
```

### 2. Get B2 Credentials

#### Step 1: Log into Backblaze B2 Console
- Go to: https://secure.backblaze.com/app_keys.htm
- Sign in to your Backblaze account

#### Step 2: Create Application Key
1. Click "Add a New Application Key"
2. Give it a name (e.g., "Money Minds Upload")
3. Select your bucket from the dropdown
4. Set permissions to "Read and Write"
5. Click "Create New Key"
6. **Copy both the `keyId` and `applicationKey`**

#### Step 3: Get Bucket Information
1. Go to your B2 bucket in the console
2. Copy the `bucketId` from the bucket details
3. Note your `bucketName`

### 3. Test Configuration
Run the test script to verify your setup:

```bash
node scripts/test-b2-config.js
```

## ✅ What Happens When B2 is Configured

### Automatic Chunking
- **B2 handles chunking automatically** for files larger than 5MB
- **No manual chunking needed** - B2 does it internally
- **Progress tracking** every second with speed and ETA
- **Retry logic** with exponential backoff

### Upload Features
- ✅ **Large file support** (up to 10GB)
- ✅ **Progress tracking** with real-time updates
- ✅ **Speed calculation** (MB/s)
- ✅ **Time remaining** estimation
- ✅ **Automatic retry** on failures
- ✅ **Socket events** for frontend updates

### File Size Limits
- **Images**: 10MB limit
- **Videos**: 10GB limit  
- **Files**: 1GB limit
- **Global server**: 10GB limit

## 🔧 Troubleshooting

### "Invalid accountId or applicationKeyId"
- Check your `B2_KEY_ID` and `B2_APPLICATION_KEY`
- Verify the credentials are correct
- Ensure your B2 account is active

### "B2_BUCKET_ID not configured"
- Set your bucket ID in the `.env` file
- Get it from your B2 bucket settings

### Upload fails
- Check bucket permissions
- Verify bucket supports large files
- Ensure application key has write access

## 📊 Progress Tracking

The system provides real-time progress updates:

```javascript
{
  stage: 'uploading',
  progress: 75, // percentage
  completedChunks: 3,
  totalChunks: 4,
  currentChunk: 3,
  message: 'Uploading to B2...',
  fileSize: 20971520,
  uploadedBytes: 15728640,
  uploadSpeed: '38.17 MB/s',
  timeRemaining: '1s'
}
```

## 🎯 Next Steps

1. **Set up your .env file** with B2 credentials
2. **Test the configuration** with the provided script
3. **Try uploading files** through your API endpoints
4. **Monitor progress** via socket events in your frontend

The system will automatically use B2's built-in chunking for optimal performance! 