import { validationResult } from 'express-validator';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { callAIService } from '../utils/aiService.js';

export const markAttendance = async (req, res) => {
  try {
    console.log('Mark attendance request received');
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { frames, probeImage, date } = req.body;
    const userId = req.user._id;
    
    console.log(`Processing attendance for user ${userId}, frames: ${frames?.length}, date: ${date}`);

    // Check if user is enrolled
    const user = await User.findById(userId);
    if (!user.isEnrolled || user.faceEmbeddings.length === 0) {
      console.log('User not enrolled');
      return res.status(400).json({ error: 'User not enrolled. Please complete face enrollment first.' });
    }

    // Check if attendance already marked for today
    const existingAttendance = await Attendance.findOne({ userId, date });
    if (existingAttendance) {
      console.log('Attendance already marked for date:', date);
      return res.status(400).json({ 
        error: `Attendance already marked for ${date}. You can only mark attendance once per day.`,
        attendance: existingAttendance
      });
    }

    console.log('Calling AI service for face recognition...');
    // Call AI service for liveness detection and face matching
    const aiResult = await callAIService('/match-with-liveness', {
      frames,
      probeImage,
      userEmbeddings: user.faceEmbeddings.map(e => e.embedding),
      userId: userId.toString(),
      userInfo: {
        name: user.name,
        email: user.email,
        rollNo: user.rollNo
      }
    });

    console.log('AI service result:', aiResult);
    
    if (!aiResult.success) {
      console.log('AI service failed:', aiResult.error);
      return res.status(400).json({ 
        error: 'Face recognition failed',
        details: aiResult.error
      });
    }

    // Check liveness
    if (!aiResult.livenessResult.isLive) {
      console.log('Liveness detection failed:', aiResult.livenessResult);
      return res.status(400).json({ 
        error: 'Liveness detection failed. Please ensure you blink and move your head as instructed.',
        details: aiResult.livenessResult,
        livenessScore: aiResult.livenessResult.score
      });
    }

    // Check face match - CRITICAL SECURITY CHECK
    // This ensures only the logged-in user can mark their own attendance
    if (!aiResult.matchResult.isMatch) {
      console.log('Face match failed:', aiResult.matchResult);
      return res.status(400).json({ 
        error: `Face recognition failed. The captured face does not match ${user.name}'s enrolled images. Please ensure you are the correct user.`,
        confidence: aiResult.matchResult.confidence,
        threshold: process.env.FACE_MATCH_THRESHOLD || 0.6,
        userInfo: {
          expectedUser: user.name,
          rollNo: user.rollNo
        }
      });
    }

    // Additional security check - ensure confidence is high enough
    if (aiResult.matchResult.confidence < 0.6) {
      console.log('Face match confidence too low:', aiResult.matchResult.confidence);
      return res.status(400).json({ 
        error: `Face recognition confidence too low (${(aiResult.matchResult.confidence * 100).toFixed(1)}%). Please ensure good lighting and face the camera directly.`,
        confidence: aiResult.matchResult.confidence,
        minRequired: 0.6,
        userInfo: {
          expectedUser: user.name,
          rollNo: user.rollNo
        }
      });
    }

    console.log('Creating attendance record...');
    // Create attendance record
    const attendance = new Attendance({
      userId,
      date,
      status: 'present',
      method: 'face_recognition',
      confidence: aiResult.matchResult.confidence,
      livenessScore: aiResult.livenessResult.score
    });

    await attendance.save();

    // Populate user data
    await attendance.populate('userId', 'name email rollNo');

    console.log('Attendance marked successfully');
    res.json({
      message: 'Attendance marked successfully',
      attendance,
      confidence: aiResult.matchResult.confidence,
      livenessScore: aiResult.livenessResult.score
    });
  } catch (error) {
    console.error('Mark attendance error:', error);
    res.status(500).json({ error: 'Failed to mark attendance' });
  }
};

export const getAttendance = async (req, res) => {
  try {
    const userId = req.params.userId || req.user._id;
    
    // Check if user is requesting their own data or is faculty
    if (userId !== req.user._id.toString() && req.user.role !== 'faculty') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const skip = (page - 1) * limit;

    const attendanceRecords = await Attendance
      .find({ userId })
      .populate('userId', 'name email rollNo')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    const totalRecords = await Attendance.countDocuments({ userId });
    const totalPages = Math.ceil(totalRecords / limit);

    // Calculate attendance statistics
    const stats = await Attendance.aggregate([
      { $match: { userId: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const attendanceStats = {
      total: totalRecords,
      present: stats.find(s => s._id === 'present')?.count || 0,
      absent: stats.find(s => s._id === 'absent')?.count || 0,
      late: stats.find(s => s._id === 'late')?.count || 0
    };

    res.json({
      attendance: attendanceRecords,
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      stats: attendanceStats
    });
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ error: 'Failed to get attendance' });
  }
};

export const getAllAttendance = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const date = req.query.date;

    let query = {};
    if (date) {
      query.date = date;
    }

    const attendanceRecords = await Attendance
      .find(query)
      .populate('userId', 'name email rollNo')
      .sort({ date: -1, markedAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalRecords = await Attendance.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limit);

    res.json({
      attendance: attendanceRecords,
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get all attendance error:', error);
    res.status(500).json({ error: 'Failed to get attendance records' });
  }
};