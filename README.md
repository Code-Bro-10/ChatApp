# ChatSphere — Distributed Real-Time Messaging System

ChatSphere is a production-inspired, horizontally scalable distributed chat application built for a college project demonstration. It features multi-server Socket.IO event coordination via Redis Pub/Sub, MongoDB message persistence, and a polished WhatsApp-inspired React UI with an integrated Real-Time Cluster Monitor.

---

## Key Features

- **WhatsApp-Inspired Premium Interface:**
  - Modern Dark & Light theme toggle (saved across sessions).
  - Conversation search and filter tabs (**All**, **Unread**, **Groups**) with live counter badges.
  - Formatted timestamps, day separators ("Today", "Yesterday"), and responsive mobile back navigation.
- **Real-Time Distributed Messaging:**
  - One-to-one direct messaging with persistent MongoDB history.
  - Multi-user Group Chats with administrator controls and participant drawers.
  - Typing indicators with auto-clearing debounce.
  - Sent (✓), delivered (✓✓ grey), and read receipts (✓✓ blue).
  - Live presence tracking across instances.
- **Advanced Chat Capabilities:**
  - Quoted message replies.
  - Real-time emoji reactions (`👍`, `❤️`, `😂`, `😮`, `😢`, `🙏`).
  - 24-hour message editing with `(edited)` indicator.
  - Message deletion ("This message was deleted").
  - File and image uploads (JPEG, PNG, WEBP, GIF, PDF, DOCX) with lightbox preview and download cards.
  - Native browser desktop notifications.
- **Distributed Architecture & Cluster Monitoring:**
  - Cross-server message delivery across independent Node.js instances via Redis Pub/Sub adapter.
  - Live **System & Cluster Monitor Dashboard** displaying active nodes, process IDs, memory RSS, socket counts, MongoDB, and Redis connection health.
  - Deduplication and idempotency via `clientMsgId`.
- **Security & Reliability:**
  - bcrypt password hashing (salt rounds = 12).
  - Signed JWT authentication for REST APIs and WebSocket handshakes.
  - Rate limiting with `express-rate-limit` against brute-force attacks.
  - Strict server-side conversation membership and role validation.

---

## Technology Stack

- **Frontend:** React 18, Vite 6, Socket.IO Client, Lucide React, Vanilla CSS Tokens
- **Backend:** Node.js (ES Modules), Express 4, Socket.IO 4, Multer, Express Rate Limit
- **Message Broker:** Redis 7 (`@socket.io/redis-adapter` for inter-process socket rooms)
- **Database:** MongoDB 7 + Mongoose (indexes on users, groups, and conversations)
- **Containerization:** Docker Compose for local database & cache services

---

## Quick Start Guide

### 1. Start MongoDB and Redis Services
Ensure Docker Desktop is running, then from the root directory:
```bash
docker compose up -d
```
Verify containers are running:
```bash
docker ps
```

### 2. Configure Environment Files
**Server:**
Copy `server/.env.example` to `server/.env` (already created with a secure 256-bit JWT secret):
```env
PORT=5000
INSTANCE_ID=server-5000
MONGODB_URI=mongodb://127.0.0.1:27017/chatsphere
JWT_SECRET=your_secure_256_bit_secret
CLIENT_ORIGIN=http://localhost:5173,http://localhost:5174
REDIS_URL=redis://localhost:6379
```

**Client:**
Copy `client/.env.example` to `client/.env`:
```env
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

### 3. Run the Servers

#### Terminal 1 — Start Server Instance 1 (Port 5000):
```powershell
cd server
npm install
npm run dev
```

#### Terminal 2 — Start Server Instance 2 (Port 5001):
```powershell
cd server
$env:PORT="5001"; $env:INSTANCE_ID="server-5001"; npm start
```

#### Terminal 3 — Start the Frontend:
```powershell
cd client
npm install
npm run dev
```
Open **[http://localhost:5173](http://localhost:5173)** in your browser!

---

## Automated Distributed Test Suite

ChatSphere includes an automated test script that connects two WebSocket clients to two distinct server instances (`server-5000` and `server-5001`) and validates real-time event routing over Redis:

From the `server` directory, run:
```bash
npm test
```
**Test Coverage:**
1. Health and cluster discovery check on both instances.
2. User registration and JWT authentication on different nodes.
3. Cross-server direct message delivery via Redis Pub/Sub.
4. Cross-server read receipt propagation.
5. Group creation and cross-server group broadcast.
6. MongoDB durable storage verification.

---

## Project Structure

```text
ChatSphere-Distributed-Chat-System/
├── docker-compose.yml       # Local MongoDB and Redis Docker services
├── README.md                # System documentation and instructions
├── docs/
│   └── PROJECT_REPORT.md    # Mini project report, architecture & viva guide
├── server/
│   ├── src/
│   │   ├── index.js         # Express setup, Socket.IO, Redis adapter
│   │   ├── cluster.js       # Redis heartbeat & cluster discovery
│   │   ├── middleware/
│   │   │   ├── auth.js      # JWT authentication middleware
│   │   │   └── rateLimit.js # Rate limiters for auth, upload, API
│   │   ├── models/
│   │   │   ├── User.js      # User accounts & preferences
│   │   │   ├── Group.js     # Group conversations & roles
│   │   │   └── Message.js   # Messages, attachments, reactions, replies
│   │   └── routes/
│   │       ├── auth.js      # Register, login, profile routes
│   │       ├── users.js     # Contact list & 1-on-1 messages
│   │       ├── groups.js    # Group management & group messages
│   │       ├── messages.js  # Message edit, delete, react
│   │       ├── upload.js    # File & image upload route
│   │       └── system.js    # Cluster health & metrics API
│   ├── uploads/             # Static file uploads directory
│   ├── test-distributed.js  # Automated cross-server integration tests
│   └── package.json
└── client/
    ├── src/
    │   ├── App.jsx          # WhatsApp-inspired React UI & modals
    │   ├── main.jsx         # React application root
    │   └── styles.css       # WhatsApp theme tokens (Dark & Light)
    ├── vite.config.js       # Vite React configuration
    └── package.json
```

---

## College Viva Demonstration Checklist

1. **Containers:** Show `docker ps` with `chatsphere-mongodb` and `chatsphere-redis`.
2. **Cluster Monitor:** Click the **Pulse/Activity** icon in ChatSphere to demonstrate the live cluster view (showing `server-5000` and `server-5001`, real memory RSS, PIDs, and socket counts).
3. **Themes & Filters:** Toggle dark/light theme, and use filter chips (**All**, **Unread**, **Groups**).
4. **Distributed Messaging:** Open two separate browser profiles (one connected to each account) and show instant delivery with read ticks.
5. **Interactive Features:** Demonstrate message replies, emoji reactions, message edits, file uploads, and group creation.
6. **Integration Test:** Run `npm test` in the terminal to show all automated distributed tests passing.
