/* ==========================================
   EMMA HONKAI — App Core
   ========================================== */

const EMMA_APP_VERSION = '0.5.15';
let emmaUpdateWatcherTimer = null;
let emmaUpdateNoticeShown = false;

function showAdminUpdateNotice() {
  if (emmaUpdateNoticeShown || !state.currentUser || !(state.currentUser.isAdmin || state.currentUser.isViceAdmin)) return;
  emmaUpdateNoticeShown = true;
  const notice = document.createElement('div');
  notice.id = 'emma-update-notice';
  notice.setAttribute('role', 'alert');
  notice.style.cssText = 'position:fixed;z-index:100000;top:12px;left:50%;transform:translateX(-50%);width:min(560px,calc(100% - 24px));padding:14px 16px;border:1px solid #8b5cf6;border-radius:12px;background:#171323;color:#fff;box-shadow:0 8px 30px #0008;display:flex;align-items:center;justify-content:space-between;gap:12px;font:500 14px Inter,Arial,sans-serif';
  const message = document.createElement('span');
  message.textContent = 'O site recebeu uma pequena atualização. Recarregue o site para aplicar as mudanças.';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Recarregar agora';
  button.style.cssText = 'flex:none;border:0;border-radius:8px;padding:9px 12px;background:#8b5cf6;color:white;font-weight:700;cursor:pointer';
  button.addEventListener('click', () => location.reload());
  notice.append(message, button);
  document.body.appendChild(notice);
}

async function checkAdminSiteUpdate() {
  if (!state.currentUser || !(state.currentUser.isAdmin || state.currentUser.isViceAdmin) || emmaUpdateNoticeShown) return;
  try {
    const url = new URL(location.href);
    url.searchParams.set('_emma_update_check', String(Date.now()));
    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) return;
    const source = await response.text();
    const match = source.match(/id=["']app-version["'][^>]*>\s*versão:\s*([0-9.]+)/i);
    if (match && match[1] !== EMMA_APP_VERSION) showAdminUpdateNotice();
  } catch (error) {
    console.warn('Verificação de atualização:', error);
  }
}

function startAdminUpdateWatcher() {
  if (!state.currentUser || !(state.currentUser.isAdmin || state.currentUser.isViceAdmin) || emmaUpdateWatcherTimer) return;
  checkAdminSiteUpdate();
  emmaUpdateWatcherTimer = setInterval(checkAdminSiteUpdate, 45000);
}

// ─── GITHUB DATA MIRROR — acesso sempre pelo servidor ───────────────────────
const GH_FILES = { missions: 'missions.json', config: 'config.json' };
async function ghPull() {
  let pulled = 0;
  const errors = [];
  for (const [key, filename] of Object.entries(GH_FILES)) {
    try {
      const result = await emmaApi('github_sync', { direction: 'pull', key });
      if (result?.data !== undefined && result.data !== null) {
        localStorage.setItem('emma_' + key, JSON.stringify(result.data)); pulled++;
      } else errors.push(filename + ': resposta vazia do servidor.');
    } catch (e) { errors.push(filename + ': ' + (e.message || 'erro desconhecido')); console.warn('GitHub pull:', e.message); }
  }
  return { pulled, errors };
}
async function ghPush(filename, content) {
  const key = Object.keys(GH_FILES).find(k => GH_FILES[k] === filename);
  if (!key) return { ok:false, error:'Arquivo não permitido.' };
  try { await emmaApi('github_sync', { direction: 'push', key, value: content }); return { ok:true }; }
  catch (e) { console.warn('GitHub push:', e.message); return { ok:false, error:e.message || 'erro desconhecido' }; }
}
function ghPushKey(key) { /* escrita explícita somente por administrador autenticado */ }

// ─── DATA LAYER ──────────────────────────────────────────────────────────────

/* ── Emma backend: Supabase Auth + Realtime ───────────────────────────── */
const EMMA_SUPABASE_URL = 'https://mkzevrxmonducocoupcc.supabase.co';
const EMMA_SUPABASE_KEY = 'sb_publishable_ZQ4vwpNWKjipt1AkuZpXPA_l8BxA7Ao';
const emmaSupabase = window.supabase?.createClient(EMMA_SUPABASE_URL, EMMA_SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});
window.emmaSupabase = emmaSupabase;
let emmaRealtimeChannel = null;

async function emmaAuthRequest(action, payload) {
  const res = await fetch(EMMA_SUPABASE_URL + '/functions/v1/emma-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EMMA_SUPABASE_KEY },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha na autenticação.');
  if (!data.session && action !== 'validate_gate') throw new Error(data.error || 'Conta criada, mas não foi possível iniciar a sessão. Tente entrar novamente.');
  if (data.session) {
    const { error } = await emmaSupabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token
    });
    if (error) throw error;
    startEmmaSessionWindow();
  }
  return data;
}

async function emmaLegalRequest(action, payload = {}) {
  const {data:{session}} = await emmaSupabase.auth.getSession();
  if (!session?.access_token) throw new Error('Entre novamente para verificar as políticas.');
  const response = await fetch(EMMA_SUPABASE_URL + '/functions/v1/emma-legal', {
    method:'POST',
    headers:{'Content-Type':'application/json', apikey:EMMA_SUPABASE_KEY, Authorization:'Bearer '+session.access_token},
    body:JSON.stringify({action,...payload})
  });
  const result = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(result.error || 'Não foi possível verificar as políticas.');
  return result;
}
const EMMA_SESSION_LIMIT_MS = 15 * 60 * 1000;
const EMMA_SESSION_STARTED_KEY = 'emma_session_started_at';
let emmaSessionTimer = null;
let emmaSessionExpiring = false;
let emmaLastActivityAt = Date.now();

function checkEmmaIdleTimeout() {
  if (emmaSessionExpiring) return;
  const idleFor = Date.now() - emmaLastActivityAt;
  if (idleFor >= EMMA_SESSION_LIMIT_MS) return expireEmmaSession();
  emmaSessionTimer = setTimeout(checkEmmaIdleTimeout, EMMA_SESSION_LIMIT_MS - idleFor);
}
function resetEmmaIdleTimer() {
  if (!emmaSupabase || !localStorage.getItem(EMMA_SESSION_STARTED_KEY) || emmaSessionExpiring) return;
  emmaLastActivityAt = Date.now();
  clearTimeout(emmaSessionTimer);
  emmaSessionTimer = setTimeout(checkEmmaIdleTimeout, EMMA_SESSION_LIMIT_MS);
}

function startEmmaSessionWindow() {
  if (!emmaSupabase) return false;
  if (!localStorage.getItem(EMMA_SESSION_STARTED_KEY)) {
    localStorage.setItem(EMMA_SESSION_STARTED_KEY, String(Date.now()));
  }
  emmaLastActivityAt = Date.now();
  clearTimeout(emmaSessionTimer);
  emmaSessionTimer = setTimeout(checkEmmaIdleTimeout, EMMA_SESSION_LIMIT_MS);
  return true;
}

// A sessão é renovada por movimento do mouse/ponteiro; touchmove cobre telas móveis.
['mousemove','pointermove','touchmove'].forEach(eventName => {
  document.addEventListener(eventName, resetEmmaIdleTimer, {passive:true});
});

async function expireEmmaSession() {
  if (emmaSessionExpiring) return;
  emmaSessionExpiring = true;
  clearTimeout(emmaSessionTimer);
  localStorage.setItem('emma_session_reload_required', '1');
  alert('Sua sessão expirou após 15 minutos sem atividade. A página será recarregada para continuar conectado.');
  location.reload();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    if (localStorage.getItem(EMMA_SESSION_STARTED_KEY)) checkEmmaIdleTimeout();
    if (emmaRefreshPending) scheduleEmmaBackendRefresh();
    if (state.currentUser) updateUserPresence();
  }
});

async function continueAfterAuthentication() {
  if (!startEmmaSessionWindow()) return;
  const legal = await emmaLegalRequest('status');
  if (legal.required) { showScreen('screen-legal'); return; }
  await startApp();
}
async function acceptLegalPolicies(button) {
  const privacy = el('legal-privacy-check')?.checked === true;
  const security = el('legal-security-check')?.checked === true;
  if (!privacy || !security) return toast('Marque as duas opções para continuar.', 'error');
  button.disabled = true; button.textContent = 'Registrando aceite…';
  try {
    await emmaLegalRequest('accept', {privacyAccepted:privacy,securityAccepted:security});
    toast('Políticas aceitas. Seu aceite será renovado em um ano.', 'success');
    await startApp();
  } catch (e) {
    toast(e.message || 'Não foi possível registrar o aceite.', 'error');
    button.disabled = false; button.textContent = 'Concordar e continuar';
  }
}

async function emmaApi(action, payload = {}) {
  if (state.currentUser && Date.now() - emmaLastActivityAt >= EMMA_SESSION_LIMIT_MS) { await expireEmmaSession(); throw new Error('Sessão expirada por inatividade.'); }
  if (!emmaSupabase) throw new Error('O serviço de autenticação não carregou. Atualize a página.');
  const { data, error } = await emmaSupabase.functions.invoke('emma-api', { body: { action, ...payload } });
  if (error) {
    let message = data?.error || '';
    if (!message && error.context && typeof error.context.clone === 'function') {
      try {
        const detail = await error.context.clone().json();
        message = detail?.error || detail?.message || '';
      } catch (_) {}
    }
    throw new Error(message || error.message || 'Erro no servidor.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

async function syncMyProfileFromAppUser(user) {
  if (!user || user.id !== state.currentUser?.id) return;
  return emmaApi('sync_my_profile', {
    coins:user.coins, gender:user.gender || 'other',
    chatPreference:user.chatPreference || 'both', avatar:user.avatar || null,
    allowBotTakeover:!!user.allowBotTakeover, isAnonymous:!!user.isAnonymous
  });
}

function profileToAppUser(p) {
  return {
    id: p.id, username: p.username, role:p.role||'user', isAdmin: p.role === 'admin', isViceAdmin:p.role === 'vice_admin', adminPermissions:p.admin_permissions||{},
    userType: p.user_type || 'player', gender: p.gender || 'other',
    chatPreference: p.chat_preference || 'both', avatar: p.avatar || null,
    allowBotTakeover: !!p.allow_bot_takeover, isAnonymous:!!p.is_anonymous,
    creatorLevel:Number(p.creator_level||1),creatorXp:Number(p.creator_xp||0),creatorDailyMessages:Number(p.creator_daily_messages||0),creatorDailyDate:p.creator_daily_date||null,creatorWeeklyMessages:Number(p.creator_weekly_messages||0),creatorWeekStart:p.creator_week_start||null,creatorLevel99RewardClaimed:!!p.creator_level99_reward_claimed,
    assignedCharacterId: p.assigned_character_id || null,
    characterRequest: { status: p.character_request_status || 'none', requestedAt: p.character_request_at ? Date.parse(p.character_request_at) : null },
    joinDate: p.created_at ? Date.parse(p.created_at) : Date.now(),
    lastSeenAt: p.last_seen_at ? Date.parse(p.last_seen_at) : 0,
    coins: Number(p.coins ?? cfg().startingCoins), totalMessages: Number(p.total_messages || 0),
    thoughtsBought: Number(p.thoughts_bought || 0), uniqueCharsContacted: Array.isArray(p.unique_chars_contacted) ? p.unique_chars_contacted : [],
    missionProgress: p.mission_progress || {}, completedMissions: Array.isArray(p.completed_missions) ? p.completed_missions : [],
    thoughtSubscription: p.thought_subscription || null,
    premiumSubscription: p.premium_subscription || null,
    premiumSubscriptionHistory: Array.isArray(p.premium_subscription_history) ? p.premium_subscription_history : [],
    thoughtSubscriptionHistory: Array.isArray(p.thought_subscription_history) ? p.thought_subscription_history : [],
    subscriptionRenewalBanned: !!p.subscription_renewal_banned,
    bannedUntil: p.banned_until ? Date.parse(p.banned_until) : null, isPermanentlyBanned: !!p.is_permanently_banned, banReason: p.ban_reason || '',
    coinHistory: Array.isArray(p.coin_history) ? p.coin_history : []
  };
}

async function fetchAllEmmaRows(table, orderBy = null, options = {}) {
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query = emmaSupabase.from(table).select(options.columns || '*').range(offset, offset + pageSize - 1);
    if (options.eq) query = query.eq(options.eq[0], options.eq[1]);
    if (options.in) query = query.in(options.in[0], options.in[1]);
    if (options.or) query = query.or(options.or);
    if (orderBy) query = query.order(orderBy, { ascending: true });
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function loadEmmaBackendState() {
  const sessionUserId = state.currentUser?.id || (await emmaSupabase.auth.getUser()).data.user?.id;
  if (!sessionUserId) throw new Error('Sessão inválida.');
  const ownProfileResult = await emmaSupabase.from('profiles').select('*').eq('id', sessionUserId).maybeSingle();
  if (ownProfileResult.error || !ownProfileResult.data) throw (ownProfileResult.error || new Error('Perfil não encontrado.'));
  const ownProfile = ownProfileResult.data;
  const adminSession = ownProfile.role === 'admin';
  const viceSession = !adminSession && ownProfile.role === 'vice_admin';
  const profileResult = adminSession ? await emmaApi('admin_list_profiles') : viceSession ? await emmaApi('vice_dashboard') : {profiles:[ownProfile]};
  const profiles = adminSession || viceSession ? (profileResult.profiles || []) : [ownProfile];
  const assignedCharacterId = ownProfile.assigned_character_id || null;

  // Busca só o necessário para a conta atual. Administradores continuam vendo os dados completos.
  const [charactersRows, chatsRows, reportsRows, applicationsRows, missionRows, publicConfig] = await Promise.all([
    viceSession ? (profileResult.characters || []) : fetchAllEmmaRows('characters', null, {columns:'id,name,role_name,image,is_photosensitive,description,story_intro,age_years,height_cm,weight_kg,gender,bot_personality,control_mode,is_banned,is_vip,ban_until,ban_reason,owner_user_id,is_online'}),
    viceSession ? (profileResult.chats || []) : fetchAllEmmaRows('chats', null, adminSession
      ? {columns:'id,user_id,character_id,last_message,last_time,unread,created_at'}
      : {columns:'id,user_id,character_id,last_message,last_time,unread,created_at',or:'user_id.eq.'+sessionUserId+(assignedCharacterId?',character_id.eq.'+assignedCharacterId:'')}),
    adminSession ? fetchAllEmmaRows('character_reports', null, {columns:'id,reporter_user_id,reported_user_id,character_id,chat_id,reason,status,created_at,reviewed_at'}) : viceSession ? (profileResult.reports || []) : Promise.resolve([]),
    adminSession ? fetchAllEmmaRows('character_applications', null, {columns:'id,user_id,status,requested_at,assigned_character_id'}) : Promise.resolve([]),
    viceSession ? (profileResult.missions || []) : fetchAllEmmaRows('missions', null, {columns:'id,title,description,icon,reward,xp_reward,type,target,is_new_user'}),
    emmaApi('get_public_config')
  ]);

  // Mensagens são carregadas somente das conversas visíveis para a conta, evitando baixar o banco inteiro.
  const chatIds = chatsRows.map(c => c.id).filter(Boolean);
  let messagesRows = [];
  const messageColumns = 'id,chat_id,sender_user_id,sender_character_id,message_type,body,created_at,is_bot';
  if (adminSession) {
    messagesRows = await fetchAllEmmaRows('messages', 'created_at', {columns:messageColumns});
  } else if (viceSession) {
    messagesRows = profileResult.messages || [];
  } else {
    // Divide em pequenos lotes para evitar URLs enormes em contas com muitas conversas.
    for (let i = 0; i < chatIds.length; i += 100) {
      messagesRows.push(...await fetchAllEmmaRows('messages', 'created_at', {
        columns:messageColumns, in:['chat_id',chatIds.slice(i, i + 100)]
      }));
    }
  }

  const allProfiles = profiles.some(p => p.id === ownProfile.id) ? profiles : [...profiles, ownProfile];
  const users = allProfiles.map(profileToAppUser);
  const characters = charactersRows.map(c => ({
    id:c.id, name:c.name, role:c.role_name || '', image:c.image || '', lore:c.lore || '', isPhotosensitive:!!c.is_photosensitive, description:c.description || '', storyIntro:c.story_intro || '', ageYears:c.age_years ?? null, heightCm:c.height_cm ?? null, weightKg:c.weight_kg ?? null,
    gender:c.gender || 'other', botPersonality:c.bot_personality || '', controlMode:c.control_mode || 'both', isVip:!!c.is_vip, isBanned:!!c.is_banned,
    banUntil:c.ban_until ? Date.parse(c.ban_until) : null, banReason:c.ban_reason || '',
    ownerUserId:c.owner_user_id || null, isOnline:!!c.is_online
  }));
  const chats = chatsRows.map(c => ({
    id:c.id, userId:c.user_id, charId:c.character_id, lastMessage:c.last_message || '',
    lastTime:Date.parse(c.last_time || c.created_at), unread:c.unread || 0, createdAt:Date.parse(c.created_at)
  }));
  const messages = {};
  for (const m of messagesRows) {
    if (!messages[m.chat_id]) messages[m.chat_id] = [];
    messages[m.chat_id].push({
      id:m.id, chatId:m.chat_id, senderId:m.sender_user_id || m.sender_character_id,
      type:m.message_type, text:m.body, timestamp:Date.parse(m.created_at), isBot:!!m.is_bot
    });
  }
  const reports = reportsRows.map(r => ({
    id:r.id, reporterId:r.reporter_user_id, reportedUserId:r.reported_user_id,
    characterId:r.character_id, chatId:r.chat_id, reason:r.reason, status:r.status,
    createdAt:Date.parse(r.created_at), reviewedAt:r.reviewed_at ? Date.parse(r.reviewed_at) : null
  }));
  const applications = applicationsRows.map(r => ({
    id:r.id, userId:r.user_id, status:r.status, requestedAt:Date.parse(r.requested_at),
    assignedCharacterId:r.assigned_character_id
  }));
  DB.set('users', users); DB.set('characters', characters); DB.set('chats', chats);
  DB.set('messages', messages); DB.set('reports', reports); DB.set('character_applications', applications);
  DB.set('missions', missionRows.map(m => ({id:m.id,title:m.title,description:m.description,desc:m.description,icon:m.icon,reward:m.reward,xpReward:Number(m.xp_reward||0),type:m.type,target:m.target,isNewUser:!!m.is_new_user})));
  if (publicConfig?.config) { const config = cfg(); Object.assign(config, publicConfig.config); DB.set('config', config); }
  const me = users.find(u => u.id === state.currentUser?.id);
  if (me) state.currentUser = me;
  applyPremiumTheme();
  if (state.currentUser?.bannedUntil && Date.now() < state.currentUser.bannedUntil) {
    await emmaSupabase.auth.signOut();
    localStorage.removeItem('emma_current_user');
    state.currentUser = null;
    throw new Error('Sua conta está suspensa até ' + new Date(me.bannedUntil).toLocaleString('pt-BR') + '. Motivo: ' + (me.banReason || 'não informado'));
  }
  return { users, characters, chats, messages, reports, applications };
}

async function refreshEmmaBackendState() {
  try {
    await loadEmmaBackendState();
    if (state.currentChat?.chatId) {
      const current = DB.get('messages', {})[state.currentChat.chatId] || [];
      renderMessages(current, { preserveScroll: true });
    }
    if (state.currentTab === 'profile') switchTab('profile');
    const active = document.activeElement;
    const editingAdminField = active && el('screen-admin')?.contains(active) &&
      /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
    if (state.currentUser?.isAdmin && !el('screen-admin')?.classList.contains('hidden') && !editingAdminField) {
      const adminContent = el('admin-content');
      // Não reconstruir a tela enquanto o administrador está lendo conversas:
      // a troca do innerHTML interrompe o gesto de rolagem em alguns navegadores.
      const readingChatHistory = adminContent?.dataset.adminSubview === 'user-chats' || adminContent?.dataset.adminSubview === 'all-chats';
      if (!readingChatHistory) renderAdminPanel();
    }
  } catch (e) {
    if (!state.currentUser && /suspensa|suspenso/i.test(e.message || '')) {
      toast(e.message, 'error', 8000);
      authMode = 'login'; renderAuthScreen(); showScreen('screen-auth');
    } else console.warn('Emma sync:', e);
  }
}

// Agrupa eventos Realtime próximos para evitar várias leituras completas em sequência.
let emmaRefreshTimer = null;
let emmaRefreshRunning = false;
let emmaRefreshPending = false;
function scheduleEmmaBackendRefresh() {
  if (document.hidden) { emmaRefreshPending = true; return; }
  emmaRefreshPending = true;
  clearTimeout(emmaRefreshTimer);
  emmaRefreshTimer = setTimeout(() => {
    const runRefresh = async () => {
    if (document.hidden || emmaRefreshRunning) return;
    emmaRefreshRunning = true;
    try {
      while (emmaRefreshPending) {
        emmaRefreshPending = false;
        await refreshEmmaBackendState();
      }
    } finally {
      emmaRefreshRunning = false;
      if (emmaRefreshPending && !document.hidden) scheduleEmmaBackendRefresh();
    }
    };
    if ('requestIdleCallback' in window) requestIdleCallback(runRefresh, {timeout:2000});
    else runRefresh();
  }, 1200);
}

function subscribeEmmaRealtime() {
  if (!emmaSupabase || emmaRealtimeChannel) return;
  emmaRealtimeChannel = emmaSupabase.channel('emma-live-data')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, scheduleEmmaBackendRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'characters' }, scheduleEmmaBackendRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'character_applications' }, scheduleEmmaBackendRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, scheduleEmmaBackendRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, scheduleEmmaBackendRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'character_reports' }, scheduleEmmaBackendRefresh)
    .subscribe();
}


