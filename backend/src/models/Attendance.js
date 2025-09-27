import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: String,
    required: true,
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format']
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'late'],
    default: 'present'
  },
  markedAt: {
    type: Date,
    default: Date.now
  },
  method: {
    type: String,
    enum: ['face_recognition', 'manual'],
    default: 'face_recognition'
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1
  },
  livenessScore: {
    type: Number,
    min: 0,
    max: 1
  },
  location: {
    type: String,
    default: 'classroom'
  }
}, {
  timestamps: true
});

// Create compound index for user and date to prevent duplicate attendance
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.model('Attendance', attendanceSchema);