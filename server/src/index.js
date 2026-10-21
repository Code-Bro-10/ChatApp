import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import groupRoutes from './routes/groups.js';
import messageRoutes from './routes/messages.js';
import uploadRoutes from './routes/upload.js';
import systemRoutes from './routes/system.js';

import User from './models/User.js';
import Message from './models/Message.js';
import Group from './models/Group.js';
import { initClusterTracker, incrementClusterMessageCount } from './cluster.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const required = ['MONGODB_URI', 'JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const PORT = Number(process.env.PORT || 5000);
const INSTANCE_ID = process.env.INSTANCE_ID || `server-${PORT}`;

const app = express();
const server = http.createServer(app);

// Allow dynamic local origins for distributed multi-client demo (e.g. 5173, 5174, etc.)
const defaultAllowed = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174'];
if (process.env.CLIENT_ORIGIN) {
  process.env.CLIENT_ORIGIN.split(',').map(s => s.trim()).forEach(o => {
    if (!defaultAllowed.includes(o)) defaultAllowed.push(o);
  });
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (defaultAllowed.includes(origin) || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }
    return callback(null, true); // Dev-friendly fallback
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '500kb' }));
app.use(express.urlencoded({ extended: true, limit: '500kb' }));

// Static uploads serving
app.use('/uploads', express.static(uploadDir));

// Socket.io instance
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, true),
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingInterval: 10000,
  pingTimeout: 5000
});

// Provide io instance to Express routes
app.set('io', io);

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/system', systemRoutes);
app.get('/api/health', (_req, res) => res.redirect('/api/system/health'));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Unexpected server error.' });
});

// Distributed Redis Adapter and cluster tracking
let redisPubClient = null;
if (process.env.REDIS_URL) {
  try {
    redisPubClient = createClient({
      url: process.env.REDIS_URL,
      socket: { reconnectStrategy: (retries) => Math.min(retries * 500, 3000) }
    });
    const subClient = redisPubClient.duplicate();

    redisPubClient.on('error', (e) => console.error(`[${INSTANCE_ID}] Redis publisher error:`, e.message));
    subClient.on('error', (e) => console.error(`[${INSTANCE_ID}] Redis subscriber error:`, e.message));

    await Promise.all([redisPubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(redisPubClient, subClient));
    console.log(`[${INSTANCE_ID}] Redis Socket.IO adapter enabled: cross-instance events active.`);
  } catch (error) {
    console.error(`[${INSTANCE_ID}] Redis unavailable; falling back to single-instance broadcast:`, error.message);
  }
} else {
  console.warn(`[${INSTANCE_ID}] REDIS_URL not set. Multi-instance events will not be shared.`);
}

initClusterTracker({
  pubClient: redisPubClient,
  id: INSTANCE_ID,
  port: PORT,
  getSocketsCount: () => io.engine.clientsCount
});

// Socket Authentication Middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.userId).select('_id name email avatarColor');
    if (!user) return next(new Error('Account not found'));
    socket.user = user;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
});

