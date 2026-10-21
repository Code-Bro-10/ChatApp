import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  Search, MessageCircle, LogOut, Send, Paperclip, Smile, MoreVertical,
  Check, CheckCheck, ArrowLeft, Users, ShieldCheck, Server, X,
  LoaderCircle, Sun, Moon, Activity, Plus, Trash2, Edit2, Reply,
  FileText, Download, Info, CheckCircle2, AlertCircle, RefreshCw
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API;
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const COLORS = ['#128C7E', '#075E54', '#4F46E5', '#0F766E', '#B45309', '#BE185D', '#0369A1', '#7C3AED'];

function initials(name = '?') {
  return name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
}

function timeLabel(date) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function dayLabel(date) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

async function request(path, token, options = {}) {
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function Avatar({ user, size = 'normal', online = false, isGroup = false }) {
  const bg = user?.avatarColor || COLORS[(user?.name?.length || 0) % COLORS.length];
  return (
    <div className={`avatar ${size} ${isGroup ? 'group-avatar' : ''}`} style={{ background: bg }}>
      {isGroup ? <Users size={size === 'small' ? 14 : 20} /> : initials(user?.name)}
      {!isGroup && online && <i className="online-dot" />}
    </div>
  );
}

// ----------------- Auth Screen -----------------
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await request(`/api/auth/${mode}`, null, {
        method: 'POST',
        body: JSON.stringify({ name, email, password })
      });
      onAuth(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="brand-mark">
          <MessageCircle size={28} />
        </div>
        <p className="eyebrow">CHATSPHERE DISTRIBUTED</p>
        <h1>Good conversations<br /><span>start here.</span></h1>
        <p className="auth-copy">Real-time messaging powered by distributed Node.js & Redis.</p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'selected' : ''}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'selected' : ''}
            onClick={() => { setMode('register'); setError(''); }}
          >
            Create account
          </button>
        </div>

        <form onSubmit={submit} className="auth-form">
          {mode === 'register' && (
            <label>
              Full name
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={40}
              />
            </label>
          )}
          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={8}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-btn" disabled={busy} type="submit">
            {busy ? <LoaderCircle className="spin" size={18} /> : null}
            {mode === 'login' ? 'Sign in to ChatSphere' : 'Create my account'}
          </button>
        </form>

        <p className="secure-note">
          <ShieldCheck size={15} /> Passwords hashed with bcrypt; JWT authenticated
        </p>
      </div>
      <p className="auth-footer">CHATSPHERE <span>•</span> DISTRIBUTED SYSTEMS ARCHITECTURE</p>
    </main>
  );
}

