// In-memory progress tracking for uploads
const progressStore = new Map();

const ProgressStatus = {
  UPLOADING: 'uploading',
  TRANSCODING: 'transcoding',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

class ProgressTracker {
  constructor(id, type = 'video', socketManager = null) {
    this.id = id;
    this.type = type;
    this.socketManager = socketManager;
    this.progress = {
      id: id,
      type: type,
      status: ProgressStatus.UPLOADING,
      uploadProgress: 0,
      transcodingProgress: 0,
      overallProgress: 0,
      message: 'Starting upload...',
      startTime: Date.now(),
      error: null,
      result: null
    };
    
    progressStore.set(id, this.progress);
  }

  updateUploadProgress(percentage) {
    this.progress.uploadProgress = Math.min(100, Math.max(0, percentage));
    this.progress.overallProgress = this.progress.uploadProgress * 0.3; // Upload is 30% of total
    this.progress.message = `Uploading... ${this.progress.uploadProgress.toFixed(1)}%`;
    this._updateStore();
    this._emitProgress();
  }

  startTranscoding() {
    this.progress.status = ProgressStatus.TRANSCODING;
    this.progress.uploadProgress = 100;
    this.progress.transcodingProgress = 0;
    this.progress.overallProgress = 30; // Upload complete, transcoding starts
    this.progress.message = 'Starting video transcoding...';
    this._updateStore();
    this._emitProgress();
  }

  updateTranscodingProgress(percentage) {
    this.progress.transcodingProgress = Math.min(100, Math.max(0, percentage));
    this.progress.overallProgress = 30 + (this.progress.transcodingProgress * 0.7); // Transcoding is 70% of total
    this.progress.message = `Transcoding video... ${this.progress.transcodingProgress.toFixed(1)}%`;
    this._updateStore();
    this._emitProgress();
  }

  complete(result) {
    this.progress.status = ProgressStatus.COMPLETED;
    this.progress.uploadProgress = 100;
    this.progress.transcodingProgress = 100;
    this.progress.overallProgress = 100;
    this.progress.message = 'Upload and processing completed successfully';
    this.progress.result = result;
    this.progress.endTime = Date.now();
    this._updateStore();
    this._emitProgress();

    // Clean up after 5 minutes
    setTimeout(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  fail(error) {
    this.progress.status = ProgressStatus.FAILED;
    this.progress.message = `Failed: ${error.message || error}`;
    this.progress.error = error.message || error;
    this.progress.endTime = Date.now();
    this._updateStore();
    this._emitProgress();

    // Clean up after 5 minutes
    setTimeout(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  getProgress() {
    return { ...this.progress };
  }

  cleanup() {
    progressStore.delete(this.id);
    if (this.socketManager) {
      this.socketManager.leaveRoom(this.id);
    }
  }

  _updateStore() {
    progressStore.set(this.id, { ...this.progress });
  }

  _emitProgress() {
    if (this.socketManager) {
      this.socketManager.emitToRoom(`progress_${this.id}`, 'uploadProgress', this.progress);
    }
  }
}

// Static methods for external access
const getProgress = (id) => {
  return progressStore.get(id) || null;
};

const getAllProgress = () => {
  return Array.from(progressStore.values());
};

const cleanupProgress = (id) => {
  return progressStore.delete(id);
};

module.exports = {
  ProgressTracker,
  ProgressStatus,
  getProgress,
  getAllProgress,
  cleanupProgress
}; 