import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Message from '../models/Message.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const filter = { _id: { $ne: req.user._id } };
    if (q) {
      filter.$or = [
        { name: { $regex: escapeRegex(q), $options: 'i' } },
        { email: { $regex: escapeRegex(q), $options: 'i' } }
      ];
    }

    const users = await User.find(filter)
      .select('name email avatarColor status lastSeen')
      .sort({ name: 1 })
      .limit(60)
      .lean();

    const results = await Promise.all(users.map(async (u) => {
      // Find latest message between req.user and this user
      const last = await Message.findOne({
        conversationType: 'direct',
        $or: [
          { sender: req.user._id, receiver: u._id },
          { sender: u._id, receiver: req.user._id }
        ]
      })
      .sort({ createdAt: -1 })
      .select('text attachments isDeleted createdAt sender readAt deliveredAt')
      .lean();

      // Count unread messages received from this user
      const unreadCount = await Message.countDocuments({
        conversationType: 'direct',
        sender: u._id,
        receiver: req.user._id,
        readAt: null
      });

      let previewText = '';
      if (last) {
        if (last.isDeleted) previewText = 'This message was deleted';
        else if (last.text) previewText = last.text;
        else if (last.attachments?.length) previewText = `📎 ${last.attachments[0].originalName || 'Attachment'}`;
      }

      return {
        ...u,
        unreadCount,
        isGroup: false,
        lastMessage: last ? {
          text: previewText,
          createdAt: last.createdAt,
          sender: last.sender,
          readAt: last.readAt,
          deliveredAt: last.deliveredAt
        } : null
      };
    }));

    // Sort contacts: those with recent messages first, then alphabetically
    results.sort((a, b) => {
      const timeA = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const timeB = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      if (timeA !== timeB) return timeB - timeA;
      return a.name.localeCompare(b.name);
    });

    res.json({ users: results });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Could not load contacts.' });
  }
});

router.get('/:userId/messages', async (req, res) => {
  try {
    const otherId = req.params.userId;
    if (!mongoose.Types.ObjectId.isValid(otherId)) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }

    const otherUser = await User.findById(otherId).select('name avatarColor lastSeen');
    if (!otherUser) return res.status(404).json({ error: 'User not found.' });

    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const before = req.query.before ? new Date(req.query.before) : null;

    const filter = {
      conversationType: 'direct',
      $or: [
        { sender: req.user._id, receiver: otherId },
        { sender: otherId, receiver: req.user._id }
      ]
    };
    if (before && !Number.isNaN(before.getTime())) {
      filter.createdAt = { $lt: before };
    }

    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('sender', 'name avatarColor')
      .populate({ path: 'replyTo', select: 'text sender attachments', populate: { path: 'sender', select: 'name' } })
      .populate('reactions.user', 'name')
      .lean();

    // Mark unread messages sent by the other user to req.user as read
    const now = new Date();
    await Message.updateMany(
      { conversationType: 'direct', sender: otherId, receiver: req.user._id, readAt: null },
      { $set: { readAt: now, deliveredAt: now } }
    );

    // Notify other user that messages were read
    const io = req.app.get('io');
    if (io) {
      io.to(otherId.toString()).emit('messages:read', { readerId: req.user._id.toString(), readAt: now });
    }

    res.json({ messages: messages.reverse(), otherUser });
  } catch (error) {
    console.error('Error loading direct messages:', error);
    res.status(500).json({ error: 'Could not load messages.' });
  }
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default router;