// ----------------- System Monitor Modal -----------------
function SystemMonitorModal({ onClose, currentInstance }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = useCallback(async () => {
    try {
      const data = await request('/api/system/stats');
      setStats(data);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <h2><Activity size={18} style={{ verticalAlign: 'middle', marginRight: '6px' }} /> Real-time Cluster Monitor</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {loading && !stats ? (
            <div style={{ textAlign: 'center', padding: '40px' }}><LoaderCircle className="spin" /> Fetching live metrics...</div>
          ) : error ? (
            <p className="form-error">{error}</p>
          ) : stats ? (
            <>
              <div className="monitor-grid">
                <div className="stat-card">
                  <small>Active Backend Nodes</small>
                  <strong>{stats.cluster?.totalInstances || 1} Instances</strong>
                </div>
                <div className="stat-card">
                  <small>Cluster Sockets Connected</small>
                  <strong>{stats.cluster?.totalSockets || 0} Clients</strong>
                </div>
                <div className="stat-card">
                  <small>MongoDB Status</small>
                  <strong style={{ color: stats.services?.mongodb?.status === 'connected' ? '#25d366' : '#ef4444' }}>
                    {stats.services?.mongodb?.status?.toUpperCase()}
                  </strong>
                  <span style={{ fontSize: '11px', color: 'var(--text-soft)' }}>
                    {stats.services?.mongodb?.totalUsers} Users • {stats.services?.mongodb?.totalMessages} Msgs • {stats.services?.mongodb?.totalGroups} Groups
                  </span>
                </div>
                <div className="stat-card">
                  <small>Redis Pub/Sub Adapter</small>
                  <strong style={{ color: stats.services?.redis?.status === 'connected' ? '#25d366' : '#ef4444' }}>
                    {stats.services?.redis?.status?.toUpperCase()}
                  </strong>
                  <span style={{ fontSize: '11px', color: 'var(--text-soft)' }}>
                    Cross-Server Sync Active
                  </span>
                </div>
              </div>

              <h4 style={{ margin: '16px 0 8px', fontSize: '13px', color: 'var(--text-soft)', textTransform: 'uppercase' }}>
                Discovered Server Instances in Redis
              </h4>
              <div className="cluster-nodes-list">
                {stats.cluster?.instances?.map(inst => (
                  <div key={inst.instanceId} className={`node-item ${inst.isCurrent ? 'is-current' : ''}`}>
                    <div>
                      <strong>{inst.instanceId} {inst.isCurrent && <span className="node-badge">Connected Node</span>}</strong>
                      <div style={{ fontSize: '11px', color: 'var(--text-soft)', marginTop: '2px' }}>
                        Port: {inst.port} • PID: {inst.pid} • Memory RSS: {inst.memoryRssMb}MB • Uptime: {inst.uptimeSeconds}s
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{inst.activeSockets} Sockets</span>
                      <div style={{ fontSize: '10px', color: '#25d366' }}>● Live Heartbeat</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
        <div className="modal-footer">
          <button className="secondary-btn" onClick={fetchStats}>
            <RefreshCw size={13} style={{ marginRight: '5px' }} /> Refresh
          </button>
          <button className="primary-btn" onClick={onClose} style={{ padding: '0 20px', height: '40px' }}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ----------------- Create Group Modal -----------------
function CreateGroupModal({ token, contacts, onClose, onGroupCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function toggleUser(userId) {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function createGroup(e) {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Group name must be at least 2 characters.');
    if (selectedUsers.size === 0) return setError('Please select at least one member to add.');

    setBusy(true);
    setError('');
    try {
      const data = await request('/api/groups', token, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          members: Array.from(selectedUsers)
        })
      });
      onGroupCreated(data.group);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Group</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={createGroup}>
          <div className="modal-body">
            {error && <p className="form-error" style={{ marginBottom: '12px' }}>{error}</p>}
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', fontWeight: '600', marginBottom: '12px' }}>
              Group Name *
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Distributed Systems Study Group"
                required
                maxLength={50}
                style={{ height: '40px', padding: '0 12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-input)', color: 'var(--text-main)' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', fontWeight: '600', marginBottom: '16px' }}>
              Description (Optional)
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What is this group about?"
                maxLength={150}
                style={{ height: '40px', padding: '0 12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-input)', color: 'var(--text-main)' }}
              />
            </label>

            <h4 style={{ fontSize: '12px', color: 'var(--text-soft)', textTransform: 'uppercase', marginBottom: '8px' }}>
              Add Members ({selectedUsers.size} selected)
            </h4>
            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px' }}>
              {contacts.map(c => (
                <div
                  key={c._id}
                  onClick={() => toggleUser(c._id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: selectedUsers.has(c._id) ? 'var(--bg-active)' : 'transparent'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Avatar user={c} size="small" />
                    <span style={{ fontSize: '13px', fontWeight: '500' }}>{c.name}</span>
                  </div>
                  {selectedUsers.has(c._id) ? <CheckCircle2 size={16} color="var(--green-primary)" /> : <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '1px solid var(--border-color)' }} />}
                </div>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="secondary-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-btn" disabled={busy} style={{ padding: '0 18px', height: '40px' }}>
              {busy ? <LoaderCircle className="spin" size={16} /> : null} Create Group
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------- Group Details Modal -----------------
function GroupDetailsModal({ token, group, currentUserId, onClose, onGroupUpdated, onLeftGroup }) {
  const [details, setDetails] = useState(group);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = details.admins?.some(a => (a._id || a).toString() === currentUserId);

  async function leaveGroup() {
    if (!window.confirm('Are you sure you want to leave this group?')) return;
    try {
      await request(`/api/groups/${details._id}/members/${currentUserId}`, token, { method: 'DELETE' });
      onLeftGroup(details._id);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Group Info</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {error && <p className="form-error" style={{ marginBottom: '10px' }}>{error}</p>}
          <div style={{ textAlign: 'center', marginBottom: '18px' }}>
            <Avatar user={details} size="large" isGroup={true} />
            <h3 style={{ margin: '10px 0 2px', fontSize: '17px' }}>{details.name}</h3>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>{details.description || 'No description'}</p>
            <small style={{ color: 'var(--text-soft)', fontSize: '11px' }}>Group • {details.members?.length || 0} participants</small>
          </div>

          <h4 style={{ fontSize: '12px', color: 'var(--text-soft)', textTransform: 'uppercase', marginBottom: '8px' }}>
            Participants
          </h4>
          <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
            {details.members?.map(m => {
              const u = m.user;
              const isMemAdmin = m.role === 'admin' || details.admins?.some(a => (a._id || a).toString() === u?._id?.toString());
              return (
                <div key={u?._id || m._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Avatar user={u} size="small" />
                    <div>
                      <strong style={{ fontSize: '13px', display: 'block' }}>{u?.name} {u?._id?.toString() === currentUserId ? '(You)' : ''}</strong>
                      <small style={{ fontSize: '11px', color: 'var(--text-soft)' }}>{u?.email}</small>
                    </div>
                  </div>
                  {isMemAdmin && <span className="node-badge" style={{ fontSize: '9px' }}>Group Admin</span>}
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <button className="danger-btn" onClick={leaveGroup}>Leave Group</button>
          <button className="primary-btn" onClick={onClose} style={{ padding: '0 20px', height: '40px' }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ----------------- Main Chat App -----------------
export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('cs_theme') || 'dark');
  const [session, setSession] = useState(() => ({
    token: localStorage.getItem('cs_token'),
    user: JSON.parse(localStorage.getItem('cs_user') || 'null')
  }));

  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'unread' | 'groups'
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [active, setActive] = useState(null); // active user or group object
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [replyMessage, setReplyMessage] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Real-time state
  const [socket, setSocket] = useState(null);
  const [onlineIds, setOnlineIds] = useState(new Set());
  const [typingMap, setTypingMap] = useState(new Map()); // id -> name
  const [instance, setInstance] = useState('Connecting…');
  const [isDistributed, setIsDistributed] = useState(false);

  // Modals
  const [showMonitor, setShowMonitor] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showGroupDetails, setShowGroupDetails] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [mobileChat, setMobileChat] = useState(false);
  const [notice, setNotice] = useState('');

  const bottomRef = useRef(null);
  const typingTimer = useRef(null);
  const activeRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { activeRef.current = active; }, [active]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cs_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'));
  };

  // Browser notification permission request
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const showNotification = useCallback((title, body) => {
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try {
        new Notification(title, { body, icon: '/vite.svg' });
      } catch (e) {
        console.warn('Notification error:', e);
      }
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('cs_token');
    localStorage.removeItem('cs_user');
    socket?.disconnect();
    setSocket(null);
    setSession({ token: null, user: null });
    setContacts([]);
    setGroups([]);
    setActive(null);
    setMessages([]);
  }, [socket]);

  const onAuth = (data) => {
    localStorage.setItem('cs_token', data.token);
    localStorage.setItem('cs_user', JSON.stringify(data.user));
    setSession(data);
  };

  // Load Contacts & Groups
  const loadConversations = useCallback(async () => {
    if (!session.token) return;
    try {
      const [uData, gData] = await Promise.all([
        request(`/api/users?q=${encodeURIComponent(query)}`, session.token),
        request('/api/groups', session.token)
      ]);
      setContacts(uData.users || []);
      setGroups(gData.groups || []);
    } catch (e) {
      setNotice(e.message);
    }
  }, [session.token, query]);

  useEffect(() => {
    if (!session.token) return;
    const t = setTimeout(loadConversations, 180);
    return () => clearTimeout(t);
  }, [loadConversations, session.token]);

  // Socket.IO Setup
  useEffect(() => {
    if (!session.token) return;
    const s = io(SOCKET_URL, {
      auth: { token: session.token },
      transports: ['websocket', 'polling']
    });
    setSocket(s);

    s.on('connect', () => setNotice(''));
    s.on('connect_error', (e) => setNotice(e.message || 'Connection error'));
    s.on('connection:ready', (data) => {
      setInstance(data.instance);
      setIsDistributed(Boolean(data.distributed));
    });

    // Presence
    s.on('presence:update', ({ userId, online }) => {
      setOnlineIds(old => {
        const next = new Set(old);
        online ? next.add(userId) : next.delete(userId);
        return next;
      });
    });

    // Real-time new message
    s.on('message:new', (message) => {
      const current = activeRef.current;
      const isForActiveDirect = current && !current.isGroup &&
        (message.sender?._id === current._id || message.receiver === current._id);
      const isForActiveGroup = current && current.isGroup &&
        message.group === current._id;

      if (isForActiveDirect || isForActiveGroup) {
        setMessages(old => old.some(m => m._id === message._id) ? old : [...old, message]);
        // Mark read
        if (message.sender?._id !== session.user?._id) {
          if (current.isGroup) {
            s.emit('message:read', { groupId: current._id });
          } else {
            s.emit('message:read', { senderId: current._id });
          }
        }
      } else {
        // Increment unread count in contact/group list
        if (message.conversationType === 'group') {
          setGroups(old => old.map(g => g._id === message.group ? { ...g, unreadCount: (g.unreadCount || 0) + 1, lastMessage: { text: message.text, createdAt: message.createdAt } } : g));
        } else {
          setContacts(old => old.map(c => c._id === message.sender?._id ? { ...c, unreadCount: (c.unreadCount || 0) + 1, lastMessage: { text: message.text, createdAt: message.createdAt, sender: message.sender?._id } } : c));
        }
        // Browser notification
        showNotification(
          message.conversationType === 'group' ? 'New group message' : `Message from ${message.sender?.name || 'someone'}`,
          message.text || 'Sent an attachment'
        );
      }

      // Update snippet order
      loadConversations();
    });

    // Real-time message update (edit)
    s.on('message:updated', (updated) => {
      setMessages(old => old.map(m => m._id === updated._id ? updated : m));
    });

    // Real-time message delete
    s.on('message:deleted', (deleted) => {
      setMessages(old => old.map(m => m._id === deleted._id ? { ...m, isDeleted: true, text: 'This message was deleted', attachments: [] } : m));
    });

    // Real-time reactions
    s.on('message:reaction', ({ messageId, reactions }) => {
      setMessages(old => old.map(m => m._id === messageId ? { ...m, reactions } : m));
    });

    // Typing updates
    s.on('typing:update', ({ userId, userName, groupId, typing }) => {
      setTypingMap(old => {
        const next = new Map(old);
        const key = groupId ? `group:${groupId}:${userId}` : userId;
        if (typing) next.set(key, userName || 'Someone');
        else next.delete(key);
        return next;
      });
    });

    // Read receipts
    s.on('messages:read', ({ readerId, readAt }) => {
      if (activeRef.current?._id === readerId) {
        setMessages(old => old.map(m => !m.readAt ? { ...m, readAt, deliveredAt: m.deliveredAt || readAt } : m));
      }
    });

    // Group events
    s.on('group:created', (newGroup) => {
      setGroups(old => [newGroup, ...old]);
      s.emit('group:join', newGroup._id);
    });

    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [session.token, session.user?._id, loadConversations, showNotification]);

  // Auto scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, active, typingMap]);

  // Open Chat
  async function openConversation(item, isGroup = false) {
    const fullItem = { ...item, isGroup };
    setActive(fullItem);
    activeRef.current = fullItem;
    setMobileChat(true);
    setLoadingMessages(true);
    setMessages([]);
    setReplyMessage(null);
    setAttachment(null);

    // Reset unread locally
    if (isGroup) {
      setGroups(old => old.map(g => g._id === item._id ? { ...g, unreadCount: 0 } : g));
    } else {
      setContacts(old => old.map(c => c._id === item._id ? { ...c, unreadCount: 0 } : c));
    }

    try {
      const endpoint = isGroup
        ? `/api/groups/${item._id}/messages?limit=100`
        : `/api/users/${item._id}/messages?limit=100`;

      const data = await request(endpoint, session.token);
      setMessages(data.messages || []);

      if (isGroup) {
        socket?.emit('message:read', { groupId: item._id });
      } else {
        socket?.emit('message:read', { senderId: item._id });
      }
    } catch (e) {
      setNotice(e.message);
    } finally {
      setLoadingMessages(false);
    }
  }

  // Send Message
  async function sendMessage(e) {
    e.preventDefault();
    const text = draft.trim();
    if ((!text && !attachment) || !active || !socket) return;

    let uploadedAttachments = [];
    if (attachment) {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', attachment.file);
        const res = await request('/api/upload', session.token, {
          method: 'POST',
          body: formData
        });
        uploadedAttachments = [res.file];
      } catch (err) {
        setNotice(err.message);
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    const clientMsgId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const payload = {
      text,
      attachments: uploadedAttachments,
      replyTo: replyMessage?._id || null,
      clientMsgId,
      ...(active.isGroup ? { groupId: active._id } : { receiverId: active._id })
    };

    socket.emit('message:send', payload, (result) => {
      if (!result?.ok) {
        setNotice(result?.error || 'Message could not be sent.');
      }
    });

    setDraft('');
    setAttachment(null);
    setReplyMessage(null);

    if (active.isGroup) {
      socket.emit('typing:stop', { groupId: active._id });
    } else {
      socket.emit('typing:stop', { receiverId: active._id });
    }
  }

  function changeDraft(value) {
    setDraft(value);
    if (!socket || !active) return;
    const isTyping = value.trim().length > 0;
    const typingPayload = active.isGroup ? { groupId: active._id } : { receiverId: active._id };

    socket.emit(isTyping ? 'typing:start' : 'typing:stop', typingPayload);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit('typing:stop', typingPayload);
    }, 1500);
  }

  // React to message
  async function toggleReaction(messageId, emoji) {
    try {
      await request(`/api/messages/${messageId}/reactions`, session.token, {
        method: 'POST',
        body: JSON.stringify({ emoji })
      });
    } catch (e) {
      setNotice(e.message);
    }
  }

  // Delete message
  async function deleteMessage(messageId) {
    if (!window.confirm('Delete this message for everyone?')) return;
    try {
      await request(`/api/messages/${messageId}`, session.token, { method: 'DELETE' });
    } catch (e) {
      setNotice(e.message);
    }
  }

  // Save edited message
  async function saveEditedMessage() {
    if (!editingMessage || !editText.trim()) return;
    try {
      await request(`/api/messages/${editingMessage._id}`, session.token, {
        method: 'PATCH',
        body: JSON.stringify({ text: editText.trim() })
      });
      setEditingMessage(null);
    } catch (e) {
      setNotice(e.message);
    }
  }

  // File selection
  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setNotice('File size exceeds 5MB limit.');
      return;
    }
    setAttachment({
      file,
      name: file.name,
      isImage: file.type.startsWith('image/'),
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    });
  }

  // Filtered conversations list
  const filteredList = useMemo(() => {
    let list = [];
    if (filterTab === 'all') {
      list = [...groups, ...contacts];
    } else if (filterTab === 'groups') {
      list = groups;
    } else if (filterTab === 'unread') {
      list = [...groups, ...contacts].filter(c => (c.unreadCount || 0) > 0);
    }

    if (query) {
      const q = query.toLowerCase();
      list = list.filter(item => item.name.toLowerCase().includes(q) || (item.email && item.email.toLowerCase().includes(q)));
    }

    return list.sort((a, b) => {
      const timeA = new Date(a.lastMessage?.createdAt || 0).getTime();
      const timeB = new Date(b.lastMessage?.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }, [contacts, groups, filterTab, query]);

  const totalUnreadCount = useMemo(() => {
    const uCount = contacts.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
    const gCount = groups.reduce((acc, g) => acc + (g.unreadCount || 0), 0);
    return uCount + gCount;
  }, [contacts, groups]);

  const groupedMessages = useMemo(() => {
    let previousDay = '';
    return messages.map(m => {
      const day = dayLabel(m.createdAt);
      const showDay = day !== previousDay;
      previousDay = day;
      return { ...m, showDay, day };
    });
  }, [messages]);

  // Active conversation typing check
  const activeTypingText = useMemo(() => {
    if (!active) return '';
    if (active.isGroup) {
      const typers = [];
      for (const [key, name] of typingMap.entries()) {
        if (key.startsWith(`group:${active._id}:`)) typers.push(name);
      }
      return typers.length ? `${typers.join(', ')} typing…` : '';
    } else {
      return typingMap.has(active._id) ? 'typing…' : '';
    }
  }, [active, typingMap]);

  if (!session.token || !session.user) {
    return <AuthScreen onAuth={onAuth} />;
  }

  return (
    <main className="app-shell">
      <div className="app-window">
        {/* Left Sidebar */}
        <aside className={`sidebar ${mobileChat ? 'hide-mobile' : ''}`}>
          <header className="side-header">
            <div className="my-profile">
              <Avatar user={session.user} online={true} />
              <div className="my-profile-text">
                <strong>{session.user.name}</strong>
                <small>Available</small>
              </div>
            </div>
            <div className="header-actions">
              <button
                className="header-btn"
                title="System & Cluster Monitor"
                onClick={() => setShowMonitor(true)}
              >
                <Activity size={18} />
              </button>
              <button
                className="header-btn"
                title="Create New Group"
                onClick={() => setShowCreateGroup(true)}
              >
                <Plus size={19} />
              </button>
              <button
                className="header-btn"
                title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                onClick={toggleTheme}
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button className="header-btn" title="Sign out" onClick={logout}>
                <LogOut size={18} />
              </button>
            </div>
          </header>

          {/* Search Bar */}
          <div className="search-wrap">
            <Search size={16} />
            <input
              id="contact-search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search or start new chat"
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear search">
                <X size={15} />
              </button>
            )}
          </div>

          {/* Conversation Filter Chips */}
          <div className="conversation-filters">
            <button
              className={`filter-chip ${filterTab === 'all' ? 'active' : ''}`}
              onClick={() => setFilterTab('all')}
            >
              All
            </button>
            <button
              className={`filter-chip ${filterTab === 'unread' ? 'active' : ''}`}
              onClick={() => setFilterTab('unread')}
            >
              Unread
              {totalUnreadCount > 0 && <span className="filter-badge">{totalUnreadCount}</span>}
            </button>
            <button
              className={`filter-chip ${filterTab === 'groups' ? 'active' : ''}`}
              onClick={() => setFilterTab('groups')}
            >
              Groups
              {groups.length > 0 && <span className="filter-badge">{groups.length}</span>}
            </button>
          </div>

          {/* Conversations List */}
          <div className="contact-list">
            {filteredList.map(item => {
              const isGroup = Boolean(item.isGroup);
              const isActive = active?._id === item._id;
              const isOnline = !isGroup && onlineIds.has(item._id);
              const isTyping = isGroup
                ? Array.from(typingMap.keys()).some(k => k.startsWith(`group:${item._id}:`))
                : typingMap.has(item._id);

              return (
                <button
                  key={item._id}
                  className={`contact-row ${isActive ? 'active' : ''}`}
                  onClick={() => openConversation(item, isGroup)}
                >
                  <Avatar user={item} online={isOnline} isGroup={isGroup} />
                  <div className="contact-info">
                    <div className="contact-top">
                      <strong>
                        {item.name}
                        {isGroup && <span className="group-tag">Group</span>}
                      </strong>
                      <time>{timeLabel(item.lastMessage?.createdAt)}</time>
                    </div>
                    <div className="contact-bottom">
                      <span className={isTyping ? 'typing-text' : ''}>
                        {isTyping ? 'typing…' : item.lastMessage?.text || (isGroup ? `${item.members?.length || 0} members` : item.email)}
                      </span>
                      {item.unreadCount > 0 ? (
                        <span className="unread-badge">{item.unreadCount}</span>
                      ) : !isGroup && item.lastMessage?.sender === session.user._id ? (
                        <CheckCheck size={14} className={`list-tick ${item.lastMessage?.readAt ? 'read' : ''}`} />
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}

            {filteredList.length === 0 && (
              <div className="empty-contacts">
                <Users size={28} />
                <p>{query ? 'No matching conversations' : filterTab === 'unread' ? 'No unread messages' : 'No conversations yet'}</p>
                <small>Create a group or invite someone to begin chatting.</small>
              </div>
            )}
          </div>

          {/* Sidebar Footer with Live Cluster Badge */}
          <footer className="sidebar-footer">
            <div className="system-status">
              <span className={`status-pulse ${instance.startsWith('server') ? '' : 'offline'}`} />
              <span>Connected to {instance}</span>
            </div>
            <button
              onClick={() => setShowMonitor(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-soft)' }}
            >
              <Server size={13} /> {isDistributed ? 'Cluster Active' : 'Single Node'}
            </button>
          </footer>
        </aside>

        {/* Central Chat Panel */}
        <section className={`chat-panel ${!mobileChat ? 'empty-mobile' : ''}`}>
          {!active ? (
            <div className="welcome-screen">
              <div className="welcome-art">
                <MessageCircle size={46} strokeWidth={1.5} />
              </div>
              <p className="eyebrow">DISTRIBUTED REAL-TIME MESSAGING</p>
              <h1>ChatSphere <span>Distributed</span></h1>
              <p className="welcome-copy">
                Select a direct message or group conversation to start chatting.
                Messages are synchronized across server instances with Redis Pub/Sub and saved in MongoDB.
              </p>
              <button
                className="secondary-btn"
                onClick={() => setShowMonitor(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Activity size={15} /> Open System & Cluster Monitor
              </button>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <header className="chat-header">
                <button
                  className="back-btn"
                  onClick={() => setMobileChat(false)}
                  aria-label="Back to conversations"
                >
                  <ArrowLeft size={20} />
                </button>
                <Avatar
                  user={active}
                  online={!active.isGroup && onlineIds.has(active._id)}
                  isGroup={active.isGroup}
                />
                <div className="chat-heading" onClick={() => active.isGroup && setShowGroupDetails(true)} style={{ cursor: active.isGroup ? 'pointer' : 'default' }}>
                  <strong>{active.name}</strong>
                  <small>
                    {activeTypingText ? (
                      <span className="typing-text">{activeTypingText}</span>
                    ) : active.isGroup ? (
                      `${active.members?.length || 0} participants • Tap for info`
                    ) : onlineIds.has(active._id) ? (
                      'online now'
                    ) : (
                      `last seen ${active.lastSeen ? timeLabel(active.lastSeen) : 'recently'}`
                    )}
                  </small>
                </div>
                <div className="chat-header-actions">
                  {active.isGroup && (
                    <button
                      className="header-btn"
                      title="Group Details"
                      onClick={() => setShowGroupDetails(true)}
                    >
                      <Info size={19} />
                    </button>
                  )}
                  <button
                    className="header-btn"
                    title="Cluster Monitor"
                    onClick={() => setShowMonitor(true)}
                  >
                    <Activity size={18} />
                  </button>
                </div>
              </header>

              {/* Messages Area */}
              <div className="messages-area">
                <div className="encryption-note">
                  <ShieldCheck size={14} color="var(--green-primary)" />
                  Messages are authenticated with JWT and stored in MongoDB.
                </div>

                {loadingMessages ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-soft)' }}>
                    <LoaderCircle className="spin" size={20} /> Loading message history…
                  </div>
                ) : groupedMessages.length === 0 ? (
                  <div className="empty-contacts" style={{ padding: '60px 0' }}>
                    <MessageCircle size={32} />
                    <p>No messages yet</p>
                    <small>Say hello and start the conversation!</small>
                  </div>
                ) : (
                  groupedMessages.map((m) => {
                    const isMine = (m.sender?._id || m.sender) === session.user._id;
                    const senderName = m.sender?.name || 'Someone';

                    return (
                      <React.Fragment key={m._id || m.clientMsgId}>
                        {m.showDay && (
                          <div className="day-separator">
                            <span>{m.day}</span>
                          </div>
                        )}
                        <div className={`message-row ${isMine ? 'mine' : 'theirs'}`}>
                          <div className="message-bubble-container">
                            <div className="message-bubble">
                              {/* Sender name in group */}
                              {active.isGroup && !isMine && (
                                <div className="sender-tag">{senderName}</div>
                              )}

                              {/* Quoted reply */}
                              {m.replyTo && (
                                <div className="reply-quote">
                                  <strong>{m.replyTo.sender?.name || 'Reply'}</strong>
                                  <p>{m.replyTo.text || 'Attachment'}</p>
                                </div>
                              )}

                              {/* Attachments */}
                              {m.attachments?.length > 0 && (
                                <div className="bubble-attachments">
                                  {m.attachments.map((att, i) => {
                                    const fileUrl = `${API}${att.url}`;
                                    const isImg = att.mimeType.startsWith('image/');
                                    if (isImg) {
                                      return (
                                        <div key={i} className="image-attachment">
                                          <img
                                            src={fileUrl}
                                            alt={att.originalName}
                                            onClick={() => setLightboxUrl(fileUrl)}
                                          />
                                        </div>
                                      );
                                    }
                                    return (
                                      <a
                                        key={i}
                                        href={fileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="doc-attachment"
                                        download
                                      >
                                        <FileText size={24} color="var(--green-primary)" />
                                        <div className="doc-info">
                                          <strong>{att.originalName}</strong>
                                          <small>{Math.round(att.size / 1024)} KB • Click to download</small>
                                        </div>
                                        <Download size={16} />
                                      </a>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Message text */}
                              <p className={`message-text ${m.isDeleted ? 'deleted-text' : ''}`}>
                                {m.text}
                              </p>

                              {/* Meta: time, edited, tick */}
                              <div className="message-meta">
                                {m.isEdited && <span className="edited-tag">(edited)</span>}
                                <time>{timeLabel(m.createdAt)}</time>
                                {isMine && !m.isDeleted && (
                                  m.readAt ? (
                                    <CheckCheck size={14} className="read-tick" />
                                  ) : m.deliveredAt ? (
                                    <CheckCheck size={14} />
                                  ) : (
                                    <Check size={14} />
                                  )
                                )}
                              </div>
                            </div>

                            {/* Reactions Strip */}
                            {m.reactions?.length > 0 && (
                              <div className="reactions-strip">
                                {Array.from(new Set(m.reactions.map(r => r.emoji))).map(emoji => {
                                  const count = m.reactions.filter(r => r.emoji === emoji).length;
                                  const reacted = m.reactions.some(r => r.emoji === emoji && (r.user?._id || r.user) === session.user._id);
                                  return (
                                    <span
                                      key={emoji}
                                      className={`reaction-pill ${reacted ? 'reacted' : ''}`}
                                      onClick={() => toggleReaction(m._id, emoji)}
                                    >
                                      {emoji} {count > 1 ? count : ''}
                                    </span>
                                  );
                                })}
                              </div>
                            )}

                            {/* Action Buttons on hover */}
                            {!m.isDeleted && (
                              <div className="message-actions-trigger">
                                <button
                                  className="action-icon-btn"
                                  title="Reply"
                                  onClick={() => setReplyMessage(m)}
                                >
                                  <Reply size={13} />
                                </button>
                                <div style={{ position: 'relative' }}>
                                  <button
                                    className="action-icon-btn"
                                    title="React"
                                    onClick={() => toggleReaction(m._id, '❤️')}
                                  >
                                    <Smile size={13} />
                                  </button>
                                </div>
                                {isMine && (
                                  <>
                                    <button
                                      className="action-icon-btn"
                                      title="Edit"
                                      onClick={() => { setEditingMessage(m); setEditText(m.text); }}
                                    >
                                      <Edit2 size={13} />
                                    </button>
                                    <button
                                      className="action-icon-btn"
                                      title="Delete"
                                      onClick={() => deleteMessage(m._id)}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* Composer */}
              <div className="composer-container">
                {/* Reply Banner */}
                {replyMessage && (
                  <div className="reply-banner">
                    <div className="reply-banner-content">
                      <strong>Replying to {replyMessage.sender?.name || 'message'}</strong>
                      <p>{replyMessage.text || 'Attachment'}</p>
                    </div>
                    <button onClick={() => setReplyMessage(null)}><X size={16} /></button>
                  </div>
                )}

                {/* Attachment Preview Banner */}
                {attachment && (
                  <div className="attachment-preview-banner">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {attachment.isImage ? (
                        <img src={attachment.previewUrl} alt="preview" style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover' }} />
                      ) : (
                        <FileText size={20} />
                      )}
                      <span>{attachment.name}</span>
                    </div>
                    <button onClick={() => setAttachment(null)}><X size={16} /></button>
                  </div>
                )}

                <form className="composer" onSubmit={sendMessage}>
                  {/* Quick Emoji picker */}
                  <div style={{ display: 'flex', gap: '2px' }}>
                    {QUICK_EMOJIS.slice(0, 3).map(e => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => changeDraft(draft + e)}
                        style={{ fontSize: '18px', padding: '2px 4px' }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>

                  {/* Attachment button */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    className="header-btn"
                    title="Attach File or Image"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip size={19} />
                  </button>

                  <input
                    value={draft}
                    onChange={e => changeDraft(e.target.value)}
                    placeholder="Type a message"
                    maxLength={4000}
                    disabled={uploading}
                  />

                  <button
                    className="send-btn"
                    type="submit"
                    disabled={(!draft.trim() && !attachment) || uploading}
                    aria-label="Send message"
                  >
                    {uploading ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
                  </button>
                </form>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Modals */}
      {showMonitor && (
        <SystemMonitorModal
          currentInstance={instance}
          onClose={() => setShowMonitor(false)}
        />
      )}

      {showCreateGroup && (
        <CreateGroupModal
          token={session.token}
          contacts={contacts}
          onClose={() => setShowCreateGroup(false)}
          onGroupCreated={(newGrp) => {
            setGroups(old => [newGrp, ...old]);
            openConversation(newGrp, true);
          }}
        />
      )}

      {showGroupDetails && active?.isGroup && (
        <GroupDetailsModal
          token={session.token}
          group={active}
          currentUserId={session.user._id}
          onClose={() => setShowGroupDetails(false)}
          onGroupUpdated={(updated) => {
            setActive(updated);
            setGroups(old => old.map(g => g._id === updated._id ? updated : g));
          }}
          onLeftGroup={(groupId) => {
            setGroups(old => old.filter(g => g._id !== groupId));
            setActive(null);
            setMessages([]);
          }}
        />
      )}

      {/* Edit Message Modal */}
      {editingMessage && (
        <div className="modal-overlay" onClick={() => setEditingMessage(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2>Edit Message</h2>
              <button onClick={() => setEditingMessage(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={4}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-main)',
                  resize: 'none'
                }}
              />
            </div>
            <div className="modal-footer">
              <button className="secondary-btn" onClick={() => setEditingMessage(null)}>Cancel</button>
              <button className="primary-btn" onClick={saveEditedMessage} style={{ padding: '0 18px', height: '40px' }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox */}
      {lightboxUrl && (
        <div className="modal-overlay" onClick={() => setLightboxUrl(null)}>
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img src={lightboxUrl} alt="Enlarged" style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '10px', display: 'block' }} />
            <button
              onClick={() => setLightboxUrl(null)}
              style={{ position: 'absolute', top: '-38px', right: '0', color: '#ffffff' }}
            >
              <X size={24} />
            </button>
          </div>
        </div>
      )}

      {/* Toast Alert */}
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}
    </main>
  );
}
