// Projet A15 — Client App

const API = '/api';
const FETCH_TIMEOUT_MS = 60_000; // 60s timeout for all fetch calls

// ── State ──
let state = {
  sessionId: null,
  character: null,
  currentChoices: [],
  selectedArchetype: null,
  selectedPersonality: null,
  selectedGender: null,
  gameMode: 'normal',
  beats: [],
  gameCompleted: false,
  selectedBook: null,  // bookId string
  bookMeta: null,      // full meta.json from server
  availableBooks: [],  // list from GET /api/books
  glossary: [],        // { term, type, definition }[] from GET /api/books/:id/glossary
  glossaryRegex: null, // RegExp built from glossary terms
};

// ── Gender Adaptation (reads from bookMeta, with fallbacks) ──

function getArchetypeGenderName(archetypeId, gender) {
  const maps = state.bookMeta?.archetypeGenderMaps;
  if (maps?.[archetypeId]?.[gender]) return maps[archetypeId][gender];
  // Fallback to hardcoded map (backward compat)
  const fb = ARCHETYPE_GENDER_MAP_FALLBACK[archetypeId];
  if (fb?.[gender]) return fb[gender];
  return archetypeId;
}

function getPersonalityGenderName(personalityId, gender) {
  const maps = state.bookMeta?.personalityGenderMaps;
  if (maps?.[personalityId]?.[gender]) return maps[personalityId][gender];
  const fb = PERSONALITY_GENDER_MAP_FALLBACK[personalityId];
  if (fb?.[gender]) return fb[gender];
  return personalityId;
}

function getArchetypeDescription(archetypeId) {
  return state.bookMeta?.archetypeDescriptions?.[archetypeId]
    ?? ARCHETYPE_DESCRIPTIONS_FALLBACK[archetypeId]
    ?? '';
}

function getStatDisplayName(statKey) {
  return state.bookMeta?.statNames?.[statKey] ?? statKey.charAt(0).toUpperCase() + statKey.slice(1);
}

function getStatSubtitle(statKey) {
  return state.bookMeta?.statDescriptions?.[statKey]?.subtitle ?? '';
}

function getStatAxis(statKey) {
  return state.bookMeta?.statDescriptions?.[statKey]?.axis ?? '';
}

// DEPRECATED — kept for backward compat during transition, reads from bookMeta
const ARCHETYPE_GENDER_MAP_FALLBACK = {
  guerrier: {
    masculin: 'Le Guerrier',
    feminin:  'La Guerrière',
    neutre:   'Guerrier·ère',
  },
  griot: {
    masculin: 'Le Griot',
    feminin:  'La Griotte',
    neutre:   'Griot·te',
  },
  guerisseur: {
    masculin: 'Le Guérisseur',
    feminin:  'La Guérisseuse',
    neutre:   'Guérisseur·se',
  },
  explorateur: {
    masculin: "L'Explorateur",
    feminin:  "L'Exploratrice",
    neutre:   'Explorateur·rice',
  },
};

const PERSONALITY_GENDER_MAP_FALLBACK = {
  courageux:  { masculin: 'Courageux',  feminin: 'Courageuse',  neutre: 'Courageux·se' },
  prudent:    { masculin: 'Prudent',    feminin: 'Prudente',    neutre: 'Prudent·e' },
  curieux:    { masculin: 'Curieux',    feminin: 'Curieuse',    neutre: 'Curieux·se' },
  protecteur: { masculin: 'Protecteur', feminin: 'Protectrice', neutre: 'Protecteur·rice' },
  rebelle:    { masculin: 'Rebelle',    feminin: 'Rebelle',     neutre: 'Rebelle' },
  mystique:   { masculin: 'Mystique',   feminin: 'Mystique',    neutre: 'Mystique' },
};

const ARCHETYPE_DESCRIPTIONS_FALLBACK = {
  guerrier:    'Protecteur au courage inébranlable, premier rempart face au danger',
  griot:       'Voix vivante de la communauté, gardien des récits et des mémoires',
  guerisseur:  'Pont entre vivants et ancêtres, maître des plantes et des rituels',
  explorateur: 'Chercheur de vérité animé par une curiosité insatiable',
};

// ── Player Identity (for multiplayer readiness) ──
const PLAYER_ID_KEY = 'a15_player_id';
const PLAYER_NAME_KEY = 'a15_player_name';

function getPlayerId() {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

function getPlayerName() {
  return localStorage.getItem(PLAYER_NAME_KEY) || null;
}

function setPlayerName(name) {
  localStorage.setItem(PLAYER_NAME_KEY, name);
}

// ── Service Worker Registration ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(err => {
    console.warn('SW registration failed:', err);
  });
}

// ── DOM Elements ──
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Screens
const screenHub = $('#screen-hub');
const screenTitle = $('#screen-title');
const screenCreation = $('#screen-creation');
const screenGame = $('#screen-game');

// Loading overlay
const loadingOverlay = $('#loading-overlay');
const loadingOverlayTitle = $('#loading-overlay-title');
const loadingOverlaySub = $('#loading-overlay-sub');
const loadingProgressFill = $('#loading-progress-fill');
const loadingTip = $('#loading-tip');

// Creation
const charName = $('#char-name');
const archetypeList = $('#archetype-list');
const statTotal = $('#stat-total');
const btnCreate = $('#btn-create');
const sliders = {
  ubuntu: $('#stat-ubuntu'),
  maat: $('#stat-maat'),
  sankofa: $('#stat-sankofa'),
  biso: $('#stat-biso'),
};
const values = {
  ubuntu: $('#val-ubuntu'),
  maat: $('#val-maat'),
  sankofa: $('#val-sankofa'),
  biso: $('#val-biso'),
};

// Game
const chatMessages = $('#chat-messages');
const choicesArea = $('#choices-area');
const freeInputArea = $('#free-input-area');
const freeInput = $('#free-input');
const btnFreeSend = $('#btn-free-send');
const loading = $('#loading');
const loadingFlavor = $('#loading-flavor');
const diceOverlay = $('#dice-overlay');
const diceText = $('#dice-text');

// Sidebar
const sidebarName = $('#sidebar-name');
const sidebarArchetype = $('#sidebar-archetype');
const hpFill = $('#hp-fill');
const hpText = $('#hp-text');
const inventoryList = $('#inventory-list');
const relationshipsList = $('#relationships-list');

// ── Flavor Texts (defaults — overridden by per-book loadingMessages) ──
const LOADING_FLAVORS_DEFAULT = [
  'Le Ma\u00eetre du Jeu tisse son r\u00e9cit...',
  'Les esprits murmurent votre destin...',
  'Les anc\u00eatres observent vos choix...',
  'Le vent porte des pr\u00e9sages...',
  'Les tambours r\u00e9sonnent au loin...',
  'Le Voile entre les mondes fr\u00e9mit...',
  'Les \u00e9toiles s\'alignent...',
  'Un esprit trace votre chemin...',
];

const LOADING_TIPS_DEFAULT = [
  'Chaque valeur influence vos choix et le monde autour de vous',
  'Un jet critique peut changer le cours de votre histoire',
  'Les cons\u00e9quences de vos actes r\u00e9sonnent \u00e0 travers les beats',
  'Le monde se souvient de chaque d\u00e9cision',
  'Les PNJ r\u00e9agissent \u00e0 votre r\u00e9putation et vos choix pass\u00e9s',
  'Chaque valeur cardinale ouvre des chemins diff\u00e9rents',
  'Vos statistiques influencent les jets de d\u00e9s et les options disponibles',
  'Explorez librement \u2014 le moteur s\'adapte \u00e0 vos actions',
];

const OVERLAY_PHASES_DEFAULT = [
  { title: 'Pr\u00e9paration du monde...', sub: 'L\'univers prend forme', progress: 15 },
  { title: 'Les fils du destin se tissent...', sub: 'Votre histoire s\'\u00e9crit', progress: 35 },
  { title: 'Les personnages s\'\u00e9veillent...', sub: 'Le r\u00e9cit prend vie', progress: 55 },
  { title: 'Les chemins se dessinent...', sub: 'Le Ma\u00eetre du Jeu pr\u00e9pare votre aventure', progress: 75 },
  { title: 'Presque pr\u00eat...', sub: 'Tout est en place', progress: 90 },
];

// Dynamic accessors — read from bookMeta if available, fallback to defaults
function getLoadingFlavors() {
  return state.bookMeta?.loadingMessages?.flavors || LOADING_FLAVORS_DEFAULT;
}
function getLoadingTips() {
  return state.bookMeta?.loadingMessages?.tips || LOADING_TIPS_DEFAULT;
}
function getOverlayPhases() {
  return state.bookMeta?.loadingMessages?.overlayPhases || OVERLAY_PHASES_DEFAULT;
}

// ── Toast Notification System ──
function showToast(message, type = 'info', duration = 2500) {
  let container = $('#toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

// ── Fetch with timeout ──
function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// ── Init ──
async function init() {
  // Load the list of available books for the hub
  await loadAvailableBooks();
  renderHubBookGrid();
  setupHubScreen();
  setupTitleScreen();
  setupStatSliders();
  setupPersonalitySelector();
  setupGameModeSelector();
  setupGenderSelector();
  setupCreation();
  setupSaveSystem();
  setupContextPanel();
  setupEndScreen();
  setupChangelog();
  setupScrollToBottom();
  setupBackButton();
  setupArchivesSystem();
  setupGeneratorModal();
  setupGlossaryTooltips();
  setupMobileSidebar();
  document.title = 'Projet A15';
}

// ── Glossary Tooltips ──
function setupGlossaryTooltips() {
  let activeTooltip = null;
  let hoverTimer = null;
  let touchTimer = null;

  function showTooltipAt(term, rect) {
    hideTooltip();
    const entry = state.glossary.find(g => g.term.toLowerCase() === term.toLowerCase());
    if (!entry) return;

    const tip = document.createElement('div');
    tip.className = 'glossary-tooltip';
    const typeLabel = entry.type === 'npc' ? 'PNJ' : entry.type === 'location' ? 'Lieu' : 'Lore';
    tip.innerHTML = `<span class="glossary-tooltip-type">${typeLabel}</span><strong>${entry.term}</strong><p>${entry.definition}</p>`;
    document.body.appendChild(tip);
    activeTooltip = tip;

    // Position: prefer above, fallback below
    const tipRect = tip.getBoundingClientRect();
    let top = rect.top - tipRect.height - 8 + window.scrollY;
    let left = rect.left + (rect.width / 2) - (tipRect.width / 2) + window.scrollX;

    // If above would go off screen, show below
    if (top < window.scrollY) {
      top = rect.bottom + 8 + window.scrollY;
    }
    // Clamp horizontal
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));

    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
    tip.classList.add('visible');
  }

  function hideTooltip() {
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
    }
    clearTimeout(hoverTimer);
    clearTimeout(touchTimer);
  }

  // Desktop: mouse events via event delegation on chat messages
  const chatArea = document.getElementById('chat-messages');
  if (!chatArea) return;

  chatArea.addEventListener('mouseenter', (e) => {
    if (e.target.classList?.contains('glossary-term')) {
      const el = e.target;
      hoverTimer = setTimeout(() => {
        showTooltipAt(el.dataset.term || el.textContent, el.getBoundingClientRect());
      }, 300);
    }
  }, true);

  chatArea.addEventListener('mouseleave', (e) => {
    if (e.target.classList?.contains('glossary-term')) {
      hideTooltip();
    }
  }, true);

  // Mobile: long press
  chatArea.addEventListener('touchstart', (e) => {
    if (e.target.classList?.contains('glossary-term')) {
      const el = e.target;
      const startX = e.touches[0].clientX;
      const startY = e.touches[0].clientY;

      touchTimer = setTimeout(() => {
        showTooltipAt(el.dataset.term || el.textContent, el.getBoundingClientRect());
      }, 500);

      const cancelOnMove = (ev) => {
        const dx = Math.abs(ev.touches[0].clientX - startX);
        const dy = Math.abs(ev.touches[0].clientY - startY);
        if (dx > 10 || dy > 10) {
          clearTimeout(touchTimer);
          chatArea.removeEventListener('touchmove', cancelOnMove);
        }
      };
      chatArea.addEventListener('touchmove', cancelOnMove, { passive: true });
    }
  }, { passive: true });

  chatArea.addEventListener('touchend', () => {
    clearTimeout(touchTimer);
    // Hide tooltip after a delay on mobile so user can read it
    setTimeout(hideTooltip, 2000);
  }, { passive: true });

  // Click anywhere else hides tooltip
  document.addEventListener('click', (e) => {
    if (activeTooltip && !e.target.classList?.contains('glossary-term')) {
      hideTooltip();
    }
  });
}

