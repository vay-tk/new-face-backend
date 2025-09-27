import express from 'express';
import { body } from 'express-validator';
import { markAttendance, getAttendance, getAllAttendance } from '../controllers/attendanceController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Validation middleware
const markAttendanceValidation = [
  body('frames')
    .isArray({ min: 6, max: 12 })
    .withMessage('Frames array must contain 6-12 images'),
  body('probeImage')
    .notEmpty()
    .withMessage('Probe image is required'),
  body('date')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Date must be in YYYY-MM-DD format')
];

// Routes
router.post('/mark', authenticate, markAttendanceValidation, markAttendance);
router.get('/user/:userId?', authenticate, getAttendance);
router.get('/all', authenticate, authorize(['faculty']), getAllAttendance);

export default router;