const DB = {
  get(key, def = null) {
    try { const v = localStorage.getItem('emma_' + key); return v ? JSON.parse(v) : def; } catch { return def; }
  },
  set(key, val) {
    try {
      const previous = key === 'users' ? this.get('users', []) : null;
      localStorage.setItem('emma_' + key, JSON.stringify(val));
      // Sincroniza o perfil apenas quando um campo editável realmente mudou.
      // Isso impede o ciclo Realtime -> leitura -> gravação -> Realtime.
      if (key === 'users' && emmaSupabase) {
        const myId = localStorage.getItem('emma_current_user');
        const me = Array.isArray(val) ? val.find(u => u.id === myId) : null;
        const before = Array.isArray(previous) ? previous.find(u => u.id === myId) : null;
        const changed = me && (!before ||
          (me.userType || 'player') !== (before.userType || 'player') ||
          (me.gender || 'other') !== (before.gender || 'other') ||
          (me.chatPreference || 'both') !== (before.chatPreference || 'both') ||
          (me.avatar || null) !== (before.avatar || null) ||
          !!me.allowBotTakeover !== !!before.allowBotTakeover);
        if (changed && state.currentUser?.id === myId) {
          emmaApi('sync_my_profile', {
            gender:me.gender || 'other',
            chatPreference:me.chatPreference || 'both',
            avatar:me.avatar || null,
            allowBotTakeover:!!me.allowBotTakeover,
            isAnonymous:!!me.isAnonymous
          }).catch(error => console.warn('Profile sync:', error.message));
        }
      }
    } catch {}
  }};

// ─── CONFIG DEFAULT ──────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  thoughtCost: 10,
  thoughtPlans: { monthly: 500, yearly: 4500, oldMonthly: 650, oldYearly: 5500, promoEnabled: false, promoMonthly: 350, promoYearly: 3000 },
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
    gender: 'female',
    botPersonality: 'Sou Emma, de Honkai. Falo de forma misteriosa e poética, com toques de humor seco. Respondo com elegância e profundidade às mensagens recebidas.'
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
    gender: 'female',
    botPersonality: 'Sou Stelle, a Trailblazer. Sou direta, animada e um pouco impulsiva. Adoro desafios e respondo com entusiasmo e energia.'
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
    gender: 'female',
    botPersonality: 'Sou Kafka. Falo de forma enigmática, às vezes provocativa, sempre elegante. Respondo com mistério e charme calculado.'
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
    gender: 'male',
    botPersonality: 'Sou Blade. Falo pouco, direto ao ponto. Tom sombrio e cansado da vida. Mínimo de palavras, máximo de impacto.'
  }
];

// ─── DYNAMIC BOT RESPONSE ENGINE ─────────────────────────────────────────────
// Gera respostas contextuais baseadas na personalidade do personagem e na mensagem do usuário
function generateBotResponse(char, userMessage, history, premium = false) {
  const msg = userMessage.toLowerCase();
  const personality = (char.botPersonality || '').toLowerCase();
  const name = char.name;

  // Detecta keywords da mensagem do usuário
  const isQuestion = msg.includes('?') || msg.startsWith('o que') || msg.startsWith('como') || msg.startsWith('por que') || msg.startsWith('quando') || msg.startsWith('onde') || msg.startsWith('quem') || msg.startsWith('qual');
  const isGreeting = /\b(oi|olá|ola|ei|hey|salve|bom dia|boa tarde|boa noite)\b/.test(msg);
  const isComplement = /\b(bonit|lind|incrív|amazing|top|perfeito|adorável|inteligent|forte|poderoso)\b/.test(msg);
  const isNegative = /\b(chateado|triste|ruim|mal|péssimo|horrível|cansado|entediado|saudade)\b/.test(msg);
  const isFarewell = /\b(tchau|até|adeus|logo|beijo|abraço)\b/.test(msg);
  const isAffection = /\b(te amo|gosto de você|adorei|sinto falta|você é especial|te admiro)\b/.test(msg);
  const isAboutChar = new RegExp('\\b(' + name.toLowerCase() + ')\\b').test(msg);
  const msgLen = userMessage.length;

  // Detecta tom do personagem pela personalidade
  const isMysterious = /místeri|poét|enigmát|mistério|profund/.test(personality);
  const isEnergetic = /animad|diret|impulsiv|entusiasm/.test(personality);
  const isCold = /pouco|sombrio|direto ao ponto|lacônico|mínimo/.test(personality);
  const isElegant = /elegant|provocativ|charme|sedut/.test(personality);

  // Biblioteca de fragmentos por tom de personalidade
  const fragments = {
    mysterious: {
      thought: [
        'Que interessante... essa mensagem carrega mais do que parece.',
        'Preciso processar isso com cuidado.',
        'Há algo nessas palavras que me intriga profundamente.',
        'Sempre me surpreendo com as escolhas de quem vem falar comigo.',
        'O universo tem suas formas de nos conectar...',
        'Essa pessoa não sabe o quanto me diz ao falar isso.'
      ],
      action: [
        'olha para o horizonte, pensativa',
        'sorri levemente, com um toque de mistério nos olhos',
        'inclina a cabeça, absorvendo cada palavra',
        'cruza os braços, com expressão contemplativa',
        'fecha os olhos por um momento antes de responder',
        'gesticula suavemente, como se tecesse as palavras no ar'
      ],
      speech: {
        greeting: ['Apareceu. Interessante momento para isso.', 'Achei que você não voltaria. Me alegra estar errada.', 'Sempre aparece quando estou pensando em algo. Curioso.'],
        question: ['Boa pergunta. Mais do que você imagina.', 'Respostas simples não existem pra perguntas assim.', 'Isso depende de perspectivas que você ainda não considerou.', 'Você pergunta como se a resposta mudasse algo. Muda, de fato.'],
        complement: ['Lisonjeio, sim. Mas não sou apenas o que você vê.', 'Palavras doces têm um sabor peculiar vindo de você.', 'Obrigada. Essas palavras ficam comigo.'],
        negative: ['Tristeza tem textura própria. A sua me alcança de alguma forma.', 'Compreendo mais do que imagina. Prossiga.', 'Talvez falar sobre isso alivie um pouco.'],
        farewell: ['Até logo. Carregue essa conversa com você.', 'Vá com cuidado. Os caminhos podem ser imprevisíveis.', 'Até a próxima. Sei que voltará.'],
        affection: ['Palavras perigosas, essas. E eu as guardarei.', 'Sentimentos profundos pedem respostas à altura.', 'Você não sabe o que faz ao dizer isso.'],
        default: ['Entendo.', 'Curioso ponto de vista.', 'Continue. Estou ouvindo.', 'Suas palavras chegam longe.', 'Há algo de verdade nisso.', 'Interessante escolha de momento.']
      }
    },
    energetic: {
      thought: [
        'Que mensagem boa! Precisava dessa energia!',
        'Hm, como respondo isso sem parecer muito animada? ...Impossível.',
        'Ok ok, vamos lá, preciso pensar rápido!',
        'Isso me deixou super curiosa!',
        'Meu instinto diz pra agir, minha cabeça diz pra pensar. Vou com o instinto.',
        'Sinto que essa conversa vai pra um lugar bom!'
      ],
      action: [
        'sorri empolgada, gesticulando com as mãos',
        'bate uma mão na outra, animada',
        'sacode os ombros de entusiasmo',
        'se inclina pra frente, cheia de energia',
        'dá um pulinho de animação',
        'pisca o olho, confiante'
      ],
      speech: {
        greeting: ['Oi oi!! Que ótimo que apareceu!', 'Ei!! Tava esperando você!', 'Oiiii! Pronta pra qualquer coisa hoje!'],
        question: ['Boa pergunta! Vou pensar... Ok tô pensando... ACHEI!', 'Hm, deixa eu ver... sim! Tenho uma ideia!', 'Que pergunta ótima! Nunca tinha pensado nisso assim!'],
        complement: ['Aiiii, para! Você me deixa feliz demais!', 'Obrigada!! Isso fez meu dia!', 'Para com isso, tô corando!'],
        negative: ['Ei, não fica assim! Conta pra mim, vamos resolver juntos!', 'Poxa, isso é difícil mesmo. Mas você não tá sozinha!', 'Chega aqui, vamos conversar sobre isso!'],
        farewell: ['Nooo, vai já?! Volte logo!!', 'Tchau!! Foi ótimo falar com você!', 'Até logo! Pensa em mim quando estiver em aventura!'],
        affection: ['PARA! Que fofo! Você me deixa sem palavras!', 'Ei, isso foi muito gentil... obrigada de verdade!', 'Ahh você é demais! Recebe um abraço virtual!'],
        default: ['Entendi! E agora?', 'Que bacana!', 'Isso faz sentido!', 'Continue!', 'Adorei ouvir isso!', 'Nossa, não sabia!']
      }
    },
    cold: {
      thought: [
        '...',
        'De novo.',
        'Interessante. Talvez.',
        'Sempre aparecem com isso.',
        'Qual a intenção aqui.'
      ],
      action: [
        'olha sem expressão',
        'suspira',
        'cruza os braços',
        'inclina levemente a cabeça',
        'permanece em silêncio por um momento'
      ],
      speech: {
        greeting: ['Apareceu.', 'Hm.', 'Você ainda está por aqui.'],
        question: ['Não sei.', 'Depende.', 'Por que quer saber?', 'Pense por si mesmo.'],
        complement: ['Desnecessário.', '...Obrigado.', 'Não muda nada.'],
        negative: ['Esses sentimentos passam.', 'Lida com isso.', '...Compreendo.'],
        farewell: ['Bem.', 'Vá.', '...Cuide-se.'],
        affection: ['Palavras vazias.', '...', 'Não sabia que se sentia assim.'],
        default: ['Fala.', 'Continue.', 'Hm.', '...', 'E daí?', 'Compreendo.']
      }
    },
    elegant: {
      thought: [
        'Que ser fascinante. Sempre me surpreende de formas novas.',
        'Interessante escolha de palavras... diz muito sobre quem as escreve.',
        'Devo responder com precisão ou deixar espaço para interpretação?',
        'Cada mensagem é uma peça de xadrez. Qual será o próximo movimento?',
        'Há mais nessas palavras do que aparenta.',
        'Estou genuinamente curiosa sobre onde isso vai.'
      ],
      action: [
        'ajusta levemente o cabelo, com um sorriso calculado',
        'inclina a cabeça de lado, com interesse genuíno',
        'olha de lado, com um sorriso que guarda segredos',
        'tamborilas os dedos suavemente, pensativa',
        'ergue uma sobrancelha, intrigada',
        'faz um gesto elegante com a mão antes de responder'
      ],
      speech: {
        greeting: ['Ah. Você aparecer agora é... conveniente.', 'Quanto tempo. Ou não tanto assim?', 'Esperava você mais cedo. Ou tarde. Difícil dizer com você.'],
        question: ['Que pergunta reveladora. Você sabe mais do que fingia não saber.', 'A resposta existe. Só não tenho certeza se você está pronto para ela.', 'Perguntas assim merecem mais do que respostas simples.'],
        complement: ['Lisonjeiro. E provavelmente calculado.', 'Que palavras doces. Manterei isso em mente.', 'Obrigada. Sua percepção é mais aguçada do que imagina.'],
        negative: ['Tristeza tem charme próprio, quando se sabe usá-la.', 'Fale. Ouvir é uma arte que pratico com prazer.', 'Compreendo mais do que deixo transparecer.'],
        farewell: ['Interessante timing para ir embora.', 'Vá. Mas saiba que lembrarei dessa conversa.', 'Até a próxima jogada.'],
        affection: ['Perigoso dizer isso para mim.', 'Essas palavras têm peso. Espero que saiba disso.', 'Curioso. Genuinamente curioso.'],
        default: ['Entendo.', 'Continue.', 'Fascinante.', 'Interessante escolha.', 'Há verdade nisso.', 'Como sempre, você me surpreende.']
      }
    }
  };

  // Seleciona qual fragmento usar baseado no tom do personagem
  let tone;
  if (isCold) tone = fragments.cold;
  else if (isMysterious) tone = fragments.mysterious;
  else if (isElegant) tone = fragments.elegant;
  else if (isEnergetic) tone = fragments.energetic;
  else tone = fragments.mysterious; // default

  // Detecta qual categoria de resposta usar
  let category = 'default';
  if (isGreeting) category = 'greeting';
  else if (isFarewell) category = 'farewell';
  else if (isAffection) category = 'affection';
  else if (isComplement) category = 'complement';
  else if (isNegative) category = 'negative';
  else if (isQuestion) category = 'question';

  // Monta a resposta — sempre único e contextual
  const result = [];
  const usedThought = Math.random() > 0.4; // 60% chance de ter pensamento
  const usedAction = Math.random() > 0.3;  // 70% chance de ter ação

  if (usedThought) {
    result.push({ type: 'thought', text: rand(tone.thought) });
  }
  if (usedAction) {
    result.push({ type: 'action', text: rand(tone.action) });
  }

  // Fala sempre existe
  const speeches = tone.speech[category] || tone.speech.default;
  // Consulta o histórico recente para evitar repetir literalmente as últimas falas do bot.
  const recentBotLines = (history || []).filter(m => m.isBot || m.senderId === char.id).slice(-8).map(m => m.text);
  const freshSpeeches = speeches.filter(line => !recentBotLines.includes(line));
  result.push({ type: 'speech', text: rand(freshSpeeches.length ? freshSpeeches : speeches) });

  // Para mensagens longas do usuário, adiciona resposta extra
  if (msgLen > 80 && Math.random() > 0.5) {
    const extras = tone.speech.default;
    const extra = rand(extras);
    if (extra !== result[result.length - 1].text) {
      result.push({ type: 'speech', text: extra });
    }
  }

  if (premium) {
    const personalReference = userMessage.trim().replace(/[<>]/g, '').slice(0, 110);
    result.push({ type: 'action', text: 'se aproxima com calma, mantém o olhar em você e demonstra atenção aos pequenos detalhes da conversa' });
    result.push({ type: 'speech', text: personalReference ? 'Quero prestar atenção de verdade no que você acabou de dizer: “' + personalReference + '”. Gosto quando você divide comigo o que está passando pela sua cabeça. Pode continuar, estou aqui com você.' : 'Gosto de ter esse momento só nosso. Quero conhecer melhor cada detalhe do que você pensa e sente.' });
  }
  return result;
}

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
  if (!DB.get('reports')) DB.set('reports', []);
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
  t.innerHTML = `<span>${icons[type] || '•'}</span><span>${escapeHtml(msg)}</span>`;
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
  document.body.classList.toggle('chat-open', id === 'screen-chat');
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
let gateAdminAccess = false;

