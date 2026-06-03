import express from 'express';
import mongoose from 'mongoose';
import Issue from '../models/Issue.js';
import Project from '../models/Project.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Apply protection to all issue routes
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

// Helper to resolve Project ID (either ObjectId or projectId string) to ObjectId
const resolveProjectId = async (idOrProjectId) => {
  if (!idOrProjectId) return null;
  if (mongoose.Types.ObjectId.isValid(idOrProjectId)) {
    const proj = await Project.findById(idOrProjectId);
    if (proj) return proj._id;
  }
  const proj = await Project.findOne({ projectId: idOrProjectId });
  return proj ? proj._id : null;
};

// @route   POST /api/issues
// @desc    Create an issue
// @access  Private
router.post('/', async (req, res) => {
  try {
    const { title, description, project, assignedTo, reportedBy, priority, severity, status, type, tags } = req.body;

    if (!title || !project) {
      return res.status(400).json({
        success: false,
        message: 'Title and project are required',
      });
    }

    // Resolve project
    const resolvedProject = await resolveProjectId(project);
    if (!resolvedProject) {
      return res.status(400).json({
        success: false,
        message: `Project "${project}" not found`,
      });
    }

    // Resolve assignedTo
    let resolvedAssigned = null;
    if (assignedTo) {
      resolvedAssigned = await resolveUserId(assignedTo);
    }

    // Resolve reportedBy (default to current user)
    let resolvedReported = req.user._id;
    if (reportedBy) {
      const reportedId = await resolveUserId(reportedBy);
      if (reportedId) {
        resolvedReported = reportedId;
      }
    }

    const issue = await Issue.create({
      title,
      description,
      project: resolvedProject,
      assignedTo: resolvedAssigned,
      reportedBy: resolvedReported,
      priority,
      severity,
      status,
      type,
      tags,
    });

    // Populate the new issue
    const populated = await Issue.findById(issue._id)
      .populate('project', '_id projectId title status')
      .populate('assignedTo', '_id userId name email role')
      .populate('reportedBy', '_id userId name email');

    return res.status(201).json({
      success: true,
      message: 'Issue created successfully',
      data: populated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   GET /api/issues
// @desc    List issues with filters and pagination
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { status, priority, severity, search, page = 1, limit = 10 } = req.query;
    const filter = {};

    if (status) {
      filter.status = status;
    }

    if (priority) {
      filter.priority = priority;
    }

    if (severity) {
      filter.severity = severity;
    }

    // Regex search on title or description
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skipNum = (pageNum - 1) * limitNum;

    const total = await Issue.countDocuments(filter);
    const totalPages = Math.ceil(total / limitNum);

    const issues = await Issue.find(filter)
      .populate('project', '_id projectId title status')
      .populate('assignedTo', '_id userId name email role')
      .populate('reportedBy', '_id userId name email')
      .skip(skipNum)
      .limit(limitNum);

    return res.status(200).json({
      success: true,
      message: 'Issues fetched successfully',
      page: pageNum,
      limit: limitNum,
      total,
      totalPages,
      data: issues,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   GET /api/issues/:issueId
// @desc    Get issue by custom issueId
// @access  Private
router.get('/:issueId', async (req, res) => {
  try {
    const issue = await Issue.findOne({ issueId: req.params.issueId })
      .populate('project', '_id projectId title status')
      .populate('assignedTo', '_id userId name email role')
      .populate('reportedBy', '_id userId name email');

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Issue fetched successfully',
      data: issue,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   PATCH /api/issues/:issueId
// @desc    Update issue by custom issueId
// @access  Private
router.patch('/:issueId', async (req, res) => {
  try {
    const issue = await Issue.findOne({ issueId: req.params.issueId });

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found',
      });
    }

    const updates = { ...req.body };

    // Resolve references if provided
    if (updates.project) {
      const projId = await resolveProjectId(updates.project);
      if (!projId) {
        return res.status(400).json({
          success: false,
          message: `Project "${updates.project}" not found`,
        });
      }
      updates.project = projId;
    }

    if (updates.assignedTo !== undefined) {
      if (updates.assignedTo === null || updates.assignedTo === '') {
        updates.assignedTo = null;
      } else {
        const assignedId = await resolveUserId(updates.assignedTo);
        if (!assignedId) {
          return res.status(400).json({
            success: false,
            message: `User "${updates.assignedTo}" not found`,
          });
        }
        updates.assignedTo = assignedId;
      }
    }

    if (updates.reportedBy) {
      const reportedId = await resolveUserId(updates.reportedBy);
      if (!reportedId) {
        return res.status(400).json({
          success: false,
          message: `Reporter user "${updates.reportedBy}" not found`,
        });
      }
      updates.reportedBy = reportedId;
    }

    const updatedIssue = await Issue.findOneAndUpdate(
      { issueId: req.params.issueId },
      { $set: updates },
      { new: true, runValidators: true }
    )
      .populate('project', '_id projectId title status')
      .populate('assignedTo', '_id userId name email role')
      .populate('reportedBy', '_id userId name email');

    return res.status(200).json({
      success: true,
      message: 'Issue updated successfully',
      data: updatedIssue,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   DELETE /api/issues/:issueId
// @desc    Delete issue by custom issueId
// @access  Private
router.delete('/:issueId', async (req, res) => {
  try {
    const issue = await Issue.findOneAndDelete({ issueId: req.params.issueId });

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Issue deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   PATCH /api/issues/:issueId/assign
// @desc    Assign user to issue by custom issueId
// @access  Private
router.patch('/:issueId/assign', async (req, res) => {
  try {
    const { assignedTo } = req.body;
    const issue = await Issue.findOne({ issueId: req.params.issueId });

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found',
      });
    }

    let resolvedAssigned = null;
    if (assignedTo) {
      resolvedAssigned = await resolveUserId(assignedTo);
      if (!resolvedAssigned) {
        return res.status(404).json({
          success: false,
          message: 'User to assign not found',
        });
      }
    }

    issue.assignedTo = resolvedAssigned;
    await issue.save();

    const populated = await Issue.findById(issue._id)
      .populate('project', '_id projectId title status')
      .populate('assignedTo', '_id userId name email role')
      .populate('reportedBy', '_id userId name email');

    return res.status(200).json({
      success: true,
      message: 'Issue assigned successfully',
      data: populated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   PATCH /api/issues/:issueId/status
// @desc    Update status of issue by custom issueId
// @access  Private
router.patch('/:issueId/status', async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required',
      });
    }

    const issue = await Issue.findOne({ issueId: req.params.issueId });

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found',
      });
    }

    const previousStatus = issue.status;
    issue.status = status;
    await issue.save();

    return res.status(200).json({
      success: true,
      message: 'Issue status updated successfully',
      data: {
        issueId: issue.issueId,
        previousStatus,
        newStatus: issue.status,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
