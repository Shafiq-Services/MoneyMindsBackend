# Enhanced Upload System Guide

## 🚀 Overview

The enhanced upload system has been completely rebuilt to support modern Backblaze B2 best practices for large file uploads, including 4K videos and files up to 5GB+. The system now provides:

- **Resumable uploads** using B2's large file API
- **Parallel part uploads** for improved speed
- **Automatic retry logic** with exponential backoff
- **Progress tracking** with real-time statistics
- **Intelligent file size handling** (small vs large files)
- **Unfinished upload management** and cleanup

## 🎯 Key Features

### 1. Smart File Size Handling
- **Small files (<100MB)**: Uses B2's regular upload API
- **Large files (≥100MB)**: Uses B2's large file API with multipart uploads
- **Automatic detection**: No manual configuration needed

### 2. Resumable Uploads
- **Resume capability**: Failed uploads can be resumed from where they left off
- **Part tracking**: Uses `b2_list_parts` to identify completed parts
- **State preservation**: Upload state is maintained across retry attempts

### 3. Parallel Processing
- **Concurrent parts**: Uploads up to 3 parts simultaneously for optimal speed
- **Batch processing**: Manages parallel uploads in controlled batches
- **Resource optimization**: Prevents overwhelming network connections

### 4. Enhanced Error Handling
- **DNS resolution**: Special handling for network connectivity issues
- **URL refresh**: Gets fresh upload URLs for each retry attempt
- **Exponential backoff**: Smart retry timing to avoid rate limits
- **Cleanup on failure**: Automatically cancels unfinished uploads when appropriate

## 📋 API Endpoints

### Upload Endpoints
- `POST /api/upload/image` - Image upload (enhanced with large file support)
- `POST /api/upload/video` - Video upload (optimized for 4K and large files)
- `POST /api/upload/file` - General file upload

### Management Endpoints
- `GET /api/upload/unfinished` - List unfinished large file uploads
- `DELETE /api/upload/unfinished/:fileId` - Cancel specific unfinished upload
- `POST /api/upload/cleanup` - Bulk cleanup of old unfinished uploads

## 🔧 Configuration

### Environment Variables
The system requires these B2 credentials in your `.env` file:

```env
# Backblaze B2 Configuration
B2_KEY_ID=your_key_id_here
B2_APPLICATION_KEY=your_application_key_here
B2_BUCKET_ID=your_bucket_id_here
B2_BUCKET_NAME=your_bucket_name_here
B2_REGION=us-east-005
```

### Upload Limits
- **Images**: 10MB limit
- **Videos**: 10GB limit (optimized for 4K content)
- **General files**: 1GB limit
- **Part size**: 100MB (optimal for most connections)

## 📤 How It Works

### Small File Upload Process
```
1. File received → 2. Size check → 3. B2 upload → 4. Success response
```

### Large File Upload Process
```
1. File received → 2. Start large file upload → 3. Split into parts → 
4. Upload parts in parallel → 5. List existing parts (if resume) → 
6. Complete large file → 7. Success response
```

### Resume Process
```
1. Upload fails → 2. Save state (fileId, completed parts) → 
3. Retry attempt → 4. List existing parts → 5. Upload remaining parts → 
6. Complete upload
```

## 🛠️ Management & Cleanup

### Manual Cleanup Script
Use the provided script to manage unfinished uploads:

```bash
# List all unfinished uploads
node scripts/cleanup-unfinished-uploads.js --list

# Dry run cleanup (see what would be cleaned)
node scripts/cleanup-unfinished-uploads.js --cleanup-older=24 --dry-run

# Cleanup uploads older than 48 hours
node scripts/cleanup-unfinished-uploads.js --cleanup-older=48 --force
```

### API-based Cleanup
```javascript
// List unfinished uploads
GET /api/upload/unfinished

// Cleanup old uploads (older than 24 hours)
POST /api/upload/cleanup
{
  "olderThanHours": 24
}

// Cancel specific upload
DELETE /api/upload/unfinished/4_z123456789abcdef
```

