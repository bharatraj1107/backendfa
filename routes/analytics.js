import express from 'express';
import Issue from '../models/Issue.js';
import Project from '../models/Project.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Apply protection to all analytics routes
router.use(protect);

// @route   GET /api/analytics/issues
// @desc    Get counts of issues by status
// @access  Private
router.get('/issues', async (req, res) => {
  try {
    const totalIssues = await Issue.countDocuments();
    const openIssues = await Issue.countDocuments({ status: 'open' });
    const inProgressIssues = await Issue.countDocuments({ status: 'in-progress' });
    const testingIssues = await Issue.countDocuments({ status: 'testing' });
    const resolvedIssues = await Issue.countDocuments({ status: 'resolved' });
    const closedIssues = await Issue.countDocuments({ status: 'closed' });

    return res.status(200).json({
      success: true,
      message: 'Issues analytics fetched successfully',
      data: {
        totalIssues,
        openIssues,
        inProgressIssues,
        testingIssues,
        resolvedIssues,
        closedIssues,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   GET /api/analytics/projects
// @desc    Get project counts and list of projects with issue counts
// @access  Private
router.get('/projects', async (req, res) => {
  try {
    const activeProjects = await Project.countDocuments({ status: 'active' });
    const completedProjects = await Project.countDocuments({ status: 'completed' });
    const archivedProjects = await Project.countDocuments({ status: 'archived' });

    const allProjects = await Project.find({}).populate('owner', 'name');
    const projectsList = [];

    for (const p of allProjects) {
      const issueCount = await Issue.countDocuments({ project: p._id });
      projectsList.push({
        projectId: p.projectId,
        title: p.title ? p.title.trim() : '',
        owner: p.owner ? p.owner.name : 'Unknown',
        status: p.status,
        issueCount,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Projects analytics fetched successfully',
      data: {
        activeProjects,
        completedProjects,
        archivedProjects,
        projects: projectsList,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   GET /api/analytics/developers
// @desc    Get developer stats and identify highest resolved developer
// @access  Private
router.get('/developers', async (req, res) => {
  try {
    const developers = await User.find({ role: 'developer' });
    const developersList = [];
    let highestResolvedDeveloper = null;
    let maxResolved = -1;

    for (const d of developers) {
      const assignedIssues = await Issue.countDocuments({ assignedTo: d._id });
      const resolvedIssues = await Issue.countDocuments({ assignedTo: d._id, status: 'resolved' });

      developersList.push({
        userId: d.userId,
        name: d.name,
        assignedIssues,
        resolvedIssues,
      });

      if (resolvedIssues > maxResolved) {
        maxResolved = resolvedIssues;
        highestResolvedDeveloper = {
          userId: d.userId,
          name: d.name,
          resolvedIssues,
        };
      }
    }

    // Fallback if no developers found or no issues resolved
    if (developersList.length > 0 && maxResolved <= 0) {
      highestResolvedDeveloper = {
        userId: developersList[0].userId,
        name: developersList[0].name,
        resolvedIssues: 0,
      };
    }

    return res.status(200).json({
      success: true,
      message: 'Developer analytics fetched successfully',
      data: {
        highestResolvedDeveloper,
        developers: developersList,
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