// ── Title Screen ──
function setupTitleScreen() {
  // "Nouvelle Partie" — always goes to character creation
  const btnEnter = $('#btn-enter');
  btnEnter.addEventListener('click', () => {
    // If there's an active game in memory, confirm before discarding
    if (state.sessionId && !state.gameCompleted) {
      if (!confirm('Une partie est en cours. Voulez-vous commencer une nouvelle aventure ? (La partie en cours sera perdue si elle n\'a pas été sauvegardée)')) {
        return;
      }
      // Clear active game
      clearActiveGame();
      state.sessionId = null;
      state.character = null;
      state.gameCompleted = false;
      state.currentChoices = [];
      chatMessages.innerHTML = '';
      choicesArea.innerHTML = '';
    }
    switchScreen(screenTitle, screenCreation);
  });

  // "Reprendre la partie" — go straight back to the game screen
  const btnResume = $('#btn-resume-game');
  btnResume.addEventListener('click', () => {
    resumeGame();
  });

  // "Menu Principal" button in sidebar
  const btnMenu = $('#btn-menu-principal');
  if (btnMenu) {
    btnMenu.addEventListener('click', () => {
      suspendGame();
    });
  }
}

function switchScreen(from, to) {
  from.classList.add('screen-exit');
  setTimeout(() => {
    from.classList.remove('active', 'screen-exit');
    to.classList.add('active', 'screen-enter');
    setTimeout(() => {
      to.classList.remove('screen-enter');
    }, 500);
  }, 450);
}

// ── Suspend / Resume Game ──

/** Suspend the current game and return to title screen */
function suspendGame() {
  if (!state.sessionId) return;

  // Auto-save the active game reference in localStorage
  saveActiveGame();

  // Close context panel if open
  const ctxPanel = $('#context-panel');
  if (ctxPanel && !ctxPanel.classList.contains('panel-closed')) {
    ctxPanel.classList.add('panel-closed');
  }

  // Switch from game screen to title screen
  switchScreen(screenGame, screenTitle);

  // Update title screen to show "Reprendre" button
  updateTitleScreenForActiveGame();
}

/** Resume a game that's currently in memory (no server call needed) */
function resumeGame() {
  if (!state.sessionId || !state.character) {
    // No game in memory — can't resume
    return;
  }

  // Go directly back to game screen — the state (chat, sidebar, etc.) is still alive in the DOM
  switchScreen(screenTitle, screenGame);
}

/** Update the title screen buttons to reflect the current game state */
function updateTitleScreenForActiveGame() {
  const btnResume = $('#btn-resume-game');
  const btnResumeSub = $('#btn-resume-sub');
  const btnEnter = $('#btn-enter');

  // If there's an active game in memory (not completed)
  if (state.sessionId && !state.gameCompleted) {
    btnResume.classList.remove('hidden');
    const charName = state.character?.name || '';
    btnResumeSub.textContent = charName ? `— ${charName}` : '';

    // Make "Nouvelle Partie" smaller/secondary since there's an active game
    btnEnter.classList.add('btn-enter-secondary');
  } else {
    btnResume.classList.add('hidden');
    btnResumeSub.textContent = '';
    btnEnter.classList.remove('btn-enter-secondary');
  }
}

// ── Loading Overlay ──
let overlayPhaseInterval = null;
let overlayTipInterval = null;

function showLoadingOverlay(title, sub) {
  const phases = getOverlayPhases();
  const tips = getLoadingTips();
  loadingOverlayTitle.textContent = title || phases[0].title;
  loadingOverlaySub.textContent = sub || phases[0].sub;
  loadingProgressFill.style.width = '5%';
  loadingTip.textContent = tips[Math.floor(Math.random() * tips.length)];
  loadingOverlay.classList.remove('hidden', 'fade-out');

  let phaseIndex = 0;
  overlayPhaseInterval = setInterval(() => {
    phaseIndex++;
    if (phaseIndex < phases.length) {
      const phase = phases[phaseIndex];
      loadingOverlayTitle.textContent = phase.title;
      loadingOverlaySub.textContent = phase.sub;
      loadingProgressFill.style.width = phase.progress + '%';
    }
  }, 4000);

  overlayTipInterval = setInterval(() => {
    loadingTip.style.opacity = '0';
    setTimeout(() => {
      loadingTip.textContent = tips[Math.floor(Math.random() * tips.length)];
      loadingTip.style.opacity = '1';
    }, 300);
  }, 6000);
}

function hideLoadingOverlay() {
  clearInterval(overlayPhaseInterval);
  clearInterval(overlayTipInterval);
  overlayPhaseInterval = null;
  overlayTipInterval = null;

  loadingProgressFill.style.width = '100%';
  const bookName = state.bookMeta?.name || 'votre aventure';
  loadingOverlayTitle.textContent = `Bienvenue dans ${bookName}`;
  loadingOverlaySub.textContent = 'Votre aventure commence...';

  setTimeout(() => {
    loadingOverlay.classList.add('fade-out');
    setTimeout(() => {
      loadingOverlay.classList.add('hidden');
      loadingOverlay.classList.remove('fade-out');
    }, 600);
  }, 800);
}

// ── In-game Loading ──
let flavorInterval = null;

function showInGameLoading() {
  const flavors = getLoadingFlavors();
  loading.classList.remove('hidden');
  loadingFlavor.textContent = flavors[Math.floor(Math.random() * flavors.length)];

  flavorInterval = setInterval(() => {
    loadingFlavor.style.opacity = '0';
    setTimeout(() => {
      loadingFlavor.textContent = flavors[Math.floor(Math.random() * flavors.length)];
      loadingFlavor.style.opacity = '1';
    }, 300);
  }, 3500);
}

function hideInGameLoading() {
  clearInterval(flavorInterval);
  flavorInterval = null;
  loading.classList.add('hidden');
}

// ══════════════════════════════════════════
// ── Book Selection System ──
// ══════════════════════════════════════════

const SELECTED_BOOK_STORAGE_KEY = 'kinchat_selected_book';

async function loadAvailableBooks() {
  try {
    const res = await fetchWithTimeout(`${API}/books`);
    const data = await res.json();
    state.availableBooks = data.books || [];
  } catch (err) {
    console.error('Failed to load books:', err);
    state.availableBooks = [];
  }
}

async function selectBook(bookId) {
  try {
    const res = await fetchWithTimeout(`${API}/books/${bookId}/meta`);
    if (!res.ok) throw new Error(`Book ${bookId} not found`);
    const meta = await res.json();
    state.selectedBook = bookId;
    state.bookMeta = meta;
    localStorage.setItem(SELECTED_BOOK_STORAGE_KEY, bookId);
    applyBookToUI(meta);
    // Load glossary for tooltips (non-blocking)
    loadGlossary(bookId);
  } catch (err) {
    console.error(`Failed to load book meta for ${bookId}:`, err);
    // Minimal fallback
    state.selectedBook = bookId;
  }
}

async function loadGlossary(bookId) {
  try {
    const res = await fetchWithTimeout(`${API}/books/${bookId}/glossary`);
    if (!res.ok) return;
    const data = await res.json();
    state.glossary = data.glossary || [];
    // Build a regex from all terms, sorted by length desc (match longest first)
    const terms = state.glossary
      .map(g => g.term)
      .filter(t => t.length >= 3)
      .sort((a, b) => b.length - a.length)
      .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (terms.length > 0) {
      state.glossaryRegex = new RegExp(`\\b(${terms.join('|')})\\b`, 'gi');
    } else {
      state.glossaryRegex = null;
    }
  } catch (err) {
    console.warn('Failed to load glossary:', err);
    state.glossary = [];
    state.glossaryRegex = null;
  }
}

function applyBookToUI(meta) {
  // Update splash screen title/subtitle/tagline
  const splashTitle = $('.splash-title');
  const splashSubtitle = $('.splash-subtitle-main');
  const splashTagline = $('.splash-tagline');

  if (splashTitle) splashTitle.textContent = meta.name || 'Projet A15';
  if (splashSubtitle) splashSubtitle.textContent = meta.subtitle || '';
  if (splashTagline) splashTagline.textContent = meta.tagline || '';

  // Update creation screen title/subtitle (they're dynamic now)
  const creationTitle = $('#creation-title');
  const creationSubtitle = $('#creation-subtitle');
  if (creationTitle) creationTitle.textContent = meta.name + (meta.subtitle ? ' ' + meta.subtitle : '');
  if (creationSubtitle) creationSubtitle.textContent = meta.tagline || meta.description || '';

  // Update document title
  document.title = meta.name ? `${meta.name} — Projet A15` : 'Projet A15';

  // Update splash stat values
  const statKeys = ['ubuntu', 'maat', 'sankofa', 'biso'];
  for (const stat of statKeys) {
    const el = $(`.splash-value[data-stat="${stat}"]`);
    if (el) {
      const name = meta.statNames?.[stat] ?? stat.charAt(0).toUpperCase() + stat.slice(1);
      const subtitle = meta.statDescriptions?.[stat]?.subtitle ?? '';
      el.innerHTML = `<strong>${name}</strong>${subtitle ? `<small>${subtitle}</small>` : ''}`;
    }
  }

  // Update stat names everywhere: sidebar stat-cards, creation stat-cards, slider labels
  for (const stat of statKeys) {
    const name = meta.statNames?.[stat] ?? stat.charAt(0).toUpperCase() + stat.slice(1);
    const sub = meta.statDescriptions?.[stat]?.subtitle ?? '';
    const axis = meta.statDescriptions?.[stat]?.axis ?? '';

    // All stat-card .stat-name (sidebar + creation)
    const nameEls = $$(`.stat-card[data-stat="${stat}"] .stat-name`);
    nameEls.forEach(el => { el.textContent = name; });

    // All stat-card .stat-subtitle (sidebar)
    const subEls = $$(`.stat-card[data-stat="${stat}"] .stat-subtitle`);
    subEls.forEach(el => { el.textContent = sub; });

    // Update stat-label (slider labels in creation) — find via sibling input id
    const slider = $(`#stat-${stat}`);
    if (slider) {
      const sliderLabel = slider.closest('.stat-row')?.querySelector('.stat-label');
      if (sliderLabel) {
        sliderLabel.innerHTML = `<strong>${name}</strong> <small>${sub}${axis ? ' \u2014 ' + axis : ''}</small>`;
      }
    }
  }

  // Load theme CSS if specified
  const themeLink = $('[data-theme-css]');
  if (themeLink && meta.theme?.cssFile) {
    themeLink.href = meta.theme.cssFile;
  } else if (themeLink && !meta.theme?.cssFile) {
    // Default theme based on book id
    themeLink.href = `/styles/theme-${meta.id || 'kinara'}.css`;
  }

  // Update spirit core symbol if book has iconSymbol
  const spiritCore = $('.spirit-core');
  if (spiritCore && meta.iconSymbol) {
    spiritCore.textContent = meta.iconSymbol;
  }
}

// renderBookSelector() — REMOVED in v0.9.0, replaced by hub grid

// ══════════════════════════════════════════
// ── Hub Screen (Projet A15) ──
// ══════════════════════════════════════════

function setupHubScreen() {
  // Changelog button in hub footer
  const btnChangelog = $('#btn-hub-changelog');
  if (btnChangelog) {
    btnChangelog.addEventListener('click', () => {
      const body = $('#changelog-body');
      const panel = $('#changelog-panel');
      if (body && panel) {
        renderChangelog(body);
        panel.classList.toggle('hidden');
      }
    });
  }

  // "Back to hub" button on splash/title screen
  const btnBackHub = $('#btn-back-hub');
  if (btnBackHub) {
    btnBackHub.addEventListener('click', () => {
      document.title = 'Projet A15';
      switchScreen(screenTitle, screenHub);
    });
  }
}

function renderHubBookGrid() {
  const grid = $('#hub-book-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (const book of state.availableBooks) {
    const card = document.createElement('div');
    card.className = 'hub-book-card';

    const icon = book.iconSymbol || '\uD83D\uDCD6';
    const tags = (book.tags || []).map(t => `<span class="hub-card-tag">${t}</span>`).join('');

    card.innerHTML = `
      <div class="hub-card-top">
        <div class="hub-card-icon">${icon}</div>
        <div class="hub-card-info">
          <div class="hub-card-name">${book.name}</div>
          ${book.subtitle ? `<div class="hub-card-subtitle">${book.subtitle}</div>` : ''}
          <div class="hub-card-desc">${book.description || ''}</div>
          ${tags ? `<div class="hub-card-tags">${tags}</div>` : ''}
        </div>
      </div>
      <div class="hub-card-actions">
        <button class="hub-btn-play" data-book-id="${book.id}">Jouer <span class="play-arrow">\u2192</span></button>
        <button class="hub-btn-download" data-book-id="${book.id}" title="T\u00e9l\u00e9charger">\u2B07</button>
        <button class="hub-btn-archives" data-book-id="${book.id}">Archives</button>
      </div>
    `;

    card.querySelector('.hub-btn-play').addEventListener('click', () => enterBook(book.id));
    card.querySelector('.hub-btn-download').addEventListener('click', () => downloadBook(book.id));
    card.querySelector('.hub-btn-archives').addEventListener('click', () => showArchivesModal(book.id));
    grid.appendChild(card);
  }

  // "Import book" card
  const importCard = document.createElement('div');
  importCard.className = 'hub-create-card';
  importCard.innerHTML = `
    <div class="hub-create-icon">\u2B06</div>
    <div class="hub-create-text">Importer un livre</div>
    <div class="hub-create-sub">Fichier .zip</div>
  `;
  importCard.addEventListener('click', () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.zip';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        uploadBook(fileInput.files[0]);
      }
      fileInput.remove();
    });
    document.body.appendChild(fileInput);
    fileInput.click();
  });
  grid.appendChild(importCard);

  // "Create new book" card
  const createCard = document.createElement('div');
  createCard.className = 'hub-create-card';
  createCard.innerHTML = `
    <div class="hub-create-icon">+</div>
    <div class="hub-create-text">Cr\u00e9er un nouveau livre</div>
    <div class="hub-create-sub">G\u00e9n\u00e9ration assist\u00e9e par IA</div>
  `;
  createCard.addEventListener('click', openGeneratorModal);
  grid.appendChild(createCard);
}

