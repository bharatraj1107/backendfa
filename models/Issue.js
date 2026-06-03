import mongoose from 'mongoose';

const issueSchema = new mongoose.Schema(
  {
    issueId: { type: String, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    severity: {
      type: String,
      enum: ['minor', 'major', 'critical', 'blocker'],
      default: 'minor',
    },
    status: {
      type: String,
      enum: ['open', 'in-progress', 'testing', 'resolved', 'closed'],
      default: 'open',
    },
    type: {
      type: String,
      enum: ['bug', 'feature', 'improvement', 'task'],
      default: 'bug',
    },
    tags: [{ type: String }],
  },
  { timestamps: true }
);

// Generate auto-incrementing issueId
issueSchema.pre('save', async function () {
  if (!this.issueId) {
    const count = await mongoose.model('Issue').countDocuments();
    this.issueId = 'ISS' + (count + 1);
  }
});

const Issue = mongoose.model('Issue', issueSchema);
export default Issue;
