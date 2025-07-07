# Fixing 502 Error for Large File Uploads (4GB+)

## 🚨 **The Problem**
You're getting a **502 Gateway Error** when uploading large files (4GB+). This happens because:

1. **Server timeouts** - Default timeouts are too short for large files
2. **Proxy timeouts** - Reverse proxy (nginx, etc.) times out
3. **Memory issues** - Server runs out of memory
4. **Connection limits** - Too many concurrent connections

## ✅ **Solutions Implemented**

### 1. **Server Configuration Updates**
- ✅ **Increased timeouts** to 2 hours for upload endpoints
- ✅ **Enhanced HTTP server** configuration
- ✅ **Better error handling** for large files
- ✅ **Optimized multer** configuration

### 2. **Upload Configuration**
- ✅ **Separate middleware** for different file types
- ✅ **Enhanced error handling** with detailed messages
- ✅ **Memory-efficient** disk storage
- ✅ **Progress tracking** with socket events

## 🔧 **Additional Steps You Need to Take**

### **Step 1: Check Your Proxy Configuration**

If you're using **nginx** as a reverse proxy, add this to your nginx config:

```nginx
# In your nginx.conf or site configuration
http {
    # Increase timeouts for large uploads
    client_max_body_size 10G;
    client_body_timeout 2h;
    client_header_timeout 2h;
    proxy_connect_timeout 2h;
    proxy_send_timeout 2h;
    proxy_read_timeout 2h;
    
    # Increase buffer sizes
    client_body_buffer_size 128k;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 4k;
    
    # Enable proxy buffering
    proxy_buffering on;
    proxy_buffer_size 4k;
    proxy_buffers 8 4k;
    proxy_busy_buffers_size 8k;
}
```

### **Step 2: Check Your Hosting Provider**

**For Azure App Service:**
```json
{
  "httpPlatform": {
    "maxRequestBodySize": "10737418240"
  }
}
```

**For Heroku:**
```bash
heroku config:set WEB_CONCURRENCY=1
heroku config:set MAX_THREADS=1
```

**For AWS/EC2:**
- Increase instance memory
- Use larger instance types for uploads

### **Step 3: Environment Variables**

Add these to your `.env` file:

```env
# Upload timeouts
UPLOAD_TIMEOUT=7200000
MAX_FILE_SIZE=10737418240

# Server configuration
NODE_OPTIONS="--max-old-space-size=4096"
```

### **Step 4: Test the Fix**

1. **Restart your server** after making changes
2. **Test with a smaller file** first (1GB)
3. **Monitor server resources** during upload
4. **Check logs** for any remaining issues

## 📊 **Monitoring Upload Progress**

The system now provides real-time progress:

```javascript
// Socket event data
{
  stage: 'uploading',
  progress: 45,
  message: 'Uploading to B2...',
  fileSize: 4294967296, // 4GB
  uploadedBytes: 1932735283,
  uploadSpeed: '25.67 MB/s',
  timeRemaining: '92s'
}
```

## 🚀 **Best Practices for Large Uploads**

### **Frontend Recommendations:**
1. **Show progress bar** with percentage
2. **Display upload speed** and ETA
3. **Allow cancellation** of uploads
4. **Resume capability** for failed uploads
5. **File validation** before upload

### **Backend Optimizations:**
1. **Stream processing** for very large files
2. **Chunked uploads** to B2
3. **Memory monitoring** during uploads
4. **Automatic cleanup** of temp files
5. **Retry logic** for failed uploads

## 🔍 **Troubleshooting**

### **Still getting 502 errors?**

1. **Check server logs** for specific error messages
2. **Monitor memory usage** during uploads
3. **Test with smaller files** first
4. **Check proxy configuration**
5. **Verify hosting provider limits**

### **Common Issues:**

**Memory Error:**
```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=8192" npm start
```

**Timeout Error:**
```javascript
// Increase timeout in your client
const timeout = 7200000; // 2 hours
```

**Connection Reset:**
```nginx
# Add to nginx config
proxy_http_version 1.1;
proxy_set_header Connection "";
```

## ✅ **Expected Results**

After implementing these fixes:

- ✅ **4GB+ uploads** should work without 502 errors
- ✅ **Real-time progress** tracking
- ✅ **Automatic retries** on failures
- ✅ **Memory-efficient** processing
- ✅ **Proper error handling** with clear messages

## 🎯 **Next Steps**

1. **Apply the server changes** (already done)
2. **Configure your proxy** (nginx, etc.)
3. **Update hosting settings** if needed
4. **Test with large files** gradually
5. **Monitor performance** and adjust as needed

The system is now optimized for large file uploads with proper error handling and progress tracking! 