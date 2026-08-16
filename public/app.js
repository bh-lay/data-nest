/* 数据管理 — 前端逻辑 */
(function () {
  const TOKEN_KEY = 'dm_token';
  const USER_KEY = 'dm_user';

  const $ = (sel) => document.querySelector(sel);

  const state = {
    editingRecordId: null,
    viewRecordId: null,
    lastTokenSecret: '',
  };

  /* ---------- 基础工具 ---------- */

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`/api${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    let payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (!res.ok) {
      const err = new Error((payload && payload.error) || `请求失败 (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return payload;
  }

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    show(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hide(el), 2500);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  async function copyText(text, msg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(msg);
    } catch {
      toast('复制失败，请手动复制');
    }
  }

  /* ---------- 认证 ---------- */

  function showLogin() {
    hide($('#app-view'));
    show($('#login-view'));
  }

  function showApp() {
    show($('#app-view'));
    hide($('#login-view'));
    $('#current-user').textContent = getUser() ? getUser().username : '';
    loadRecords();
    loadUsers();
    loadTokens();
  }

  async function handleLogin(e) {
    e.preventDefault();
    hide($('#login-error'));
    try {
      const res = await api('/auth/login', {
        method: 'POST',
        body: { username: $('#login-username').value.trim(), password: $('#login-password').value },
      });
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      $('#login-password').value = '';
      showApp();
    } catch (err) {
      const el = $('#login-error');
      el.textContent = err.message;
      show(el);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    showLogin();
  }

  /* ---------- 标签切换 ---------- */

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach((t) =>
      t.classList.toggle('active', t.dataset.tab === name));
    ['records', 'users', 'tokens'].forEach((p) => {
      const panel = $(`#panel-${p}`);
      if (p === name) show(panel); else hide(panel);
    });
  }

  /* ---------- 数据记录 ---------- */

  function recordPreview(rec) {
    const text = JSON.stringify(rec.data, null, 2) ?? String(rec.data);
    return text.length > 400 ? text.slice(0, 400) + '…' : text;
  }

  async function loadRecords() {
    try {
      const { records } = await api('/records');
      const list = $('#records-list');
      list.innerHTML = '';
      if (records.length === 0) {
        show($('#records-empty'));
        return;
      }
      hide($('#records-empty'));
      for (const rec of records) {
        const card = document.createElement('div');
        card.className = 'record-card card';
        card.innerHTML = `
          <div class="record-head">
            <div>
              <span class="record-name">${escapeHtml(rec.name || `记录 #${rec.id}`)}</span>
              ${rec.anonymous_access ? '<span class="badge">匿名可读</span>' : ''}
            </div>
            <button class="btn btn-mini" data-act="copyid" title="复制记录 ID">ID: ${rec.id}</button>
          </div>
          <div class="record-meta">更新于 ${escapeHtml(rec.updated_at)}</div>
          <pre>${escapeHtml(recordPreview(rec))}</pre>
          <div class="record-actions">
            <button class="btn" data-act="view">查看</button>
            <button class="btn" data-act="edit">编辑</button>
            <button class="btn danger" data-act="delete">删除</button>
          </div>`;
        card.querySelector('[data-act="copyid"]').addEventListener('click', () => copyText(String(rec.id), 'ID 已复制'));
        card.querySelector('[data-act="view"]').addEventListener('click', () => openView(rec));
        card.querySelector('[data-act="edit"]').addEventListener('click', () => openEditor(rec));
        card.querySelector('[data-act="delete"]').addEventListener('click', () => deleteRecord(rec));
        list.appendChild(card);
      }
    } catch (err) {
      toast(err.message);
      if (err.status === 401) logout();
    }
  }

  function openEditor(rec) {
    state.editingRecordId = rec ? rec.id : null;
    $('#record-modal-title').textContent = rec ? `编辑记录 #${rec.id}` : '新建记录';
    $('#record-name').value = rec ? rec.name : '';
    $('#record-data').value = rec ? JSON.stringify(rec.data, null, 2) : '';
    $('#record-anon').checked = rec ? rec.anonymous_access : false;
    hide($('#record-error'));
    show($('#record-modal'));
    $('#record-data').focus();
  }

  function closeEditor() {
    hide($('#record-modal'));
    state.editingRecordId = null;
  }

  async function saveRecord() {
    hide($('#record-error'));
    const raw = $('#record-data').value.trim();
    if (!raw) {
      const el = $('#record-error');
      el.textContent = '数据不能为空';
      show(el);
      return;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      const el = $('#record-error');
      el.textContent = `JSON 解析失败：${err.message}`;
      show(el);
      return;
    }
    const body = {
      name: $('#record-name').value.trim(),
      data,
      anonymous_access: $('#record-anon').checked,
    };
    try {
      if (state.editingRecordId) {
        await api(`/records/${state.editingRecordId}`, { method: 'PUT', body });
        toast('记录已更新');
      } else {
        await api('/records', { method: 'POST', body });
        toast('记录已创建');
      }
      closeEditor();
      loadRecords();
    } catch (err) {
      const el = $('#record-error');
      el.textContent = err.message;
      show(el);
    }
  }

  async function deleteRecord(rec) {
    if (!confirm(`确定删除记录 #${rec.id} 吗？此操作不可撤销。`)) return;
    try {
      await api(`/records/${rec.id}`, { method: 'DELETE' });
      toast('记录已删除');
      loadRecords();
    } catch (err) {
      toast(err.message);
    }
  }

  function openView(rec) {
    state.viewRecordId = rec.id;
    $('#view-modal-title').textContent = rec.name ? `${rec.name} (#${rec.id})` : `记录 #${rec.id}`;
    $('#view-meta').innerHTML = `
      <span>记录 ID：<button class="btn btn-mini" data-act="copyid">${rec.id}</button></span>
      <span class="endpoints">GET /api/records/${rec.id} · PUT /api/records/${rec.id} · DELETE /api/records/${rec.id}</span>`;
    $('#view-meta').querySelector('[data-act="copyid"]')
      .addEventListener('click', () => copyText(String(rec.id), 'ID 已复制'));
    $('#view-data').textContent = JSON.stringify(rec.data, null, 2);
    show($('#view-modal'));
  }

  /* ---------- 用户管理 ---------- */

  async function loadUsers() {
    try {
      const { users } = await api('/users');
      const tbody = $('#users-body');
      tbody.innerHTML = '';
      const me = getUser();
      for (const u of users) {
        const tr = document.createElement('tr');
        const isMe = me && u.id === me.id;
        tr.innerHTML = `
          <td>${u.id}</td>
          <td>${escapeHtml(u.username)}${isMe ? ' <span class="muted">（我）</span>' : ''}</td>
          <td class="muted">${escapeHtml(u.created_at)}</td>
          <td>${isMe ? '' : '<button class="btn danger" data-act="delete">删除</button>'}</td>`;
        const btn = tr.querySelector('[data-act="delete"]');
        if (btn) btn.addEventListener('click', () => deleteUser(u));
        tbody.appendChild(tr);
      }
    } catch (err) {
      toast(err.message);
      if (err.status === 401) logout();
    }
  }

  async function handleUserCreate(e) {
    e.preventDefault();
    try {
      await api('/users', {
        method: 'POST',
        body: { username: $('#new-username').value.trim(), password: $('#new-password').value },
      });
      toast('用户已创建');
      $('#new-username').value = '';
      $('#new-password').value = '';
      loadUsers();
    } catch (err) {
      toast(err.message);
    }
  }

  async function deleteUser(u) {
    if (!confirm(`确定删除用户 "${u.username}" 吗？其创建的 Token 也会被撤销。`)) return;
    try {
      await api(`/users/${u.id}`, { method: 'DELETE' });
      toast('用户已删除');
      loadUsers();
    } catch (err) {
      toast(err.message);
    }
  }

  /* ---------- API Tokens ---------- */

  async function loadTokens() {
    try {
      const { tokens } = await api('/tokens');
      const tbody = $('#tokens-body');
      tbody.innerHTML = '';
      for (const t of tokens) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${t.id}</td>
          <td>${escapeHtml(t.name)}</td>
          <td><code>${escapeHtml(t.prefix)}…</code></td>
          <td class="muted">${escapeHtml(t.created_at)}</td>
          <td class="muted">${escapeHtml(t.last_used_at || '—')}</td>
          <td><button class="btn danger" data-act="revoke">撤销</button></td>`;
        tr.querySelector('[data-act="revoke"]').addEventListener('click', () => revokeToken(t));
        tbody.appendChild(tr);
      }
    } catch (err) {
      toast(err.message);
      if (err.status === 401) logout();
    }
  }

  async function handleTokenCreate(e) {
    e.preventDefault();
    try {
      const res = await api('/tokens', {
        method: 'POST',
        body: { name: $('#new-token-name').value.trim() },
      });
      $('#new-token-name').value = '';
      state.lastTokenSecret = res.secret;
      $('#token-secret').textContent = res.secret;
      show($('#token-modal'));
      loadTokens();
    } catch (err) {
      toast(err.message);
    }
  }

  async function revokeToken(t) {
    if (!confirm(`确定撤销 Token "${t.name}" 吗？使用它的外部服务将立即失效。`)) return;
    try {
      await api(`/tokens/${t.id}`, { method: 'DELETE' });
      toast('Token 已撤销');
      loadTokens();
    } catch (err) {
      toast(err.message);
    }
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(state.lastTokenSecret);
      toast('已复制到剪贴板');
    } catch {
      const range = document.createRange();
      range.selectNode($('#token-secret'));
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      toast('已选中，请手动复制');
    }
  }

  /* ---------- 修改密码 ---------- */

  function openPasswordModal() {
    $('#pw-current').value = '';
    $('#pw-new').value = '';
    hide($('#pw-error'));
    show($('#password-modal'));
  }

  async function savePassword() {
    hide($('#pw-error'));
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: { current_password: $('#pw-current').value, new_password: $('#pw-new').value },
      });
      toast('密码已修改');
      hide($('#password-modal'));
    } catch (err) {
      const el = $('#pw-error');
      el.textContent = err.message;
      show(el);
    }
  }

  /* ---------- 事件绑定 ---------- */

  function bind() {
    $('#login-form').addEventListener('submit', handleLogin);
    $('#btn-logout').addEventListener('click', logout);

    document.querySelectorAll('.tab').forEach((t) =>
      t.addEventListener('click', () => switchTab(t.dataset.tab)));

    $('#btn-new-record').addEventListener('click', () => openEditor(null));
    $('#btn-record-save').addEventListener('click', saveRecord);
    $('#btn-record-cancel').addEventListener('click', closeEditor);
    $('#btn-view-close').addEventListener('click', () => hide($('#view-modal')));

    $('#user-form').addEventListener('submit', handleUserCreate);

    $('#token-form').addEventListener('submit', handleTokenCreate);
    $('#btn-token-copy').addEventListener('click', copyToken);
    $('#btn-token-close').addEventListener('click', () => hide($('#token-modal')));

    $('#btn-change-password').addEventListener('click', openPasswordModal);
    $('#btn-pw-save').addEventListener('click', savePassword);
    $('#btn-pw-cancel').addEventListener('click', () => hide($('#password-modal')));

    // 点击弹窗遮罩关闭
    document.querySelectorAll('.modal').forEach((m) =>
      m.addEventListener('click', (e) => { if (e.target === m) hide(m); }));
  }

  /* ---------- 启动 ---------- */

  bind();
  if (getToken()) showApp();
  else showLogin();
})();
