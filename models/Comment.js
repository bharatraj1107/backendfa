import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema(
  {
    commentId: { type: String, unique: true, index: true },
    issue: { type: mongoose.Schema.Types.ObjectId, ref: 'Issue', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },
  },
  { timestamps: true }
);

// Generate auto-incrementing commentId
commentSchema.pre('save', async function () {
  if (!this.commentId) {
    const count = await mongoose.model('Comment').countDocuments();
    this.commentId = 'COM' + (count + 1);
  }
});

const Comment = mongoose.model('Comment', commentSchema);
export default Comment;
