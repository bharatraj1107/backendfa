import express from 'express';
import mongoose from 'mongoose';
import Comment from '../models/Comment.js';
import Issue from '../models/Issue.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Apply protection to all comment routes
router.use(protect);

// Helper to resolve User ID (either ObjectId or userId string) to ObjectId
const resolveUserId = async (idOrUserId) => {
  if (!idOrUserId) return null;
  if (mongoose.Types.ObjectId.isValid(idOrUserId)) {
    const user = await User.findById(idOrUserId);
    if (user) return user._id;
  }
  const user = await User.findOne({ userId: idOrUserId });
  return user ? user._id : null;
};

// Helper to resolve Issue ID (either ObjectId or issueId string) to ObjectId
const resolveIssueId = async (idOrIssueId) => {
  if (!idOrIssueId) return null;
  if (mongoose.Types.ObjectId.isValid(idOrIssueId)) {
    const issue = await Issue.findById(idOrIssueId);
    if (issue) return issue._id;
  }
  const issue = await Issue.findOne({ issueId: idOrIssueId });
  return issue ? issue._id : null;
};

// @route   POST /api/comments
// @desc    Create a comment (returns raw ObjectId references)
// @access  Private
router.post('/', async (req, res) => {
  try {
    const { issue, user, message } = req.body;

    if (!issue || !message) {
      return res.status(400).json({
        success: false,
        message: 'Issue and message are required',
      });
    }

    // Resolve issue
    const resolvedIssue = await resolveIssueId(issue);
    if (!resolvedIssue) {
      return res.status(400).json({
        success: false,
        message: `Issue "${issue}" not found`,
      });
    }

    // Resolve user (default to current user)
    let resolvedUser = req.user._id;
    if (user) {
      const userId = await resolveUserId(user);
      if (userId) {
        resolvedUser = userId;
      }
    }

    const comment = await Comment.create({
      issue: resolvedIssue,
      user: resolvedUser,
      message,
    });

    // Return RAW fields (not populated)
    return res.status(201).json({
      success: true,
      message: 'Comment created successfully',
      data: {
        _id: comment._id,
        commentId: comment.commentId,
        issue: comment.issue.toString(),
        user: comment.user.toString(),
        message: comment.message,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   GET /api/comments
// @desc    List comments with optional filters and pagination (populated)
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { issueId, search, page = 1, limit = 10 } = req.query;
    const filter = {};

    // Filter by issue (convert issueId like ISS1001 to ObjectId)
    if (issueId) {
      const issueObjId = await resolveIssueId(issueId);
      if (issueObjId) {
        filter.issue = issueObjId;
      } else {
        // If issue does not exist, return empty array immediately
        return res.status(200).json({
          success: true,
          message: 'Comments fetched successfully',
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total: 0,
          totalPages: 0,
          data: [],
        });
      }
    }

    // Filter by search term in message
    if (search) {
      filter.message = { $regex: search, $options: 'i' };
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skipNum = (pageNum - 1) * limitNum;

    const total = await Comment.countDocuments(filter);
    const totalPages = Math.ceil(total / limitNum);

    const comments = await Comment.find(filter)
      .populate('issue', '_id issueId title')
      .populate('user', '_id userId name email')
      .skip(skipNum)
      .limit(limitNum);

    return res.status(200).json({
      success: true,
      message: 'Comments fetched successfully',
      page: pageNum,
      limit: limitNum,
      total,
      totalPages,
      data: comments,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   GET /api/comments/:commentId
// @desc    Get comment by custom commentId (populated)
// @access  Private
router.get('/:commentId', async (req, res) => {
  try {
    const comment = await Comment.findOne({ commentId: req.params.commentId })
      .populate('issue', '_id issueId title')
      .populate('user', '_id userId name email');

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Comment fetched successfully',
      data: comment,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   DELETE /api/comments/:commentId
// @desc    Delete comment by custom commentId
// @access  Private
router.delete('/:commentId', async (req, res) => {
  try {
    const comment = await Comment.findOneAndDelete({ commentId: req.params.commentId });

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Comment deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