## 📊 Progress Tracking

The system provides detailed progress information via WebSocket events:

```javascript
{
  uploadType: 'video',
  uploadId: 'unique-upload-id',
  stage: 'uploading',
  progress: 75,
  completedChunks: 15,
  totalChunks: 20,
  currentChunk: 16,
  message: 'Uploading large file: 75% (15/20 parts)',
  fileSize: 2147483648,
  uploadedBytes: 1610612736,
  uploadSpeed: '25.5 MB/s',
  timeRemaining: '2m 30s'
}
```

## 🚨 Error Handling

### DNS Resolution Issues
When DNS errors occur (e.g., `getaddrinfo ENOTFOUND`), the system:
1. Provides detailed error information
2. Suggests troubleshooting steps
3. Attempts to list unfinished uploads for cleanup
4. Preserves upload state for manual resume

### Network Timeouts
- **Authorization retries**: Up to 3 attempts with exponential backoff
- **Part upload retries**: Up to 3 attempts per part with fresh URLs
- **Global upload retries**: Up to 3 full upload attempts with resume

### Memory Management
- **Streaming reads**: Files are read in chunks to avoid memory issues
- **Part-by-part processing**: No full file loading for large files
- **Garbage collection**: Temporary files and buffers are cleaned up promptly

## 🎬 Video Upload Optimization

### 4K Video Support
- **Large file API**: Automatically used for files >100MB
- **Optimal part size**: 100MB parts for efficient transfer
- **Parallel uploads**: Up to 3 concurrent parts
- **Progress tracking**: Real-time progress with time estimates

### Transcoding Integration
After successful upload, videos are automatically:
1. Transcoded to multiple resolutions (720p, 1080p, 4K)
2. Converted to HLS format for streaming
3. Generated with adaptive bitrate playlists

## 🔍 Troubleshooting

### Common Issues

#### DNS Resolution Errors
```
Error: getaddrinfo ENOTFOUND pod-050-1008-06.backblaze.com
```
**Solutions:**
1. Check internet connection
2. Verify DNS settings
3. Try again after a few minutes
4. Check Backblaze B2 status

#### Upload Stalls
**Causes:**
- Network interruption
- Server overload
- Large file timeout

**Solutions:**
1. Check unfinished uploads: `GET /api/upload/unfinished`
2. Resume or cleanup: Use management endpoints
3. Retry with smaller part sizes (if customizing)

#### Memory Issues
**Symptoms:**
- Server crashes during large uploads
- Out of memory errors

**Solutions:**
1. Check file reading logic (should be streaming)
2. Verify part size configuration
3. Monitor server resources during uploads

### Debug Information

Enable detailed logging by checking console output for:
- 🔐 Authorization attempts
- 📤 Upload progress
- 🔄 Retry attempts
- 📋 Part tracking
- ✅ Success confirmations
- ❌ Error details

## 📈 Performance Optimization

### Best Practices
1. **Use wired connections** for large uploads when possible
2. **Monitor upload speed** and adjust part size if needed
3. **Clean up unfinished uploads** regularly to save storage costs
4. **Use batch uploads** for multiple files rather than sequential

### Monitoring
- Track upload success rates
- Monitor unfinished upload counts
- Review retry attempt patterns
- Analyze upload speed trends

## 🔮 Future Enhancements

Potential improvements being considered:
- **Dynamic part size adjustment** based on connection speed
- **Client-side direct upload** for bypassing server limits
- **Upload queuing system** for high-volume scenarios
- **Advanced resume capabilities** with partial part recovery
- **Compression optimization** for specific file types

## 📞 Support

For issues with the enhanced upload system:
1. Check the troubleshooting section above
2. Review server logs for detailed error information
3. Use the cleanup script to manage unfinished uploads
4. Test with smaller files to isolate issues

Remember: The system is designed to be resilient and self-healing, so most issues will resolve automatically with the built-in retry and resume capabilities. 