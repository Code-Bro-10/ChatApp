import { Router } from 'express';
import mongoose from 'mongoose';
import Group from '../models/Group.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const GROUP_COLORS = ['#075E54', '#128C7E', '#1E3A8A', '#4C1D95', '#831843', '#78350F', '#14532D'];

// Create group
router.post('/', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim();
    const rawMembers = Array.isArray(req.body.members) ? req.body.members : [];

    if (name.length < 2 || name.length > 50) {
      return res.status(400).json({ error: 'Group name must be 2–50 characters.' });
    }

    // Filter valid User ObjectIDs
    const validMemberIds = [...new Set(rawMembers.filter(id => mongoose.Types.ObjectId.isValid(id)))];
    // Ensure creator is included
    const creatorId = req.user._id.toString();
    const allMemberIds = [...new Set([creatorId, ...validMemberIds])];

    if (allMemberIds.length < 2) {
      return res.status(400).json({ error: 'A group must have at least 2 members (including you).' });
    }

    // Verify users exist
    const existingUsers = await User.find({ _id: { $in: allMemberIds } }).select('_id');
    const existingIdSet = new Set(existingUsers.map(u => u._id.toString()));

    const members = allMemberIds
      .filter(id => existingIdSet.has(id))
      .map(id => ({
        user: id,
        role: id === creatorId ? 'admin' : 'member',
        joinedAt: new Date()
      }));

    const avatarColor = GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];

    const group = await Group.create({
      name,
      description,
      avatarColor,
      creator: req.user._id,
      admins: [req.user._id],
      members,
      lastMessage: {
        text: `Group "${name}" created`,
        sender: req.user._id,
        senderName: req.user.name,
        createdAt: new Date()
      }
    });

    const populatedGroup = await Group.findById(group._id)
      .populate('creator', 'name email avatarColor')
      .populate('members.user', 'name email avatarColor lastSeen')
      .lean();

    // Broadcast group:created to all members' private socket rooms
    const io = req.app.get('io');
    if (io) {
      members.forEach(m => {
        io.to(m.user.toString()).emit('group:created', populatedGroup);
      });
    }

    res.status(201).json({ group: populatedGroup });
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: 'Could not create group.' });
  }
});

// List groups current user belongs to
router.get('/', async (req, res) => {
  try {
    const groups = await Group.find({ 'members.user': req.user._id })
      .populate('creator', 'name email')
      .sort({ updatedAt: -1 })
      .lean();

    // Calculate unread message count for each group
    const groupsWithUnread = await Promise.all(groups.map(async (grp) => {
      const unreadCount = await Message.countDocuments({
        group: grp._id,
        conversationType: 'group',
        sender: { $ne: req.user._id },
        'readBy.user': { $ne: req.user._id }
      });

      return {
        ...grp,
        unreadCount,
        isGroup: true,
        memberCount: grp.members.length
      };
    }));

    res.json({ groups: groupsWithUnread });
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Could not load groups.' });
  }
});

// Get group info and full member list
router.get('/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ error: 'Invalid group ID.' });
    }

    const group = await Group.findById(groupId)
      .populate('creator', 'name email avatarColor')
      .populate('members.user', 'name email avatarColor lastSeen')
      .lean();

    if (!group) return res.status(404).json({ error: 'Group not found.' });

    const isMember = group.members.some(m => m.user?._id?.toString() === req.user._id.toString());
    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this group.' });
    }

    res.json({ group: { ...group, isGroup: true, memberCount: group.members.length } });
  } catch (error) {
    console.error('Error getting group:', error);
    res.status(500).json({ error: 'Could not load group info.' });
  }
});

// Get group messages
router.get('/:groupId/messages', async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ error: 'Invalid group ID.' });
    }

    const isMember = await Group.exists({ _id: groupId, 'members.user': req.user._id });
    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this group.' });
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const before = req.query.before ? new Date(req.query.before) : null;

    const filter = { group: groupId, conversationType: 'group' };
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

    // Mark as read by current user in the background
    await Message.updateMany(
      { group: groupId, conversationType: 'group', sender: { $ne: req.user._id }, 'readBy.user': { $ne: req.user._id } },
      { $addToSet: { readBy: { user: req.user._id, readAt: new Date() } } }
    );

    res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error('Error loading group messages:', error);
    res.status(500).json({ error: 'Could not load group messages.' });
  }
});

// Add member to group (admin only)
router.post('/:groupId/members', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid group or user ID.' });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    const isAdmin = group.admins.some(a => a.equals(req.user._id));
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only group admins can add members.' });
    }

    const alreadyMember = group.members.some(m => m.user.equals(userId));
    if (alreadyMember) {
      return res.status(400).json({ error: 'User is already a member.' });
    }

    const userToAdd = await User.findById(userId).select('name email avatarColor');
    if (!userToAdd) return res.status(404).json({ error: 'User not found.' });

    group.members.push({ user: userId, role: 'member', joinedAt: new Date() });
    await group.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('group:member_added', { groupId, user: userToAdd });
      io.to(userId.toString()).emit('group:invited', group);
    }

    res.json({ success: true, group });
  } catch (error) {
    console.error('Error adding member:', error);
    res.status(500).json({ error: 'Could not add member.' });
  }
});

// Remove member / leave group
router.delete('/:groupId/members/:memberId', async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(memberId)) {
      return res.status(400).json({ error: 'Invalid ID.' });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    const isSelf = memberId === req.user._id.toString();
    const isAdmin = group.admins.some(a => a.equals(req.user._id));

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: 'Only admins can remove other members.' });
    }

    group.members = group.members.filter(m => !m.user.equals(memberId));
    group.admins = group.admins.filter(a => !a.equals(memberId));

    if (group.members.length === 0) {
      await Group.findByIdAndDelete(groupId);
      await Message.deleteMany({ group: groupId });
      return res.json({ success: true, message: 'Group dissolved.' });
    }

    // Ensure at least one admin remains
    if (group.admins.length === 0 && group.members.length > 0) {
      group.admins.push(group.members[0].user);
      group.members[0].role = 'admin';
    }

    await group.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('group:member_removed', { groupId, memberId });
      io.to(memberId).emit('group:removed', { groupId });
    }

    res.json({ success: true, message: isSelf ? 'Left group.' : 'Member removed.' });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ error: 'Could not remove member.' });
  }
});

export default router;