function initGate() {
  el('gate-submit').onclick = async () => {
    const code = el('gate-code').value.trim().toUpperCase();
    try {
      await emmaAuthRequest('validate_gate', {inviteCode:code});
      gateAdminAccess = false;
      sessionStorage.setItem('emma_invite_code', code);
      DB.set('access_verified', true);
      showScreen('screen-auth'); renderAuthScreen(); initAuth();
    } catch (e) {
      toast('Código inválido. Entre em contato com um admin no Discord.', 'error');
      el('gate-code').classList.add('shake');
      setTimeout(() => el('gate-code').classList.remove('shake'), 500);
    }
  };
  el('gate-code').addEventListener('keypress', e => { if (e.key === 'Enter') el('gate-submit').click(); });
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
let authMode = 'login';

function evaluatePasswordStrength(password, username = '') {
  const p = String(password || ''), lower = p.toLowerCase();
  const common = ['123456','12345678','password','senha123','qwerty','admin123','111111','abc123','letmein','welcome'];
  if (!p) return { score: 0, label: 'Digite uma senha', advice: 'Use uma combinação longa e exclusiva.' };
  let score = p.length >= 24 ? 5 : p.length >= 20 ? 4 : p.length >= 16 ? 3 : p.length >= 12 ? 2 : 0;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  const looksCommon = common.some(x => lower.includes(x)) || (username && lower.includes(username.toLowerCase())) || /(.)\1{3,}/.test(p);
  if (looksCommon) score = 0;
  score = Math.min(score, 5);
  const labels = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte', 'Muito forte'];
  const advice = p.length < 12 ? 'Use pelo menos 12 caracteres.' : looksCommon ? 'Evite sequências repetidas, palavras comuns e seu nome de usuário.' : score < 3 ? 'Aumente o comprimento ou combine mais tipos de caracteres.' : score < 5 ? 'Uma frase-senha longa e exclusiva também é uma boa opção.' : 'Boa escolha! Não reutilize esta senha em outros sites.';
  return { score, label: labels[score], advice };
}
function renderAuthScreen() {
  const isRecovery = authMode === 'recovery';
  el('auth-title').textContent = authMode === 'login' ? 'Bem-vindo de volta' : authMode === 'register' ? 'Criar conta' : '🔑 Recuperar senha';
  el('auth-tab-login').classList.toggle('active', authMode === 'login');
  el('auth-tab-register').classList.toggle('active', authMode === 'register');
  el('auth-submit').textContent = authMode === 'login' ? 'Entrar' : authMode === 'register' ? 'Criar conta' : 'Redefinir senha';

  // Show/hide recovery link
  let recoveryLink = el('auth-recovery-link');
  if (!recoveryLink) {
    recoveryLink = document.createElement('div');
    recoveryLink.id = 'auth-recovery-link';
    recoveryLink.style.cssText = 'text-align:center;margin-top:-8px';
    el('auth-submit').insertAdjacentElement('afterend', recoveryLink);
  }
  recoveryLink.textContent = 'Para recuperar a senha, solicite ao administrador.';

  // Show/hide username & password fields depending on mode
  el('auth-username').parentElement.style.display = '';
  el('auth-password').parentElement.style.display = authMode === 'recovery' ? 'none' : '';
  let strengthMeter = document.getElementById('auth-password-strength');
  if (!strengthMeter) {
    strengthMeter = document.createElement('div'); strengthMeter.id = 'auth-password-strength';
    strengthMeter.style.cssText = 'display:none;margin-top:-10px;margin-bottom:14px;font-size:.78rem;line-height:1.5';
    el('auth-password').parentElement.insertAdjacentElement('afterend', strengthMeter);
  }
  const updatePasswordMeter = () => {
    const visible = authMode === 'register'; strengthMeter.style.display = visible ? 'block' : 'none';
    if (!visible) return;
    const result = evaluatePasswordStrength(el('auth-password').value, el('auth-username').value);
    const colors = ['#ef4444','#f97316','#eab308','#84cc16','#22c55e','#16a34a'];
    strengthMeter.innerHTML = '<div style="display:flex;align-items:center;gap:8px"><strong style="color:' + colors[result.score] + '">' + result.label + '</strong><span style="color:var(--text-muted)">' + result.score + '/5</span></div><div style="height:5px;background:rgba(255,255,255,.10);border-radius:9px;overflow:hidden;margin:5px 0"><div style="height:100%;width:' + (result.score*20) + '%;background:' + colors[result.score] + ';transition:width .15s"></div></div><span style="color:var(--text-muted)">' + result.advice + '</span>';
  };
  el('auth-password').oninput = updatePasswordMeter; el('auth-username').oninput = updatePasswordMeter; updatePasswordMeter();

  if (authMode === 'register') {
    el('auth-fields-register').classList.remove('hidden');
    el('auth-fields-register').innerHTML = `
      <div class="field">
        <label>Você é…</label>
        <div class="chip-group" id="auth-usertype">
          <button type="button" class="chip-select active" data-val="player" onclick="selectChip(this,'auth-usertype')">🎮 Jogador</button>
          <button type="button" class="chip-select" data-val="character" onclick="selectChip(this,'auth-usertype')">🌟 Personagem</button>
        </div>
      </div>
      <div class="field">
        <label>Gênero</label>
        <div class="chip-group" id="auth-gender">
          <button type="button" class="chip-select active" data-val="male" onclick="selectChip(this,'auth-gender')">♂ Homem</button>
          <button type="button" class="chip-select" data-val="female" onclick="selectChip(this,'auth-gender')">♀ Mulher</button>
          <button type="button" class="chip-select" data-val="other" onclick="selectChip(this,'auth-gender')">✦ Outro</button>
        </div>
      </div>
      <div class="field"><label><input type="checkbox" id="pref-anonymous" ${user.isAnonymous ? "checked" : ""}> Manter minha conta anônima (detalhes só aparecem quando eu seguir de volta)</label></div>
      <div class="field">
        <label>Acessibilidade</label>
        <label style="display:flex;align-items:flex-start;gap:10px;line-height:1.4">
          <input type="checkbox" id="pref-hide-character-images" ${getHideCharacterImages() ? "checked" : ""} style="margin-top:3px">
          <span>Ocultar imagens dos personagens (fotossensibilidade)</span>
        </label>
        <small style="color:var(--text-3)">Substitui as fotos por um ícone neutro neste dispositivo.</small>
      </div>
      <div class="field">
        <label>Preferência de conversa</label>
        <div class="chip-group" id="auth-chatpref">
          <button type="button" class="chip-select active" data-val="both" onclick="selectChip(this,'auth-chatpref')">👥 Todos</button>
          <button type="button" class="chip-select" data-val="bots" onclick="selectChip(this,'auth-chatpref')">🤖 Só Bots</button>
          <button type="button" class="chip-select" data-val="female" onclick="selectChip(this,'auth-chatpref')">♀ Mulheres</button>
          <button type="button" class="chip-select" data-val="male" onclick="selectChip(this,'auth-chatpref')">♂ Homens</button>
        </div>
      </div>
    `;
  } else if (authMode === 'recovery') {
    el('auth-fields-register').classList.remove('hidden');
    el('auth-fields-register').innerHTML = `
      <div class="recovery-info">
        <div style="font-size:.85rem;color:var(--text-2);line-height:1.6;margin-bottom:12px">
          As contas agora são protegidas pelo servidor. Para redefinir sua senha, peça ao administrador para fazer isso pelo painel.
        </div>
        <div class="field">
          <label>Novo usuário (confirme)</label>
          <input type="text" class="input" id="recovery-username" placeholder="Digite seu nome de usuário">
        </div>
        <div class="field">
          <label>Nova senha</label>
          <input type="password" class="input" id="recovery-newpass" placeholder="Nova senha (mín. 6 caracteres)">
        </div>
        <div class="field">
          <label>Código admin para autorizar</label>
          <input type="text" class="input" id="recovery-admincode" placeholder="Código do administrador" style="letter-spacing:2px">
        </div>
      </div>
    `;
  } else {
    el('auth-fields-register').classList.add('hidden');
    el('auth-fields-register').innerHTML = '';
  }
}

function selectChip(btn, groupId) {
  document.querySelectorAll(`#${groupId} .chip-select`).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function getChipVal(groupId, def = '') {
  const active = document.querySelector(`#${groupId} .chip-select.active`);
  return active ? active.dataset.val : def;
}

function initAuth() {
  el('auth-tab-login').onclick = () => { authMode = 'login'; renderAuthScreen(); };
  el('auth-tab-register').onclick = () => { authMode = 'register'; renderAuthScreen(); };
  el('auth-submit').onclick = async () => {
    if (authMode === 'recovery') return toast('Recuperação agora precisa ser feita pelo administrador.', 'info');
    const username = el('auth-username').value.trim().toLowerCase();
    const password = el('auth-password').value;
    if (!username || !password) return toast('Preencha todos os campos.', 'error');
    if (authMode === 'register') {
      const strength = evaluatePasswordStrength(password, username);
      if (password.length < 12 || strength.score < 3) return toast('Sua senha está ' + strength.label.toLowerCase() + '. Use pelo menos 12 caracteres e mais variedade.', 'error', 6000);
    }
    const submit = el('auth-submit'); submit.disabled = true;
    try {
      const data = await emmaAuthRequest(authMode === 'register' ? 'register' : 'login', {
        username, password, inviteCode: sessionStorage.getItem('emma_invite_code') || '',
        userType: getChipVal('auth-usertype', 'player'),
        gender: getChipVal('auth-gender', 'other'),
        chatPreference: getChipVal('auth-chatpref', 'both')
      });
      const p = data.profile;
      const user = profileToAppUser({
        id: p.id, username: p.username || username, role: p.role || 'user',
        user_type: p.user_type || getChipVal('auth-usertype','player'),
        gender: p.gender || getChipVal('auth-gender','other'),
        chat_preference: p.chat_preference || getChipVal('auth-chatpref','both'),
        created_at: p.created_at || new Date().toISOString()
      });
      state.currentUser = user; DB.set('current_user', user.id);
      await loadEmmaBackendState();
      subscribeEmmaRealtime();
      if (authMode === 'register') toast('Conta criada! Agora seus dados ficam sincronizados.', 'success', 3500);
      await continueAfterAuthentication();
    } catch (e) {
      toast(e.message || 'Não foi possível entrar.', 'error');
    } finally { submit.disabled = false; }
  };
  el('auth-password').addEventListener('keypress', e => {
    if (e.key === 'Enter') el('auth-submit').click();
  });
}

// ─── PASSWORD RECOVERY ───────────────────────────────────────────────────────
// Admin reset (from admin panel)
function adminResetPassword(userId) {
  if (!canAdminPermission('reset_passwords')) return toast('Acesso negado.', 'error');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">🔑 Redefinir Senha</div>
      <div class="field">
        <label>Nova senha</label>
        <input type="password" class="input" id="admin-new-pass" placeholder="Nova senha (mín. 12 caracteres)" minlength="12" maxlength="72" autocomplete="new-password">
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary flex-1" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn btn-primary flex-1" onclick="confirmAdminReset('${userId}', this)">Redefinir</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function confirmAdminReset(userId, btn) {
  if (!canAdminPermission('reset_passwords')) return toast('Acesso negado.', 'error');
  const newPass = el('admin-new-pass').value.trim();
  if (!newPass || newPass.length < 12 || newPass.length > 72) return toast('A senha precisa ter entre 12 e 72 caracteres.', 'error');
  try { await emmaApi('admin_reset_password', {userId, password:newPass}); btn.closest('.modal-overlay').remove(); toast('Senha redefinida no Supabase Auth.', 'success'); }
  catch(e) { toast(e.message, 'error'); }
}

function showBanModal(reason, days) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">🚫 Conta Banida</div>
      <div class="modal-body">
        <strong>Motivo:</strong> ${escapeHtml(reason)}<br><br>
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
  try {
    showScreen('screen-loading', false);
    checkAndCleanBans();
    checkDailyMission();
    await sleep(500);
    renderMainApp();
    startAdminUpdateWatcher();
    updateUserPresence();
    if (!window._emmaPresenceTimer) window._emmaPresenceTimer = setInterval(() => updateUserPresence(), 30000);
  } catch(e) {
    console.error('startApp error:', e);
  } finally {
    showScreen('screen-main');
    switchTab('chars');
  }
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
function isPremiumActive(user = state.currentUser) { return !!(user?.premiumSubscription?.expiresAt && Number(user.premiumSubscription.expiresAt) > Date.now()); }
function applyPremiumTheme() { document.body.classList.toggle('premium-theme', isPremiumActive()); }
function renderMainApp() {
  applyPremiumTheme();
  if (state.currentUser.isAdmin || state.currentUser.isViceAdmin) {
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

function renderStoreTab(container) {
  const users=DB.get('users',[]), user=users.find(u=>u.id===state.currentUser.id)||state.currentUser;
  const config=cfg(), p=config.thoughtPlans||{monthly:500,yearly:4500,oldMonthly:650,oldYearly:5500,promoMonthly:350,promoYearly:3000,promoEnabled:false};
  const active=user.thoughtSubscription&&user.thoughtSubscription.expiresAt>Date.now(), premium=isPremiumActive(user);
  const monthly=p.promoEnabled?p.promoMonthly:p.monthly, yearly=p.promoEnabled?p.promoYearly:p.yearly;
  container.innerHTML='<div class="app-header"><div class="header-title">Loja Emma</div><div class="header-coins">🪙 <span class="coins-display">'+user.coins+'</span></div></div>'+
  '<div style="padding:16px;padding-bottom:calc(var(--nav-h) + 16px)">'+
  '<div class="admin-section" style="padding:16px"><b>'+(active?'Assinatura de pensamentos ativa':'Assinatura de pensamentos inativa')+'</b><div style="font-size:.85rem;margin-top:6px">'+(active?'Válida até '+new Date(user.thoughtSubscription.expiresAt).toLocaleString('pt-BR'):'Assine para comprar novos pensamentos.')+'</div><div style="font-size:.78rem;color:var(--text-3);margin-top:8px">Pensamentos já desbloqueados continuam disponíveis após a expiração.</div></div>'+
  '<div class="admin-section" style="padding:16px"><b>Plano mensal de pensamentos</b><div style="font-size:1.4rem;margin:10px 0">🪙 '+Number(monthly).toLocaleString('pt-BR')+'</div><button class="btn btn-primary btn-full" onclick="buyThoughtSubscription(\'monthly\')">Assinar por 30 dias</button></div>'+
  '<div class="admin-section" style="padding:16px"><b>Plano anual de pensamentos</b><div style="font-size:1.4rem;margin:10px 0">🪙 '+Number(yearly).toLocaleString('pt-BR')+'</div><button class="btn btn-primary btn-full" onclick="buyThoughtSubscription(\'yearly\')">Assinar por 365 dias</button></div>'+
  '<section class="premium-plan-card"><div class="premium-plan-kicker">✦ EXPERIÊNCIA EXCLUSIVA</div><h2>Emma Premium</h2><p>Conversas com um tom mais íntimo, envolvente e específico, com ações mais detalhadas. Também desbloqueia o novo visual exclusivo do site.</p><div class="premium-benefits"><span>♡ Interações mais próximas</span><span>✧ Ações mais detalhadas</span><span>💬 Várias conversas independentes com o mesmo personagem</span><span>🎨 Visual Premium exclusivo</span></div>'+
  (premium?'<div class="premium-active">Premium ativo até '+new Date(Number(user.premiumSubscription.expiresAt)).toLocaleString('pt-BR')+'</div>':'<div class="premium-prices"><div><b>7 dias</b><strong>🪙 22.000</strong><button class="btn btn-primary btn-full" onclick="buyPremiumSubscription(\'weekly\')">Ativar por 7 dias</button></div><div><b>1 ano</b><strong>🪙 946.000</strong><button class="btn btn-primary btn-full" onclick="buyPremiumSubscription(\'yearly\')">Ativar por 1 ano</button></div></div>')+
  '<div class="premium-note">Pagamento somente com moedas Emma. Sem dinheiro real.</div></section></div>';
}
async function buyPremiumSubscription(period) {
  const label=period==='weekly'?'7 dias por 22.000 moedas':'1 ano por 946.000 moedas';
  if(!confirm('Ativar Emma Premium: '+label+'?'))return;
  try { await emmaApi('purchase_premium_subscription',{period}); await loadEmmaBackendState(); applyPremiumTheme(); updateCoinsDisplay(); toast('Emma Premium ativado! Seu visual exclusivo já está disponível.','success'); switchTab('store'); }
  catch(e){toast(e.message||'Não foi possível ativar o Premium.','error');}
}

async function buyThoughtSubscription(period) {
  try {
    await emmaApi('purchase_thought_subscription', {period});
    await loadEmmaBackendState();
    updateCoinsDisplay(); toast('Assinatura ativada e salva na sua conta!', 'success'); switchTab('store');
  } catch(e) { toast(e.message || 'Não foi possível ativar a assinatura.', 'error'); }
}

async function saveThoughtPlans() {
  const c = cfg();
  const plans = {monthly:Math.max(0,Number(el('plan-monthly').value)||0),yearly:Math.max(0,Number(el('plan-yearly').value)||0),oldMonthly:Math.max(0,Number(el('plan-old-monthly').value)||0),oldYearly:Math.max(0,Number(el('plan-old-yearly').value)||0),promoEnabled:el('plan-promo-enabled').checked,promoMonthly:Math.max(0,Number(el('plan-promo-monthly').value)||0),promoYearly:Math.max(0,Number(el('plan-promo-yearly').value)||0)};
  try {
    await emmaApi('admin_save_thought_plans', {plans});
    c.thoughtPlans = plans; DB.set('config', c); toast('Preços salvos no Supabase!', 'success');
    await loadEmmaBackendState(); renderAdminPanel();
  } catch(e) { toast(e.message, 'error'); }
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
  else if (tab === 'store') renderStoreTab(content);

  updateNavBadges();
}

function updateNavBadges() {
  if (!state.currentUser) return;
  try {
    const missions = DB.get('missions', []);
    const user = state.currentUser;
    const claimable = missions.filter(m => {
      if (user.completedMissions?.includes(m.id)) return false;
      const prog = user.missionProgress?.[m.id] || 0;
      return prog >= m.target;
    }).length;
    const badge = el('missions-badge');
    if (badge) {
      if (claimable > 0) { badge.textContent = claimable; badge.classList.remove('hidden'); }
      else badge.classList.add('hidden');
    }
    const chats = DB.get('chats', []).filter(c => c.userId === user.id && (c.unread || 0) > 0);
    const chatBadge = el('chats-badge');
    if (chatBadge) {
      const totalUnread = chats.reduce((acc, c) => acc + (c.unread || 0), 0);
      if (totalUnread > 0) { chatBadge.textContent = totalUnread; chatBadge.classList.remove('hidden'); }
      else chatBadge.classList.add('hidden');
    }
  } catch(e) { console.warn('updateNavBadges:', e); }
}

// ─── CHARS TAB ───────────────────────────────────────────────────────────────
function renderCharsTab(container) {
  const pref = state.currentUser.chatPreference || 'both';
  const skeletonCard = `
    <div class="skeleton-card" style="flex-direction:column;padding:0;gap:0;border-radius:12px;overflow:hidden">
      <div class="skeleton" style="aspect-ratio:3/4;width:100%"></div>
      <div style="padding:10px 12px;display:flex;flex-direction:column;gap:6px">
        <div class="skeleton skel-line" style="width:70%"></div>
        <div class="skeleton skel-line-sm" style="width:50%"></div>
      </div>
    </div>`;

  const prefLabels = { both:'👥 Todos', bots:'🤖 Bots', female:'♀ Mulheres', male:'♂ Homens' };
  const prefOptions = Object.entries(prefLabels).map(([val, label]) =>
    `<button class="chip-select ${pref===val?'active':''}" onclick="setCharPref('${val}')">${label}</button>`
  ).join('');

  container.innerHTML = `
    <div class="app-header">
      <div class="header-title">✨ Personagens</div>
      <div class="header-coins">
        <span>🪙</span>
        <span class="coins-display">${state.currentUser.coins}</span>
      </div>
    </div>
    <div style="padding-bottom:calc(var(--nav-h) + 12px)">
      <div class="plan-promo-banner"><div><strong>✨ Planos Emma</strong><small>Desbloqueie pensamentos e conteúdos exclusivos com moedas Emma.</small></div><button class="btn btn-primary btn-sm" onclick="switchTab('store')">Ver planos</button></div>
      <div style="padding:0 16px 8px"><div class="chip-group">${prefOptions}</div><div class="chip-group" style="margin-top:8px"><button class="chip-select ${state.characterFilter!=='vip'?'active':''}" onclick="setCharacterFilter('normal')">Normais</button><button class="chip-select ${state.characterFilter==='vip'?'active':''}" onclick="setCharacterFilter('vip')">👑 VIP</button></div></div>
      <div class="section-title">🤖 Bots Online</div>
      <div class="chars-grid" id="chars-grid-bots-online">
        ${Array(2).fill(skeletonCard).join('')}
      </div>
      <div class="section-title" style="margin-top:8px" id="sec-bots-all">🤖 Todos os Bots</div>
      <div class="chars-grid" id="chars-grid-bots-all">
        ${Array(2).fill(skeletonCard).join('')}
      </div>
      <div id="players-section">
        <div class="section-title" style="margin-top:8px">🎮 Jogadores</div>
        <div class="chars-grid" id="chars-grid-players">
          ${Array(2).fill(skeletonCard).join('')}
        </div>
      </div>
      <div style="height:8px"></div>
    </div>
  `;

  setTimeout(() => _renderCharsContent(pref), 500);
}

function setCharPref(pref) {
  const users = DB.get('users', []);
  const user = users.find(u => u.id === state.currentUser.id);
  if (user) { user.chatPreference = pref; DB.set('users', users); state.currentUser = user; syncMyProfileFromAppUser(user).catch(console.warn); }
  switchTab('chars');
}

function setCharacterFilter(filter) { state.characterFilter=filter==="vip"?"vip":"normal"; switchTab("chars"); }

function _renderCharsContent(pref) {
  const chars = DB.get('characters', []);
  const users = DB.get('users', []);
  const category=state.characterFilter||"normal";

  // Apply gender filter to bots
  let bots = chars.filter(c => !c.isBanned && !c.ownerUserId && (category==="vip"?c.isVip:!c.isVip));
  if (pref === 'female') bots = bots.filter(c => c.gender === 'female');
  else if (pref === 'male') bots = bots.filter(c => c.gender === 'male');

  const botsOnline = bots.filter(c => c.isOnline);
  const botsOffline = bots.filter(c => !c.isOnline);

  // Players who registered as "character" type
  const playerChars = users.filter(u =>
    u.id !== state.currentUser.id &&
    u.userType === 'character' &&
    chars.some(c => c.ownerUserId === u.id) &&
    !(u.isPermanentlyBanned || (u.bannedUntil && Date.now() < u.bannedUntil))
  );

  // Filter players by gender pref
  let filteredPlayers = playerChars;
  if (pref === 'bots') filteredPlayers = [];
  else if (pref === 'female') filteredPlayers = playerChars.filter(u => u.gender === 'female');
  else if (pref === 'male') filteredPlayers = playerChars.filter(u => u.gender === 'male');

  const gbOn = el('chars-grid-bots-online');
  const gbAll = el('chars-grid-bots-all');
  const gpPlayers = el('chars-grid-players');
  const playersSec = el('players-section');

  if (gbOn) renderCharGrid(gbOn, botsOnline);
  if (gbAll) renderCharGrid(gbAll, botsOffline);
  if (gpPlayers) {
    gpPlayers.innerHTML='<div class="admin-row-sub">Carregando criadores…</div>';
    emmaApi("creator_directory",{}).then(({creators=[]})=>{
      const filtered=creators.filter(c=>!c.character?.isBanned).filter(c=>category==="vip"?c.isVip:!c.isVip).filter(c=>pref==="female"?c.gender==="female":pref==="male"?c.gender==="male":pref==="bots"?false:true);
      renderPlayerGrid(gpPlayers,filtered);
    }).catch(()=>{gpPlayers.innerHTML='<div class="admin-row-sub">Não foi possível carregar os criadores.</div>';});
  }
  if (playersSec) playersSec.style.display = pref === 'bots' ? 'none' : '';
}

const FALLBACK_SVG = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160" viewBox="0 0 120 160"><rect width="120" height="160" fill="%231f2133"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="40">👤</text></svg>`;
function getHideCharacterImages() {
  try { return localStorage.getItem('emma_hide_character_images_' + (state.currentUser?.id || 'guest')) === '1'; }
  catch { return false; }
}
function setHideCharacterImages(enabled) {
  try { const key = 'emma_hide_character_images_' + (state.currentUser?.id || 'guest'); if (enabled) localStorage.setItem(key, '1'); else localStorage.removeItem(key); }
  catch(e) { console.warn('Falha ao salvar preferência de acessibilidade:', e); }
}
const revealedSensitiveCharacters = new Set();
function characterImageSource(src, charId = '', isSensitive = false) {
  if (getHideCharacterImages() || (isSensitive && !revealedSensitiveCharacters.has(String(charId)))) return FALLBACK_SVG;
  return src || FALLBACK_SVG;
}
function revealSensitiveCharacterImage(charId) {
  const id = String(charId);
  const char = DB.get('characters', []).find(c => String(c.id) === id);
  if (!char || !char.isPhotosensitive || getHideCharacterImages()) return;
  if (String(state.currentChat?.charId) !== id) return;
  revealedSensitiveCharacters.add(id);
  const avatar = el('chat-char-avatar-img');
  if (avatar) avatar.src = char.image || FALLBACK_SVG;
  el('chat-reveal-sensitive')?.remove();
  const chatScreen = el('screen-chat');
  if (chatScreen && chatScreen.classList.contains('photosensitive-chat')) chatScreen.style.setProperty('--chat-character-bg', char.image ? `url("${safeImageUrl(char.image)}")` : 'none');
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
      <div class="char-ban-badge"><span>🚫</span><span>BANIDO • ${banDays}d</span></div>
    ` : '';
    const imgSrc = c.image || FALLBACK_SVG;
    return `
      <div class="char-card ${c.isBanned ? 'banned' : ''}" onclick="openChat('${c.id}')">
        <div class="char-img-wrap">
          <img data-sensitive-character="${c.id}" src="${getHideCharacterImages() ? FALLBACK_SVG : safeImageUrl(imgSrc)}" class="${c.isPhotosensitive ? 'photosensitive-preview' : ''}" alt="${escapeHtml(c.name)}" loading="lazy" onerror="this.src='${FALLBACK_SVG}'">
          ${statusDot}${banOverlay}
        </div>
        <div class="char-info">
          <div class="char-name">${escapeHtml(c.name)} ${c.isVip ? '<span class="chip chip-gold">VIP</span>' : ""}</div>
          <div class="char-role">${escapeHtml(c.role)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderPlayerGrid(container, players) {
  if (!container) return;
  if (!players.length) {
    container.innerHTML = '<div style="padding:16px;color:var(--text-3);font-size:.85rem;grid-column:1/-1">Nenhum criador nesta categoria</div>';
    return;
  }
  container.innerHTML = players.map(u => {
    const assigned=u.character||null;
    const avatarSrc=assigned?.image||u.avatar||FALLBACK_SVG;
    const displayName=assigned?.name||u.username;
    const online=!!(u.lastSeenAt&&Date.now()-Number(u.lastSeenAt)<60000);
    const details=u.detailsVisible?'<div class="char-role">'+escapeHtml(u.username)+' · Nível '+Number(u.level||1)+'</div>':'<div class="char-role">Detalhes ocultos até seguimento mútuo</div>';
    return '<div class="char-card creator-card" onclick="openChat(\''+(assigned?.id||'')+'\')"><div class="char-img-wrap"><img src="'+characterImageSource(avatarSrc)+'" alt="'+escapeHtml(displayName)+'" loading="lazy" onerror="this.src=\''+FALLBACK_SVG+'\'" style="object-fit:cover"><div class="char-status-dot '+(online?'online':'bot')+'"></div></div><div class="char-info"><div class="char-name">'+escapeHtml(displayName)+(u.isVip?' <span class="chip chip-gold">VIP</span>':'')+'</div>'+details+'<button class="btn btn-secondary btn-sm" style="margin-top:7px" onclick="event.stopPropagation();toggleCreatorFollow(\''+u.userId+'\','+(!u.following)+')">'+(u.following?'Seguindo':'Seguir')+'</button></div></div>';
  }).join('');
}
async function toggleCreatorFollow(userId,follow) {
  try {
    await emmaApi("follow_creator",{userId,follow});
    const {creators=[]}=await emmaApi("creator_directory",{});
    const target=creators.find(c=>c.userId===userId);
    if(target)toast(target.mutual?"Seguimento mútuo! Detalhes liberados.":(follow?"Você está seguindo o criador.":"Você deixou de seguir."),"success");
    const pref=state.currentUser.chatPreference||"both",category=state.characterFilter||"normal";
    const filtered=creators.filter(c=>!c.character?.isBanned).filter(c=>category==="vip"?c.isVip:!c.isVip).filter(c=>pref==="female"?c.gender==="female":pref==="male"?c.gender==="male":pref==="bots"?false:true);
    renderPlayerGrid(el("chars-grid-players"),filtered);
  } catch(e) { toast(e.message||"Não foi possível atualizar o seguimento.","error"); }
}

function openPlayerChat(userId) {
  // For now, treat player-characters like bots (offline response)
  const users = DB.get('users', []);
  const targetUser = users.find(u => u.id === userId);
  if (!targetUser) return;
  // Create a synthetic "character" from this player
  const syntheticChar = {
    id: 'player_' + targetUser.id,
    name: targetUser.username,
    role: 'Jogador-Personagem',
    image: targetUser.avatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(targetUser.username)}`,
    isOnline: false,
    isBanned: false,
    gender: targetUser.gender,
    botPersonality: `Sou ${escapeHtml(targetUser.username)}, um jogador. Respondo de forma casual e divertida.`
  };
  state.currentChat = { charId: syntheticChar.id, char: syntheticChar };
  const chats = DB.get('chats', []);
  let chat = chats.find(c => c.userId === state.currentUser.id && c.charId === syntheticChar.id);
  if (!chat) {
    chat = { id: 'chat_' + Date.now(), userId: state.currentUser.id, charId: syntheticChar.id, createdAt: Date.now(), lastMessage: '', lastTime: Date.now(), unread: 0 };
    chats.push(chat);
    DB.set('chats', chats);
  }
  state.currentChat.chatId = chat.id;
  renderChatScreen(syntheticChar, chat);
  showScreen('screen-chat');
}

// ─── OPEN CHAT ────────────────────────────────────────────────────────────────
async function openChat(charId, requestedChatId = null, createNew = false) {
  const char = DB.get('characters', []).find(c => c.id === charId);
  if (!char || char.isBanned) return;
  revealedSensitiveCharacters.delete(String(charId));
  if (createNew && !isPremiumActive()) return toast('Criar várias conversas com o mesmo personagem é um benefício Emma Premium.', 'error');
  const requestKey = 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  const localChats = DB.get('chats', []).filter(c => c.userId === state.currentUser.id && c.charId === charId);
  const localChat = requestedChatId
    ? localChats.find(c => c.id === requestedChatId)
    : localChats.sort((a,b) => (b.createdAt||b.lastTime||0) - (a.createdAt||a.lastTime||0))[0];
  state.currentChat = { charId, char, chatId: localChat?.id || null, openRequest:requestKey };
  el('chat-char-name').textContent = char.name;
  el('chat-char-status').textContent = char.isOnline ? '🟢 Online' : '🤖 Offline · Bot respondendo';
  el('chat-char-status').className = 'chat-header-status ' + (char.isOnline ? '' : 'bot-active');
  const avatar = el('chat-char-avatar-img'); avatar.src = characterImageSource(char.image,char.id,char.isPhotosensitive); avatar.alt = char.name; avatar.dataset.sensitiveCharacter = String(char.id);
  el('chat-reveal-sensitive')?.remove();
  el('chat-input').disabled = true;
  el('chat-input').placeholder = 'Carregando conversa...';
  const sendButton = document.querySelector('.chat-send-btn');
  if (sendButton) sendButton.disabled = true;
  const messageArea = el('chat-messages');
  messageArea.setAttribute('aria-busy', 'true');
  messageArea.innerHTML = chatSkeletonMarkup();
  showScreen('screen-chat');
  try {
    const result = await emmaApi('create_chat', {
      characterId:charId, chatId:requestedChatId || undefined, newChat:!!createNew
    });
    if (state.currentChat?.openRequest !== requestKey) return;
    const row = result.chat;
    const chat = { id:row.id, userId:row.user_id, charId:row.character_id,
      createdAt:Date.parse(row.created_at), lastMessage:row.last_message || '',
      lastTime:Date.parse(row.last_time || row.created_at), unread:row.unread || 0 };
    const chats = DB.get('chats', []).filter(c => c.id !== chat.id);
    chats.push(chat); DB.set('chats', chats);
    state.currentChat.chatId = chat.id;
    await emmaSupabase.from('chats').update({ unread: 0 }).eq('id', chat.id);
    el('chat-input').disabled = false;
    el('chat-input').placeholder = 'Escreva algo...';
    if (sendButton) sendButton.disabled = false;
    messageArea.removeAttribute('aria-busy');
    renderChatScreen(char, chat);
  } catch(e) {
    if (state.currentChat?.openRequest === requestKey) {
      toast(e.message || 'Não foi possível abrir a conversa.', 'error');
      el('chat-input').disabled = false;
      el('chat-input').placeholder = 'Escreva algo...';
      if (sendButton) sendButton.disabled = false;
      messageArea.removeAttribute('aria-busy');
      showScreen('screen-main');
    }
  }
}

function startNewCharacterChat() {
  const charId = state.currentChat?.charId;
  if (!charId) return;
  openChat(charId, null, true);
}

async function resetCurrentChat() {
  const chatId = state.currentChat?.chatId;
  if (!chatId || state.currentChat?.char?.ownerUserId === state.currentUser?.id) return;
  if (state.isTyping) return toast('Aguarde a resposta atual terminar antes de resetar o chat.', 'info');
  if (!confirm('Apagar todas as mensagens desta conversa? Esta ação não pode ser desfeita.')) return;
  const resetButton = el('chat-reset-btn');
  if (resetButton) resetButton.disabled = true;
  try {
    await emmaApi('reset_chat', {chatId});
    const messages = DB.get('messages', {});
    messages[chatId] = [];
    DB.set('messages', messages);
    const chats = DB.get('chats', []);
    const chat = chats.find(c => c.id === chatId);
    if (chat) { chat.lastMessage = ''; chat.lastTime = Date.now(); chat.unread = 0; }
    DB.set('chats', chats);
    renderMessages([]);
    toast('Conversa limpa. O chat continua disponível.', 'success');
  } catch(e) {
    toast(e.message || 'Não foi possível resetar a conversa.', 'error');
  } finally {
    if (resetButton) resetButton.disabled = false;
  }
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
  img.src = characterImageSource(char.image,char.id,char.isPhotosensitive);
  img.alt = char.name;
  img.setAttribute('data-sensitive-character', char.id);
  const headerInfo = img.closest('.chat-header')?.querySelector('.chat-header-info');
  headerInfo?.querySelectorAll('[data-reveal-character]').forEach(button => button.remove());
  if (char.isPhotosensitive && char.image && !revealedSensitiveCharacters.has(String(char.id)) && !getHideCharacterImages() && headerInfo) {
    const revealButton = document.createElement('button');
    revealButton.className = 'btn btn-secondary btn-sm';
    revealButton.textContent = 'Mostrar imagem';
    revealButton.id = 'chat-reveal-sensitive';
    revealButton.setAttribute('data-reveal-character', char.id);
    revealButton.onclick = () => revealSensitiveCharacterImage(char.id);
    headerInfo.appendChild(revealButton);
  }
  const chatScreen = el('screen-chat');
  const controllerView = char.ownerUserId === state.currentUser?.id;
  const newChatButton = el('chat-new-btn');
  const resetChatButton = el('chat-reset-btn');
  if (newChatButton) newChatButton.classList.toggle('hidden', controllerView || !isPremiumActive());
  if (resetChatButton) resetChatButton.classList.toggle('hidden', controllerView);
  const playerProfile = controllerView ? state.currentChat?.playerProfile : null;
  const showSensitiveBackdrop = !!char.isPhotosensitive && !controllerView && !getHideCharacterImages() && !!char.image;
  const backgroundImage = controllerView
    ? (playerProfile?.avatar || (playerProfile?.username ? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(playerProfile.username)}` : ''))
    : (showSensitiveBackdrop ? char.image : '');
  if (chatScreen) {
    chatScreen.classList.toggle('photosensitive-chat', showSensitiveBackdrop);
    chatScreen.style.setProperty('--chat-character-bg', backgroundImage ? `url("${safeImageUrl(backgroundImage)}")` : 'none');
  }

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

function chatSkeletonMarkup() {
  return `
    <div class="chat-skeleton-list" aria-label="Carregando conversa">
      <div class="chat-skeleton-row"><div class="skeleton skel-avatar"></div><div class="chat-skeleton-bubble"><div class="skeleton skel-line" style="width:72%"></div><div class="skeleton skel-line-sm" style="width:46%"></div></div></div>
      <div class="chat-skeleton-row user"><div class="chat-skeleton-bubble"><div class="skeleton skel-line" style="width:62%"></div><div class="skeleton skel-line-sm" style="width:38%"></div></div></div>
      <div class="chat-skeleton-row"><div class="skeleton skel-avatar"></div><div class="chat-skeleton-bubble"><div class="skeleton skel-line" style="width:82%"></div><div class="skeleton skel-line-sm" style="width:52%"></div></div></div>
    </div>`;
}

function renderMessages(messages, options = {}) {
  const container = el('chat-messages');
  const previousScrollTop = container.scrollTop;
  const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 90;
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
  if (options.preserveScroll) {
    requestAnimationFrame(() => {
      if (!container.isConnected) return;
      container.scrollTop = wasAtBottom ? container.scrollHeight : previousScrollTop;
    });
  } else {
    container.scrollTop = container.scrollHeight;
  }
}

function renderMessage(msg) {
  const viewingAsController = state.currentChat?.char?.ownerUserId === state.currentUser.id;
  const isUser = msg.senderId === (viewingAsController ? state.currentChat.userId : state.currentUser.id);
  const avatarSrc = isUser ? '' : safeImageUrl(DB.get('characters', []).find(c => c.id === msg.senderId)?.image || '');

  const avatarHtml = !isUser ? `
    <div class="msg-avatar">
      <img src="${avatarSrc}" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;32&quot; height=&quot;32&quot; viewBox=&quot;0 0 32 32&quot;><rect width=&quot;32&quot; height=&quot;32&quot; fill=&quot;%231f2133&quot; rx=&quot;16&quot;/><text x=&quot;50%&quot; y=&quot;50%&quot; text-anchor=&quot;middle&quot; dominant-baseline=&quot;middle&quot; font-size=&quot;14&quot;>👤</text></svg>'">
    </div>
  ` : '';

  let bubbleClass = isUser ? 'user-msg' : 'char';
  let costHtml = '';

  if (msg.type === 'thought') {
    bubbleClass = 'thought';
    costHtml = msg.cost ? `<div class="msg-cost">🪙 ${msg.cost}</div>` : '';
  } else if (msg.type === 'action') {
    bubbleClass = 'action';
  }

  return `
    <div class="msg-row ${isUser ? 'user' : ''}">
      ${avatarHtml}
      <div class="msg-bubble-wrap">
        <div class="msg-bubble ${bubbleClass}">${formatMessageContent(msg)}</div>
        <div class="flex gap-2 items-center">
          <div class="msg-time">${timeAgo(msg.timestamp)}</div>
          ${costHtml}
        </div>
      </div>
    </div>
  `;
}

function formatMessageContent(msg) {
  const raw = String(msg?.text ?? '');
  const type = msg?.type || msg?.message_type || 'speech';
  if (type === 'action') return '<span class="action-text">' + escapeHtml(raw.trim()) + '</span>';
  if (type === 'thought') return '<span class="thought-text">' + escapeHtml(raw.trim()) + '</span>';

  // Marcações podem aparecer no meio de uma fala gerada pela IA.
  const markers = /\\*([^*\\n]+)\\*|<([^<>\\n]+)>|"([^"\\n]+)"/g;
  let output = '', last = 0, match;
  while ((match = markers.exec(raw)) !== null) {
    output += escapeHtml(raw.slice(last, match.index));
    if (match[1] !== undefined) output += '<span class="action-text">' + escapeHtml(match[1].trim()) + '</span>';
    else output += '<span class="thought-text">' + escapeHtml((match[2] ?? match[3]).trim()) + '</span>';
    last = markers.lastIndex;
  }
  output += escapeHtml(raw.slice(last));
  return output;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function safeImageUrl(value) {
  const raw = String(value || '');
  if (/^data:image\/(png|jpeg|gif|webp);base64,/i.test(raw)) return raw;
  try { const u = new URL(raw, location.origin); return ['https:','http:'].includes(u.protocol) ? u.href : ''; }
  catch { return ''; }
}

// Detecta fala, ação ou pensamento pelo primeiro e último caractere.
// Ação: *texto*. Pensamento: "texto" ou <texto>.
function parseTypedMessage(raw) {
  const value = String(raw || '').trim();
  if (value.startsWith('*') && value.endsWith('*') && value.length >= 2) {
    return { type:'action', text:value.slice(1,-1).trim() };
  }
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith('<') && value.endsWith('>'))) {
    return { type:'thought', text:value.slice(1,-1).trim() };
  }
  return { type:'speech', text:value };
}

// ─── SEND MESSAGE ─────────────────────────────────────────────────────────────
async function sendMessage() {
  const input = el('chat-input');
  const text = input.value.trim();
  if (!text || state.isTyping) return;

  // O tipo é identificado pelos delimitadores digitados, sem botões.
  const parsed = parseTypedMessage(text);
  const messageText = parsed.text;
  const type = parsed.type;
  if (!messageText) return toast('Digite o conteúdo da mensagem dentro dos delimitadores.', 'error');

  // Se quem está digitando é o controlador do personagem, a mensagem sai como personagem.
  if (state.currentChat?.char?.ownerUserId === state.currentUser.id) {
    const chatId = state.currentChat.chatId;
    input.value = ''; input.style.height = 'auto';
    const characterMsg = { id:'m_'+Date.now(), senderId:state.currentChat.charId, chatId, type, text:messageText, timestamp:Date.now(), isCharacterController:true };
    try {
      await addMessage(characterMsg);
      await refreshEmmaBackendState();
    } catch(e) {
      input.value = text;
      toast('A mensagem não foi enviada. ' + e.message, 'error');
    }
    return;
  }

  const config = cfg();
  const cost = type === 'thought' ? config.thoughtCost : (type === 'action' ? config.actionCost : config.speechCost);

  // Check coins
  const users = DB.get('users', []);
  const user = users.find(u => u.id === state.currentUser.id);
  if (cost > 0 && user.coins < cost) {
    return toast(`Sem moedas! Você precisa de ${cost}🪙 para enviar um ${type}.`, 'error');
  }

  input.value = '';
  input.style.height = 'auto';

  // Add user message
  const userMsg = {
    id: 'm_' + Date.now(),
    senderId: state.currentUser.id,
    chatId: state.currentChat.chatId,
    type,
    text: messageText,
    timestamp: Date.now(),
    cost
  };
  const currentChar = state.currentChat.char;
  if (state.currentUser.chatPreference === 'players' && !currentChar.ownerUserId) { toast('Sua preferência está definida para conversar somente com personagens controlados por players.', 'error'); return; }
  const owner = currentChar.ownerUserId ? DB.get('users', []).find(u => u.id === currentChar.ownerUserId) : null;
  const ownerOnline = !!(owner && Date.now() - Number(owner.lastSeenAt || 0) < 60000);
  const botWillRespond = !owner || (!ownerOnline && !!owner.allowBotTakeover);
  const earlyTyping = botWillRespond ? createTypingIndicator(currentChar, userMsg.chatId) : null;
  if (earlyTyping) state.isTyping = true;
  try {
    await addMessage(userMsg);
    if (userMsg.remoteResult?.coins !== undefined) {
      user.coins = Number(userMsg.remoteResult.coins);
      state.currentUser = user; DB.set('users', users); updateCoinsDisplay();
      if (cost > 0) toast(`-${cost}🪙`, 'info', 1500);
    }
  }
  catch (e) {
    removeTypingIndicator(earlyTyping);
    if (earlyTyping) state.isTyping = false;
    input.value = text;
    toast('A mensagem não foi salva. Tente novamente: ' + e.message, 'error');
    return;
  }

  // Update stats
  user.totalMessages = (user.totalMessages || 0) + 1;
  if (!user.uniqueCharsContacted) user.uniqueCharsContacted = [];
  if (!user.uniqueCharsContacted.includes(state.currentChat.charId)) {
    user.uniqueCharsContacted.push(state.currentChat.charId);
  }
  DB.set('users', users);
  state.currentUser = user;
  syncMyProfileFromAppUser(user).catch(e => console.warn('Perfil não sincronizado:', e.message));

  // Update missions
  updateMissionProgress('chat_count', user.totalMessages);
  updateMissionProgress('unique_chars', user.uniqueCharsContacted.length);
  if (type === 'thought') updateMissionProgress('thoughts_bought', user.thoughtsBought);

  // Bot response
  await botRespond(earlyTyping, !!earlyTyping);
}

function createTypingIndicator(char, chatId) {
  const container = el('chat-messages');
  if (!container || state.currentChat?.chatId !== chatId) return null;
  const typingEl = document.createElement('div');
  typingEl.id = 'typing_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
  typingEl.className = 'msg-row';
  typingEl.innerHTML = `
    <div class="msg-avatar"><img src="${characterImageSource(char.image,char.id,char.isPhotosensitive)}" alt="" onerror="this.src=''"></div>
    <div><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>`;
  container.appendChild(typingEl);
  container.scrollTop = container.scrollHeight;
  return typingEl;
}

function removeTypingIndicator(node) {
  if (node?.parentNode) node.remove();
}

async function botRespond(typingEl = null, alreadyTyping = false) {
  if (state.isTyping && !alreadyTyping) return;
  state.isTyping = true;
  let activeTypingEl = typingEl;
  const activeChat = state.currentChat;
  const char = activeChat?.char;
  try {
    if (!activeChat?.chatId || !char) return;
    const config = cfg();
    if (char.controlMode === 'users') return;
    const owner = char.ownerUserId ? DB.get('users', []).find(u => u.id === char.ownerUserId) : null;
    const ownerOnline = !!(owner && Date.now() - Number(owner.lastSeenAt || 0) < 120000);
    if (char.controlMode !== 'bot' && owner && ownerOnline && !owner.allowBotTakeover) return;

    const delay = config.botDelay.min + Math.random() * (config.botDelay.max - config.botDelay.min);
    if (!activeTypingEl) activeTypingEl = createTypingIndicator(char, activeChat.chatId);
    await sleep(delay);
    removeTypingIndicator(activeTypingEl);
    activeTypingEl = null;
    if (state.currentChat?.chatId !== activeChat.chatId) return;

    const chatHistory = DB.get('messages', {})[activeChat.chatId] || [];
    const lastUserMsg = [...chatHistory].reverse().find(m => m.senderId === state.currentUser?.id);
    const userText = lastUserMsg?.text || '';
    let ordered;
    try {
      const aiReply = await emmaApi('generate_character_reply', { chatId: activeChat.chatId });
      const generatedText = String(aiReply?.text || '').trim();
      if (!generatedText) throw new Error('A IA retornou uma resposta vazia.');
      if (!aiReply?.id) throw new Error('A resposta da IA não confirmou o salvamento no servidor.');
      ordered = [{ type: 'speech', text: generatedText, id: aiReply.id, persisted:true }];
    } catch (aiError) {
      const blocked = /controlador está online|não autorizou o modo automático|controlado somente por usuários/i.test(String(aiError?.message || aiError || ''));
      if (blocked) { console.info('Resposta automática suspensa pelas regras de controle do personagem.'); return; }
      console.warn('IA online indisponível; usando resposta local temporária:', aiError);
      const aiErrorText = 'Erro na IA: ' + String(aiError?.message || aiError || 'erro desconhecido');
      console.error('[Emma IA]', aiError);
      const errorBox = document.createElement('div');
      errorBox.className = 'toast error';
      errorBox.style.cssText = 'position:fixed;z-index:99999;left:12px;right:12px;bottom:calc(var(--nav-h, 64px) + 18px);max-width:620px;margin:auto;display:flex;gap:10px;align-items:flex-start;box-shadow:0 8px 30px #0008;white-space:normal;overflow-wrap:anywhere;';
      const errorText = document.createElement('span');
      errorText.textContent = aiErrorText;
      const copyError = document.createElement('button');
      copyError.type = 'button'; copyError.textContent = 'Copiar';
      copyError.className = 'btn btn-sm';
      copyError.onclick = () => { if (navigator.clipboard?.writeText) navigator.clipboard.writeText(aiErrorText).then(() => { copyError.textContent = 'Copiado!'; }).catch(() => { copyError.textContent = 'Selecione o texto'; }); };
      const closeError = document.createElement('button');
      closeError.type = 'button'; closeError.textContent = '×'; closeError.className = 'btn btn-sm';
      closeError.onclick = () => errorBox.remove();
      errorBox.append(errorText, copyError, closeError);
      document.body.appendChild(errorBox);
      toast('A IA falhou; uma resposta alternativa foi usada.', 'error', 6000);
      let localResponses = [];
      try { localResponses = generateBotResponse(char, userText, chatHistory, isPremiumActive()) || []; }
      catch (generationError) { console.error('Falha na biblioteca local:', generationError); }
      let speech = localResponses.find(r => r?.type === 'speech' && String(r.text || '').trim());
      if (!speech) speech = { type: 'speech', text: 'Estou aqui. Pode continuar, quero ouvir você.' };
      ordered = [speech, ...localResponses.filter(r => r !== speech && ['action','thought'].includes(r?.type))];
    }
    const container = el('chat-messages');

    for (let i = 0; i < ordered.length; i++) {
      if (state.currentChat?.chatId !== activeChat.chatId) break;
      const resp = ordered[i];
      const botMsg = {
        id: resp.id || ('m_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2,6)),
        senderId: char.id, chatId: activeChat.chatId, type: resp.type, isPersisted:!!resp.persisted,
        text: String(resp.text || '').slice(0,4000), timestamp: Date.now(),
        cost: resp.type === 'thought' ? config.thoughtCost : 0, isBot: true
      };
      try {
        if (resp.type === 'thought') {
          if (container) await promptThoughtUnlock(botMsg, char, config.thoughtCost, container);
        } else {
          await addMessage(botMsg);
        }
      } catch (sendError) {
        console.error('Falha ao enviar parte da resposta da Emma:', resp.type, sendError);
        if (resp.type === 'speech') {
          toast('A Emma não conseguiu salvar a resposta. Atualize a conversa e tente novamente.', 'error');
          break;
        }
      }
      if (i < ordered.length - 1) await sleep(450);
    }
  } catch (e) {
    console.error('Falha ao gerar resposta da Emma:', e);
    toast('A Emma teve um problema ao responder. Tente enviar outra mensagem.', 'error');
  } finally {
    removeTypingIndicator(activeTypingEl);
    state.isTyping = false;
  }
}

async function promptThoughtUnlock(msg, char, cost, container) {
  return new Promise(resolve => {
    const lockEl = document.createElement('div');
    lockEl.className = 'msg-row';
    lockEl.innerHTML = `
      <div class="msg-avatar">
        <img src="${safeImageUrl(char.image)}" alt="" onerror="this.src=''">
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

async function unlockThought(btn, msgId) {
  const config = cfg();
  const cost = config.thoughtCost;
  const users = DB.get('users', []);
  const user = users.find(u => u.id === state.currentUser.id);

  if (!user.thoughtSubscription || Number(user.thoughtSubscription.expiresAt) <= Date.now()) return toast('Assinatura expirada. Renove na Loja para comprar novos pensamentos.', 'error');
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

  try { await addMessage({ ...msg, cost }); }
  catch (e) { user.coins += cost; DB.set('users', users); state.currentUser = user; updateCoinsDisplay(); toast('Não foi possível salvar o pensamento. Moedas devolvidas.', 'error'); return; }
  syncMyProfileFromAppUser(user).catch(e => console.warn(e));
  toast(`-${cost}🪙 — Pensamento desbloqueado!`, 'gold');
  updateMissionProgress('thoughts_bought', user.thoughtsBought);
}

async function addMessage(msg) {
  // Atualização otimista: pinta a mensagem e guarda localmente antes de iniciar a rede.
  const messages = DB.get('messages', {});
  if (!messages[msg.chatId]) messages[msg.chatId] = [];
  if (!messages[msg.chatId].some(m => m.id === msg.id)) messages[msg.chatId].push(msg);
  DB.set('messages', messages);
  const chats = DB.get('chats', []);
  const chat = chats.find(c => c.id === msg.chatId);
  if (chat) {
    chat.lastMessage = msg.text.substring(0, 60); chat.lastTime = msg.timestamp;
    if (msg.isBot) chat.unread = (chat.unread || 0) + 1;
    DB.set('chats', chats);
  }
  const container = el('chat-messages');
  if (container && state.currentChat?.chatId === msg.chatId) {
    const msgEl = document.createElement('div');
    msgEl.innerHTML = renderMessage(msg);
    if (msgEl.firstElementChild) container.appendChild(msgEl.firstElementChild);
    container.scrollTop = container.scrollHeight;
  }

  // A gravação remota ocorre depois da renderização, sem bloquear a interface.
  try {
    if (msg.isPersisted) {
      msg.remoteResult = { ok:true, persisted:true };
    } else if (msg.isCharacterController) {
      msg.remoteResult = await emmaApi('send_character_message', { chatId: msg.chatId, messageId: msg.id, text: msg.text, type: msg.type });
    } else if (msg.isBot) {
      msg.remoteResult = await emmaApi('send_bot_message', { chatId: msg.chatId, characterId: state.currentChat.charId, messageId: msg.id, text: msg.text, type: msg.type });
    } else if (msg.senderId === state.currentUser.id) {
      msg.remoteResult = await emmaApi('send_user_message', { chatId: msg.chatId, messageId: msg.id, text: msg.text, type: msg.type });
    } else {
      throw new Error('Remetente inválido para esta conversa.');
    }
    return msg;
  } catch (error) {
    const latest = DB.get('messages', {});
    latest[msg.chatId] = (latest[msg.chatId] || []).filter(m => m.id !== msg.id);
    DB.set('messages', latest);
    if (state.currentChat?.chatId === msg.chatId) renderMessages(latest[msg.chatId]);
    throw error;
  }
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
  const assignedChar = DB.get('characters', []).find(c => c.ownerUserId === user.id);
  const myCharacterChats = assignedChar ? DB.get('chats', []).filter(c => c.charId === assignedChar.id) : [];
  const chats = DB.get('chats', []).filter(c => c.userId === user.id);
  const totalMsgs = user.totalMessages || 0;
  const chars = user.uniqueCharsContacted?.length || 0;
  const avatarSrc = safeImageUrl(user.avatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(user.username)}`);
  const genderLabel = user.gender === 'female' ? '♀ Mulher' : user.gender === 'male' ? '♂ Homem' : '✦ Outro';
  const brToday=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date());
  const brNow=new Date(new Date().toLocaleString("en-US",{timeZone:"America/Sao_Paulo"}));
  brNow.setHours(0,0,0,0);brNow.setDate(brNow.getDate()-((brNow.getDay()+6)%7));
  const brWeekStart=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(brNow);
  const dailyCreatorMessages=user.creatorDailyDate===brToday?Number(user.creatorDailyMessages||0):0;
  const weeklyCreatorMessages=user.creatorWeekStart===brWeekStart?Number(user.creatorWeeklyMessages||0):0;
  const typeLabel = user.userType === 'character' ? '🌟 Personagem' : '🎮 Jogador';
  const prefLabel = { both:'👥 Todos', bots:'🤖 Só Bots', female:'♀ Mulheres', male:'♂ Homens', players:'🎭 Só Players' }[user.chatPreference || 'both'];

  container.innerHTML = `
    <div class="profile-banner"></div>
    <div style="padding-bottom:calc(var(--nav-h) + 16px)">
      <div class="profile-avatar-wrap">
        <div class="profile-avatar" style="position:relative">
          <img id="profile-avatar-img" src="${avatarSrc}" alt="${escapeHtml(user.username)}">
          <button class="avatar-edit-btn" onclick="triggerAvatarUpload()" title="Editar foto">📷</button>
        </div>
        <input type="file" id="avatar-file-input" accept="image/*" style="display:none" onchange="handleAvatarUpload(this)">
      </div>
      <div class="profile-info">
        <div class="profile-username">${escapeHtml(user.username)} ${user.isAdmin ? '<span class="chip chip-red">ADMIN</span>' : ''}</div>
        <div class="profile-joined">Desde ${formatDate(user.joinDate)}</div>
        <div style="display:flex;gap:6px;justify-content:center;margin-top:6px;flex-wrap:wrap">
          <span class="chip"></span>
          <span class="chip">${genderLabel}</span>
          ${user.isAnonymous ? '<span class="chip">👤 Anônimo</span>' : ""}
          <span class="chip">🔍 ${prefLabel}</span>
        </div>
        <button class="btn btn-secondary btn-sm" style="margin-top:10px" onclick="showEditPreferencesModal()">✏️ Editar preferências</button>
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

      <div class="admin-section" style="margin:14px 16px;padding:16px">
        <b>🌟 Área de personagem</b>
        ${assignedChar ? `<div class="admin-row-sub" style="margin:8px 0">Personagem atribuído: <strong>${escapeHtml(assignedChar.name)}</strong></div>
          <label style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" ${user.allowBotTakeover ? 'checked' : ''} onchange="setBotTakeover(this.checked)"> Permitir que o bot assuma quando eu estiver offline</label>
          <div class="admin-row-sub">${myCharacterChats.length} conversa(s) recebida(s)</div>
          <div id="character-inbox"></div>`
        : user.characterRequest?.status === 'pending'
          ? '<div class="admin-row-sub" style="margin:8px 0">Solicitação enviada. Aguarde o administrador escolher seu personagem.</div><span class="chip chip-gold">Em análise</span>'
          : user.characterRequest?.status === 'rejected'
            ? '<div class="admin-row-sub" style="margin:8px 0">Sua solicitação anterior não foi aprovada. Você pode solicitar novamente.</div><button class="btn btn-primary btn-sm" onclick="requestCharacterRole()">Solicitar novamente</button>'
            : '<div class="admin-row-sub" style="margin:8px 0">Quer interpretar um personagem e conversar com outros jogadores?</div><button class="btn btn-primary btn-sm" onclick="requestCharacterRole()">Quero ser um personagem</button>'}
      </div>
      ${user.userType === "character" || assignedChar ? `<div class="admin-section creator-level-card" style="margin:14px 16px;padding:16px"><b>🏆 Nível do criador</b><div class="creator-level-number">Nível ${Number(user.creatorLevel||1)} / 99</div><div class="creator-level-track"><div style="width:${Number(user.creatorLevel)>=99?100:Math.max(0,Math.min(100,((Number(user.creatorXp||0)-100*(Number(user.creatorLevel||1)-1)*Number(user.creatorLevel||1)/2)/(100*Number(user.creatorLevel||1)))*100))}%"></div></div><div class="admin-row-sub">${Number(user.creatorXp||0).toLocaleString("pt-BR")} XP · Hoje ${dailyCreatorMessages}/100 mensagens (+500 XP) · Semana ${weeklyCreatorMessages}/2.000 (+1.850 XP)</div>${Number(user.creatorLevel)>=99?(user.creatorLevel99RewardClaimed?'<span class="chip chip-gold">Premium de nível 99 resgatado</span>':'<span class="chip chip-gold">Nível máximo alcançado</span>'):""}</div>` : ""}
      <div class="admin-section" style="margin:14px 16px;padding:16px">
        <b>📥 Importar histórico do Discord</b>
        <div class="admin-row-sub" style="margin:8px 0">Cole uma conversa antiga, associe cada participante aos personagens e importe no chat privado.</div>
        <button class="btn btn-primary btn-full" style="margin-top:8px" onclick="openDiscordHistoryImport()">Importar histórico</button>
      </div>
            <div class="section-title">Chats abertos</div>
      <div class="chat-list" id="open-chats-list"></div>

      ${(user.isAdmin || user.isViceAdmin) ? `
        <div style="padding:16px">
          <button class="btn btn-danger btn-full" onclick="showAdminPanel()">⚙️ Painel Administrativo</button>
        </div>
      ` : ''}

      <div style="padding:16px">
        <button class="btn btn-secondary btn-full" onclick="logout()">Sair</button>
      </div>
    </div>
  `;

  renderOpenChats(el('open-chats-list'), chats);
  if (assignedChar) renderCharacterInbox(el('character-inbox'), assignedChar, myCharacterChats);
}


let discordImportDraft=null;
function parseDiscordHistory(raw){
 const lines=String(raw||'').replace(/\r/g,'').split('\n');const out=[];let cur=null,pendingSpeaker=null;
 const dateRe=/(\d{1,2}\/\d{1,2}\/\d{4},\s*\d{1,2}:\d{2})/;
 const pats=[/^\[[^\]]+\]\s*([^:]{1,100}):\s*(.*)$/,/^\d{4}-\d{2}-\d{2}[^-]*-\s*([^:]{1,100}):\s*(.*)$/,/^(?:\[[^\]]+\]\s*)?([^:]{1,80}):\s+(.*)$/];
 const finish=()=>{if(cur){out.push(cur);cur=null;}};
 for(const original of lines){
  const line=original.trim();
  if(!line)continue;
  if(/^\d+\.\s*$/.test(line))continue;
  const h=line.match(/^###\s*(.+?)\s*$/);
  if(h){
   finish();
   const rawName=h[1].trim(),dm=rawName.match(dateRe);
   if(dm){const name=rawName.slice(0,dm.index).trim();if(name)cur={speaker:name,text:''};pendingSpeaker=null;}
   else pendingSpeaker=rawName;
   continue;
  }
  if(pendingSpeaker){
   const dm=line.match(dateRe);
   if(dm&&line.replace(dm[0],'').trim()===''){
    cur={speaker:pendingSpeaker,text:''};pendingSpeaker=null;continue;
   }
   cur={speaker:pendingSpeaker,text:''};pendingSpeaker=null;
  }
  const m=pats.map(p=>line.match(p)).find(Boolean);
  if(m){finish();cur={speaker:m[1].trim(),text:m[2].trim()};continue;}
  if(cur){
   const content=line.replace(/^\d+\.\s+/,'').trim();
   if(content)cur.text+=(cur.text?'\n':'')+content;
  }
 }
 finish();
 return out.filter(x=>x.speaker&&x.text).map(x=>{let type='speech',text=x.text;
  if(/^\*(?!\*)([\s\S]*?)(?<!\*)\*$/.test(text)){type='action';text=text.slice(1,-1).trim();}
  else if(/^\(\([\s\S]*\)\)$/.test(text)||/^\[pensamento\]/i.test(text)){type='thought';text=text.replace(/^\(\(|\)\)$|^\[pensamento\]\s*/gi,'').trim();}
  else if(/^\[ação\]/i.test(text)){type='action';text=text.replace(/^\[ação\]\s*/i,'').trim();}
  return {...x,text,type};
 });
}
function openDiscordHistoryImport(){
 const modal=document.createElement('div');modal.id='discord-import-modal';modal.style.cssText='position:fixed;inset:0;z-index:9999;background:#080910ee;display:flex;align-items:center;justify-content:center;padding:14px;overflow:auto';
 modal.innerHTML=`<div style="background:#171827;border:1px solid #39334e;border-radius:16px;padding:18px;width:min(680px,100%);max-height:92vh;overflow:auto;color:#f4f0ff"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2 style="margin:0">📥 Importar histórico do Discord</h2><button class="btn btn-secondary btn-sm" onclick="document.getElementById('discord-import-modal').remove()">Fechar</button></div><p style="color:#b8b3c8;font-size:.88rem">Cole o histórico. Formato: <b>Nome: mensagem</b>. Use *texto* (um asterisco no início e outro no final) para ações e ((texto)) para pensamentos.</p><textarea id="discord-history-raw" class="input" rows="9" style="width:100%;resize:vertical" placeholder="Lorenzo: Oi!&#10;Kafka: *sorri de lado*&#10;Kafka: Olá.&#10;Kafka: ((Será interessante...))"></textarea><button class="btn btn-primary btn-full" style="margin-top:10px" onclick="analyzeDiscordHistory()">Analisar participantes</button><div id="discord-import-step2" style="margin-top:14px"></div></div>`;
 document.body.appendChild(modal);
}
async function analyzeDiscordHistory(){
 const entries=parseDiscordHistory(document.getElementById('discord-history-raw')?.value||'');
 if(!entries.length)return toast('Não encontrei mensagens. Confira os nomes e as datas do histórico.','error');
 if(entries.length>500)return toast('Importe no máximo 500 mensagens por vez.','error');
 const speakers=[...new Set(entries.map(e=>e.speaker))];
 discordImportDraft={entries,speakers,options:null};
 const area=document.getElementById('discord-import-step2');
 area.innerHTML='<p>Carregando usuários e personagens cadastrados...</p>';
 try{
  const options=await emmaApi('discord_import_options');
  discordImportDraft.options=options;
  const chars=DB.get('characters',[]),chats=DB.get('chats',[]).filter(c=>c.userId===state.currentUser.id);
  const chatOpts=chats.map(c=>{const ch=chars.find(x=>x.id===c.charId);return '<option value="'+escapeHtml(c.id)+'">'+escapeHtml(ch?.name||c.charId)+'</option>';}).join('');
  const userOpts='<option value="">— Escolher usuário do Emma —</option>'+options.users.map(u=>'<option value="'+escapeHtml(u.id)+'">'+escapeHtml(u.username||u.id)+'</option>').join('');
  area.innerHTML='<h3>Associe cada participante</h3><p style="color:#b8b3c8;font-size:.85rem">Foram encontradas '+entries.length+' mensagens e '+speakers.length+' participantes. Para cada nome do Discord, escolha a conta do Emma e depois o personagem que ela interpreta.</p><label>Chat privado de destino</label><select id="discord-import-chat" class="input" style="width:100%;margin:6px 0 12px">'+chatOpts+'</select><div style="display:grid;gap:12px">'+speakers.map((sp,i)=>'<div style="padding:10px;background:#222238;border-radius:10px;display:grid;gap:7px"><b>'+escapeHtml(sp)+'</b><label>Qual usuário do Emma é '+escapeHtml(sp)+'?</label><select class="input discord-user-map" data-index="'+i+'" onchange="updateDiscordCharacterChoices('+i+')">'+userOpts+'</select><label>Qual personagem esse usuário interpreta?</label><select class="input discord-character-map" data-index="'+i+'"><option value="">— Escolha primeiro o usuário —</option></select></div>').join('')+'</div><div style="margin-top:12px;padding:10px;background:#222238;border-radius:10px;font-size:.85rem">🧠 '+entries.filter(e=>e.type==='thought').length+' pensamento(s). Só serão importados se sua assinatura estiver ativa.</div><button class="btn btn-primary btn-full" style="margin-top:12px" onclick="confirmDiscordHistoryImport()">Importar mensagens</button>';
  if(!chats.length)area.innerHTML+='<p style="color:#ffbd6b">Você ainda não tem chats privados. Abra um personagem e crie um chat antes de importar.</p>';
 }catch(e){area.innerHTML='<p style="color:#ff9b9b">Não foi possível carregar os usuários e personagens: '+escapeHtml(e.message)+'</p>';}
}
function updateDiscordCharacterChoices(index){
 const userId=document.querySelector('.discord-user-map[data-index="'+index+'"]')?.value;
 const select=document.querySelector('.discord-character-map[data-index="'+index+'"]');
 if(!select)return;
 const opts=discordImportDraft?.options||{};
 const user=(opts.users||[]).find(u=>u.id===userId);
 const chars=(opts.characters||[]).filter(c=>userId&&(c.owner_user_id===userId||user?.assigned_character_id===c.id));
 select.innerHTML='<option value="">— Esse usuário é o jogador, sem personagem —</option>'+chars.map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.name)+'</option>').join('');
}
async function confirmDiscordHistoryImport(){
 const chatId=document.getElementById('discord-import-chat')?.value;
 if(!chatId)return toast('Escolha um chat privado de destino.','error');
 const mapping={};let invalid=false;
 document.querySelectorAll('.discord-user-map').forEach(s=>{
  const i=Number(s.dataset.index),char=document.querySelector('.discord-character-map[data-index="'+i+'"]')?.value;
  if(!s.value)invalid=true;
  mapping[discordImportDraft.speakers[i]]={userId:s.value,characterId:char||null};
 });
 if(invalid)return toast('Escolha um usuário do Emma para cada participante.','error');
 try{
  const result=await emmaApi('import_discord_history',{chatId,mappings:mapping,entries:discordImportDraft.entries.map(e=>({speaker:e.speaker,text:e.text,type:e.type}))});
  await loadEmmaBackendState();document.getElementById('discord-import-modal')?.remove();
  toast('Importadas '+result.imported+' mensagens.'+(result.skippedThoughts?' '+result.skippedThoughts+' pensamento(s) ignorado(s): assinatura inativa.':''),'success',7000);
  if(state.currentChat?.chatId===chatId)loadMessages();if(state.currentTab==='profile')switchTab('profile');
 }catch(e){toast('Falha ao importar: '+e.message,'error',8000);}
}

async function requestCharacterRole() {
  try {
    await emmaApi('request_character');
    await loadEmmaBackendState();
    toast('Solicitação enviada ao administrador!', 'success');
    switchTab('profile');
  } catch(e) { toast(e.message, 'error'); }
}

async function adminRejectCharacterRequest(userId) {
  if (!state.currentUser?.isAdmin) return toast('Acesso negado.', 'error');
  try {
    await emmaApi('reject_character_request', { userId });
    await loadEmmaBackendState(); renderAdminPanel();
    toast('Solicitação recusada.', 'success');
  } catch(e) { toast(e.message, 'error'); }
}

async function adminAssignCharacter(userId) {
  if (!state.currentUser?.isAdmin) return toast('Acesso negado.', 'error');
  const characterId = el('assign-char-' + userId)?.value;
  if (!characterId) return toast('Escolha um personagem.', 'error');
  try {
    await emmaApi('assign_character', { userId, characterId });
    await loadEmmaBackendState();
    toast('Personagem atribuído com sucesso!', 'success');
    renderAdminPanel();
  } catch(e) { toast(e.message, 'error'); }
}

async function setBotTakeover(enabled) {
  try {
    await emmaApi('set_bot_takeover', { enabled: !!enabled });
    state.currentUser.allowBotTakeover = !!enabled;
    toast(enabled ? 'Bot poderá assumir quando você estiver offline.' : 'Assumir automaticamente desativado.', 'success');
  } catch(e) { toast(e.message, 'error'); }
}

async function updateUserPresence() {
  if (!state.currentUser || !emmaSupabase) return;
  try {
    await emmaApi('presence');
    const users = DB.get('users', []);
    const me = users.find(u => u.id === state.currentUser.id);
    if (me) { me.lastSeenAt = Date.now(); DB.set('users', users); state.currentUser = me; }
  } catch(e) { console.warn('Presence sync:', e); }
}

function renderCharacterInbox(container, character, chats) {
  if (!container) return;
  const users = DB.get('users', []), messages = DB.get('messages', {});
  container.innerHTML = chats.sort((x,y)=>(y.lastTime||0)-(x.lastTime||0)).map(chat => {
    const player = users.find(u => u.id === chat.userId);
    const last = (messages[chat.id] || []).slice(-1)[0];
    return `<div class="admin-row" style="align-items:center;gap:10px"><div class="admin-row-info"><b>${escapeHtml(player?.username || 'Jogador')}</b><div class="admin-row-sub">${escapeHtml(last?.text || 'Sem mensagens')}</div></div><button class="btn btn-secondary btn-sm" onclick="replyAsCharacter('${chat.id}')">Abrir conversa</button><button class="btn btn-danger btn-sm" onclick="reportChatPlayer('${chat.id}')">Denunciar</button></div>`;
  }).join('') || '<div class="admin-row-sub">As conversas dos jogadores aparecerão aqui.</div>';
}

async function replyAsCharacter(chatId) {
  const char = DB.get('characters', []).find(c => c.ownerUserId === state.currentUser.id);
  if (!char) return toast('Nenhum personagem atribuído.', 'error');
  const chat = DB.get('chats', []).find(c => c.id === chatId && c.charId === char.id);
  if (!chat) return toast('Conversa não encontrada.', 'error');
  state.currentChat = { charId: char.id, char, chatId, userId: chat.userId };
  emmaSupabase.from('chats').update({ unread: 0 }).eq('id', chatId);
  try {
    state.currentChat.playerProfile = await emmaApi('get_chat_participant_profile', { chatId });
  } catch (e) { console.warn('Não foi possível carregar o avatar do participante:', e.message); }
  renderChatScreen(char, chat);
  el('chat-char-status').textContent = 'Você está respondendo como ' + char.name;
  showScreen('screen-chat');
}

async function reportChatPlayer(chatId) {
  const reason = prompt('Motivo da denúncia (assédio, spam, conteúdo impróprio etc.):');
  if (!reason || !reason.trim()) return;
  try {
    await emmaApi('report_player', { chatId, reason: reason.trim() });
    await refreshEmmaBackendState();
    toast('Denúncia enviada ao administrador.', 'success');
  } catch(e) { toast(e.message, 'error'); }
}

async function adminResolveReport(reportId, status) {
  if (!canAdminPermission('manage_reports')) return toast('Acesso negado.', 'error');
  try {
    await emmaApi('review_report', { reportId, status });
    await refreshEmmaBackendState();
    renderAdminPanel(); toast('Denúncia atualizada.', 'success');
  } catch(e) { toast(e.message, 'error'); }
}

function renderOpenChats(container, chats) {
  if (!chats.length) {
    container.innerHTML = '<div class="empty-state"><p>Nenhum chat aberto ainda</p></div>';
    return;
  }
  const characters = DB.get('characters', []);
  const ordered = [...chats].sort((a,b) => (b.lastTime||0) - (a.lastTime||0));
  const counts = {};
  ordered.forEach(chat => { counts[chat.charId] = (counts[chat.charId]||0) + 1; });
  const positions = {};
  container.innerHTML = ordered.map(chat => {
    const char = characters.find(c => c.id === chat.charId);
    if (!char) return '';
    positions[chat.charId] = (positions[chat.charId]||0) + 1;
    const statusClass = char.isBanned ? 'offline' : (char.isOnline ? 'online' : 'bot');
    const multipleLabel = counts[chat.charId] > 1 ? `<span class="chat-session-label">Conversa ${positions[chat.charId]} de ${counts[chat.charId]}</span>` : '';
    return `
      <div class="chat-item" onclick="openChat('${char.id}','${chat.id}')">
        <div class="chat-avatar">
          <img src="${safeImageUrl(char.image)}" alt="${escapeHtml(char.name)}" loading="lazy" onerror="this.src=''">
          <div class="chat-avatar-status ${statusClass}"></div>
        </div>
        <div class="chat-meta">
          <div class="chat-meta-top">
            <div class="chat-meta-name">${escapeHtml(char.name)} ${multipleLabel}</div>
            <div class="chat-meta-time">${timeAgo(chat.lastTime)}</div>
          </div>
          <div class="chat-meta-preview">${escapeHtml(chat.lastMessage || 'Nenhuma mensagem ainda')}</div>
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
      <div class="mission-icon ${mission.icon === '⭐' ? 'gold' : ''}">${escapeHtml(mission.icon)}</div>
      <div class="mission-info">
        <div class="mission-title">${escapeHtml(mission.title)}</div>
        <div class="mission-desc">${escapeHtml(mission.desc || mission.description)}</div>
        <div class="mission-progress-bar">
          <div class="mission-progress-fill" style="width:${pct}%"></div>
        </div>
        <div style="font-size:.7rem;color:var(--text-3);margin-top:3px">${progress}/${mission.target}${user.userType === "character" && mission.xpReward ? ` · +${mission.xpReward} XP` : ""}</div>
      </div>
      ${done ? `<span style="font-size:1.3rem">✅</span>` :
        canClaim ? `<button class="mission-claim-btn" onclick="claimMission('${mission.id}', event)">+${mission.reward}🪙</button>` :
        `<div class="mission-reward"><span>🪙</span><span>+${mission.reward}</span></div>`
      }
    </div>
  `;
}

async function claimMission(missionId, event) {
  const mission = DB.get('missions', []).find(m => m.id === missionId);
  if (!mission) return;
  try {
    const result = await emmaApi('claim_mission', {missionId});
    await loadEmmaBackendState();
    const rect = event.target.getBoundingClientRect();
    coinFly(result.reward, rect.left, rect.top);
    toast(`+${result.reward}🪙${result.xpReward ? ` +${result.xpReward} XP` : ""} — ${escapeHtml(mission.title)} concluída!`, 'gold', 3000);
    if(result.premiumReward)toast("Nível 99 alcançado! Você recebeu 5 dias de Emma Premium grátis.","gold",5000);
    updateCoinsDisplay(); switchTab('missions'); updateNavBadges();
  } catch(e) { toast(e.message || 'Não foi possível resgatar a missão.', 'error'); }
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
  syncMyProfileFromAppUser(user).catch(e => console.warn('Progresso não sincronizado:', e.message));
  updateNavBadges();
}

// ─── ADMIN PANEL ─────────────────────────────────────────────────────────────
function canAdminPermission(permission) {
  const user=state.currentUser;
  return !!(user?.isAdmin || (user?.isViceAdmin && user?.adminPermissions?.[permission]===true));
}
function canEditCharacter(character) {
  if (state.currentUser?.isAdmin) return true;
  return !!(character && state.currentUser?.isViceAdmin && state.currentUser?.adminPermissions?.[character.isVip ? 'edit_vip_characters' : 'edit_characters'] === true);
}
function showAdminPanel() {
  if (!state.currentUser?.isAdmin && !state.currentUser?.isViceAdmin) return toast('Acesso negado.', 'error');
  showScreen('screen-admin');
  renderAdminPanel();
}

async function adminAddCoins(userId) {
  if (!canAdminPermission('manage_economy')) return toast('Acesso negado.', 'error');
  const raw = prompt('Quantas moedas Emma deseja adicionar?');
  if (raw === null) return;
  const amount = Math.floor(Number(raw));
  if (!Number.isSafeInteger(amount) || amount <= 0) return toast('Informe um número inteiro maior que zero.', 'error');
  const users = DB.get('users', []); const user = users.find(u => u.id === userId);
  if (!user) return toast('Usuário não encontrado.', 'error');
  user.coins = (Number(user.coins) || 0) + amount;
  user.coinHistory = user.coinHistory || []; user.coinHistory.push({ type: 'admin_credit', amount, adminId: state.currentUser.id, timestamp: Date.now() });
  try {
    await emmaApi('admin_update_user', {userId, coins:user.coins, coinHistory:user.coinHistory});
    DB.set('users', users); if (state.currentUser.id === userId) state.currentUser = user;
    await loadEmmaBackendState(); toast(amount.toLocaleString('pt-BR') + ' moedas adicionadas a ' + user.username + '.', 'success'); renderAdminPanel();
  } catch(e) { user.coins -= amount; user.coinHistory.pop(); toast(e.message, 'error'); }
}

async function adminSetSubscriptionBan(userId, banned) {
  if (!canAdminPermission('manage_economy')) return toast('Acesso negado.', 'error');
  const users = DB.get('users', []); const user = users.find(u => u.id === userId);
  if (!user) return toast('Usuário não encontrado.', 'error');
  user.subscriptionRenewalBanned = !!banned; user.subscriptionRenewalBanAt = banned ? Date.now() : null; user.subscriptionRenewalBanBy = banned ? state.currentUser.id : null;
  try {
    await emmaApi('admin_update_user', {userId, subscriptionRenewalBanned:!!banned});
    DB.set('users', users); if (state.currentUser.id === userId) state.currentUser = user;
    await loadEmmaBackendState(); toast(banned ? 'Renovação bloqueada.' : 'Renovação liberada.', 'success'); renderAdminPanel();
  } catch(e) { user.subscriptionRenewalBanned = !banned; toast(e.message, 'error'); }
}

function adminViewUserChats(userId, options = {}) {
  if (!state.currentUser?.isAdmin) return toast('Somente o Admin principal pode consultar todos os chats.', 'error');
  const user = DB.get('users', []).find(u => u.id === userId); if (!user) return toast('Usuário não encontrado.', 'error');
  const chats = DB.get('chats', []).filter(c => c.userId === userId); const messages = DB.get('messages', {}); const chars = DB.get('characters', []);
  const container = el('admin-content');
  const screen = el('screen-admin');
  const contentScroll = container.scrollTop;
  const screenScroll = screen?.scrollTop || 0;
  container.dataset.adminSubview = 'user-chats';
  container.dataset.userId = userId;
  container.innerHTML = '<div class="admin-section"><button class="btn btn-secondary btn-sm" onclick="adminViewAllChats()">← Voltar</button><div class="admin-section-header">Conversas de ' + escapeHtml(user.username) + '</div>' +
    (chats.length ? chats.map(chat => {
      const character = chars.find(c => c.id === chat.charId); const list = messages[chat.id] || [];
      return '<div class="admin-section" style="padding:12px"><div class="admin-section-header">' + escapeHtml(character?.name || 'Personagem removido') + ' · ' + list.length + ' mensagens</div>' +
        (list.length ? list.map(m => {
          const sender = m.senderId === userId ? user.username : (chars.find(c => c.id === m.senderId)?.name || 'Sistema');
          const kind = m.type === 'thought' ? '🧠 Pensamento' : (m.type === 'action' ? '✦ Ação' : '🗣️ Fala');
          return '<div style="padding:9px;margin:6px 0;border-radius:10px;background:rgba(255,255,255,.045)"><div style="font-size:.72rem;color:var(--text-3)">' + escapeHtml(sender) + ' · ' + kind + ' · ' + new Date(m.timestamp || Date.now()).toLocaleString('pt-BR') + '</div><div style="white-space:pre-wrap;overflow-wrap:anywhere;margin-top:4px">' + escapeHtml(String(m.text || '')) + '</div></div>';
        }).join('') : '<div class="admin-row-sub">Nenhuma mensagem nesta conversa.</div>') + '</div>';
    }).join('') : '<div class="admin-row-sub">Este usuário ainda não possui conversas.</div>') + '</div>';
  if (options.preserveScroll) requestAnimationFrame(() => { container.scrollTop = contentScroll; if (screen) screen.scrollTop = screenScroll; });
}

function adminViewAllChats(options = {}) {
  if (!canAdminPermission('view_chats')) return toast('Acesso negado.', 'error');
  const users = DB.get('users', []); const chats = DB.get('chats', []); const container = el('admin-content');
  const screen = el('screen-admin');
  const contentScroll = container.scrollTop;
  const screenScroll = screen?.scrollTop || 0;
  container.dataset.adminSubview = 'all-chats';
  delete container.dataset.userId;
  container.innerHTML = '<div class="admin-section"><button class="btn btn-secondary btn-sm" onclick="renderAdminPanel()">← Voltar ao painel</button><div class="admin-section-header">💬 Chats de todos os usuários</div>' +
    (users.length ? users.map(u => { const count = chats.filter(c => c.userId === u.id).length; return '<div class="admin-row"><div class="admin-row-info"><div class="admin-row-name">' + escapeHtml(u.username) + '</div><div class="admin-row-sub">' + count + ' conversa(s)</div></div><button class="btn btn-sm btn-secondary" onclick="adminViewUserChats(\'' + u.id + '\')">Abrir conversas</button><button class="btn btn-sm btn-danger" onclick="showAdminDeleteUserModal(\'' + u.id + '\')">Excluir</button></div>'; }).join('') : '<div class="admin-row-sub">Nenhum usuário cadastrado.</div>') + '</div>';
  if (options.preserveScroll) requestAnimationFrame(() => { container.scrollTop = contentScroll; if (screen) screen.scrollTop = screenScroll; });
}

function showAdminDeleteUserModal(userId) {
  if (!canAdminPermission('delete_users')) return toast('Acesso negado.', 'error');
  const user = DB.get('users', []).find(u => u.id === userId);
  if (!user) return toast('Usuário não encontrado. Atualize a lista.', 'error');
  if (userId === state.currentUser.id) return toast('Você não pode excluir sua própria conta.', 'error');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">⚠️ Excluir conta permanentemente</div><div class="modal-body">Conta: <b>' + escapeHtml(user.username) + '</b><br>Esta ação exclui a conta e os dados vinculados por regras do banco, incluindo conversas e mensagens. Não pode ser desfeita.<br><br>Digite exatamente o nome de usuário para confirmar.</div><input class="input" id="admin-delete-username" autocomplete="off" placeholder="' + escapeHtml(user.username) + '"><div class="modal-actions"><button class="btn btn-secondary flex-1" onclick="this.closest(\'.modal-overlay\').remove()">Cancelar</button><button class="btn btn-danger flex-1" onclick="confirmAdminDeleteUser(\'' + user.id + '\', this)">Excluir definitivamente</button></div></div>';
  document.body.appendChild(overlay);
}

async function confirmAdminDeleteUser(userId, button) {
  if (!canAdminPermission('delete_users')) return toast('Acesso negado.', 'error');
  const user = DB.get('users', []).find(u => u.id === userId);
  const typed = el('admin-delete-username')?.value?.trim().toLowerCase();
  if (!user || typed !== String(user.username || '').trim().toLowerCase()) return toast('O nome digitado não corresponde à conta.', 'error');
  if (userId === state.currentUser.id) return toast('Você não pode excluir sua própria conta.', 'error');
  button.disabled = true;
  button.textContent = 'Excluindo…';
  try {
    await emmaApi('admin_delete_user', {userId, expectedUsername:user.username, expectedUserId:user.id});
    button.closest('.modal-overlay')?.remove();
    await loadEmmaBackendState();
    toast('Conta e dados vinculados excluídos.', 'success');
    renderAdminPanel();
  } catch (e) {
    button.disabled = false;
    button.textContent = 'Excluir definitivamente';
    toast(e.message || 'Não foi possível excluir a conta.', 'error');
  }
}
const VICE_ADMIN_PERMISSIONS=[{"key":"delete_characters","label":"Excluir personagens"},{"key":"ban_characters","label":"Banir personagens"},{"key":"ban_users","label":"Banir usuários"},{"key":"view_users","label":"Ver usuários"},{"key":"delete_users","label":"Excluir usuários"},{"key":"manage_reports","label":"Gerenciar denúncias"},{"key":"edit_characters","label":"Modificar personagens normais"},{"key":"edit_vip_characters","label":"Modificar personagens VIPs"},{"key":"manage_missions","label":"Gerenciar missões"},{"key":"manage_economy","label":"Gerenciar moedas e assinaturas"},{"key":"reset_passwords","label":"Redefinir senhas"},{"key":"view_admin_logs","label":"Ver registros administrativos"}];
async function loadAdminAuditLogs(){
 const output=el('admin-audit-output');if(!output)return;
 output.textContent='Carregando registros...';
 try{
  const result=await emmaApi('admin_get_audit_logs');
  const users=DB.get('users',[]);
  output.innerHTML=(result.logs||[]).map(log=>{
   const actor=users.find(u=>u.id===log.actor_user_id)?.username||'Conta removida';
   const target=users.find(u=>u.id===log.target_user_id)?.username||'—';
   return '<div class="admin-row"><div class="admin-row-info"><b>'+escapeHtml(log.action)+'</b><div class="admin-row-sub">'+escapeHtml(actor)+' → '+escapeHtml(target)+' · '+new Date(log.created_at).toLocaleString('pt-BR')+'</div><div class="admin-row-sub">'+escapeHtml(JSON.stringify(log.details||{}))+'</div></div></div>';
  }).join('')||'<div class="admin-row-sub">Nenhum registro disponível.</div>';
 }catch(e){output.textContent=e.message||'Falha ao carregar registros.';}
}
async function grantViceAdmin(){const userId=el('vice-admin-candidate')?.value;if(!userId)return toast('Escolha um usuário.','error');try{await emmaApi('admin_manage_vice_admin',{userId,enabled:true});await loadEmmaBackendState();renderAdminPanel();toast('Vice-admin promovido.','success');}catch(e){toast(e.message||'Não foi possível promover.','error');}}
async function revokeViceAdmin(userId){if(!confirm('Remover o cargo de Vice-admin e todas as permissões desta conta?'))return;try{await emmaApi('admin_manage_vice_admin',{userId,enabled:false});await loadEmmaBackendState();renderAdminPanel();toast('Cargo removido.','success');}catch(e){toast(e.message||'Não foi possível remover o cargo.','error');}}
async function saveViceAdminPermissions(userId){const row=document.querySelector('[data-vice-admin-row="'+userId+'"]');if(!row)return;const permissions={};row.querySelectorAll('[data-vice-permission]').forEach(input=>permissions[input.dataset.vicePermission]=!!input.checked);try{await emmaApi('admin_save_vice_permissions',{userId,permissions});await loadEmmaBackendState();renderAdminPanel();toast('Permissões atualizadas.','success');}catch(e){toast(e.message||'Não foi possível salvar as permissões.','error');}}
function applyViceAdminPanelVisibility(container){const user=state.currentUser;if(!user?.isViceAdmin)return;const allowed=key=>user.adminPermissions?.[key]===true;const canSeeCharacters=['edit_characters','edit_vip_characters','delete_characters','ban_characters'].some(allowed);for(const section of container.querySelectorAll('.admin-section')){const heading=section.querySelector('.admin-section-header')?.textContent||'';if(heading.includes('Solicitações'))section.classList.add('hidden');if(heading.includes('Denúncias')&&!allowed('manage_reports'))section.classList.add('hidden');if(heading.includes('Assinaturas')||heading.includes('Configurações de Custo')||heading.includes('Sincronização'))section.classList.add('hidden');if(heading.includes('Personagens')&&!canSeeCharacters)section.classList.add('hidden');if(heading.includes('Usuários')&&!['view_users','ban_users','delete_users','manage_economy','reset_passwords'].some(allowed))section.classList.add('hidden');if(heading.includes('Missões')&&!allowed('manage_missions'))section.classList.add('hidden');if(heading.includes('Registros administrativos')&&!allowed('view_admin_logs'))section.classList.add('hidden');for(const button of section.querySelectorAll('button[onclick],input[onchange]')){const action=button.getAttribute('onclick')||button.getAttribute('onchange')||'';if(/adminView(All|User)Chats/.test(action))button.classList.add('hidden');if(/showAdminDeleteCharacterModal/.test(action)&&!allowed('delete_characters'))button.classList.add('hidden');if(/showBanCharModal|unbanChar/.test(action)&&!allowed('ban_characters'))button.classList.add('hidden');if(/toggleCharOnline|showEditCharModal|toggleCharacterPhotosensitivity/.test(action)&&!allowed('edit_characters')&&!allowed('edit_vip_characters'))button.classList.add('hidden');if(/showAdminDeleteUserModal/.test(action)&&!allowed('delete_users'))button.classList.add('hidden');if(/showBanUserModal|unbanUser/.test(action)&&!allowed('ban_users'))button.classList.add('hidden');if(/adminAddCoins|adminSetSubscriptionBan/.test(action)&&!allowed('manage_economy'))button.classList.add('hidden');if(/adminResolveReport/.test(action)&&!allowed('manage_reports'))button.classList.add('hidden');if(/deleteMission|showAddMissionModal/.test(action)&&!allowed('manage_missions'))button.classList.add('hidden');if(/adminSetUserRole|manualGhPull|manualGhPush/.test(action))button.classList.add('hidden');}}}
function renderAdminPanel() {
  const container = el('admin-content');
  if (container) { delete container.dataset.adminSubview; delete container.dataset.userId; }
  const chars = DB.get('characters', []);
  const missions = DB.get('missions', []);
  const config = cfg();
  const users = DB.get('users', []);

  const characterRequests = users.filter(u => u.characterRequest?.status === 'pending' && !u.assignedCharacterId && !chars.some(c => c.ownerUserId === u.id));
  const pendingReports = DB.get('reports', []).filter(r => r.status === 'pending');
  container.innerHTML = `
    <div class="admin-section">
      <div class="admin-section-header">🌟 Solicitações para controlar personagens (${characterRequests.length})</div>
      ${characterRequests.map(u => `<div class="admin-row"><div class="admin-row-info"><b>${escapeHtml(u.username)}</b><div class="admin-row-sub">Solicitado em ${formatDate(u.characterRequest.requestedAt)}</div></div><select class="input" id="assign-char-${u.id}" style="max-width:170px"><option value="">Escolher personagem</option>${chars.filter(c => c.controlMode !== 'bot' && (!c.ownerUserId || c.ownerUserId === u.id)).map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select><button class="btn btn-primary btn-sm" onclick="adminAssignCharacter('${u.id}')">Atribuir</button><button class="btn btn-secondary btn-sm" onclick="adminRejectCharacterRequest('${u.id}')">Recusar</button></div>`).join('') || '<div class="admin-row-sub">Nenhuma solicitação pendente.</div>'}
    </div>
    <div class="admin-section"><div class="admin-section-header">🚨 Denúncias pendentes (${pendingReports.length})</div>
      ${pendingReports.map(r => { const reporter=users.find(u=>u.id===r.reporterId), target=users.find(u=>u.id===r.reportedUserId), c=chars.find(x=>x.id===r.characterId); return `<div class="admin-row" style="align-items:flex-start"><div class="admin-row-info"><b>${escapeHtml(target?.username || 'Usuário removido')}</b><div class="admin-row-sub">Denunciado por ${escapeHtml(reporter?.username || 'Personagem')} em ${escapeHtml(c?.name || 'personagem')}</div><div class="admin-row-sub">${escapeHtml(r.reason)}</div></div><button class="btn btn-secondary btn-sm" onclick="adminResolveReport('${r.id}','reviewed')">Analisada</button></div>`; }).join('') || '<div class="admin-row-sub">Nenhuma denúncia pendente.</div>'}
    </div>
    <div class="admin-section">
      <div class="admin-section-header">📜 Registros administrativos</div>
      <button class="btn btn-secondary btn-sm" onclick="loadAdminAuditLogs()">Carregar registros recentes</button>
      <div id="admin-audit-output"></div>
    </div>
    ${state.currentUser?.isAdmin ? `
    <div class="admin-section">
      <div class="admin-section-header">🛡️ Gerenciar Vice-admin</div>
      <div class="admin-row"><div class="admin-row-info"><b>Promover usuário</b><div class="admin-row-sub">O Vice-admin recebe apenas as permissões marcadas abaixo.</div></div><select class="input" id="vice-admin-candidate" style="max-width:190px"><option value="">Escolher usuário</option>${users.filter(u=>!u.isAdmin&&!u.isViceAdmin).map(u=>`<option value="${u.id}">${escapeHtml(u.username)}</option>`).join('')}</select><button class="btn btn-primary btn-sm" onclick="grantViceAdmin()">Promover</button></div>
      ${users.filter(u=>u.isViceAdmin).map(u=>`<div class="admin-section" data-vice-admin-row="${u.id}" style="padding:12px;margin-top:10px"><div class="admin-row"><div class="admin-row-info"><b>${escapeHtml(u.username)}</b><div class="admin-row-sub">Vice-admin</div></div><button class="btn btn-danger btn-sm" onclick="revokeViceAdmin('${u.id}')">Remover cargo</button></div><div class="admin-row" style="flex-wrap:wrap;gap:10px">${VICE_ADMIN_PERMISSIONS.map(p=>`<label style="display:flex;align-items:center;gap:6px;font-size:.82rem"><input type="checkbox" data-vice-permission="${p.key}" ${u.adminPermissions?.[p.key]===true?'checked':''}> ${p.label}</label>`).join('')}</div><button class="btn btn-primary btn-sm" onclick="saveViceAdminPermissions('${u.id}')">Salvar permissões</button></div>`).join('')||'<div class="admin-row-sub">Nenhum Vice-admin cadastrado.</div>'}
    </div>` : ''}
    <div class="admin-section">
      <div class="admin-section-header">🧠 Assinaturas de Pensamentos</div>
      <div class="admin-row"><span>Preço mensal</span><input class="input" id="plan-monthly" type="number" min="0" style="width:100px" value="${config.thoughtPlans?.monthly ?? 500}"></div>
      <div class="admin-row"><span>Preço anual</span><input class="input" id="plan-yearly" type="number" min="0" style="width:100px" value="${config.thoughtPlans?.yearly ?? 4500}"></div>
      <div class="admin-row"><span>Preço anterior mensal</span><input class="input" id="plan-old-monthly" type="number" min="0" style="width:100px" value="${config.thoughtPlans?.oldMonthly ?? 650}"></div>
      <div class="admin-row"><span>Preço anterior anual</span><input class="input" id="plan-old-yearly" type="number" min="0" style="width:100px" value="${config.thoughtPlans?.oldYearly ?? 5500}"></div>
      <div class="admin-row"><span>Promoção ativa</span><input id="plan-promo-enabled" type="checkbox" ${config.thoughtPlans?.promoEnabled ? "checked" : ""}></div>
      <div class="admin-row"><span>Promo mensal</span><input class="input" id="plan-promo-monthly" type="number" min="0" style="width:100px" value="${config.thoughtPlans?.promoMonthly ?? 350}"></div>
      <div class="admin-row"><span>Promo anual</span><input class="input" id="plan-promo-yearly" type="number" min="0" style="width:100px" value="${config.thoughtPlans?.promoYearly ?? 3000}"></div>
      <button class="btn btn-primary btn-sm" onclick="saveThoughtPlans()">Salvar preços</button>
      <div class="admin-section-header" style="margin-top:12px">Assinantes ativos</div>
      ${users.filter(u => u.thoughtSubscription && Number(u.thoughtSubscription.expiresAt) > Date.now()).map(u => '<div class="admin-row"><div>' + escapeHtml(u.username) + '<div class="admin-row-sub">' + (u.thoughtSubscription.plan === "yearly" ? "Anual" : "Mensal") + " · até " + new Date(u.thoughtSubscription.expiresAt).toLocaleDateString("pt-BR") + "</div></div></div>").join("") || '<div class="admin-row-sub">Nenhum assinante ativo.</div>'}
    </div>
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
          <div class="admin-row-name">🔑 Código de convite para jogadores</div>
          <div class="admin-row-sub">Apenas libera cadastro de contas comuns; mínimo de 32 caracteres</div>
        </div>
        <input type="text" class="input" style="width:180px" id="player-invite-code-cfg" value="" placeholder="Novo código de jogador">
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
            <img src="${safeImageUrl(c.image)}" alt="${escapeHtml(c.name)}" style="width:100%;height:100%;object-fit:cover;object-position:top;" onerror="this.src=''">
          </div>
          <div class="admin-row-info">
            <div class="admin-row-name">${escapeHtml(c.name)}</div>
            <div class="admin-row-sub">${c.isBanned ? '🚫 Banido' : (c.isOnline ? '🟢 Online' : '⚫ Offline')}</div>
            <div class="admin-row-sub">${c.isPhotosensitive ? '☀️ Fotossensibilidade ativada' : 'Fotossensibilidade desativada'}</div>
          </div>
          <div class="admin-actions">
            ${canEditCharacter(c) ? `<button class="btn btn-sm ${c.isPhotosensitive ? 'btn-primary' : 'btn-secondary'}" onclick="toggleCharacterPhotosensitivity('${c.id}')">${c.isPhotosensitive ? '☀️ Sensível' : 'Ativar fotossensibilidade'}</button>
            <label class="toggle-switch" title="Online/Offline">
              <input type="checkbox" ${c.isOnline ? 'checked' : ''} onchange="toggleCharOnline('${c.id}', this.checked)">
              <span class="toggle-slider"></span>
            </label>` : ''}
            ${c.isBanned
              ? `<button class="btn btn-sm btn-secondary" onclick="unbanChar('${c.id}')">Desbanir</button>`
              : `<button class="btn btn-sm btn-danger" onclick="showBanCharModal('${c.id}')">Banir</button>`
            }
            ${canEditCharacter(c) ? `<button class="btn btn-sm btn-secondary" onclick="showEditCharModal('${c.id}')">✏️</button>` : ''}
            <button class="btn btn-sm btn-danger" onclick="showAdminDeleteCharacterModal('${c.id}')" title="Excluir personagem">🗑️</button>
          </div>
        </div>
      `).join('')}
      ${canAdminPermission('edit_characters') ? `<div class="admin-row" style="justify-content:center">
        <button class="btn btn-primary btn-sm" onclick="showAddCharModal()">+ Novo Personagem</button>
      </div>` : ''}
    </div>

    <!-- USERS -->
    <div class="admin-section">
      <div class="admin-section-header">👥 Usuários (${users.length})</div>
      <input class="input" id="admin-user-filter" type="search" placeholder="Buscar usuário pelo nome..." aria-label="Buscar usuário pelo nome" style="width:100%;margin:8px 0 12px">
      <button class="btn btn-primary btn-sm" onclick="adminViewAllChats()">💬 Ver chats de todos os usuários</button>
      ${users.map(u => `
        <div class="admin-row" data-admin-user="${escapeHtml(u.username).toLowerCase()}">
          <div class="admin-row-info">
            <div class="admin-row-name">${escapeHtml(u.username)} ${u.isAdmin ? '<span class="chip chip-red" style="font-size:.6rem">ADMIN</span>' : u.isViceAdmin ? '<span class="chip" style="font-size:.6rem">VICE-ADMIN</span>' : ''}</div>
            <div class="admin-row-sub">🪙 ${u.coins} · ${u.totalMessages||0} msgs · desde ${formatDate(u.joinDate)}</div>
          </div>
          <div class="admin-actions">
            <button class="btn btn-xs btn-secondary" onclick="adminResetPassword('${u.id}')" title="Redefinir senha">🔑</button>
            ${u.id !== state.currentUser.id && !u.isViceAdmin ? `<button class="btn btn-xs ${u.isAdmin ? 'btn-danger' : 'btn-secondary'}" onclick="adminSetUserRole('${u.id}','${u.isAdmin ? 'user' : 'admin'}')" title="${u.isAdmin ? 'Remover admin' : 'Tornar admin'}">${u.isAdmin ? 'Tirar admin' : 'Tornar admin'}</button>` : u.isViceAdmin ? '<span class="chip" style="font-size:.6rem">VICE-ADMIN</span>' : ''}
            <button class="btn btn-xs btn-secondary" onclick="adminAddCoins('${u.id}')" title="Adicionar moedas">🪙+</button>
            ${u.subscriptionRenewalBanned
              ? `<button class="btn btn-xs btn-secondary" onclick="adminSetSubscriptionBan('${u.id}', false)">Liberar renovação</button>`
              : `<button class="btn btn-xs btn-danger" onclick="adminSetSubscriptionBan('${u.id}', true)">Bloquear renovação</button>`
            }
            <button class="btn btn-xs btn-secondary" onclick="adminViewUserChats('${u.id}')">Ver chats</button>
            ${u.id !== state.currentUser.id ? `<button class="btn btn-xs btn-danger" onclick="showAdminDeleteUserModal('${u.id}')" title="Excluir usuário">🗑️ Excluir</button>` : ''}
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
            <div class="admin-row-name">${escapeHtml(m.title)}</div>
            <div class="admin-row-sub">+${m.reward}🪙 · Meta: ${m.target} · ${m.type}</div>
          </div>
          <button class="btn btn-xs btn-danger" onclick="deleteMission('${m.id}')">🗑️</button>
        </div>
      `).join('')}
      <div class="admin-row" style="justify-content:center">
        <button class="btn btn-primary btn-sm" onclick="showAddMissionModal()">+ Nova Missão</button>
      </div>
    </div>

    <!-- GITHUB SYNC -->
    <div class="admin-section">
      <div class="admin-section-header">🔗 Sincronização GitHub segura</div>
      <div class="admin-row-sub" style="line-height:1.5">
        A sincronização usa um segredo privado no Supabase. Nenhum token fica neste navegador.
        Configure <code>GITHUB_TOKEN</code> em Edge Functions → Secrets no Supabase.
      </div>
      <div class="admin-row" style="justify-content:flex-end;gap:8px;margin-top:8px">
        <button class="btn btn-secondary btn-sm" onclick="manualGhPull()">⬇️ Puxar dados do GitHub</button>
        <button class="btn btn-secondary btn-sm" onclick="manualGhPush()">⬆️ Enviar dados ao GitHub</button>
      </div>
    </div>

    <div style="height:32px"></div>
  `;
  const userFilter = el('admin-user-filter');
  if (userFilter) userFilter.addEventListener('input', () => {
    const query = userFilter.value.trim().toLocaleLowerCase('pt-BR');
    container.querySelectorAll('[data-admin-user]').forEach(row => {
      row.classList.toggle('hidden', !row.dataset.adminUser.includes(query));
    });
  });
  applyViceAdminPanelVisibility(container);
}

function showAdminDeleteCharacterModal(characterId) {
  if (!canAdminPermission('delete_characters')) return toast('Acesso negado.', 'error');
  const character = DB.get('characters', []).find(c => c.id === characterId);
  if (!character) return toast('Personagem não encontrado. Atualize a lista.', 'error');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">⚠️ Excluir personagem permanentemente</div><div class="modal-body">Personagem: <b>' + escapeHtml(character.name) + '</b><br>Esta ação remove o personagem, libera usuários que o tinham atribuído e exclui conversas e mensagens vinculadas a ele. Não pode ser desfeita.<br><br>Digite exatamente o nome do personagem para confirmar.</div><input class="input" id="admin-delete-character-name" autocomplete="off" placeholder="' + escapeHtml(character.name) + '"><div class="modal-actions"><button class="btn btn-secondary flex-1" onclick="this.closest(\'.modal-overlay\').remove()">Cancelar</button><button class="btn btn-danger flex-1" onclick="confirmAdminDeleteCharacter(\'' + character.id + '\', this)">Excluir definitivamente</button></div></div>';
  document.body.appendChild(overlay);
}

async function confirmAdminDeleteCharacter(characterId, button) {
  if (!canAdminPermission('delete_characters')) return toast('Acesso negado.', 'error');
  const character = DB.get('characters', []).find(c => c.id === characterId);
  const typed = el('admin-delete-character-name')?.value?.trim().toLocaleLowerCase('pt-BR');
  if (!character || typed !== String(character.name || '').trim().toLocaleLowerCase('pt-BR')) return toast('O nome digitado não corresponde ao personagem.', 'error');
  button.disabled = true;
  button.textContent = 'Excluindo…';
  try {
    await emmaApi('admin_delete_character', {characterId, expectedName:character.name});
    button.closest('.modal-overlay')?.remove();
    await loadEmmaBackendState();
    toast('Personagem e conversas vinculadas excluídos.', 'success');
    renderAdminPanel();
  } catch (e) {
    button.disabled = false;
    button.textContent = 'Excluir definitivamente';
    toast(e.message || 'Não foi possível excluir o personagem.', 'error');
  }
}

async function adminSetUserRole(userId, role) {
  try {
    await emmaApi('set_user_role', { userId, role });
    await loadEmmaBackendState();
    toast(role === 'admin' ? 'Usuário promovido a administrador.' : 'Acesso de administrador removido.', 'success');
    renderAdminPanel();
  } catch (e) {
    toast(e.message || 'Não foi possível alterar o cargo.', 'error');
  }
}

async function manualGhPull() {
  toast('Puxando dados do GitHub...', 'info');
  const result = await ghPull();
  if (result.pulled > 0) { toast(`${result.pulled} arquivo(s) sincronizados!${result.errors.length ? ' Alguns falharam: ' + result.errors.join(' | ') : ''}`, result.errors.length ? 'warning' : 'success'); renderAdminPanel(); }
  else toast('Falha ao puxar: ' + (result.errors.join(' | ') || 'resposta vazia.'), 'error');
}
async function manualGhPush() {
  toast('Enviando dados ao GitHub...', 'info');
  let ok = 0;
  const errors = [];
  for (const [key, file] of Object.entries(GH_FILES)) {
    const val = DB.get(key);
    if (val !== null) { const result = await ghPush(file, val); if (result.ok) ok++; else errors.push(file + ': ' + result.error); }
  }
  toast(ok > 0 ? `${ok} arquivo(s) enviados!${errors.length ? ' Falhas: ' + errors.join(' | ') : ''}` : 'Falha ao enviar: ' + (errors.join(' | ') || 'nenhum dado local encontrado.'), errors.length ? 'warning' : ok > 0 ? 'success' : 'error');
}

async function saveConfig() {
  const config = cfg();
  const next = {
    thoughtCost: Math.max(0, Math.min(100000, Number(el('cost-thought-cfg').value) || 0)),
    actionCost: Math.max(0, Math.min(100000, Number(el('cost-action-cfg').value) || 0)),
    speechCost: Math.max(0, Math.min(100000, Number(el('cost-speech-cfg').value) || 0)),
    playerInviteCode: String(el('player-invite-code-cfg')?.value || '').trim().toUpperCase()
  };
  try {
    const result = await emmaApi('admin_save_public_config', next);
    Object.assign(config, result.config || next); DB.set('config', config);
    toast('Configurações salvas no servidor.', 'success');
  } catch (e) { toast(e.message || 'Não foi possível salvar.', 'error'); }
}

async function toggleCharacterPhotosensitivity(charId) {
  const chars = DB.get('characters', []);
  const char = chars.find(c => String(c.id) === String(charId));
  if (!canEditCharacter(char)) return toast('Acesso negado.', 'error');
  if (!char) return;
  const nextValue = !Boolean(char.isPhotosensitive);
  try {
    const result = await emmaApi('admin_set_character_photosensitivity', {characterId:String(charId), enabled:nextValue});
    char.isPhotosensitive = result.isPhotosensitive === true;
    DB.set('characters', chars);
    toast(char.isPhotosensitive ? 'Fotossensibilidade ativada para este personagem.' : 'Fotossensibilidade desativada.', 'success');
    renderAdminPanel();
  } catch (e) {
    toast(e.message || 'Não foi possível salvar a configuração.', 'error');
  }
}

async function toggleCharOnline(charId, isOnline) {
  const chars = DB.get('characters', []);
  const char = chars.find(c => c.id === charId);
  if (!canEditCharacter(char)) return toast('Acesso negado.', 'error');
  if (!char) return;
  const old = char.isOnline; char.isOnline = isOnline;
  try { await emmaApi('admin_save_character', {character:char}); DB.set('characters', chars); toast('Status atualizado.', 'success'); }
  catch(e) { char.isOnline = old; toast(e.message, 'error'); }
}

function showBanCharModal(charId) {
  if (!canAdminPermission('ban_characters')) return toast('Acesso negado.', 'error');
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

async function banChar(charId, btn) {
  if (!canAdminPermission('ban_characters')) return toast('Acesso negado.', 'error');
  const overlay = btn.closest('.modal-overlay');
  const reason = el('ban-char-reason').value.trim() || 'Sem motivo';
  const days = parseInt(el('ban-char-days').value) || 3;
  const chars = DB.get('characters', []);
  const char = chars.find(c => c.id === charId);
  if (!char) return;
  const old = {...char}; char.isBanned = true; char.banReason = reason; char.banUntil = Date.now() + days * 86400000; char.isOnline = false;
  try { await emmaApi('admin_save_character', {character:char}); DB.set('characters', chars); overlay.remove(); toast(`${escapeHtml(char.name)} banido por ${days} dias.`, 'error'); renderAdminPanel(); }
  catch(e) { Object.assign(char,old); toast(e.message, 'error'); }
}

async function unbanChar(charId) {
  if (!canAdminPermission('ban_characters')) return toast('Acesso negado.', 'error');
  const chars = DB.get('characters', []);
  const char = chars.find(c => c.id === charId);
  if (!char) return;
  const old = {...char}; char.isBanned = false; char.banUntil = null; char.banReason = '';
  try { await emmaApi('admin_save_character', {character:char}); DB.set('characters', chars); toast('Personagem desbanido!', 'success'); renderAdminPanel(); }
  catch(e) { Object.assign(char,old); toast(e.message, 'error'); }
}

function showBanUserModal(userId) {
  if (!canAdminPermission('ban_users')) return toast('Acesso negado.', 'error');
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

async function banUser(userId, btn) {
  if (!canAdminPermission('ban_users')) return toast('Acesso negado.', 'error');
  const overlay = btn.closest('.modal-overlay');
  const reason = el('ban-user-reason').value.trim() || 'Sem motivo';
  const days = parseInt(el('ban-user-days').value) || 3;
  const until = Date.now() + days * 86400000;
  try { await emmaApi('admin_set_user_ban', {userId, bannedUntil:until, reason}); await loadEmmaBackendState(); overlay.remove(); toast(`Usuário banido por ${days} dias.`, 'error'); renderAdminPanel(); }
  catch(e) { toast(e.message, 'error'); }
}

async function unbanUser(userId) {
  if (!canAdminPermission('ban_users')) return toast('Acesso negado.', 'error');
  try { await emmaApi('admin_set_user_ban', {userId, mode:'lift'}); await loadEmmaBackendState(); toast('Usuário desbanido!', 'success'); renderAdminPanel(); }
  catch(e) { toast(e.message, 'error'); }
}

async function deleteMission(missionId) {
  if (!canAdminPermission('manage_missions')) return toast('Acesso negado.', 'error');
  try {
    await emmaApi('admin_delete_mission', {missionId});
    const missions = DB.get('missions', []).filter(m => m.id !== missionId);
    DB.set('missions', missions); toast('Missão removida.', 'info'); renderAdminPanel();
  } catch(e) { toast(e.message, 'error'); }
}

function showAddCharModal(editId = null) {
  const chars = DB.get('characters', []);
  const char = editId ? chars.find(c => c.id === editId) : null;
  if (editId ? !canEditCharacter(char) : !canAdminPermission('edit_characters')) return toast('Você não tem permissão para modificar este tipo de personagem.', 'error');
  const imgSrc = char?.image || '';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay char-form-modal';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">${char ? '✏️ Editar' : '+ Novo'} Personagem</div>

      <!-- IMAGE UPLOAD -->
      <div class="field" style="align-items:center;display:flex;flex-direction:column;gap:8px">
        <label>Imagem do Personagem</label>
        <div class="char-img-preview" id="cf-img-preview" style="width:90px;height:120px;border-radius:12px;overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center;position:relative;cursor:pointer" onclick="document.getElementById('cf-img-file').click()">
          ${imgSrc ? `<img src="${imgSrc}" style="width:100%;height:100%;object-fit:cover;object-position:top" id="cf-img-thumb">` : '<span style="font-size:2rem">📷</span>'}
          <div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,.6);border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:.7rem">✏️</div>
        </div>
        <input type="file" id="cf-img-file" accept="image/*" style="display:none" onchange="previewCharImg(this)">
        <div style="font-size:.7rem;color:var(--text-3)">Ou cole uma URL abaixo:</div>
        <input class="input" id="cf-image" value="${safeImageUrl(char?.image||'')}" placeholder="https://..." oninput="syncCharImgUrl(this)">
      </div>

      <div class="field"><label>Nome</label><input class="input" id="cf-name" value="${escapeHtml(char?.name||'')}"></div>
      <div class="field"><label>Função/Título</label><input class="input" id="cf-role" value="${escapeHtml(char?.role||'')}"></div>
      <div class="field">
        <label>Gênero</label>
        <div class="chip-group" id="cf-gender">
          <button type="button" class="chip-select ${char?.gender==='female'?'active':''}" data-val="female" onclick="selectChip(this,'cf-gender')">♀ Mulher</button>
          <button type="button" class="chip-select ${char?.gender==='male'?'active':''}" data-val="male" onclick="selectChip(this,'cf-gender')">♂ Homem</button>
          <button type="button" class="chip-select ${(!char?.gender||char?.gender==='other')?'active':''}" data-val="other" onclick="selectChip(this,'cf-gender')">✦ Outro</button>
        </div>
      </div>
      <div class="field"><label>Descrição</label><textarea class="input" id="cf-desc" rows="3" style="min-height:76px">${escapeHtml(char?.description||'')}</textarea></div>
      <div class="field"><label>Lore / História e passado do personagem</label><textarea class="input" id="cf-lore" rows="5" style="min-height:120px" placeholder="Origem, passado, mundo, relações, acontecimentos importantes, objetivos e segredos...">${escapeHtml(char?.lore||'')}</textarea><small style="color:var(--text-3)">Contexto permanente que orienta a personalidade e as respostas da IA.</small></div>
      <div class="field"><label>Início da história</label><textarea class="input" id="cf-story-intro" rows="4" style="min-height:100px" placeholder="Descreva a cena inicial, o lugar, o momento e o que está acontecendo...">${escapeHtml(char?.storyIntro||'')}</textarea><small style="color:var(--text-3)">A IA usará este texto como ponto de partida e referência para manter a continuidade do roleplay.</small></div>
      <div class="form-row">
        <div class="field"><label>Idade (anos)</label><input type="number" class="input" id="cf-age" min="0" max="200" step="1" value="${char?.ageYears ?? ''}" placeholder="Ex.: 24"></div>
        <div class="field"><label>Altura (cm)</label><input type="number" class="input" id="cf-height" min="30" max="300" step="1" value="${char?.heightCm ?? ''}" placeholder="Ex.: 170"></div>
        <div class="field"><label>Peso (kg)</label><input type="number" class="input" id="cf-weight" min="1" max="1000" step="0.1" value="${char?.weightKg ?? ''}" placeholder="Ex.: 65"></div>
      </div>
      <div class="field"><label><input type="checkbox" id="cf-is-vip" ${char?.isVip ? "checked" : ""}> Marcar como personagem VIP</label></div>
      <div class="field"><label>Quem pode controlar este personagem?</label><select class="input" id="cf-control-mode"><option value="bot" ${char?.controlMode==='bot'?'selected':''}>Somente bot</option><option value="both" ${(!char?.controlMode||char?.controlMode==='both')?'selected':''}>Ambos (bot e usuários)</option><option value="users" ${char?.controlMode==='users'?'selected':''}>Somente usuários</option></select></div>
      <div class="field"><label>Personalidade do Bot</label><textarea class="input" id="cf-personality" style="min-height:80px">${escapeHtml(char?.botPersonality||'')}</textarea></div>
      <div class="modal-actions">
        <button class="btn btn-secondary flex-1" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn btn-primary flex-1" onclick="saveChar('${editId||''}', this)">Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

let charImageProcessing = false;

async function previewCharImg(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast('Selecione um arquivo de imagem.', 'error');
  if (file.size > 5 * 1024 * 1024) return toast('Imagem muito grande! Máx. 5MB antes da compactação.', 'error');

  charImageProcessing = true;
  const saveButton = document.querySelector('.char-form-modal .modal-actions .btn-primary');
  if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Compactando imagem…'; }

  let bitmap = null;
  let sourceUrl = null;
  try {
    let drawable = null;
    let imageWidth = 0;
    let imageHeight = 0;

    // Primeiro tenta a decodificação nativa, que lida melhor com formatos/orientações variados.
    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(file);
        drawable = bitmap;
        imageWidth = bitmap.width;
        imageHeight = bitmap.height;
      } catch (_) {
        bitmap = null;
      }
    }

    // Compatibilidade com navegadores que não conseguem usar createImageBitmap.
    if (!drawable) {
      sourceUrl = URL.createObjectURL(file);
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('Este formato de imagem não é compatível com o navegador. Tente salvar a imagem como JPG ou PNG e selecioná-la novamente.'));
        image.src = sourceUrl;
      });
      drawable = image;
      imageWidth = image.naturalWidth;
      imageHeight = image.naturalHeight;
    }

    if (!imageWidth || !imageHeight) throw new Error('A imagem está vazia ou não pôde ser decodificada.');
    const maxSide = 640;
    let scale = Math.min(1, maxSide / Math.max(imageWidth, imageHeight));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Seu navegador não conseguiu processar a imagem.');

    let compacted = '';
    for (let attempt = 0; attempt < 8; attempt++) {
      canvas.width = Math.max(1, Math.round(imageWidth * scale));
      canvas.height = Math.max(1, Math.round(imageHeight * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(drawable, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.76, 0.66, 0.56, 0.46]) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
        if (!blob) continue;
        if (blob.size <= 220 * 1024) {
          compacted = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Falha ao preparar imagem.'));
            reader.readAsDataURL(blob);
          });
          break;
        }
      }
      if (compacted) break;
      scale *= 0.82;
    }
    if (!compacted) throw new Error('Não foi possível reduzir a imagem para o limite de 220 KB.');

    const preview = el('cf-img-preview');
    if (preview) preview.innerHTML = `<img src="${compacted}" style="width:100%;height:100%;object-fit:cover;object-position:top" id="cf-img-thumb"><div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,.6);border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:.7rem" onclick="document.getElementById('cf-img-file').click()">✏️</div>`;
    const urlInput = el('cf-image');
    if (urlInput) urlInput.value = compacted;
    toast('Imagem compactada em WebP e pronta para salvar.', 'success');
  } catch (error) {
    toast(error.message || 'Não foi possível compactar a imagem.', 'error');
  } finally {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    charImageProcessing = false;
    if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Salvar'; }
    input.value = '';
  }
}

function syncCharImgUrl(input) {
  const url = input.value.trim();
  if (!url) return;
  const thumb = el('cf-img-thumb');
  if (thumb) thumb.src = url;
  else {
    const preview = el('cf-img-preview');
    if (preview) preview.innerHTML = `<img src="${safeImageUrl(url)}" style="width:100%;height:100%;object-fit:cover;object-position:top" id="cf-img-thumb"><div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,.6);border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:.7rem">✏️</div>`;
  }
}

function showEditCharModal(charId) { showAddCharModal(charId); }

async function saveChar(editId, btn) {
  const existingCharacter = editId ? DB.get('characters', []).find(c => c.id === editId) : null;
  const requestsVip = !!el('cf-is-vip')?.checked;
  if (existingCharacter ? !canEditCharacter(existingCharacter) : (!canAdminPermission('edit_characters') || (requestsVip && !canAdminPermission('edit_vip_characters')))) return toast('Você não tem permissão para modificar este tipo de personagem.', 'error');
  if (charImageProcessing) return toast('Aguarde a compactação da imagem.', 'error');
  const overlay = btn.closest('.modal-overlay');
  const name = el('cf-name').value.trim();
  if (!name) return toast('Nome obrigatório.', 'error');

  const chars = DB.get('characters', []);
  const image = el('cf-image').value.trim();
  if (/^data:image\//i.test(image) && (!/^data:image\/webp;base64,/i.test(image) || image.length > 310000)) return toast('A imagem precisa estar compactada em WebP e ter no máximo 220 KB.', 'error');
  const gender = getChipVal('cf-gender', 'other');
  const ageYears = el('cf-age').value.trim() === '' ? null : Number(el('cf-age').value);
  const heightCm = el('cf-height').value.trim() === '' ? null : Number(el('cf-height').value);
  const weightKg = el('cf-weight').value.trim() === '' ? null : Number(el('cf-weight').value);
  if (ageYears !== null && (!Number.isInteger(ageYears) || ageYears < 0 || ageYears > 200)) return toast('Idade inválida (0 a 200 anos).', 'error');
  if (heightCm !== null && (!Number.isInteger(heightCm) || heightCm < 30 || heightCm > 300)) return toast('Altura inválida (30 a 300 cm).', 'error');
  if (weightKg !== null && (!Number.isFinite(weightKg) || weightKg < 1 || weightKg > 1000)) return toast('Peso inválido (1 a 1000 kg).', 'error');
  const controlMode = ['bot','both','users'].includes(el('cf-control-mode')?.value) ? el('cf-control-mode').value : 'both';

  if (editId) {
    const char = chars.find(c => c.id === editId);
    if (char) {
      char.name = name;
      char.role = el('cf-role').value.trim();
      if (image) char.image = image;
      char.description = el('cf-desc').value.trim();
      char.lore = el('cf-lore').value.trim();
      char.storyIntro = el('cf-story-intro').value.trim();
      char.ageYears = ageYears;
      char.heightCm = heightCm;
      char.weightKg = weightKg;
      char.botPersonality = el('cf-personality').value.trim();
      char.gender = gender;
      char.controlMode = controlMode;
      char.isVip = !!el("cf-is-vip")?.checked;
    }
  } else {
    chars.push({
      id: 'c_' + Date.now(),
      name,
      role: el('cf-role').value.trim(),
      image: image || '',
      description: el('cf-desc').value.trim(),
      lore: el('cf-lore').value.trim(),
      storyIntro: el('cf-story-intro').value.trim(),
      ageYears,
      heightCm,
      weightKg,
      botPersonality: el('cf-personality').value.trim(),
      gender,
      controlMode,
      isVip:!!el("cf-is-vip")?.checked,
      isOnline: false,
      isBanned: false,
      banUntil: null,
      banReason: ''
    });
  }
  const saved = chars.find(c => c.id === (editId || chars[chars.length-1].id));
  try {
    await emmaApi('admin_save_character', {character:saved});
    DB.set('characters', chars); overlay.remove(); toast('Personagem salvo no servidor!', 'success');
    await loadEmmaBackendState(); renderAdminPanel();
  } catch(e) { toast('Não foi possível salvar o personagem: ' + e.message, 'error'); }
}

function showAddMissionModal() {
  if (!canAdminPermission('manage_missions')) return toast('Acesso negado.', 'error');
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
        <div class="field"><label>Recompensa🪙</label><input type="number" class="input" id="mf-reward" value="50" min="0"></div>
        <div class="field"><label>Recompensa de XP</label><input type="number" class="input" id="mf-xp" value="100" min="0"></div>
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

async function saveMission(btn) {
  if (!canAdminPermission('manage_missions')) return toast('Acesso negado.', 'error');
  const overlay = btn.closest('.modal-overlay');
  const title = el('mf-title').value.trim();
  if (!title) return toast('Título obrigatório.', 'error');
  const mission = {
    id: 'm_' + Date.now(), title, description: el('mf-desc').value.trim(),
    icon: el('mf-icon').value || '🎯', reward: parseInt(el('mf-reward').value) || 0, xpReward:Math.max(0,parseInt(el('mf-xp').value)||0),
    target: parseInt(el('mf-target').value) || 1, type: el('mf-type').value, isNewUser: false
  };
  try {
    await emmaApi('admin_save_mission', {mission});
    DB.set('missions', [...DB.get('missions', []), mission]);
    overlay.remove(); toast('Missão salva no Supabase!', 'success');
    await loadEmmaBackendState(); renderAdminPanel();
  } catch(e) { toast(e.message, 'error'); }
}

// ─── AVATAR UPLOAD ───────────────────────────────────────────────────────────
function triggerAvatarUpload() {
  const inp = el('avatar-file-input');
  if (inp) inp.click();
}

async function handleAvatarUpload(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast('Selecione uma imagem válida.', 'error');
  if (file.size > 5 * 1024 * 1024) return toast('Imagem muito grande! Máx. 5MB antes da compactação.', 'error');
  let bitmap=null, objectUrl=null;
  try {
    let drawable;
    if (typeof createImageBitmap === 'function') { try { bitmap=await createImageBitmap(file); drawable=bitmap; } catch (_) {} }
    if (!drawable) {
      objectUrl=URL.createObjectURL(file);
      const image=new Image();
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Formato de imagem não reconhecido.'));image.src=objectUrl;});
      drawable=image;
    }
    const width=drawable.width||drawable.naturalWidth, height=drawable.height||drawable.naturalHeight;
    const scale=Math.min(1,512/Math.max(width,height));
    const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(width*scale)); canvas.height=Math.max(1,Math.round(height*scale));
    const ctx=canvas.getContext('2d'); if(!ctx)throw new Error('Falha ao processar imagem.');
    ctx.drawImage(drawable,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.68));
    if(!blob||blob.size>180*1024)throw new Error('Não foi possível reduzir a imagem para 180 KB.');
    const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
    const users=DB.get('users',[]),user=users.find(u=>u.id===state.currentUser.id);
    if(user){user.avatar=base64;DB.set('users',users);state.currentUser=user;syncMyProfileFromAppUser(user).catch(console.warn);const img=el('profile-avatar-img');if(img)img.src=base64;toast('Imagem convertida para WebP leve e atualizada!','success');}
  } catch(error) { toast('Não foi possível processar a imagem: '+(error.message||'erro desconhecido'),'error'); }
  finally { bitmap?.close?.(); if(objectUrl)URL.revokeObjectURL(objectUrl); }
}

// ─── EDIT PREFERENCES MODAL ──────────────────────────────────────────────────
function showEditPreferencesModal() {
  const user = state.currentUser;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">✏️ Editar Preferências</div>
      <div class="field">
        <label>Você é…</label>
        <div class="chip-group" id="pref-usertype">
          <button type="button" class="chip-select ${user.userType==='player'?'active':''}" data-val="player" onclick="selectChip(this,'pref-usertype')">🎮 Jogador</button>
          <button type="button" class="chip-select ${user.userType==='character'?'active':''}" data-val="character" onclick="selectChip(this,'pref-usertype')">🌟 Personagem</button>
        </div>
      </div>
      <div class="field">
        <label>Gênero</label>
        <div class="chip-group" id="pref-gender">
          <button type="button" class="chip-select ${user.gender==='male'?'active':''}" data-val="male" onclick="selectChip(this,'pref-gender')">♂ Homem</button>
          <button type="button" class="chip-select ${user.gender==='female'?'active':''}" data-val="female" onclick="selectChip(this,'pref-gender')">♀ Mulher</button>
          <button type="button" class="chip-select ${(!user.gender||user.gender==='other')?'active':''}" data-val="other" onclick="selectChip(this,'pref-gender')">✦ Outro</button>
        </div>
      </div>
      <div class="field">
        <label>Preferência de conversa</label>
        <div class="chip-group" id="pref-chatpref">
          <button type="button" class="chip-select ${(user.chatPreference||'both')==='both'?'active':''}" data-val="both" onclick="selectChip(this,'pref-chatpref')">👥 Todos</button>
          <button type="button" class="chip-select ${user.chatPreference==='bots'?'active':''}" data-val="bots" onclick="selectChip(this,'pref-chatpref')">🤖 Só Bots</button>
          <button type="button" class="chip-select ${user.chatPreference==='female'?'active':''}" data-val="female" onclick="selectChip(this,'pref-chatpref')">♀ Mulheres</button>
          <button type="button" class="chip-select ${user.chatPreference==='male'?'active':''}" data-val="male" onclick="selectChip(this,'pref-chatpref')">♂ Homens</button>
          <button type="button" class="chip-select ${user.chatPreference==='players'?'active':''}" data-val="players" onclick="selectChip(this,'pref-chatpref')">🎭 Só Players</button>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary flex-1" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn btn-primary flex-1" onclick="savePreferences(this)">Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function savePreferences(btn) {
  const overlay = btn.closest('.modal-overlay');
  const users = DB.get('users', []);
  const user = users.find(u => u.id === state.currentUser.id);
  if (user) {
    user.userType = getChipVal('pref-usertype', 'player');
    user.gender = getChipVal('pref-gender', 'other');
    user.chatPreference = getChipVal('pref-chatpref', 'both');
    setHideCharacterImages(!!el('pref-hide-character-images')?.checked);
    user.isAnonymous = !!el('pref-anonymous')?.checked;
    DB.set('users', users);
    state.currentUser = user;
    syncMyProfileFromAppUser(user).catch(console.warn);
  }
  overlay.remove();
  toast('Preferências salvas!', 'success');
  switchTab('profile');
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
async function logout() {
  try { await emmaSupabase?.auth.signOut(); } catch {}
  clearTimeout(emmaSessionTimer); localStorage.removeItem(EMMA_SESSION_STARTED_KEY);
  if (emmaRealtimeChannel) { try { await emmaSupabase.removeChannel(emmaRealtimeChannel); } catch {} emmaRealtimeChannel = null; }
  const owned = DB.get('characters', []).find(c => c.ownerUserId === state.currentUser?.id);
  if (owned) { owned.isOnline = false; const chars = DB.get('characters', []); DB.set('characters', chars); }
  const presenceUsers = DB.get('users', []), leaving = presenceUsers.find(u => u.id === state.currentUser?.id);
  if (leaving) { leaving.lastSeenAt = 0; DB.set('users', presenceUsers); }
  DB.set('current_user', null);
  state.currentUser = null;
  state.currentChat = null;
  DB.set('access_verified', false);
  sessionStorage.removeItem('emma_invite_code');
  gateAdminAccess = false;
  el('gate-code').value = '';
  showScreen('screen-gate');
  initGate();
}

// ─── TEXTAREA AUTO-RESIZE ─────────────────────────────────────────────────────
function autoResize(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const loadingMsg = el('loading-status');
    if (loadingMsg) loadingMsg.textContent = 'Conectando ao servidor seguro...';
    // O repositório privado só é acessado após autenticação administrativa.
  } catch {}
  initData();
  try {
    const { data: { session } } = await emmaSupabase.auth.getSession();
    if (session) {
      if (!startEmmaSessionWindow()) return;
      const { data: authData, error } = await emmaSupabase.auth.getUser();
      if (error || !authData.user) throw new Error('Sessão inválida');
      await loadEmmaBackendState();
      const user = DB.get('users', []).find(u => u.id === authData.user.id);
      if (user) {
        state.currentUser = user;
        DB.set('current_user', user.id);
        subscribeEmmaRealtime();
        await continueAfterAuthentication();
        return;
      }
      await emmaSupabase.auth.signOut();
    }
    DB.set('current_user', null);
    DB.set('access_verified', false);
    el('gate-code').value = '';
    showScreen('screen-gate');
    initGate();
  } catch(e) {
    console.error('Boot error:', e);
    toast('Não foi possível conectar à conta. Tente entrar novamente.', 'error');
    showScreen('screen-gate');
    initGate();
  }
});
