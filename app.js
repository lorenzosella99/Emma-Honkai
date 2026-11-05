/* ==========================================
   EMMA HONKAI — App Core
   ========================================== */

// ─── GITHUB DB — integração com emma_honkai_dados ───────────────────────────
const GITHUB_REPO  = 'lorenzosella99/emma_honkai_dados';
const GITHUB_BRANCH = 'main';
const RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/dados`;
const API_BASE = `https://api.github.com/repos/${GITHUB_REPO}/contents/dados`;

// Mapeamento: chave local → arquivo no repo
const GH_FILES = {
  users:      'users.json',
  characters: 'characters.json',
  missions:   'missions.json',
  config:     'config.json'
};

// SHAs cacheados para evitar re-fetch (necessário para PUT no GitHub API)
const _ghSHAs = {};

function ghToken() {
  try { return localStorage.getItem('emma_gh_token') || ''; } catch { return ''; }
}

function ghSetToken(tok) {
  try { localStorage.setItem('emma_gh_token', tok); } catch {}
}

// Busca arquivo do GitHub. Usa a API autenticada quando há token
// (necessário porque o repositório de dados é privado); sem token, tenta raw.
async function ghFetch(filename) {
  try {
    const token = ghToken();
    if (token) {
      const apiRes = await fetch(`${API_BASE}/${filename}`, {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      });
      if (apiRes.ok) {
        const file = await apiRes.json();
        if (file.sha) _ghSHAs[filename] = file.sha;
        const decoded = decodeURIComponent(escape(atob((file.content || '').replace(/\\s/g, ''))));
        return JSON.parse(decoded);
      }
    }

    const url = `${RAW_BASE}/${filename}?t=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Faz push de um arquivo para o GitHub (requer token)
async function ghPush(filename, content) {
  const token = ghToken();
  if (!token) return false;
  try {
    // Busca SHA atual do arquivo (necessário para update)
    const infoRes = await fetch(`${API_BASE}/${filename}`, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' }
    });
    let sha = _ghSHAs[filename];
    if (infoRes.ok) {
      const info = await infoRes.json();
      sha = info.sha;
      _ghSHAs[filename] = sha;
    }
    const body = {
      message: `update ${filename} [app]`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
      branch: GITHUB_BRANCH
    };
    if (sha) body.sha = sha;
    const putRes = await fetch(`${API_BASE}/${filename}`, {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (putRes.ok) {
      const r = await putRes.json();
      if (r.content) _ghSHAs[filename] = r.content.sha;
      return true;
    }
    return false;
  } catch { return false; }
}

// Sincroniza do GitHub para o localStorage (pull)
async function ghPull() {
  let pulled = 0;
  for (const [key, file] of Object.entries(GH_FILES)) {
    const data = await ghFetch(file);
    if (data !== null) {
      try { localStorage.setItem('emma_' + key, JSON.stringify(data)); } catch {}
      pulled++;
    }
  }
  return pulled;
}

// Push de uma chave local para o GitHub (fire-and-forget, não bloqueia UI)
function ghPushKey(key) {
  const file = GH_FILES[key];
  if (!file || !ghToken()) return;
  try {
    const val = localStorage.getItem('emma_' + key);
    if (val) ghPush(file, JSON.parse(val)).catch(() => {});
  } catch {}
}

// ─── DATA LAYER ──────────────────────────────────────────────────────────────
const DB = {
  get(key, def = null) {
    try { const v = localStorage.getItem('emma_' + key); return v ? JSON.parse(v) : def; } catch { return def; }
  },
  set(key, val) {
    try {
      localStorage.setItem('emma_' + key, JSON.stringify(val));
      // Faz push assíncrono para o GitHub se for uma chave sincronizada
      ghPushKey(key);
    } catch {}
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
function generateBotResponse(char, userMessage, history) {
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
  result.push({ type: 'speech', text: rand(speeches) });

  // Para mensagens longas do usuário, adiciona resposta extra
  if (msgLen > 80 && Math.random() > 0.5) {
    const extras = tone.speech.default;
    const extra = rand(extras);
    if (extra !== result[result.length - 1].text) {
      result.push({ type: 'speech', text: extra });
    }
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
  recoveryLink.innerHTML = authMode === 'login'
    ? `<button class="btn-link" onclick="authMode='recovery';renderAuthScreen()">Esqueci minha senha</button>`
    : `<button class="btn-link" onclick="authMode='login';renderAuthScreen()">← Voltar para login</button>`;

  // Show/hide username & password fields depending on mode
  el('auth-username').parentElement.style.display = '';
  el('auth-password').parentElement.style.display = authMode === 'recovery' ? 'none' : '';

  if (authMode === 'register') {
    el('auth-fields-register').classList.remove('hidden');
    el('auth-fields-register').innerHTML = `
      <div class="field">
        <label>🔑 Código de convite</label>
        <input type="text" class="input" id="auth-invite-code" placeholder="Digite seu código de convite" autocomplete="off" spellcheck="false" style="text-transform:uppercase;letter-spacing:1.5px">
        <small style="color:var(--text-3)">Obrigatório para criar uma conta.</small>
      </div>
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
          Como o app é local (sem servidor), a recuperação funciona com o <strong>código admin</strong>.
          Um admin pode redefinir sua senha pelo painel, ou você pode redefinir aqui usando o código admin.
        </div>
        <div class="field">
          <label>Novo usuário (confirme)</label>
          <input type="text" class="input" id="recovery-username" placeholder="Digite seu nome de usuário">
        </div>
        <div class="field">
          <label>Nova senha</label>
          <input type="password" class="input" id="recovery-newpass" placeholder="Nova senha (mín. 4 caracteres)">
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

  el('auth-submit').onclick = () => {
    if (authMode === 'recovery') return handleRecovery();

    const username = el('auth-username').value.trim();
    const password = el('auth-password').value;

    if (!username || !password) return toast('Preencha todos os campos.', 'error');

    const users = DB.get('users', []);

    if (authMode === 'register') {
      const config = cfg();
      const inviteCode = (el('auth-invite-code')?.value || '').trim().toUpperCase();
      const normalInvite = String(config.accessCode || '').trim().toUpperCase();
      const adminInvite = String(config.adminCode || '').trim().toUpperCase();

      if (!inviteCode) return toast('Digite seu código de convite.', 'error');
      if (inviteCode !== normalInvite && inviteCode !== adminInvite)
        return toast('Código de convite inválido.', 'error');
      if (users.find(u => (u.username || '').toLowerCase() === username.toLowerCase()))
        return toast('Usuário já existe.', 'error');
      if (password.length < 4) return toast('Senha muito curta.', 'error');

      // Somente o código administrativo concede privilégios de administrador.
      // O nome de usuário ou a senha, isoladamente, nunca promovem uma conta.
      const isAdmin = inviteCode === adminInvite;
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
        uniqueCharsContacted: [],
        userType: getChipVal('auth-usertype', 'player'),
        gender: getChipVal('auth-gender', 'other'),
        chatPreference: getChipVal('auth-chatpref', 'both'),
        avatar: null
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

// ─── PASSWORD RECOVERY ───────────────────────────────────────────────────────
function handleRecovery() {
  const username = (el('recovery-username')?.value || '').trim();
  const newPass  = (el('recovery-newpass')?.value || '');
  const adminCode = (el('recovery-admincode')?.value || '').trim();

  if (!username) return toast('Digite seu nome de usuário.', 'error');
  if (!newPass || newPass.length < 4) return toast('Nova senha muito curta.', 'error');
  if (!adminCode) return toast('Código admin obrigatório.', 'error');

  if (adminCode !== cfg().adminCode) {
    toast('Código admin inválido. Peça ao administrador.', 'error');
    el('recovery-admincode').classList.add('shake');
    setTimeout(() => el('recovery-admincode')?.classList.remove('shake'), 500);
    return;
  }

  const users = DB.get('users', []);
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return toast('Usuário não encontrado.', 'error');

  user.password = newPass;
  DB.set('users', users);
  toast('Senha redefinida com sucesso! Faça login.', 'success', 3500);
  authMode = 'login';
  renderAuthScreen();
  // Pre-fill username
  setTimeout(() => { if (el('auth-username')) el('auth-username').value = username; }, 50);
}

// Admin reset (from admin panel)
function adminResetPassword(userId) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">🔑 Redefinir Senha</div>
      <div class="field">
        <label>Nova senha</label>
        <input type="text" class="input" id="admin-new-pass" placeholder="Nova senha (mín. 4 caracteres)">
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary flex-1" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn btn-primary flex-1" onclick="confirmAdminReset('${userId}', this)">Redefinir</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function confirmAdminReset(userId, btn) {
  const newPass = el('admin-new-pass').value.trim();
  if (!newPass || newPass.length < 4) return toast('Senha muito curta.', 'error');
  const users = DB.get('users', []);
  const user = users.find(u => u.id === userId);
  if (!user) return;
  user.password = newPass;
  DB.set('users', users);
  btn.closest('.modal-overlay').remove();
  toast(`Senha de "${user.username}" redefinida!`, 'success');
  renderAdminPanel();
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
  try {
    showScreen('screen-loading', false);
    checkAndCleanBans();
    checkDailyMission();
    await sleep(500);
    renderMainApp();
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
      <div style="padding:0 16px 8px"><div class="chip-group">${prefOptions}</div></div>
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
  if (user) { user.chatPreference = pref; DB.set('users', users); state.currentUser = user; }
  switchTab('chars');
}

function _renderCharsContent(pref) {
  const chars = DB.get('characters', []);
  const users = DB.get('users', []);

  // Apply gender filter to bots
  let bots = chars.filter(c => !c.isBanned);
  if (pref === 'female') bots = bots.filter(c => c.gender === 'female');
  else if (pref === 'male') bots = bots.filter(c => c.gender === 'male');

  const botsOnline = bots.filter(c => c.isOnline);
  const botsOffline = bots.filter(c => !c.isOnline);

  // Players who registered as "character" type
  const playerChars = users.filter(u =>
    u.id !== state.currentUser.id &&
    u.userType === 'character' &&
    !(u.bannedUntil && Date.now() < u.bannedUntil)
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
  if (gpPlayers) renderPlayerGrid(gpPlayers, filteredPlayers);
  if (playersSec) playersSec.style.display = pref === 'bots' ? 'none' : '';
}

const FALLBACK_SVG = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160" viewBox="0 0 120 160"><rect width="120" height="160" fill="%231f2133"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="40">👤</text></svg>`;

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
          <img src="${imgSrc}" alt="${c.name}" loading="lazy" onerror="this.src='${FALLBACK_SVG}'">
          ${statusDot}${banOverlay}
        </div>
        <div class="char-info">
          <div class="char-name">${c.name}</div>
          <div class="char-role">${c.role}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderPlayerGrid(container, players) {
  if (!container) return;
  if (!players.length) {
    container.innerHTML = '<div style="padding:16px;color:var(--text-3);font-size:.85rem;grid-column:1/-1">Nenhum jogador-personagem disponível</div>';
    return;
  }
  container.innerHTML = players.map(u => {
    const avatarSrc = u.avatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(u.username)}`;
    const genderIcon = u.gender === 'female' ? '♀' : u.gender === 'male' ? '♂' : '✦';
    return `
      <div class="char-card" onclick="openPlayerChat('${u.id}')">
        <div class="char-img-wrap">
          <img src="${avatarSrc}" alt="${u.username}" loading="lazy" onerror="this.src='${FALLBACK_SVG}'" style="object-fit:cover">
          <div class="char-status-dot bot"></div>
        </div>
        <div class="char-info">
          <div class="char-name">${escapeHtml(u.username)}</div>
          <div class="char-role">${genderIcon} Jogador</div>
        </div>
      </div>
    `;
  }).join('');
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
    botPersonality: `Sou ${targetUser.username}, um jogador. Respondo de forma casual e divertida.`
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

  // Get last user message for context
  const messages = DB.get('messages', {});
  const chatHistory = messages[state.currentChat.chatId] || [];
  const lastUserMsg = [...chatHistory].reverse().find(m => m.senderId === state.currentUser.id);
  const userText = lastUserMsg ? lastUserMsg.text : '';

  // Generate dynamic response based on personality + user message
  const responses = generateBotResponse(char, userText, chatHistory);

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
  const avatarSrc = user.avatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(user.username)}`;
  const genderLabel = user.gender === 'female' ? '♀ Mulher' : user.gender === 'male' ? '♂ Homem' : '✦ Outro';
  const typeLabel = user.userType === 'character' ? '🌟 Personagem' : '🎮 Jogador';
  const prefLabel = { both:'👥 Todos', bots:'🤖 Só Bots', female:'♀ Mulheres', male:'♂ Homens' }[user.chatPreference || 'both'];

  container.innerHTML = `
    <div class="profile-banner"></div>
    <div style="padding-bottom:calc(var(--nav-h) + 16px)">
      <div class="profile-avatar-wrap">
        <div class="profile-avatar" style="position:relative">
          <img id="profile-avatar-img" src="${avatarSrc}" alt="${user.username}">
          <button class="avatar-edit-btn" onclick="triggerAvatarUpload()" title="Editar foto">📷</button>
        </div>
        <input type="file" id="avatar-file-input" accept="image/*" style="display:none" onchange="handleAvatarUpload(this)">
      </div>
      <div class="profile-info">
        <div class="profile-username">${escapeHtml(user.username)} ${user.isAdmin ? '<span class="chip chip-red">ADMIN</span>' : ''}</div>
        <div class="profile-joined">Desde ${formatDate(user.joinDate)}</div>
        <div style="display:flex;gap:6px;justify-content:center;margin-top:6px;flex-wrap:wrap">
          <span class="chip">${typeLabel}</span>
          <span class="chip">${genderLabel}</span>
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
            <button class="btn btn-xs btn-secondary" onclick="adminResetPassword('${u.id}')" title="Redefinir senha">🔑</button>
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

    <!-- GITHUB SYNC -->
    <div class="admin-section">
      <div class="admin-section-header">🔗 Sincronização GitHub</div>
      <div class="admin-row" style="flex-direction:column;align-items:flex-start;gap:8px">
        <div class="admin-row-sub" style="line-height:1.5">
          Os dados são lidos do repositório <code style="background:rgba(255,255,255,.07);padding:2px 6px;border-radius:4px">emma_honkai_dados</code> ao iniciar o app.
          Para que o app também <strong>salve</strong> dados no repositório, configure um token do GitHub com permissão de escrita (<code style="background:rgba(255,255,255,.07);padding:2px 6px;border-radius:4px">Contents: write</code>).
        </div>
        <div style="display:flex;gap:8px;width:100%;align-items:center">
          <input type="password" class="input" id="gh-token-input" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            value="${ghToken() ? '•'.repeat(20) : ''}" style="flex:1" autocomplete="off">
          <button class="btn btn-primary btn-sm" onclick="saveGhToken()">Salvar Token</button>
          <button class="btn btn-secondary btn-sm" onclick="clearGhToken()">Remover</button>
        </div>
        <div id="gh-status" style="font-size:.75rem;color:var(--text-muted)">
          ${ghToken() ? '✅ Token configurado — dados serão enviados ao GitHub ao salvar' : '⚠️ Sem token — app só lê do GitHub, não escreve'}
        </div>
      </div>
      <div class="admin-row" style="justify-content:flex-end;gap:8px;margin-top:4px">
        <button class="btn btn-secondary btn-sm" onclick="manualGhPull()">⬇️ Puxar dados do GitHub agora</button>
        <button class="btn btn-secondary btn-sm" onclick="manualGhPush()">⬆️ Enviar dados ao GitHub agora</button>
      </div>
    </div>

    <div style="height:32px"></div>
  `;
}

function saveGhToken() {
  const val = el('gh-token-input').value.trim();
  if (!val || val.startsWith('•')) return toast('Cole um token válido.', 'error');
  ghSetToken(val);
  toast('Token salvo!', 'success');
  renderAdminPanel();
}

function clearGhToken() {
  localStorage.removeItem('emma_gh_token');
  toast('Token removido.', 'info');
  renderAdminPanel();
}

async function manualGhPull() {
  toast('Puxando dados do GitHub...', 'info');
  const n = await ghPull();
  if (n > 0) {
    toast(`${n} arquivo(s) sincronizados!`, 'success');
    renderAdminPanel();
  } else {
    toast('Nenhum dado recebido do GitHub.', 'error');
  }
}

async function manualGhPush() {
  if (!ghToken()) return toast('Configure um token GitHub primeiro.', 'error');
  toast('Enviando dados ao GitHub...', 'info');
  let ok = 0;
  for (const [key, file] of Object.entries(GH_FILES)) {
    const val = DB.get(key);
    if (val !== null) {
      const res = await ghPush(file, val);
      if (res) ok++;
    }
  }
  toast(ok > 0 ? `${ok} arquivo(s) enviados!` : 'Falha ao enviar. Verifique o token.', ok > 0 ? 'success' : 'error');
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
        <input class="input" id="cf-image" value="${char?.image||''}" placeholder="https://..." oninput="syncCharImgUrl(this)">
      </div>

      <div class="field"><label>Nome</label><input class="input" id="cf-name" value="${char?.name||''}"></div>
      <div class="field"><label>Função/Título</label><input class="input" id="cf-role" value="${char?.role||''}"></div>
      <div class="field">
        <label>Gênero</label>
        <div class="chip-group" id="cf-gender">
          <button type="button" class="chip-select ${char?.gender==='female'?'active':''}" data-val="female" onclick="selectChip(this,'cf-gender')">♀ Mulher</button>
          <button type="button" class="chip-select ${char?.gender==='male'?'active':''}" data-val="male" onclick="selectChip(this,'cf-gender')">♂ Homem</button>
          <button type="button" class="chip-select ${(!char?.gender||char?.gender==='other')?'active':''}" data-val="other" onclick="selectChip(this,'cf-gender')">✦ Outro</button>
        </div>
      </div>
      <div class="field"><label>Descrição</label><input class="input" id="cf-desc" value="${char?.description||''}"></div>
      <div class="field"><label>Personalidade do Bot</label><textarea class="input" id="cf-personality" style="min-height:80px">${char?.botPersonality||''}</textarea></div>
      <div class="modal-actions">
        <button class="btn btn-secondary flex-1" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn btn-primary flex-1" onclick="saveChar('${editId||''}', this)">Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function previewCharImg(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) return toast('Imagem muito grande! Máx 3MB.', 'error');
  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target.result;
    const preview = el('cf-img-preview');
    if (preview) preview.innerHTML = `<img src="${base64}" style="width:100%;height:100%;object-fit:cover;object-position:top" id="cf-img-thumb"><div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,.6);border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:.7rem" onclick="document.getElementById('cf-img-file').click()">✏️</div>`;
    const urlInput = el('cf-image');
    if (urlInput) urlInput.value = base64;
  };
  reader.readAsDataURL(file);
}

function syncCharImgUrl(input) {
  const url = input.value.trim();
  if (!url) return;
  const thumb = el('cf-img-thumb');
  if (thumb) thumb.src = url;
  else {
    const preview = el('cf-img-preview');
    if (preview) preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;object-position:top" id="cf-img-thumb"><div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,.6);border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:.7rem">✏️</div>`;
  }
}

function showEditCharModal(charId) { showAddCharModal(charId); }

function saveChar(editId, btn) {
  const overlay = btn.closest('.modal-overlay');
  const name = el('cf-name').value.trim();
  if (!name) return toast('Nome obrigatório.', 'error');

  const chars = DB.get('characters', []);
  const image = el('cf-image').value.trim();
  const gender = getChipVal('cf-gender', 'other');

  if (editId) {
    const char = chars.find(c => c.id === editId);
    if (char) {
      char.name = name;
      char.role = el('cf-role').value.trim();
      if (image) char.image = image;
      char.description = el('cf-desc').value.trim();
      char.botPersonality = el('cf-personality').value.trim();
      char.gender = gender;
    }
  } else {
    chars.push({
      id: 'c_' + Date.now(),
      name,
      role: el('cf-role').value.trim(),
      image: image || '',
      description: el('cf-desc').value.trim(),
      botPersonality: el('cf-personality').value.trim(),
      gender,
      isOnline: false,
      isBanned: false,
      banUntil: null,
      banReason: ''
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

// ─── AVATAR UPLOAD ───────────────────────────────────────────────────────────
function triggerAvatarUpload() {
  const inp = el('avatar-file-input');
  if (inp) inp.click();
}

function handleAvatarUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) return toast('Imagem muito grande! Máx 2MB.', 'error');
  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target.result;
    const users = DB.get('users', []);
    const user = users.find(u => u.id === state.currentUser.id);
    if (user) {
      user.avatar = base64;
      DB.set('users', users);
      state.currentUser = user;
      const img = el('profile-avatar-img');
      if (img) img.src = base64;
      toast('Foto atualizada!', 'success');
    }
  };
  reader.readAsDataURL(file);
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
    DB.set('users', users);
    state.currentUser = user;
  }
  overlay.remove();
  toast('Preferências salvas!', 'success');
  switchTab('profile');
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
  // Tenta sincronizar dados do GitHub antes de inicializar
  // (silent — continua mesmo se GitHub estiver offline)
  try {
    const loadingMsg = el('loading-status');
    if (loadingMsg) loadingMsg.textContent = 'Sincronizando dados...';
    await Promise.race([
      ghPull(),
      new Promise(r => setTimeout(r, 4000)) // timeout 4s
    ]);
  } catch {}

  initData();

  const userId = DB.get('current_user');
  const accessVerified = DB.get('access_verified');

  try {
    if (userId) {
      const users = DB.get('users', []);
      const user = users.find(u => u.id === userId);
      if (user) {
        if (user.bannedUntil && Date.now() < user.bannedUntil) {
          const days = Math.ceil((user.bannedUntil - Date.now()) / 86400000);
          DB.set('current_user', null);
          showScreen('screen-auth');
          renderAuthScreen();
          initAuth();
          setTimeout(() => showBanModal(user.banReason || 'Violação dos termos', days), 500);
          return;
        }
        state.currentUser = user;
        await startApp();
        return;
      }
    }
    // No session — go to gate or auth
    if (accessVerified) {
      showScreen('screen-auth');
      renderAuthScreen();
      initAuth();
    } else {
      showScreen('screen-gate');
      initGate();
    }
  } catch(e) {
    console.error('Boot error:', e);
    // Fallback: show gate
    showScreen('screen-gate');
    initGate();
  }
});
