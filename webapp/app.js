/* global crypto, fetch */
(function () {
  const state = {
    accessToken: '',
    refreshToken: '',
    user: null,
    friends: [],
    groups: [],
    friendMap: {},
    groupMap: {},
    view: 'chats',
    active: null,
    messages: [],
    unread: { direct: {}, group: {} },
    ws: null,
    wsConnected: false,
    sessionId: '',
    encKey: null,
    macKey: null,
    refreshInFlight: false,
    pollTimer: null,
  };

  let renderListScheduled = false;

  const els = {
    app: document.getElementById('app'),
    statusPill: document.getElementById('statusPill'),
    userPill: document.getElementById('userPill'),
    btnLogout: document.getElementById('btnLogout'),
    tabs: document.querySelectorAll('.tab'),
    searchInput: document.getElementById('searchInput'),
    listView: document.getElementById('listView'),
    conversationTitle: document.getElementById('conversationTitle'),
    conversationMeta: document.getElementById('conversationMeta'),
    messageList: document.getElementById('messageList'),
    messageInput: document.getElementById('messageInput'),
    composer: document.getElementById('composer'),
    emptyState: document.getElementById('emptyState'),
    loginView: document.getElementById('loginView'),
    loginForm: document.getElementById('loginForm'),
    loginIdentifier: document.getElementById('loginIdentifier'),
    loginPassword: document.getElementById('loginPassword'),
    btnBackList: document.getElementById('btnBackList'),
    toast: document.getElementById('toast'),
  };

  const LS_ACCESS = 'oldchat_access_token';
  const LS_REFRESH = 'oldchat_refresh_token';
  const LS_USER = 'oldchat_user';
  const LS_DEVICE = 'oldchat_device_id';

  function showToast(message) {
    if (!message) return;
    els.toast.textContent = message;
    els.toast.classList.add('show');
    setTimeout(() => els.toast.classList.remove('show'), 2200);
  }

  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function getDeviceId() {
    let id = localStorage.getItem(LS_DEVICE);
    if (id) return id;
    if (crypto && typeof crypto.randomUUID === 'function') {
      id = crypto.randomUUID();
    } else {
      id = `web-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    }
    localStorage.setItem(LS_DEVICE, id);
    return id;
  }

  function setStatus(online) {
    state.wsConnected = online;
    if (online) {
      els.statusPill.textContent = '在线';
      els.statusPill.classList.add('online');
    } else {
      els.statusPill.textContent = '离线';
      els.statusPill.classList.remove('online');
    }
    if (state.accessToken) {
      startPolling();
    }
  }

  function showLogin(show) {
    if (show) {
      els.loginView.classList.add('show');
    } else {
      els.loginView.classList.remove('show');
    }
  }

  function setUser(user) {
    state.user = user;
    if (user) {
      const name = user.display_name || user.username || user.uid || '已登录';
      els.userPill.textContent = name;
    } else {
      els.userPill.textContent = '未登录';
    }
  }

  function setView(view) {
    state.view = view;
    els.app.dataset.view = view;
    els.tabs.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    scheduleRenderList();
  }

  function setPanel(panel) {
    els.app.dataset.panel = panel;
  }

  function saveAuth() {
    localStorage.setItem(LS_ACCESS, state.accessToken || '');
    localStorage.setItem(LS_REFRESH, state.refreshToken || '');
    localStorage.setItem(LS_USER, state.user ? JSON.stringify(state.user) : '');
  }

  function loadAuth() {
    state.accessToken = localStorage.getItem(LS_ACCESS) || '';
    state.refreshToken = localStorage.getItem(LS_REFRESH) || '';
    const rawUser = localStorage.getItem(LS_USER);
    if (rawUser) {
      try {
        state.user = JSON.parse(rawUser);
      } catch (err) {
        state.user = null;
      }
    }
  }

  async function apiRequest(path, options) {
    const opts = options || {};
    const headers = opts.headers || {};
    const needsAuth = opts.auth !== false;
    if (needsAuth && state.accessToken) {
      headers.Authorization = `Bearer ${state.accessToken}`;
    }
    if (opts.body && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body,
    });

    if (response.status === 401 && needsAuth && state.refreshToken) {
      const refreshed = await refreshToken();
      if (refreshed) {
        return apiRequest(path, options);
      }
    }

    const text = await response.text();
    if (!text) {
      return { ok: response.ok, data: null };
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      data = text;
    }
    if (!response.ok) {
      throw { status: response.status, data };
    }
    return { ok: true, data };
  }

  async function refreshToken() {
    if (state.refreshInFlight) return false;
    state.refreshInFlight = true;
    try {
      const resp = await apiRequest('/v1/auth/refresh', {
        method: 'POST',
        body: { refresh_token: state.refreshToken },
        auth: false,
      });
      if (resp && resp.data && resp.data.access_token) {
        state.accessToken = resp.data.access_token;
        if (resp.data.refresh_token) {
          state.refreshToken = resp.data.refresh_token;
        }
        saveAuth();
        return true;
      }
      return false;
    } catch (err) {
      return false;
    } finally {
      state.refreshInFlight = false;
    }
  }

  async function login(identifier, password) {
    const body = {
      identifier,
      password,
      device_id: getDeviceId(),
      device_name: navigator.userAgent.slice(0, 120),
      platform: 'web',
      app_version: 'web',
    };
    const resp = await apiRequest('/v1/auth/login', { method: 'POST', body, auth: false });
    state.accessToken = resp.data.access_token;
    state.refreshToken = resp.data.refresh_token;
    state.user = resp.data.user;
    saveAuth();
    setUser(state.user);
  }

  async function logout() {
    state.accessToken = '';
    state.refreshToken = '';
    state.user = null;
    state.active = null;
    state.messages = [];
    saveAuth();
    disconnectWS();
    stopPolling();
    setUser(null);
    showLogin(true);
  }

  async function boot() {
    showLogin(false);
    setUser(state.user);
    setStatus(false);
    renderConversationHeader();
    try {
      await Promise.all([loadFriends(), loadGroups()]);
      scheduleRenderList();
      await connectWS();
      startPolling();
    } catch (err) {
      showToast('登录已过期，请重新登录');
      await logout();
    }
  }

  async function loadFriends() {
    try {
      const resp = await apiRequest('/v1/friends');
      const friends = resp.data.friends || [];
      state.friends = friends.map((f) => ({
        uid: f.uid || f.id,
        name: f.display_name || f.username || f.uid || f.id,
        avatar: f.avatar_url || '',
      })).filter((f) => f.uid);
      state.friendMap = {};
      state.friends.forEach((f) => {
        state.friendMap[f.uid] = f;
      });
    } catch (err) {
      showToast('好友列表加载失败');
    }
  }

  async function loadGroups() {
    try {
      const resp = await apiRequest('/v1/groups/list');
      const groups = resp.data.groups || [];
      state.groups = groups.map((g) => ({
        id: g.group_id || g.id,
        name: g.name || g.group_id,
        avatar: g.avatar_url || '',
      })).filter((g) => g.id);
      state.groupMap = {};
      state.groups.forEach((g) => {
        state.groupMap[g.id] = g;
      });
    } catch (err) {
      showToast('群组列表加载失败');
    }
  }

  function renderList() {
    const filter = (els.searchInput.value || '').trim().toLowerCase();
    let items = [];
    if (state.view === 'groups') {
      items = state.groups.map((g) => ({
        id: g.id,
        title: g.name,
        subtitle: `群号 ${g.id}`,
        type: 'group',
        unread: state.unread.group[g.id] || 0,
      }));
    } else {
      items = state.friends.map((f) => ({
        id: f.uid,
        title: f.name,
        subtitle: f.uid,
        type: 'direct',
        unread: state.unread.direct[f.uid] || 0,
      }));
    }

    const filtered = items.filter((i) => {
      return !filter || i.title.toLowerCase().includes(filter) || (i.subtitle || '').toLowerCase().includes(filter);
    });

    els.listView.innerHTML = '';
    if (!filtered.length) {
      els.listView.innerHTML = '<div class="item-subtitle">暂无数据</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'list-item';
      row.dataset.id = item.id;
      row.dataset.type = item.type;
      if (state.active && state.active.type === item.type && state.active.id === item.id) {
        row.classList.add('active');
      }

      const textWrap = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'item-title';
      title.textContent = item.title;
      const subtitle = document.createElement('div');
      subtitle.className = 'item-subtitle';
      subtitle.textContent = item.subtitle;
      textWrap.appendChild(title);
      textWrap.appendChild(subtitle);
      row.appendChild(textWrap);

      if (item.unread) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = item.unread > 99 ? '99+' : item.unread;
        row.appendChild(badge);
      }

      row.addEventListener('click', () => {
        openConversation(item.type, item.id);
      });
      fragment.appendChild(row);
    });
    els.listView.appendChild(fragment);
  }

  function scheduleRenderList() {
    if (renderListScheduled) return;
    renderListScheduled = true;
    requestAnimationFrame(() => {
      renderListScheduled = false;
      renderList();
    });
  }

  function renderConversationHeader() {
    if (!state.active) {
      els.conversationTitle.textContent = '旧聊 Web';
      els.conversationMeta.textContent = '选择一个会话开始聊天';
      els.emptyState.style.display = 'block';
      els.composer.style.display = 'none';
      return;
    }
    const info = state.active.type === 'group'
      ? state.groupMap[state.active.id]
      : state.friendMap[state.active.id];
    els.conversationTitle.textContent = info ? info.name : state.active.id;
    els.conversationMeta.textContent = state.active.type === 'group' ? `群号 ${state.active.id}` : state.active.id;
    els.emptyState.style.display = 'none';
    els.composer.style.display = 'flex';
  }

  function renderMessages() {
    els.messageList.innerHTML = '';
    if (!state.messages.length) {
      return;
    }
    const fragment = document.createDocumentFragment();
    state.messages.forEach((msg) => {
      fragment.appendChild(createMessageNode(msg));
    });
    els.messageList.appendChild(fragment);
    els.messageList.scrollTop = els.messageList.scrollHeight;
  }

  function appendMessage(msg) {
    const node = createMessageNode(msg);
    els.messageList.appendChild(node);
    els.messageList.scrollTop = els.messageList.scrollHeight;
  }

  function createMessageNode(msg) {
    const node = document.createElement('div');
    node.className = 'message' + (msg.from_uid === state.user.uid ? ' me' : '');

    function safeOpen(url) {
      if (!url) return;
      window.open(url, '_blank', 'noopener');
    }

    function copyText(text) {
      if (!text) return;
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(() => showToast('已复制链接')).catch(() => {
          window.prompt('复制链接', text);
        });
      } else {
        window.prompt('复制链接', text);
      }
    }

    function guessNameFromUrl(url) {
      if (!url) return '';
      try {
        const u = new URL(url, window.location.href);
        const part = (u.pathname || '').split('/').pop() || '';
        if (!part) return '';
        return decodeURIComponent(part);
      } catch (e) {
        const part = url.split('?')[0].split('#')[0].split('/').pop() || '';
        try {
          return decodeURIComponent(part);
        } catch (err) {
          return part;
        }
      }
    }

    function parseResourceBody(bodyText, mediaUrl) {
      const out = { name: '', size: '', hint: '' };
      const text = (bodyText || '').trim();
      if (text) {
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const line = (lines[i] || '').trim();
          if (!line) continue;
          if (!out.name && (line.indexOf('资源:') === 0 || line.indexOf('文件:') === 0 || line.indexOf('资源：') === 0 || line.indexOf('文件：') === 0)) {
            out.name = line.split(/[:：]/).slice(1).join(':').trim();
            continue;
          }
          if (!out.size && (line.indexOf('大小:') === 0 || line.indexOf('大小：') === 0)) {
            out.size = line.split(/[:：]/).slice(1).join(':').trim();
            continue;
          }
          if (!out.hint && (line.indexOf('点击') >= 0 && line.indexOf('下载') >= 0)) {
            out.hint = line;
          }
        }
      }
      if (!out.name) {
        out.name = guessNameFromUrl(mediaUrl) || '资源文件';
      }
      if (!out.hint) {
        out.hint = '点击下载';
      }
      return out;
    }

    if (msg.msg_type === 'resource' && msg.media_url) {
      const info = parseResourceBody(msg.body, msg.media_url);
      const card = document.createElement('div');
      card.className = 'file-card';
      card.setAttribute('role', 'button');
      card.tabIndex = 0;
      card.addEventListener('click', () => safeOpen(msg.media_url));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          safeOpen(msg.media_url);
        }
      });

      const icon = document.createElement('div');
      icon.className = 'file-icon';
      icon.textContent = 'FILE';

      const textWrap = document.createElement('div');
      textWrap.className = 'file-info';
      const name = document.createElement('div');
      name.className = 'file-name';
      name.textContent = info.name;
      const meta = document.createElement('div');
      meta.className = 'file-meta';
      meta.textContent = (info.size ? info.size + ' · ' : '') + info.hint;
      textWrap.appendChild(name);
      textWrap.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'file-actions';

      const btnDownload = document.createElement('button');
      btnDownload.type = 'button';
      btnDownload.className = 'file-action';
      btnDownload.textContent = '下载';
      btnDownload.addEventListener('click', (e) => {
        e.stopPropagation();
        safeOpen(msg.media_url);
      });

      const btnCopy = document.createElement('button');
      btnCopy.type = 'button';
      btnCopy.className = 'file-action';
      btnCopy.textContent = '复制链接';
      btnCopy.addEventListener('click', (e) => {
        e.stopPropagation();
        copyText(msg.media_url);
      });

      actions.appendChild(btnDownload);
      actions.appendChild(btnCopy);

      card.appendChild(icon);
      card.appendChild(textWrap);
      card.appendChild(actions);
      node.appendChild(card);
    } else {
      const body = document.createElement('div');
      body.textContent = msg.body;
      node.appendChild(body);
    }

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const sender = msg.from_uid === state.user.uid ? '你' : msg.from_uid || '未知';
    meta.textContent = `${sender} · ${formatTime(msg.created_at || msg.createdAt)}`;
    node.appendChild(meta);
    return node;
  }

  async function openConversation(type, id) {
    state.active = { type, id };
    renderConversationHeader();
    setPanel('chat');
    els.messageList.innerHTML = '';
    if (type === 'direct') {
      state.unread.direct[id] = 0;
      await markDirectRead(id);
      await loadDirectMessages(id);
    } else {
      state.unread.group[id] = 0;
      await markGroupRead(id);
      await loadGroupMessages(id);
    }
    scheduleRenderList();
  }

  async function loadDirectMessages(uid) {
    try {
      const resp = await apiRequest(`/v1/direct/messages/v2?with_uid=${encodeURIComponent(uid)}&limit=50&offset=0`);
      state.messages = (resp.data.messages || []).sort((a, b) => a.created_at - b.created_at);
      renderMessages();
    } catch (err) {
      showToast('拉取私聊记录失败');
    }
  }

  async function loadGroupMessages(groupId) {
    try {
      const resp = await apiRequest(`/v1/groups/messages/v2?group_id=${encodeURIComponent(groupId)}&limit=50&offset=0`);
      state.messages = (resp.data.messages || []).sort((a, b) => a.created_at - b.created_at);
      renderMessages();
    } catch (err) {
      showToast('拉取群聊记录失败');
    }
  }

  async function sendMessage(text) {
    if (!state.active) return;
    const body = text.trim();
    if (!body) return;
    if (state.active.type === 'direct') {
      const resp = await apiRequest('/v1/direct/send', {
        method: 'POST',
        body: { to_uid: state.active.id, body, msg_type: 'text' },
      });
      const msg = resp.data;
      state.messages.push(msg);
      appendMessage(msg);
    } else if (state.active.type === 'group') {
      const resp = await apiRequest('/v1/groups/message/send', {
        method: 'POST',
        body: { group_id: state.active.id, body, msg_type: 'text' },
      });
      const msg = resp.data;
      state.messages.push(msg);
      appendMessage(msg);
    }
  }

  async function markDirectRead(uid) {
    try {
      await apiRequest('/v1/direct/read', { method: 'POST', body: { with_uid: uid } });
    } catch (err) {
      // ignore
    }
  }

  async function markGroupRead(groupId) {
    try {
      await apiRequest('/v1/groups/read', { method: 'POST', body: { group_id: groupId } });
    } catch (err) {
      // ignore
    }
  }

  async function fetchUnread() {
    if (!state.accessToken) return;
    try {
      const directResp = await apiRequest('/v1/direct/unread', {
        method: 'POST',
        body: { limit: 50 },
      });
      const directMap = {};
      (directResp.data.messages || []).forEach((msg) => {
        const peer = msg.peer_uid;
        if (!peer) return;
        if (!directMap[peer]) directMap[peer] = 0;
        directMap[peer] += 1;
      });
      state.unread.direct = directMap;

      const groupResp = await apiRequest('/v1/groups/unread', {
        method: 'POST',
        body: { limit: 50 },
      });
      const groupMap = {};
      (groupResp.data.messages || []).forEach((msg) => {
        const groupId = msg.group_id;
        if (!groupId) return;
        if (!groupMap[groupId]) groupMap[groupId] = 0;
        groupMap[groupId] += 1;
      });
      state.unread.group = groupMap;
      scheduleRenderList();
    } catch (err) {
      // ignore polling errors
    }
  }

  function startPolling() {
    stopPolling();
    const interval = state.wsConnected ? 45000 : 15000;
    state.pollTimer = setInterval(fetchUnread, interval);
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  async function connectWS() {
    if (!state.accessToken) return;
    try {
      await ensureSession();
    } catch (err) {
      showToast('加密握手失败，将使用轮询');
      setStatus(false);
      return;
    }

    const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${wsProtocol}://${location.host}/v1/ws?token=${encodeURIComponent(state.accessToken)}&sid=${encodeURIComponent(state.sessionId)}`;
    const ws = new WebSocket(wsUrl);
    state.ws = ws;

    ws.onopen = () => {
      setStatus(true);
    };
    ws.onclose = () => {
      setStatus(false);
    };
    ws.onerror = () => {
      setStatus(false);
    };
    ws.onmessage = async (event) => {
      const payload = await decodeWsPayload(event.data);
      if (!payload) return;
      handleWsEvent(payload);
    };
  }

  function disconnectWS() {
    if (state.ws) {
      state.ws.close();
      state.ws = null;
    }
  }

  function handleWsEvent(message) {
    if (!message || !message.type) return;
    if (message.type === 'direct_message') {
      handleDirectMessage(message.data);
    } else if (message.type === 'group_message') {
      handleGroupMessage(message.data);
    }
  }

  function handleDirectMessage(msg) {
    if (!msg || !msg.from_uid) return;
    if (state.active && state.active.type === 'direct' && state.active.id === msg.from_uid) {
      state.messages.push(msg);
      appendMessage(msg);
      markDirectRead(msg.from_uid);
    } else {
      state.unread.direct[msg.from_uid] = (state.unread.direct[msg.from_uid] || 0) + 1;
      scheduleRenderList();
    }
  }

  function handleGroupMessage(msg) {
    if (!msg || !msg.group_id) return;
    if (state.active && state.active.type === 'group' && state.active.id === msg.group_id) {
      state.messages.push(msg);
      appendMessage(msg);
      markGroupRead(msg.group_id);
    } else {
      state.unread.group[msg.group_id] = (state.unread.group[msg.group_id] || 0) + 1;
      scheduleRenderList();
    }
  }

  function formatTime(ts) {
    if (!ts) return '';
    const millis = ts < 1e12 ? ts * 1000 : ts;
    const date = new Date(millis);
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function base64ToBytes(str) {
    const binary = atob(str);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function bytesToBase64(bytes) {
    let binary = '';
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary);
  }

  function concatBytes(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  async function sha256(data) {
    const hash = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hash);
  }

  async function hmacSha256(keyBytes, data) {
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, data);
    return new Uint8Array(sig);
  }

  function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    return result === 0;
  }

  function pkcs7Unpad(data) {
    if (!data.length) return data;
    const pad = data[data.length - 1];
    if (pad <= 0 || pad > 16) return data;
    return data.slice(0, data.length - pad);
  }

  async function ensureSession() {
    if (!crypto || !crypto.subtle) {
      throw new Error('crypto not supported');
    }
    if (state.sessionId && state.encKey && state.macKey) return;

    const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const spki = await crypto.subtle.exportKey('spki', keys.publicKey);
    const clientPub = bytesToBase64(new Uint8Array(spki));
    const resp = await apiRequest('/v1/auth/handshake', {
      method: 'POST',
      body: { client_pub: clientPub },
      auth: false,
    });
    const serverPubBytes = base64ToBytes(resp.data.server_pub);
    const serverPub = await crypto.subtle.importKey('spki', serverPubBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const secret = await crypto.subtle.deriveBits({ name: 'ECDH', public: serverPub }, keys.privateKey, 256);
    const secretBytes = new Uint8Array(secret);
    state.sessionId = resp.data.session_id;
    state.encKey = await sha256(concatBytes(secretBytes, new TextEncoder().encode('enc')));
    state.macKey = await sha256(concatBytes(secretBytes, new TextEncoder().encode('mac')));
  }

  async function decryptEnvelope(payload) {
    if (!state.encKey || !state.macKey) return null;
    let env;
    try {
      env = JSON.parse(payload);
    } catch (err) {
      return null;
    }
    if (!env.iv || !env.data || !env.mac) return null;
    const iv = base64ToBytes(env.iv);
    const ciphertext = base64ToBytes(env.data);
    const mac = base64ToBytes(env.mac);
    const expected = await hmacSha256(state.macKey, concatBytes(iv, ciphertext));
    if (!timingSafeEqual(mac, expected)) {
      return null;
    }
    const key = await crypto.subtle.importKey('raw', state.encKey, { name: 'AES-CBC' }, false, ['decrypt']);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, ciphertext);
    const plainBytes = pkcs7Unpad(new Uint8Array(plainBuf));
    return new TextDecoder().decode(plainBytes);
  }

  async function decodeWsPayload(data) {
    if (typeof data !== 'string') return null;
    try {
      const raw = JSON.parse(data);
      if (raw && raw.type) return raw;
    } catch (err) {
      // continue
    }
    const decrypted = await decryptEnvelope(data);
    if (!decrypted) return null;
    try {
      return JSON.parse(decrypted);
    } catch (err) {
      return null;
    }
  }

  function wireEvents() {
    els.tabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        setView(btn.dataset.view);
        setPanel('list');
      });
    });
    els.searchInput.addEventListener('input', debounce(scheduleRenderList, 120));
    els.btnLogout.addEventListener('click', logout);
    els.btnBackList.addEventListener('click', () => setPanel('list'));
    els.composer.addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = els.messageInput.value;
      els.messageInput.value = '';
      try {
        await sendMessage(text);
      } catch (err) {
        showToast('发送失败');
      }
    });
    els.loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const id = els.loginIdentifier.value.trim();
      const pw = els.loginPassword.value;
      if (!id || !pw) {
        showToast('请输入账号和密码');
        return;
      }
      try {
        await login(id, pw);
        await boot();
      } catch (err) {
        showToast('登录失败，请检查账号密码');
      }
    });
  }

  function init() {
    wireEvents();
    loadAuth();
    if (state.user) {
      setUser(state.user);
    }
    if (state.accessToken) {
      boot();
    } else {
      showLogin(true);
    }
  }

  init();
})();
