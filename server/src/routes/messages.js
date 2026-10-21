import { Router } from 'express';
import mongoose from 'mongoose';
import Message from '../models/Message.js';
import Group from '../models/Group.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Edit a message (only sender, within 24 hours, non-deleted)
router.patch('/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid message ID.' });
    }

    const text = String(req.body.text || '').trim();
    if (!text || text.length > 4000) {
      return res.status(400).json({ error: 'Message must contain between 1 and 4000 characters.' });
    }

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: 'Message not found.' });

    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'You can only edit your own messages.' });
    }

    if (message.isDeleted) {
      return res.status(400).json({ error: 'Deleted messages cannot be edited.' });
    }

    // 24 hour edit window
    const ageMs = Date.now() - new Date(message.createdAt).getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Messages older than 24 hours cannot be edited.' });
    }

    message.text = text;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    const populated = await Message.findById(message._id)
      .populate('sender', 'name avatarColor')
      .populate({ path: 'replyTo', select: 'text sender attachments', populate: { path: 'sender', select: 'name' } })
      .lean();

    const io = req.app.get('io');
    if (io) {
      if (message.conversationType === 'group' && message.group) {
        io.to(`group:${message.group.toString()}`).emit('message:updated', populated);
      } else if (message.receiver) {
        io.to(message.receiver.toString()).emit('message:updated', populated);
        io.to(message.sender.toString()).emit('message:updated', populated);
      }
    }

    res.json({ message: populated });
  } catch (error) {
    console.error('Error editing message:', error);
    res.status(500).json({ error: 'Could not edit message.' });
  }
});

// Soft delete a message (only sender)
router.delete('/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid message ID.' });
    }

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: 'Message not found.' });

    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'You can only delete your own messages.' });
    }

    message.isDeleted = true;
    message.text = 'This message was deleted';
    message.attachments = [];
    await message.save();

    const payload = {
      _id: message._id.toString(),
      isDeleted: true,
      text: 'This message was deleted',
      attachments: [],
      conversationType: message.conversationType,
      group: message.group ? message.group.toString() : null,
      receiver: message.receiver ? message.receiver.toString() : null,
      sender: message.sender.toString()
    };

    const io = req.app.get('io');
    if (io) {
      if (message.conversationType === 'group' && message.group) {
        io.to(`group:${message.group.toString()}`).emit('message:deleted', payload);
      } else if (message.receiver) {
        io.to(message.receiver.toString()).emit('message:deleted', payload);
        io.to(message.sender.toString()).emit('message:deleted', payload);
      }
    }

    res.json({ success: true, message: payload });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Could not delete message.' });
  }
});

// Add / toggle emoji reaction
router.post('/:messageId/reactions', async (req, res) => {
  try {
    const { messageId } = req.params;
    const emoji = String(req.body.emoji || '').trim();
    if (!emoji || emoji.length > 8) {
      return res.status(400).json({ error: 'Valid emoji required.' });
    }

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid message ID.' });
    }

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: 'Message not found.' });

    // Authorization check
    if (message.conversationType === 'group' && message.group) {
      const isMember = await Group.exists({ _id: message.group, 'members.user': req.user._id });
      if (!isMember) return res.status(403).json({ error: 'You are not a member of this group.' });
    } else if (message.conversationType === 'direct') {
      const isParticipant = message.sender.equals(req.user._id) || (message.receiver && message.receiver.equals(req.user._id));
      if (!isParticipant) return res.status(403).json({ error: 'You are not part of this conversation.' });
    }

    // Toggle reaction: if user already gave this exact emoji, remove it; if different emoji, replace it; else add it
    const existingIndex = message.reactions.findIndex(r => r.user.toString() === req.user._id.toString());
    if (existingIndex > -1) {
      if (message.reactions[existingIndex].emoji === emoji) {
        message.reactions.splice(existingIndex, 1);
      } else {
        message.reactions[existingIndex].emoji = emoji;
        message.reactions[existingIndex].createdAt = new Date();
      }
    } else {
      message.reactions.push({ user: req.user._id, emoji, createdAt: new Date() });
    }

    await message.save();

    const populated = await Message.findById(message._id)
      .populate('reactions.user', 'name')
      .select('reactions conversationType group receiver sender')
      .lean();

    const payload = {
      messageId: message._id.toString(),
      reactions: populated.reactions,
      conversationType: message.conversationType,
      group: message.group ? message.group.toString() : null,
      receiver: message.receiver ? message.receiver.toString() : null,
      sender: message.sender.toString()
    };

    const io = req.app.get('io');
    if (io) {
      if (message.conversationType === 'group' && message.group) {
        io.to(`group:${message.group.toString()}`).emit('message:reaction', payload);
      } else if (message.receiver) {
        io.to(message.receiver.toString()).emit('message:reaction', payload);
        io.to(message.sender.toString()).emit('message:reaction', payload);
      }
    }

    res.json(payload);
  } catch (error) {
    console.error('Error updating reaction:', error);
    res.status(500).json({ error: 'Could not update reaction.' });
  }
});

export default router;
