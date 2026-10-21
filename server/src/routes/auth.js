import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = Router();

const publicUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  avatarColor: user.avatarColor,
  status: user.status || 'Available',
  lastSeen: user.lastSeen,
  themePreference: user.themePreference || 'dark'
});

router.post('/register', authLimiter, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (name.length < 2 || name.length > 40) {
      return res.status(400).json({ error: 'Name must be 2–40 characters.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
    }

    if (await User.exists({ email })) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });
    const token = jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ token, user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'Email already registered.' });
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Could not create account.' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    const token = jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Could not sign in.' });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.patch('/profile', requireAuth, async (req, res) => {
  try {
    const updates = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (name.length < 2 || name.length > 40) return res.status(400).json({ error: 'Name must be 2–40 characters.' });
      updates.name = name;
    }
    if (req.body.status !== undefined) {
      updates.status = String(req.body.status).trim().slice(0, 100);
    }
    if (req.body.themePreference && ['light', 'dark', 'system'].includes(req.body.themePreference)) {
      updates.themePreference = req.body.themePreference;
    }
    if (req.body.avatarColor && /^#[0-9A-Fa-f]{6}$/.test(req.body.avatarColor)) {
      updates.avatarColor = req.body.avatarColor;
    }

    const updatedUser = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true });
    res.json({ user: publicUser(updatedUser) });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Could not update profile.' });
  }
});

export default router;
