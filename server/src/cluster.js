import mongoose from 'mongoose';
import User from './models/User.js';
import Message from './models/Message.js';
import Group from './models/Group.js';

let redisPubClient = null;
let instanceId = '';
let instancePort = 5000;
let getActiveSocketsCount = () => 0;
let startTime = Date.now();

export function initClusterTracker({ pubClient, id, port, getSocketsCount }) {
  redisPubClient = pubClient;
  instanceId = id;
  instancePort = port;
  getActiveSocketsCount = getSocketsCount;
  startTime = Date.now();

  // Send periodic heartbeat to Redis
  sendHeartbeat();
  const interval = setInterval(sendHeartbeat, 4000);
  interval.unref();
}

async function sendHeartbeat() {
  if (!redisPubClient || !redisPubClient.isReady) return;
  try {
    const mem = process.memoryUsage();
    const data = {
      instanceId,
      port: instancePort,
      activeSockets: getActiveSocketsCount(),
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      memoryRssMb: Math.round(mem.rss / (1024 * 1024)),
      heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
      pid: process.pid,
      nodeVersion: process.version,
      lastHeartbeat: Date.now()
    };
    await redisPubClient.set(`chatsphere:cluster:instance:${instanceId}`, JSON.stringify(data), { EX: 12 });
  } catch (err) {
    // Non-fatal heartbeat warning
    console.warn('Cluster heartbeat failed:', err.message);
  }
}

export async function incrementClusterMessageCount() {
  if (redisPubClient && redisPubClient.isReady) {
    try {
      await redisPubClient.incr('chatsphere:stats:messages_total');
    } catch {
      // Ignore Redis stats write failure
    }
  }
}

export async function getClusterStats() {
  const mem = process.memoryUsage();
  const localInstance = {
    instanceId,
    port: instancePort,
    activeSockets: getActiveSocketsCount(),
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    memoryRssMb: Math.round(mem.rss / (1024 * 1024)),
    heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
    pid: process.pid,
    nodeVersion: process.version,
    isCurrent: true,
    lastHeartbeat: Date.now()
  };

  let instances = [localInstance];
  let totalMessagesDistributed = 0;
  let redisConnected = false;

  if (redisPubClient && redisPubClient.isReady) {
    redisConnected = true;
    try {
      const keys = await redisPubClient.keys('chatsphere:cluster:instance:*');
      if (keys.length > 0) {
        const values = await redisPubClient.mGet(keys);
        const parsed = values
          .filter(Boolean)
          .map(v => {
            try { return JSON.parse(v); } catch { return null; }
          })
          .filter(Boolean)
          .map(inst => ({
            ...inst,
            isCurrent: inst.instanceId === instanceId
          }));

        if (parsed.length > 0) {
          // Sort instances by instanceId
          parsed.sort((a, b) => a.instanceId.localeCompare(b.instanceId));
          instances = parsed;
        }
      }

      const totalMsgStr = await redisPubClient.get('chatsphere:stats:messages_total');
      totalMessagesDistributed = Number(totalMsgStr) || 0;
    } catch (e) {
      console.warn('Error reading cluster keys from Redis:', e.message);
    }
  }

  // Database stats
  const mongoConnected = mongoose.connection.readyState === 1;
  let userCount = 0;
  let messageCount = 0;
  let groupCount = 0;

  if (mongoConnected) {
    try {
      [userCount, messageCount, groupCount] = await Promise.all([
        User.estimatedDocumentCount(),
        Message.estimatedDocumentCount(),
        Group.estimatedDocumentCount()
      ]);
    } catch (e) {
      console.warn('Error fetching DB counts:', e.message);
    }
  }

  const totalClusterSockets = instances.reduce((acc, curr) => acc + (curr.activeSockets || 0), 0);

  return {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    currentInstance: instanceId,
    distributed: Boolean(process.env.REDIS_URL && redisConnected),
    cluster: {
      totalInstances: instances.length,
      totalSockets: totalClusterSockets,
      instances
    },
    services: {
      mongodb: {
        status: mongoConnected ? 'connected' : 'disconnected',
        host: mongoose.connection.host || 'unknown',
        database: mongoose.connection.name || 'chatsphere',
        totalUsers: userCount,
        totalMessages: messageCount,
        totalGroups: groupCount
      },
      redis: {
        status: redisConnected ? 'connected' : 'disconnected',
        url: process.env.REDIS_URL ? process.env.REDIS_URL.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@') : 'none',
        totalMessagesTracked: totalMessagesDistributed || messageCount
      }
    }
  };
}
