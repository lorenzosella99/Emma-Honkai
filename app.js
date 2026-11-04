/* ==========================================
   EMMA HONKAI — App Core
   ========================================== */

// ─── DATA LAYER (simulando emma_honkai_dados) ───────────────────────────────
const DB = {
  get(key, def = null) {
    try { const v = localStorage.getItem('emma_' + key); return v ? JSON.parse(v) : def; } catch { return def; }
  },
  set(key, val) {
    try { localStorage.setItem('emma_' + key, JSON.stringify(val)); } catch {}
  },
  _sync() {
    // Em produção, sincronizaria com emma_honkai_dados via GitHub API
    // Por enquanto, tudo fica no localStorage (funciona offline)
  }
};

// ─── CONFIG DEFAULT ──────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  accessCode: 'EMMA2024',
  adminCode: 'ADMIN_EMMA99',
  thoughtCost: 10,
  actionCost: 5,
  speechCost: 0,
  startingCoins: 150,
  botDelay: { min: 1200, max: 3500 }
};

function cfg() { return DB.get('config', DEFAULT_CONFIG); }

// ─── DEFAULT CHARACTERS ──────────────────────────────────────────────────────
const DEFAULT_CHARACTERS = [
  {
    id: 'emma',
    name: 'Emma',
    role: 'Personagem Principal',
    image: 'https://i.imgur.com/FeNqFGX.png',
    description: 'Personagem principal do universo Honkai. Misteriosa e cativante.',
    isOnline: false,
    isBanned: false,
    banUntil: null,
    banReason: '',
    botPersonality: 'Sou Emma, de Honkai. Falo de forma misteriosa e poética, com toques de humor seco.',
    online_responses: [
      { type: 'thought', text: 'Interessante... esse humano parece curioso.' },
      { type: 'action', text: 'olha com seus olhos violeta, pensativa' },
      { type: 'speech', text: 'Você me surpreende. Poucos se atrevem a me falar assim.' }
    ],
    offline_responses: [
      [
        { type: 'thought', text: 'Mais um viajante perdido neste mar de estrelas...' },
        { type: 'action', text: 'suspira levemente, olhando para o horizonte' },
        { type: 'speech', text: 'Ei. Não esperava você por aqui hoje.' }
      ],
      [
        { type: 'thought', text: 'O que será que quer saber?' },
        { type: 'speech', text: 'Você pergunta coisas interessantes. Deixa eu pensar...' }
      ],
      [
        { type: 'action', text: 'cruza os braços, com um sorriso misterioso' },
        { type: 'speech', text: 'Sempre aparece na hora certa, não é?' }
      ]
    ]
  },
  {
    id: 'stelle',
    name: 'Stelle',
    role: 'Trailblazer',
    image: 'https://i.imgur.com/AZ8wGnk.png',
    description: 'A trailblazer do trem estelar. Corajosa e determinada.',
    isOnline: true,
    isBanned: false,
    banUntil: null,
    banReason: '',
    botPersonality: 'Sou Stelle, a Trailblazer. Sou direta, animada e um pouco impulsiva.',
    online_responses: [
      { type: 'thought', text: 'Boa pergunta! Preciso pensar nisso...' },
      { type: 'action', text: 'bate uma mão no punho, animada' },
      { type: 'speech', text: 'Ei! Vamos resolver isso juntos!' }
    ],
    offline_responses: [
      [
        { type: 'thought', text: 'Mais uma aventura começa!' },
        { type: 'action', text: 'sorri amplamente' },
        { type: 'speech', text: 'Que bom te ver! Tô pronta pra qualquer coisa.' }
      ],
      [
        { type: 'speech', text: 'Oioi! Acabei de chegar. O que rolou?' }
      ],
      [
        { type: 'action', text: 'sacode a mochila nas costas' },
        { type: 'thought', text: 'Nunca sei o que esperar, mas tô animada.' },
        { type: 'speech', text: 'Pronta pra mais uma! Conta pra mim.' }
      ]
    ]
  },
  {
    id: 'kafka',
    name: 'Kafka',
    role: 'Nihility · Nuvem Flamejante',
    image: 'https://i.imgur.com/NZx3kqE.png',
    description: 'Membro da Chama Flamejante. Enigmática e sedutora.',
    isOnline: false,
    isBanned: false,
    banUntil: null,
    banReason: '',
    botPersonality: 'Sou Kafka. Falo de forma enigmática, às vezes provocativa, sempre elegante.',
    online_responses: [
      { type: 'thought', text: 'Ele/ela me intriga.' },
      { type: 'action', text: 'inclina a cabeça, sorrindo levemente' },
      { type: 'speech', text: 'Que surpresa agradável. Continua.' }
    ],
    offline_responses: [
      [
        { type: 'thought', text: 'Sempre aparecem quando menos espero.' },
        { type: 'action', text: 'ajusta o cabelo com um gesto elegante' },
        { type: 'speech', text: 'Você me encontrou. Boa sorte... ou não.' }
      ],
      [
        { type: 'speech', text: 'Quanto tempo. Achei que você tinha desistido.' }
      ],
      [
        { type: 'action', text: 'olha de lado, com um sorriso enigmático' },
        { type: 'thought', text: 'Interessante timing.' },
        { type: 'speech', text: 'Sempre aparece na hora certa. Ou errada. Depende do ponto de vista.' }
      ]
    ]
  },
  {
    id: 'blade',
    name: 'Blade',
    role: 'Hunt · Nuvem Flamejante',
    image: 'https://i.imgur.com/FeNqFGX.png',
    description: 'Guerreiro imortal que busca a morte. Lacônico e sombrio.',
    isOnline: false,
    isBanned: false,
    banUntil: null,
    banReason: '',
    botPersonality: 'Sou Blade. Falo pouco, direto ao ponto. Tom sombrio e cansado da vida.',
    online_responses: [
      { type: 'thought', text: '...' },
      { type: 'speech', text: 'Fala.' }
    ],
    offline_responses: [
      [
        { type: 'action', text: 'olha sem expressão' },
        { type: 'speech', text: 'Você ainda está vivo. Bem.' }
      ],
      [
        { type: 'thought', text: 'De novo.' },
        { type: 'speech', text: '...' }
      ],
      [
        { type: 'action', text: 'suspira, cansado' },
        { type: 'speech', text: 'O que quer?' }
      ]
    ]
  }
];

