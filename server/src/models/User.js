import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  avatarColor: { type: String, default: '#128C7E' },
  status: { type: String, default: 'Available', maxlength: 100 },
  lastSeen: { type: Date, default: Date.now },
  themePreference: { type: String, enum: ['light', 'dark', 'system'], default: 'dark' }
}, { timestamps: true });

export default mongoose.model('User', userSchema);
