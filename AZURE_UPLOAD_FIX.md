# Azure Video Upload Fix Guide

This guide explains how to fix the "socket hang up" error when uploading videos to your Azure App Service deployment.

## 🔍 Problem Analysis

The video uploads work locally but fail on Azure with "socket hang up" errors due to:

1. **Azure App Service timeout limitations**
2. **Missing Redis configuration for upload queue**
3. **Temp directory access issues**
4. **Request size and timeout limits**
5. **Missing environment variables**

## ✅ Solutions Implemented

### 1. Web.config for Azure App Service
- Created `web.config` with proper IIS configurations
- Set 10GB file upload limits
- Configured 2-hour timeouts
- Added security headers

### 2. Fallback Upload System
- Modified video upload to fallback to direct upload when queue is unavailable
- Added Redis connectivity checks
- Graceful handling of missing Redis instance

### 3. Azure-Compatible Temp Directories
- Updated temp directory handling for Azure App Service
- Uses system temp directories when project temp is unavailable
- Automatic directory creation with fallbacks

### 4. Improved Error Handling
- Better error logging for Azure environment
- Timeout protection for uploads
- Connection status monitoring

## 🚀 Deployment Steps

### Step 1: Deploy Updated Code
Make sure these files are deployed to Azure:
- `web.config` (new file)
- Updated `controllers/upload.js`
- Updated `utils/uploadQueue.js`
- `scripts/azure-diagnostics.js` (for debugging)

### Step 2: Configure Environment Variables
Add these in Azure App Service → Configuration → Application Settings:

**Required Variables:**
```
NODE_ENV=production
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
B2_KEY_ID=your_b2_key_id
B2_APPLICATION_KEY=your_b2_application_key
B2_BUCKET_ID=your_b2_bucket_id
B2_BUCKET_NAME=your_b2_bucket_name
AZURE_CDN_URL=your_azure_cdn_url
```

**Optional (for queue system):**
```
REDIS_HOST=your_redis_host
REDIS_PORT=6380
REDIS_PASSWORD=your_redis_password
```

### Step 3: Set Up Redis (Optional but Recommended)
1. Create Azure Cache for Redis instance
2. Add Redis connection details to environment variables
3. Queue system will be used when available, otherwise direct uploads

### Step 4: Configure App Service Plan
For large file uploads, ensure your App Service plan has:
- At least B1 (Basic) tier or higher
- Sufficient memory (2GB+ recommended)
- Always On enabled

## 🔧 Testing & Debugging

### Run Diagnostics Script
```bash
# In Azure Console or via deployment
node scripts/azure-diagnostics.js
```

This will check:
- Environment variables
- File system permissions
- Database connectivity
- Redis availability
- B2 storage connection

### Monitor Logs
Enable Application Logging in Azure:
1. Go to App Service → Monitoring → App Service Logs
2. Enable Application Logging (Filesystem)
3. Set level to Information or Verbose
4. Check logs during upload attempts

### Test Upload Endpoints

**Small file test (direct):**
```
POST /api/upload/video?type=film
Headers: Authorization: Bearer {your_token}
Body: form-data with 'video' field
```

**Check upload behavior:**
- Small files (<1MB): Should work with direct upload
- Large files: Will use direct upload (no queue on Azure without Redis)
- Monitor console logs for fallback messages

## 🔍 Troubleshooting

### Common Issues:

**1. Still getting "socket hang up":**
- Check if `web.config` is deployed
- Verify timeout settings in Azure App Service
- Ensure file isn't larger than 10GB

**2. "Upload temp directory does not exist":**
- System will now use OS temp directory automatically
- Check file system permissions in Azure console

**3. "Queue system unavailable" messages:**
- This is normal without Redis
- System will fallback to direct uploads
- Consider setting up Azure Redis Cache for better performance

**4. B2 upload failures:**
- Verify B2 credentials in environment variables
- Check B2 bucket permissions
- Test B2 connection using diagnostic script

### Environment-Specific Behavior:

**Local Development:**
- Uses project temp directories
- Queue system works with local Redis
- Full feature set available

**Azure (without Redis):**
- Uses OS temp directories
- Direct uploads only (no queue)
- Still supports large files up to 10GB

**Azure (with Redis):**
- Full queue system available
- Better upload progress tracking
- Recommended for production

## 📊 Performance Recommendations

### For Better Upload Performance:
1. **Scale Up**: Use Standard (S1) or Premium App Service plans
2. **Enable Redis**: Set up Azure Cache for Redis for queue system
3. **CDN**: Ensure AZURE_CDN_URL is configured for fast file serving
4. **Monitoring**: Enable Application Insights for better error tracking

### Expected Behavior After Fix:
- Small videos (<1MB): Should upload successfully
- Large videos: Should upload with progress tracking
- Fallback system handles Redis unavailability gracefully
- Better error messages for debugging

## 🔄 Next Steps

1. Deploy the updated code
2. Configure environment variables in Azure
3. Run the diagnostics script
4. Test with small files first
5. Gradually test with larger files
6. Set up Redis for production use
7. Monitor logs and performance

The system is now resilient and should handle Azure's limitations while maintaining upload functionality. The fallback mechanism ensures uploads work even without the full queue system.