const DEFAULT_MISSIONS = [
  { id: 'mission_first_chat', title: 'Primeiro Contato', description: 'Envie sua primeira mensagem para um personagem', icon: '💬', reward: 50, type: 'chat_count', target: 1, isNewUser: true },
  { id: 'mission_chat_5', title: 'Papo Rolando', description: 'Envie 5 mensagens no total', icon: '🗨️', reward: 30, type: 'chat_count', target: 5, isNewUser: true },
  { id: 'mission_thought_buy', title: 'Mente Aberta', description: 'Compre 1 pensamento de um personagem', icon: '🧠', reward: 25, type: 'thoughts_bought', target: 1, isNewUser: false },
  { id: 'mission_chat_3chars', title: 'Social Butterfly', description: 'Converse com 3 personagens diferentes', icon: '🦋', reward: 75, type: 'unique_chars', target: 3, isNewUser: false },
  { id: 'mission_chat_20', title: 'Narrador Épico', description: 'Envie 20 mensagens no total', icon: '📖', reward: 100, type: 'chat_count', target: 20, isNewUser: false },
  { id: 'mission_daily', title: 'Presença Diária', description: 'Entre no app hoje', icon: '⭐', reward: 20, type: 'daily', target: 1, isNewUser: true }
];

// ─── INIT DATA ────────────────────────────────────────────────────────────────
function initData() {
  if (!DB.get('config')) DB.set('config', DEFAULT_CONFIG);
  if (!DB.get('characters')) DB.set('characters', DEFAULT_CHARACTERS);
  if (!DB.get('missions')) DB.set('missions', DEFAULT_MISSIONS);
  if (!DB.get('users')) DB.set('users', []);
  if (!DB.get('messages')) DB.set('messages', {});
  if (!DB.get('chats')) DB.set('chats', []);
}

// ─── STATE ────────────────────────────────────────────────────────────────────
let state = {
  currentUser: null,
  currentChat: null,
  currentTab: 'chars',
  isTyping: false,
  messageType: 'speech',
  skeletonDone: false
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return document.querySelectorAll(sel); }

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'agora';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h';
  return Math.floor(diff/86400000) + 'd';
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' });
}

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── TOAST ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 3000) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', gold: '🪙' };
  const container = el('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type] || '•'}</span><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => {
    t.classList.add('leaving');
    setTimeout(() => t.remove(), 200);
  }, duration);
}

// ─── COIN FLY ANIMATION ───────────────────────────────────────────────────────
function coinFly(amount, x, y) {
  const el2 = document.createElement('div');
  el2.className = 'coin-fly';
  el2.textContent = amount > 0 ? `+${amount}🪙` : `${amount}🪙`;
  el2.style.left = x + 'px';
  el2.style.top = y + 'px';
  document.body.appendChild(el2);
  setTimeout(() => el2.remove(), 900);
}

// ─── SCREENS ─────────────────────────────────────────────────────────────────
function showScreen(id, animate = true) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('slide-up');
    s.classList.add('hidden');
  });
  const s = el(id);
  s.classList.remove('hidden');
  if (animate && id !== 'screen-loading') s.classList.add('slide-up');
}

// ─── SKELETON LOADING ─────────────────────────────────────────────────────────
async function showSkeletonThen(containerId, renderFn, delay = 800) {
  const container = el(containerId);
  if (!container) return;
  // Show skeletons
  container.innerHTML = Array(4).fill(0).map(() => `
    <div class="skeleton-card">
      <div class="skeleton skel-avatar"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:6px">
        <div class="skeleton skel-line" style="width:60%"></div>
        <div class="skeleton skel-line-sm" style="width:40%"></div>
      </div>
    </div>
  `).join('');
  await sleep(delay);
  renderFn();
}

// ─── CHECK BAN STATUS ─────────────────────────────────────────────────────────
function checkAndCleanBans() {
  const chars = DB.get('characters', []);
  const now = Date.now();
  let changed = false;
  chars.forEach(c => {
    if (c.isBanned && c.banUntil && now > c.banUntil) {
      c.isBanned = false;
      c.banUntil = null;
      c.banReason = '';
      changed = true;
    }
  });
  if (changed) DB.set('characters', chars);
}

