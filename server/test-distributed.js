import { io } from 'socket.io-client';

const SERVER_1 = 'http://localhost:5000';
const SERVER_2 = 'http://localhost:5001';

async function postJson(url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function getJson(url, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function runTests() {
  console.log('=== CHATSPHERE DISTRIBUTED SYSTEM VERIFICATION ===\n');

  // 1. Check health of both instances
  console.log('[Test 1] Verifying server instances health...');
  const stats1 = await getJson(`${SERVER_1}/api/system/stats`);
  const stats2 = await getJson(`${SERVER_2}/api/system/stats`);

  console.log(`✓ Server 1 (${stats1.currentInstance}) healthy. Total instances discovered: ${stats1.cluster.totalInstances}`);
  console.log(`✓ Server 2 (${stats2.currentInstance}) healthy. Total instances discovered: ${stats2.cluster.totalInstances}`);
  console.log(`✓ MongoDB Status: ${stats1.services.mongodb.status}`);
  console.log(`✓ Redis Status: ${stats1.services.redis.status}\n`);

  // 2. Register / login two distinct test users
  console.log('[Test 2] Creating / authenticating test accounts...');
  const randomSuffix = Math.floor(Math.random() * 10000);
  const user1Email = `dist.alice.${randomSuffix}@test.com`;
  const user2Email = `dist.bob.${randomSuffix}@test.com`;

  const auth1 = await postJson(`${SERVER_1}/api/auth/register`, {
    name: 'Alice Distributed',
    email: user1Email,
    password: 'Password123!'
  });
  const auth2 = await postJson(`${SERVER_2}/api/auth/register`, {
    name: 'Bob Distributed',
    email: user2Email,
    password: 'Password123!'
  });

  console.log(`✓ Alice registered on Server 1 (ID: ${auth1.user._id})`);
  console.log(`✓ Bob registered on Server 2 (ID: ${auth2.user._id})\n`);

  // 3. Connect Socket 1 to Server 5000 and Socket 2 to Server 5001
  console.log('[Test 3] Establishing cross-server WebSocket connections...');
  const socketAlice = io(SERVER_1, {
    auth: { token: auth1.token },
    transports: ['websocket']
  });

  const socketBob = io(SERVER_2, {
    auth: { token: auth2.token },
    transports: ['websocket']
  });

  await Promise.all([
    new Promise((resolve) => socketAlice.on('connection:ready', (data) => {
      console.log(`✓ Alice socket connected to ${data.instance}`);
      resolve();
    })),
    new Promise((resolve) => socketBob.on('connection:ready', (data) => {
      console.log(`✓ Bob socket connected to ${data.instance}`);
      resolve();
    }))
  ]);

  console.log('\n[Test 4] Testing Cross-Server Direct Messaging via Redis Pub/Sub...');
  // Alice on Server 1 sends a message to Bob on Server 2
  const testMessageText = `Hello Bob from Alice across instances! (Ref ${Date.now()})`;

  const messageReceivedPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Cross-server message delivery timed out')), 5000);
    socketBob.on('message:new', (msg) => {
      if (msg.text === testMessageText) {
        clearTimeout(timeout);
        console.log(`✓ SUCCESS! Bob (on Server 2) received message via Redis: "${msg.text}"`);
        console.log(`  Message ID: ${msg._id}, Sender: ${msg.sender?.name}`);
        resolve(msg);
      }
    });
  });

  socketAlice.emit('message:send', {
    receiverId: auth2.user._id,
    text: testMessageText
  }, (ack) => {
    console.log(`✓ Alice server acknowledged send: status ok=${ack.ok}`);
  });

  const receivedMsg = await messageReceivedPromise;

  // 4. Test Cross-Server Read Receipts
  console.log('\n[Test 5] Testing Cross-Server Read Receipt Propagation...');
  const readReceiptPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Read receipt timed out')), 5000);
    socketAlice.on('messages:read', (data) => {
      clearTimeout(timeout);
      console.log(`✓ SUCCESS! Alice received read receipt from Bob (Reader ID: ${data.readerId}) via Redis!`);
      resolve();
    });
  });

  socketBob.emit('message:read', { senderId: auth1.user._id });
  await readReceiptPromise;

  // 5. Test Group Creation & Cross-Server Group Messaging
  console.log('\n[Test 6] Testing Group Creation and Cross-Server Group Chat...');
  const groupRes = await postJson(`${SERVER_1}/api/groups`, {
    name: 'Distributed Systems Group',
    description: 'Testing cross-server group broadcasts',
    members: [auth2.user._id]
  }, auth1.token);

  const groupId = groupRes.group._id;
  console.log(`✓ Group created: "${groupRes.group.name}" with ID: ${groupId}`);

  // Bob joins group room
  socketBob.emit('group:join', groupId);

  const groupMsgText = 'Hello everyone in Distributed Systems Group!';
  const groupMsgPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Group message delivery timed out')), 5000);
    socketBob.on('message:new', (msg) => {
      if (msg.text === groupMsgText) {
        clearTimeout(timeout);
        console.log(`✓ SUCCESS! Bob received group message on Server 2: "${msg.text}"`);
        resolve(msg);
      }
    });
  });

  socketAlice.emit('message:send', {
    groupId,
    text: groupMsgText
  }, (ack) => {
    console.log(`✓ Alice group send acknowledged: ok=${ack.ok}`);
  });

  await groupMsgPromise;

  // 6. Test Message Persistence in MongoDB
  console.log('\n[Test 7] Verifying Message Persistence in MongoDB...');
  const history = await getJson(`${SERVER_1}/api/users/${auth2.user._id}/messages`, auth1.token);
  const found = history.messages.some(m => m.text === testMessageText);
  if (found) {
    console.log('✓ Message verified in MongoDB durable storage history.');
  } else {
    throw new Error('Message not found in database history!');
  }

  // Cleanup sockets
  socketAlice.disconnect();
  socketBob.disconnect();

  console.log('\n======================================================');
  console.log('🎉 ALL DISTRIBUTED TESTS PASSED PERFECTLY!');
  console.log('======================================================\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