async function enterBook(bookId) {
  await selectBook(bookId);
  await loadArchetypes();
  updateTitleScreenForActiveGame();
  checkExistingSaves();
  checkCompletedGames();
  switchScreen(screenHub, screenTitle);
}

// ── Book Download/Upload ──

function downloadBook(bookId) {
  // Direct download via hidden link
  const link = document.createElement('a');
  link.href = `${API}/books/${bookId}/download`;
  link.download = `${bookId}.zip`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast('T\u00e9l\u00e9chargement lanc\u00e9...', 'info');
}

async function uploadBook(file) {
  showToast('Import en cours...', 'info');

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${API}/books/upload`, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();

    if (res.ok) {
      showToast(`Livre "${data.bookId}" import\u00e9 avec succ\u00e8s !`, 'success');
      if (data.warnings && data.warnings.length > 0) {
        console.warn('Avertissements:', data.warnings);
      }
      // Refresh the book list
      await fetchAvailableBooks();
      renderHubBookGrid();
    } else if (res.status === 422) {
      // Validation errors
      const errorList = (data.errors || []).join('\n\u2022 ');
      showToast(`Structure invalide:\n\u2022 ${errorList}`, 'error');
    } else if (res.status === 409) {
      showToast(data.error || 'Un livre avec cet ID existe d\u00e9j\u00e0', 'error');
    } else {
      showToast(data.error || 'Erreur lors de l\'import', 'error');
    }
  } catch (err) {
    showToast(`Erreur r\u00e9seau: ${err.message}`, 'error');
  }
}

// ══════════════════════════════════════════
// ── Book Generator Modal ──
// ══════════════════════════════════════════

function setupGeneratorModal() {
  const btnClose = $('#btn-generator-close');
  if (btnClose) {
    btnClose.addEventListener('click', closeGeneratorModal);
  }

  const btnGenerate = $('#btn-generate');
  if (btnGenerate) {
    btnGenerate.addEventListener('click', submitBookGeneration);
  }

  // Backdrop click to close (only when on the form view, not during generation)
  const modal = $('#generator-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        // Only close if form is visible (not during generation)
        const form = $('#generator-form');
        if (form && !form.classList.contains('hidden')) {
          closeGeneratorModal();
        }
      }
    });
  }

  // "Done" button — return to hub
  const btnDone = $('#btn-generator-done');
  if (btnDone) {
    btnDone.addEventListener('click', () => {
      closeGeneratorModal();
    });
  }

  // "Retry" button — go back to form
  const btnRetry = $('#btn-generator-retry');
  if (btnRetry) {
    btnRetry.addEventListener('click', () => {
      resetGeneratorToForm();
    });
  }
}

function openGeneratorModal() {
  const modal = $('#generator-modal');
  if (modal) {
    modal.classList.remove('hidden');
    resetGeneratorToForm();
  }
}

function resetGeneratorToForm() {
  const form = $('#generator-form');
  const progress = $('#generator-progress');
  const doneEl = $('#generator-done');
  const errorEl = $('#generator-error');
  if (form) form.classList.remove('hidden');
  if (progress) progress.classList.add('hidden');
  if (doneEl) doneEl.classList.add('hidden');
  if (errorEl) errorEl.classList.add('hidden');
  // Reset step states
  $$('.gen-step').forEach(s => {
    s.classList.remove('active', 'done', 'error');
    const icon = s.querySelector('.gen-step-icon');
    if (icon) icon.textContent = '\u25CB'; // circle
  });
  const fill = $('#generator-progress-fill');
  if (fill) fill.style.width = '0%';
  const statusEl = $('#generator-status');
  if (statusEl) statusEl.textContent = '';
}

function closeGeneratorModal() {
  const modal = $('#generator-modal');
  if (modal) modal.classList.add('hidden');
}

async function submitBookGeneration() {
  const nameEl = $('#gen-name');
  const descEl = $('#gen-description');
  const toneEl = $('#gen-tone');
  const langEl = $('#gen-language');

  const name = nameEl?.value?.trim();
  const description = descEl?.value?.trim();
  const tone = toneEl?.value || 'epique';
  const language = langEl?.value || 'fr';

  if (!name) { showToast('Veuillez entrer un nom de livre', 'error'); return; }
  if (!description || description.length < 20) {
    showToast('La description doit contenir au moins 20 caract\u00e8res', 'error');
    return;
  }

  // Switch to progress view
  const form = $('#generator-form');
  const progress = $('#generator-progress');
  const doneEl = $('#generator-done');
  const errorEl = $('#generator-error');
  if (form) form.classList.add('hidden');
  if (progress) progress.classList.remove('hidden');
  if (doneEl) doneEl.classList.add('hidden');
  if (errorEl) errorEl.classList.add('hidden');

  const statusEl = $('#generator-status');
  if (statusEl) statusEl.textContent = 'Pr\u00e9paration...';

  // Step mapping — must match server step IDs
  const STEPS = ['meta', 'archetypes', 'npcs', 'beats_1_8', 'beats_9_15', 'lore'];

  function updateStep(stepName, stepState) {
    const stepEl = $(`.gen-step[data-step="${stepName}"]`);
    if (!stepEl) return;
    stepEl.classList.remove('active', 'done', 'error');
    const icon = stepEl.querySelector('.gen-step-icon');
    if (stepState === 'active') {
      stepEl.classList.add('active');
      if (icon) icon.textContent = '\u27F3'; // spinning arrow
    } else if (stepState === 'done') {
      stepEl.classList.add('done');
      if (icon) icon.textContent = '\u2713'; // checkmark
    } else if (stepState === 'error') {
      stepEl.classList.add('error');
      if (icon) icon.textContent = '\u2717'; // cross
    }
  }

  try {
    const response = await fetch(`${API}/books/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, tone, language }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: 'Erreur serveur' }));
      throw new Error(errData.error || `Erreur ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let generatedBookId = null;
    let currentEvent = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ') && currentEvent) {
          try {
            const data = JSON.parse(line.slice(6));

            if (currentEvent === 'progress') {
              // Mark current step active, mark previous ones done
              const stepIdx = STEPS.indexOf(data.step);
              if (stepIdx >= 0) {
                for (let i = 0; i < STEPS.length; i++) {
                  if (i < stepIdx) updateStep(STEPS[i], 'done');
                  else if (i === stepIdx) updateStep(STEPS[i], 'active');
                }
              }
              const fill = $('#generator-progress-fill');
              if (fill) fill.style.width = (data.percent || 0) + '%';
              if (statusEl) statusEl.textContent = data.message || 'En cours...';
            } else if (currentEvent === 'done') {
              generatedBookId = data.bookId;
              // Mark all steps done
              STEPS.forEach(s => updateStep(s, 'done'));
              const fill = $('#generator-progress-fill');
              if (fill) fill.style.width = '100%';
              if (statusEl) statusEl.textContent = '';
            } else if (currentEvent === 'error') {
              throw new Error(data.error || 'Erreur de g\u00e9n\u00e9ration');
            }
          } catch (parseErr) {
            if (parseErr.message.includes('Erreur')) throw parseErr;
            console.warn('SSE parse error:', parseErr);
          }
          currentEvent = null;
        } else if (line === '') {
          currentEvent = null;
        }
      }
    }

    if (generatedBookId) {
      // Show done view
      if (doneEl) doneEl.classList.remove('hidden');
      const doneText = $('#generator-done-text');
      if (doneText) doneText.textContent = `${name} cr\u00e9\u00e9 !`;

      // Reload books and re-render hub in background
      await loadAvailableBooks();
      renderHubBookGrid();
    }

  } catch (err) {
    console.error('Book generation failed:', err);
    // Show error view
    if (errorEl) {
      errorEl.classList.remove('hidden');
      const errText = $('#generator-error-text');
      if (errText) errText.textContent = err.message;
    }
    if (statusEl) statusEl.textContent = '';
    // Mark current active step as error
    const activeStep = $('.gen-step.active');
    if (activeStep) {
      activeStep.classList.remove('active');
      activeStep.classList.add('error');
      const icon = activeStep.querySelector('.gen-step-icon');
      if (icon) icon.textContent = '\u2717';
    }
  }
}

// ── Archetype Loading ──
async function loadArchetypes() {
  try {
    const res = await fetchWithTimeout(`${API}/game/archetypes?bookId=${state.selectedBook || 'kinara'}`);
    const archetypes = await res.json();
    renderArchetypes(archetypes);
  } catch (err) {
    console.error('Failed to load archetypes:', err);
  }
}

function renderArchetypes(archetypes) {
  archetypeList.innerHTML = '';
  const gender = state.selectedGender || 'masculin';
  for (const arch of archetypes) {
    const card = document.createElement('div');
    card.className = 'archetype-card';
    card.dataset.id = arch.id;
    const genderedName = getArchetypeGenderName(arch.id, gender) || arch.name;
    const conceptDesc = getArchetypeDescription(arch.id);
    card.innerHTML = `<h3>${genderedName}</h3><p class="archetype-concept">${conceptDesc}</p>`;
    card.addEventListener('click', () => selectArchetype(arch));
    archetypeList.appendChild(card);
  }
}

function selectArchetype(arch) {
  state.selectedArchetype = arch;
  $$('.archetype-card').forEach(c => c.classList.remove('selected'));
  $(`.archetype-card[data-id="${arch.id}"]`)?.classList.add('selected');

  if (arch.suggestedStats) {
    for (const [stat, val] of Object.entries(arch.suggestedStats)) {
      sliders[stat].value = val;
      values[stat].textContent = val;
    }
    updateStatTotal();
  }
  validateCreation();
}

// ── Stat Sliders ──
function setupStatSliders() {
  for (const [stat, slider] of Object.entries(sliders)) {
    slider.addEventListener('input', () => {
      values[stat].textContent = slider.value;
      updateStatTotal();
      validateCreation();
    });
  }
}

function updateStatTotal() {
  const total = Object.values(sliders).reduce((sum, s) => sum + parseInt(s.value), 0);
  statTotal.textContent = `(${total}/20)`;
  statTotal.className = total === 20 ? 'valid' : 'invalid';
}

// ── Personality Selector ──
function setupPersonalitySelector() {
  const cards = $$('.personality-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      cards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.selectedPersonality = card.dataset.personality;
      validateCreation();
    });
  });
}

// ── Game Mode Selector ──
function setupGameModeSelector() {
  const buttons = $$('.mode-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.gameMode = btn.dataset.mode;
    });
  });
}

// ── Gender Selector ──
function setupGenderSelector() {
  const buttons = $$('.gender-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.selectedGender = btn.dataset.gender;
      applyGenderToArchetypes();
      applyGenderToPersonalities();
      validateCreation();
    });
  });
}

function applyGenderToArchetypes() {
  const gender = state.selectedGender || 'masculin';
  const cards = $$('.archetype-card');
  cards.forEach(card => {
    const id = card.dataset.id;
    const genderedName = getArchetypeGenderName(id, gender);
    if (genderedName) {
      const h3 = card.querySelector('h3');
      if (h3) h3.textContent = genderedName;
    }
  });
}

function applyGenderToPersonalities() {
  const gender = state.selectedGender || 'masculin';
  const cards = $$('.personality-card');
  cards.forEach(card => {
    const id = card.dataset.personality;
    const genderedName = getPersonalityGenderName(id, gender);
    if (genderedName) {
      const nameEl = card.querySelector('.personality-name');
      if (nameEl) nameEl.textContent = genderedName;
    }
  });
}

function validateCreation() {
  const total = Object.values(sliders).reduce((sum, s) => sum + parseInt(s.value), 0);
  const hasName = charName.value.trim().length > 0;
  const hasArchetype = state.selectedArchetype !== null;
  const hasPersonality = state.selectedPersonality !== null;
  const hasGender = state.selectedGender !== null;
  const validStats = total === 20;
  btnCreate.disabled = !(hasName && hasArchetype && hasPersonality && hasGender && validStats);
}

function setupCreation() {
  charName.addEventListener('input', validateCreation);
  btnCreate.addEventListener('click', startGame);
}

// ── Start Game ──
async function startGame() {
  btnCreate.disabled = true;
  btnCreate.textContent = 'Création en cours...';

  const stats = {};
  for (const [stat, slider] of Object.entries(sliders)) {
    stats[stat] = parseInt(slider.value);
  }

  showLoadingOverlay();

  try {
    const charRes = await fetchWithTimeout(`${API}/game/character`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: charName.value.trim(),
        archetypeId: state.selectedArchetype.id,
        personality: state.selectedPersonality,
        gender: state.selectedGender || 'masculin',
        stats,
        bookId: state.selectedBook || 'kinara',
      }),
    });
    const character = await charRes.json();
    if (charRes.status !== 200) throw new Error(character.error);

    state.character = character;

    const gameRes = await fetchWithTimeout(`${API}/game/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterId: character.id, gameMode: state.gameMode, bookId: state.selectedBook || 'kinara' }),
    });
    const gameData = await gameRes.json();
    if (gameRes.status !== 200) throw new Error(gameData.error);

    state.sessionId = gameData.sessionId;
    state.character = gameData.character;

    // Persist active game to localStorage
    saveActiveGame();
    updateTitleScreenForActiveGame();

    // Switch to game screen (behind overlay)
    screenCreation.classList.remove('active');
    screenGame.classList.add('active');
    updateSidebar();

    await loadBeats();

    if (gameData.output) {
      displayTurnOutput(gameData.output);
    }

    hideLoadingOverlay();

  } catch (err) {
    console.error('Failed to start game:', err);
    hideLoadingOverlay();
    alert('Erreur: ' + (err.name === 'AbortError' ? 'Timeout — le serveur met trop de temps à répondre' : err.message));
    btnCreate.disabled = false;
    btnCreate.textContent = 'Commencer l\'aventure';
  }
}

