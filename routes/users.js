import express from 'express';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Apply protection to all user routes
router.use(protect);

// @route   GET /api/users
// @desc    Get all users with total count
// @access  Private
router.get('/', async (req, res) => {
  try {
    const count = await User.countDocuments();
    const users = await User.find({}).select('-password');

    return res.status(200).json({
      success: true,
      message: 'Users fetched successfully',
      total: count,
      data: users,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   GET /api/users/:userId
// @desc    Get user by custom userId (e.g. USR1001)
// @access  Private
router.get('/:userId', async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId }).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'User fetched successfully',
      data: user,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
