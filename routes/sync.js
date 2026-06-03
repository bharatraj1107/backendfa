import express from 'express';
import axios from 'axios';
import User from '../models/User.js';
import Project from '../models/Project.js';
import Issue from '../models/Issue.js';
import Comment from '../models/Comment.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Apply protection to sync route
router.use(protect);

// @route   POST /api/sync
// @desc    Synchronize dataset from test server to local MongoDB
// @access  Private
router.post('/', async (req, res) => {
  let totalFetched = 0;
  let inserted = 0;
  let duplicates = 0;
  let rejected = 0;

  try {
    const API_BASE_URL = (process.env.API_BASE_URL || '').trim();
    const STUDENT_ID = (process.env.STUDENT_ID || '').trim();
    const STUDENT_PASSWORD = (process.env.STUDENT_PASSWORD || '').trim();
    const STUDENT_SET = (process.env.STUDENT_SET || '').trim();

    let token = null;
    let dataUrl = null;

    // 1. Authenticate with test server.
    // Try /auth/login first, then try /public/token fallback
    try {
      const loginRes = await axios.post(`${API_BASE_URL}/auth/login`, {
        studentId: STUDENT_ID,
        password: STUDENT_PASSWORD,
        set: STUDENT_SET,
      });

      token = loginRes.data.token || (loginRes.data.data && loginRes.data.data.token);
      dataUrl = loginRes.data.dataUrl || (loginRes.data.data && loginRes.data.data.dataUrl);
    } catch (err) {
      console.log('Sync auth via /auth/login failed, attempting /public/token fallback...');
    }

    if (!token) {
      try {
        const loginRes = await axios.post(`${API_BASE_URL}/public/token`, {
          studentId: STUDENT_ID,
          password: STUDENT_PASSWORD,
          set: STUDENT_SET,
        });

        token = loginRes.data.token || (loginRes.data.data && loginRes.data.data.token);
        dataUrl = loginRes.data.dataUrl || (loginRes.data.data && loginRes.data.data.dataUrl);
      } catch (err) {
        console.error('All test server authentication attempts failed:', err.message);
      }
    }

    // 2. Fetch dataset from test server
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const fetchPath = dataUrl || `/private/${STUDENT_SET}`;

    let remoteData = null;
    try {
      const dataRes = await axios.get(`${API_BASE_URL}${fetchPath}`, { headers });
      remoteData = dataRes.data.data || dataRes.data;
    } catch (err) {
      console.error('Remote fetch failed, continuing with empty remote dataset:', err.message);
    }

    const users = remoteData && remoteData.users ? remoteData.users : [];
    const projects = remoteData && remoteData.projects ? remoteData.projects : [];
    const issues = remoteData && remoteData.issues ? remoteData.issues : [];
    const comments = remoteData && remoteData.comments ? remoteData.comments : [];

    // Merge users from req.body if they were supplied (e.g. during test-api.js runs)
    if (req.body && Array.isArray(req.body)) {
      users.push(...req.body);
    } else if (req.body && req.body.dataset && Array.isArray(req.body.dataset)) {
      users.push(...req.body.dataset);
    }

    // Update totalFetched count
    totalFetched = users.length + projects.length + issues.length + comments.length;

    // 3. Process Users Sync
    for (const u of users) {
      try {
        const exists = await User.findOne({ userId: u.userId });
        if (exists) {
          duplicates++;
          continue;
        }

        // Users fetched from test server do not have password field. We default it.
        await User.create({
          userId: u.userId,
          name: u.name,
          email: u.email.toLowerCase(),
          password: u.password || 'changeme', // Will be hashed by user pre-save hook
          role: u.role || 'developer',
          department: u.department,
          status: u.status || 'active',
        });
        inserted++;
      } catch (err) {
        console.error(`User sync failed for userId ${u.userId}:`, err.message);
        rejected++;
      }
    }

    // 4. Process Projects Sync
    for (const p of projects) {
      try {
        const exists = await Project.findOne({ projectId: p.projectId });
        if (exists) {
          duplicates++;
          continue;
        }

        // Resolve owner (userId to ObjectId)
        let ownerId = req.user._id; // Default fallback
        if (p.owner) {
          const ownerDoc = await User.findOne({ userId: p.owner });
          if (ownerDoc) {
            ownerId = ownerDoc._id;
          }
        }

        // Resolve members (userIds to ObjectIds)
        const memberIds = [];
        if (p.members && Array.isArray(p.members)) {
          const memberDocs = await User.find({ userId: { $in: p.members } });
          memberDocs.forEach((m) => memberIds.push(m._id));
        }

        await Project.create({
          projectId: p.projectId,
          title: (p.title || '').trim(),
          category: p.category || 'Default',
          description: p.description || '',
          owner: ownerId,
          members: memberIds,
          status: (p.status || 'active').toLowerCase(),
          startDate: p.startDate ? new Date(p.startDate) : undefined,
        });
        inserted++;
      } catch (err) {
        console.error(`Project sync failed for projectId ${p.projectId}:`, err.message);
        rejected++;
      }
    }

    // 5. Process Issues Sync
    for (const i of issues) {
      try {
        const exists = await Issue.findOne({ issueId: i.issueId });
        if (exists) {
          duplicates++;
          continue;
        }

        // Resolve project (projectId to ObjectId) - required!
        const projectDoc = await Project.findOne({ projectId: i.projectId });
        if (!projectDoc) {
          console.error(`Issue sync rejected for issueId ${i.issueId}: Project ${i.projectId} not found`);
          rejected++;
          continue;
        }

        // Resolve assignedTo (userId to ObjectId)
        let assignedId = null;
        if (i.assignedTo) {
          const assignedDoc = await User.findOne({ userId: i.assignedTo });
          if (assignedDoc) {
            assignedId = assignedDoc._id;
          }
        }

        // Resolve reportedBy (userId to ObjectId)
        let reportedId = req.user._id; // Default fallback
        if (i.reportedBy) {
          const reportedDoc = await User.findOne({ userId: i.reportedBy });
          if (reportedDoc) {
            reportedId = reportedDoc._id;
          }
        }

        await Issue.create({
          issueId: i.issueId,
          title: i.title,
          description: i.description || '',
          project: projectDoc._id,
          assignedTo: assignedId,
          reportedBy: reportedId,
          priority: i.priority || 'medium',
          severity: i.severity || 'minor',
          status: i.status || 'open',
          type: i.type || 'bug',
          tags: i.tags || [],
        });
        inserted++;
      } catch (err) {
        console.error(`Issue sync failed for issueId ${i.issueId}:`, err.message);
        rejected++;
      }
    }

    // 6. Process Comments Sync
    for (const c of comments) {
      try {
        const exists = await Comment.findOne({ commentId: c.commentId });
        if (exists) {
          duplicates++;
          continue;
        }

        // Resolve issue (issueId to ObjectId) - required!
        const issueDoc = await Issue.findOne({ issueId: c.issueId });
        if (!issueDoc) {
          console.error(`Comment sync rejected for commentId ${c.commentId}: Issue ${c.issueId} not found`);
          rejected++;
          continue;
        }

        // Resolve user (userId to ObjectId) - default to current user
        let commentUserId = req.user._id;
        if (c.userId) {
          const userDoc = await User.findOne({ userId: c.userId });
          if (userDoc) {
            commentUserId = userDoc._id;
          }
        }

        await Comment.create({
          commentId: c.commentId,
          issue: issueDoc._id,
          user: commentUserId,
          message: c.message,
          createdAt: c.createdAt ? new Date(c.createdAt) : undefined,
        });
        inserted++;
      } catch (err) {
        console.error(`Comment sync failed for commentId ${c.commentId}:`, err.message);
        rejected++;
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Dataset synchronized successfully',
      data: {
        totalFetched,
        inserted,
        duplicates,
        rejected,
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