// ─── GATE / ACCESS CODE ───────────────────────────────────────────────────────
function initGate() {
  el('gate-submit').onclick = () => {
    const code = el('gate-code').value.trim().toUpperCase();
    const config = cfg();
    if (code === config.accessCode || code === config.adminCode) {
      DB.set('access_verified', true);
      showScreen('screen-auth');
      renderAuthScreen();
      initAuth();
    } else {
      toast('Código inválido. Entre em contato com um admin no Discord.', 'error');
      el('gate-code').classList.add('shake');
      setTimeout(() => el('gate-code').classList.remove('shake'), 500);
    }
  };
  el('gate-code').addEventListener('keypress', e => {
    if (e.key === 'Enter') el('gate-submit').click();
  });
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
let authMode = 'login';

function renderAuthScreen() {
  el('auth-title').textContent = authMode === 'login' ? 'Bem-vindo de volta' : 'Criar conta';
  el('auth-tab-login').classList.toggle('active', authMode === 'login');
  el('auth-tab-register').classList.toggle('active', authMode === 'register');
  el('auth-fields-register').classList.toggle('hidden', authMode !== 'register');
  el('auth-submit').textContent = authMode === 'login' ? 'Entrar' : 'Criar conta';
}

function initAuth() {
  el('auth-tab-login').onclick = () => { authMode = 'login'; renderAuthScreen(); };
  el('auth-tab-register').onclick = () => { authMode = 'register'; renderAuthScreen(); };

  el('auth-submit').onclick = () => {
    const username = el('auth-username').value.trim();
    const password = el('auth-password').value;

    if (!username || !password) return toast('Preencha todos os campos.', 'error');

    const users = DB.get('users', []);

    if (authMode === 'register') {
      if (users.find(u => u.username.toLowerCase() === username.toLowerCase()))
        return toast('Usuário já existe.', 'error');
      if (password.length < 4) return toast('Senha muito curta.', 'error');

      const isAdmin = password === cfg().adminCode || username.toLowerCase().includes('admin');
      const user = {
        id: 'u_' + Date.now(),
        username,
        password,
        coins: cfg().startingCoins,
        joinDate: Date.now(),
        isAdmin: isAdmin,
        missionProgress: {},
        completedMissions: [],
        totalMessages: 0,
        thoughtsBought: 0,
        uniqueCharsContacted: []
      };
      users.push(user);
      DB.set('users', users);
      DB.set('current_user', user.id);
      state.currentUser = user;
      toast('Conta criada! +' + user.coins + '🪙 iniciais!', 'gold', 3500);
      startApp();
    } else {
      const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
      if (!user) return toast('Usuário ou senha incorretos.', 'error');

      // Ban check on user
      if (user.bannedUntil && Date.now() < user.bannedUntil) {
        const days = Math.ceil((user.bannedUntil - Date.now()) / 86400000);
        return showBanModal(user.banReason || 'Violação dos termos', days);
      }

      DB.set('current_user', user.id);
      state.currentUser = user;
      startApp();
    }
  };

  el('auth-password').addEventListener('keypress', e => {
    if (e.key === 'Enter') el('auth-submit').click();
  });
}

function showBanModal(reason, days) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">🚫 Conta Banida</div>
      <div class="modal-body">
        <strong>Motivo:</strong> ${reason}<br><br>
        Sua conta foi suspensa por <strong>${days} dia(s)</strong>.
        Entre em contato no Discord se acredita que foi um erro:<br>
        <strong>lorenzo00496</strong> ou <strong>inlovecolette</strong>
      </div>
      <button class="btn btn-secondary btn-full" onclick="this.closest('.modal-overlay').remove()">OK, entendi</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

// ─── START APP ───────────────────────────────────────────────────────────────
async function startApp() {
  showScreen('screen-loading', false);
  checkAndCleanBans();
  checkDailyMission();

  // Simulate background data loading
  await sleep(600);

  renderMainApp();
  showScreen('screen-main');
  switchTab('chars');
}

function checkDailyMission() {
  if (!state.currentUser) return;
  const lastDaily = DB.get('daily_' + state.currentUser.id);
  const today = new Date().toDateString();
  if (lastDaily !== today) {
    DB.set('daily_' + state.currentUser.id, today);
    updateMissionProgress('daily', 1);
  }
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
function renderMainApp() {
  if (state.currentUser.isAdmin) {
    el('admin-nav-btn').classList.remove('hidden');
  }
}

function updateCoinsDisplay() {
  const users = DB.get('users', []);
  const user = users.find(u => u.id === state.currentUser.id);
  if (user) {
    state.currentUser = user;
    // Update any visible coin counter
    document.querySelectorAll('.coins-display').forEach(el2 => {
      el2.textContent = user.coins;
    });
  }
}

// ─── BOTTOM NAV / TABS ────────────────────────────────────────────────────────
function switchTab(tab) {
  state.currentTab = tab;
  qsa('.nav-btn').forEach(b => b.classList.remove('active'));
  el('nav-' + tab).classList.add('active');

  const content = el('tab-content');
  content.innerHTML = '';

  if (tab === 'chars') renderCharsTab(content);
  else if (tab === 'profile') renderProfileTab(content);
  else if (tab === 'missions') renderMissionsTab(content);

  updateNavBadges();
}

function updateNavBadges() {
  // Missions badge
  const missions = DB.get('missions', []);
  const user = state.currentUser;
  const claimable = missions.filter(m => {
    if (user.completedMissions?.includes(m.id)) return false;
    const prog = user.missionProgress?.[m.id] || 0;
    return prog >= m.target;
  }).length;
  const badge = el('missions-badge');
  if (claimable > 0) { badge.textContent = claimable; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');

  // Chats badge
  const chats = DB.get('chats', []).filter(c => c.userId === user.id && (c.unread || 0) > 0);
  const chatBadge = el('chats-badge');
  const totalUnread = chats.reduce((acc, c) => acc + (c.unread || 0), 0);
  if (totalUnread > 0) { chatBadge.textContent = totalUnread; chatBadge.classList.remove('hidden'); }
  else chatBadge.classList.add('hidden');
}

// ─── CHARS TAB ───────────────────────────────────────────────────────────────
function renderCharsTab(container) {
  const skeletonCard = `
    <div class="skeleton-card" style="flex-direction:column;padding:0;gap:0;border-radius:12px;overflow:hidden">
      <div class="skeleton" style="aspect-ratio:3/4;width:100%"></div>
      <div style="padding:10px 12px;display:flex;flex-direction:column;gap:6px">
        <div class="skeleton skel-line" style="width:70%"></div>
        <div class="skeleton skel-line-sm" style="width:50%"></div>
      </div>
    </div>`;

  container.innerHTML = `
    <div class="app-header">
      <div class="header-title">✨ Personagens</div>
      <div class="header-coins">
        <span>🪙</span>
        <span class="coins-display">${state.currentUser.coins}</span>
      </div>
    </div>
    <div style="padding-bottom:calc(var(--nav-h) + 12px)">
      <div class="section-title">Online agora</div>
      <div class="chars-grid" id="chars-grid">
        ${Array(2).fill(skeletonCard).join('')}
      </div>
      <div class="section-title" style="margin-top:8px">Todos os personagens</div>
      <div class="chars-grid" id="chars-grid-all">
        ${Array(4).fill(skeletonCard).join('')}
      </div>
      <div style="height:8px"></div>
    </div>
  `;

  // Replace skeletons with real content after short delay
  setTimeout(() => {
    const chars = DB.get('characters', []);
    const online = chars.filter(c => c.isOnline && !c.isBanned);
    const all = chars.filter(c => !c.isOnline || c.isBanned);
    renderCharGrid(el('chars-grid'), online);
    renderCharGrid(el('chars-grid-all'), all);
  }, 500);
}

function renderCharGrid(container, chars) {
  if (!container) return;
  if (!chars.length) {
    container.innerHTML = '<div style="padding:16px;color:var(--text-3);font-size:.85rem;grid-column:1/-1">Nenhum</div>';
    return;
  }
  container.innerHTML = chars.map(c => {
    const banDays = c.banUntil ? Math.ceil((c.banUntil - Date.now()) / 86400000) : 0;
    const statusClass = c.isBanned ? '' : (c.isOnline ? 'online' : 'bot');
    const statusDot = `<div class="char-status-dot ${statusClass}"></div>`;
    const banOverlay = c.isBanned ? `
      <div class="char-ban-badge">
        <span>🚫</span>
        <span>BANIDO • ${banDays}d</span>
      </div>
    ` : '';
    return `
      <div class="char-card ${c.isBanned ? 'banned' : ''}" onclick="openChat('${c.id}')">
        <div class="char-img-wrap">
          <img src="${c.image}" alt="${c.name}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;120&quot; height=&quot;160&quot; viewBox=&quot;0 0 120 160&quot;><rect width=&quot;120&quot; height=&quot;160&quot; fill=&quot;%231f2133&quot;/><text x=&quot;50%&quot; y=&quot;50%&quot; text-anchor=&quot;middle&quot; dominant-baseline=&quot;middle&quot; font-size=&quot;40&quot;>👤</text></svg>'">
          ${statusDot}
          ${banOverlay}
        </div>
        <div class="char-info">
          <div class="char-name">${c.name}</div>
          <div class="char-role">${c.role}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ─── OPEN CHAT ────────────────────────────────────────────────────────────────
function openChat(charId) {
  const chars = DB.get('characters', []);
  const char = chars.find(c => c.id === charId);
  if (!char || char.isBanned) return;

  state.currentChat = { charId, char };

  // Find or create chat
  const chats = DB.get('chats', []);
  let chat = chats.find(c => c.userId === state.currentUser.id && c.charId === charId);
  if (!chat) {
    chat = {
      id: 'chat_' + Date.now(),
      userId: state.currentUser.id,
      charId,
      createdAt: Date.now(),
      lastMessage: '',
      lastTime: Date.now(),
      unread: 0
    };
    chats.push(chat);
    DB.set('chats', chats);
  }
  state.currentChat.chatId = chat.id;

  renderChatScreen(char, chat);
  showScreen('screen-chat');
}

function renderChatScreen(char, chat) {
  const statusText = char.isOnline ? 'Online' : 'Offline · Bot respondendo';
  const statusClass = char.isOnline ? '' : 'bot-active';
  const statusDot = char.isOnline ? '🟢' : '🤖';

  el('chat-char-name').textContent = char.name;
  el('chat-char-status').textContent = statusText;
  el('chat-char-status').className = 'chat-header-status ' + statusClass;
  el('chat-char-status').innerHTML = `${statusDot} ${statusText}`;
  const img = el('chat-char-avatar-img');
  img.src = char.image;
  img.alt = char.name;

  updateCostHints();
  loadMessages();
  el('chat-input').focus();
}

function loadMessages() {
  const messages = DB.get('messages', {});
  const chatMessages = messages[state.currentChat.chatId] || [];
  renderMessages(chatMessages);

  // Clear unread
  const chats = DB.get('chats', []);
  const chat = chats.find(c => c.id === state.currentChat.chatId);
  if (chat) { chat.unread = 0; DB.set('chats', chats); }
}

function renderMessages(messages) {
  const container = el('chat-messages');
  if (!messages.length) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <p>Comece uma conversa!</p>
      </div>
    `;
    return;
  }
  container.innerHTML = messages.map(m => renderMessage(m)).join('');
  container.scrollTop = container.scrollHeight;
}

function renderMessage(msg) {
  const isUser = msg.senderId === state.currentUser.id;
  const avatarSrc = isUser ? '' : (DB.get('characters', []).find(c => c.id === msg.senderId)?.image || '');

  const avatarHtml = !isUser ? `
    <div class="msg-avatar">
      <img src="${avatarSrc}" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;32&quot; height=&quot;32&quot; viewBox=&quot;0 0 32 32&quot;><rect width=&quot;32&quot; height=&quot;32&quot; fill=&quot;%231f2133&quot; rx=&quot;16&quot;/><text x=&quot;50%&quot; y=&quot;50%&quot; text-anchor=&quot;middle&quot; dominant-baseline=&quot;middle&quot; font-size=&quot;14&quot;>👤</text></svg>'">
    </div>
  ` : '';

  let typeLabel = '';
  let bubbleClass = isUser ? 'user-msg' : 'char';
  let costHtml = '';

  if (!isUser) {
    if (msg.type === 'thought') {
      bubbleClass = 'thought';
      typeLabel = `<div class="msg-type-label thought">🧠 Pensamento</div>`;
      costHtml = msg.cost ? `<div class="msg-cost">🪙 ${msg.cost}</div>` : '';
    } else if (msg.type === 'action') {
      bubbleClass = 'action';
      typeLabel = `<div class="msg-type-label action">✦ Ação</div>`;
    }
  }

  return `
    <div class="msg-row ${isUser ? 'user' : ''}">
      ${avatarHtml}
      <div class="msg-bubble-wrap">
        ${typeLabel}
        <div class="msg-bubble ${bubbleClass}">${escapeHtml(msg.text)}</div>
        <div class="flex gap-2 items-center">
          <div class="msg-time">${timeAgo(msg.timestamp)}</div>
          ${costHtml}
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(text) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── SEND MESSAGE ─────────────────────────────────────────────────────────────
async function sendMessage() {
  const input = el('chat-input');
  const text = input.value.trim();
  if (!text || state.isTyping) return;

  const type = state.messageType; // speech, thought, action
  const config = cfg();
  const cost = type === 'thought' ? config.thoughtCost : (type === 'action' ? config.actionCost : config.speechCost);

  // Check coins
  const users = DB.get('users', []);
  const user = users.find(u => u.id === state.currentUser.id);
  if (cost > 0 && user.coins < cost) {
    return toast(`Sem moedas! Você precisa de ${cost}🪙 para enviar um ${type}.`, 'error');
  }

  // Deduct coins
  if (cost > 0) {
    user.coins -= cost;
    DB.set('users', users);
    state.currentUser = user;
    updateCoinsDisplay();
    toast(`-${cost}🪙`, 'info', 1500);
  }

  input.value = '';
  input.style.height = 'auto';

  // Add user message
  const userMsg = {
    id: 'm_' + Date.now(),
    senderId: state.currentUser.id,
    chatId: state.currentChat.chatId,
    type,
    text,
    timestamp: Date.now(),
    cost
  };
  addMessage(userMsg);

  // Update stats
  user.totalMessages = (user.totalMessages || 0) + 1;
  if (!user.uniqueCharsContacted) user.uniqueCharsContacted = [];
  if (!user.uniqueCharsContacted.includes(state.currentChat.charId)) {
    user.uniqueCharsContacted.push(state.currentChat.charId);
  }
  if (type === 'thought') user.thoughtsBought = (user.thoughtsBought || 0) + 1;
  DB.set('users', users);
  state.currentUser = user;

  // Update missions
  updateMissionProgress('chat_count', user.totalMessages);
  updateMissionProgress('unique_chars', user.uniqueCharsContacted.length);
  if (type === 'thought') updateMissionProgress('thoughts_bought', user.thoughtsBought);

  // Bot response
  await botRespond();
}

async function botRespond() {
  if (state.isTyping) return;
  state.isTyping = true;

  const char = state.currentChat.char;
  const config = cfg();
  const delay = config.botDelay.min + Math.random() * (config.botDelay.max - config.botDelay.min);

  // Show typing indicator
  const container = el('chat-messages');
  const typingId = 'typing_' + Date.now();
  const typingEl = document.createElement('div');
  typingEl.id = typingId;
  typingEl.className = 'msg-row';
  typingEl.innerHTML = `
    <div class="msg-avatar">
      <img src="${char.image}" alt="" onerror="this.src=''">
    </div>
    <div>
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  container.appendChild(typingEl);
  container.scrollTop = container.scrollHeight;

  await sleep(delay);

  // Remove typing
  const te = document.getElementById(typingId);
  if (te) te.remove();

  // Pick response set
  const responses = char.offline_responses ? rand(char.offline_responses) : [];

  if (responses.length === 0) {
    state.isTyping = false;
    return;
  }

  for (let i = 0; i < responses.length; i++) {
    const resp = responses[i];
    const cost = resp.type === 'thought' ? config.thoughtCost : (resp.type === 'action' ? config.actionCost : 0);
    const botMsg = {
      id: 'm_' + Date.now() + '_' + i,
      senderId: char.id,
      chatId: state.currentChat.chatId,
      type: resp.type,
      text: resp.text,
      timestamp: Date.now(),
      cost: resp.type === 'thought' ? cost : 0,
      isBot: true
    };

    if (resp.type === 'thought') {
      // Check if user wants to unlock the thought
      await promptThoughtUnlock(botMsg, char, cost, container);
    } else {
      addMessage(botMsg);
      if (i < responses.length - 1) await sleep(600 + Math.random() * 400);
    }
  }

  state.isTyping = false;
}

async function promptThoughtUnlock(msg, char, cost, container) {
  return new Promise(resolve => {
    const lockEl = document.createElement('div');
    lockEl.className = 'msg-row';
    lockEl.innerHTML = `
      <div class="msg-avatar">
        <img src="${char.image}" alt="" onerror="this.src=''">
      </div>
      <div class="msg-bubble-wrap">
        <div class="msg-type-label thought">🧠 Pensamento bloqueado</div>
        <div class="msg-bubble thought" style="display:flex;align-items:center;gap:10px;cursor:default">
          <span style="font-size:1.2rem;filter:blur(4px)">•••••••••••</span>
          <button class="btn btn-gold btn-sm" onclick="unlockThought(this, '${msg.id}')">🪙 ${cost} Desbloquear</button>
        </div>
        <div class="msg-time">${timeAgo(msg.timestamp)}</div>
      </div>
    `;
    lockEl.dataset.lockedMsg = JSON.stringify(msg);
    lockEl.id = 'locked_' + msg.id;
    container.appendChild(lockEl);
    container.scrollTop = container.scrollHeight;

    // Auto-resolve after showing — real unlock happens via unlockThought()
    resolve();
  });
}

function unlockThought(btn, msgId) {
  const config = cfg();
  const cost = config.thoughtCost;
  const users = DB.get('users', []);
  const user = users.find(u => u.id === state.currentUser.id);

  if (user.coins < cost) return toast(`Sem moedas! Precisa de ${cost}🪙`, 'error');

  user.coins -= cost;
  user.thoughtsBought = (user.thoughtsBought || 0) + 1;
  DB.set('users', users);
  state.currentUser = user;
  updateCoinsDisplay();

  const lockEl = document.getElementById('locked_' + msgId);
  if (!lockEl) return;
  const msg = JSON.parse(lockEl.dataset.lockedMsg);
  lockEl.remove();

  addMessage({ ...msg, cost });
  toast(`-${cost}🪙 — Pensamento desbloqueado!`, 'gold');
  updateMissionProgress('thoughts_bought', user.thoughtsBought);
}

function addMessage(msg) {
  const messages = DB.get('messages', {});
  if (!messages[msg.chatId]) messages[msg.chatId] = [];
  messages[msg.chatId].push(msg);
  DB.set('messages', messages);

  // Update chat last message
  const chats = DB.get('chats', []);
  const chat = chats.find(c => c.id === msg.chatId);
  if (chat) {
    chat.lastMessage = msg.text.substring(0, 60);
    chat.lastTime = msg.timestamp;
    if (msg.isBot) chat.unread = (chat.unread || 0) + 1;
    DB.set('chats', chats);
  }

  // Render message
  const container = el('chat-messages');
  const msgEl = document.createElement('div');
  msgEl.innerHTML = renderMessage(msg);
  container.appendChild(msgEl.firstElementChild);
  container.scrollTop = container.scrollHeight;
}

// ─── MSG TYPE SELECTOR ────────────────────────────────────────────────────────
function setMessageType(type) {
  state.messageType = type;
  qsa('.thought-btn').forEach(b => b.className = 'thought-btn');
  el('btn-type-' + type).classList.add('active-' + type);
  updateCostHints();
}

function updateCostHints() {
  const config = cfg();
  el('cost-thought').textContent = config.thoughtCost;
  el('cost-action').textContent = config.actionCost;
  el('cost-speech').textContent = config.speechCost;
}

// ─── PROFILE TAB ─────────────────────────────────────────────────────────────
function renderProfileTab(container) {
  const user = state.currentUser;
  const chats = DB.get('chats', []).filter(c => c.userId === user.id);
  const totalMsgs = user.totalMessages || 0;
  const chars = user.uniqueCharsContacted?.length || 0;

  container.innerHTML = `
    <div class="profile-banner"></div>
    <div style="padding-bottom:calc(var(--nav-h) + 16px)">
      <div class="profile-avatar-wrap">
        <div class="profile-avatar">
          <img src="https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(user.username)}" alt="${user.username}">
        </div>
      </div>
      <div class="profile-info">
        <div class="profile-username">${escapeHtml(user.username)} ${user.isAdmin ? '<span class="chip chip-red">ADMIN</span>' : ''}</div>
        <div class="profile-joined">Desde ${formatDate(user.joinDate)}</div>
      </div>
      <div class="coins-card">
        <div>
          <div class="coins-amount">${user.coins}</div>
          <div class="coins-label">Moedas disponíveis</div>
        </div>
        <span style="font-size:2.5rem">🪙</span>
      </div>
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-value">${totalMsgs}</div>
          <div class="stat-label">Mensagens</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${chats.length}</div>
          <div class="stat-label">Chats</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${chars}</div>
          <div class="stat-label">Personagens</div>
        </div>
      </div>

      <div class="section-title">Chats abertos</div>
      <div class="chat-list" id="open-chats-list"></div>

      ${user.isAdmin ? `
        <div style="padding:16px">
          <button class="btn btn-danger btn-full" onclick="showAdminPanel()">⚙️ Painel Admin</button>
        </div>
      ` : ''}

      <div style="padding:16px">
        <button class="btn btn-secondary btn-full" onclick="logout()">Sair</button>
      </div>
    </div>
  `;

  renderOpenChats(el('open-chats-list'), chats);
}

function renderOpenChats(container, chats) {
  if (!chats.length) {
    container.innerHTML = '<div class="empty-state"><p>Nenhum chat aberto ainda</p></div>';
    return;
  }
  const characters = DB.get('characters', []);
  container.innerHTML = chats.sort((a,b) => b.lastTime - a.lastTime).map(chat => {
    const char = characters.find(c => c.id === chat.charId);
    if (!char) return '';
    const statusClass = char.isBanned ? 'offline' : (char.isOnline ? 'online' : 'bot');
    return `
      <div class="chat-item" onclick="openChat('${char.id}')">
        <div class="chat-avatar">
          <img src="${char.image}" alt="${char.name}" loading="lazy" onerror="this.src=''">
          <div class="chat-avatar-status ${statusClass}"></div>
        </div>
        <div class="chat-meta">
          <div class="chat-meta-top">
            <div class="chat-meta-name">${char.name}</div>
            <div class="chat-meta-time">${timeAgo(chat.lastTime)}</div>
          </div>
          <div class="chat-meta-preview">${chat.lastMessage || 'Nenhuma mensagem ainda'}</div>
        </div>
        ${chat.unread > 0 ? `<div class="chat-unread">${chat.unread}</div>` : ''}
      </div>
    `;
  }).join('');
}

// ─── MISSIONS TAB ─────────────────────────────────────────────────────────────
function renderMissionsTab(container) {
  const missions = DB.get('missions', []);
  const user = state.currentUser;

  const activeMissions = missions.filter(m => !user.completedMissions?.includes(m.id));
  const doneMissions = missions.filter(m => user.completedMissions?.includes(m.id));

  container.innerHTML = `
    <div class="app-header">
      <div class="header-title">🎯 Missões</div>
      <div class="header-coins"><span>🪙</span><span class="coins-display">${user.coins}</span></div>
    </div>
    <div style="padding-bottom:calc(var(--nav-h) + 12px)">
      ${user.uniqueCharsContacted?.length === 0 ? `
        <div style="margin:12px 16px;background:linear-gradient(135deg,rgba(139,92,246,.15),rgba(192,132,252,.08));border:1px solid var(--border-bright);border-radius:var(--radius);padding:14px">
          <div style="font-size:.85rem;font-weight:700;margin-bottom:4px">👋 Novo por aqui?</div>
          <div style="font-size:.8rem;color:var(--text-2)">Complete as missões iniciais para ganhar moedas e desbloquear conteúdo!</div>
        </div>
      ` : ''}
      <div class="section-title">Ativas (${activeMissions.length})</div>
      ${activeMissions.map(m => renderMissionCard(m, user)).join('')}
      ${doneMissions.length ? `
        <div class="section-title" style="margin-top:8px">Concluídas</div>
        ${doneMissions.map(m => renderMissionCard(m, user, true)).join('')}
      ` : ''}
      <div style="height:16px"></div>
    </div>
  `;
}

function renderMissionCard(mission, user, done = false) {
  const progress = user.missionProgress?.[mission.id] || 0;
  const pct = Math.min(100, (progress / mission.target) * 100);
  const canClaim = !done && progress >= mission.target && !user.completedMissions?.includes(mission.id);

  return `
    <div class="mission-card ${done ? 'completed' : ''}">
      <div class="mission-icon ${mission.icon === '⭐' ? 'gold' : ''}">${mission.icon}</div>
      <div class="mission-info">
        <div class="mission-title">${mission.title}</div>
        <div class="mission-desc">${mission.desc || mission.description}</div>
        <div class="mission-progress-bar">
          <div class="mission-progress-fill" style="width:${pct}%"></div>
        </div>
        <div style="font-size:.7rem;color:var(--text-3);margin-top:3px">${progress}/${mission.target}</div>
      </div>
      ${done ? `<span style="font-size:1.3rem">✅</span>` :
        canClaim ? `<button class="mission-claim-btn" onclick="claimMission('${mission.id}', event)">+${mission.reward}🪙</button>` :
        `<div class="mission-reward"><span>🪙</span><span>+${mission.reward}</span></div>`
      }
    </div>
  `;
}

function claimMission(missionId, event) {
  const missions = DB.get('missions', []);
  const mission = missions.find(m => m.id === missionId);
  if (!mission) return;

  const users = DB.get('users', []);
  const user = users.find(u => u.id === state.currentUser.id);
  if (!user.completedMissions) user.completedMissions = [];
  if (user.completedMissions.includes(missionId)) return;

  user.coins += mission.reward;
  user.completedMissions.push(missionId);
  DB.set('users', users);
  state.currentUser = user;

  // Coin animation
  const rect = event.target.getBoundingClientRect();
  coinFly(mission.reward, rect.left, rect.top);

  toast(`+${mission.reward}🪙 — ${mission.title} concluída!`, 'gold', 3000);
  updateCoinsDisplay();
  switchTab('missions');
  updateNavBadges();
}

function updateMissionProgress(type, value) {
  const missions = DB.get('missions', []);
  const users = DB.get('users', []);
  const user = users.find(u => u.id === state.currentUser.id);
  if (!user.missionProgress) user.missionProgress = {};

  missions.forEach(m => {
    if (m.type === type && !user.completedMissions?.includes(m.id)) {
      if (type === 'daily') {
        user.missionProgress[m.id] = 1;
      } else {
        user.missionProgress[m.id] = value;
      }
    }
  });

  DB.set('users', users);
  state.currentUser = user;
  updateNavBadges();
}

// ─── ADMIN PANEL ─────────────────────────────────────────────────────────────
function showAdminPanel() {
  showScreen('screen-admin');
  renderAdminPanel();
}

function renderAdminPanel() {
  const container = el('admin-content');
  const chars = DB.get('characters', []);
  const missions = DB.get('missions', []);
  const config = cfg();
  const users = DB.get('users', []);

  container.innerHTML = `
    <!-- COSTS CONFIG -->
    <div class="admin-section">
      <div class="admin-section-header">⚙️ Configurações de Custo</div>
      <div class="admin-row">
        <div class="admin-row-info">
          <div class="admin-row-name">🧠 Pensamento</div>
          <div class="admin-row-sub">Custo para ver um pensamento</div>
        </div>
        <input type="number" class="input" style="width:70px" id="cost-thought-cfg" value="${config.thoughtCost}" min="0">
      </div>
      <div class="admin-row">
        <div class="admin-row-info">
          <div class="admin-row-name">✦ Ação</div>
          <div class="admin-row-sub">Custo para enviar uma ação</div>
        </div>
        <input type="number" class="input" style="width:70px" id="cost-action-cfg" value="${config.actionCost}" min="0">
      </div>
      <div class="admin-row">
        <div class="admin-row-info">
          <div class="admin-row-name">🗣️ Fala</div>
          <div class="admin-row-sub">Custo para enviar uma fala</div>
        </div>
        <input type="number" class="input" style="width:70px" id="cost-speech-cfg" value="${config.speechCost}" min="0">
      </div>
      <div class="admin-row">
        <div class="admin-row-info">
          <div class="admin-row-name">🔑 Código de Acesso</div>
          <div class="admin-row-sub">Código para novos usuários se cadastrarem</div>
        </div>
        <input type="text" class="input" style="width:120px" id="access-code-cfg" value="${config.accessCode}">
      </div>
      <div class="admin-row" style="justify-content:flex-end">
        <button class="btn btn-primary btn-sm" onclick="saveConfig()">Salvar</button>
      </div>
    </div>

    <!-- CHARACTERS -->
    <div class="admin-section">
      <div class="admin-section-header">👤 Personagens</div>
      ${chars.map(c => `
        <div class="admin-row">
          <div class="chat-avatar" style="width:40px;height:40px">
            <img src="${c.image}" alt="${c.name}" style="width:100%;height:100%;object-fit:cover;object-position:top;" onerror="this.src=''">
          </div>
          <div class="admin-row-info">
            <div class="admin-row-name">${c.name}</div>
            <div class="admin-row-sub">${c.isBanned ? '🚫 Banido' : (c.isOnline ? '🟢 Online' : '⚫ Offline')}</div>
          </div>
          <div class="admin-actions">
            <label class="toggle-switch" title="Online/Offline">
              <input type="checkbox" ${c.isOnline ? 'checked' : ''} onchange="toggleCharOnline('${c.id}', this.checked)">
              <span class="toggle-slider"></span>
            </label>
            ${c.isBanned
              ? `<button class="btn btn-sm btn-secondary" onclick="unbanChar('${c.id}')">Desbanir</button>`
              : `<button class="btn btn-sm btn-danger" onclick="showBanCharModal('${c.id}')">Banir</button>`
            }
            <button class="btn btn-sm btn-secondary" onclick="showEditCharModal('${c.id}')">✏️</button>
          </div>
        </div>
      `).join('')}
      <div class="admin-row" style="justify-content:center">
        <button class="btn btn-primary btn-sm" onclick="showAddCharModal()">+ Novo Personagem</button>
      </div>
    </div>

    <!-- USERS -->
    <div class="admin-section">
      <div class="admin-section-header">👥 Usuários (${users.length})</div>
      ${users.map(u => `
        <div class="admin-row">
          <div class="admin-row-info">
            <div class="admin-row-name">${escapeHtml(u.username)} ${u.isAdmin ? '<span class="chip chip-red" style="font-size:.6rem">ADMIN</span>' : ''}</div>
            <div class="admin-row-sub">🪙 ${u.coins} · ${u.totalMessages||0} msgs · desde ${formatDate(u.joinDate)}</div>
          </div>
          <div class="admin-actions">
            ${u.bannedUntil && Date.now() < u.bannedUntil
              ? `<button class="btn btn-xs btn-secondary" onclick="unbanUser('${u.id}')">Desbanir</button>`
              : u.id !== state.currentUser.id
                ? `<button class="btn btn-xs btn-danger" onclick="showBanUserModal('${u.id}')">Banir</button>`
                : ''
            }
          </div>
        </div>
      `).join('')}
    </div>

    <!-- MISSIONS -->
    <div class="admin-section">
      <div class="admin-section-header">🎯 Missões</div>
      ${missions.map(m => `
        <div class="admin-row">
          <div style="font-size:1.2rem;width:30px;text-align:center">${m.icon}</div>
          <div class="admin-row-info">
            <div class="admin-row-name">${m.title}</div>
            <div class="admin-row-sub">+${m.reward}🪙 · Meta: ${m.target} · ${m.type}</div>
          </div>
          <button class="btn btn-xs btn-danger" onclick="deleteMission('${m.id}')">🗑️</button>
        </div>
      `).join('')}
      <div class="admin-row" style="justify-content:center">
        <button class="btn btn-primary btn-sm" onclick="showAddMissionModal()">+ Nova Missão</button>
      </div>
    </div>

    <div style="height:32px"></div>
  `;
}

function saveConfig() {
  const config = cfg();
  config.thoughtCost = parseInt(el('cost-thought-cfg').value) || 0;
  config.actionCost = parseInt(el('cost-action-cfg').value) || 0;
  config.speechCost = parseInt(el('cost-speech-cfg').value) || 0;
  config.accessCode = el('access-code-cfg').value.trim() || config.accessCode;
  DB.set('config', config);
  toast('Configurações salvas!', 'success');
}

function toggleCharOnline(charId, isOnline) {
  const chars = DB.get('characters', []);
  const char = chars.find(c => c.id === charId);
  if (char) { char.isOnline = isOnline; DB.set('characters', chars); }
}

function showBanCharModal(charId) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">🚫 Banir Personagem</div>
      <div class="field">
        <label>Motivo</label>
        <input type="text" class="input" id="ban-char-reason" placeholder="Ex: Comportamento inadequado">
      </div>
      <div class="field">
        <label>Dias de ban</label>
        <input type="number" class="input" id="ban-char-days" value="3" min="1" max="30">
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary flex-1" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn btn-danger flex-1" onclick="banChar('${charId}', this)">Banir 🚫</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function banChar(charId, btn) {
  const overlay = btn.closest('.modal-overlay');
  const reason = el('ban-char-reason').value.trim() || 'Sem motivo';
  const days = parseInt(el('ban-char-days').value) || 3;
  const chars = DB.get('characters', []);
  const char = chars.find(c => c.id === charId);
  if (char) {
    char.isBanned = true;
    char.banReason = reason;
    char.banUntil = Date.now() + days * 86400000;
    char.isOnline = false;
    DB.set('characters', chars);
  }
  overlay.remove();
  toast(`${char.name} banido por ${days} dias.`, 'error');
  renderAdminPanel();
}

function unbanChar(charId) {
  const chars = DB.get('characters', []);
  const char = chars.find(c => c.id === charId);
  if (char) { char.isBanned = false; char.banUntil = null; char.banReason = ''; DB.set('characters', chars); }
  toast('Personagem desbanido!', 'success');
  renderAdminPanel();
}

function showBanUserModal(userId) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">🚫 Banir Usuário</div>
      <div class="field">
        <label>Motivo</label>
        <input type="text" class="input" id="ban-user-reason" placeholder="Motivo do ban">
      </div>
      <div class="field">
        <label>Dias de ban</label>
        <input type="number" class="input" id="ban-user-days" value="3" min="1">
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary flex-1" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn btn-danger flex-1" onclick="banUser('${userId}', this)">Banir</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function banUser(userId, btn) {
  const overlay = btn.closest('.modal-overlay');
  const reason = el('ban-user-reason').value.trim() || 'Sem motivo';
  const days = parseInt(el('ban-user-days').value) || 3;
  const users = DB.get('users', []);
  const user = users.find(u => u.id === userId);
  if (user) {
    user.bannedUntil = Date.now() + days * 86400000;
    user.banReason = reason;
    DB.set('users', users);
  }
  overlay.remove();
  toast(`Usuário banido por ${days} dias.`, 'error');
  renderAdminPanel();
}

function unbanUser(userId) {
  const users = DB.get('users', []);
  const user = users.find(u => u.id === userId);
  if (user) { user.bannedUntil = null; user.banReason = ''; DB.set('users', users); }
  toast('Usuário desbanido!', 'success');
  renderAdminPanel();
}

function deleteMission(missionId) {
  const missions = DB.get('missions', []).filter(m => m.id !== missionId);
  DB.set('missions', missions);
  toast('Missão removida.', 'info');
  renderAdminPanel();
}

function showAddCharModal(editId = null) {
  const chars = DB.get('characters', []);
  const char = editId ? chars.find(c => c.id === editId) : null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay char-form-modal';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">${char ? '✏️ Editar' : '+ Novo'} Personagem</div>
      <div class="field"><label>Nome</label><input class="input" id="cf-name" value="${char?.name||''}"></div>
      <div class="field"><label>Função/Título</label><input class="input" id="cf-role" value="${char?.role||''}"></div>
      <div class="field"><label>URL da Imagem</label><input class="input" id="cf-image" value="${char?.image||''}" placeholder="https://..."></div>
      <div class="field"><label>Descrição</label><input class="input" id="cf-desc" value="${char?.description||''}"></div>
      <div class="field"><label>Personalidade do Bot</label><textarea class="input" id="cf-personality" style="min-height:80px">${char?.botPersonality||''}</textarea></div>
      <div class="field">
        <label>Respostas offline (JSON — array de arrays)</label>
        <textarea class="input" id="cf-responses" style="min-height:100px;font-size:.75rem;font-family:monospace">${char ? JSON.stringify(char.offline_responses, null, 2) : '[[{"type":"speech","text":"Olá!"}]]'}</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary flex-1" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn btn-primary flex-1" onclick="saveChar('${editId||''}', this)">Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function showEditCharModal(charId) { showAddCharModal(charId); }

function saveChar(editId, btn) {
  const overlay = btn.closest('.modal-overlay');
  const name = el('cf-name').value.trim();
  if (!name) return toast('Nome obrigatório.', 'error');
  let responses = [[{type:'speech',text:'Olá!'}]];
  try { responses = JSON.parse(el('cf-responses').value); } catch {}

  const chars = DB.get('characters', []);
  if (editId) {
    const char = chars.find(c => c.id === editId);
    if (char) {
      char.name = name;
      char.role = el('cf-role').value.trim();
      char.image = el('cf-image').value.trim();
      char.description = el('cf-desc').value.trim();
      char.botPersonality = el('cf-personality').value.trim();
      char.offline_responses = responses;
    }
  } else {
    chars.push({
      id: 'c_' + Date.now(),
      name,
      role: el('cf-role').value.trim(),
      image: el('cf-image').value.trim(),
      description: el('cf-desc').value.trim(),
      botPersonality: el('cf-personality').value.trim(),
      isOnline: false,
      isBanned: false,
      banUntil: null,
      banReason: '',
      offline_responses: responses
    });
  }
  DB.set('characters', chars);
  overlay.remove();
  toast('Personagem salvo!', 'success');
  renderAdminPanel();
}

function showAddMissionModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">+ Nova Missão</div>
      <div class="field"><label>Título</label><input class="input" id="mf-title" placeholder="Ex: Novo começo"></div>
      <div class="field"><label>Descrição</label><input class="input" id="mf-desc" placeholder="Ex: Envie 3 mensagens"></div>
      <div class="field"><label>Ícone (emoji)</label><input class="input" id="mf-icon" value="🎯"></div>
      <div class="form-row">
        <div class="field"><label>Recompensa🪙</label><input type="number" class="input" id="mf-reward" value="50" min="1"></div>
        <div class="field"><label>Meta</label><input type="number" class="input" id="mf-target" value="1" min="1"></div>
      </div>
      <div class="field">
        <label>Tipo</label>
        <select class="input" id="mf-type">
          <option value="chat_count">Nº de mensagens (chat_count)</option>
          <option value="thoughts_bought">Pensamentos comprados</option>
          <option value="unique_chars">Personagens únicos contatados</option>
          <option value="daily">Login diário</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary flex-1" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn btn-primary flex-1" onclick="saveMission(this)">Criar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function saveMission(btn) {
  const overlay = btn.closest('.modal-overlay');
  const title = el('mf-title').value.trim();
  if (!title) return toast('Título obrigatório.', 'error');
  const missions = DB.get('missions', []);
  missions.push({
    id: 'm_' + Date.now(),
    title,
    description: el('mf-desc').value.trim(),
    icon: el('mf-icon').value || '🎯',
    reward: parseInt(el('mf-reward').value) || 50,
    target: parseInt(el('mf-target').value) || 1,
    type: el('mf-type').value,
    isNewUser: false
  });
  DB.set('missions', missions);
  overlay.remove();
  toast('Missão criada!', 'success');
  renderAdminPanel();
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
function logout() {
  DB.set('current_user', null);
  state.currentUser = null;
  state.currentChat = null;
  showScreen('screen-auth');
  renderAuthScreen();
}

// ─── TEXTAREA AUTO-RESIZE ─────────────────────────────────────────────────────
function autoResize(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  initData();

  const userId = DB.get('current_user');
  const accessVerified = DB.get('access_verified');

  if (userId) {
    const users = DB.get('users', []);
    const user = users.find(u => u.id === userId);
    if (user) {
      // Check if user is banned
      if (user.bannedUntil && Date.now() < user.bannedUntil) {
        const days = Math.ceil((user.bannedUntil - Date.now()) / 86400000);
        showScreen('screen-auth');
        renderAuthScreen();
        setTimeout(() => showBanModal(user.banReason || 'Violação dos termos', days), 500);
        initAuth();
        return;
      }
      state.currentUser = user;
      await startApp();
    } else {
      showScreen(accessVerified ? 'screen-auth' : 'screen-gate');
      if (accessVerified) { renderAuthScreen(); initAuth(); }
      else initGate();
    }
  } else if (accessVerified) {
    showScreen('screen-auth');
    renderAuthScreen();
    initAuth();
  } else {
    showScreen('screen-gate');
    initGate();
  }
});