// ── Game Screen ──
async function loadBeats() {
  try {
    const res = await fetchWithTimeout(`${API}/game/${state.sessionId}/beats`);
    state.beats = await res.json();
    renderBeatTracker();
  } catch (err) {
    console.error('Failed to load beats:', err);
  }
}

// ── Beat Tracker ──
function renderBeatTracker() {
  const tracker = $('#beat-tracker');
  const contextBtn = tracker.querySelector('.btn-context-toggle');
  tracker.innerHTML = '';

  // Turn counter label
  const turnLabel = document.createElement('span');
  turnLabel.id = 'turn-counter';
  turnLabel.className = 'turn-counter';
  turnLabel.textContent = '';
  tracker.appendChild(turnLabel);

  for (let i = 0; i < state.beats.length; i++) {
    const beat = state.beats[i];
    const dot = document.createElement('div');
    dot.className = 'beat-dot';
    dot.dataset.name = beat.name;
    tracker.appendChild(dot);

    if (i < state.beats.length - 1) {
      const connector = document.createElement('div');
      connector.className = 'beat-connector';
      tracker.appendChild(connector);
    }
  }

  if (contextBtn) {
    tracker.appendChild(contextBtn);
  }

  // Single API call to get current beat & turn
  fetchWithTimeout(`${API}/game/${state.sessionId}`).then(r => r.json()).then(data => {
    const currentBeat = data.session?.currentBeat ?? 1;
    updateBeatDots(currentBeat);
    updateTurnCounter(data.session?.turnCount ?? 0, currentBeat);
  }).catch(() => {
    updateBeatDots(1);
  });
}

function updateTurnCounter(turnCount, currentBeat) {
  const el = $('#turn-counter');
  if (el) el.textContent = `T${turnCount}`;
}

function updateBeatDots(currentBeat) {
  const dots = $$('.beat-dot');
  const connectors = $$('.beat-connector');

  dots.forEach((dot, i) => {
    dot.classList.remove('completed', 'current');
    if (i + 1 < currentBeat) dot.classList.add('completed');
    if (i + 1 === currentBeat) dot.classList.add('current');
  });

  connectors.forEach((conn, i) => {
    conn.classList.remove('completed');
    if (i + 1 < currentBeat) conn.classList.add('completed');
  });
}

// ── Narration Formatter ──
// Transforms raw LLM narration text into structured HTML for a polished one-shot RPG feel.
function formatNarration(text) {
  // Sanitize HTML entities to prevent injection (LLM text is not user-controllable but safe practice)
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Split into paragraphs on double newlines (or single if LLM doesn't double)
  const raw = text.trim();
  let blocks = raw.split(/\n{2,}/);
  // If only 1 block, try splitting on single newlines (long monolithic text)
  if (blocks.length === 1 && raw.length > 200) {
    blocks = raw.split(/\n/);
  }

  const htmlParts = [];
  for (let i = 0; i < blocks.length; i++) {
    let block = blocks[i].trim();
    if (!block) continue;

    // Scene break: --- on its own line
    if (/^-{3,}$/.test(block)) {
      htmlParts.push('<div class="scene-break-wrap"><hr class="scene-break"><span class="scene-break-icon">◆</span></div>');
      continue;
    }

    // Escape HTML
    block = esc(block);

    // Inline formatting: *text* → <em>
    block = block.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Dialogue: « ... » → styled span
    block = block.replace(/«\s*([^»]+)\s*»/g, '<span class="dialogue">«\u00A0$1\u00A0»</span>');

    // Glossary terms → tooltip spans (only first occurrence per paragraph)
    if (state.glossaryRegex) {
      const matched = new Set();
      block = block.replace(state.glossaryRegex, (match) => {
        const key = match.toLowerCase();
        if (matched.has(key)) return match; // skip duplicates in same paragraph
        // Don't wrap terms that are already inside HTML tags
        matched.add(key);
        return `<span class="glossary-term" data-term="${esc(match)}">${match}</span>`;
      });
    }

    // Determine paragraph class
    const isDialogue = block.includes('<span class="dialogue">');
    const isShort = block.length < 80;
    let cls = 'narr-paragraph';
    if (isDialogue) cls += ' narr-dialogue';
    if (i === 0) cls += ' narr-opening';
    if (isShort && !isDialogue) cls += ' narr-accent';

    htmlParts.push(`<p class="${cls}">${block}</p>`);
  }

  return htmlParts.join('');
}

// ── Paragraph-by-paragraph Reveal ──
// Instead of character-by-character typewriter, reveal paragraphs one at a time with staggered animation.
async function revealParagraphs(container) {
  const paragraphs = container.querySelectorAll('.narr-paragraph, .scene-break-wrap');
  for (const p of paragraphs) {
    p.classList.add('narr-hidden');
  }

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    // Stagger delay: shorter for dialogue, longer for scene breaks
    const isBreak = p.tagName === 'HR';
    const isDialogue = p.classList.contains('narr-dialogue');
    const delay = isBreak ? 300 : isDialogue ? 150 : 200;

    await new Promise(r => setTimeout(r, delay));
    p.classList.remove('narr-hidden');
    p.classList.add('narr-reveal');
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

// ── Display Turn Output ──
async function displayTurnOutput(output, useTypewriter = false) {
  // Create narration message
  const msg = document.createElement('div');
  msg.className = 'message message-narration';
  if (output.moodTag) {
    msg.dataset.mood = output.moodTag;
  }
  chatMessages.appendChild(msg);

  // Format narration into structured HTML
  const formattedHTML = formatNarration(output.narration);
  msg.innerHTML = formattedHTML;

  if (useTypewriter && output.narration.length > 0) {
    // Reveal paragraphs one by one with animation
    await revealParagraphs(msg);
  }

  // Show passive dice results
  if (output.passiveDiceResults?.length > 0) {
    for (const dice of output.passiveDiceResults) {
      addMessage('dice', dice.description, null, dice.success);
    }
  }

  // Show choices
  state.currentChoices = output.choices;
  renderChoices(output.choices);

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ── Messages ──
function addMessage(type, text, mood, success) {
  const msg = document.createElement('div');
  msg.className = `message message-${type}`;

  if (type === 'narration' && mood) {
    msg.dataset.mood = mood;
  }
  if (type === 'dice') {
    msg.classList.add(success ? 'success' : 'failure');
  }

  // System messages use innerHTML for decorative elements
  if (type === 'system') {
    msg.innerHTML = text;
  } else {
    msg.textContent = text;
  }
  chatMessages.appendChild(msg);
}

// ── Choices ──
function renderChoices(choices) {
  choicesArea.innerHTML = '';

  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i];
    const btn = document.createElement('button');
    btn.className = 'choice-btn choice-enter';
    btn.style.animationDelay = `${i * 0.08}s`;
    btn.innerHTML = `
      <span class="choice-key">${i + 1}</span>
      <span class="choice-stat-tag" data-stat="${choice.dominantStat}">${choice.dominantStat}</span>
      <span class="choice-text">${choice.text}</span>
      ${choice.requiresActiveRoll ? `<span class="choice-risk" data-risk="${choice.riskLevel}">DC ${choice.dc ?? '?'} ⚀</span>` : ''}
    `;
    btn.addEventListener('click', () => makeChoice(choice));
    choicesArea.appendChild(btn);
  }

  // Show free input alongside choices
  showFreeInput();
}

// Keyboard shortcuts for choices (1-4)
document.addEventListener('keydown', (e) => {
  // Only when choices are visible and free input isn't focused
  if (document.activeElement === freeInput) return;
  const num = parseInt(e.key);
  if (num >= 1 && num <= 4 && state.currentChoices.length >= num) {
    e.preventDefault();
    makeChoice(state.currentChoices[num - 1]);
  }
});

// ── Free Text Input ──
function showFreeInput() {
  freeInputArea.classList.remove('hidden');
  freeInput.value = '';
  btnFreeSend.disabled = true;
}

function hideFreeInput() {
  freeInputArea.classList.add('hidden');
  freeInput.value = '';
}

// Wire up free input events
freeInput.addEventListener('input', () => {
  btnFreeSend.disabled = freeInput.value.trim().length === 0;
});

freeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && freeInput.value.trim().length > 0) {
    e.preventDefault();
    submitFreeText();
  }
});

btnFreeSend.addEventListener('click', () => {
  if (freeInput.value.trim().length > 0) {
    submitFreeText();
  }
});

function submitFreeText() {
  const text = freeInput.value.trim();
  if (!text) return;

  // Create a synthetic "free-text" choice
  const freeChoice = {
    id: 'free-text',
    text: text,
    dominantStat: 'ubuntu', // placeholder — the LLM will determine the real stat
    requiresActiveRoll: false, // the LLM will decide if a roll is needed
    riskLevel: 'medium',
    _freeText: text, // marker to know this is a free text choice
  };

  makeChoice(freeChoice);
}

// ── Make Choice (SSE Streaming) ──
async function makeChoice(choice) {
  const isFreeText = choice.id === 'free-text';

  // Optimistic UI: show the choice immediately
  addMessage('choice', isFreeText ? `✎ ${choice.text}` : `→ ${choice.text}`);

  // Hide choices + free input, show loading
  choicesArea.innerHTML = '';
  hideFreeInput();
  showInGameLoading();

  // Show dice animation immediately if active roll (not for free text)
  if (choice.requiresActiveRoll && !isFreeText) {
    showDiceRoll();
  }

  // Try SSE streaming endpoint first, fallback to regular endpoint
  try {
    await makeChoiceSSE(choice);
  } catch (err) {
    console.warn('SSE failed, falling back to regular endpoint:', err.message);
    await makeChoiceFallback(choice);
  }
}

async function makeChoiceSSE(choice) {
  const isFreeText = choice.id === 'free-text';
  const response = await fetchWithTimeout(`${API}/game/${state.sessionId}/turn/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      choiceId: choice.id,
      freeText: isFreeText ? choice._freeText || choice.text : undefined,
      previousChoices: isFreeText ? state.currentChoices : state.currentChoices,
    }),
  });

  if (!response.ok) {
    throw new Error('SSE endpoint returned ' + response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalData = null;

  // Hide in-game loading once we start getting data
  let firstChunkReceived = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events from buffer
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    let currentEvent = null;
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ') && currentEvent) {
        const data = line.slice(6);

        if (currentEvent === 'dice') {
          // Dice result from server
          const dr = JSON.parse(data);
          hideDiceRoll();
          const mod = dr.modifier >= 0 ? `+${dr.modifier}` : dr.modifier;
          addMessage('dice',
            `🎲 ${choice.dominantStat}: d20(${dr.roll}) ${mod} = ${dr.total} vs DC ${dr.dc} — ${dr.success ? 'Succès' : 'Échec'}${dr.criticalSuccess ? ' CRITIQUE !' : ''}${dr.criticalFailure ? ' CRITIQUE !' : ''}`,
            null, dr.success
          );

        } else if (currentEvent === 'chunk') {
          // Streaming narration text
          if (!firstChunkReceived) {
            firstChunkReceived = true;
            hideInGameLoading();
            hideDiceRoll();
          }
          // We receive chunks but the narration display will use the full text from 'done'

        } else if (currentEvent === 'done') {
          finalData = JSON.parse(data);

        } else if (currentEvent === 'error') {
          const errData = JSON.parse(data);
          throw new Error(errData.error || 'Server error');
        }
        currentEvent = null;
      } else if (line === '') {
        currentEvent = null;
      }
    }
  }

  if (!finalData) {
    throw new Error('Stream ended without final data');
  }

  // Hide loading if not already hidden
  hideInGameLoading();
  hideDiceRoll();

  // Process final data
  processChoiceResult(finalData, choice, true);
}

async function makeChoiceFallback(choice) {
  const isFreeText = choice.id === 'free-text';
  try {
    const res = await fetchWithTimeout(`${API}/game/${state.sessionId}/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        choiceId: choice.id,
        freeText: isFreeText ? choice._freeText || choice.text : undefined,
        previousChoices: state.currentChoices,
      }),
    });

    const data = await res.json();
    if (res.status !== 200) throw new Error(data.error);

    hideInGameLoading();
    hideDiceRoll();

    // Show dice result
    if (data.diceResult) {
      const dr = data.diceResult;
      const mod = dr.modifier >= 0 ? `+${dr.modifier}` : dr.modifier;
      addMessage('dice',
        `🎲 ${choice.dominantStat}: d20(${dr.roll}) ${mod} = ${dr.total} vs DC ${dr.dc} — ${dr.success ? 'Succès' : 'Échec'}${dr.criticalSuccess ? ' CRITIQUE !' : ''}${dr.criticalFailure ? ' CRITIQUE !' : ''}`,
        null, dr.success
      );
    }

    processChoiceResult(data, choice, false);

  } catch (err) {
    hideInGameLoading();
    hideDiceRoll();
    console.error('Turn failed:', err);
    addMessage('system', `Erreur: ${err.name === 'AbortError' ? 'Timeout' : err.message}`);
    renderChoices(state.currentChoices);
  }
}

