import express from 'express';
import mongoose from 'mongoose';
import Project from '../models/Project.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Apply protection to all project routes
router.use(protect);

// Helper to resolve User ID (either ObjectId or userId string) to ObjectId
const resolveUserId = async (idOrUserId) => {
  if (!idOrUserId) return null;
  
  // Try resolving as MongoDB ObjectId
  if (mongoose.Types.ObjectId.isValid(idOrUserId)) {
    const user = await User.findById(idOrUserId);
    if (user) return user._id;
  }
  
  // Try resolving as custom userId string (e.g. USR0001)
  const user = await User.findOne({ userId: idOrUserId });
  return user ? user._id : null;
};

// Helper to resolve array of User IDs
const resolveUserIds = async (idsOrUserIds) => {
  if (!idsOrUserIds || !Array.isArray(idsOrUserIds)) return [];
  const resolved = [];
  for (const item of idsOrUserIds) {
    const objectId = await resolveUserId(item);
    if (objectId) {
      resolved.push(objectId);
    }
  }
  return resolved;
};

// @route   POST /api/projects
// @desc    Create a project
// @access  Private
router.post('/', async (req, res) => {
  try {
    const { title, category, description, owner, members, status, startDate } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Project title is required',
      });
    }

    // Resolve owner
    let resolvedOwner = req.user._id; // default to logged-in user
    if (owner) {
      const ownerId = await resolveUserId(owner);
      if (!ownerId) {
        return res.status(400).json({
          success: false,
          message: `Owner user "${owner}" not found`,
        });
      }
      resolvedOwner = ownerId;
    }

    // Resolve members
    const resolvedMembers = await resolveUserIds(members);

    const project = await Project.create({
      title: title.trim(),
      category,
      description,
      owner: resolvedOwner,
      members: resolvedMembers,
      status: status || 'active',
      startDate,
    });

    // Populate owner and members
    const populated = await Project.findById(project._id)
      .populate('owner', '_id userId name email role')
      .populate('members', '_id userId name email role');

    return res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: populated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   GET /api/projects
// @desc    List all projects with filters and pagination
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { status, category, owner, search, page = 1, limit = 10 } = req.query;
    const filter = {};

    if (status) {
      filter.status = status;
    }

    if (category) {
      filter.category = category;
    }

    // Filter by owner name (regex search)
    if (owner) {
      const users = await User.find({ name: { $regex: owner, $options: 'i' } });
      const userIds = users.map((u) => u._id);
      filter.owner = { $in: userIds };
    }

    // Search in title or description
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    // Parse pagination parameters
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skipNum = (pageNum - 1) * limitNum;

    const total = await Project.countDocuments(filter);
    const totalPages = Math.ceil(total / limitNum);

    const projects = await Project.find(filter)
      .populate('owner', '_id userId name email role')
      .populate('members', '_id userId name email role')
      .skip(skipNum)
      .limit(limitNum);

    return res.status(200).json({
      success: true,
      message: 'Projects fetched successfully',
      page: pageNum,
      limit: limitNum,
      total,
      totalPages,
      data: projects,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   GET /api/projects/:projectId
// @desc    Get project by custom projectId (e.g. PROJ1)
// @access  Private
router.get('/:projectId', async (req, res) => {
  try {
    const project = await Project.findOne({ projectId: req.params.projectId })
      .populate('owner', '_id userId name email role')
      .populate('members', '_id userId name email role');

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Project fetched successfully',
      data: project,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   PATCH /api/projects/:projectId
// @desc    Update project by custom projectId
// @access  Private
router.patch('/:projectId', async (req, res) => {
  try {
    const project = await Project.findOne({ projectId: req.params.projectId });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    const updates = { ...req.body };

    // Resolve owner if updated
    if (updates.owner) {
      const ownerId = await resolveUserId(updates.owner);
      if (!ownerId) {
        return res.status(400).json({
          success: false,
          message: `Owner user "${updates.owner}" not found`,
        });
      }
      updates.owner = ownerId;
    }

    // Resolve members if updated
    if (updates.members) {
      updates.members = await resolveUserIds(updates.members);
    }

    // Perform update
    const updatedProject = await Project.findOneAndUpdate(
      { projectId: req.params.projectId },
      { $set: updates },
      { new: true, runValidators: true }
    )
      .populate('owner', '_id userId name email role')
      .populate('members', '_id userId name email role');

    return res.status(200).json({
      success: true,
      message: 'Project updated successfully',
      data: updatedProject,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   DELETE /api/projects/:projectId
// @desc    Delete project by custom projectId
// @access  Private
router.delete('/:projectId', async (req, res) => {
  try {
    const project = await Project.findOneAndDelete({ projectId: req.params.projectId });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
