import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null, index: true },
  conversationType: { type: String, enum: ['direct', 'group'], default: 'direct', index: true },
  text: { type: String, trim: true, maxlength: 4000, default: '' },
  attachments: [{
    url: { type: String, required: true },
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true }
  }],
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true, maxlength: 10 },
    createdAt: { type: Date, default: Date.now }
  }],
  isEdited: { type: Boolean, default: false },
  editedAt: { type: Date, default: null },
  isDeleted: { type: Boolean, default: false },
  deliveredAt: { type: Date, default: null },
  readAt: { type: Date, default: null },
  readBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    readAt: { type: Date, default: Date.now }
  }],
  clientMsgId: { type: String, default: null, index: true, sparse: true }
}, { timestamps: true });

messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
messageSchema.index({ receiver: 1, sender: 1, createdAt: -1 });
messageSchema.index({ group: 1, createdAt: -1 });

export default mongoose.model('Message', messageSchema);