function processChoiceResult(data, choice, useTypewriter) {
  // Update state
  if (data.character) state.character = data.character;

  // Update turn counter
  const turnCount = data.session?.turnCount ?? data.pacing?.turnsInBeat ?? 0;
  const currentBeat = data.session?.currentBeat ?? data.newBeat ?? 1;
  updateTurnCounter(turnCount, currentBeat);

  // Beat transition message
  if (data.beatTransitioned) {
    const beatName = state.beats[data.newBeat - 1]?.name || '';
    addMessage('system', `<span class="beat-transition-line"></span><span class="beat-transition-text">⟡ ${beatName || 'Beat ' + data.newBeat} ⟡</span><span class="beat-transition-line"></span>`);
    updateBeatDots(data.newBeat);
  }

  // Display new output with typewriter if streamed
  if (data.gameCompleted) {
    displayFinalNarration(data.output, useTypewriter);
    state.gameCompleted = true;
    setTimeout(() => showEndScreen(), 2000);
  } else {
    displayTurnOutput(data.output, useTypewriter);
  }

  // Update sidebar
  updateSidebar();

  // Auto-save active game reference
  saveActiveGame();

  // Refresh context panel if open
  refreshContextPanel();
}

// ── Dice Animation ──
function showDiceRoll() {
  diceOverlay.classList.remove('hidden');
}

function hideDiceRoll() {
  diceOverlay.classList.add('hidden');
}

// ── Sidebar Update ──
let _prevStats = null;

function updateSidebar() {
  if (!state.character) return;
  const c = state.character;

  sidebarName.textContent = c.name;
  // Display gendered archetype name
  const displayArchetype = getArchetypeGenderName(c.archetypeId, c.gender || 'masculin') || c.archetype;
  sidebarArchetype.textContent = displayArchetype;

  // HP — dynamic gradient color
  const hpPercent = Math.max(0, (c.hp / c.maxHp) * 100);
  hpFill.style.width = `${hpPercent}%`;
  hpText.textContent = `${c.hp}/${c.maxHp}`;
  // Color: green > 60%, yellow 30-60%, red < 30%
  if (hpPercent > 60) {
    hpFill.style.background = 'linear-gradient(90deg, var(--color-risk-low), #6edca4)';
  } else if (hpPercent > 30) {
    hpFill.style.background = 'linear-gradient(90deg, var(--color-risk-medium), #f0c040)';
  } else {
    hpFill.style.background = 'linear-gradient(90deg, var(--color-risk-high), #ff9090)';
  }

  // Stats — flash on change
  const statNames = ['ubuntu', 'maat', 'sankofa', 'biso'];
  for (const stat of statNames) {
    const el = $(`#side-${stat}`);
    const newVal = c.stats[stat];
    el.textContent = newVal;
    if (_prevStats && _prevStats[stat] !== newVal) {
      const diff = newVal - _prevStats[stat];
      el.classList.remove('stat-flash-up', 'stat-flash-down');
      void el.offsetWidth; // force reflow to retrigger animation
      el.classList.add(diff > 0 ? 'stat-flash-up' : 'stat-flash-down');
    }
  }
  _prevStats = { ...c.stats };

  // Inventory
  inventoryList.innerHTML = '';
  if ((c.inventory ?? []).length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'Aucun objet';
    inventoryList.appendChild(li);
  } else {
    for (const item of c.inventory) {
      const li = document.createElement('li');
      li.textContent = item.name;
      if (item.description) li.title = item.description;
      inventoryList.appendChild(li);
    }
  }

  // Relationships (from character data if available)
  relationshipsList.innerHTML = '';
  const rels = c.relationships ?? [];
  if (rels.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'Aucune rencontre';
    relationshipsList.appendChild(li);
  } else {
    for (const rel of rels) {
      const li = document.createElement('li');
      li.className = 'relationship-item';
      const aff = rel.affinity ?? 0;
      const barPct = ((aff + 10) / 20) * 100;
      const color = aff >= 0 ? 'var(--color-risk-low)' : 'var(--color-risk-high)';
      li.innerHTML = `
        <span class="rel-name">${rel.npcName || rel.name || '?'}</span>
        <span class="rel-bar"><span class="rel-bar-fill" style="width:${barPct}%;background:${color}"></span></span>
        <span class="rel-val">${aff > 0 ? '+' : ''}${aff}</span>
      `;
      relationshipsList.appendChild(li);
    }
  }
}

// ── Display Final Narration (no choices — game over) ──
async function displayFinalNarration(output, useTypewriter = false) {
  const msg = document.createElement('div');
  msg.className = 'message message-narration';
  if (output.moodTag) msg.dataset.mood = output.moodTag;
  chatMessages.appendChild(msg);

  const formattedHTML = formatNarration(output.narration);
  msg.innerHTML = formattedHTML;

  if (useTypewriter && output.narration.length > 0) {
    await revealParagraphs(msg);
  }

  // Hide choices area completely
  choicesArea.innerHTML = '';
  hideFreeInput();
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ══════════════════════════════════════════
// ── CHANTIER 1: Game End Screen ──
// ══════════════════════════════════════════

function setupEndScreen() {
  $('#btn-export-pdf').addEventListener('click', exportToPDF);
  $('#btn-new-game').addEventListener('click', () => {
    clearActiveGame();
    location.reload();
  });
  // Close button — dismiss overlay to review the game chat
  const btnClose = $('#btn-end-close');
  if (btnClose) {
    btnClose.addEventListener('click', closeEndScreen);
  }
}

function closeEndScreen() {
  const endOverlay = $('#screen-end');
  endOverlay.classList.remove('visible');
  setTimeout(() => endOverlay.classList.add('hidden'), 400);
  // Show a "Revoir le Rapport" button in the choices area
  choicesArea.innerHTML = '';
  const notice = document.createElement('p');
  notice.className = 'read-only-notice';
  notice.textContent = 'Partie termin\u00e9e \u2014 vous pouvez relire l\u2019histoire.';
  choicesArea.appendChild(notice);

  const btnRow = document.createElement('div');
  btnRow.className = 'end-review-actions';

  const btnReport = document.createElement('button');
  btnReport.className = 'btn-end-action btn-end-primary';
  btnReport.textContent = 'Revoir le Rapport';
  btnReport.addEventListener('click', () => {
    const endOverlay = $('#screen-end');
    endOverlay.classList.remove('hidden');
    setTimeout(() => endOverlay.classList.add('visible'), 50);
  });

  const btnBackTitle = document.createElement('button');
  btnBackTitle.className = 'btn-end-action btn-end-secondary';
  btnBackTitle.textContent = 'Retour au menu';
  btnBackTitle.addEventListener('click', () => {
    clearActiveGame();
    location.reload();
  });

  btnRow.appendChild(btnReport);
  btnRow.appendChild(btnBackTitle);
  choicesArea.appendChild(btnRow);
  hideFreeInput();
}

function generateEndConclusion(character) {
  if (!character || !character.stats) {
    const bookName = state.bookMeta?.name || 'ce monde';
    return `Votre l\u00e9gende est \u00e0 jamais grav\u00e9e dans les m\u00e9moires de ${bookName}.`;
  }
  const stats = character.stats;
  const entries = [
    ['ubuntu', stats.ubuntu ?? 0],
    ['maat', stats.maat ?? 0],
    ['sankofa', stats.sankofa ?? 0],
    ['biso', stats.biso ?? 0],
  ];
  const dominant = entries.reduce((max, cur) => cur[1] > max[1] ? cur : max, entries[0]);
  const name = character.name || 'Aventurier';

  const statNames = state.bookMeta?.statNames || {};
  const s0 = statNames.ubuntu || 'Ubuntu';
  const s1 = statNames.maat || 'Ma\u00e2t';
  const s2 = statNames.sankofa || 'Sankofa';
  const s3 = statNames.biso || 'Biso';

  const conclusions = {
    ubuntu: `Votre parcours fut marqu\u00e9 par le lien et l'empathie. ${name}, vous avez incarn\u00e9 ${s0} \u2014 la communaut\u00e9 avant tout. Votre compassion et votre d\u00e9vouement resteront grav\u00e9s dans les m\u00e9moires.`,
    maat: `Votre qu\u00eate de v\u00e9rit\u00e9 et de justice a illumin\u00e9 les t\u00e9n\u00e8bres. ${name}, vous avez incarn\u00e9 ${s1} \u2014 la balance parfaite. Votre h\u00e9ritage est celui de l'\u00e9quit\u00e9 et de la droiture.`,
    sankofa: `Les anc\u00eatres ont guid\u00e9 chacun de vos pas. ${name}, vous avez incarn\u00e9 ${s2} \u2014 la m\u00e9moire vivante. Votre sagesse traversera les g\u00e9n\u00e9rations et inspirera ceux qui viendront apr\u00e8s.`,
    biso: `Votre audace et votre innovation ont trac\u00e9 de nouveaux chemins. ${name}, vous avez incarn\u00e9 ${s3} \u2014 l'\u00e9tincelle de changement. Votre l\u00e9gende inspirera les r\u00e9volutions futures.`,
  };
  return conclusions[dominant[0]] || conclusions.ubuntu;
}

function renderChoiceReport(exportData, container) {
  const actionsByBeat = {};
  for (const action of (exportData.actions || [])) {
    if (!actionsByBeat[action.beat]) actionsByBeat[action.beat] = [];
    actionsByBeat[action.beat].push(action);
  }

  const html = [];
  const beatNumbers = Object.keys(actionsByBeat).map(Number).sort((a, b) => a - b);

  for (const beatNum of beatNumbers) {
    const beatName = exportData.beats?.[beatNum - 1]?.name ?? `Beat ${beatNum}`;
    const actions = actionsByBeat[beatNum];

    html.push(`<div class="choice-beat-section">
      <h4 class="choice-beat-title">${beatName}</h4>
      <div class="choice-beat-actions">`);

    for (const action of actions) {
      let diceResult = action.diceResult;
      if (typeof diceResult === 'string') {
        try { diceResult = JSON.parse(diceResult); } catch { diceResult = null; }
      }
      const diceIcon = diceResult?.success === true ? '\u2713' :
                       diceResult?.success === false ? '\u2717' : '';
      const diceClass = diceResult?.success === true ? 'success' : 'failure';
      const stat = action.dominantStat || '';

      let stateChanges = action.stateChanges;
      if (typeof stateChanges === 'string') {
        try { stateChanges = JSON.parse(stateChanges); } catch { stateChanges = []; }
      }

      html.push(`
        <div class="choice-entry">
          <div class="choice-entry-header">
            ${stat ? `<span class="choice-stat-badge" data-stat="${stat}">${stat}</span>` : ''}
            <span class="choice-text">${action.choiceText || ''}</span>
            ${diceIcon ? `<span class="choice-dice-result ${diceClass}">${diceIcon}</span>` : ''}
          </div>
          ${stateChanges?.length > 0 ? renderStateChanges(stateChanges) : ''}
        </div>`);
    }

    html.push(`</div></div>`);
  }

  container.innerHTML = html.join('');
}

function renderStateChanges(changes) {
  if (!Array.isArray(changes) || changes.length === 0) return '';
  const items = changes.slice(0, 3).map(ch => {
    const desc = ch.description || ch.type || JSON.stringify(ch);
    return `<li>${desc}</li>`;
  }).join('');
  return `<ul class="choice-impacts">${items}</ul>`;
}

async function showEndScreen() {
  const endOverlay = $('#screen-end');
  const endStats = $('#end-stats');
  const endConclusion = $('#end-conclusion');
  const endChoicesList = $('#end-choices-list');
  const c = state.character;

  // Generate conclusion based on dominant stat
  endConclusion.innerHTML = `<p class="end-conclusion-text">${generateEndConclusion(c)}</p>`;

  // Fetch choice report
  try {
    const res = await fetchWithTimeout(`${API}/game/${state.sessionId}/export`);
    const data = await res.json();
    renderChoiceReport(data, endChoicesList);
  } catch (err) {
    console.error('Failed to load choice report:', err);
    endChoicesList.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">Impossible de charger le rapport.</p>';
  }

  // Build stats summary
  endStats.innerHTML = `
    <div class="end-stat-row"><span>Personnage</span><strong>${c?.name ?? '?'}</strong></div>
    <div class="end-stat-row"><span>Arch\u00e9type</span><strong>${c?.archetype ?? '?'}</strong></div>
    <div class="end-stat-row"><span>PV Finals</span><strong>${c?.hp ?? '?'}/${c?.maxHp ?? '?'}</strong></div>
    <div class="end-stat-row">
      <span>Stats Finales</span>
      <strong>
        Ubuntu ${c?.stats?.ubuntu ?? '?'} | Ma\u00e2t ${c?.stats?.maat ?? '?'} | Sankofa ${c?.stats?.sankofa ?? '?'} | Biso ${c?.stats?.biso ?? '?'}
      </strong>
    </div>
    <div class="end-stat-row"><span>Mode</span><strong>${state.gameMode === 'rapide' ? 'Histoire Rapide' : 'Aventure Compl\u00e8te'}</strong></div>
  `;

  endOverlay.classList.remove('hidden');
  setTimeout(() => endOverlay.classList.add('visible'), 50);
}

// ══════════════════════════════════════════
// ── CHANTIER 2: PDF Export ──
// ══════════════════════════════════════════

async function loadJsPDF() {
  if (window.jspdf) return window.jspdf.jsPDF;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js';
    script.onload = () => {
      if (window.jspdf) resolve(window.jspdf.jsPDF);
      else reject(new Error('jsPDF n\'a pas pu s\'initialiser'));
    };
    script.onerror = () => reject(new Error('Impossible de charger la biblioth\u00e8que jsPDF'));
    document.head.appendChild(script);
  });
}

