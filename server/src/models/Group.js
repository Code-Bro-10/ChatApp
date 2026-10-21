import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
  description: { type: String, trim: true, maxlength: 200, default: '' },
  avatarColor: { type: String, default: '#075E54' },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  members: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    joinedAt: { type: Date, default: Date.now }
  }],
  lastMessage: {
    text: { type: String, default: '' },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    senderName: { type: String, default: '' },
    createdAt: { type: Date, default: null }
  }
}, { timestamps: true });

groupSchema.index({ 'members.user': 1 });
groupSchema.index({ updatedAt: -1 });

export default mongoose.model('Group', groupSchema);