// Real-time Event Handlers
io.on('connection', async (socket) => {
  const userId = socket.user._id.toString();

  // User joins their personal room for direct messages and private alerts
  socket.join(userId);

  // User automatically joins rooms for all groups they belong to
  try {
    const groups = await Group.find({ 'members.user': socket.user._id }).select('_id');
    groups.forEach((g) => socket.join(`group:${g._id.toString()}`));
  } catch (err) {
    console.error('Failed to auto-join group rooms:', err.message);
  }

  // Notify other users that this user is online
  socket.broadcast.emit('presence:update', { userId, online: true });

  // Inform connecting client of ready state and connected instance
  socket.emit('connection:ready', {
    userId,
    instance: INSTANCE_ID,
    distributed: Boolean(process.env.REDIS_URL && redisPubClient?.isReady)
  });

  // Client requests to join a group room dynamically (e.g. after newly creating/joining)
  socket.on('group:join', (groupId) => {
    if (groupId) socket.join(`group:${groupId}`);
  });

  // Client leaves a group room
  socket.on('group:leave', (groupId) => {
    if (groupId) socket.leave(`group:${groupId}`);
  });

  // Send message event (Direct or Group)
  socket.on('message:send', async (payload = {}, ack = () => {}) => {
    try {
      const isGroup = Boolean(payload.groupId);
      const text = String(payload.text || '').trim();
      const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
      const replyTo = payload.replyTo && mongoose.Types.ObjectId.isValid(payload.replyTo) ? payload.replyTo : null;
      const clientMsgId = String(payload.clientMsgId || '').trim();

      if (!text && attachments.length === 0) {
        return ack({ ok: false, error: 'Message cannot be empty.' });
      }
      if (text.length > 4000) {
        return ack({ ok: false, error: 'Message cannot exceed 4000 characters.' });
      }

      // Deduplication check: if client sent clientMsgId and already created, return existing
      if (clientMsgId) {
        const existing = await Message.findOne({ clientMsgId })
          .populate('sender', 'name avatarColor')
          .populate({ path: 'replyTo', select: 'text sender attachments', populate: { path: 'sender', select: 'name' } })
          .lean();
        if (existing) {
          return ack({ ok: true, message: existing, duplicate: true });
        }
      }

      let messageDoc;

      if (isGroup) {
        const groupId = String(payload.groupId);
        if (!mongoose.Types.ObjectId.isValid(groupId)) {
          return ack({ ok: false, error: 'Invalid group ID.' });
        }

        const group = await Group.findById(groupId);
        if (!group) return ack({ ok: false, error: 'Group does not exist.' });

        const isMember = group.members.some(m => m.user.equals(socket.user._id));
        if (!isMember) return ack({ ok: false, error: 'You are not a member of this group.' });

        messageDoc = await Message.create({
          sender: socket.user._id,
          group: groupId,
          conversationType: 'group',
          text,
          attachments,
          replyTo,
          clientMsgId: clientMsgId || null,
          readBy: [{ user: socket.user._id, readAt: new Date() }]
        });

        // Update group lastMessage snippet
        group.lastMessage = {
          text: text || (attachments.length ? `📎 ${attachments[0].originalName}` : ''),
          sender: socket.user._id,
          senderName: socket.user.name,
          createdAt: messageDoc.createdAt
        };
        await group.save();
      } else {
        const receiver = String(payload.receiverId || '');
        if (!mongoose.Types.ObjectId.isValid(receiver)) {
          return ack({ ok: false, error: 'Choose a valid recipient.' });
        }
        if (receiver === userId) {
          return ack({ ok: false, error: 'You cannot message yourself.' });
        }

        const recipientExists = await User.exists({ _id: receiver });
        if (!recipientExists) {
          return ack({ ok: false, error: 'Recipient not found.' });
        }

        // Check if recipient has any active sockets across the cluster
        const receiverSockets = await io.in(receiver).fetchSockets();
        const deliveredAt = receiverSockets.length > 0 ? new Date() : null;

        messageDoc = await Message.create({
          sender: socket.user._id,
          receiver,
          conversationType: 'direct',
          text,
          attachments,
          replyTo,
          clientMsgId: clientMsgId || null,
          deliveredAt
        });
      }

      // Populate sender and replyTo
      const populated = await Message.findById(messageDoc._id)
        .populate('sender', 'name avatarColor')
        .populate({ path: 'replyTo', select: 'text sender attachments', populate: { path: 'sender', select: 'name' } })
        .lean();

      // Emit real-time events
      if (isGroup) {
        io.to(`group:${payload.groupId}`).emit('message:new', populated);
      } else {
        io.to(payload.receiverId).emit('message:new', populated);
        socket.emit('message:new', populated);
      }

      // Increment cluster total messages counter
      incrementClusterMessageCount();

      ack({ ok: true, message: populated });
    } catch (error) {
      console.error('message:send error:', error);
      ack({ ok: false, error: 'Message could not be sent.' });
    }
  });

  // Typing indicator start
  socket.on('typing:start', ({ receiverId, groupId } = {}) => {
    if (groupId && mongoose.Types.ObjectId.isValid(groupId)) {
      socket.to(`group:${groupId}`).emit('typing:update', {
        userId,
        userName: socket.user.name,
        groupId,
        typing: true
      });
    } else if (receiverId && mongoose.Types.ObjectId.isValid(receiverId)) {
      io.to(receiverId).emit('typing:update', {
        userId,
        userName: socket.user.name,
        typing: true
      });
    }
  });

  // Typing indicator stop
  socket.on('typing:stop', ({ receiverId, groupId } = {}) => {
    if (groupId && mongoose.Types.ObjectId.isValid(groupId)) {
      socket.to(`group:${groupId}`).emit('typing:update', {
        userId,
        userName: socket.user.name,
        groupId,
        typing: false
      });
    } else if (receiverId && mongoose.Types.ObjectId.isValid(receiverId)) {
      io.to(receiverId).emit('typing:update', {
        userId,
        userName: socket.user.name,
        typing: false
      });
    }
  });

  // Read receipts acknowledgment
  socket.on('message:read', async ({ senderId, groupId } = {}) => {
    try {
      const now = new Date();
      if (groupId && mongoose.Types.ObjectId.isValid(groupId)) {
        await Message.updateMany(
          { group: groupId, conversationType: 'group', sender: { $ne: socket.user._id }, 'readBy.user': { $ne: socket.user._id } },
          { $addToSet: { readBy: { user: socket.user._id, readAt: now } } }
        );
        socket.to(`group:${groupId}`).emit('group:read_update', { groupId, readerId: userId, readAt: now });
      } else if (senderId && mongoose.Types.ObjectId.isValid(senderId)) {
        await Message.updateMany(
          { conversationType: 'direct', sender: senderId, receiver: socket.user._id, readAt: null },
          { $set: { readAt: now, deliveredAt: now } }
        );
        io.to(senderId).emit('messages:read', { readerId: userId, readAt: now });
      }
    } catch (error) {
      console.error('message:read error:', error);
    }
  });

  // Disconnect handler with cross-instance safety
  socket.on('disconnect', async () => {
    try {
      // Check if user has other open sockets across instances
      const remainingSockets = await io.in(userId).fetchSockets();
      if (remainingSockets.length === 0) {
        const lastSeen = new Date();
        await User.updateOne({ _id: socket.user._id }, { $set: { lastSeen } });
        socket.broadcast.emit('presence:update', { userId, online: false, lastSeen });
      }
    } catch (error) {
      console.error('Presence cleanup error:', error.message);
    }
  });
});

// Connect to MongoDB and start listening
await mongoose.connect(process.env.MONGODB_URI);
console.log(`[${INSTANCE_ID}] Connected to MongoDB at ${mongoose.connection.host}`);

server.listen(PORT, () => {
  console.log(`ChatSphere ${INSTANCE_ID} listening on port ${PORT}`);
});