async function exportToPDF() {
  const btn = $('#btn-export-pdf');
  btn.textContent = 'G\u00e9n\u00e9ration en cours...';
  btn.disabled = true;

  try {
    const [res, jsPDF] = await Promise.all([
      fetchWithTimeout(`${API}/game/${state.sessionId}/export`),
      loadJsPDF()
    ]);
    const data = await res.json();

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 20;
    const maxW = pageW - margin * 2;
    let y = margin;

    // Helper: add text with word wrap and page breaks
    function addText(text, fontSize = 10, style = 'normal', lineSpacing = 5) {
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', style);
      const lines = doc.splitTextToSize(text, maxW);
      for (const line of lines) {
        if (y + lineSpacing > pageH - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += lineSpacing;
      }
    }

    function addSpace(h = 5) {
      y += h;
      if (y > pageH - margin) { doc.addPage(); y = margin; }
    }

    // ── Cover page ──
    y = pageH / 3;
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    const pdfTitle = state.bookMeta ? `${state.bookMeta.name}${state.bookMeta.subtitle ? ' ' + state.bookMeta.subtitle : ''}` : 'Projet A15';
    doc.text(pdfTitle, pageW / 2, y, { align: 'center' });
    y += 15;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'normal');
    doc.text(`L'histoire de ${data.character?.name ?? 'l\'Aventurier'}`, pageW / 2, y, { align: 'center' });
    y += 10;
    doc.setFontSize(11);
    doc.text(`${data.character?.archetype ?? ''} | ${state.gameMode === 'rapide' ? 'Histoire Rapide' : 'Aventure Compl\u00e8te'}`, pageW / 2, y, { align: 'center' });
    y += 8;
    doc.setFontSize(9);
    doc.text(new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' }), pageW / 2, y, { align: 'center' });

    // ── Story pages ──
    doc.addPage();
    y = margin;

    // Group actions by beat
    const actionsByBeat = {};
    for (const a of data.actions) {
      if (!actionsByBeat[a.beat]) actionsByBeat[a.beat] = [];
      actionsByBeat[a.beat].push(a);
    }

    const beatNumbers = Object.keys(actionsByBeat).map(Number).sort((a, b) => a - b);

    for (const beatNum of beatNumbers) {
      const beatName = data.beats?.[beatNum - 1]?.name ?? `Beat ${beatNum}`;

      // Beat header
      addSpace(8);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      if (y + 10 > pageH - margin) { doc.addPage(); y = margin; }
      doc.text(`${beatName}`, margin, y);
      y += 3;
      // Thin separator line
      doc.setDrawColor(180, 150, 100);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageW - margin, y);
      y += 5;

      // Beat summary if available
      const summary = data.beatSummaries?.find(s => s.beatNumber === beatNum);
      if (summary) {
        addText(summary.summaryText, 9, 'italic', 4);
        addSpace(4);
      }

      // Each turn
      for (const action of actionsByBeat[beatNum]) {
        // Player choice
        addText(`> ${action.choiceText}`, 9, 'bolditalic', 4);

        // Dice result
        if (action.diceResult) {
          const dr = action.diceResult;
          addText(`   [${dr.stat}: d20(${dr.roll})+${dr.modifier}=${dr.total} vs DC${dr.dc} \u2014 ${dr.success ? 'Succ\u00e8s' : '\u00c9chec'}]`, 8, 'italic', 3.5);
        }

        // Narration
        if (action.narrationText) {
          // Clean narration: remove markdown-style asterisks and guillemets formatting for PDF
          const cleanText = action.narrationText
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/\n{2,}/g, '\n');
          addText(cleanText, 10, 'normal', 4.5);
        }
        addSpace(3);
      }
    }

    // ── Final stats page ──
    doc.addPage();
    y = margin;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Bilan de l\'Aventure', pageW / 2, y, { align: 'center' });
    y += 12;

    const c = data.character;
    if (c) {
      addText(`Personnage : ${c.name}`, 11, 'bold', 6);
      addText(`Arch\u00e9type : ${c.archetype}`, 10, 'normal', 5);
      addText(`PV : ${c.hp}/${c.maxHp}`, 10, 'normal', 5);
      addSpace(4);
      addText('Stats finales :', 11, 'bold', 6);
      for (const stat of ['ubuntu', 'maat', 'sankofa', 'biso']) {
        const name = getStatDisplayName(stat);
        const sub = getStatSubtitle(stat);
        addText(`  ${name}${sub ? ` (${sub})` : ''} : ${c.stats[stat]}`, 10, 'normal', 5);
      }

      if (c.inventory?.length > 0) {
        addSpace(4);
        addText('Inventaire :', 11, 'bold', 6);
        for (const item of c.inventory) {
          addText(`  - ${item.name}`, 10, 'normal', 5);
        }
      }
    }

    const bookPrefix = (state.bookMeta?.id || state.selectedBook || 'kinchat').toLowerCase();
    doc.save(`${bookPrefix}-${(c?.name ?? 'histoire').toLowerCase().replace(/\s+/g, '-')}.pdf`);

  } catch (err) {
    console.error('PDF export failed:', err);
    alert('Erreur lors de l\'export PDF: ' + err.message);
  } finally {
    btn.textContent = 'Exporter en PDF';
    btn.disabled = false;
  }
}

// ══════════════════════════════════════════
// ── CHANTIER 3: Save System ──
// ══════════════════════════════════════════

function setupSaveSystem() {
  const btnSave = $('#btn-save-game');
  if (btnSave) {
    btnSave.addEventListener('click', saveGame);
  }

  const btnLoadSave = $('#btn-load-save');
  if (btnLoadSave) {
    btnLoadSave.addEventListener('click', showSavesModal);
  }

  const btnSavesClose = $('#btn-saves-close');
  if (btnSavesClose) {
    btnSavesClose.addEventListener('click', () => {
      $('#saves-modal').classList.add('hidden');
    });
  }
}

async function checkExistingSaves() {
  try {
    const res = await fetchWithTimeout(`${API}/saves`);
    const saves = await res.json();
    if (saves.length > 0) {
      $('#btn-load-save')?.classList.remove('hidden');
    }
  } catch (err) {
    // Silently fail — no saves available
  }
}

