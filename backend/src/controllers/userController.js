import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import User from '../models/User.js';
import { callAIService } from '../utils/aiService.js';

export const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { name, email, password, role, rollNo } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Create new user
    const user = new User({
      name,
      email,
      passwordHash: password,
      role: role || 'student',
      rollNo: role === 'student' ? rollNo : undefined
    });

    await user.save();

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      user: user.toJSON(),
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

export const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      user: user.toJSON(),
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

export const enrollFace = async (req, res) => {
  try {
    const { images } = req.body;
    const userId = req.user._id;

    if (!images || !Array.isArray(images) || images.length < 3) {
      return res.status(400).json({ error: 'At least 3 images required for enrollment' });
    }

    if (images.length > 5) {
      return res.status(400).json({ error: 'Maximum 5 images allowed for enrollment' });
    }

    // Call AI service to process images and extract embeddings
    const embeddings = [];
    for (let i = 0; i < images.length; i++) {
      try {
        const result = await callAIService('/enroll', {
          image: images[i],
          imageId: `${userId}_${i}_${Date.now()}`
        });
        
        if (result.success && result.embedding) {
          embeddings.push({
            embedding: result.embedding,
            imageId: result.imageId,
            enrolledAt: new Date()
          });
        } else {
          return res.status(400).json({ 
            error: `Failed to process image ${i + 1}: ${result.error || 'Unknown error'}` 
          });
        }
      } catch (error) {
        return res.status(400).json({ 
          error: `Failed to process image ${i + 1}: ${error.message}` 
        });
      }
    }

    // Update user with embeddings
    const user = await User.findById(userId);
    user.faceEmbeddings = embeddings;
    user.isEnrolled = true;
    user.enrolledAt = new Date();
    await user.save();

    res.json({
      message: 'Face enrollment successful',
      embeddingsCount: embeddings.length,
      enrolledAt: user.enrolledAt
    });
  } catch (error) {
    console.error('Face enrollment error:', error);
    res.status(500).json({ error: 'Face enrollment failed' });
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({
      user: user.toJSON(),
      isEnrolled: user.isEnrolled,
      embeddingsCount: user.faceEmbeddings.length
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
};