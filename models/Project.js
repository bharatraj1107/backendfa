import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    projectId: { type: String, unique: true, index: true },
    title: { type: String, required: true },
    category: { type: String },
    description: { type: String },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    status: {
      type: String,
      enum: ['active', 'completed', 'archived'],
      default: 'active',
    },
    startDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Generate auto-incrementing projectId
projectSchema.pre('save', async function () {
  if (!this.projectId) {
    const count = await mongoose.model('Project').countDocuments();
    this.projectId = 'PROJ' + (count + 1);
  }
});

const Project = mongoose.model('Project', projectSchema);
export default Project;