async function saveGame() {
  if (!state.sessionId || !state.character) return;

  const btn = $('#btn-save-game');
  btn.textContent = 'Sauvegarde...';
  btn.disabled = true;

  try {
    const saveName = `${state.character.name} \u2014 Beat ${state.character._currentBeat || '?'} \u2014 ${new Date().toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
    const res = await fetchWithTimeout(`${API}/saves`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.sessionId,
        saveName,
      }),
    });

    if (!res.ok) throw new Error('Save failed');

    btn.textContent = '\u2714 Sauvegard\u00e9';
    showToast('Partie sauvegard\u00e9e', 'success');
    setTimeout(() => {
      btn.textContent = '\uD83D\uDCBE Sauvegarder';
      btn.disabled = false;
    }, 1500);
  } catch (err) {
    console.error('Save failed:', err);
    btn.textContent = 'Erreur !';
    showToast('Erreur de sauvegarde', 'error');
    setTimeout(() => {
      btn.textContent = '\uD83D\uDCBE Sauvegarder';
      btn.disabled = false;
    }, 1500);
  }
}

async function loadSaveGame(saveId) {
  const modal = $('#saves-modal');
  modal.classList.add('hidden');

  showLoadingOverlay('Chargement de la sauvegarde...', 'Restauration de votre aventure');

  try {
    const res = await fetchWithTimeout(`${API}/saves/${saveId}`);
    const snapshot = await res.json();

    // Restore state
    state.sessionId = snapshot.session.id;
    state.character = snapshot.character;
    state.gameMode = snapshot.session.gameMode || 'normal';

    // Persist active game to localStorage
    saveActiveGame();
    updateTitleScreenForActiveGame();

    // Switch to game screen
    screenTitle.classList.remove('active');
    screenCreation.classList.remove('active');
    screenGame.classList.add('active');

    // Update sidebar
    updateSidebar();

    // Load beats and update tracker
    await loadBeats();
    updateBeatDots(snapshot.session.currentBeat);

    // Show last narration from recent actions
    chatMessages.innerHTML = '';
    const lastActions = snapshot.recentActions?.slice(-3) ?? [];
    for (const action of lastActions) {
      if (action.choiceText) {
        addMessage('choice', `\u2192 ${action.choiceText}`);
      }
      if (action.narrationText) {
        const msg = document.createElement('div');
        msg.className = 'message message-narration';
        msg.innerHTML = formatNarration(action.narrationText);
        chatMessages.appendChild(msg);
      }
    }

    // Re-render last choices if available (from the last action's output)
    // Since we don't store choices in the journal, show a "continue" prompt
    addMessage('system', '<span class="beat-transition-line"></span><span class="beat-transition-text">Partie restaur\u00e9e</span><span class="beat-transition-line"></span>');

    hideLoadingOverlay();

  } catch (err) {
    console.error('Load save failed:', err);
    hideLoadingOverlay();
    alert('Erreur lors du chargement: ' + err.message);
  }
}

// ══════════════════════════════════════════
// ── CHANTIER 4: Evolving Context Panel ──
// ══════════════════════════════════════════

function setupContextPanel() {
  const btnToggle = $('#btn-context-toggle');
  const btnClose = $('#btn-context-close');
  const panel = $('#context-panel');

  if (btnToggle) {
    btnToggle.addEventListener('click', () => {
      panel.classList.toggle('panel-closed');
      if (!panel.classList.contains('panel-closed')) {
        refreshContextPanel();
      }
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      panel.classList.add('panel-closed');
    });
  }
}

// ── Mobile Sidebar Toggle ──
function setupMobileSidebar() {
  const btnToggle = $('#btn-sidebar-toggle');
  const backdrop = $('#sidebar-backdrop');
  const sidebar = $('#sidebar');

  if (!btnToggle || !sidebar) return;

  function openSidebar() {
    sidebar.classList.add('mobile-open');
    if (backdrop) backdrop.classList.add('visible');
  }

  function closeSidebar() {
    sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.remove('visible');
  }

  btnToggle.addEventListener('click', () => {
    if (sidebar.classList.contains('mobile-open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  if (backdrop) {
    backdrop.addEventListener('click', closeSidebar);
  }

  // Swipe down on sidebar to close
  let touchStartY = 0;
  sidebar.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  sidebar.addEventListener('touchend', (e) => {
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (dy > 60) closeSidebar(); // Swipe down
  }, { passive: true });
}

async function refreshContextPanel() {
  if (!state.sessionId) return;
  const panel = $('#context-panel');
  if (panel.classList.contains('panel-closed')) return;

  try {
    const res = await fetchWithTimeout(`${API}/game/${state.sessionId}/context`);
    const ctx = await res.json();

    // Pacing section
    const pacingEl = $('#ctx-pacing-content');
    if (ctx.pacing) {
      const p = ctx.pacing;
      const checkpointsTotal = p.narrativeCheckpoints?.length ?? 0;
      const checkpointsMet = p.narrativeCheckpoints?.filter(c => c.met).length ?? 0;
      pacingEl.innerHTML = `
        <div class="ctx-row"><span>Beat</span><strong>${ctx.currentBeat} / 15</strong></div>
        <div class="ctx-row"><span>Tour</span><strong>${ctx.turnCount}</strong></div>
        <div class="ctx-row"><span>Tension</span><strong>${p.tensionCurve ?? '?'}</strong></div>
        <div class="ctx-row"><span>\u00c9motion</span><strong>${p.emotionalTone ?? '?'}</strong></div>
        <div class="ctx-row">
          <span>Escalation</span>
          <div class="ctx-bar"><div class="ctx-bar-fill" style="width: ${(p.sceneEscalation ?? 0) * 100}%"></div></div>
        </div>
        <div class="ctx-row"><span>Checkpoints</span><strong>${checkpointsMet}/${checkpointsTotal}</strong></div>
        <div class="ctx-row"><span>Tours dans beat</span><strong>${p.turnsInBeat ?? 0} / ${p.maxTurnsBeforeForceProgress ?? '?'}</strong></div>
      `;
    }

    // Flags section
    const flagsEl = $('#ctx-flags-content');
    const flagEntries = Object.entries(ctx.worldFlags ?? {});
    if (flagEntries.length === 0) {
      flagsEl.innerHTML = '<span class="ctx-empty">Aucun drapeau actif</span>';
    } else {
      flagsEl.innerHTML = flagEntries.map(([k, v]) => {
        const icon = v === true ? '\u2713' : v === false ? '\u2717' : '\u25cf';
        const cls = v === true ? 'flag-on' : v === false ? 'flag-off' : 'flag-val';
        return `<div class="ctx-flag ${cls}"><span class="ctx-flag-icon">${icon}</span> ${k.replace(/_/g, ' ')}${typeof v === 'string' ? `: ${v}` : ''}</div>`;
      }).join('');
    }

    // Relationships section
    const relEl = $('#ctx-relationships-content');
    const rels = ctx.relationships ?? [];
    if (rels.length === 0) {
      relEl.innerHTML = '<span class="ctx-empty">Aucune relation</span>';
    } else {
      relEl.innerHTML = rels.map(r => {
        const pct = ((r.affinity + 10) / 20) * 100; // -10 to +10 mapped to 0-100%
        const color = r.affinity >= 0 ? 'var(--color-risk-low)' : 'var(--color-risk-high)';
        return `<div class="ctx-rel">
          <span class="ctx-rel-name">${r.npcName}</span>
          <div class="ctx-bar"><div class="ctx-bar-fill" style="width: ${pct}%; background: ${color}"></div></div>
          <span class="ctx-rel-val">${r.affinity > 0 ? '+' : ''}${r.affinity}</span>
        </div>`;
      }).join('');
    }

    // Summaries section
    const sumEl = $('#ctx-summaries-content');
    const sums = ctx.beatSummaries ?? [];
    if (sums.length === 0) {
      sumEl.innerHTML = '<span class="ctx-empty">Aucun beat termin\u00e9</span>';
    } else {
      sumEl.innerHTML = sums.map(s =>
        `<div class="ctx-summary"><strong>Beat ${s.beatNumber}</strong><p>${s.summaryText}</p></div>`
      ).join('');
    }

    // Consequences section
    const consEl = $('#ctx-consequences-content');
    const cons = ctx.consequenceReminders ?? [];
    if (cons.length === 0) {
      consEl.innerHTML = '<span class="ctx-empty">Aucun impact actif</span>';
    } else {
      consEl.innerHTML = cons.map(c => `<div class="ctx-consequence">\u25b8 ${c}</div>`).join('');
    }

    // Recent actions section
    const recentEl = $('#ctx-recent-content');
    const recent = ctx.recentActions ?? [];
    if (recent.length === 0) {
      recentEl.innerHTML = '<span class="ctx-empty">Aucune action</span>';
    } else {
      recentEl.innerHTML = recent.map(a => {
        const diceIcon = a.diceSuccess === true ? '\u2713' : a.diceSuccess === false ? '\u2717' : '';
        return `<div class="ctx-action">
          <span class="ctx-action-turn">T${a.turn}</span>
          <span class="ctx-action-stat" data-stat="${a.stat}">${a.stat}</span>
          <span class="ctx-action-text">${a.choice}</span>
          ${diceIcon ? `<span class="ctx-action-dice ${a.diceSuccess ? 'success' : 'fail'}">${diceIcon}</span>` : ''}
        </div>`;
      }).join('');
    }

  } catch (err) {
    console.error('Context refresh failed:', err);
  }
}

// ══════════════════════════════════════════
// ── CHANTIER 5: Changelog & Update Notification ──
// ══════════════════════════════════════════

const KINCHAT_CHANGELOG = [
  {
    version: '0.9.0',
    date: '2025-02-15',
    title: 'Projet A15 — Hub & G\u00e9n\u00e9rateur de Livres',
    changes: [
      'Nouvel \u00e9cran d\u2019accueil "Projet A15" : hub avec biblioth\u00e8que de livres en grille',
      'G\u00e9n\u00e9rateur de livres assist\u00e9 par IA : cr\u00e9ez un livre complet depuis un pitch textuel',
      'G\u00e9n\u00e9ration en 6 \u00e9tapes (meta, arch\u00e9types, PNJ, beats 1-8, beats 9-15, lore) avec progression SSE',
      'Th\u00e8me CSS auto-g\u00e9n\u00e9r\u00e9 par tonalit\u00e9 (romantique, \u00e9pique, sombre, mystique)',
      'Navigation Hub \u2192 \u00c9cran Titre th\u00e9m\u00e9 \u2192 Cr\u00e9ation \u2192 Jeu',
      'Bouton "Retour \u00e0 la biblioth\u00e8que" sur l\u2019\u00e9cran titre',
      'Archives filtr\u00e9es par livre depuis le hub',
      'Branding "Projet A15 \u2014 Moteur narratif \u00e0 15 beats"',
    ],
  },
  {
    version: '0.8.0',
    date: '2025-02-15',
    title: 'Syst\u00e8me de Livres Modulaire',
    changes: [
      'Architecture multi-livres : chaque livre est un dossier autonome avec meta, beats, PNJ, archétypes et lore',
      'API de découverte : GET /api/books liste les livres disponibles avec métadonnées enrichies',
      'Sélecteur de livre sur l\u2019écran titre (automatiquement masqué s\u2019il n\u2019y a qu\u2019un seul livre)',
      'Meta enrichi : auteur, sous-titre, tagline, icône, tags, descriptions de stats, thème CSS',
      'Les noms de stats, archétypes et personnalités sont désormais lus depuis le livre sélectionné',
      'Les gender maps (archétypes/personnalités) sont déplacées du code client vers meta.json',
      'Chargement dynamique du lore via loreManifest (plus de fichiers hardcodés)',
      'Thème CSS dynamique par livre (chargé depuis meta.json)',
      'Export PDF utilise les noms de stats du livre sélectionné',
      'Préparation pour le générateur de livres externe',
    ],
  },
  {
    version: '0.7.0',
    date: '2025-02-15',
    title: '\u00c9cran de Fin Enrichi & Archives',
    changes: [
      'Le popup de fin est fermable \u2014 vous pouvez relire l\u2019histoire apr\u00e8s la conclusion',
      'Rapport de choix complet : chaque beat avec vos choix, la stat dominante et le r\u00e9sultat du d\u00e9',
      'Paragraphe de conclusion personnalis\u00e9 selon votre stat dominante (Ubuntu, Ma\u00e2t, Sankofa, Biso)',
      'Nouvelle section "Parties Termin\u00e9es" sur l\u2019\u00e9cran titre',
      'Consultation en lecture seule d\u2019une partie archiv\u00e9e (chat reconstruit, sidebar, beat tracker)',
      'Export PDF et suppression possibles depuis les archives',
      'Suivi du statut des sessions en base de donn\u00e9es (in_progress / completed)',
    ],
  },
  {
    version: '0.6.0',
    date: '2025-02-14',
    title: 'Genre du Personnage & Onboarding Enrichi',
    changes: [
      'Sélecteur de genre (Masculin / Féminin / Neutre) dès le premier pas de la création',
      'Archétypes et personnalités adaptés au genre choisi (Le Guerrier → La Guerrière, Courageux → Courageuse...)',
      'Descriptions françaises claires pour chaque archétype',
      'Descriptions enrichies des 4 valeurs (Ubuntu, Maât, Sankofa, Biso) avec détails au survol',
      'La narration du MJ utilise les bons pronoms et accords selon le genre choisi',
      'Rétro-compatible : les anciennes sauvegardes fonctionnent (défaut masculin)',
    ],
  },
  {
    version: '0.5.0',
    date: '2025-02-14',
    title: 'Polish & Qualité d\'Expérience',
    changes: [
      'Compteur de tours affiché dans la barre des beats',
      'Barre de vie dynamique : vert → jaune → rouge selon les PV',
      'Flash visuel sur les stats quand elles changent (vert = hausse, rouge = baisse)',
      'Relations PNJ affichées dans la sidebar avec barres d\'affinité',
      'Messages d\'état vide pour inventaire et relations quand la liste est vide',
      'Animation d\'entrée progressive pour les choix',
      'Navigation au clavier : touches 1-4 pour sélectionner un choix',
      'Système de toast notifications (sauvegarde, erreurs, infos)',
      'Sauvegarde automatique après chaque tour',
      'Bouton "Défiler vers le bas" quand le chat déborde',
      'Bouton "Retour au menu" sur l\'écran de création de personnage',
      'Design responsive mobile (sidebar, beats, choix, création)',
      'Nettoyage du code : suppression de variables inutilisées et commentaires périmés',
      'Fix serveur : export PDF inclut désormais les drapeaux du monde (worldFlags)',
      'Fix serveur : validation du choiceId avant traitement du tour',
    ],
  },
  {
    version: '0.4.0',
    date: '2025-02-14',
    title: 'Suspendre & Reprendre — Menu Principal',
    changes: [
      'Bouton "Menu Principal" dans la sidebar pour suspendre la partie en cours',
      'Retour à l\'écran titre avec bouton "Reprendre la partie" bien séparé',
      'Séparation claire entre reprendre, nouvelle partie et charger une sauvegarde',
      'L\'état du jeu est préservé en mémoire — reprise instantanée sans rechargement',
    ],
  },
  {
    version: '0.3.0',
    date: '2025-02-14',
    title: 'Gestion des parties & Qualité XP',
    changes: [
      'Système de changelog avec notification de mise à jour sur l\'écran titre',
      'Bouton "Recommencer la partie" pour reset du slot actuel',
      'Gestion multi-slots de sauvegarde (nouveau slot / continuer)',
      'Meilleur suivi des mises à jour entre sessions',
    ],
  },
  {
    version: '0.2.0',
    date: '2025-02-13',
    title: 'Écran de fin, PDF, Sauvegardes & Contexte',
    changes: [
      'Écran de fin de jeu avec résumé des stats quand le beat 15 est complété',
      'Export PDF complet de l\'histoire (couverture, narration par beat, stats finales)',
      'Système de sauvegarde/chargement de partie depuis l\'écran titre',
      'Panneau "Contexte Narratif" avec pacing, drapeaux, relations PNJ, timeline, impacts',
      'Fix: mode rapide progresse correctement (1 beat/tour) même sur les beats à minScenes > 1',
      'Fix: panneau contexte utilise animation slide au lieu de display:none',
    ],
  },
  {
    version: '0.1.0',
    date: '2025-02-12',
    title: 'Fondations & Narration',
    changes: [
      'Système de personnalité (6 traits) influençant la narration du MJ',
      'Mode de jeu "Histoire Rapide" (15 tours, 1 beat/tour)',
      'Sous-titres philosophiques pour les 4 valeurs (Ubuntu, Maât, Sankofa, Biso)',
      'Formatage narratif avancé: paragraphes stylisés, dialogues, scènes, révélation progressive',
      'Overlay de chargement immersif avec phases animées',
      'Système d\'action libre (free text) pour décrire ses propres actions',
      'Système de dés visuel avec animations',
    ],
  },
];

const CHANGELOG_STORAGE_KEY = 'kinchat_last_seen_version';
const ACTIVE_GAME_STORAGE_KEY = 'kinchat_active_game';

function getLatestVersion() {
  return KINCHAT_CHANGELOG[0]?.version ?? '0.0.0';
}

function getLastSeenVersion() {
  return localStorage.getItem(CHANGELOG_STORAGE_KEY) ?? '0.0.0';
}

function markChangelogSeen() {
  localStorage.setItem(CHANGELOG_STORAGE_KEY, getLatestVersion());
  const badge = $('#update-badge');
  if (badge) badge.classList.add('hidden');
}

function setupChangelog() {
  const notification = $('#update-notification');
  const btnToggle = $('#btn-update-toggle');
  const panel = $('#changelog-panel');
  const btnClose = $('#btn-changelog-close');
  const badge = $('#update-badge');
  const body = $('#changelog-body');

  if (!notification || !panel) return;

  // Always show the notification button (for accessing changelog anytime)
  notification.classList.remove('hidden');

  // Show badge only if new version since last visit
  const lastSeen = getLastSeenVersion();
  const latest = getLatestVersion();
  if (lastSeen === latest) {
    badge.classList.add('hidden');
  }

  // Auto-open changelog if there's a new version
  if (lastSeen !== latest) {
    renderChangelog(body);
    panel.classList.remove('hidden');
    markChangelogSeen();
  }

  btnToggle.addEventListener('click', () => {
    renderChangelog(body);
    panel.classList.toggle('hidden');
    markChangelogSeen();
  });

  btnClose.addEventListener('click', () => {
    panel.classList.add('hidden');
  });
}

function renderChangelog(container) {
  container.innerHTML = '';
  for (const entry of KINCHAT_CHANGELOG) {
    const section = document.createElement('div');
    section.className = 'changelog-entry';
    section.innerHTML = `
      <div class="changelog-version-header">
        <span class="changelog-version">v${entry.version}</span>
        <span class="changelog-date">${new Date(entry.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </div>
      <h4 class="changelog-title">${entry.title}</h4>
      <ul class="changelog-list">
        ${entry.changes.map(c => `<li>${c}</li>`).join('')}
      </ul>
    `;
    container.appendChild(section);
  }
}

// ══════════════════════════════════════════
// ── Active Game & Multi-Slot Saves ──
// ══════════════════════════════════════════

// Save/restore active game session ID in localStorage
function saveActiveGame() {
  if (state.sessionId) {
    localStorage.setItem(ACTIVE_GAME_STORAGE_KEY, JSON.stringify({
      sessionId: state.sessionId,
      characterName: state.character?.name ?? '',
      gameMode: state.gameMode,
      bookId: state.selectedBook || 'kinara',
    }));
  }
}

function clearActiveGame() {
  localStorage.removeItem(ACTIVE_GAME_STORAGE_KEY);
}

function getActiveGame() {
  try {
    const raw = localStorage.getItem(ACTIVE_GAME_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// Enhanced save modal with multi-slot support
async function showSavesModal() {
  const modal = $('#saves-modal');
  const list = $('#saves-list');
  list.innerHTML = '<p style="text-align:center; color: var(--color-text-muted);">Chargement...</p>';
  modal.classList.remove('hidden');

  try {
    const res = await fetchWithTimeout(`${API}/saves`);
    const saves = await res.json();

    list.innerHTML = '';

    // "New Game" button at top of saves modal
    const newSlotBtn = document.createElement('button');
    newSlotBtn.className = 'save-row save-row-new';
    newSlotBtn.innerHTML = `
      <span class="save-name">Nouvelle Partie</span>
      <span class="save-meta">Créer un nouveau personnage</span>
    `;
    newSlotBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
      // If there's an active game in memory, confirm first
      if (state.sessionId && !state.gameCompleted) {
        if (!confirm('Une partie est en cours. Commencer une nouvelle aventure ?')) return;
        clearActiveGame();
        state.sessionId = null;
        state.character = null;
        state.gameCompleted = false;
        state.currentChoices = [];
        chatMessages.innerHTML = '';
        choicesArea.innerHTML = '';
        updateTitleScreenForActiveGame();
      }
      switchScreen(screenTitle, screenCreation);
    });
    list.appendChild(newSlotBtn);

    if (saves.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.style.cssText = 'text-align:center; color: var(--color-text-muted); padding: 1rem;';
      emptyMsg.textContent = 'Aucune sauvegarde existante';
      list.appendChild(emptyMsg);
    } else {
      for (const save of saves) {
        const row = document.createElement('div');
        row.className = 'save-row';

        const date = new Date(save.createdAt).toLocaleString('fr-FR', {
          day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        const infoBtn = document.createElement('button');
        infoBtn.className = 'save-row-info';
        infoBtn.innerHTML = `
          <span class="save-name">${save.saveName || save.characterName}</span>
          <span class="save-meta">Beat ${save.beatNumber} — ${date}</span>
        `;
        infoBtn.addEventListener('click', () => loadSaveGame(save.id));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'save-row-delete';
        deleteBtn.textContent = '\u00d7';
        deleteBtn.title = 'Supprimer cette sauvegarde';
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm('Supprimer cette sauvegarde ?')) {
            deleteSaveGame(save.id, row);
          }
        });

        row.appendChild(infoBtn);
        row.appendChild(deleteBtn);
        list.appendChild(row);
      }
    }
  } catch (err) {
    list.innerHTML = '<p style="color: var(--color-risk-high);">Erreur de chargement</p>';
  }
}

async function deleteSaveGame(saveId, rowElement) {
  try {
    const res = await fetchWithTimeout(`${API}/saves/${saveId}`, { method: 'DELETE' });
    if (res.ok || res.status === 404) {
      rowElement.style.opacity = '0';
      rowElement.style.transform = 'translateX(20px)';
      setTimeout(() => rowElement.remove(), 300);
    }
  } catch (err) {
    console.error('Delete save failed:', err);
  }
}

// ── Scroll-to-Bottom Button ──

function setupScrollToBottom() {
  const btn = $('#scroll-bottom-btn');
  if (!btn) return;

  const msgs = chatMessages;
  let ticking = false;

  function checkScroll() {
    const distFromBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight;
    if (distFromBottom > 120) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
    ticking = false;
  }

  msgs.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(checkScroll);
      ticking = true;
    }
  });

  btn.addEventListener('click', () => {
    msgs.scrollTo({ top: msgs.scrollHeight, behavior: 'smooth' });
  });
}

// ── Back Button (Creation → Title) ──

function setupBackButton() {
  const btn = $('#btn-back-title');
  if (!btn) return;
  btn.addEventListener('click', () => {
    switchScreen(screenCreation, screenTitle);
  });
}

// ══════════════════════════════════════════
// ── CHANTIER 6: Completed Games Archive ──
// ══════════════════════════════════════════

function setupArchivesSystem() {
  const btnArchives = $('#btn-archives');
  if (btnArchives) {
    btnArchives.addEventListener('click', showArchivesModal);
  }
  const btnClose = $('#btn-archives-close');
  if (btnClose) {
    btnClose.addEventListener('click', () => {
      $('#archives-modal').classList.add('hidden');
    });
  }
}

async function checkCompletedGames() {
  try {
    const res = await fetchWithTimeout(`${API}/game/completed`);
    const completed = await res.json();
    const btn = $('#btn-archives');
    if (btn && completed.length > 0) {
      btn.classList.remove('hidden');
    }
  } catch { /* silently ignore */ }
}

async function showArchivesModal(filterBookId = null) {
  const modal = $('#archives-modal');
  const list = $('#archives-list');
  list.innerHTML = '<p style="text-align:center; color: var(--color-text-muted);">Chargement...</p>';
  modal.classList.remove('hidden');

  try {
    const res = await fetchWithTimeout(`${API}/game/completed`);
    let archives = await res.json();

    // Filter by bookId if provided
    if (filterBookId) {
      archives = archives.filter(a => (a.bookId || 'kinara') === filterBookId);
    }

    list.innerHTML = '';

    if (archives.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.style.cssText = 'text-align:center; color: var(--color-text-muted); padding: 1rem;';
      emptyMsg.textContent = 'Aucune partie termin\u00e9e';
      list.appendChild(emptyMsg);
      return;
    }

    for (const archive of archives) {
      const row = document.createElement('div');
      row.className = 'archive-row';

      const date = new Date(archive.completedAt).toLocaleString('fr-FR', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      const displayArchetype = getArchetypeGenderName(archive.archetypeId, 'masculin') || archive.archetype;

      const bookLabel = archive.bookId && archive.bookId !== 'kinara'
        ? state.availableBooks.find(b => b.id === archive.bookId)?.name || archive.bookId
        : '';
      row.innerHTML = `
        <div class="archive-row-info">
          <span class="archive-name">${archive.characterName}${bookLabel ? ` <small style="opacity:0.5">(${bookLabel})</small>` : ''}</span>
          <span class="archive-meta">${displayArchetype} \u2014 ${archive.turnCount} tours \u2014 ${date}</span>
        </div>
        <div class="archive-actions">
          <button class="archive-btn archive-view" data-id="${archive.sessionId}" title="Voir la partie">Voir</button>
          <button class="archive-btn archive-export" data-id="${archive.sessionId}" title="Exporter en PDF">PDF</button>
          <button class="archive-btn archive-delete" data-id="${archive.sessionId}" title="Supprimer">Suppr.</button>
        </div>
      `;

      // View — read-only mode
      row.querySelector('.archive-view').addEventListener('click', () => {
        modal.classList.add('hidden');
        viewCompletedGame(archive.sessionId);
      });

      // Export PDF
      row.querySelector('.archive-export').addEventListener('click', async () => {
        const prevSession = state.sessionId;
        state.sessionId = archive.sessionId;
        await exportToPDF();
        state.sessionId = prevSession;
      });

      // Delete
      row.querySelector('.archive-delete').addEventListener('click', () => {
        if (confirm(`Supprimer d\u00e9finitivement la partie de ${archive.characterName} ?`)) {
          deleteCompletedGame(archive.sessionId, row);
        }
      });

      list.appendChild(row);
    }
  } catch (err) {
    console.error('Failed to load archives:', err);
    list.innerHTML = '<p style="color: var(--color-risk-high);">Erreur de chargement</p>';
  }
}

async function viewCompletedGame(sessionId) {
  showLoadingOverlay('Chargement de l\u2019archive...', 'Restauration de votre aventure');

  try {
    const [gameRes, exportRes] = await Promise.all([
      fetchWithTimeout(`${API}/game/${sessionId}`),
      fetchWithTimeout(`${API}/game/${sessionId}/export`)
    ]);

    const gameData = await gameRes.json();
    const exportData = await exportRes.json();

    // Set state to read-only mode
    state.sessionId = sessionId;
    state.character = gameData.character;
    state.gameMode = gameData.session.gameMode || 'normal';
    state.gameCompleted = true;

    // Switch to game screen
    screenTitle.classList.remove('active');
    screenCreation.classList.remove('active');
    screenGame.classList.add('active');

    // Update sidebar
    updateSidebar();

    // Load beats and show full progress
    await loadBeats();
    updateBeatDots(15);
    updateTurnCounter(gameData.session.turnCount, 15);

    // Reconstruct chat from action journal
    chatMessages.innerHTML = '';

    const actionsByBeat = {};
    for (const action of (exportData.actions || [])) {
      if (!actionsByBeat[action.beat]) actionsByBeat[action.beat] = [];
      actionsByBeat[action.beat].push(action);
    }

    const beatNumbers = Object.keys(actionsByBeat).map(Number).sort((a, b) => a - b);

    for (const beatNum of beatNumbers) {
      const beatName = exportData.beats?.[beatNum - 1]?.name || `Beat ${beatNum}`;
      if (beatNum > 1) {
        addMessage('system', `<span class="beat-transition-line"></span><span class="beat-transition-text">\u27e1 ${beatName} \u27e1</span><span class="beat-transition-line"></span>`);
      }

      for (const action of actionsByBeat[beatNum]) {
        // Player choice
        addMessage('choice', `\u2192 ${action.choiceText || ''}`);

        // Dice result
        let diceResult = action.diceResult;
        if (typeof diceResult === 'string') {
          try { diceResult = JSON.parse(diceResult); } catch { diceResult = null; }
        }
        if (diceResult) {
          const dr = diceResult;
          addMessage('dice',
            `\ud83c\udfb2 ${action.dominantStat}: d20(${dr.roll})+${dr.modifier}=${dr.total} vs DC ${dr.dc} \u2014 ${dr.success ? 'Succ\u00e8s' : '\u00c9chec'}`,
            null, dr.success
          );
        }

        // Narration
        const narrationText = action.narrationText || action.narration || '';
        if (narrationText) {
          const msg = document.createElement('div');
          msg.className = 'message message-narration';
          msg.innerHTML = formatNarration(narrationText);
          chatMessages.appendChild(msg);
        }
      }
    }

    // Completed banner
    addMessage('system', '<span class="beat-transition-line"></span><span class="beat-transition-text">Partie Termin\u00e9e</span><span class="beat-transition-line"></span>');

    // Read-only choices area
    choicesArea.innerHTML = '';
    const notice = document.createElement('p');
    notice.className = 'read-only-notice';
    notice.textContent = 'Cette partie est termin\u00e9e. Vous pouvez relire l\u2019histoire.';
    choicesArea.appendChild(notice);

    const btnRow = document.createElement('div');
    btnRow.className = 'end-review-actions';

    const btnReport = document.createElement('button');
    btnReport.className = 'btn-end-action btn-end-primary';
    btnReport.textContent = 'Voir le Rapport';
    btnReport.addEventListener('click', () => showEndScreen());

    const btnBackTitle = document.createElement('button');
    btnBackTitle.className = 'btn-end-action btn-end-secondary';
    btnBackTitle.textContent = 'Retour au menu';
    btnBackTitle.addEventListener('click', () => {
      state.sessionId = null;
      state.character = null;
      state.gameCompleted = false;
      chatMessages.innerHTML = '';
      choicesArea.innerHTML = '';
      screenGame.classList.remove('active');
      screenHub.classList.add('active');
      document.title = 'Projet A15';
    });

    btnRow.appendChild(btnReport);
    btnRow.appendChild(btnBackTitle);
    choicesArea.appendChild(btnRow);
    hideFreeInput();

    hideLoadingOverlay();
    chatMessages.scrollTop = chatMessages.scrollHeight;

  } catch (err) {
    console.error('View archive failed:', err);
    hideLoadingOverlay();
    alert('Erreur lors du chargement: ' + err.message);
  }
}

async function deleteCompletedGame(sessionId, rowElement) {
  try {
    const res = await fetchWithTimeout(`${API}/game/${sessionId}`, { method: 'DELETE' });
    if (res.ok) {
      rowElement.style.opacity = '0';
      rowElement.style.transform = 'translateX(20px)';
      rowElement.style.transition = 'all 0.3s';
      setTimeout(() => rowElement.remove(), 300);
      showToast('Archive supprim\u00e9e', 'success');
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur de suppression', 'error');
    }
  } catch (err) {
    console.error('Delete archive failed:', err);
    showToast('Erreur de suppression', 'error');
  }
}

// ── Boot ──
init();
