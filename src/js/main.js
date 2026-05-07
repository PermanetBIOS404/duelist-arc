const grid = document.getElementById('card-grid');
const detail = document.getElementById('card-detail');
const searchInput = document.getElementById('search');
const datasetSelect = document.getElementById('dataset-select');
const datasetLoadBtn = document.getElementById('dataset-load');
const datasetFileInput = document.getElementById('dataset-file');
const typeFilter = document.getElementById('type-filter');
const attrFilter = document.getElementById('attr-filter');
const raceFilter = document.getElementById('race-filter');
const archFilter = document.getElementById('arch-filter');
const kindFilter = document.getElementById('kind-filter');
const tagFilter = document.getElementById('tag-filter');
const stFilter = document.getElementById('st-filter');
const banTcgFilter = document.getElementById('ban-tcg');
const banOcgFilter = document.getElementById('ban-ocg');
const banGoatFilter = document.getElementById('ban-goat');
const levelMinInput = document.getElementById('level-min');
const levelMaxInput = document.getElementById('level-max');
const atkMinInput = document.getElementById('atk-min');
const atkMaxInput = document.getElementById('atk-max');
const defMinInput = document.getElementById('def-min');
const defMaxInput = document.getElementById('def-max');
const favFilter = document.getElementById('fav-filter');
const sortSelect = document.getElementById('sort');
const viewModeSelect = document.getElementById('view-mode');
const thumbSizeSelect = document.getElementById('thumb-size');
const previewToggle = document.getElementById('preview-toggle');
const layoutSelect = document.getElementById('layout-select');
const layoutSaveBtn = document.getElementById('layout-save');
const layoutDelBtn = document.getElementById('layout-del');
const quickChipsEl = document.getElementById('quick-chips');
const activeFiltersEl = document.getElementById('active-filters');
const clearBtn = document.getElementById('clear');
const countEl = document.getElementById('count');
const datasetStatusEl = document.getElementById('dataset-status');
const datasetDetailsEl = document.getElementById('dataset-details');
const datasetDetailsBodyEl = document.getElementById('dataset-details-body');
const datasetSaveBtn = document.getElementById('dataset-save');
const datasetRenameBtn = document.getElementById('dataset-rename');
const datasetDeleteBtn = document.getElementById('dataset-delete');

// Full-stack foundation (minimal): server-backed auth + decks.
let apiUser = null;
let deckSyncMode = 'guest'; // 'guest' | 'api'
let deckSyncTimer = 0;

let BACKEND_AVAILABLE = true;

function withTimeout(promise, ms) {
    const timeoutMs = Number.isFinite(Number(ms)) ? Number(ms) : 1000;
    if (timeoutMs <= 0) return promise;
    let timer = 0;
    const t = new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(new Error('timeout')), timeoutMs);
    });
    return Promise.race([promise, t]).finally(() => {
        if (timer) window.clearTimeout(timer);
    });
}

async function detectBackend() {
    try {
        const res = await withTimeout(fetch('/healthz', { cache: 'no-store' }), 1200);
        BACKEND_AVAILABLE = !!res && res.ok;
    } catch {
        BACKEND_AVAILABLE = false;
    }
    return BACKEND_AVAILABLE;
}

function removeServerDatasetOption() {
    if (!(datasetSelect instanceof HTMLSelectElement)) return;
    const opts = Array.from(datasetSelect.options);
    for (const o of opts) {
        if (String(o?.value || '') === '/cards/all.json') {
            try {
                datasetSelect.removeChild(o);
            } catch {
                // ignore
            }
        }
    }
}

function applyStaticModeUi() {
    const banner = document.getElementById('static-build-banner');
    if (!BACKEND_AVAILABLE && banner instanceof HTMLElement) banner.hidden = false;

    if (BACKEND_AVAILABLE) return;

    // Hide backend-only CTAs on the demo landing and duel tab.
    const hideIds = [
        'demo-cta-cpu',
        'demo-tile-cpu',
        'duel-browser-primary-start',
        'duel-session-start',
        'duel-session-resume',
        'duel-session-send-default',
        'duel-session-send',
        'duel-session-stop',
        'duel-local-start',
        'duel-local-stop',
        'duel-local-send',
        'duel-local-process',
        'duel-start',
        'duel-stop',
    ];
    for (const id of hideIds) {
        const el = document.getElementById(id);
        if (el instanceof HTMLElement) el.hidden = true;
    }

    // Hide auth controls (they require backend cookies + DB).
    const duelAuthEl = document.getElementById('duel-auth');
    if (duelAuthEl instanceof HTMLElement) duelAuthEl.hidden = true;
    const platLoginBtn = document.getElementById('plat-user-login');
    if (platLoginBtn instanceof HTMLElement) platLoginBtn.hidden = true;

    // Update messaging to be explicit for static hosting.
    const onlineSoon = document.getElementById('duel-online-soon-text');
    if (onlineSoon instanceof HTMLElement) {
        onlineSoon.textContent =
            'Static launch build: accounts, online PvP, and server-powered CPU duels require the hosted server stack (coming soon). Deck tools still work in-browser.';
    }

    removeServerDatasetOption();
}

async function apiFetchJson(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'same-origin',
    });
    const text = await res.text();
    const data = text ? safeJsonParse(text) : null;
    if (!res.ok) {
        const code = data && typeof data === 'object' ? String(data.error || '') : '';
        const message = data && typeof data === 'object' ? String(data.message || '') : '';
        const err = new Error(code || `HTTP ${res.status}`);
        err.status = res.status;
        err.code = code || '';
        err.userMessage = message || '';
        throw err;
    }
    return data;
}

function safeJsonParse(text) {
    try {
        return JSON.parse(String(text || ''));
    } catch {
        return null;
    }
}

async function apiGetMe() {
    const data = await apiFetchJson('/me');
    return data && data.user ? data.user : null;
}

async function apiRegister(handle, password, email = '') {
    const payload = { handle, password };
    const e = String(email || '').trim();
    if (e) payload.email = e;
    const data = await apiFetchJson('/auth/register', { method: 'POST', body: payload });
    return data && data.user ? data.user : null;
}

async function apiLogin(handle, password) {
    const data = await apiFetchJson('/auth/login', { method: 'POST', body: { handle, password } });
    return data && data.user ? data.user : null;
}

async function apiLogout() {
    await apiFetchJson('/auth/logout', { method: 'POST' });
}

async function apiGetProfile() {
    const data = await apiFetchJson('/auth/profile');
    return data && data.user ? data.user : null;
}

async function apiSaveEmail(email) {
    const data = await apiFetchJson('/auth/email', { method: 'POST', body: { email } });
    return data && typeof data === 'object' ? data : { ok: true };
}

async function apiListDecks() {
    const data = await apiFetchJson('/decks');
    return Array.isArray(data?.decks) ? data.decks : [];
}

async function apiUpsertDeck({ id, name, deck }) {
    const data = await apiFetchJson('/decks', { method: 'POST', body: { id, name, deck } });
    return data && data.deck ? data.deck : null;
}

async function apiDeleteDeck(id) {
    const data = await apiFetchJson(`/decks/${id}`, { method: 'DELETE' });
    return !!data?.ok;
}

async function apiListMatches() {
    const data = await apiFetchJson('/matches');
    return Array.isArray(data?.matches) ? data.matches : [];
}

async function apiCreateMatch({ opponentHandle, result, format = 'tcg', deckAId = null, deckBId = null }) {
    const data = await apiFetchJson('/matches', {
        method: 'POST',
        body: { opponentHandle, result, format, deckAId, deckBId },
    });
    return data && data.match ? data.match : null;
}

async function apiGetTournaments() {
    const data = await apiFetchJson('/tournaments');
    return data && typeof data === 'object' ? data : { season: null, standings: [] };
}

function isApiDeckId(id) {
    return typeof id === 'string' && id.startsWith('srv_');
}

function apiDeckIdToNumber(id) {
    if (!isApiDeckId(id)) return null;
    const n = Number(id.slice('srv_'.length));
    return Number.isFinite(n) ? n : null;
}

async function bootstrapAuthAndDecks() {
    try {
        const me = await apiGetMe();
        apiUser = me;
    } catch {
        apiUser = null;
    }

    if (apiUser && apiUser.id) {
        deckSyncMode = 'api';
        await replaceDeckStoreFromApi();
    } else {
        deckSyncMode = 'guest';
        switchToGuestDeckStore();
    }
}

function switchToGuestDeckStore() {
    deckStore = loadDeckStore();
    activeDeckId = deckStore.activeId;
    deck = deckStore.decks?.[activeDeckId] || emptyDeck();
    if (!deckStore.decks) deckStore.decks = {};
    deckStore.decks[activeDeckId] = deck;
    populateDeckSelect();
    populateDeckCompareSelect();
    if (deckNameInput) deckNameInput.value = deck.name || '';
    if (deckNotesInput) deckNotesInput.value = deck.notes || '';
    renderDeck();
}

async function replaceDeckStoreFromApi() {
    let decks = [];
    try {
        decks = await apiListDecks();
    } catch (e) {
        console.warn('Deck API unavailable; staying in guest mode.', e);
        deckSyncMode = 'guest';
        switchToGuestDeckStore();
        return;
    }

    if (!Array.isArray(decks) || decks.length === 0) {
        // First login: seed one deck from local legacy if it exists, otherwise empty deck.
        const seed = deck && typeof deck === 'object' ? deck : emptyDeck();
        const name = (seed.name || '').trim() || 'My Deck';
        try {
            await apiUpsertDeck({ id: null, name, deck: seed });
            decks = await apiListDecks();
        } catch (e) {
            console.warn('Failed to seed initial deck.', e);
        }
    }

    const byId = {};
    const order = [];
    for (const d of decks) {
        const sid = `srv_${Number(d.id)}`;
        byId[sid] = sanitizeDeckObject(d.deck);
        byId[sid].name = String(d.name || byId[sid].name || '');
        byId[sid].updatedAt = Number(d.updatedAt || byId[sid].updatedAt || 0);
        order.push(sid);
    }

    if (order.length === 0) return;
    const nextActiveId = order[0];
    deckStore = { version: 1, activeId: nextActiveId, order, decks: byId };
    activeDeckId = nextActiveId;
    deck = deckStore.decks[nextActiveId];
    populateDeckSelect();
    populateDeckCompareSelect();
    if (deckNameInput) deckNameInput.value = deck.name || '';
    if (deckNotesInput) deckNotesInput.value = deck.notes || '';
    renderDeck();
}

function scheduleActiveDeckSync() {
    if (deckSyncMode !== 'api') return;
    const deckId = apiDeckIdToNumber(activeDeckId);
    if (!deckId) return;
    if (deckSyncTimer) window.clearTimeout(deckSyncTimer);
    deckSyncTimer = window.setTimeout(async () => {
        deckSyncTimer = 0;
        try {
            const name = (deck?.name || '').trim() || 'Untitled';
            await apiUpsertDeck({ id: deckId, name, deck });
        } catch (e) {
            console.warn('Deck sync failed:', e);
        }
    }, 500);
}
const datasetExportBtn = document.getElementById('dataset-export');
const deckNameInput = document.getElementById('deck-name');
const deckNotesInput = document.getElementById('deck-notes');
const deckMetaEl = document.getElementById('deck-meta');
const deckWarningsEl = document.getElementById('deck-warnings');
const deckCompareSelect = document.getElementById('deck-compare');
const deckCompareOut = document.getElementById('deck-compare-out');
const deckCompareCopyBtn = document.getElementById('deck-compare-copy');
const deckCopyListIdsBtn = document.getElementById('deck-copy-list-ids');
const deckPruneUnknownBtn = document.getElementById('deck-prune-unknown');
const oddsTrialsSelect = document.getElementById('odds-trials');
const oddsHandSelect = document.getElementById('odds-hand');
const oddsTargetLockHand = document.getElementById('odds-target-lock-hand');
const oddsRunBtn = document.getElementById('odds-run');
const oddsClearBtn = document.getElementById('odds-clear');
const oddsClearExtBtn = document.getElementById('odds-clear-ext');
const oddsClearHandtrapBtn = document.getElementById('odds-clear-handtrap');
const oddsClearBrickBtn = document.getElementById('odds-clear-brick');
const oddsBulkRoleSelect = document.getElementById('odds-bulk-role');
const oddsBulkModeSelect = document.getElementById('odds-bulk-mode');
const oddsBulkApplyBtn = document.getElementById('odds-bulk-apply');
const oddsTargetPresetSelect = document.getElementById('odds-target-preset');
const oddsTargetMinStarter = document.getElementById('odds-target-min-starter');
const oddsTargetMinExtender = document.getElementById('odds-target-min-extender');
const oddsTargetMinHandtrap = document.getElementById('odds-target-min-handtrap');
const oddsTargetMaxBrick = document.getElementById('odds-target-max-brick');
const oddsListEl = document.getElementById('odds-list');
const oddsOutEl = document.getElementById('odds-out');
const oddsPanelEl = document.getElementById('odds-panel');
const oddsPanelHeaderEl = oddsPanelEl?.querySelector('.odds-panel-header');
const oddsMinimizeBtn = document.getElementById('odds-minimize');
const oddsRestoreTabBtn = document.getElementById('odds-restore-tab');
const deckLabHintEl = document.getElementById('deck-lab-hint');
const deckLabHintOpenBtn = document.getElementById('deck-lab-hint-open');
const deckLabHintCloseBtn = document.getElementById('deck-lab-hint-close');
const deckListEl = document.getElementById('deck-list');
const deckExportBtn = document.getElementById('deck-export');
const deckExportListBtn = document.getElementById('deck-export-list');
const deckExportYdkBtn = document.getElementById('deck-export-ydk');
const deckImportBtn = document.getElementById('deck-import');
const deckImportListBtn = document.getElementById('deck-import-list');
deckImportListBtn.addEventListener('click', async () => {
    const text = window.prompt('Paste your deck list (card IDs or names, one per line):');
    if (!text) return;

    const lines = String(text)
        .split('\n')
        .map(x => x.trim())
        .filter(Boolean);

    const main = [];
    const extra = [];

    for (const line of lines) {
        const id = Number(line);
        if (!Number.isFinite(id)) continue;

        // Basic split: assume extra deck IDs are known later (for now everything goes to main)
        main.push(id);
    }

    if (main.length === 0) {
        alert('No valid card IDs found.');
        return;
    }

    // Replace current deck
    deck = {
        main,
        extra: [],
    };

    if (!deckStore.decks) deckStore.decks = {};
    deckStore.decks[activeDeckId] = deck;

    // Persist
    localStorage.setItem(DECKS_KEY, JSON.stringify(deckStore));

    alert(`Imported deck with ${main.length} cards.`);
});
const deckImportYdkBtn = document.getElementById('deck-import-ydk');
const deckFileInput = document.getElementById('deck-file');
const deckImportFileBtn = document.getElementById('deck-import-file');
const deckDownloadFormatSelect = document.getElementById('deck-download-format');
const deckDownloadBtn = document.getElementById('deck-download');
const deckClearBtn = document.getElementById('deck-clear');
const deckSelectEl = document.getElementById('deck-select');
const deckNewBtn = document.getElementById('deck-new');
const deckDupBtn = document.getElementById('deck-dup');
const deckDelBtn = document.getElementById('deck-del');
const goldfishMetaEl = document.getElementById('goldfish-meta');
const goldfishHandStatsEl = document.getElementById('goldfish-handstats');
const goldfishOpeningSelect = document.getElementById('goldfish-opening');
const goldfishNewBtn = document.getElementById('goldfish-new');
const goldfishMulliganBtn = document.getElementById('goldfish-mulligan');
const goldfishKeepBtn = document.getElementById('goldfish-keep');
const goldfishDrawBtn = document.getElementById('goldfish-draw');
const goldfishNextBtn = document.getElementById('goldfish-next');
const goldfishResetBtn = document.getElementById('goldfish-reset');
const goldfishCopyAiBtn = document.getElementById('goldfish-copy-ai');
const goldfishHandEl = document.getElementById('goldfish-hand');
const goldfishFieldEl = document.getElementById('goldfish-field');
const goldfishGyEl = document.getElementById('goldfish-gy');
const goldfishBanishEl = document.getElementById('goldfish-banish');
const cardPreviewEl = document.getElementById('card-preview');
const imageModalEl = document.getElementById('image-modal');
const modalTitleEl = document.getElementById('modal-title');
const modalImgEl = document.getElementById('modal-img');
const modalPrevBtn = document.getElementById('modal-prev');
const modalNextBtn = document.getElementById('modal-next');
const modalZoomBtn = document.getElementById('modal-zoom');
const viewTabsEl = document.getElementById('view-tabs');
const viewTabDemoBtn = document.getElementById('view-tab-demo');
const viewTabSelectBtn = document.getElementById('view-tab-select');
const viewTabDuelBtn = document.getElementById('view-tab-duel');
const demoModeChk = document.getElementById('demo-mode');
const demoTourOpenBtn = document.getElementById('demo-tour-open');
const viewDemoEl = document.getElementById('view-demo');
const viewSelectionEl = document.getElementById('view-selection');
const viewDuelEl = document.getElementById('view-duel');
const duelRuleSelect = document.getElementById('duel-rule');
const duelBanlistInput = document.getElementById('duel-banlist');
const duelBanlistSelect = document.getElementById('duel-banlist-select');
const duelBanlistQuickEl = document.getElementById('duel-banlist-quick');
const duelBotNameInput = document.getElementById('duel-bot-name');
const duelBotDeckInput = document.getElementById('duel-bot-deck');
const duelStartBtn = document.getElementById('duel-start');
const duelStopBtn = document.getElementById('duel-stop');
const duelOutEl = document.getElementById('duel-out');
const duelServiceHealthEl = document.getElementById('duel-service-health');
const duelOnlineSoonTextEl = document.getElementById('duel-online-soon-text');
const duelBrowserPrimaryStartBtn = document.getElementById('duel-browser-primary-start');
const duelBrowserPrimaryStatusEl = document.getElementById('duel-browser-primary-status');
const duelQuickDeckUploadBtn = document.getElementById('duel-quickdeck-upload');
const duelQuickDeckPasteBtn = document.getElementById('duel-quickdeck-paste');
const duelQuickDeckDraw5Btn = document.getElementById('duel-quickdeck-draw5');
const duelQuickDeckMulliganBtn = document.getElementById('duel-quickdeck-mulligan');
const duelQuickDeckOpenBuilderBtn = document.getElementById('duel-quickdeck-open-builder');
const duelQuickDeckOutEl = document.getElementById('duel-quickdeck-out');
const duelSampleDeckSelect = document.getElementById('duel-sample-deck');
const duelSampleDeckLoadBtn = document.getElementById('duel-sample-deck-load');
const duelLoginRequiredEl = document.getElementById('duel-login-required');
const duelAdvancedToggleBtn = document.getElementById('duel-advanced-toggle');
const duelCpuBlockEl = document.getElementById('duel-cpu-block');
const duelAdvancedBlockEl = document.getElementById('duel-advanced-block');
const duelAuthStatusEl = document.getElementById('duel-auth-status');
const duelAuthHandleInput = document.getElementById('duel-auth-handle');
const duelAuthPassInput = document.getElementById('duel-auth-pass');
const duelAuthEmailRegisterInput = document.getElementById('duel-auth-email-register');
const duelAuthLoginBtn = document.getElementById('duel-auth-login');
const duelAuthRegisterBtn = document.getElementById('duel-auth-register');
const duelAuthLogoutBtn = document.getElementById('duel-auth-logout');
const duelAuthEmailBlockEl = document.getElementById('duel-auth-email');
const duelAuthEmailInput = document.getElementById('duel-auth-email-input');
const duelAuthEmailSaveBtn = document.getElementById('duel-auth-email-save');
const duelLocalStartBtn = document.getElementById('duel-local-start');
const duelLocalStopBtn = document.getElementById('duel-local-stop');
const duelLocalProcessBtn = document.getElementById('duel-local-process');
const duelLocalAutoChk = document.getElementById('duel-local-auto');
const duelLocalRawInput = document.getElementById('duel-local-raw');
const duelLocalReplierInput = document.getElementById('duel-local-replier');
const duelLocalSendBtn = document.getElementById('duel-local-send');
const duelLocalOutEl = document.getElementById('duel-local-out');
const duelLocalHealthEl = document.getElementById('duel-local-health');
const duelLocalBlockEl = document.getElementById('duel-local-block');
const duelSessionStartBtn = document.getElementById('duel-session-start');
const duelSessionResumeBtn = document.getElementById('duel-session-resume');
const duelSessionStopBtn = document.getElementById('duel-session-stop');
const duelSessionProcessBtn = document.getElementById('duel-session-process');
const duelSessionAutoChk = document.getElementById('duel-session-auto');
const duelSessionRawInput = document.getElementById('duel-session-raw');
const duelSessionReplierInput = document.getElementById('duel-session-replier');
const duelSessionSendBtn = document.getElementById('duel-session-send');
const duelSessionOutEl = document.getElementById('duel-session-out');
const duelSessionHealthEl = document.getElementById('duel-session-health');
const duelSessionPromptEl = document.getElementById('duel-session-prompt');

const demoTourModalEl = document.getElementById('demo-tour');
const demoTourCloseBtn = document.getElementById('demo-tour-close');
const demoTourStepEl = document.getElementById('demo-tour-step');
const demoTourBackBtn = document.getElementById('demo-tour-back');
const demoTourNextBtn = document.getElementById('demo-tour-next');
const demoTourDoneBtn = document.getElementById('demo-tour-done');

const demoBuildBannerEl = document.getElementById('demo-build-banner');
const demoBuildInlineEl = document.getElementById('demo-build-inline');
const demoBuildFooterEl = document.getElementById('demo-build-footer');

const demoStatusEl = document.getElementById('demo-status');
const demoCopyLinkBtn = document.getElementById('demo-copy-link');
const demoDiagnosticsBtn = document.getElementById('demo-diagnostics');
const demoResetLocalBtn = document.getElementById('demo-reset-local');
const demoFeedbackBtn = document.getElementById('demo-feedback');
const cpuReadinessEl = document.getElementById('cpu-readiness');

const demoSettingsOpenBtn = document.getElementById('demo-settings-open');
const demoSettingsEl = document.getElementById('demo-settings');
const demoSettingsCloseBtn = document.getElementById('demo-settings-close');
const demoThemeLightChk = document.getElementById('demo-theme-light');
const demoModeDrawerChk = document.getElementById('demo-mode-drawer');
const demoCopyLinkDrawerBtn = document.getElementById('demo-copy-link-drawer');
const demoTourOpenDrawerBtn = document.getElementById('demo-tour-open-drawer');
const demoDiagnosticsDrawerBtn = document.getElementById('demo-diagnostics-drawer');
const demoResetLocalDrawerBtn = document.getElementById('demo-reset-local-drawer');
const demoFeedbackDrawerBtn = document.getElementById('demo-feedback-drawer');

const demoDiagnosticsModalEl = document.getElementById('demo-diagnostics-modal');
const demoDiagnosticsCloseBtn = document.getElementById('demo-diagnostics-close');
const demoDiagnosticsCopyBtn = document.getElementById('demo-diagnostics-copy');
const demoDiagnosticsPreEl = document.getElementById('demo-diagnostics-pre');

const demoCtaUploadBtn = document.getElementById('demo-cta-upload');
const demoCtaSampleBtn = document.getElementById('demo-cta-sample');
const demoCtaDrawBtn = document.getElementById('demo-cta-draw');
const demoCtaCpuBtn = document.getElementById('demo-cta-cpu');
const demoCtaRealmsBtn = document.getElementById('demo-cta-realms');
const demoCtaLaunchSkeletonBtn = document.getElementById('demo-cta-launch-skeleton');
const demoTileUploadBtn = document.getElementById('demo-tile-upload');
const demoTileSampleBtn = document.getElementById('demo-tile-sample');
const demoTileDrawBtn = document.getElementById('demo-tile-draw');
const demoTileMullBtn = document.getElementById('demo-tile-mull');
const demoTileCpuBtn = document.getElementById('demo-tile-cpu');
const demoTileTourBtn = document.getElementById('demo-tile-tour');
const duelSessionDefaultRawInput = document.getElementById('duel-session-default-raw');
const duelSessionSendDefaultBtn = document.getElementById('duel-session-send-default');
const duelSessionChoicesEl = document.getElementById('duel-session-choices');
const duelHudTurnEl = document.getElementById('duel-hud-turn');
const duelHudPhaseEl = document.getElementById('duel-hud-phase');
const duelHudLp0El = document.getElementById('duel-hud-lp0');
const duelHudLp1El = document.getElementById('duel-hud-lp1');
const duelHudStatusEl = document.getElementById('duel-hud-status');
const duelSessionDeckP1El = document.getElementById('duel-session-deck-p1');
const duelSessionDeckP2El = document.getElementById('duel-session-deck-p2');
const duelSessionDeckStatusEl = document.getElementById('duel-session-deck-status');
const modalCloseBtn = document.getElementById('modal-close');

let cards = [];
let filtered = [];
let selectedCard = null;
let focusedCardId = null;
let lastDatasetRawText = '';
let lastDatasetSourceLabel = '';
let goldfish = loadGoldfish();

const FAVORITES_KEY = 'ygo_favorites_v1';
let favorites = loadFavorites();

const DECK_KEY = 'ygo_deck_v1';
const DECKS_KEY = 'ygo_decks_v1';
const DECK_SECTIONS = ['main', 'extra', 'side'];

function emptyDeck() {
    return { version: 2, name: '', notes: '', updatedAt: Date.now(), sections: { main: {}, extra: {}, side: {} } };
}

let deckStore = loadDeckStore();
let activeDeckId = deckStore.activeId;
let deck = deckStore.decks?.[activeDeckId] || emptyDeck();
if (!deckStore.decks) deckStore.decks = {};
deckStore.decks[activeDeckId] = deck;
saveDeckStore();

const DATASET_PREF_KEY = 'ygo_dataset_pref_v1';
const DATASET_CUSTOM_KEY = 'ygo_dataset_custom_v1';
const DATASET_STORE_KEY = 'ygo_dataset_store_v1';
const UI_VIEW_KEY = 'ygo_ui_view_v1';
const UI_THUMB_KEY = 'ygo_ui_thumb_v1';
const UI_PREVIEW_KEY = 'ygo_ui_preview_v1';
const UI_LAYOUTS_KEY = 'ygo_ui_layouts_v1';
const UI_LAYOUT_ACTIVE_KEY = 'ygo_ui_layout_active_v1';
const DECK_ODDS_ROLES_KEY = 'ygo_deck_odds_roles_v1';
const ODDS_UI_PREFS_KEY = 'ygo_odds_ui_prefs_v1';
const ODDS_PANEL_PREFS_KEY = 'ygo_odds_panel_prefs_v1';
const UI_ACTIVE_VIEW_KEY = 'ygo_ui_active_view_v1';
const DECK_LAB_HINT_DISMISS_KEY = 'ygo_deck_lab_hint_dismissed_v1';
const DEMO_MODE_KEY = 'ygo_demo_mode_v1';
const DEMO_TOUR_DONE_KEY = 'ygo_demo_tour_done_v1';
const DUEL_ADV_KEY = 'ygo_duel_advanced_ui_v1';
const DUEL_CPU_MODE_KEY = 'ygo_duel_cpu_mode_v1';
const THEME_KEY = 'ygo_theme_v1';

// Demo label (single place to update for demo-day messaging).
const DEMO_BUILD_LABEL = 'Preview build • May 7, 2026';

const SAMPLE_DECKS = [
    {
        id: 'classic_demo',
        name: 'Classic Demo (40)',
        text: `## Main
3x Dark Magician
2x Summoned Skull
2x Celtic Guardian
2x La Jinn the Mystical Genie of the Lamp
2x Wall of Illusion
2x Man-Eater Bug
2x Sangan
2x Witch of the Black Forest
2x Kuriboh
2x Mystical Elf
1x Exodia the Forbidden One
1x Left Arm of the Forbidden One
1x Right Arm of the Forbidden One
1x Left Leg of the Forbidden One
1x Right Leg of the Forbidden One
1x Monster Reborn
1x Raigeki
1x Dark Hole
2x Mystical Space Typhoon
2x Book of Moon
2x Fissure
2x Trap Hole
2x Mirror Force
2x Magic Cylinder
2x Negate Attack
1x Torrential Tribute
1x Call of the Haunted`,
    },
    {
        id: 'goat_staples',
        name: 'GOAT-ish Staples (40)',
        text: `## Main
2x Black Luster Soldier - Envoy of the Beginning
2x Chaos Sorcerer
1x Jinzo
1x Tribe-Infecting Virus
2x D. D. Warrior Lady
2x Breaker the Magical Warrior
2x Magician of Faith
2x Night Assailant
2x Sinister Serpent
2x Sangan
2x Spirit Reaper
2x Mystic Tomato
2x Shining Angel
2x Exiled Force
1x Monster Reborn
1x Heavy Storm
1x Harpie's Feather Duster
2x Mystical Space Typhoon
2x Book of Moon
1x Snatch Steal
1x Brain Control
1x Graceful Charity
1x Pot of Greed
1x Delinquent Duo
2x Sakuretsu Armor
2x Bottomless Trap Hole
1x Mirror Force
1x Torrential Tribute
1x Call of the Haunted`,
    },
    {
        id: 'spellcaster_demo',
        name: 'Spellcaster Demo (40)',
        text: `## Main
3x Dark Magician
2x Dark Magician Girl
2x Magician's Rod
2x Apprentice Illusion Magician
2x Magicians' Souls
2x Effect Veiler
2x Ash Blossom & Joyous Spring
2x Illusion of Chaos
2x Skilled Dark Magician
2x Spellbook Magician of Prophecy
2x Monster Reborn
2x Secrets of Dark Magic
2x Dark Magical Circle
2x Soul Servant
2x Magician Navigation
2x Eternal Soul
2x Mystical Space Typhoon
2x Book of Moon
2x Called by the Grave
1x Raigeki
1x Dark Hole`,
    },
];

function loadOddsUiPrefs() {
    try {
        const raw = localStorage.getItem(ODDS_UI_PREFS_KEY) || '';
        const obj = raw ? JSON.parse(raw) : null;
        return obj && typeof obj === 'object' ? obj : {};
    } catch {
        return {};
    }
}

function saveOddsUiPrefs(next) {
    try {
        localStorage.setItem(ODDS_UI_PREFS_KEY, JSON.stringify(next || {}));
    } catch {
        // ignore
    }
}

function loadOddsPanelPrefs() {
    try {
        const raw = localStorage.getItem(ODDS_PANEL_PREFS_KEY) || '';
        const obj = raw ? JSON.parse(raw) : null;
        return obj && typeof obj === 'object' ? obj : {};
    } catch {
        return {};
    }
}

function saveOddsPanelPrefs(next) {
    try {
        localStorage.setItem(ODDS_PANEL_PREFS_KEY, JSON.stringify(next || {}));
    } catch {
        // ignore
    }
}

function isDeckLabHintDismissed() {
    try {
        return localStorage.getItem(DECK_LAB_HINT_DISMISS_KEY) === '1';
    } catch {
        return false;
    }
}

function setDeckLabHintDismissed(on) {
    try {
        localStorage.setItem(DECK_LAB_HINT_DISMISS_KEY, on ? '1' : '0');
    } catch {
        // ignore
    }
}

function updateDeckLabHint({ minimized } = {}) {
    if (!(deckLabHintEl instanceof HTMLElement)) return;
    const isMin = typeof minimized === 'boolean' ? minimized : !!oddsPanelEl?.hidden;
    const activeView = (() => {
        try {
            return String(localStorage.getItem(UI_ACTIVE_VIEW_KEY) || '').trim() || 'select';
        } catch {
            return 'select';
        }
    })();
    const shouldShow = activeView === 'select' && isMin && !isDeckLabHintDismissed();
    deckLabHintEl.hidden = !shouldShow;
}

function setOddsPanelMinimized(on, { save = true } = {}) {
    if (!(oddsPanelEl instanceof HTMLElement)) return;
    const minimized = !!on;
    oddsPanelEl.hidden = minimized;
    if (oddsRestoreTabBtn instanceof HTMLElement) oddsRestoreTabBtn.hidden = !minimized;
    if (save) {
        const prefs = loadOddsPanelPrefs();
        prefs.minimized = minimized;
        saveOddsPanelPrefs(prefs);
    }
    updateDeckLabHint({ minimized });
}

function getHandSizeUi() {
    return clampInt(oddsHandSelect?.value ?? 5, 1, 10);
}

function isTargetPerHandEnabled() {
    if (oddsTargetLockHand) return !!oddsTargetLockHand.checked;
    const prefs = loadOddsUiPrefs();
    return !!prefs.targetPerHand;
}

function loadDeckOddsRoles() {
    try {
        const raw = localStorage.getItem(DECK_ODDS_ROLES_KEY) || '';
        const obj = raw ? JSON.parse(raw) : null;
        return obj && typeof obj === 'object' ? obj : {};
    } catch {
        return {};
    }
}

function saveDeckOddsRoles(store) {
    try {
        localStorage.setItem(DECK_ODDS_ROLES_KEY, JSON.stringify(store || {}));
    } catch {
        // ignore
    }
}

function getActiveDeckRoleStore() {
    const store = loadDeckOddsRoles();
    const id = String(activeDeckId || '');
    if (!store[id] || typeof store[id] !== 'object') store[id] = {};
    if (!store[id].starters || typeof store[id].starters !== 'object') store[id].starters = {};
    if (!store[id].extenders || typeof store[id].extenders !== 'object') store[id].extenders = {};
    if (!store[id].handtraps || typeof store[id].handtraps !== 'object') store[id].handtraps = {};
    if (!store[id].bricks || typeof store[id].bricks !== 'object') store[id].bricks = {};
    if (!store[id].target || typeof store[id].target !== 'object') {
        store[id].target = { preset: 'combo', minStarter: 1, minExtender: 1, minHandtrap: 0, maxBrick: 0 };
    }
    if (!store[id].targetByHand || typeof store[id].targetByHand !== 'object') {
        store[id].targetByHand = {};
    }
    return { store, deckKey: id, roles: store[id] };
}

function setStarterSelected(cardId, on) {
    const id = String(cardId || '');
    if (!id) return;
    const { store, deckKey, roles } = getActiveDeckRoleStore();
    if (on) roles.starters[id] = 1;
    else delete roles.starters[id];
    store[deckKey] = roles;
    saveDeckOddsRoles(store);
}

function updateRolesForActiveDeck(mutator) {
    const { store, deckKey, roles } = getActiveDeckRoleStore();
    try {
        mutator?.(roles);
    } catch {
        // ignore
    }
    store[deckKey] = roles;
    saveDeckOddsRoles(store);
}

function getTargetPrefsForActiveDeck(handSize = 5) {
    const { roles } = getActiveDeckRoleStore();
    const k = clampInt(handSize, 1, 10);
    const byHand = roles.targetByHand && typeof roles.targetByHand === 'object' ? roles.targetByHand : {};
    const fallback = roles.target && typeof roles.target === 'object' ? roles.target : {};
    const t = isTargetPerHandEnabled() && byHand[String(k)] && typeof byHand[String(k)] === 'object' ? byHand[String(k)] : fallback;
    return {
        preset: typeof t.preset === 'string' ? t.preset : 'custom',
        minStarter: clampInt(t.minStarter ?? 1, 0, 5),
        minExtender: clampInt(t.minExtender ?? 1, 0, 5),
        minHandtrap: clampInt(t.minHandtrap ?? 0, 0, 5),
        maxBrick: clampInt(t.maxBrick ?? 0, 0, 5)
    };
}

function saveTargetPrefsForActiveDeck(prefs, handSize = 5) {
    const next = {
        preset: typeof prefs?.preset === 'string' ? prefs.preset : 'custom',
        minStarter: clampInt(prefs?.minStarter ?? 0, 0, 5),
        minExtender: clampInt(prefs?.minExtender ?? 0, 0, 5),
        minHandtrap: clampInt(prefs?.minHandtrap ?? 0, 0, 5),
        maxBrick: clampInt(prefs?.maxBrick ?? 5, 0, 5)
    };
    const k = clampInt(handSize, 1, 10);
    updateRolesForActiveDeck((roles) => {
        if (isTargetPerHandEnabled()) {
            if (!roles.targetByHand || typeof roles.targetByHand !== 'object') roles.targetByHand = {};
            roles.targetByHand[String(k)] = next;
        } else {
            roles.target = next;
        }
    });
}

function getTargetPrefsFromUi() {
    return {
        preset: String(oddsTargetPresetSelect?.value || 'custom'),
        minStarter: clampInt(oddsTargetMinStarter?.value ?? 0, 0, 5),
        minExtender: clampInt(oddsTargetMinExtender?.value ?? 0, 0, 5),
        minHandtrap: clampInt(oddsTargetMinHandtrap?.value ?? 0, 0, 5),
        maxBrick: clampInt(oddsTargetMaxBrick?.value ?? 5, 0, 5)
    };
}

function syncTargetUiFromStore() {
    const t = getTargetPrefsForActiveDeck(getHandSizeUi());
    if (oddsTargetPresetSelect) oddsTargetPresetSelect.value = String(t.preset || 'custom');
    if (oddsTargetMinStarter) oddsTargetMinStarter.value = String(t.minStarter);
    if (oddsTargetMinExtender) oddsTargetMinExtender.value = String(t.minExtender);
    if (oddsTargetMinHandtrap) oddsTargetMinHandtrap.value = String(t.minHandtrap);
    if (oddsTargetMaxBrick) oddsTargetMaxBrick.value = String(t.maxBrick);
}

function clearStartersForActiveDeck() {
    const { store, deckKey, roles } = getActiveDeckRoleStore();
    roles.starters = {};
    store[deckKey] = roles;
    saveDeckOddsRoles(store);
}

function getStarterSetForActiveDeck() {
    const { roles } = getActiveDeckRoleStore();
    return new Set(Object.keys(roles.starters || {}));
}

function setExtenderSelected(cardId, on) {
    const id = String(cardId || '');
    if (!id) return;
    const { store, deckKey, roles } = getActiveDeckRoleStore();
    if (on) roles.extenders[id] = 1;
    else delete roles.extenders[id];
    store[deckKey] = roles;
    saveDeckOddsRoles(store);
}

function clearExtendersForActiveDeck() {
    const { store, deckKey, roles } = getActiveDeckRoleStore();
    roles.extenders = {};
    store[deckKey] = roles;
    saveDeckOddsRoles(store);
}

function getExtenderSetForActiveDeck() {
    const { roles } = getActiveDeckRoleStore();
    return new Set(Object.keys(roles.extenders || {}));
}

function setHandtrapSelected(cardId, on) {
    const id = String(cardId || '');
    if (!id) return;
    const { store, deckKey, roles } = getActiveDeckRoleStore();
    if (on) roles.handtraps[id] = 1;
    else delete roles.handtraps[id];
    store[deckKey] = roles;
    saveDeckOddsRoles(store);
}

function clearHandtrapsForActiveDeck() {
    const { store, deckKey, roles } = getActiveDeckRoleStore();
    roles.handtraps = {};
    store[deckKey] = roles;
    saveDeckOddsRoles(store);
}

function getHandtrapSetForActiveDeck() {
    const { roles } = getActiveDeckRoleStore();
    return new Set(Object.keys(roles.handtraps || {}));
}

function setBrickSelected(cardId, on) {
    const id = String(cardId || '');
    if (!id) return;
    const { store, deckKey, roles } = getActiveDeckRoleStore();
    if (on) roles.bricks[id] = 1;
    else delete roles.bricks[id];
    store[deckKey] = roles;
    saveDeckOddsRoles(store);
}

function clearBricksForActiveDeck() {
    const { store, deckKey, roles } = getActiveDeckRoleStore();
    roles.bricks = {};
    store[deckKey] = roles;
    saveDeckOddsRoles(store);
}

function getBrickSetForActiveDeck() {
    const { roles } = getActiveDeckRoleStore();
    return new Set(Object.keys(roles.bricks || {}));
}

function getFilteredMainDeckIdSet() {
    const mainObj = deck?.sections?.main || {};
    const mainIds = new Set(Object.keys(mainObj).map((id) => String(id)));
    const matches = new Set();
    for (const c of filtered || []) {
        const id = getCardId(c);
        if (!id) continue;
        if (mainIds.has(String(id))) matches.add(String(id));
    }
    return matches;
}

function applyBulkRoleFromCurrentView({ role, mode }) {
    const target = role === 'extender' ? 'extenders' : role === 'handtrap' ? 'handtraps' : role === 'brick' ? 'bricks' : 'starters';
    const op = mode === 'replace' ? 'replace' : mode === 'remove' ? 'remove' : 'add';
    const ids = getFilteredMainDeckIdSet();

    updateRolesForActiveDeck((roles) => {
        const obj = roles[target] || {};
        if (op === 'replace') {
            roles[target] = {};
            for (const id of ids) roles[target][id] = 1;
            return;
        }
        if (op === 'remove') {
            for (const id of ids) delete obj[id];
            roles[target] = obj;
            return;
        }
        // add
        for (const id of ids) obj[id] = 1;
        roles[target] = obj;
    });

    renderOddsPanel();
    if (oddsOutEl) {
        const label = role === 'extender' ? 'Extenders' : role === 'handtrap' ? 'Handtraps' : role === 'brick' ? 'Bricks' : 'Starters';
        const verb = op === 'replace' ? 'Replaced' : op === 'remove' ? 'Removed' : 'Added';
        oddsOutEl.innerHTML = `<span class="muted">${verb} ${ids.size} ${label.toLowerCase()} from current view.</span>`;
    }
}

function applyTargetPreset(preset) {
    const p = String(preset || 'custom');
    const setVals = ({ s, e, h, b }) => {
        if (oddsTargetMinStarter) oddsTargetMinStarter.value = String(s);
        if (oddsTargetMinExtender) oddsTargetMinExtender.value = String(e);
        if (oddsTargetMinHandtrap) oddsTargetMinHandtrap.value = String(h);
        if (oddsTargetMaxBrick) oddsTargetMaxBrick.value = String(b);
    };
    if (p === 'default') setVals({ s: 1, e: 0, h: 0, b: 0 });
    else if (p === 'going2') setVals({ s: 1, e: 0, h: 1, b: 0 });
    else if (p === 'grind') setVals({ s: 1, e: 0, h: 2, b: 1 });
    else if (p === 'combo') setVals({ s: 1, e: 1, h: 0, b: 0 });
    if (oddsTargetPresetSelect && p) oddsTargetPresetSelect.value = p;
}

function getTargetFromUi(handSize) {
    const k = Math.max(0, Number(handSize) || 0);
    return {
        minStarter: clampInt(oddsTargetMinStarter?.value ?? 0, 0, k),
        minExtender: clampInt(oddsTargetMinExtender?.value ?? 0, 0, k),
        minHandtrap: clampInt(oddsTargetMinHandtrap?.value ?? 0, 0, k),
        maxBrick: clampInt(oddsTargetMaxBrick?.value ?? k, 0, k)
    };
}

function formatPct(n) {
    if (!Number.isFinite(n)) return '0.0%';
    return `${(n * 100).toFixed(1)}%`;
}

function intersectCount(a, b) {
    if (!(a instanceof Set) || !(b instanceof Set)) return 0;
    let n = 0;
    for (const v of a) if (b.has(v)) n++;
    return n;
}

function clampInt(n, lo, hi) {
    const x = Number.parseInt(String(n ?? ''), 10);
    if (!Number.isFinite(x)) return lo;
    return Math.max(lo, Math.min(hi, x));
}

function buildMainDeckIdList() {
    const obj = deck?.sections?.main || {};
    const ids = [];
    for (const [id, qty] of Object.entries(obj)) {
        const n = Number(qty) || 0;
        for (let i = 0; i < n; i++) ids.push(String(id));
    }
    return ids;
}

function runOpeningHandSim({ trials, handSize, starterSet, extenderSet, handtrapSet, brickSet, target }) {
    const mainIds = buildMainDeckIdList();
    const deckSize = mainIds.length;
    const k = Math.max(0, Math.min(Number(handSize) || 5, deckSize));
    const t = Math.max(1, Number(trials) || 10000);
    const starters = starterSet instanceof Set ? starterSet : new Set();
    const extenders = extenderSet instanceof Set ? extenderSet : new Set();
    const handtraps = handtrapSet instanceof Set ? handtrapSet : new Set();
    const bricks = brickSet instanceof Set ? brickSet : new Set();
    const minStarter = clampInt(target?.minStarter ?? 0, 0, k);
    const minExtender = clampInt(target?.minExtender ?? 0, 0, k);
    const minHandtrap = clampInt(target?.minHandtrap ?? 0, 0, k);
    const maxBrick = clampInt(target?.maxBrick ?? k, 0, k);

    let hitAnyStarter = 0;
    let hitAnyExtender = 0;
    let hitBoth = 0;
    let hitAnyHandtrap = 0;
    let hitAnyBrick = 0;
    let hitNoBrick = 0;
    let hitStarterExtHandtrap = 0;
    let hitTarget = 0;
    const distStarters = new Array(k + 1).fill(0);
    const distExtenders = new Array(k + 1).fill(0);
    const distHandtraps = new Array(k + 1).fill(0);
    const distBricks = new Array(k + 1).fill(0);

    for (let trial = 0; trial < t; trial++) {
        const pool = mainIds.slice();
        let starterHits = 0;
        let extenderHits = 0;
        let handtrapHits = 0;
        let brickHits = 0;

        for (let i = 0; i < k; i++) {
            const j = i + Math.floor(Math.random() * (pool.length - i));
            const tmp = pool[i];
            pool[i] = pool[j];
            pool[j] = tmp;
            const id = pool[i];
            if (starters.has(id)) starterHits++;
            if (extenders.has(id)) extenderHits++;
            if (handtraps.has(id)) handtrapHits++;
            if (bricks.has(id)) brickHits++;
        }

        if (starterHits > 0) hitAnyStarter++;
        if (extenderHits > 0) hitAnyExtender++;
        if (starterHits > 0 && extenderHits > 0) hitBoth++;
        if (handtrapHits > 0) hitAnyHandtrap++;
        if (brickHits > 0) hitAnyBrick++;
        if (brickHits === 0) hitNoBrick++;
        if (starterHits > 0 && extenderHits > 0 && handtrapHits > 0) hitStarterExtHandtrap++;
        const okTarget =
            starterHits >= minStarter &&
            extenderHits >= minExtender &&
            handtrapHits >= minHandtrap &&
            brickHits <= maxBrick;
        if (okTarget) hitTarget++;
        distStarters[starterHits] = (distStarters[starterHits] || 0) + 1;
        distExtenders[extenderHits] = (distExtenders[extenderHits] || 0) + 1;
        distHandtraps[handtrapHits] = (distHandtraps[handtrapHits] || 0) + 1;
        distBricks[brickHits] = (distBricks[brickHits] || 0) + 1;
    }

    return {
        deckSize,
        handSize: k,
        trials: t,
        hitAnyStarter,
        hitAnyExtender,
        hitBoth,
        hitAnyHandtrap,
        hitAnyBrick,
        hitNoBrick,
        hitStarterExtHandtrap,
        hitTarget,
        distStarters,
        distExtenders,
        distHandtraps,
        distBricks
    };
}

function renderOddsPanel() {
    if (!oddsListEl || !oddsOutEl) return;

    const mainObj = deck?.sections?.main || {};
    const entries = Object.entries(mainObj)
        .map(([id, qty]) => {
            const n = Number(qty) || 0;
            if (n <= 0) return null;
            const card = cards.find((c) => String(c?.id ?? '') === String(id)) || null;
            return { id: String(id), qty: n, name: card?.name ? String(card.name) : String(id) };
        })
        .filter(Boolean)
        .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));

    const starters = getStarterSetForActiveDeck();
    const extenders = getExtenderSetForActiveDeck();
    const handtraps = getHandtrapSetForActiveDeck();
    const bricks = getBrickSetForActiveDeck();

    if (entries.length === 0) {
        oddsListEl.innerHTML = `<div class="muted" style="padding:10px;">Add cards to your Main deck to select starters.</div>`;
        oddsOutEl.innerHTML = `<span class="muted">No Main deck yet.</span>`;
        return;
    }

    oddsListEl.innerHTML = entries
        .map((e) => {
            const encoded = encodeURIComponent(e.id);
            const checkedStarter = starters.has(e.id) ? 'checked' : '';
            const checkedExtender = extenders.has(e.id) ? 'checked' : '';
            const checkedHandtrap = handtraps.has(e.id) ? 'checked' : '';
            const checkedBrick = bricks.has(e.id) ? 'checked' : '';
            return `
                <label class="odds-row" data-id="${encoded}">
                    <input type="checkbox" data-action="starter" ${checkedStarter} title="Starter" aria-label="Starter" />
                    <input type="checkbox" data-action="extender" ${checkedExtender} title="Extender" aria-label="Extender" />
                    <input type="checkbox" data-action="handtrap" ${checkedHandtrap} title="Handtrap" aria-label="Handtrap" />
                    <input type="checkbox" data-action="brick" ${checkedBrick} title="Brick" aria-label="Brick" />
                    <span class="qty">${e.qty}x</span>
                    <span class="name" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</span>
                </label>
            `.trim();
        })
        .join('\n');

    const starterCount = starters.size;
    const mainTotal = buildMainDeckIdList().length;
    const extenderCount = extenders.size;
    const handtrapCount = handtraps.size;
    const brickCount = bricks.size;
    oddsOutEl.innerHTML = `<span class="muted">Main: ${mainTotal} cards • Starters: ${starterCount} • Extenders: ${extenderCount} • Handtraps: ${handtrapCount} • Bricks: ${brickCount}</span>`;
}

function escapeHtml(s) {
    return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

async function copyText(payload, { okMessage, promptTitle } = {}) {
    const text = String(payload ?? '');
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            if (okMessage) alert(okMessage);
            return true;
        } catch {
            // fall through
        }
    }
    if (promptTitle) prompt(promptTitle, text);
    return false;
}

const GOLDFISH_KEY = 'ygo_goldfish_v1';

function loadGoldfish() {
    try {
        const raw = localStorage.getItem(GOLDFISH_KEY) || '';
        const obj = raw ? JSON.parse(raw) : null;
        if (!obj || typeof obj !== 'object') throw new Error('invalid');
        return {
            deckSig: typeof obj.deckSig === 'string' ? obj.deckSig : '',
            turn: Number(obj.turn) || 1,
            openingHandSize: clampInt(obj.openingHandSize ?? 5, 1, 10),
            handsDealt: Number(obj.handsDealt) || 0,
            handsKept: Number(obj.handsKept) || 0,
            mulligans: Number(obj.mulligans) || 0,
            deck: Array.isArray(obj.deck) ? obj.deck.map((x) => String(x)) : [],
            hand: Array.isArray(obj.hand) ? obj.hand.map((x) => String(x)) : [],
            field: Array.isArray(obj.field) ? obj.field.map((x) => String(x)) : [],
            gy: Array.isArray(obj.gy) ? obj.gy.map((x) => String(x)) : [],
            banish: Array.isArray(obj.banish) ? obj.banish.map((x) => String(x)) : []
        };
    } catch {
        return {
            deckSig: '',
            turn: 1,
            openingHandSize: 5,
            handsDealt: 0,
            handsKept: 0,
            mulligans: 0,
            deck: [],
            hand: [],
            field: [],
            gy: [],
            banish: []
        };
    }
}

function saveGoldfish() {
    try {
        localStorage.setItem(GOLDFISH_KEY, JSON.stringify(goldfish));
    } catch {
        // ignore
    }
}

function deckSigForMain() {
    const obj = deck?.sections?.main || {};
    return Object.entries(obj)
        .map(([id, qty]) => `${String(id)}:${Number(qty) || 0}`)
        .filter((s) => !s.endsWith(':0'))
        .sort()
        .join('|');
}

function fisherYatesShuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

function goldfishBuildDeck() {
    const ids = buildMainDeckIdList();
    return fisherYatesShuffle(ids.slice());
}

function goldfishEnsureDeckMatches() {
    const sig = deckSigForMain();
    return goldfish.deckSig === sig;
}

function goldfishReset({ drawOpening } = {}) {
    goldfish.deckSig = deckSigForMain();
    goldfish.turn = 1;
    goldfish.deck = goldfishBuildDeck();
    goldfish.hand = [];
    goldfish.field = [];
    goldfish.gy = [];
    goldfish.banish = [];
    if (drawOpening) goldfishDraw(goldfish.openingHandSize || 5);
    saveGoldfish();
    renderGoldfish();
}

function goldfishNewHand({ isMulligan } = {}) {
    if (isMulligan) goldfish.mulligans = (Number(goldfish.mulligans) || 0) + 1;
    goldfish.handsDealt = (Number(goldfish.handsDealt) || 0) + 1;
    goldfishReset({ drawOpening: true });
}

function goldfishKeepHand() {
    if (!Array.isArray(goldfish.hand) || goldfish.hand.length === 0) return;
    goldfish.handsKept = (Number(goldfish.handsKept) || 0) + 1;
    saveGoldfish();
    renderGoldfish();
}

function goldfishDraw(n = 1) {
    const k = Math.max(0, Number(n) || 0);
    for (let i = 0; i < k; i++) {
        const top = goldfish.deck.shift();
        if (!top) break;
        goldfish.hand.push(top);
    }
    saveGoldfish();
    renderGoldfish();
}

function goldfishNextTurn() {
    goldfish.turn = (Number(goldfish.turn) || 1) + 1;
    goldfishDraw(1);
}

function goldfishMove({ from, to, idx }) {
    const zones = {
        deck: goldfish.deck,
        hand: goldfish.hand,
        field: goldfish.field,
        gy: goldfish.gy,
        banish: goldfish.banish
    };
    const src = zones[from];
    const dst = zones[to];
    if (!src || !dst) return;
    const i = Number(idx);
    if (!Number.isFinite(i) || i < 0 || i >= src.length) return;
    const [id] = src.splice(i, 1);
    if (!id) return;
    if (to === 'deck') dst.unshift(id);
    else dst.push(id);
    saveGoldfish();
    renderGoldfish();
}

function countRoleHitsInIds(ids, idSet) {
    const s = idSet instanceof Set ? idSet : new Set();
    let n = 0;
    for (const id of ids || []) if (s.has(String(id))) n++;
    return n;
}

function getGoldfishHandRoleCounts() {
    const starters = getStarterSetForActiveDeck();
    const extenders = getExtenderSetForActiveDeck();
    const handtraps = getHandtrapSetForActiveDeck();
    const bricks = getBrickSetForActiveDeck();
    return {
        starters: countRoleHitsInIds(goldfish.hand, starters),
        extenders: countRoleHitsInIds(goldfish.hand, extenders),
        handtraps: countRoleHitsInIds(goldfish.hand, handtraps),
        bricks: countRoleHitsInIds(goldfish.hand, bricks)
    };
}

function goldfishHandMeetsTarget() {
    const handSize = clampInt(goldfish.openingHandSize ?? 5, 1, 10);
    const t = getTargetFromUi(handSize);
    const c = getGoldfishHandRoleCounts();
    return c.starters >= t.minStarter && c.extenders >= t.minExtender && c.handtraps >= t.minHandtrap && c.bricks <= t.maxBrick;
}

function cardNameById(id) {
    const c = cards.find((x) => String(x?.id ?? '') === String(id));
    return c?.name ? String(c.name) : String(id);
}

function countCopiesInMainForIdSet(idSet) {
    const s = idSet instanceof Set ? idSet : new Set();
    const mainObj = deck?.sections?.main || {};
    let copies = 0;
    for (const [id, qty] of Object.entries(mainObj)) {
        if (!s.has(String(id))) continue;
        copies += Number(qty) || 0;
    }
    return copies;
}

function getGoldfishAiSummaryText() {
    const deckName = (deck?.name || '').trim() || 'Untitled';
    const mainSize = buildMainDeckIdList().length;
    const extraSize = Object.values(deck?.sections?.extra || {}).reduce((a, v) => a + (Number(v) || 0), 0);
    const sideSize = Object.values(deck?.sections?.side || {}).reduce((a, v) => a + (Number(v) || 0), 0);
    const datasetLabel = String(lastDatasetSourceLabel || datasetSelect?.options?.[datasetSelect.selectedIndex]?.textContent || 'Unknown dataset').trim();

    const starters = getStarterSetForActiveDeck();
    const extenders = getExtenderSetForActiveDeck();
    const handtraps = getHandtrapSetForActiveDeck();
    const bricks = getBrickSetForActiveDeck();

    const handSize = getHandSizeUi();
    const trials = clampInt(oddsTrialsSelect?.value ?? 10000, 1, 500000);
    const target = getTargetFromUi(handSize);
    const preset = String(oddsTargetPresetSelect?.value || 'custom');

    const fmtZone = (title, ids) => {
        const names = (ids || []).map(cardNameById);
        return `${title} (${names.length}): ${names.length ? names.join(' | ') : '(empty)'}`;
    };

    const handRoleCounts = getGoldfishHandRoleCounts();
    const handTargetOk = goldfishHandMeetsTarget();

    const lines = [];
    lines.push('Duelist ARC — Deck Test Summary');
    lines.push(`Deck: ${deckName}`);
    lines.push(`Dataset: ${datasetLabel}`);
    lines.push(`Deck sizes: Main ${mainSize} • Extra ${extraSize} • Side ${sideSize}`);
    lines.push(
        `Roles (copies/unique): Starter ${countCopiesInMainForIdSet(starters)}/${starters.size} • Extender ${countCopiesInMainForIdSet(extenders)}/${extenders.size} • Handtrap ${countCopiesInMainForIdSet(handtraps)}/${handtraps.size} • Brick ${countCopiesInMainForIdSet(bricks)}/${bricks.size}`
    );
    lines.push(`Target (${preset}): Starter≥${target.minStarter} Extender≥${target.minExtender} Handtrap≥${target.minHandtrap} Brick≤${target.maxBrick}`);
    lines.push(`Odds settings: Hand ${handSize} • Trials ${trials.toLocaleString()}`);
    lines.push('');
    lines.push('Goldfish state (manual):');
    lines.push(`Deck remaining: ${goldfish.deck.length} (deck sig match: ${goldfishEnsureDeckMatches() ? 'yes' : 'no'})`);
    lines.push(`Turn: ${Number(goldfish.turn) || 1} • Opening hand size: ${clampInt(goldfish.openingHandSize ?? 5, 1, 10)}`);
    lines.push(`Hands dealt: ${Number(goldfish.handsDealt) || 0} • Kept: ${Number(goldfish.handsKept) || 0} • Mulligans: ${Number(goldfish.mulligans) || 0}`);
    lines.push(`Hand roles: S${handRoleCounts.starters} E${handRoleCounts.extenders} H${handRoleCounts.handtraps} B${handRoleCounts.bricks} • Meets target: ${handTargetOk ? 'YES' : 'NO'}`);
    lines.push(fmtZone('Hand', goldfish.hand));
    lines.push(fmtZone('Field', goldfish.field));
    lines.push(fmtZone('GY', goldfish.gy));
    lines.push(fmtZone('Banish', goldfish.banish));
    lines.push('');
    lines.push('Ask: Suggest the best line(s) from this hand to meet the target, and list likely choke points + alternative lines if interrupted.');
    return lines.join('\n').trim() + '\n';
}

function renderGoldfishZone(el, zoneName, list, moves) {
    if (!el) return;
    if (!Array.isArray(list) || list.length === 0) {
        el.innerHTML = `<div class="goldfish-empty">Empty</div>`;
        return;
    }
    el.innerHTML = list
        .map((id, idx) => {
            const actions = moves
                .map(
                    (m) =>
                        `<button class="btn btn-small" type="button" data-action="gf-move" data-from="${escapeHtml(zoneName)}" data-to="${escapeHtml(m.to)}" data-idx="${idx}">${escapeHtml(m.label)}</button>`
                )
                .join(' ');
            const name = cardNameById(id);
            return `
                <div class="goldfish-item">
                    <div class="name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
                    <div class="actions">${actions}</div>
                </div>
            `.trim();
        })
        .join('\n');
}

function renderGoldfish() {
    if (!goldfishMetaEl) return;
    const sigOk = goldfishEnsureDeckMatches();
    const mainTotal = buildMainDeckIdList().length;
    const deckLeft = goldfish.deck.length;
    const handN = goldfish.hand.length;
    const fieldN = goldfish.field.length;
    const gyN = goldfish.gy.length;
    const banishN = goldfish.banish.length;
    const deckName = (deck?.name || '').trim() || 'Untitled';
    const mismatch = sigOk ? '' : ' • <span class="pill">Deck changed — reset goldfish</span>';

    if (goldfishOpeningSelect) goldfishOpeningSelect.value = String(goldfish.openingHandSize || 5);
    goldfishMetaEl.innerHTML = `${escapeHtml(deckName)} • Turn ${Number(goldfish.turn) || 1} • Main ${mainTotal} • Deck ${deckLeft} • Hand ${handN} • Field ${fieldN} • GY ${gyN} • Banish ${banishN}${mismatch}`;
    if (goldfishHandStatsEl) {
        const c = getGoldfishHandRoleCounts();
        const ok = goldfishHandMeetsTarget();
        const status = ok ? 'Target: PASS' : 'Target: FAIL';
        goldfishHandStatsEl.innerHTML = `<span class="pill">${escapeHtml(status)}</span> <span class="muted">Hand roles: S${c.starters} E${c.extenders} H${c.handtraps} B${c.bricks} • Hands ${Number(goldfish.handsDealt) || 0} • Kept ${Number(goldfish.handsKept) || 0} • Mull ${Number(goldfish.mulligans) || 0}</span>`;
    }

    renderGoldfishZone(goldfishHandEl, 'hand', goldfish.hand, [
        { to: 'field', label: '→F' },
        { to: 'gy', label: '→GY' },
        { to: 'banish', label: '→B' }
    ]);
    renderGoldfishZone(goldfishFieldEl, 'field', goldfish.field, [
        { to: 'gy', label: '→GY' },
        { to: 'banish', label: '→B' },
        { to: 'hand', label: '→H' }
    ]);
    renderGoldfishZone(goldfishGyEl, 'gy', goldfish.gy, [
        { to: 'hand', label: '→H' },
        { to: 'deck', label: '→D' }
    ]);
    renderGoldfishZone(goldfishBanishEl, 'banish', goldfish.banish, [
        { to: 'hand', label: '→H' },
        { to: 'deck', label: '→D' }
    ]);
}

function getShareUrlForCard(card) {
    const id = getCardId(card);
    if (!id) return '';
    const url = new URL(window.location.href);
    url.hash = `#card=${encodeURIComponent(id)}`;
    return url.toString();
}

let applyFilterTimer = null;
function scheduleApplyFilter() {
    if (applyFilterTimer) window.clearTimeout(applyFilterTimer);
    applyFilterTimer = window.setTimeout(() => {
        applyFilterTimer = null;
        applyFilter();
    }, 120);
}

function applyUiPrefs() {
    const view = String(viewModeSelect?.value || localStorage.getItem(UI_VIEW_KEY) || 'comfortable');
    const thumb = String(thumbSizeSelect?.value || localStorage.getItem(UI_THUMB_KEY) || 'm');
    const previewOn = localStorage.getItem(UI_PREVIEW_KEY) === null ? true : localStorage.getItem(UI_PREVIEW_KEY) !== '0';

    document.body.classList.toggle('density-compact', view === 'compact');
    document.body.classList.toggle('thumb-s', thumb === 's');
    document.body.classList.toggle('thumb-m', thumb === 'm');
    document.body.classList.toggle('thumb-l', thumb === 'l');

    if (viewModeSelect) viewModeSelect.value = view === 'compact' ? 'compact' : 'comfortable';
    if (thumbSizeSelect) thumbSizeSelect.value = thumb === 's' ? 's' : thumb === 'l' ? 'l' : 'm';
    if (previewToggle) previewToggle.checked = previewOn;

    try {
        localStorage.setItem(UI_VIEW_KEY, viewModeSelect?.value || view);
        localStorage.setItem(UI_THUMB_KEY, thumbSizeSelect?.value || thumb);
        localStorage.setItem(UI_PREVIEW_KEY, previewToggle?.checked ? '1' : '0');
    } catch {
        // ignore
    }

    if (!previewToggle?.checked) hidePreview();
}

let gridRenderToken = 0;

function cardToGridHtml(card, selectedId) {
    const id = getCardId(card) || '';
    const dataId = encodeURIComponent(id);
    const level = card.level ?? '-';
    const atk = card.atk ?? '-';
    const def = card.def ?? '-';
    const isFav = isFavorite(card);
    const starClass = 'star' + (isFav ? ' is-on' : '');
    const starChar = isFav ? '★' : '☆';
    const cls = 'card' + (selectedId && id === selectedId ? ' selected' : '');
    const thumb = card.image ? `<img class="thumb" src="${escapeHtml(card.image)}" alt="" loading="lazy" />` : '';
    const raceLine = card.race ? `<p>Race: ${escapeHtml(card.race)}</p>` : '';
    const archLine = card.archetype ? `<p>Archetype: ${escapeHtml(card.archetype)}</p>` : '';
    return `
        <div class="${cls}" data-id="${dataId}" tabindex="0">
            ${thumb}
            <div class="row">
                <div class="title">
                    <h2>${escapeHtml(card.name ?? 'Unknown')}</h2>
                </div>
                <button class="${starClass}" type="button" data-action="fav" aria-label="Toggle favorite">${starChar}</button>
            </div>
            <p>Type: ${escapeHtml(card.type ?? '-')}</p>
            <p>Attribute: ${escapeHtml(card.attribute ?? '-')}</p>
            ${raceLine}
            ${archLine}
            <div class="stats">
                <span class="pill">Lv ${escapeHtml(level)}</span>
                <span class="pill">ATK ${escapeHtml(atk)}</span>
                <span class="pill">DEF ${escapeHtml(def)}</span>
            </div>
        </div>
    `.trim();
}

function restoreGridFocus(selectedId) {
    const focusId = focusedCardId || selectedId;
    if (!focusId) return;
    const el = grid?.querySelector(`.card[data-id="${CSS.escape(encodeURIComponent(focusId))}"]`);
    if (el && document.activeElement !== el) {
        const active = document.activeElement;
        const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
        if (!isTyping) el.focus({ preventScroll: true });
    }
}

function populateTagFilters() {
    if (!tagFilter || !stFilter) return;
    tagFilter.innerHTML = '<option value="">All tags</option>';
    stFilter.innerHTML = '<option value="">All S/T</option>';

    const monsterTags = new Set();
    const stTags = new Set();
    for (const c of cards) {
        const kind = normalize(c?.kind ?? '');
        const tags = Array.isArray(c?.tags) ? c.tags : [];
        for (const t of tags) {
            const tt = String(t).trim();
            if (!tt) continue;
            if (kind === 'spell' || kind === 'trap') stTags.add(tt);
            else monsterTags.add(tt);
        }
    }

    const orderedMonster = [
        'fusion',
        'synchro',
        'xyz',
        'link',
        'pendulum',
        'ritual',
        'tuner',
        'token',
        'normal',
        'effect',
        'flip',
        'toon',
        'spirit',
        'union',
        'gemini',
    ];
    const orderedSt = ['quick-play', 'continuous', 'field', 'equip', 'counter'];

    const addOpts = (el, ordered, set) => {
        const added = new Set();
        for (const t of ordered) {
            if (!set.has(t)) continue;
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            el.appendChild(opt);
            added.add(t);
        }
        const rest = Array.from(set)
            .filter((t) => !added.has(t))
            .sort((a, b) => a.localeCompare(b));
        for (const t of rest) {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            el.appendChild(opt);
        }
    };

    addOpts(tagFilter, orderedMonster, monsterTags);
    addOpts(stFilter, orderedSt, stTags);
}

function getUiState() {
    return {
        view: String(viewModeSelect?.value || 'comfortable'),
        thumb: String(thumbSizeSelect?.value || 'm'),
        preview: Boolean(previewToggle?.checked),
        sort: String(sortSelect?.value || 'name_asc'),
        q: String(searchInput?.value || ''),
        type: String(typeFilter?.value || ''),
        attr: String(attrFilter?.value || ''),
        race: String(raceFilter?.value || ''),
        arch: String(archFilter?.value || ''),
        kind: String(kindFilter?.value || ''),
        tag: String(tagFilter?.value || ''),
        st: String(stFilter?.value || ''),
        tcg: String(banTcgFilter?.value || ''),
        ocg: String(banOcgFilter?.value || ''),
        goat: String(banGoatFilter?.value || ''),
        fav: String(favFilter?.value || ''),
        lvlMin: String(levelMinInput?.value || ''),
        lvlMax: String(levelMaxInput?.value || ''),
        atkMin: String(atkMinInput?.value || ''),
        atkMax: String(atkMaxInput?.value || ''),
        defMin: String(defMinInput?.value || ''),
        defMax: String(defMaxInput?.value || ''),
    };
}

function applyUiState(state) {
    const s = state && typeof state === 'object' ? state : {};
    if (viewModeSelect) viewModeSelect.value = s.view === 'compact' ? 'compact' : 'comfortable';
    if (thumbSizeSelect) thumbSizeSelect.value = s.thumb === 's' ? 's' : s.thumb === 'l' ? 'l' : 'm';
    if (previewToggle) previewToggle.checked = s.preview !== false;
    applyUiPrefs();

    if (sortSelect) sortSelect.value = String(s.sort || 'name_asc');
    if (searchInput) searchInput.value = String(s.q || '');
    if (typeFilter) typeFilter.value = String(s.type || '');
    if (attrFilter) attrFilter.value = String(s.attr || '');
    if (raceFilter) raceFilter.value = String(s.race || '');
    if (archFilter) archFilter.value = String(s.arch || '');
    if (kindFilter) kindFilter.value = String(s.kind || '');
    if (tagFilter) tagFilter.value = String(s.tag || '');
    if (stFilter) stFilter.value = String(s.st || '');
    if (banTcgFilter) banTcgFilter.value = String(s.tcg || '');
    if (banOcgFilter) banOcgFilter.value = String(s.ocg || '');
    if (banGoatFilter) banGoatFilter.value = String(s.goat || '');
    if (favFilter) favFilter.value = String(s.fav || '');
    if (levelMinInput) levelMinInput.value = String(s.lvlMin || '');
    if (levelMaxInput) levelMaxInput.value = String(s.lvlMax || '');
    if (atkMinInput) atkMinInput.value = String(s.atkMin || '');
    if (atkMaxInput) atkMaxInput.value = String(s.atkMax || '');
    if (defMinInput) defMinInput.value = String(s.defMin || '');
    if (defMaxInput) defMaxInput.value = String(s.defMax || '');

    applyFilter();
}

function loadLayoutStore() {
    try {
        const raw = localStorage.getItem(UI_LAYOUTS_KEY);
        const layouts = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(layouts)) return [];
        return layouts.filter((x) => x && typeof x === 'object' && typeof x.id === 'string' && typeof x.name === 'string');
    } catch {
        return [];
    }
}

function saveLayoutStore(layouts) {
    try {
        localStorage.setItem(UI_LAYOUTS_KEY, JSON.stringify(layouts));
    } catch {
        // ignore
    }
}

function populateLayoutSelect() {
    if (!layoutSelect) return;
    const layouts = loadLayoutStore();
    const active = localStorage.getItem(UI_LAYOUT_ACTIVE_KEY) || 'default';
    layoutSelect.innerHTML = '';
    const def = document.createElement('option');
    def.value = 'default';
    def.textContent = 'Layout: Default';
    layoutSelect.appendChild(def);
    for (const l of layouts) {
        const opt = document.createElement('option');
        opt.value = l.id;
        opt.textContent = `Layout: ${l.name}`;
        layoutSelect.appendChild(opt);
    }
    layoutSelect.value = active;
    if (layoutDelBtn) layoutDelBtn.disabled = layoutSelect.value === 'default';
}

function initLayoutsUi() {
    populateLayoutSelect();

    layoutSelect?.addEventListener('change', () => {
        const id = String(layoutSelect.value || 'default');
        localStorage.setItem(UI_LAYOUT_ACTIVE_KEY, id);
        if (layoutDelBtn) layoutDelBtn.disabled = id === 'default';
        if (id === 'default') return;
        const layouts = loadLayoutStore();
        const found = layouts.find((l) => l.id === id);
        if (found && found.state) applyUiState(found.state);
    });

    layoutSaveBtn?.addEventListener('click', () => {
        const currentId = String(layoutSelect?.value || 'default');
        const layouts = loadLayoutStore();
        const current = currentId !== 'default' ? layouts.find((l) => l.id === currentId) : null;
        const proposed = current ? current.name : 'My layout';
        const name = prompt('Layout name:', proposed);
        if (!name) return;
        const trimmed = String(name).trim();
        if (!trimmed) return;

        const state = getUiState();
        if (current) {
            current.name = trimmed;
            current.state = state;
        } else {
            const id = `layout_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
            layouts.push({ id, name: trimmed, state });
            localStorage.setItem(UI_LAYOUT_ACTIVE_KEY, id);
        }
        saveLayoutStore(layouts);
        populateLayoutSelect();
    });

    layoutDelBtn?.addEventListener('click', () => {
        const id = String(layoutSelect?.value || 'default');
        if (id === 'default') return;
        const layouts = loadLayoutStore();
        const found = layouts.find((l) => l.id === id);
        const ok = confirm(`Delete layout "${found?.name || id}"?`);
        if (!ok) return;
        const next = layouts.filter((l) => l.id !== id);
        saveLayoutStore(next);
        localStorage.setItem(UI_LAYOUT_ACTIVE_KEY, 'default');
        populateLayoutSelect();
    });
}

function maybeApplyActiveLayoutAfterLoad() {
    // If the URL has explicit filters, prefer the URL (shareable links).
    const url = new URL(window.location.href);
    if (url.searchParams && Array.from(url.searchParams.keys()).length > 0) return;

    const active = localStorage.getItem(UI_LAYOUT_ACTIVE_KEY) || 'default';
    if (!active || active === 'default') return;
    const layouts = loadLayoutStore();
    const found = layouts.find((l) => l.id === active);
    if (found && found.state) applyUiState(found.state);
}

function renderGrid() {
    if (!grid) return;
    gridRenderToken += 1;
    const token = gridRenderToken;

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="card"><h2>No results</h2><p>Try a different search or type filter.</p></div>`;
        return;
    }

    const selectedId = selectedCard ? getCardId(selectedCard) : null;
    const items = filtered.slice();

    // Fast path for small lists.
    if (items.length <= 600) {
        grid.innerHTML = items.map((c) => cardToGridHtml(c, selectedId)).join('\n');
        restoreGridFocus(selectedId);
        return;
    }

    // Chunk render for large datasets to keep the UI responsive.
    grid.innerHTML = '';
    const chunkSize = 220;
    let i = 0;
    const step = () => {
        if (token !== gridRenderToken) return;
        const slice = items.slice(i, i + chunkSize);
        const html = slice.map((c) => cardToGridHtml(c, selectedId)).join('\n');
        grid.insertAdjacentHTML('beforeend', html);
        i += chunkSize;
        if (i < items.length) {
            requestAnimationFrame(step);
        } else {
            restoreGridFocus(selectedId);
        }
    };
    requestAnimationFrame(step);
}

function renderQuickChips() {
    if (!quickChipsEl) return;
    const hasTag = (t) => cards.some((c) => Array.isArray(c.tags) && c.tags.map(normalize).includes(normalize(t)));
    const hasBan = (k) => cards.some((c) => normalizeBanValue(c?.banlist?.[k]));

    const chips = [];
    const push = (label, attrs, active) => chips.push({ label, attrs, active });

    // Kind shortcuts
    push('Monster', { kind: 'monster' }, normalize(kindFilter?.value) === 'monster');
    push('Spell', { kind: 'spell' }, normalize(kindFilter?.value) === 'spell');
    push('Trap', { kind: 'trap' }, normalize(kindFilter?.value) === 'trap');

    // Monster mechanics
    for (const t of ['fusion', 'synchro', 'xyz', 'link', 'pendulum', 'ritual']) {
        if (!hasTag(t)) continue;
        push(t, { tag: t }, normalize(tagFilter?.value) === normalize(t));
    }

    // Spell/Trap subtypes
    for (const t of ['quick-play', 'continuous', 'field', 'equip', 'counter']) {
        if (!hasTag(t)) continue;
        push(t, { st: t }, normalize(stFilter?.value) === normalize(t));
    }

    // Banlist shortcuts (only if dataset supports them)
    if (hasBan('tcg')) push('TCG Forbidden', { tcg: 'forbidden' }, normalize(banTcgFilter?.value) === 'forbidden');
    if (hasBan('ocg')) push('OCG Forbidden', { ocg: 'forbidden' }, normalize(banOcgFilter?.value) === 'forbidden');
    if (hasBan('goat')) push('GOAT Forbidden', { goat: 'forbidden' }, normalize(banGoatFilter?.value) === 'forbidden');

    quickChipsEl.innerHTML = chips
        .map((c) => {
            const cls = 'chip' + (c.active ? ' is-on' : '');
            const attrs = Object.entries(c.attrs)
                .map(([k, v]) => `data-${k}="${escapeHtml(v)}"`)
                .join(' ');
            return `<button type="button" class="${cls}" ${attrs}>${escapeHtml(c.label)}</button>`;
        })
        .join('\n');
}

function renderActiveFilters() {
    if (!activeFiltersEl) return;
    const q = String(searchInput?.value ?? '').trim();
    const type = String(typeFilter?.value ?? '').trim();
    const attr = String(attrFilter?.value ?? '').trim();
    const race = String(raceFilter?.value ?? '').trim();
    const arch = String(archFilter?.value ?? '').trim();
    const kind = String(kindFilter?.value ?? '').trim();
    const tag = String(tagFilter?.value ?? '').trim();
    const st = String(stFilter?.value ?? '').trim();
    const tcg = String(banTcgFilter?.value ?? '').trim();
    const ocg = String(banOcgFilter?.value ?? '').trim();
    const goat = String(banGoatFilter?.value ?? '').trim();
    const lvlMin = String(levelMinInput?.value ?? '').trim();
    const lvlMax = String(levelMaxInput?.value ?? '').trim();
    const atkMin = String(atkMinInput?.value ?? '').trim();
    const atkMax = String(atkMaxInput?.value ?? '').trim();
    const defMin = String(defMinInput?.value ?? '').trim();
    const defMax = String(defMaxInput?.value ?? '').trim();
    const favOnly = String(favFilter?.value ?? '').trim() === 'fav';
    const sort = String(sortSelect?.value ?? 'name_asc').trim() || 'name_asc';

    const chips = [];
    const push = (label, clearKey) => chips.push({ label, clearKey });
    const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

    if (q) push(`Search: ${trunc(q, 28)}`, 'q');
    if (type) push(`Type: ${type}`, 'type');
    if (attr) push(`Attr: ${attr}`, 'attr');
    if (race) push(`Race: ${race}`, 'race');
    if (arch) push(`Arch: ${arch}`, 'arch');
    if (kind) push(`Kind: ${kind}`, 'kind');
    if (tag) push(`Tag: ${tag}`, 'tag');
    if (st) push(`S/T: ${st}`, 'st');
    if (tcg) push(`TCG: ${tcg}`, 'tcg');
    if (ocg) push(`OCG: ${ocg}`, 'ocg');
    if (goat) push(`GOAT: ${goat}`, 'goat');
    if (lvlMin) push(`Lv ≥ ${lvlMin}`, 'lvlMin');
    if (lvlMax) push(`Lv ≤ ${lvlMax}`, 'lvlMax');
    if (atkMin) push(`ATK ≥ ${atkMin}`, 'atkMin');
    if (atkMax) push(`ATK ≤ ${atkMax}`, 'atkMax');
    if (defMin) push(`DEF ≥ ${defMin}`, 'defMin');
    if (defMax) push(`DEF ≤ ${defMax}`, 'defMax');
    if (favOnly) push('Favorites', 'fav');
    if (sort && sort !== 'name_asc') {
        const label = sortSelect?.options?.[sortSelect.selectedIndex]?.textContent || `Sort: ${sort}`;
        push(String(label).replace(/^Sort:\s*/i, 'Sort: '), 'sort');
    }

    if (chips.length === 0) {
        activeFiltersEl.innerHTML = '';
        activeFiltersEl.style.display = 'none';
        return;
    }

    activeFiltersEl.style.display = 'flex';
    activeFiltersEl.innerHTML = chips
        .map((c) => `<button type="button" class="chip is-on" data-clear="${escapeHtml(c.clearKey)}">${escapeHtml(c.label)} ×</button>`)
        .concat([`<button type="button" class="chip" data-clear="all" title="Clear all filters">Clear all</button>`])
        .join('\n');
}

function normalizeBanValue(v) {
    const s = normalize(v);
    if (!s) return null;
    if (s.includes('forbidden')) return 'forbidden';
    if (s.includes('semi')) return 'semi-limited';
    if (s.includes('limited')) return 'limited';
    return s;
}

function buildSearchPredicate(raw) {
    const q = String(raw || '').trim();
    if (!q) return null;
    const hasOps = /[:<>!=]/.test(q);

    const tokens = q.match(/"[^"]+"|\S+/g) || [];
    const terms = tokens.map((t) => t.trim()).filter(Boolean);

    const cleanVal = (s) => String(s || '').trim().replace(/^"|"$/g, '');

    const predicates = [];
    const free = [];

    for (const term of terms) {
        // Comparators: atk>=2000, def<1500, lvl=4
        const m = term.match(/^(atk|def|lvl|level)\s*(<=|>=|=|<|>)\s*(\d+)$/i);
        if (m) {
            const field = m[1].toLowerCase() === 'lvl' ? 'level' : m[1].toLowerCase();
            const op = m[2];
            const n = Number(m[3]);
            predicates.push((c) => {
                const v = Number(field === 'level' ? c.level : c[field]);
                if (!Number.isFinite(v)) return false;
                if (op === '=') return v === n;
                if (op === '>=') return v >= n;
                if (op === '<=') return v <= n;
                if (op === '>') return v > n;
                if (op === '<') return v < n;
                return true;
            });
            continue;
        }

        // key:value operators
        const kv = term.match(/^([a-zA-Z_.]+)\s*:\s*(.+)$/);
        if (kv) {
            const key = normalize(kv[1]);
            const value = cleanVal(kv[2]);
            const vnorm = normalize(value);

            if (key === 'kind') {
                predicates.push((c) => normalize(c.kind) === vnorm);
                continue;
            }
            if (key === 'tag') {
                predicates.push((c) => (Array.isArray(c.tags) ? c.tags.map(normalize) : []).includes(vnorm));
                continue;
            }
            if (key === 'st') {
                // Spell/Trap subtype tag shortcut.
                predicates.push((c) => (Array.isArray(c.tags) ? c.tags.map(normalize) : []).includes(vnorm));
                continue;
            }
            if (key === 'race') {
                predicates.push((c) => normalize(c.race).includes(vnorm));
                continue;
            }
            if (key === 'arch' || key === 'archetype') {
                predicates.push((c) => normalize(c.archetype).includes(vnorm));
                continue;
            }
            if (key === 'attr' || key === 'attribute') {
                predicates.push((c) => normalize(c.attribute) === vnorm);
                continue;
            }
            if (key === 'type') {
                predicates.push((c) => normalize(c.type).includes(vnorm) || normalize(c.frameType).includes(vnorm));
                continue;
            }
            if (key === 'name') {
                predicates.push((c) => normalize(c.name).includes(vnorm));
                continue;
            }
            if (key === 'id') {
                predicates.push((c) => normalize(c.id).includes(vnorm));
                continue;
            }
            if (key === 'tcg' || key === 'ban.tcg') {
                predicates.push((c) => normalizeBanValue(c?.banlist?.tcg) === normalizeBanValue(vnorm));
                continue;
            }
            if (key === 'ocg' || key === 'ban.ocg') {
                predicates.push((c) => normalizeBanValue(c?.banlist?.ocg) === normalizeBanValue(vnorm));
                continue;
            }
            if (key === 'goat' || key === 'ban.goat') {
                predicates.push((c) => normalizeBanValue(c?.banlist?.goat) === normalizeBanValue(vnorm));
                continue;
            }

            // Unknown key -> treat as free text.
            free.push(term);
            continue;
        }

        free.push(term);
    }

    if (!hasOps && free.length === 1) {
        // Keep old behavior performance for simple search.
        return (c) => {
            const hay = `${normalize(c.name)} ${normalize(c.effect)} ${normalize(c.type)} ${normalize(c.attribute)} ${normalize(c.race)} ${normalize(
                c.archetype
            )}`;
            return hay.includes(normalize(cleanVal(free[0])));
        };
    }

    const freePred =
        free.length === 0
            ? null
            : (c) => {
                  const hay = `${normalize(c.name)} ${normalize(c.effect)} ${normalize(c.type)} ${normalize(c.attribute)} ${normalize(c.race)} ${normalize(
                      c.archetype
                  )} ${normalize(c.kind)} ${(Array.isArray(c.tags) ? c.tags.map(normalize).join(' ') : '')}`;
                  return free.every((t) => hay.includes(normalize(cleanVal(t))));
              };

    const all = [...predicates];
    if (freePred) all.push(freePred);
    if (all.length === 0) return null;
    return (c) => all.every((p) => p(c));
}

function renderDetail(card, { hiddenByFilters } = {}) {
    if (!card) {
        detail.innerHTML = `
            <div class="detail-empty">
                <h2>Select a card</h2>
                <p>Click a card on the left to view details.</p>
            </div>
        `;
        return;
    }

    const isFav = isFavorite(card);
    const starClass = 'star' + (isFav ? ' is-on' : '');
    const starChar = isFav ? '★' : '☆';

    const id = getCardId(card);
    const qty = id ? getDeckQtyAll(id) : { main: 0, extra: 0, side: 0, total: 0 };
    const shareUrl = id ? getShareUrlForCard(card) : '';
    const copyDisabled = shareUrl ? '' : 'disabled';
    const hiddenBanner = hiddenByFilters
        ? `
            <div class="detail-warn">
                <span class="pill">Hidden by filters</span>
                <span class="muted">This card isn’t currently visible in the grid.</span>
                <button id="show-hidden" class="btn btn-small" type="button">Clear filters &amp; show</button>
            </div>
        `.trim()
        : '';

    const name = escapeHtml(card.name ?? 'Unknown');
    const type = escapeHtml(card.type ?? '-');
    const frameType = escapeHtml(card.frameType ?? '');
    const kind = escapeHtml(card.kind ?? '');
    const attribute = escapeHtml(card.attribute ?? '-');
    const level = escapeHtml(card.level ?? '-');
    const atk = escapeHtml(card.atk ?? '-');
    const def = escapeHtml(card.def ?? '-');
    const scale = escapeHtml(card.scale ?? '');
    const linkval = escapeHtml(card.linkval ?? '');
    const linkmarkers = Array.isArray(card.linkmarkers) && card.linkmarkers.length ? card.linkmarkers.map((m) => escapeHtml(m)).join(', ') : '';
    const race = escapeHtml(card.race ?? '');
    const archetype = escapeHtml(card.archetype ?? '');
    const effect = escapeHtml(card.effect ?? '');
    const img = card.image
        ? `<div class="detail-section"><h3>Image</h3><img class="detail-img" src="${escapeHtml(card.image)}" alt="" loading="lazy" title="Click to zoom" /></div>`
        : '';
    const racePill = card.race ? `<div class="pill">Race: ${race}</div>` : '';
    const archPill = card.archetype ? `<div class="pill">Archetype: ${archetype}</div>` : '';
    const framePill = card.frameType ? `<div class="pill">Frame: ${frameType}</div>` : '';
    const kindPill = card.kind ? `<div class="pill">Kind: ${kind}</div>` : '';
    const scalePill = card.scale !== null && card.scale !== undefined ? `<div class="pill">Scale: ${scale}</div>` : '';
    const linkPill = card.linkval !== null && card.linkval !== undefined ? `<div class="pill">Link: ${linkval}</div>` : '';
    const linkMarkersPill = linkmarkers ? `<div class="pill">Markers: ${linkmarkers}</div>` : '';

    const tagPills =
        Array.isArray(card.tags) && card.tags.length
            ? `<div class="detail-tags">${card.tags
                  .slice(0, 10)
                  .map((t) => `<span class="pill">${escapeHtml(t)}</span>`)
                  .join(' ')}</div>`
            : '';

    const ban = card.banlist && typeof card.banlist === 'object' ? card.banlist : null;
    const bans = ban
        ? [
              ban.tcg ? `TCG: ${ban.tcg}` : '',
              ban.ocg ? `OCG: ${ban.ocg}` : '',
              ban.goat ? `GOAT: ${ban.goat}` : '',
          ]
              .filter(Boolean)
              .map((s) => `<span class="pill">${escapeHtml(s)}</span>`)
              .join(' ')
        : '';
    const banRow = bans ? `<div class="detail-tags"><span class="pill">Banlist</span> ${bans}</div>` : '';

    const sets = Array.isArray(card.sets) ? card.sets : [];
    const setSummary =
        sets.length > 0
            ? `<div class="detail-sets"><span class="pill">Sets</span> <span class="muted">${escapeHtml(String(sets.length))} print(s)</span><ul>${sets
                  .slice(0, 6)
                  .map((s) => {
                      const n = s?.name ? String(s.name) : '';
                      const r = s?.rarity ? String(s.rarity) : '';
                      const c = s?.code ? String(s.code) : '';
                      const bits = [n, r, c].filter(Boolean).join(' • ');
                      return `<li class="muted">${escapeHtml(bits)}</li>`;
                  })
                  .join('')}</ul></div>`
            : '';

    detail.innerHTML = `
        <div class="detail-top">
            <h2>${name}</h2>
            <div class="detail-top-actions">
                <button id="copy-link" class="btn btn-small" type="button" ${copyDisabled} title="Copy a shareable link (includes filters)">Copy link</button>
                <button id="fav" class="${starClass}" type="button" aria-label="Toggle favorite">${starChar}</button>
            </div>
        </div>
        ${hiddenBanner}
        ${img}
        <div class="detail-section">
            <h3>Deck</h3>
            <div class="detail-actions">
            <button id="deck-add-auto" class="btn btn-small" type="button" title="Auto-select Main/Extra based on card type">+ Auto</button>
            <button id="deck-add-main" class="btn btn-small" type="button">+ Main</button>
            <button id="deck-add-extra" class="btn btn-small" type="button">+ Extra</button>
            <button id="deck-add-side" class="btn btn-small" type="button">+ Side</button>
            <button id="deck-remove" class="btn btn-small" type="button" ${qty.total > 0 ? '' : 'disabled'}>- Remove</button>
            <span class="qty">In deck: M ${qty.main} • E ${qty.extra} • S ${qty.side}</span>
            </div>
        </div>
        <div class="detail-section">
            <h3>Info</h3>
            ${tagPills}
            <div class="detail-meta">
            <div class="pill">Type: ${type}</div>
            ${framePill}
            ${kindPill}
            <div class="pill">Attribute: ${attribute}</div>
            ${racePill}
            ${archPill}
            <div class="pill">Level: ${level}</div>
            <div class="pill">ATK/DEF: ${atk}/${def}</div>
            ${scalePill}
            ${linkPill}
            ${linkMarkersPill}
            </div>
            ${banRow}
            ${setSummary}
        </div>
        <div class="detail-section">
            <h3>Text</h3>
            <div class="detail-effect">${effect || '<span class="pill">No effect text</span>'}</div>
        </div>
    `;

    const favBtn = document.getElementById('fav');
    if (favBtn) {
        favBtn.addEventListener('click', () => {
            toggleFavorite(card);
            applyFilter();
            renderDetail(card);
        });
    }

    const copyLinkBtn = document.getElementById('copy-link');
    if (copyLinkBtn && shareUrl) {
        copyLinkBtn.addEventListener('click', async () => {
            await copyText(shareUrl, { okMessage: 'Link copied to clipboard.', promptTitle: 'Copy link:' });
        });
    }

    const showHiddenBtn = document.getElementById('show-hidden');
    if (showHiddenBtn) {
        showHiddenBtn.addEventListener('click', () => {
            resetFiltersToDefault();
            applyFilter();
            selectCard(card);
        });
    }

    const detailImg = detail.querySelector('.detail-img');
    if (detailImg) {
        detailImg.addEventListener('click', () => openImageModal(card));
    }

    const addAuto = document.getElementById('deck-add-auto');
    if (addAuto) addAuto.addEventListener('click', () => onAddToDeck(card, autoSectionForCard(card)));
    const addMain = document.getElementById('deck-add-main');
    if (addMain) addMain.addEventListener('click', () => onAddToDeck(card, 'main'));
    const addExtra = document.getElementById('deck-add-extra');
    if (addExtra) addExtra.addEventListener('click', () => onAddToDeck(card, 'extra'));
    const addSide = document.getElementById('deck-add-side');
    if (addSide) addSide.addEventListener('click', () => onAddToDeck(card, 'side'));

    const removeBtn = document.getElementById('deck-remove');
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            onRemoveFromDeck(card);
        });
    }
}

function selectCard(card) {
    selectedCard = card;
    focusedCardId = getCardId(card);
    const id = focusedCardId;
    const updated =
        id && grid && filtered.length > 600
            ? (() => {
                  const prev = grid.querySelector('.card.selected');
                  if (prev) prev.classList.remove('selected');
                  const el = grid.querySelector(`.card[data-id="${CSS.escape(encodeURIComponent(id))}"]`);
                  if (!el) return false;
                  el.classList.add('selected');
                  return true;
              })()
            : false;
    if (!updated) renderGrid();
    renderDetail(card);
    setHashForCard(card);
}

function showError(message) {
    grid.innerHTML = `<div class="card"><h2>Error</h2><p>${escapeHtml(message)}</p></div>`;
    renderDetail(null);
}

let previewId = null;

function isPreviewEnabled() {
    return previewToggle ? Boolean(previewToggle.checked) : true;
}

function hidePreview() {
    if (!cardPreviewEl) return;
    cardPreviewEl.classList.remove('is-on');
    cardPreviewEl.setAttribute('aria-hidden', 'true');
    previewId = null;
}

function renderPreview(card) {
    if (!cardPreviewEl) return;
    const name = escapeHtml(card?.name ?? 'Unknown');
    const type = escapeHtml(card?.type ?? '-');
    const attr = escapeHtml(card?.attribute ?? '-');
    const race = card?.race ? `<span class="pill">Race: ${escapeHtml(card.race)}</span>` : '';
    const arch = card?.archetype ? `<span class="pill">Arch: ${escapeHtml(card.archetype)}</span>` : '';
    const effect = escapeHtml(card?.effect ?? '');
    const img = card?.image ? `<img class="img" src="${escapeHtml(card.image)}" alt="" loading="lazy" />` : '';

    cardPreviewEl.innerHTML = `
        <div class="title">${name}</div>
        ${img}
        <div class="meta">
            <span class="pill">${type}</span>
            <span class="pill">${attr}</span>
            ${race}
            ${arch}
        </div>
        <div class="effect">${effect || '<span class="muted">No effect text</span>'}</div>
    `.trim();
}

function positionPreview(anchorEl) {
    if (!cardPreviewEl || !(anchorEl instanceof Element)) return;
    const rect = anchorEl.getBoundingClientRect();
    const margin = 12;
    const maxW = Math.min(360, window.innerWidth - margin * 2);
    cardPreviewEl.style.width = `${maxW}px`;
    const box = cardPreviewEl.getBoundingClientRect();

    let left = rect.right + margin;
    let top = rect.top;
    if (left + box.width > window.innerWidth - margin) left = rect.left - margin - box.width;
    if (left < margin) left = margin;
    if (top + box.height > window.innerHeight - margin) top = window.innerHeight - margin - box.height;
    if (top < margin) top = margin;

    cardPreviewEl.style.left = `${Math.round(left)}px`;
    cardPreviewEl.style.top = `${Math.round(top)}px`;
}

function showPreview(card, anchorEl) {
    if (!card || !cardPreviewEl || !isPreviewEnabled()) return;
    const id = getCardId(card);
    if (id && id === previewId && cardPreviewEl.classList.contains('is-on')) {
        positionPreview(anchorEl);
        return;
    }
    previewId = id;
    renderPreview(card);
    cardPreviewEl.classList.add('is-on');
    cardPreviewEl.setAttribute('aria-hidden', 'false');
    positionPreview(anchorEl);
}

let modalState = { open: false, zoom: false, list: [], idx: 0 };

function isModalOpen() {
    return Boolean(modalState?.open) && Boolean(imageModalEl?.classList.contains('is-on'));
}

function getModalListForCard(card) {
    const id = getCardId(card);
    const list = filtered && filtered.length ? filtered : cards;
    let idx = id ? list.findIndex((c) => getCardId(c) === id) : -1;
    if (idx < 0) idx = 0;
    return { list, idx };
}

function setModalCardByIndex(idx) {
    const list = Array.isArray(modalState.list) ? modalState.list : [];
    const nextIdx = Math.max(0, Math.min(list.length - 1, idx));
    modalState.idx = nextIdx;
    const card = list[nextIdx] || null;
    if (!card) return;

    if (modalTitleEl) modalTitleEl.textContent = String(card.name || 'Card');
    if (modalImgEl) {
        const src = String(card.image || '').trim();
        modalImgEl.src = src;
        modalImgEl.alt = String(card.name || 'Card');
    }

    // Sync selection + detail without forcing a full grid re-render.
    const id = getCardId(card);
    selectedCard = card;
    focusedCardId = id;
    if (id && grid) {
        const prev = grid.querySelector('.card.selected');
        if (prev) prev.classList.remove('selected');
        const el = grid.querySelector(`.card[data-id="${CSS.escape(encodeURIComponent(id))}"]`);
        if (el) el.classList.add('selected');
    }
    renderDetail(card);
    setHashForCard(card);

    if (modalPrevBtn) modalPrevBtn.disabled = nextIdx <= 0;
    if (modalNextBtn) modalNextBtn.disabled = nextIdx >= list.length - 1;
}

function openImageModal(card) {
    if (!imageModalEl) return;
    const hasImg = Boolean(card && String(card.image || '').trim());
    if (!hasImg) return;

    hidePreview();
    const { list, idx } = getModalListForCard(card);
    modalState = { open: true, zoom: false, list, idx };
    imageModalEl.classList.add('is-on');
    imageModalEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    imageModalEl.classList.remove('zoom-on');
    setModalCardByIndex(idx);
}

function openStandaloneImageModal({ src, title } = {}) {
    if (!imageModalEl || !modalImgEl) return;
    const s = String(src || '').trim();
    if (!s) return;

    hidePreview();
    modalState = { open: true, zoom: false, list: [], idx: 0 };
    imageModalEl.classList.add('is-on');
    imageModalEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    imageModalEl.classList.remove('zoom-on');

    if (modalTitleEl) modalTitleEl.textContent = String(title || 'Image');
    modalImgEl.src = s;
    modalImgEl.alt = String(title || 'Image');
    if (modalPrevBtn) modalPrevBtn.disabled = true;
    if (modalNextBtn) modalNextBtn.disabled = true;
}

function closeImageModal() {
    if (!imageModalEl) return;
    modalState.open = false;
    imageModalEl.classList.remove('is-on');
    imageModalEl.classList.remove('zoom-on');
    imageModalEl.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (modalImgEl) modalImgEl.src = '';
}

let demoTourStepIdx = 0;
function isDemoTourOpen() {
    return demoTourModalEl instanceof HTMLElement && demoTourModalEl.classList.contains('is-on');
}

function openDemoTour({ force = false } = {}) {
    if (!(demoTourModalEl instanceof HTMLElement)) return;
    if (!(demoTourStepEl instanceof HTMLElement)) return;
    if (!force) {
        try {
            if (localStorage.getItem(DEMO_TOUR_DONE_KEY) === '1') return;
        } catch {
            // ignore
        }
    }

    // Avoid overlapping modals.
    try {
        if (imageModalEl?.classList?.contains('is-on')) closeImageModal();
    } catch {
        // ignore
    }

    demoTourStepIdx = 0;
    demoTourModalEl.classList.add('is-on');
    demoTourModalEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    renderDemoTourStep();
}

function closeDemoTour({ markDone = false } = {}) {
    if (!(demoTourModalEl instanceof HTMLElement)) return;
    demoTourModalEl.classList.remove('is-on');
    demoTourModalEl.setAttribute('aria-hidden', 'true');
    if (!modalState?.open) document.body.classList.remove('modal-open');
    if (markDone) {
        try {
            localStorage.setItem(DEMO_TOUR_DONE_KEY, '1');
        } catch {
            // ignore
        }
    }
}

function renderDemoTourStep() {
    if (!(demoTourStepEl instanceof HTMLElement)) return;
    const steps = [
        {
            title: '1) Load a deck',
            body:
                'Go to the Duel tab and use “Upload deck” or “Load sample”. This demo imports by card name, so the best experience is with the Server (All cards) dataset.',
            cta: () => {
                setActiveView('duel');
                duelQuickDeckUploadBtn?.focus?.();
            },
        },
        {
            title: '2) Shuffle + Draw 5',
            body:
                'Click “Shuffle + Draw 5” to instantly do something interactive (no duel service required). Mulligan if you want a new hand.',
            cta: () => {
                setActiveView('duel');
                duelQuickDeckDraw5Btn?.focus?.();
            },
        },
        {
            title: '3) Duel a CPU (server-hosted)',
            body:
                'If the server is configured with EDOPro + WindBot, click “Start CPU duel”. Online PvP is coming soon — the demo is CPU-first.',
            cta: () => {
                setActiveView('duel');
                duelStartBtn?.focus?.();
            },
        },
    ];

    const idx = Math.max(0, Math.min(steps.length - 1, Number(demoTourStepIdx) || 0));
    demoTourStepIdx = idx;
    const step = steps[idx];

    demoTourStepEl.innerHTML = `
        <h2>${escapeHtml(step.title)}</h2>
        <p>${escapeHtml(step.body)}</p>
        <div style="margin-top:10px;">
            <button class="btn btn-small btn-primary" type="button" data-action="cta">Take me there</button>
        </div>
    `.trim();

    demoTourBackBtn?.toggleAttribute?.('disabled', idx <= 0);
    if (demoTourNextBtn instanceof HTMLButtonElement) demoTourNextBtn.hidden = idx >= steps.length - 1;
    if (demoTourDoneBtn instanceof HTMLButtonElement) demoTourDoneBtn.hidden = idx < steps.length - 1;

    demoTourStepEl.querySelector('[data-action="cta"]')?.addEventListener('click', () => {
        try {
            step.cta?.();
        } catch {
            // ignore
        }
    });
}

function moveModal(delta) {
    if (!isModalOpen()) return;
    const next = Number(modalState.idx || 0) + Number(delta || 0);
    setModalCardByIndex(next);
}

function toggleModalZoom() {
    if (!isModalOpen() || !imageModalEl) return;
    modalState.zoom = !modalState.zoom;
    imageModalEl.classList.toggle('zoom-on', modalState.zoom);
}

function normalize(s) {
    return String(s ?? '').toLowerCase();
}

function parseBound(inputEl) {
    const raw = String(inputEl?.value ?? '').trim();
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return n;
}

function matchesBounds(value, min, max) {
    if (min === null && max === null) return true;
    if (!Number.isFinite(Number(value))) return false;
    const v = Number(value);
    if (min !== null && v < min) return false;
    if (max !== null && v > max) return false;
    return true;
}

function parseCardTypeInfo({ type, frameType } = {}) {
    const t = normalize(type);
    const f = normalize(frameType);

    const tags = new Set();
    const has = (needle) => t.includes(needle) || f.includes(needle);

    // Kind
    let kind = 'monster';
    if (f === 'spell' || t.includes('spell')) kind = 'spell';
    if (f === 'trap' || t.includes('trap')) kind = 'trap';
    if (kind === 'spell') tags.add('spell');
    if (kind === 'trap') tags.add('trap');
    if (kind === 'monster') tags.add('monster');

    // Monster subtypes / mechanics
    if (has('fusion')) tags.add('fusion');
    if (has('synchro')) tags.add('synchro');
    if (has('xyz')) tags.add('xyz');
    if (has('link')) tags.add('link');
    if (has('pendulum')) tags.add('pendulum');
    if (has('ritual')) tags.add('ritual');
    if (has('tuner')) tags.add('tuner');
    if (has('token')) tags.add('token');
    if (has('normal')) tags.add('normal');
    if (has('effect')) tags.add('effect');
    if (has('flip')) tags.add('flip');
    if (has('toon')) tags.add('toon');
    if (has('spirit')) tags.add('spirit');
    if (has('union')) tags.add('union');
    if (has('gemini')) tags.add('gemini');

    // Spell/Trap subtypes
    if (kind === 'spell' || kind === 'trap') {
        if (has('quick-play')) tags.add('quick-play');
        if (has('continuous')) tags.add('continuous');
        if (has('field')) tags.add('field');
        if (has('equip')) tags.add('equip');
        if (has('counter')) tags.add('counter');
    }

    const extraDeck = tags.has('fusion') || tags.has('synchro') || tags.has('xyz') || tags.has('link');
    return { kind, extraDeck, tags: Array.from(tags) };
}

function parseCardKind(card) {
    if (card && typeof card === 'object' && typeof card.kind === 'string') {
        return { kind: String(card.kind), extraDeck: Boolean(card.extraDeck) };
    }
    const info = parseCardTypeInfo({ type: card?.type, frameType: card?.frameType });
    return { kind: info.kind, extraDeck: info.extraDeck };
}

function autoSectionForCard(card) {
    const info = parseCardKind(card);
    if (info.kind === 'spell' || info.kind === 'trap') return 'main';
    if (info.extraDeck) return 'extra';
    return 'main';
}

function applyFilter() {
    const qRaw = String(searchInput?.value ?? '').trim();
    const typeRaw = String(typeFilter?.value ?? '').trim();
    const attrRaw = String(attrFilter?.value ?? '').trim();
    const raceRaw = String(raceFilter?.value ?? '').trim();
    const archRaw = String(archFilter?.value ?? '').trim();
    const kindRaw = String(kindFilter?.value ?? '').trim();
    const tagRaw = String(tagFilter?.value ?? '').trim();
    const stRaw = String(stFilter?.value ?? '').trim();
    const banTcgRaw = String(banTcgFilter?.value ?? '').trim();
    const banOcgRaw = String(banOcgFilter?.value ?? '').trim();
    const banGoatRaw = String(banGoatFilter?.value ?? '').trim();
    const levelMin = parseBound(levelMinInput);
    const levelMax = parseBound(levelMaxInput);
    const atkMin = parseBound(atkMinInput);
    const atkMax = parseBound(atkMaxInput);
    const defMin = parseBound(defMinInput);
    const defMax = parseBound(defMaxInput);
    const favOnly = String(favFilter?.value ?? '').trim() === 'fav';
    const sort = String(sortSelect?.value ?? 'name_asc').trim() || 'name_asc';

    const pred = buildSearchPredicate(qRaw);
    filtered = pred ? cards.filter(pred) : cards.slice();

    if (typeRaw) {
        filtered = filtered.filter((c) => normalize(c.type) === normalize(typeRaw));
    }

    if (attrRaw) {
        filtered = filtered.filter((c) => normalize(c.attribute) === normalize(attrRaw));
    }

    if (raceRaw) {
        filtered = filtered.filter((c) => normalize(c.race) === normalize(raceRaw));
    }

    if (archRaw) {
        filtered = filtered.filter((c) => normalize(c.archetype) === normalize(archRaw));
    }

    if (kindRaw) {
        filtered = filtered.filter((c) => normalize(c.kind) === normalize(kindRaw));
    }

    if (tagRaw) {
        filtered = filtered.filter((c) => (Array.isArray(c.tags) ? c.tags.map(normalize) : []).includes(normalize(tagRaw)));
    }

    if (stRaw) {
        filtered = filtered.filter((c) => (Array.isArray(c.tags) ? c.tags.map(normalize) : []).includes(normalize(stRaw)));
    }

    if (banTcgRaw) {
        filtered = filtered.filter((c) => normalizeBanValue(c?.banlist?.tcg) === normalizeBanValue(banTcgRaw));
    }

    if (banOcgRaw) {
        filtered = filtered.filter((c) => normalizeBanValue(c?.banlist?.ocg) === normalizeBanValue(banOcgRaw));
    }

    if (banGoatRaw) {
        filtered = filtered.filter((c) => normalizeBanValue(c?.banlist?.goat) === normalizeBanValue(banGoatRaw));
    }

    if (levelMin !== null || levelMax !== null) {
        filtered = filtered.filter((c) => matchesBounds(c.level, levelMin, levelMax));
    }

    if (atkMin !== null || atkMax !== null) {
        filtered = filtered.filter((c) => matchesBounds(c.atk, atkMin, atkMax));
    }

    if (defMin !== null || defMax !== null) {
        filtered = filtered.filter((c) => matchesBounds(c.def, defMin, defMax));
    }

    if (favOnly) {
        filtered = filtered.filter((c) => isFavorite(c));
    }

    filtered.sort((a, b) => {
        const an = String(a?.name ?? '');
        const bn = String(b?.name ?? '');
        if (sort === 'fav_then_name') {
            const af = isFavorite(a) ? 1 : 0;
            const bf = isFavorite(b) ? 1 : 0;
            if (af !== bf) return bf - af;
            return an.localeCompare(bn);
        }
        if (sort === 'name_desc') return bn.localeCompare(an);
        if (sort === 'level_desc') return (Number(b?.level ?? -1) - Number(a?.level ?? -1)) || an.localeCompare(bn);
        if (sort === 'atk_desc') return (Number(b?.atk ?? -1) - Number(a?.atk ?? -1)) || an.localeCompare(bn);
        return an.localeCompare(bn);
    });

    if (countEl) {
        countEl.textContent = `${filtered.length}/${cards.length}`;
    }

    if (selectedCard) {
        const sid = getCardId(selectedCard);
        const stillVisible = sid ? filtered.some((c) => getCardId(c) === sid) : false;
        if (!stillVisible) {
            selectedCard = null;
            focusedCardId = null;
            setHashForCard(null);
        }
    }
    renderGrid();
    renderDetail(selectedCard);
    renderQuickChips();
    renderActiveFilters();

    setQueryParams({
        q: qRaw,
        type: typeRaw,
        attr: attrRaw,
        race: raceRaw,
        arch: archRaw,
        kind: kindRaw,
        tag: tagRaw,
        st: stRaw,
        tcg: banTcgRaw,
        ocg: banOcgRaw,
        goat: banGoatRaw,
        lvlMin: levelMinInput?.value ?? '',
        lvlMax: levelMaxInput?.value ?? '',
        atkMin: atkMinInput?.value ?? '',
        atkMax: atkMaxInput?.value ?? '',
        defMin: defMinInput?.value ?? '',
        defMax: defMaxInput?.value ?? '',
        fav: favOnly ? 'fav' : '',
        sort,
    });
}

function resetFiltersToDefault() {
    if (searchInput) searchInput.value = '';
    if (typeFilter) typeFilter.value = '';
    if (attrFilter) attrFilter.value = '';
    if (raceFilter) raceFilter.value = '';
    if (archFilter) archFilter.value = '';
    if (kindFilter) kindFilter.value = '';
    if (tagFilter) tagFilter.value = '';
    if (stFilter) stFilter.value = '';
    if (banTcgFilter) banTcgFilter.value = '';
    if (banOcgFilter) banOcgFilter.value = '';
    if (banGoatFilter) banGoatFilter.value = '';
    if (levelMinInput) levelMinInput.value = '';
    if (levelMaxInput) levelMaxInput.value = '';
    if (atkMinInput) atkMinInput.value = '';
    if (atkMaxInput) atkMaxInput.value = '';
    if (defMinInput) defMinInput.value = '';
    if (defMaxInput) defMaxInput.value = '';
    if (favFilter) favFilter.value = '';
    if (sortSelect) sortSelect.value = 'name_asc';
}

function populateTypeFilter() {
    if (!typeFilter) return;
    // Reset to the default option.
    typeFilter.innerHTML = '<option value="">All types</option>';
    const types = new Set();
    for (const c of cards) {
        const t = String(c?.type ?? '').trim();
        if (t) types.add(t);
    }
    const sorted = Array.from(types).sort((a, b) => a.localeCompare(b));
    for (const t of sorted) {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        typeFilter.appendChild(opt);
    }
}

function populateAttrFilter() {
    if (!attrFilter) return;
    // Reset to the default option.
    attrFilter.innerHTML = '<option value="">All attributes</option>';
    const attrs = new Set();
    for (const c of cards) {
        const a = String(c?.attribute ?? '').trim();
        if (a) attrs.add(a);
    }
    const sorted = Array.from(attrs).sort((a, b) => a.localeCompare(b));
    for (const a of sorted) {
        const opt = document.createElement('option');
        opt.value = a;
        opt.textContent = a;
        attrFilter.appendChild(opt);
    }
}

function populateRaceFilter() {
    if (!raceFilter) return;
    raceFilter.innerHTML = '<option value="">All races</option>';
    const races = new Set();
    for (const c of cards) {
        const r = String(c?.race ?? '').trim();
        if (r) races.add(r);
    }
    const sorted = Array.from(races).sort((a, b) => a.localeCompare(b));
    for (const r of sorted) {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = r;
        raceFilter.appendChild(opt);
    }
}

function populateArchFilter() {
    if (!archFilter) return;
    archFilter.innerHTML = '<option value="">All archetypes</option>';
    const archs = new Set();
    for (const c of cards) {
        const a = String(c?.archetype ?? '').trim();
        if (a) archs.add(a);
    }
    const sorted = Array.from(archs).sort((a, b) => a.localeCompare(b));
    for (const a of sorted) {
        const opt = document.createElement('option');
        opt.value = a;
        opt.textContent = a;
        archFilter.appendChild(opt);
    }
}

function setHashForCard(card) {
    const id = getCardId(card);
    const newHash = id ? `#card=${encodeURIComponent(id)}` : '';
    if (newHash === window.location.hash) return;
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}${newHash}`);
}

function setQueryParams({ q, type, attr, race, arch, kind, tag, st, tcg, ocg, goat, lvlMin, lvlMax, atkMin, atkMax, defMin, defMax, fav, sort }) {
    const url = new URL(window.location.href);
    const setOrDelete = (k, v) => {
        if (v) url.searchParams.set(k, v);
        else url.searchParams.delete(k);
    };

    setOrDelete('q', q);
    setOrDelete('type', type);
    setOrDelete('attr', attr);
    setOrDelete('race', race);
    setOrDelete('arch', arch);
    setOrDelete('kind', kind);
    setOrDelete('tag', tag);
    setOrDelete('st', st);
    setOrDelete('tcg', tcg);
    setOrDelete('ocg', ocg);
    setOrDelete('goat', goat);
    setOrDelete('lvlMin', lvlMin);
    setOrDelete('lvlMax', lvlMax);
    setOrDelete('atkMin', atkMin);
    setOrDelete('atkMax', atkMax);
    setOrDelete('defMin', defMin);
    setOrDelete('defMax', defMax);
    setOrDelete('fav', fav);
    if (sort && sort !== 'name_asc') url.searchParams.set('sort', sort);
    else url.searchParams.delete('sort');

    const qs = url.searchParams.toString();
    const next = `${url.pathname}${qs ? `?${qs}` : ''}${window.location.hash || ''}`;
    const cur = `${window.location.pathname}${window.location.search}${window.location.hash || ''}`;
    if (next !== cur) history.replaceState(null, '', next);
}

function applyInputsFromQuery() {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('q') || '';
    const type = url.searchParams.get('type') || '';
    const attr = url.searchParams.get('attr') || '';
    const race = url.searchParams.get('race') || '';
    const arch = url.searchParams.get('arch') || '';
    const kind = url.searchParams.get('kind') || '';
    const tag = url.searchParams.get('tag') || '';
    const st = url.searchParams.get('st') || '';
    const tcg = url.searchParams.get('tcg') || '';
    const ocg = url.searchParams.get('ocg') || '';
    const goat = url.searchParams.get('goat') || '';
    const lvlMin = url.searchParams.get('lvlMin') || '';
    const lvlMax = url.searchParams.get('lvlMax') || '';
    const atkMin = url.searchParams.get('atkMin') || '';
    const atkMax = url.searchParams.get('atkMax') || '';
    const defMin = url.searchParams.get('defMin') || '';
    const defMax = url.searchParams.get('defMax') || '';
    const fav = url.searchParams.get('fav') || '';
    const sort = url.searchParams.get('sort') || 'name_asc';

    if (searchInput) searchInput.value = q;
    if (typeFilter) typeFilter.value = type;
    if (attrFilter) attrFilter.value = attr;
    if (raceFilter) raceFilter.value = race;
    if (archFilter) archFilter.value = arch;
    if (kindFilter) kindFilter.value = kind;
    if (tagFilter) tagFilter.value = tag;
    if (stFilter) stFilter.value = st;
    if (banTcgFilter) banTcgFilter.value = tcg;
    if (banOcgFilter) banOcgFilter.value = ocg;
    if (banGoatFilter) banGoatFilter.value = goat;
    if (levelMinInput) levelMinInput.value = lvlMin;
    if (levelMaxInput) levelMaxInput.value = lvlMax;
    if (atkMinInput) atkMinInput.value = atkMin;
    if (atkMaxInput) atkMaxInput.value = atkMax;
    if (defMinInput) defMinInput.value = defMin;
    if (defMaxInput) defMaxInput.value = defMax;
    if (favFilter) favFilter.value = fav;
    if (sortSelect) sortSelect.value = sort;
}

function parseCardFromHash() {
    const h = window.location.hash || '';
    if (!h.startsWith('#card=')) return null;
    const raw = h.slice('#card='.length);
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

function selectFromHash() {
    const id = parseCardFromHash();
    if (!id) return;

    const target = cards.find((c) => String(c?.id ?? '') === id);
    if (!target) return;
    const visible = filtered.some((c) => String(c?.id ?? '') === id);
    if (visible) {
        selectCard(target);
        return;
    }

    selectedCard = target;
    focusedCardId = id;
    renderGrid();
    renderDetail(selectedCard, { hiddenByFilters: true });
}

function setDatasetStatus(msg) {
    if (!datasetStatusEl) return;
    datasetStatusEl.textContent = msg || '';
}

function loadDatasetStore() {
    try {
        const raw = localStorage.getItem(DATASET_STORE_KEY);
        if (!raw) return { version: 1, items: [] };
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Number(parsed.version) !== 1) return { version: 1, items: [] };
        const items = Array.isArray(parsed.items) ? parsed.items : [];
        return {
            version: 1,
            items: items
                .filter((x) => x && typeof x === 'object')
                .map((x) => ({
                    id: String(x.id || ''),
                    name: String(x.name || '').trim() || 'Untitled',
                    rawText: String(x.rawText || ''),
                }))
                .filter((x) => x.id && x.rawText),
        };
    } catch {
        return { version: 1, items: [] };
    }
}

function saveDatasetStore(store) {
    try {
        localStorage.setItem(DATASET_STORE_KEY, JSON.stringify(store));
    } catch {
        // ignore
    }
}

function upsertSavedDataset({ id, name, rawText }) {
    const store = loadDatasetStore();
    const normId = id || `ds_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const normName = String(name || '').trim() || 'Untitled';
    const text = String(rawText || '');
    const idx = store.items.findIndex((x) => x.id === normId);
    if (idx >= 0) store.items[idx] = { id: normId, name: normName, rawText: text };
    else store.items.push({ id: normId, name: normName, rawText: text });
    saveDatasetStore(store);
    return normId;
}

function deleteSavedDataset(id) {
    const store = loadDatasetStore();
    store.items = store.items.filter((x) => x.id !== id);
    saveDatasetStore(store);
}

function getSelectedSavedDatasetId() {
    const v = String(datasetSelect?.value || '');
    return v.startsWith('__saved__:') ? v.slice('__saved__:'.length) : null;
}

function getSavedDatasetById(id) {
    const store = loadDatasetStore();
    return store.items.find((x) => x.id === id) || null;
}

function updateDatasetToolsState() {
    const id = getSelectedSavedDatasetId();
    const isSaved = Boolean(id);
    if (datasetRenameBtn) datasetRenameBtn.disabled = !isSaved;
    if (datasetDeleteBtn) datasetDeleteBtn.disabled = !isSaved;
    if (datasetExportBtn) datasetExportBtn.disabled = !isSaved;
    if (datasetSaveBtn) datasetSaveBtn.disabled = !Boolean(lastDatasetRawText);
}

function stripDatasetPrefix(label) {
    return String(label || '').replace(/^Dataset:\s*/i, '').trim();
}

function setDatasetDetailsHtml(html) {
    if (!datasetDetailsBodyEl) return;
    datasetDetailsBodyEl.innerHTML = html || '';
}

function setDatasetErrorDetails(message) {
    setDatasetDetailsHtml(`
        <div class="title">Dataset error</div>
        <div class="muted">${escapeHtml(message || 'Failed to load dataset.')}</div>
    `.trim());
    if (datasetDetailsEl) datasetDetailsEl.open = true;
}

function makeDatasetReport({ label, source, report }) {
    const title = stripDatasetPrefix(label || '') || 'Unknown';
    const src = String(source || '').trim();
    const format = report?.inputFormat ? String(report.inputFormat) : 'unknown';
    const count = Number(report?.normalizedCount ?? cards.length) || cards.length;
    const dups = Number(report?.duplicatesResolved ?? 0) || 0;

    const fields = report?.fieldCoverage && typeof report.fieldCoverage === 'object' ? report.fieldCoverage : {};
    const fieldLines = [
        ['name', 'Name'],
        ['type', 'Type'],
        ['frameType', 'Frame'],
        ['kind', 'Kind'],
        ['attribute', 'Attribute'],
        ['race', 'Race'],
        ['archetype', 'Archetype'],
        ['level', 'Level'],
        ['atk', 'ATK'],
        ['def', 'DEF'],
        ['scale', 'Scale'],
        ['linkval', 'Link'],
        ['linkmarkers', 'Link markers'],
        ['effect', 'Effect'],
        ['image', 'Image'],
        ['sets', 'Sets'],
        ['banlist', 'Banlist'],
    ].map(([k, labelText]) => {
        const n = Number(fields[k] ?? 0) || 0;
        return `<li><span class="muted">${escapeHtml(labelText)}:</span> ${n}/${count}</li>`;
    });

    const warnings = [];
    const missingType = count - (Number(fields.type ?? 0) || 0);
    if (count > 0 && missingType / count > 0.5) warnings.push('Many cards are missing a Type field (filters may be limited).');
    const missingName = count - (Number(fields.name ?? 0) || 0);
    if (count > 0 && missingName > 0) warnings.push('Some cards are missing a Name field (names may be auto-filled).');
    if (dups > 0) warnings.push(`${dups} duplicate id(s) were detected and auto-adjusted to keep ids unique.`);
    const nonObj = Number(report?.nonObjectCount ?? 0) || 0;
    if (nonObj > 0) warnings.push(`${nonObj} item(s) in the dataset were not objects (they were auto-normalized).`);

    const warningHtml = warnings.length
        ? `<div class="row"><span class="pill">Warnings</span></div><ul>${warnings
              .slice(0, 6)
              .map((w) => `<li>${escapeHtml(w)}</li>`)
              .join('')}</ul>`
        : `<div class="row"><span class="pill">No warnings</span><span class="muted">Looks good.</span></div>`;

    return `
        <div class="title">Dataset: ${escapeHtml(title)}</div>
        <div class="row">
            <span class="pill">${escapeHtml(String(count))} cards</span>
            <span class="pill">Format: ${escapeHtml(format)}</span>
            <span class="pill">Dup ids: ${escapeHtml(String(dups))}</span>
        </div>
        ${src ? `<div class="muted">Source: ${escapeHtml(src)}</div>` : ''}
        <div class="row"><span class="pill">Field coverage</span><span class="muted">(present / total)</span></div>
        <ul>${fieldLines.join('')}</ul>
        ${warningHtml}
    `.trim();
}

function normalizeCard(raw, idx) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const name = String(src.name ?? src.card_name ?? '').trim() || `Card ${idx + 1}`;
    const baseId = String(src.id ?? src.card_id ?? '').trim();
    const id = baseId || `${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_')}_${idx + 1}`;

    const type = String(src.type ?? '').trim() || null;
    const frameType = String(src.frameType ?? src.frame_type ?? '').trim() || null;
    const attribute = String(src.attribute ?? '').trim() || null;
    const race = String(src.race ?? '').trim() || null;
    const archetype = String(src.archetype ?? '').trim() || null;
    const level = Number.isFinite(Number(src.level)) ? Number(src.level) : null;
    const atk = Number.isFinite(Number(src.atk)) ? Number(src.atk) : null;
    const def = Number.isFinite(Number(src.def)) ? Number(src.def) : null;
    const scale = Number.isFinite(Number(src.scale)) ? Number(src.scale) : null;
    const linkval = Number.isFinite(Number(src.linkval)) ? Number(src.linkval) : null;
    const linkmarkers = Array.isArray(src.linkmarkers) ? src.linkmarkers.map((m) => String(m).trim()).filter(Boolean) : null;
    const effect = String(src.effect ?? src.desc ?? '').trim() || '';

    // Optional image field (URL or relative path).
    let image = String(src.image ?? src.image_url ?? src.img ?? '').trim() || null;
    if (!image && Array.isArray(src.card_images) && src.card_images[0] && typeof src.card_images[0] === 'object') {
        const first = src.card_images[0];
        image = String(first.image_url_small ?? first.image_url ?? '').trim() || null;
    }

    const ban = src.banlist_info && typeof src.banlist_info === 'object' ? src.banlist_info : null;
    const banlist = ban
        ? {
              tcg: String(ban.ban_tcg ?? '').trim() || null,
              ocg: String(ban.ban_ocg ?? '').trim() || null,
              goat: String(ban.ban_goat ?? '').trim() || null,
          }
        : null;

    const sets = Array.isArray(src.card_sets)
        ? src.card_sets
              .filter((x) => x && typeof x === 'object')
              .slice(0, 24)
              .map((s) => ({
                  name: String(s.set_name ?? '').trim() || null,
                  code: String(s.set_code ?? '').trim() || null,
                  rarity: String(s.set_rarity ?? '').trim() || null,
              }))
              .filter((s) => s.name || s.code)
        : null;

    const typeInfo = parseCardTypeInfo({ type, frameType });

    return {
        id,
        name,
        type,
        frameType,
        kind: typeInfo.kind,
        extraDeck: typeInfo.extraDeck,
        tags: typeInfo.tags,
        attribute,
        race,
        archetype,
        level,
        atk,
        def,
        scale,
        linkval,
        linkmarkers,
        effect,
        image,
        sets,
        banlist,
    };
}

function normalizeCards(data) {
    let arr = data;
    const inputFormat = arr && typeof arr === 'object' && Array.isArray(arr.data) ? 'object.data' : 'array';
    if (arr && typeof arr === 'object' && Array.isArray(arr.data)) arr = arr.data;
    if (!Array.isArray(arr)) throw new Error('cards JSON must be an array or an object with a data array');
    const nonObjectCount = arr.reduce((acc, x) => acc + (x && typeof x === 'object' ? 0 : 1), 0);
    const out = arr.map((c, i) => normalizeCard(c, i));

    const report = {
        inputFormat,
        inputCount: arr.length,
        normalizedCount: out.length,
        duplicatesResolved: 0,
        nonObjectCount,
        fieldCoverage: {},
    };

    // Ensure unique ids.
    const seen = new Set();
    for (const c of out) {
        let id = String(c.id);
        let changed = false;
        while (seen.has(id)) {
            id = `${id}_dup`;
            changed = true;
        }
        c.id = id;
        seen.add(id);
        if (changed) report.duplicatesResolved += 1;
    }

    const fields = [
        'name',
        'type',
        'frameType',
        'kind',
        'attribute',
        'race',
        'archetype',
        'level',
        'atk',
        'def',
        'scale',
        'linkval',
        'linkmarkers',
        'effect',
        'image',
        'sets',
        'banlist',
    ];
    for (const f of fields) report.fieldCoverage[f] = 0;
    for (const c of out) {
        for (const f of fields) {
            const v = c?.[f];
            let present = false;
            if (Array.isArray(v)) present = v.length > 0;
            else if (v && typeof v === 'object') present = Object.values(v).some((x) => x !== null && x !== undefined && String(x).trim() !== '');
            else present = v !== null && v !== undefined && String(v).trim() !== '';
            if (present) report.fieldCoverage[f] += 1;
        }
    }

    return { cards: out, report };
}

async function loadCardsFromUrl(url, { label } = {}) {
    setDatasetStatus(label ? `Loading: ${label}…` : 'Loading…');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const data = JSON.parse(text);
    lastDatasetRawText = text;
    lastDatasetSourceLabel = url;
    const norm = normalizeCards(data);
    cards = norm.cards;
    filtered = cards.slice();
    selectedCard = null;
    focusedCardId = null;
    populateTypeFilter();
    populateAttrFilter();
    populateRaceFilter();
    populateArchFilter();
    populateTagFilters();
    applyInputsFromQuery();
    applyFilter();
    renderQuickChips();
    maybeApplyActiveLayoutAfterLoad();
    renderDeck();
    const labelText = label || url;
    setDatasetStatus(`Dataset: ${stripDatasetPrefix(labelText)} • ${cards.length} cards`);
    setDatasetDetailsHtml(makeDatasetReport({ label: labelText, source: url, report: norm.report }));
}

function loadCardsFromSavedDataset(savedId) {
    const store = loadDatasetStore();
    const item = store.items.find((x) => x.id === savedId) || null;
    if (!item) throw new Error('Saved dataset not found');
    const text = String(item.rawText || '');
    const data = JSON.parse(text);
    lastDatasetRawText = text;
    lastDatasetSourceLabel = `Saved — ${item.name}`;
    const norm = normalizeCards(data);
    cards = norm.cards;
    filtered = cards.slice();
    selectedCard = null;
    focusedCardId = null;
    populateTypeFilter();
    populateAttrFilter();
    populateRaceFilter();
    populateArchFilter();
    populateTagFilters();
    applyInputsFromQuery();
    applyFilter();
    renderQuickChips();
    maybeApplyActiveLayoutAfterLoad();
    renderDeck();
    setDatasetStatus(`Dataset: Saved — ${item.name} • ${cards.length} cards`);
    setDatasetDetailsHtml(makeDatasetReport({ label: `Dataset: Saved — ${item.name}`, source: 'saved dataset', report: norm.report }));
}

function loadCardsFromCustomStorage() {
    const raw = localStorage.getItem(DATASET_CUSTOM_KEY);
    if (!raw) throw new Error('No custom dataset found in localStorage');
    lastDatasetRawText = raw;
    lastDatasetSourceLabel = 'custom localStorage';
    const parsed = JSON.parse(raw);
    const norm = normalizeCards(parsed);
    cards = norm.cards;
    filtered = cards.slice();
    selectedCard = null;
    focusedCardId = null;
    populateTypeFilter();
    populateAttrFilter();
    populateRaceFilter();
    populateArchFilter();
    populateTagFilters();
    applyInputsFromQuery();
    applyFilter();
    renderQuickChips();
    maybeApplyActiveLayoutAfterLoad();
    renderDeck();
    setDatasetStatus(`Dataset: Custom • ${cards.length} cards`);
    setDatasetDetailsHtml(makeDatasetReport({ label: 'Dataset: Custom', source: 'localStorage', report: norm.report }));
}

async function loadDatasetsManifest() {
    // Best effort: if this fails, keep the hard-coded option.
    try {
        const res = await fetch('cards/datasets.json');
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

async function initDatasets() {
    if (!datasetSelect) return;
    const manifest = await loadDatasetsManifest();
    const preferred = localStorage.getItem(DATASET_PREF_KEY) || '';

    datasetSelect.innerHTML = '';
    let added = 0;
    for (const item of manifest) {
        if (!item || typeof item !== 'object') continue;
        const path = String(item.path ?? '').trim();
        const label = String(item.label ?? item.id ?? path).trim();
        if (!path) continue;
        const opt = document.createElement('option');
        opt.value = path;
        opt.textContent = `Dataset: ${label}`;
        datasetSelect.appendChild(opt);
        added += 1;
    }
    if (added === 0) {
        const opt = document.createElement('option');
        opt.value = 'cards/sample-cards.json';
        opt.textContent = 'Dataset: Sample';
        datasetSelect.appendChild(opt);
    }

    // Server-provided dataset (full card DB). Only show when the backend is present.
    if (BACKEND_AVAILABLE) {
        const exists = Array.from(datasetSelect.options).some((o) => String(o?.value || '') === '/cards/all.json');
        if (!exists) {
            const opt = document.createElement('option');
            opt.value = '/cards/all.json';
            opt.textContent = 'Dataset: Server (All cards)';
            datasetSelect.appendChild(opt);
        }
    }

    // Custom dataset option
    const store = loadDatasetStore();
    if (store.items.length) {
        for (const item of store.items) {
            const opt = document.createElement('option');
            opt.value = `__saved__:${item.id}`;
            opt.textContent = `Dataset: Saved — ${item.name}`;
            datasetSelect.appendChild(opt);
        }
    }

    // Legacy single custom dataset option
    if (localStorage.getItem(DATASET_CUSTOM_KEY)) {
        const opt = document.createElement('option');
        opt.value = '__custom__';
        opt.textContent = 'Dataset: Custom (local)';
        datasetSelect.appendChild(opt);
    }

    if (preferred) {
        datasetSelect.value = preferred;
        return;
    }

    // Demo-friendly default: if the backend is present, prefer the full server dataset so
    // imported decks show real card names instead of raw ids.
    if (BACKEND_AVAILABLE) {
        try {
            const res = await fetch('/cards/all.json', { method: 'HEAD' });
            if (res.ok) {
                datasetSelect.value = '/cards/all.json';
                try {
                    localStorage.setItem(DATASET_PREF_KEY, '/cards/all.json');
                } catch {
                    // ignore
                }
            }
        } catch {
            // ignore
        }
    }
}

function initUI() {
    // Restore Odds UI prefs early (trials/hand/target-per-hand)
    const oddsPrefs = loadOddsUiPrefs();
    if (oddsTrialsSelect && oddsPrefs.trials) oddsTrialsSelect.value = String(oddsPrefs.trials);
    if (oddsHandSelect && oddsPrefs.handSize) oddsHandSelect.value = String(oddsPrefs.handSize);
    if (oddsTargetLockHand) oddsTargetLockHand.checked = !!oddsPrefs.targetPerHand;

    dockDetailPanelsIntoOddsPanel();

    if (searchInput) {
        searchInput.addEventListener('input', scheduleApplyFilter);
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchInput.value = '';
                applyFilter();
            }
        });
    }
    typeFilter?.addEventListener('change', applyFilter);
    attrFilter?.addEventListener('change', applyFilter);
    raceFilter?.addEventListener('change', applyFilter);
    archFilter?.addEventListener('change', applyFilter);
    kindFilter?.addEventListener('change', applyFilter);
    tagFilter?.addEventListener('change', applyFilter);
    stFilter?.addEventListener('change', applyFilter);
    banTcgFilter?.addEventListener('change', applyFilter);
    banOcgFilter?.addEventListener('change', applyFilter);
    banGoatFilter?.addEventListener('change', applyFilter);
    levelMinInput?.addEventListener('input', scheduleApplyFilter);
    levelMaxInput?.addEventListener('input', scheduleApplyFilter);
    atkMinInput?.addEventListener('input', scheduleApplyFilter);
    atkMaxInput?.addEventListener('input', scheduleApplyFilter);
    defMinInput?.addEventListener('input', scheduleApplyFilter);
    defMaxInput?.addEventListener('input', scheduleApplyFilter);
    favFilter?.addEventListener('change', applyFilter);
    sortSelect?.addEventListener('change', applyFilter);
    viewModeSelect?.addEventListener('change', applyUiPrefs);
    thumbSizeSelect?.addEventListener('change', applyUiPrefs);
    previewToggle?.addEventListener('change', applyUiPrefs);

    // Brand mascot: click to open full image in the existing image modal.
    const mascotBtn = document.querySelector('.brand-mascot');
    if (mascotBtn instanceof HTMLButtonElement) {
        mascotBtn.addEventListener('click', () => {
            const img = mascotBtn.querySelector('img');
            const src = img instanceof HTMLImageElement ? String(img.currentSrc || img.src || '').trim() : '';
            openStandaloneImageModal({ src, title: 'Duelist ARC — Mascot' });
        });
    }

    // Keep the sticky side panel offset aligned under the sticky header.
    const headerEl = document.querySelector('.header');
    const syncHeaderH = () => {
        if (!(headerEl instanceof HTMLElement)) return;
        const h = Math.max(0, Math.floor(headerEl.getBoundingClientRect().height || 0));
        document.documentElement.style.setProperty('--header-h', `${h}px`);
    };
    const syncViewTabsH = () => {
        if (!(viewTabsEl instanceof HTMLElement)) return;
        if (viewTabsEl.hidden) {
            document.documentElement.style.setProperty('--view-tabs-h', `0px`);
            return;
        }
        const h = Math.max(0, Math.floor(viewTabsEl.getBoundingClientRect().height || 0));
        document.documentElement.style.setProperty('--view-tabs-h', `${h}px`);
    };
    if (headerEl instanceof HTMLElement) {
        syncHeaderH();
        syncViewTabsH();
        window.addEventListener(
            'resize',
            () => {
                syncHeaderH();
                syncViewTabsH();
            },
            { passive: true },
        );
        if (window.ResizeObserver) {
            try {
                const ro = new ResizeObserver(syncHeaderH);
                ro.observe(headerEl);
            } catch {
                // ignore
            }
        }
    }
    if (viewTabsEl instanceof HTMLElement && window.ResizeObserver) {
        try {
            const roTabs = new ResizeObserver(syncViewTabsH);
            roTabs.observe(viewTabsEl);
        } catch {
            // ignore
        }
    }

    initOddsPanelChrome();
    initViewTabs();
    initDuelUi();

    oddsTrialsSelect?.addEventListener('change', () => {
        const next = loadOddsUiPrefs();
        next.trials = oddsTrialsSelect.value;
        saveOddsUiPrefs(next);
    });
    oddsHandSelect?.addEventListener('change', () => {
        const next = loadOddsUiPrefs();
        next.handSize = oddsHandSelect.value;
        saveOddsUiPrefs(next);
        if (isTargetPerHandEnabled()) syncTargetUiFromStore();
    });
    oddsTargetLockHand?.addEventListener('change', () => {
        const next = loadOddsUiPrefs();
        next.targetPerHand = !!oddsTargetLockHand.checked;
        saveOddsUiPrefs(next);
        syncTargetUiFromStore();
    });

    // Goldfish controls
    goldfishOpeningSelect?.addEventListener('change', () => {
        goldfish.openingHandSize = clampInt(goldfishOpeningSelect.value ?? 5, 1, 10);
        saveGoldfish();
        renderGoldfish();
    });
    goldfishNewBtn?.addEventListener('click', () => {
        if (buildMainDeckIdList().length === 0) {
            alert('Add cards to your Main deck first.');
            return;
        }
        goldfishNewHand({ isMulligan: false });
    });
    goldfishMulliganBtn?.addEventListener('click', () => {
        if (buildMainDeckIdList().length === 0) {
            alert('Add cards to your Main deck first.');
            return;
        }
        goldfishNewHand({ isMulligan: true });
    });
    goldfishKeepBtn?.addEventListener('click', () => {
        goldfishKeepHand();
    });
    goldfishDrawBtn?.addEventListener('click', () => {
        if (!goldfishEnsureDeckMatches()) {
            alert('Deck changed. Click Reset or New hand first.');
            return;
        }
        goldfishDraw(1);
    });
    goldfishNextBtn?.addEventListener('click', () => {
        if (!goldfishEnsureDeckMatches()) {
            alert('Deck changed. Click Reset or New hand first.');
            return;
        }
        goldfishNextTurn();
    });
    goldfishResetBtn?.addEventListener('click', () => {
        if (buildMainDeckIdList().length === 0) {
            alert('Add cards to your Main deck first.');
            return;
        }
        goldfishReset({ drawOpening: false });
    });
    goldfishCopyAiBtn?.addEventListener('click', async () => {
        const text = getGoldfishAiSummaryText();
        await copyText(text, { okMessage: 'AI summary copied to clipboard.', promptTitle: 'Copy AI summary:' });
    });

    const goldfishClick = (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        const action = t.getAttribute('data-action') || '';
        if (action !== 'gf-move') return;
        const from = t.getAttribute('data-from') || '';
        const to = t.getAttribute('data-to') || '';
        const idx = t.getAttribute('data-idx') || '';
        goldfishMove({ from, to, idx });
    };
    goldfishHandEl?.addEventListener('click', goldfishClick);
    goldfishFieldEl?.addEventListener('click', goldfishClick);
    goldfishGyEl?.addEventListener('click', goldfishClick);
    goldfishBanishEl?.addEventListener('click', goldfishClick);

    clearBtn?.addEventListener('click', () => {
        resetFiltersToDefault();
        applyFilter();
    });

    quickChipsEl?.addEventListener('click', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        const btn = t.closest('button.chip');
        if (!(btn instanceof Element)) return;
        const kind = btn.getAttribute('data-kind');
        const tag = btn.getAttribute('data-tag');
        const st = btn.getAttribute('data-st');
        const tcg = btn.getAttribute('data-tcg');
        const ocg = btn.getAttribute('data-ocg');
        const goat = btn.getAttribute('data-goat');

        if (kindFilter && kind) kindFilter.value = kindFilter.value === kind ? '' : kind;
        if (tagFilter && tag) tagFilter.value = tagFilter.value === tag ? '' : tag;
        if (stFilter && st) stFilter.value = stFilter.value === st ? '' : st;
        if (banTcgFilter && tcg) banTcgFilter.value = banTcgFilter.value === tcg ? '' : tcg;
        if (banOcgFilter && ocg) banOcgFilter.value = banOcgFilter.value === ocg ? '' : ocg;
        if (banGoatFilter && goat) banGoatFilter.value = banGoatFilter.value === goat ? '' : goat;
        applyFilter();
    });

    activeFiltersEl?.addEventListener('click', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        const btn = t.closest('button.chip');
        if (!(btn instanceof Element)) return;
        const key = btn.getAttribute('data-clear') || '';
        if (!key) return;

        if (key === 'all') {
            resetFiltersToDefault();
            applyFilter();
            return;
        }

        if (key === 'q' && searchInput) searchInput.value = '';
        if (key === 'type' && typeFilter) typeFilter.value = '';
        if (key === 'attr' && attrFilter) attrFilter.value = '';
        if (key === 'race' && raceFilter) raceFilter.value = '';
        if (key === 'arch' && archFilter) archFilter.value = '';
        if (key === 'kind' && kindFilter) kindFilter.value = '';
        if (key === 'tag' && tagFilter) tagFilter.value = '';
        if (key === 'st' && stFilter) stFilter.value = '';
        if (key === 'tcg' && banTcgFilter) banTcgFilter.value = '';
        if (key === 'ocg' && banOcgFilter) banOcgFilter.value = '';
        if (key === 'goat' && banGoatFilter) banGoatFilter.value = '';
        if (key === 'lvlMin' && levelMinInput) levelMinInput.value = '';
        if (key === 'lvlMax' && levelMaxInput) levelMaxInput.value = '';
        if (key === 'atkMin' && atkMinInput) atkMinInput.value = '';
        if (key === 'atkMax' && atkMaxInput) atkMaxInput.value = '';
        if (key === 'defMin' && defMinInput) defMinInput.value = '';
        if (key === 'defMax' && defMaxInput) defMaxInput.value = '';
        if (key === 'fav' && favFilter) favFilter.value = '';
        if (key === 'sort' && sortSelect) sortSelect.value = 'name_asc';

        applyFilter();
    });

    // Dataset controls
    datasetSelect?.addEventListener('change', async () => {
        const v = String(datasetSelect.value || '');
        localStorage.setItem(DATASET_PREF_KEY, v);
        try {
            if (v.startsWith('__saved__:')) {
                const id = v.slice('__saved__:'.length);
                loadCardsFromSavedDataset(id);
            } else if (v === '__custom__') {
                loadCardsFromCustomStorage();
            } else {
                await loadCardsFromUrl(v, { label: datasetSelect.options[datasetSelect.selectedIndex]?.textContent });
            }
        } catch (err) {
            console.error('Dataset load failed:', err);
            showError('Failed to load dataset');
            setDatasetStatus('Dataset: error');
            setDatasetErrorDetails('Failed to load dataset. Check the console for details.');
        } finally {
            updateDatasetToolsState();
        }
    });

    datasetLoadBtn?.addEventListener('click', () => datasetFileInput?.click());
    datasetFileInput?.addEventListener('change', async () => {
        const file = datasetFileInput.files?.[0] || null;
        if (!file) return;
        try {
            const text = await file.text();
            // Validate JSON up-front.
            JSON.parse(text);

            const baseName = String(file.name || 'dataset').replaceAll(/\.[^.]+$/g, '').trim() || 'Dataset';
            const id = upsertSavedDataset({ name: baseName, rawText: text });
            await initDatasets();
            if (datasetSelect) datasetSelect.value = `__saved__:${id}`;
            localStorage.setItem(DATASET_PREF_KEY, `__saved__:${id}`);
            loadCardsFromSavedDataset(id);
        } catch (err) {
            console.error('Custom dataset load failed:', err);
            const msg = err instanceof Error ? err.message : String(err);
            setDatasetStatus('Dataset: error');
            setDatasetErrorDetails(msg || 'Failed to load JSON file.');
            alert('Failed to load JSON file. Expected an array of cards, or an object with a "data" array (YGOPRODeck-style).');
        } finally {
            datasetFileInput.value = '';
        }
    });

    datasetSaveBtn?.addEventListener('click', async () => {
        if (!lastDatasetRawText) return;
        const proposed = stripDatasetPrefix(datasetSelect?.options?.[datasetSelect.selectedIndex]?.textContent || '') || 'Dataset';
        const name = prompt('Save dataset as:', proposed);
        if (!name) return;
        const trimmed = String(name).trim();
        if (!trimmed) return;
        const id = upsertSavedDataset({ name: trimmed, rawText: lastDatasetRawText });
        await initDatasets();
        if (datasetSelect) datasetSelect.value = `__saved__:${id}`;
        localStorage.setItem(DATASET_PREF_KEY, `__saved__:${id}`);
        loadCardsFromSavedDataset(id);
        updateDatasetToolsState();
    });

    datasetRenameBtn?.addEventListener('click', async () => {
        const id = getSelectedSavedDatasetId();
        if (!id) return;
        const item = getSavedDatasetById(id);
        if (!item) return;
        const name = prompt('Rename dataset:', item.name);
        if (!name) return;
        const trimmed = String(name).trim();
        if (!trimmed) return;
        upsertSavedDataset({ id, name: trimmed, rawText: item.rawText });
        await initDatasets();
        if (datasetSelect) datasetSelect.value = `__saved__:${id}`;
        updateDatasetToolsState();
    });

    datasetDeleteBtn?.addEventListener('click', async () => {
        const id = getSelectedSavedDatasetId();
        if (!id) return;
        const item = getSavedDatasetById(id);
        const ok = confirm(`Delete saved dataset "${item?.name || id}"?`);
        if (!ok) return;
        deleteSavedDataset(id);
        await initDatasets();
        // Fall back to first option.
        const next = datasetSelect?.options?.[0]?.value || 'cards/sample-cards.json';
        if (datasetSelect) datasetSelect.value = next;
        localStorage.setItem(DATASET_PREF_KEY, next);
        if (next.startsWith('__saved__:')) loadCardsFromSavedDataset(next.slice('__saved__:'.length));
        else if (next === '__custom__') loadCardsFromCustomStorage();
        else await loadCardsFromUrl(next, { label: datasetSelect?.options?.[datasetSelect.selectedIndex]?.textContent });
        updateDatasetToolsState();
    });

    datasetExportBtn?.addEventListener('click', () => {
        const id = getSelectedSavedDatasetId();
        if (!id) return;
        const item = getSavedDatasetById(id);
        if (!item) return;
        const safe = item.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_').replaceAll(/^_+|_+$/g, '') || 'dataset';
        downloadTextFile(`${safe}.json`, item.rawText + (item.rawText.endsWith('\n') ? '' : '\n'), 'application/json');
    });

    // Grid interactions (event delegation)
    const getCardFromEl = (cardEl) => {
        if (!(cardEl instanceof Element)) return null;
        const encoded = cardEl.getAttribute('data-id') || '';
        const id = decodeURIComponent(encoded);
        return cards.find((c) => String(c?.id ?? '') === id) || null;
    };

    grid?.addEventListener('mouseover', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        const cardEl = t.closest('.card');
        if (!cardEl) return;
        const card = getCardFromEl(cardEl);
        if (!card) return;
        showPreview(card, cardEl);
    });

    grid?.addEventListener('mouseout', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        const fromCard = t.closest('.card');
        const to = e.relatedTarget;
        const toCard = to instanceof Element ? to.closest('.card') : null;
        if (fromCard && fromCard !== toCard) hidePreview();
    });

    grid?.addEventListener('focusin', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        const cardEl = t.closest('.card');
        if (!cardEl) return;
        const card = getCardFromEl(cardEl);
        if (!card) return;
        showPreview(card, cardEl);
    });

    grid?.addEventListener('focusout', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        const fromCard = t.closest('.card');
        const to = e.relatedTarget;
        const toCard = to instanceof Element ? to.closest('.card') : null;
        if (fromCard && fromCard !== toCard) hidePreview();
    });

    grid?.addEventListener('click', (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        const cardEl = target.closest('.card');
        if (!cardEl) return;
        const encoded = cardEl.getAttribute('data-id') || '';
        const id = decodeURIComponent(encoded);
        const card = cards.find((c) => String(c?.id ?? '') === id) || null;
        if (!card) return;

        if (target instanceof HTMLImageElement && target.classList.contains('thumb')) {
            focusedCardId = id;
            selectCard(card);
            openImageModal(card);
            return;
        }

        const action = target.getAttribute('data-action');
        if (action === 'fav') {
            e.stopPropagation();
            toggleFavorite(card);
            applyFilter();
            if (selectedCard && getCardId(selectedCard) === id) renderDetail(card);
            return;
        }

        focusedCardId = id;
        selectCard(card);
    });

    grid?.addEventListener('keydown', (e) => {
        const active = document.activeElement;
        if (!(active instanceof Element)) return;
        const cardEl = active.closest('.card');
        if (!cardEl) return;
        const encoded = cardEl.getAttribute('data-id') || '';
        const id = decodeURIComponent(encoded);
        const card = cards.find((c) => String(c?.id ?? '') === id) || null;
        if (!card) return;

        const moveFocus = (dir) => {
            const items = Array.from(grid.querySelectorAll('.card'));
            const idx = items.indexOf(cardEl);
            if (idx < 0) return;
            let cols = 1;
            try {
                const tpl = getComputedStyle(grid).gridTemplateColumns;
                cols = Math.max(1, tpl.split(' ').filter(Boolean).length);
            } catch {
                cols = 1;
            }
            let next = idx;
            if (dir === 'left') next = Math.max(0, idx - 1);
            if (dir === 'right') next = Math.min(items.length - 1, idx + 1);
            if (dir === 'up') next = Math.max(0, idx - cols);
            if (dir === 'down') next = Math.min(items.length - 1, idx + cols);
            const el = items[next];
            if (el) el.focus();
        };

        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            focusedCardId = id;
            selectCard(card);
            return;
        }
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            moveFocus('left');
            return;
        }
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            moveFocus('right');
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            moveFocus('up');
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            moveFocus('down');
            return;
        }
        if (e.key.toLowerCase() === 'f') {
            e.preventDefault();
            toggleFavorite(card);
            applyFilter();
            if (selectedCard && getCardId(selectedCard) === id) renderDetail(card);
        }
    });

    // Deck controls
    populateDeckSelect();
    populateDeckCompareSelect();
    deckSelectEl?.addEventListener('change', () => setActiveDeck(deckSelectEl.value));
    deckNewBtn?.addEventListener('click', async () => {
        await createNewDeck({ name: 'New Deck' });
        deckNameInput?.focus();
        deckNameInput?.select();
    });
    deckDupBtn?.addEventListener('click', async () => await duplicateActiveDeck());
    deckDelBtn?.addEventListener('click', async () => await deleteActiveDeck());
    deckCompareSelect?.addEventListener('change', renderDeckCompare);
    deckCompareCopyBtn?.addEventListener('click', async () => {
        const otherId = String(deckCompareSelect?.value || '').trim();
        if (!otherId) return;
        const other = deckStore.decks?.[otherId] || null;
        if (!other) return;
        const text = getDeckDiffText(deck, other, getDeckDisplayNameById(otherId));
        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                alert('Deck diff copied to clipboard.');
                return;
            } catch {
                // fall through
            }
        }
        prompt('Copy deck diff:', text);
    });
    deckCopyListIdsBtn?.addEventListener('click', async () => {
        const text = getDeckListWithIdsText();
        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                alert('Deck list+ids copied to clipboard.');
                return;
            } catch {
                // fall through
            }
        }
        prompt('Copy your deck list+ids:', text);
    });
    deckPruneUnknownBtn?.addEventListener('click', () => {
        const unknown = getUnknownDeckIds();
        if (!unknown.length) return;
        const ok = confirm(`Remove ${unknown.length} unknown card id(s) from this deck (based on the current dataset)?`);
        if (!ok) return;
        for (const sec of DECK_SECTIONS) {
            const obj = deck.sections?.[sec] || {};
            for (const id of unknown) delete obj[id];
        }
        markDeckUpdated();
        saveDeck();
        renderDeck();
        if (selectedCard) renderDetail(selectedCard);
        renderDeckCompare();
    });

    // Opening-hand odds (deck-local starter selections)
    oddsListEl?.addEventListener('change', (e) => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement)) return;
        const action = t.getAttribute('data-action') || '';
        if (action !== 'starter' && action !== 'extender' && action !== 'handtrap' && action !== 'brick') return;
        const row = t.closest('[data-id]');
        if (!(row instanceof Element)) return;
        const encoded = row.getAttribute('data-id') || '';
        const id = decodeURIComponent(encoded);
        if (action === 'starter') setStarterSelected(id, t.checked);
        if (action === 'extender') setExtenderSelected(id, t.checked);
        if (action === 'handtrap') setHandtrapSelected(id, t.checked);
        if (action === 'brick') setBrickSelected(id, t.checked);
        renderOddsPanel();
    });
    oddsClearBtn?.addEventListener('click', () => {
        clearStartersForActiveDeck();
        renderOddsPanel();
    });
    oddsClearExtBtn?.addEventListener('click', () => {
        clearExtendersForActiveDeck();
        renderOddsPanel();
    });
    oddsClearHandtrapBtn?.addEventListener('click', () => {
        clearHandtrapsForActiveDeck();
        renderOddsPanel();
    });
    oddsClearBrickBtn?.addEventListener('click', () => {
        clearBricksForActiveDeck();
        renderOddsPanel();
    });
    oddsRunBtn?.addEventListener('click', () => {
        if (!oddsOutEl) return;
        const starters = getStarterSetForActiveDeck();
        const extenders = getExtenderSetForActiveDeck();
        const handtraps = getHandtrapSetForActiveDeck();
        const bricks = getBrickSetForActiveDeck();
        const mainTotal = buildMainDeckIdList().length;
        const trials = Math.max(1, Number(oddsTrialsSelect?.value) || 10000);
        const handSize = Math.max(1, Number(oddsHandSelect?.value) || 5);
        const target = getTargetFromUi(handSize);

        if (mainTotal <= 0) {
            oddsOutEl.innerHTML = `<span class="muted">No Main deck yet.</span>`;
            return;
        }
        if (handSize > mainTotal) {
            oddsOutEl.innerHTML = `<span class="pill">Hand size (${handSize}) can’t exceed Main deck size (${mainTotal}).</span>`;
            return;
        }
        if (!starters.size) {
            oddsOutEl.innerHTML = `<span class="pill">Select your “Starter” cards (and optionally Extenders), then click Run.</span>`;
            return;
        }

        let starterCopies = 0;
        let extenderCopies = 0;
        let handtrapCopies = 0;
        let brickCopies = 0;
        const mainObj = deck?.sections?.main || {};
        for (const [id, qty] of Object.entries(mainObj)) {
            const sid = String(id);
            const n = Number(qty) || 0;
            if (starters.has(sid)) starterCopies += n;
            if (extenders.has(sid)) extenderCopies += n;
            if (handtraps.has(sid)) handtrapCopies += n;
            if (bricks.has(sid)) brickCopies += n;
        }

        const startedAt = performance.now();
        const res = runOpeningHandSim({
            trials,
            handSize,
            starterSet: starters,
            extenderSet: extenders,
            handtrapSet: handtraps,
            brickSet: bricks,
            target
        });
        const ms = Math.max(0, performance.now() - startedAt);

        const pStarter = res.hitAnyStarter / res.trials;
        const pExtender = res.hitAnyExtender / res.trials;
        const pBoth = res.hitBoth / res.trials;
        const pHandtrap = res.hitAnyHandtrap / res.trials;
        const pNoBrick = res.hitNoBrick / res.trials;
        const pSEH = res.hitStarterExtHandtrap / res.trials;
        const pTarget = res.hitTarget / res.trials;

        const distS = [];
        for (let i = 0; i < res.distStarters.length; i++) distS.push(`${i}: ${formatPct(res.distStarters[i] / res.trials)}`);
        const distE = [];
        for (let i = 0; i < res.distExtenders.length; i++) distE.push(`${i}: ${formatPct(res.distExtenders[i] / res.trials)}`);
        const distH = [];
        for (let i = 0; i < res.distHandtraps.length; i++) distH.push(`${i}: ${formatPct(res.distHandtraps[i] / res.trials)}`);
        const distB = [];
        for (let i = 0; i < res.distBricks.length; i++) distB.push(`${i}: ${formatPct(res.distBricks[i] / res.trials)}`);

        const overlaps = [];
        const se = intersectCount(starters, extenders);
        const sh = intersectCount(starters, handtraps);
        const sb = intersectCount(starters, bricks);
        const eh = intersectCount(extenders, handtraps);
        const eb = intersectCount(extenders, bricks);
        const hb = intersectCount(handtraps, bricks);
        if (se) overlaps.push(`${se} Starter∩Extender`);
        if (sh) overlaps.push(`${sh} Starter∩Handtrap`);
        if (sb) overlaps.push(`${sb} Starter∩Brick`);
        if (eh) overlaps.push(`${eh} Extender∩Handtrap`);
        if (eb) overlaps.push(`${eb} Extender∩Brick`);
        if (hb) overlaps.push(`${hb} Handtrap∩Brick`);
        const overlapLine = overlaps.length ? `<div class="pill">Role overlap: ${escapeHtml(overlaps.join(' • '))}</div>` : '';

        const targetParts = [];
        if (target.minStarter > 0) targetParts.push(`Starter≥${target.minStarter}`);
        if (target.minExtender > 0) targetParts.push(`Extender≥${target.minExtender}`);
        if (target.minHandtrap > 0) targetParts.push(`Handtrap≥${target.minHandtrap}`);
        targetParts.push(`Brick≤${target.maxBrick}`);
        const targetLabel = targetParts.join(' AND ');
        const targetLine = `<div class="pill">P(Target): ${formatPct(pTarget)} <span class="muted">(${escapeHtml(targetLabel)})</span></div>`;

        oddsOutEl.innerHTML = `
            <div class="row" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                <span class="pill">P(≥1 starter): ${formatPct(pStarter)}</span>
                <span class="pill">P(≥1 extender): ${formatPct(pExtender)}</span>
                <span class="pill">P(starter+extender): ${formatPct(pBoth)}</span>
                <span class="pill">P(≥1 handtrap): ${formatPct(pHandtrap)}</span>
                <span class="pill">P(no brick): ${formatPct(pNoBrick)}</span>
                <span class="pill">P(S+E+H): ${formatPct(pSEH)}</span>
            </div>
            <div class="row" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">${targetLine}</div>
            ${overlapLine}
            <div class="muted">Main: ${res.deckSize} • Hand: ${res.handSize} • Trials: ${res.trials.toLocaleString()}</div>
            <div class="muted">Starters: ${starterCopies} copies (${starters.size} unique) • Extenders: ${extenderCopies} copies (${extenders.size} unique) • Handtraps: ${handtrapCopies} copies (${handtraps.size} unique) • Bricks: ${brickCopies} copies (${bricks.size} unique)</div>
            <div class="muted">Starters in hand: ${escapeHtml(distS.join(' • '))}</div>
            <div class="muted">Extenders in hand: ${escapeHtml(distE.join(' • '))}</div>
            <div class="muted">Handtraps in hand: ${escapeHtml(distH.join(' • '))}</div>
            <div class="muted">Bricks in hand: ${escapeHtml(distB.join(' • '))}</div>
            <div class="muted">Runtime: ${ms.toFixed(0)}ms</div>
        `.trim();
    });

    oddsBulkApplyBtn?.addEventListener('click', () => {
        const role = String(oddsBulkRoleSelect?.value || 'starter');
        const mode = String(oddsBulkModeSelect?.value || 'add');
        applyBulkRoleFromCurrentView({ role, mode });
    });

    oddsTargetPresetSelect?.addEventListener('change', () => {
        const preset = String(oddsTargetPresetSelect?.value || 'custom');
        if (preset !== 'custom') applyTargetPreset(preset);
        saveTargetPrefsForActiveDeck(getTargetPrefsFromUi(), getHandSizeUi());
    });

    const markTargetCustom = () => {
        if (!oddsTargetPresetSelect) return;
        if (String(oddsTargetPresetSelect.value || '') !== 'custom') oddsTargetPresetSelect.value = 'custom';
        saveTargetPrefsForActiveDeck(getTargetPrefsFromUi(), getHandSizeUi());
    };
    oddsTargetMinStarter?.addEventListener('input', markTargetCustom);
    oddsTargetMinExtender?.addEventListener('input', markTargetCustom);
    oddsTargetMinHandtrap?.addEventListener('input', markTargetCustom);
    oddsTargetMaxBrick?.addEventListener('input', markTargetCustom);

    // Restore per-deck target defaults on startup.
    syncTargetUiFromStore();

    if (deckNameInput) {
        deckNameInput.value = deck.name || '';
        deckNameInput.addEventListener('input', () => {
            deck.name = deckNameInput.value.trim();
            markDeckUpdated();
            saveDeck();
            renderDeck();
        });
    }
    if (deckNotesInput) {
        deckNotesInput.value = deck.notes || '';
        deckNotesInput.addEventListener('input', () => {
            deck.notes = deckNotesInput.value;
            markDeckUpdated();
            saveDeck();
        });
    }
    deckClearBtn?.addEventListener('click', () => {
        deck = emptyDeck();
        if (!deckStore.decks) deckStore.decks = {};
        deckStore.decks[activeDeckId] = deck;
        if (deckNameInput) deckNameInput.value = '';
        if (deckNotesInput) deckNotesInput.value = '';
        markDeckUpdated();
        saveDeck();
        renderDeck();
        if (selectedCard) renderDetail(selectedCard);
    });
    deckExportBtn?.addEventListener('click', exportDeck);
    deckExportListBtn?.addEventListener('click', exportDeckList);
    deckExportYdkBtn?.addEventListener('click', exportDeckYdk);
    deckImportBtn?.addEventListener('click', importDeck);
    deckImportListBtn?.addEventListener('click', importDeckList);
    deckImportYdkBtn?.addEventListener('click', importDeckYdk);

    deckImportFileBtn?.addEventListener('click', () => deckFileInput?.click());
    deckFileInput?.addEventListener('change', async () => {
        const file = deckFileInput.files?.[0] || null;
        if (!file) return;
        try {
            const text = await file.text();
            const name = String(file.name || '').toLowerCase();
            if (name.endsWith('.ydk')) {
                const res = importDeckYdkFromText(text);
                if (!res.ok) throw new Error(res.error || 'invalid ydk');
                if (!duelQuickDrawAfterDeckImport) alert('YDK imported.');
                else setDuelQuickOut('Deck uploaded: YDK imported. Shuffling + drawing 5…');
            } else if (name.endsWith('.json')) {
                const res = importDeckFromJsonText(text);
                if (!res.ok) throw new Error(res.error || 'invalid json');
                if (!duelQuickDrawAfterDeckImport) alert('Deck JSON imported.');
                else setDuelQuickOut('Deck uploaded: JSON imported. Shuffling + drawing 5…');
            } else {
                const res = importDeckListFromText(text);
                if (!res.ok) throw new Error('invalid list');
                if (res.missing.length) {
                    const msg =
                        `Imported with missing cards (${res.missing.length}).\n\nNot found in the current dataset:\n` +
                        res.missing.slice(0, 25).join('\n') +
                        (res.missing.length > 25 ? `\n…(+${res.missing.length - 25} more)` : '');
                    if (!duelQuickDrawAfterDeckImport) alert(msg);
                    else setDuelQuickOut(msg + '\n\nTip: choose “Dataset: Server (All cards)” for best matching.');
                } else {
                    if (!duelQuickDrawAfterDeckImport) alert('Deck list imported.');
                    else setDuelQuickOut('Deck uploaded: list imported. Shuffling + drawing 5…');
                }
            }

            if (duelQuickDrawAfterDeckImport) {
                duelQuickDrawAfterDeckImport = false;
                goldfish.openingHandSize = 5;
                goldfishNewHand({ isMulligan: false });
                setActiveView('duel');
            }
        } catch (err) {
            console.error('Deck file import failed:', err);
            if (!duelQuickDrawAfterDeckImport) alert('Import failed. Check file format and try again.');
            else setDuelQuickOut('Import failed. Check file format and try again.');
        } finally {
            deckFileInput.value = '';
            duelQuickDrawAfterDeckImport = false;
        }
    });

    deckDownloadBtn?.addEventListener('click', () => {
        const fmt = String(deckDownloadFormatSelect?.value || 'json');
        const deckName = (deck?.name || '').trim() || 'deck';
        const safe = deckName.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_').replaceAll(/^_+|_+$/g, '') || 'deck';
        if (fmt === 'ydk') {
            downloadTextFile(`${safe}.ydk`, getDeckYdkText(), 'text/plain');
            return;
        }
        if (fmt === 'txt') {
            downloadTextFile(`${safe}.txt`, getDeckListText(), 'text/plain');
            return;
        }
        downloadTextFile(`${safe}.json`, JSON.stringify(deck, null, 2) + '\n', 'application/json');
    });

    initLayoutsUi();
    applyUiPrefs();
    updateDatasetToolsState();

    // Image modal controls
    modalCloseBtn?.addEventListener('click', closeImageModal);
    modalPrevBtn?.addEventListener('click', () => moveModal(-1));
    modalNextBtn?.addEventListener('click', () => moveModal(1));
    modalZoomBtn?.addEventListener('click', toggleModalZoom);
    modalImgEl?.addEventListener('click', toggleModalZoom);
    imageModalEl?.addEventListener('click', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (t.getAttribute('data-action') === 'close') closeImageModal();
    });

    // Demo tour modal controls
    demoTourCloseBtn?.addEventListener('click', () => closeDemoTour({ markDone: false }));
    demoTourBackBtn?.addEventListener('click', () => {
        demoTourStepIdx = Math.max(0, Number(demoTourStepIdx) - 1);
        renderDemoTourStep();
    });
    demoTourNextBtn?.addEventListener('click', () => {
        demoTourStepIdx = Number(demoTourStepIdx) + 1;
        renderDemoTourStep();
    });
    demoTourDoneBtn?.addEventListener('click', () => closeDemoTour({ markDone: true }));
    demoTourModalEl?.addEventListener('click', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (t.getAttribute('data-action') === 'close') closeDemoTour({ markDone: false });
    });

    // Diagnostics modal controls
    demoDiagnosticsCloseBtn?.addEventListener('click', closeDiagnosticsModal);
    demoDiagnosticsCopyBtn?.addEventListener('click', async () => {
        const text = String(demoDiagnosticsPreEl?.textContent || '');
        await copyText(text, { okMessage: 'Diagnostics copied.', promptTitle: 'Copy diagnostics:' });
    });
    demoDiagnosticsModalEl?.addEventListener('click', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (t.getAttribute('data-action') === 'close') closeDiagnosticsModal();
    });

    // Global shortcuts
    document.addEventListener('keydown', (e) => {
        if (isModalOpen()) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeImageModal();
                return;
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                moveModal(-1);
                return;
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                moveModal(1);
                return;
            }
            if (e.key.toLowerCase() === 'z') {
                e.preventDefault();
                toggleModalZoom();
                return;
            }
            return;
        }
        if (isDemoTourOpen() && e.key === 'Escape') {
            e.preventDefault();
            closeDemoTour({ markDone: false });
            return;
        }
        if (isDiagnosticsOpen() && e.key === 'Escape') {
            e.preventDefault();
            closeDiagnosticsModal();
            return;
        }

        const active = document.activeElement;
        const typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');

        if (e.key === '/' && !typing) {
            e.preventDefault();
            searchInput?.focus();
            return;
        }
        if (e.key === 'Escape' && !typing) {
            resetFiltersToDefault();
            applyFilter();
        }
    });

    window.addEventListener('hashchange', selectFromHash);
}

function initOddsPanelChrome() {
    if (!(oddsPanelEl instanceof HTMLElement)) return;
    if (!(oddsPanelHeaderEl instanceof HTMLElement)) return;

    const clampNum = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

    const clampIntoView = ({ save = false } = {}) => {
        const explicit = !!oddsPanelEl.style.left || !!oddsPanelEl.style.top;
        if (!explicit) return;
        const margin = 8;
        const rect = oddsPanelEl.getBoundingClientRect();
        const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
        const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
        const left = clampNum(rect.left, margin, maxLeft);
        const top = clampNum(rect.top, margin, maxTop);
        oddsPanelEl.style.left = `${left}px`;
        oddsPanelEl.style.top = `${top}px`;
        oddsPanelEl.style.right = 'auto';
        if (save) {
            const prefs = loadOddsPanelPrefs();
            prefs.left = Math.round(left);
            prefs.top = Math.round(top);
            saveOddsPanelPrefs(prefs);
        }
    };

    const prefs = loadOddsPanelPrefs();
    const savedLeft = Number(prefs.left);
    const savedTop = Number(prefs.top);
    if (Number.isFinite(savedLeft) && Number.isFinite(savedTop)) {
        oddsPanelEl.style.left = `${savedLeft}px`;
        oddsPanelEl.style.top = `${savedTop}px`;
        oddsPanelEl.style.right = 'auto';
        clampIntoView({ save: false });
    }

    setOddsPanelMinimized(!!prefs.minimized, { save: false });
    updateDeckLabHint({ minimized: !!prefs.minimized });

    deckLabHintOpenBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        setOddsPanelMinimized(false);
    });
    deckLabHintCloseBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        setDeckLabHintDismissed(true);
        updateDeckLabHint();
    });

    oddsMinimizeBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setOddsPanelMinimized(true);
    });

    oddsRestoreTabBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        setOddsPanelMinimized(false);
    });

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let baseLeft = 0;
    let baseTop = 0;
    let baseW = 0;
    let baseH = 0;

    oddsPanelHeaderEl.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const t = e.target;
        if (t instanceof Element && t.closest('button')) return;
        if (oddsPanelEl.hidden) return;

        const rect = oddsPanelEl.getBoundingClientRect();
        baseLeft = rect.left;
        baseTop = rect.top;
        baseW = rect.width;
        baseH = rect.height;
        startX = e.clientX;
        startY = e.clientY;
        dragging = true;

        oddsPanelEl.style.left = `${baseLeft}px`;
        oddsPanelEl.style.top = `${baseTop}px`;
        oddsPanelEl.style.right = 'auto';

        try {
            oddsPanelHeaderEl.setPointerCapture(e.pointerId);
        } catch {
            // ignore
        }

        e.preventDefault();
    });

    oddsPanelHeaderEl.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const margin = 8;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const maxLeft = Math.max(margin, window.innerWidth - baseW - margin);
        const maxTop = Math.max(margin, window.innerHeight - baseH - margin);
        const left = clampNum(baseLeft + dx, margin, maxLeft);
        const top = clampNum(baseTop + dy, margin, maxTop);
        oddsPanelEl.style.left = `${left}px`;
        oddsPanelEl.style.top = `${top}px`;
        oddsPanelEl.style.right = 'auto';
    });

    const stopDrag = (e) => {
        if (!dragging) return;
        dragging = false;
        try {
            oddsPanelHeaderEl.releasePointerCapture(e.pointerId);
        } catch {
            // ignore
        }
        clampIntoView({ save: true });
    };

    oddsPanelHeaderEl.addEventListener('pointerup', stopDrag);
    oddsPanelHeaderEl.addEventListener('pointercancel', stopDrag);

    window.addEventListener(
        'resize',
        () => {
            clampIntoView({ save: false });
        },
        { passive: true },
    );
}

function dockDetailPanelsIntoOddsPanel() {
    if (!(oddsPanelEl instanceof HTMLElement)) return;
    const body = oddsPanelEl.querySelector('.odds-panel-body');
    if (!(body instanceof HTMLElement)) return;
    const oddsEl = body.querySelector('.odds');
    if (!(oddsEl instanceof HTMLElement)) return;

    const aside = document.querySelector('aside.detail');
    const cardEl = document.getElementById('card-detail');
    const deckEl = document.querySelector('.detail-inner.detail-deck');

    if (!(aside instanceof HTMLElement)) return;
    if (!(cardEl instanceof HTMLElement)) return;
    if (!(deckEl instanceof HTMLElement)) return;

    if (body.contains(cardEl) && body.contains(deckEl)) {
        aside.hidden = true;
        return;
    }

    const makeDivider = () => {
        const d = document.createElement('div');
        d.className = 'divider';
        return d;
    };

    const frag = document.createDocumentFragment();
    frag.appendChild(cardEl);
    frag.appendChild(makeDivider());
    frag.appendChild(deckEl);
    frag.appendChild(makeDivider());

    body.insertBefore(frag, oddsEl);
    aside.hidden = true;
}

function setActiveView(view) {
    const v = view === 'demo' || view === 'duel' ? view : 'select';
    const isDemo = v === 'demo';
    if (viewSelectionEl instanceof HTMLElement) viewSelectionEl.hidden = v !== 'select';
    if (viewDuelEl instanceof HTMLElement) viewDuelEl.hidden = v !== 'duel';
    if (viewDemoEl instanceof HTMLElement) viewDemoEl.hidden = v !== 'demo';
    if (viewTabDemoBtn instanceof HTMLButtonElement) viewTabDemoBtn.classList.toggle('btn-primary', isDemo);
    if (viewTabSelectBtn instanceof HTMLButtonElement) viewTabSelectBtn.classList.toggle('btn-primary', v === 'select');
    if (viewTabDuelBtn instanceof HTMLButtonElement) viewTabDuelBtn.classList.toggle('btn-primary', v === 'duel');
    try {
        localStorage.setItem(UI_ACTIVE_VIEW_KEY, v);
    } catch {
        // ignore
    }

    // Hide the floating Odds Panel when not in Selection view so it doesn't block duel UI.
    if (oddsPanelEl instanceof HTMLElement) {
        if (v !== 'select') oddsPanelEl.dataset.viewHidden = '1';
        else delete oddsPanelEl.dataset.viewHidden;
    }
    if (oddsRestoreTabBtn instanceof HTMLElement) {
        if (v !== 'select') oddsRestoreTabBtn.dataset.viewHidden = '1';
        else delete oddsRestoreTabBtn.dataset.viewHidden;
    }
    if (deckLabHintEl instanceof HTMLElement) {
        if (v !== 'select') deckLabHintEl.dataset.viewHidden = '1';
        else delete deckLabHintEl.dataset.viewHidden;
    }
    updateDeckLabHint();
}

function getDemoModePref() {
    try {
        return localStorage.getItem(DEMO_MODE_KEY) === '1';
    } catch {
        return false;
    }
}

function setDemoModePref(on) {
    try {
        localStorage.setItem(DEMO_MODE_KEY, on ? '1' : '0');
    } catch {
        // ignore
    }
}

function getThemePref() {
    try {
        return String(localStorage.getItem(THEME_KEY) || '').trim() || 'dark';
    } catch {
        return 'dark';
    }
}

function setThemePref(theme) {
    try {
        localStorage.setItem(THEME_KEY, String(theme || 'dark'));
    } catch {
        // ignore
    }
}

function applyTheme(theme) {
    const t = String(theme || 'dark');
    document.documentElement.classList.toggle('theme-light', t === 'light');
    if (demoThemeLightChk instanceof HTMLInputElement) demoThemeLightChk.checked = t === 'light';
}

function applyDemoMode(on) {
    const enabled = !!on;
    document.body.classList.toggle('demo-mode', enabled);
    if (demoModeChk instanceof HTMLInputElement) demoModeChk.checked = enabled;
    if (demoModeDrawerChk instanceof HTMLInputElement) demoModeDrawerChk.checked = enabled;
    if (viewTabDemoBtn instanceof HTMLButtonElement) viewTabDemoBtn.hidden = !enabled;
    if (demoBuildBannerEl instanceof HTMLElement) {
        demoBuildBannerEl.textContent = enabled ? DEMO_BUILD_LABEL : '';
        demoBuildBannerEl.hidden = !enabled;
    }
    if (demoBuildInlineEl instanceof HTMLElement) {
        demoBuildInlineEl.textContent = DEMO_BUILD_LABEL;
    }
    if (demoBuildFooterEl instanceof HTMLElement) {
        demoBuildFooterEl.textContent = DEMO_BUILD_LABEL;
    }
    if (enabled) {
        // Demo mode: keep UI focused and ensure advanced blocks start hidden.
        try {
            localStorage.setItem(DUEL_ADV_KEY, '0');
        } catch {
            // ignore
        }
        setActiveView('demo');
    }
}

function setDuelQuickOut(text) {
    if (!(duelQuickDeckOutEl instanceof HTMLElement)) return;
    duelQuickDeckOutEl.textContent = String(text || '');
}

function initViewTabs() {
    const saved = (() => {
        try {
            return String(localStorage.getItem(UI_ACTIVE_VIEW_KEY) || '').trim();
        } catch {
            return '';
        }
    })();

    setActiveView(saved || 'select');

    viewTabDemoBtn?.addEventListener('click', () => setActiveView('demo'));
    viewTabSelectBtn?.addEventListener('click', () => setActiveView('select'));
    viewTabDuelBtn?.addEventListener('click', () => setActiveView('duel'));

    // Demo mode toggle (streamlined UI + onboarding).
    applyDemoMode(getDemoModePref());
    applyTheme(getThemePref());
    demoModeChk?.addEventListener('change', () => {
        const on = !!demoModeChk.checked;
        setDemoModePref(on);
        applyDemoMode(on);
    });

    demoTourOpenBtn?.addEventListener('click', () => openDemoTour({ force: true }));

    demoCopyLinkBtn?.addEventListener('click', async () => {
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('demo', '1');
            url.searchParams.set('view', 'duel');
            url.searchParams.delete('tour');
            const s = String(duelSampleDeckSelect?.value || '').trim();
            if (s) url.searchParams.set('sample', s);
            await copyText(url.toString(), { okMessage: 'Demo link copied to clipboard.', promptTitle: 'Copy demo link:' });
        } catch {
            // ignore
        }
    });

    demoResetLocalBtn?.addEventListener('click', () => {
        const ok = confirm('Reset local demo data? This clears saved decks, layouts, and goldfish state for this browser.');
        if (!ok) return;
        const keys = [
            DECKS_KEY,
            DECK_KEY,
            GOLDFISH_KEY,
            DATASET_PREF_KEY,
            DATASET_CUSTOM_KEY,
            DATASET_STORE_KEY,
            UI_VIEW_KEY,
            UI_THUMB_KEY,
            UI_PREVIEW_KEY,
            UI_LAYOUTS_KEY,
            UI_LAYOUT_ACTIVE_KEY,
            DECK_ODDS_ROLES_KEY,
            ODDS_UI_PREFS_KEY,
            ODDS_PANEL_PREFS_KEY,
            UI_ACTIVE_VIEW_KEY,
            DECK_LAB_HINT_DISMISS_KEY,
            DEMO_MODE_KEY,
            DEMO_TOUR_DONE_KEY,
            DUEL_ADV_KEY,
        ];
        try {
            for (const k of keys) localStorage.removeItem(k);
        } catch {
            // ignore
        }
        try {
            const url = new URL(window.location.href);
            url.search = '?demo=1&view=duel&tour=1';
            window.location.href = url.toString();
        } catch {
            window.location.reload();
        }
    });

    demoFeedbackBtn?.addEventListener('click', async () => {
        const now = new Date();
        const tpl = [
            'Duelist ARC — Demo Feedback',
            `Build: ${DEMO_BUILD_LABEL}`,
            `Page: ${String(window.location.href)}`,
            `Time: ${now.toISOString()}`,
            `Browser: ${String(navigator.userAgent || '')}`,
            '',
            'What were you trying to do?',
            '-',
            '',
            'What happened?',
            '-',
            '',
            'What did you expect?',
            '-',
            '',
            'Steps to reproduce (if possible):',
            '1)',
            '2)',
            '3)',
        ].join('\n');
        await copyText(tpl, { okMessage: 'Feedback template copied.', promptTitle: 'Copy feedback template:' });
    });

    demoDiagnosticsBtn?.addEventListener('click', async () => {
        const text = await collectDiagnosticsText();
        openDiagnosticsModal(text);
    });

    initDemoSettingsDrawer();
}

async function renderDemoStatus() {
    if (!(demoStatusEl instanceof HTMLElement)) return;

    const pills = [];
    const pill = (label, kind) => {
        const cls = kind === 'ok' ? 'pill pill-ok' : kind === 'warn' ? 'pill pill-warn' : 'pill';
        pills.push(`<span class="${cls}">${escapeHtml(label)}</span>`);
    };

    // Server health (best effort)
    try {
        const res = await fetch('/healthz', { cache: 'no-store' });
        if (res.ok) pill('Server: online', 'ok');
        else pill('Server: offline', 'warn');
    } catch {
        pill('Server: offline', 'warn');
    }

    // Browser CPU (CoreIntegrator) health (best effort)
    try {
        const res = await fetch('/duel/session/health', { cache: 'no-store' });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.ok) pill('Browser CPU: ready', 'ok');
        else pill('Browser CPU: not configured', 'warn');
    } catch {
        pill('Browser CPU: not configured', 'warn');
    }

    // WindBot/EDOPro duel service health (optional; best effort)
    try {
        const res = await fetch('/duel/service/health', { cache: 'no-store' });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.ok) pill('WindBot CPU: online', 'ok');
        else pill('WindBot CPU: offline', 'warn');
    } catch {
        pill('WindBot CPU: offline', 'warn');
    }

    // Dataset hint
    const ds = String(datasetSelect?.value || '');
    if (ds === '/cards/all.json') pill('Dataset: full', 'ok');
    else pill('Dataset: limited', 'warn');

    demoStatusEl.innerHTML = pills.join(' ');
}

function openDemoSettings() {
    if (!(demoSettingsEl instanceof HTMLElement)) return;
    demoSettingsEl.classList.add('is-on');
    demoSettingsEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
}

function closeDemoSettings() {
    if (!(demoSettingsEl instanceof HTMLElement)) return;
    demoSettingsEl.classList.remove('is-on');
    demoSettingsEl.setAttribute('aria-hidden', 'true');
    const otherModalOpen =
        (imageModalEl instanceof HTMLElement && imageModalEl.classList.contains('is-on')) ||
        (demoTourModalEl instanceof HTMLElement && demoTourModalEl.classList.contains('is-on'));
    if (!otherModalOpen) document.body.classList.remove('modal-open');
}

function initDemoSettingsDrawer() {
    // Sync initial state
    if (demoModeDrawerChk instanceof HTMLInputElement) demoModeDrawerChk.checked = getDemoModePref();
    applyTheme(getThemePref());

    demoSettingsOpenBtn?.addEventListener('click', openDemoSettings);
    demoSettingsCloseBtn?.addEventListener('click', closeDemoSettings);
    demoSettingsEl?.addEventListener('click', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (t.getAttribute('data-action') === 'close') closeDemoSettings();
    });

    demoThemeLightChk?.addEventListener('change', () => {
        const next = demoThemeLightChk.checked ? 'light' : 'dark';
        setThemePref(next);
        applyTheme(next);
    });

    demoModeDrawerChk?.addEventListener('change', () => {
        const on = !!demoModeDrawerChk.checked;
        setDemoModePref(on);
        applyDemoMode(on);
    });

    demoCopyLinkDrawerBtn?.addEventListener('click', () => demoCopyLinkBtn?.click?.());
    demoTourOpenDrawerBtn?.addEventListener('click', () => openDemoTour({ force: true }));
    demoDiagnosticsDrawerBtn?.addEventListener('click', () => demoDiagnosticsBtn?.click?.());
    demoResetLocalDrawerBtn?.addEventListener('click', () => demoResetLocalBtn?.click?.());
    demoFeedbackDrawerBtn?.addEventListener('click', () => demoFeedbackBtn?.click?.());
}

function isDiagnosticsOpen() {
    return demoDiagnosticsModalEl instanceof HTMLElement && demoDiagnosticsModalEl.classList.contains('is-on');
}

function openDiagnosticsModal(text) {
    if (!(demoDiagnosticsModalEl instanceof HTMLElement)) return;
    if (demoDiagnosticsPreEl instanceof HTMLElement) demoDiagnosticsPreEl.textContent = String(text || '');
    demoDiagnosticsModalEl.classList.add('is-on');
    demoDiagnosticsModalEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
}

function closeDiagnosticsModal() {
    if (!(demoDiagnosticsModalEl instanceof HTMLElement)) return;
    demoDiagnosticsModalEl.classList.remove('is-on');
    demoDiagnosticsModalEl.setAttribute('aria-hidden', 'true');
    const otherModalOpen =
        (imageModalEl instanceof HTMLElement && imageModalEl.classList.contains('is-on')) ||
        (demoTourModalEl instanceof HTMLElement && demoTourModalEl.classList.contains('is-on')) ||
        (demoSettingsEl instanceof HTMLElement && demoSettingsEl.classList.contains('is-on'));
    if (!otherModalOpen) document.body.classList.remove('modal-open');
}

async function collectDiagnosticsText() {
    const now = new Date();
    const lines = [];
    lines.push('Duelist ARC — Diagnostics');
    lines.push(`Build: ${DEMO_BUILD_LABEL}`);
    lines.push(`Time: ${now.toISOString()}`);
    lines.push(`Page: ${String(window.location.href)}`);
    lines.push(`User-Agent: ${String(navigator.userAgent || '')}`);
    lines.push(`Theme: ${getThemePref()}`);
    lines.push(`Demo mode: ${getDemoModePref() ? 'on' : 'off'}`);
    lines.push(`Dataset: ${String(datasetSelect?.value || '')}`);
    lines.push('');

    const tryFetchJson = async (url) => {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            const data = await res.json().catch(() => null);
            return { ok: res.ok, status: res.status, data };
        } catch (e) {
            return { ok: false, status: 0, data: { error: String(e?.message || e) } };
        }
    };

    const healthz = await tryFetchJson('/healthz');
    lines.push(`/healthz: ${healthz.ok ? 'ok' : 'fail'} (${healthz.status || 'offline'})`);

    const duelService = await tryFetchJson('/duel/service/health');
    lines.push(`/duel/service/health: ${duelService.ok ? 'ok' : 'fail'} (${duelService.status || 'offline'})`);
    if (duelService.data) lines.push(`  ${JSON.stringify(duelService.data)}`);

    const windbot = await tryFetchJson('/cpu-duel/edopro/health');
    lines.push(`/cpu-duel/edopro/health: ${windbot.ok ? 'ok' : 'fail'} (${windbot.status || 'offline'})`);
    if (windbot.data) lines.push(`  ${JSON.stringify(windbot.data)}`);

    const banlists = await tryFetchJson('/duel/service/banlists');
    lines.push(`/duel/service/banlists: ${banlists.ok ? 'ok' : 'fail'} (${banlists.status || 'offline'})`);
    if (banlists.data) {
        const count = Array.isArray(banlists.data?.banlists) ? banlists.data.banlists.length : 0;
        lines.push(`  banlists: ${count}`);
        if (banlists.data?.hint) lines.push(`  hint: ${String(banlists.data.hint)}`);
    }

    return lines.join('\n');
}

function setDuelOut(text) {
    if (!(duelOutEl instanceof HTMLElement)) return;
    duelOutEl.textContent = String(text || '');
}

async function refreshDuelLoginRequiredBanner() {
    if (!(duelLoginRequiredEl instanceof HTMLElement)) return;
    try {
        const res = await fetch('/duel/service/stats', { credentials: 'same-origin' });
        if (res.status === 401 || res.status === 403) {
            duelLoginRequiredEl.hidden = false;
            return;
        }
        duelLoginRequiredEl.hidden = true;
    } catch {
        // If server is unreachable, don’t show auth-required banner; health line handles offline messaging.
        duelLoginRequiredEl.hidden = true;
    }
}

function setDuelLocalOut(text) {
    if (!(duelLocalOutEl instanceof HTMLElement)) return;
    duelLocalOutEl.textContent = String(text || '');
}

let duelQuickDrawAfterDeckImport = false;
let demoPendingSampleId = '';

function initDuelUi() {
    if (!(duelStartBtn instanceof HTMLButtonElement)) return;
    if (!(duelStopBtn instanceof HTMLButtonElement)) return;
    if (!(duelBanlistInput instanceof HTMLInputElement)) return;
    if (duelBanlistSelect && !(duelBanlistSelect instanceof HTMLSelectElement)) return;

    let activeDuelId = '';
    let serviceOk = false;
    let startBusy = false;

    const isDuelViewVisible = () => (viewDuelEl instanceof HTMLElement ? !viewDuelEl.hidden : true);

    const getBanlistName = () => String(duelBanlistInput.value || '').trim();

    const getAdvancedPref = () => {
        try {
            return String(localStorage.getItem(DUEL_ADV_KEY) || '') === '1';
        } catch {
            return false;
        }
    };

    const setAdvancedPref = (on) => {
        try {
            localStorage.setItem(DUEL_ADV_KEY, on ? '1' : '0');
        } catch {
            // ignore
        }
    };

    const applyAdvancedUi = () => {
        const adv = getAdvancedPref();
        // For the public demo: always show the "Browser Duel" block, since it powers the in-browser CPU duel.
        // Keep "Local Duel (Debug)" behind the Advanced toggle.
        // Keep "WindBot CPU (Legacy)" behind the Advanced toggle (optional service).
        const demoMode = getDemoModePref();
        if (duelAdvancedBlockEl instanceof HTMLElement) duelAdvancedBlockEl.hidden = !adv && !demoMode;
        if (duelCpuBlockEl instanceof HTMLElement) duelCpuBlockEl.hidden = demoMode ? !adv : false;
        if (duelLocalBlockEl instanceof HTMLElement) duelLocalBlockEl.hidden = !adv;
        if (duelAdvancedToggleBtn instanceof HTMLButtonElement) {
            duelAdvancedToggleBtn.classList.toggle('btn-primary', adv);
            duelAdvancedToggleBtn.title = adv ? 'Hide debug controls' : 'Show debug controls (local dev)';
        }
    };

    const refreshBrowserCpuPrimaryStatus = async () => {
        if (!(duelBrowserPrimaryStatusEl instanceof HTMLElement)) return;
        try {
            const res = await fetch('/duel/session/health', { cache: 'no-store' });
            const data = await res.json().catch(() => null);
            if (res.ok && data?.ok) {
                duelBrowserPrimaryStatusEl.textContent = 'Browser CPU: ready';
                return;
            }
            duelBrowserPrimaryStatusEl.textContent = 'Browser CPU: not configured';
        } catch {
            duelBrowserPrimaryStatusEl.textContent = 'Browser CPU: offline';
        }
    };

    initOnlineSoonScript();
    initQuickDeckUi();
    const syncStartAvailability = () => {
        const banlist = getBanlistName();
        const canStart = !!serviceOk && !startBusy && !!banlist;
        duelStartBtn.disabled = !canStart;
        duelStartBtn.title = !banlist
            ? 'Enter a banlist name first (e.g. “2026.04 TCG”).'
            : !serviceOk
              ? 'Duel service is offline (EDOpro-server-ts not reachable).'
              : 'Start a CPU duel (server-hosted).';
    };

    setDuelOut('WindBot CPU (legacy). Set a banlist name, then click “Start WindBot CPU (legacy)”.');
    syncStartAvailability();
    void refreshDuelServiceHealth().then((ok) => {
        serviceOk = !!ok;
        syncStartAvailability();
        if (!serviceOk) setDuelOut('WindBot CPU service is offline (optional). For the demo, use “Duel a CPU (browser)” below.');
    });
    void refreshDuelLoginRequiredBanner();
    applyAdvancedUi();
    void refreshBrowserCpuPrimaryStatus();
    if (duelAdvancedToggleBtn instanceof HTMLButtonElement) {
        duelAdvancedToggleBtn.addEventListener('click', () => {
            const next = !getAdvancedPref();
            setAdvancedPref(next);
            applyAdvancedUi();
        });
    }

    if (duelBrowserPrimaryStartBtn instanceof HTMLButtonElement) {
        duelBrowserPrimaryStartBtn.addEventListener('click', async () => {
            // Ensure the Browser Duel block is visible.
            setAdvancedPref(true);
            applyAdvancedUi();
            // Prefer CPU mode.
            try {
                localStorage.setItem(DUEL_CPU_MODE_KEY, '1');
            } catch {
                // ignore
            }
            // Demo-friendly: if the current deck is too small, auto-load a sample deck.
            try {
                const mainCount = Object.values(deck?.sections?.main || {}).reduce((a, v) => a + (Number(v) || 0), 0);
                if (mainCount < 40) {
                    const id = String(demoPendingSampleId || duelSampleDeckSelect?.value || 'classic_demo').trim() || 'classic_demo';
                    if (duelSampleDeckSelect instanceof HTMLSelectElement) duelSampleDeckSelect.value = id;
                    duelSampleDeckLoadBtn?.click?.();
                }
            } catch {
                // ignore
            }
            if (duelSessionAutoChk instanceof HTMLInputElement) duelSessionAutoChk.checked = true;
            duelSessionStartBtn?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
            // Attempt start immediately; deck auto-load safety exists in the demo landing handler, but not here.
            // If deck is invalid, the browser duel UI will show an error message.
            window.setTimeout(() => duelSessionStartBtn?.click?.(), 200);
        });
    }

    void initBanlistPicker();

    duelStartBtn.addEventListener('click', async () => {
        const banlist = getBanlistName();
        if (!banlist) {
            setDuelOut('Missing banlist. Enter a banlist name (e.g. “2026.04 TCG”), then try again.');
            syncStartAvailability();
            return;
        }

        startBusy = true;
        syncStartAvailability();
        setDuelOut('Starting CPU duel…');

        const payload = {
            name: 'CPU Duel',
            rule: Number(duelRuleSelect?.value ?? 1),
            banlist,
            botName: String(duelBotNameInput?.value || 'WindBot').trim(),
            deck: String(duelBotDeckInput?.value || '').trim(),
        };

        try {
            const res = await fetch('/cpu-duel/edopro/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const rawText = await res.text();
            const data = rawText ? safeJsonParse(rawText) : null;
            if (!res.ok) {
                const code = String(data?.error || '');
                const err = code || `HTTP ${res.status}`;
                const hint = data?.hint ? `\nHint: ${String(data.hint)}` : '';
                throw new Error(`${err}${hint}`);
            }

            activeDuelId = String(data?.duelId || '');
            duelStopBtn.disabled = !activeDuelId;

            const join = data?.join && typeof data.join === 'object' ? data.join : null;
            const hasJoinInfo = !!join && !!String(join.host || '') && !!String(join.port || '');
            const out = hasJoinInfo
                ? `CPU duel started (legacy).\n\n` +
                  `Join from EDOPro client:\n` +
                  `Host: ${String(join.host || '')}\n` +
                  `Port: ${String(join.port || '')}\n` +
                  (String(join.roomPassword || '') ? `Room password: ${String(join.roomPassword || '')}\n\n` : `\n`) +
                  `Tip: keep this tab open so you can Stop the bot when you’re done.`
                : `CPU duel started.\n\nThis server is configured to hide desktop-client join info. In-browser duel field UI is coming next.`;
            setDuelOut(out);
        } catch (e) {
            const msg = String(e?.message || e);
            if (msg.includes('unauthorized') || msg.includes('forbidden')) {
                setDuelOut('Failed to start: sign in first (Duelist ARC requires login for duels in production).');
                void refreshDuelLoginRequiredBanner();
            } else if (msg.includes('quota_exceeded') || msg.includes('HTTP 429')) {
                setDuelOut('Too many duel starts too quickly. Please wait a minute, then try again.');
            } else if (msg.includes('windbot_not_configured')) {
                setDuelOut(
                    'Failed to start: WindBot is not configured on the server.\n' +
                        'Hint: set WINDBOT_EXE (and optionally WINDBOT_CWD) in the server environment, or mount it via docker-compose.duel.yml.',
                );
            } else if (msg.includes('missing_banlist')) {
                setDuelOut('Failed to start: missing banlist. Enter a valid banlist name (must match EDOpro-server-ts resources).');
            } else if (msg.includes('edopro_room_create_failed') || msg.includes('edopro_unreachable')) {
                setDuelOut('Failed to start: duel service is offline or unreachable. Check /duel/service/health and EDOPRO_HTTP_URL.');
                serviceOk = false;
                syncStartAvailability();
            } else {
                setDuelOut(`Failed to start: ${msg}`);
            }
            activeDuelId = '';
            duelStopBtn.disabled = true;
            void refreshDuelServiceHealth().then((ok) => {
                serviceOk = !!ok;
                syncStartAvailability();
            });
        } finally {
            startBusy = false;
            syncStartAvailability();
        }
    });

    duelStopBtn.addEventListener('click', async () => {
        if (!activeDuelId) return;
        duelStopBtn.disabled = true;
        try {
            await fetch('/cpu-duel/edopro/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ duelId: activeDuelId }),
            });
            setDuelOut('Stopped.');
        } catch {
            setDuelOut('Stop request failed.');
        } finally {
            activeDuelId = '';
        }
    });

    initLocalDuelUi();
    initBrowserDuelSessionUi();

    duelBanlistInput.addEventListener('input', syncStartAvailability);
    duelRuleSelect?.addEventListener('change', syncStartAvailability);

    // Keep service status fresh while the Duel view is visible.
    window.setInterval(() => {
        if (!isDuelViewVisible()) return;
        void refreshDuelServiceHealth().then((ok) => {
            serviceOk = !!ok;
            syncStartAvailability();
        });
    }, 5000);

    async function initBanlistPicker() {
        if (!(duelBanlistSelect instanceof HTMLSelectElement)) return;
        duelBanlistSelect.innerHTML = '';
        const makeOpt = (value, label) => {
            const o = document.createElement('option');
            o.value = String(value || '');
            o.textContent = String(label || value || '');
            return o;
        };
        duelBanlistSelect.appendChild(makeOpt('', 'Banlist: (type manually)'));

        const setBanlist = (name) => {
            const v = String(name || '').trim();
            if (!v) return;
            duelBanlistInput.value = v;
            // Keep select in sync if it exists.
            const opt = Array.from(duelBanlistSelect.options).find((o) => String(o.value) === v);
            duelBanlistSelect.value = opt ? v : '';
            syncStartAvailability();
        };

        const renderQuick = (names) => {
            if (!(duelBanlistQuickEl instanceof HTMLElement)) return;
            duelBanlistQuickEl.innerHTML = '';

            const findFirst = (pred) => (Array.isArray(names) ? names.find((n) => pred(String(n || ''))) : '') || '';
            const latestTcg = findFirst((n) => /\bTCG\b/i.test(n));
            const latestOcg = findFirst((n) => /\bOCG\b/i.test(n));
            const goat = findFirst((n) => /\bGOAT\b/i.test(n));
            const edison = findFirst((n) => /\bEdison\b/i.test(n));
            const md = findFirst((n) => /\bMD\b/i.test(n));

            const choices = [
                { key: 'tcg', label: 'Latest TCG', value: latestTcg },
                { key: 'ocg', label: 'Latest OCG', value: latestOcg },
                { key: 'goat', label: 'GOAT', value: goat },
                { key: 'edison', label: 'Edison', value: edison },
                { key: 'md', label: 'Master Duel', value: md },
            ].filter((c) => !!c.value);

            for (const c of choices) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'chip';
                b.textContent = c.label;
                b.title = String(c.value);
                b.addEventListener('click', () => setBanlist(c.value));
                duelBanlistQuickEl.appendChild(b);
            }
        };

        try {
            const res = await fetch('/duel/service/banlists');
            const raw = await res.text();
            const data = raw ? safeJsonParse(raw) : null;
            const names = Array.isArray(data?.banlists) ? data.banlists : [];
            for (const n of names.slice(0, 250)) {
                duelBanlistSelect.appendChild(makeOpt(n, n));
            }
            renderQuick(names);
            if (!getBanlistName() && names[0]) {
                setBanlist(names[0]);
            }
        } catch {
            // Fallback: show a few common names (matches EDOPro/DuelingNexus conventions when available).
            renderQuick(['2026.02 TCG', '2026.04 OCG', '2005.4 GOAT', '2010.3 Edison']);
        }

        duelBanlistSelect.addEventListener('change', () => {
            const v = String(duelBanlistSelect.value || '');
            if (!v) return;
            setBanlist(v);
        });

        duelBanlistInput.addEventListener('input', () => {
            const v = getBanlistName();
            if (!v) {
                duelBanlistSelect.value = '';
                return;
            }
            // If user typed an exact match, keep select in sync; otherwise show manual.
            const opt = Array.from(duelBanlistSelect.options).find((o) => String(o.value) === v);
            duelBanlistSelect.value = opt ? v : '';
        });
    }

    function initOnlineSoonScript() {
        if (!(duelOnlineSoonTextEl instanceof HTMLElement)) return;
        const reduceMotion = (() => {
            try {
                return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
            } catch {
                return false;
            }
        })();

        const lines = [
            'Online dueling is coming soon.',
            'This demo focuses on CPU duels (server-hosted).',
            'PvP matchmaking + friend duels are in progress.',
        ];

        if (reduceMotion) {
            duelOnlineSoonTextEl.textContent = lines.join(' ');
            return;
        }

        const full = lines.join(' ');
        let i = 0;
        duelOnlineSoonTextEl.textContent = '';
        const tick = () => {
            i = Math.min(full.length, i + 1);
            duelOnlineSoonTextEl.textContent = full.slice(0, i);
            if (i >= full.length) return;
            window.setTimeout(tick, i % 4 === 0 ? 28 : 16);
        };
        window.setTimeout(tick, 250);
    }

    function setQuickDeckOut(text) {
        if (!(duelQuickDeckOutEl instanceof HTMLElement)) return;
        duelQuickDeckOutEl.textContent = String(text || '');
    }

    function renderQuickDeckHand() {
        if (!(duelQuickDeckOutEl instanceof HTMLElement)) return;
        const deckName = (deck?.name || '').trim() || 'Untitled';
        const mainTotal = buildMainDeckIdList().length;
        if (mainTotal <= 0) {
            setQuickDeckOut('No Main deck yet. Upload a deck or build one, then click “Shuffle + Draw 5”.');
            return;
        }
        const names = (goldfish?.hand || []).map(cardNameById);
        const header = `${deckName} • Main ${mainTotal} • Hand ${names.length}\n`;
        const lines = names.length ? names.map((n, i) => `${i + 1}. ${n}`).join('\n') : '(empty hand)';
        setQuickDeckOut(header + lines);
    }

    function quickDeckDrawOpening5({ isMulligan } = {}) {
        const mainTotal = buildMainDeckIdList().length;
        if (mainTotal <= 0) {
            renderQuickDeckHand();
            return;
        }
        goldfish.openingHandSize = 5;
        goldfishNewHand({ isMulligan: !!isMulligan });
        renderQuickDeckHand();
    }

    function initQuickDeckUi() {
        renderQuickDeckHand();

        // Sample decks (name-based import; best with Server (All cards) dataset).
        if (duelSampleDeckSelect instanceof HTMLSelectElement) {
            duelSampleDeckSelect.innerHTML = '';
            const makeOpt = (value, label) => {
                const o = document.createElement('option');
                o.value = String(value || '');
                o.textContent = String(label || value || '');
                return o;
            };
            duelSampleDeckSelect.appendChild(makeOpt('', 'Sample deck: (select)'));
            for (const s of SAMPLE_DECKS) {
                duelSampleDeckSelect.appendChild(makeOpt(s.id, s.name));
            }
        }

        const loadSampleDeckById = (id) => {
            const sid = String(id || '').trim();
            if (!sid) return;
            const s = SAMPLE_DECKS.find((x) => x.id === sid) || null;
            if (!s) return;
            const prevName = (deck?.name || '').trim();
            const res = importDeckListFromText(s.text);
            if (deck) deck.name = s.name;
            if (deckNameInput) deckNameInput.value = deck?.name || s.name;
            markDeckUpdated();
            saveDeck();
            renderDeck();
            if (selectedCard) renderDetail(selectedCard);
            quickDeckDrawOpening5({ isMulligan: false });
            const missing = Array.isArray(res?.missing) ? res.missing : [];
            if (missing.length) {
                setQuickDeckOut(
                    `Loaded: ${s.name}\n\n` +
                        `Note: ${missing.length} card name(s) were not found in the current dataset.\n` +
                        `Tip: choose “Dataset: Server (All cards)” for best matching.\n\n` +
                        `Missing (first 20):\n` +
                        missing.slice(0, 20).join('\n') +
                        (missing.length > 20 ? `\n…(+${missing.length - 20} more)` : '')
                );
            } else if (!prevName) {
                renderQuickDeckHand();
            }
        };

        duelQuickDeckUploadBtn?.addEventListener('click', () => {
            if (!(deckFileInput instanceof HTMLInputElement)) {
                setQuickDeckOut('Upload is unavailable (missing #deck-file input).');
                return;
            }
            duelQuickDrawAfterDeckImport = true;
            deckFileInput.click();
        });

        duelQuickDeckPasteBtn?.addEventListener('click', () => {
            const pasted = window.prompt(
                'Paste a plain-text deck list to import.\n\nSupported:\n- "3x Card Name"\n- "Card Name x3"\n- Section headers like "## Main", "## Extra", "## Side"\n\nUnknown names will be listed at the end.'
            );
            if (!pasted) return;
            const prevName = (deck?.name || '').trim();
            const res = importDeckListFromText(pasted);
            markDeckUpdated();
            saveDeck();
            renderDeck();
            if (selectedCard) renderDetail(selectedCard);
            quickDeckDrawOpening5({ isMulligan: false });

            const missing = Array.isArray(res?.missing) ? res.missing : [];
            if (missing.length) {
                setQuickDeckOut(
                    `Imported deck list.\n\n` +
                        `Note: ${missing.length} card name(s) were not found in the current dataset.\n` +
                        `Tip: choose “Dataset: Server (All cards)” for best matching.\n\n` +
                        `Missing (first 20):\n` +
                        missing.slice(0, 20).join('\n') +
                        (missing.length > 20 ? `\n…(+${missing.length - 20} more)` : '')
                );
            } else if (!prevName) {
                renderQuickDeckHand();
            } else {
                setQuickDeckOut('Imported deck list. Shuffle + Draw 5 is ready.');
            }
        });

        duelQuickDeckDraw5Btn?.addEventListener('click', () => quickDeckDrawOpening5({ isMulligan: false }));
        duelQuickDeckMulliganBtn?.addEventListener('click', () => quickDeckDrawOpening5({ isMulligan: true }));
        duelQuickDeckOpenBuilderBtn?.addEventListener('click', () => {
            setActiveView('select');
            try {
                document.getElementById('goldfish')?.setAttribute?.('open', 'open');
            } catch {
                // ignore
            }
        });

        duelSampleDeckLoadBtn?.addEventListener('click', () => {
            const id = String(duelSampleDeckSelect?.value || '').trim();
            if (!id) {
                setQuickDeckOut('Pick a sample deck first, then click “Load sample”.');
                return;
            }
            loadSampleDeckById(id);
        });

        // Keep quick output in sync if the user uses Goldfish controls elsewhere.
        window.setInterval(() => {
            if (viewDuelEl instanceof HTMLElement && viewDuelEl.hidden) return;
            renderQuickDeckHand();
        }, 1500);
    }
}

function initDemoLandingUi() {
    if (!BACKEND_AVAILABLE) {
        // Keep static-safe CTAs working; backend-only CPU duel CTAs are hidden by applyStaticModeUi().
        const upload = () => {
            duelQuickDeckUploadBtn?.click?.();
            setActiveView('duel');
        };
        const draw5 = () => {
            duelQuickDeckDraw5Btn?.click?.();
            setActiveView('duel');
        };
        const mull = () => {
            duelQuickDeckMulliganBtn?.click?.();
            setActiveView('duel');
        };
        const loadSample = () => {
            setActiveView('duel');
            const id = String(demoPendingSampleId || duelSampleDeckSelect?.value || 'classic_demo').trim();
            if (duelSampleDeckSelect instanceof HTMLSelectElement) duelSampleDeckSelect.value = id;
            duelSampleDeckLoadBtn?.click?.();
        };

        demoCtaUploadBtn?.addEventListener('click', upload);
        demoCtaSampleBtn?.addEventListener('click', loadSample);
        demoCtaDrawBtn?.addEventListener('click', draw5);
        demoCtaRealmsBtn?.addEventListener('click', () => {
            const el = document.getElementById('demo-realms');
            el?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
        });
        demoCtaLaunchSkeletonBtn?.addEventListener('click', () => {
            const el = document.getElementById('demo-launch-skeleton');
            el?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
        });

        demoTileUploadBtn?.addEventListener('click', upload);
        demoTileSampleBtn?.addEventListener('click', loadSample);
        demoTileDrawBtn?.addEventListener('click', draw5);
        demoTileMullBtn?.addEventListener('click', mull);
        demoTileTourBtn?.addEventListener('click', () => openDemoTour({ force: true }));
        return;
    }
    const upload = () => {
        duelQuickDeckUploadBtn?.click?.();
        setActiveView('duel');
    };
    const draw5 = () => {
        duelQuickDeckDraw5Btn?.click?.();
        setActiveView('duel');
    };
    const mull = () => {
        duelQuickDeckMulliganBtn?.click?.();
        setActiveView('duel');
    };
    const cpu = () => {
        setActiveView('duel');
        // Demo: prioritize in-browser CPU duel (no desktop client required).
        try {
            localStorage.setItem(DUEL_CPU_MODE_KEY, '1');
        } catch {
            // ignore
        }
        // Ensure we have a valid-looking deck to start with (demo-friendly).
        try {
            const mainCount = Object.values(deck?.sections?.main || {}).reduce((a, v) => a + (Number(v) || 0), 0);
            if (mainCount < 40) {
                const id = String(demoPendingSampleId || duelSampleDeckSelect?.value || 'classic_demo').trim() || 'classic_demo';
                if (duelSampleDeckSelect instanceof HTMLSelectElement) duelSampleDeckSelect.value = id;
                duelSampleDeckLoadBtn?.click?.();
            }
        } catch {
            // ignore
        }
        if (duelSessionAutoChk instanceof HTMLInputElement) duelSessionAutoChk.checked = true;
        duelSessionStartBtn?.scrollIntoView?.({ block: 'center' });
        duelSessionStartBtn?.focus?.();
        window.setTimeout(() => duelSessionStartBtn?.click?.(), 250);
    };
    const loadSample = () => {
        setActiveView('duel');
        const id = String(demoPendingSampleId || duelSampleDeckSelect?.value || 'classic_demo').trim();
        if (duelSampleDeckSelect instanceof HTMLSelectElement) duelSampleDeckSelect.value = id;
        duelSampleDeckLoadBtn?.click?.();
    };

    demoCtaUploadBtn?.addEventListener('click', upload);
    demoCtaSampleBtn?.addEventListener('click', loadSample);
    demoCtaDrawBtn?.addEventListener('click', draw5);
    demoCtaCpuBtn?.addEventListener('click', cpu);
    demoCtaRealmsBtn?.addEventListener('click', () => {
        const el = document.getElementById('demo-realms');
        el?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    });
    demoCtaLaunchSkeletonBtn?.addEventListener('click', () => {
        const el = document.getElementById('demo-launch-skeleton');
        el?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    });

    demoTileUploadBtn?.addEventListener('click', upload);
    demoTileSampleBtn?.addEventListener('click', loadSample);
    demoTileDrawBtn?.addEventListener('click', draw5);
    demoTileMullBtn?.addEventListener('click', mull);
    demoTileCpuBtn?.addEventListener('click', cpu);
    demoTileTourBtn?.addEventListener('click', () => openDemoTour({ force: true }));
}

function initRealmsUi() {
    const modalEl = document.getElementById('realms-modal');
    const titleEl = document.getElementById('realms-modal-title');
    const bodyEl = document.getElementById('realms-modal-body');
    const bulletsEl = document.getElementById('realms-modal-bullets');
    const badgesEl = document.getElementById('realms-modal-badges');
    const closeBtn = document.getElementById('realms-modal-close');

    if (!(modalEl instanceof HTMLElement)) return;
    if (!(titleEl instanceof HTMLElement)) return;
    if (!(bodyEl instanceof HTMLElement)) return;
    if (!(bulletsEl instanceof HTMLElement)) return;
    if (!(badgesEl instanceof HTMLElement)) return;

    const open = ({ title, badges = [], body, bullets = [] } = {}) => {
        titleEl.textContent = String(title || 'Expanding Realms');
        bodyEl.textContent = String(body || '');
        badgesEl.innerHTML = Array.isArray(badges)
            ? badges
                  .map((b) => {
                      const kind = b.kind === 'ok' ? 'pill pill-ok' : b.kind === 'warn' ? 'pill pill-warn' : 'pill';
                      return `<span class="${kind}">${escapeHtml(String(b.label || ''))}</span>`;
                  })
                  .join(' ')
            : '';
        bulletsEl.innerHTML = Array.isArray(bullets) && bullets.length
            ? `<ul style="margin:0;padding-left:18px;">${bullets
                  .map((x) => `<li style="margin:6px 0;">${escapeHtml(String(x || ''))}</li>`)
                  .join('')}</ul>`
            : '';

        modalEl.classList.add('is-on');
        modalEl.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
    };

    const close = () => {
        modalEl.classList.remove('is-on');
        modalEl.setAttribute('aria-hidden', 'true');
        const otherModalOpen =
            (imageModalEl instanceof HTMLElement && imageModalEl.classList.contains('is-on')) ||
            (demoTourModalEl instanceof HTMLElement && demoTourModalEl.classList.contains('is-on')) ||
            (demoSettingsEl instanceof HTMLElement && demoSettingsEl.classList.contains('is-on')) ||
            (demoDiagnosticsModalEl instanceof HTMLElement && demoDiagnosticsModalEl.classList.contains('is-on'));
        if (!otherModalOpen) document.body.classList.remove('modal-open');
    };

    closeBtn?.addEventListener('click', close);
    modalEl.addEventListener('click', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (t.getAttribute('data-action') === 'close') close();
    });
    document.addEventListener('keydown', (e) => {
        if (!modalEl.classList.contains('is-on')) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
        }
    });

    const realms = {
        ygo: {
            title: 'Yu-Gi-Oh — Duelist ARC',
            badges: [{ kind: 'ok', label: 'Playable Demo Available' }],
            body: 'This realm is live: build decks, test openings instantly, and duel CPUs in the browser. The goal is a presentation-grade dueling platform that grows into real-time online play.',
            bullets: ['Deck builder + dataset tooling', 'Instant deck test (shuffle + draw 5)', 'Browser CPU duel (v0) with safe input handling', 'Online PvP: coming next'],
        },
        pokemon: {
            title: 'Pokémon TCG',
            badges: [{ kind: 'warn', label: 'Coming Soon' }, { kind: 'warn', label: 'Planned Expansion' }],
            body: 'A clean, fast deck and match flow with modern UX. This is a vision placeholder — no gameplay systems are shipped yet.',
            bullets: ['Deck browsing + list-first workflows', 'Format-aware deck validation (planned)', 'A bright, readable play surface (planned)'],
        },
        onepiece: {
            title: 'One Piece Card Game',
            badges: [{ kind: 'warn', label: 'In Development' }],
            body: 'Built for readability and speed: crisp battlefield layout, clear turn pacing, and demo-friendly presentation.',
            bullets: ['Deck tools + search experiences (planned)', 'A tight, spectator-friendly UI (planned)'],
        },
        lorcana: {
            title: 'Disney Lorcana',
            badges: [{ kind: 'warn', label: 'Planned Expansion' }],
            body: 'Atmospheric browsing with art-forward presentation and thoughtful deck tools — shaped for a cozy yet competitive vibe.',
            bullets: ['Gallery-grade browsing + filtering (planned)', 'Deck tools and match prep (planned)'],
        },
        mtg: {
            title: 'Magic: The Gathering',
            badges: [{ kind: 'warn', label: 'Coming Soon' }],
            body: 'A power-user realm: strong deck workflows, format-aware utilities, and a clean play surface built for clarity.',
            bullets: ['Deck workflows + validation (planned)', 'Format toggles + tooling (planned)', 'Clean battlefield UI (planned)'],
        },
        hololive: {
            title: 'Hololive Official Card Game',
            badges: [{ kind: 'warn', label: 'In Development' }],
            body: 'Creator-forward UI with performance-first interactions and a polished, expressive vibe. Vision placeholder only for now.',
            bullets: ['Fast browsing + deck prep (planned)', 'A playful presentation layer (planned)'],
        },
        emulator: {
            title: 'Emulator Hub',
            badges: [{ kind: 'warn', label: 'Planned Expansion' }],
            body: 'A curated hub for browser gaming experiments and preservation-minded experiences. This will be introduced carefully — no unsupported promises, only demo-safe milestones.',
            bullets: ['Browser gaming experiments (planned)', 'Retro preservation energy (planned)', 'Expanding experiences — staged rollouts (planned)'],
        },
    };

    const onRealmClick = (realmId) => {
        const r = realms[String(realmId || '')];
        if (!r) return;
        if (realmId === 'ygo') {
            setActiveView('duel');
            // Ensure the view change is visible even if the user was scrolled deep in the demo landing.
            window.requestAnimationFrame(() => {
                try {
                    viewDuelEl?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
                } catch {
                    // ignore
                }
            });
            return;
        }
        // Add a small, consistent "status" row in the modal (badges already cover most of this).
        if (Array.isArray(r.bullets)) {
            r.bullets = r.bullets.slice(0, 8);
        }
        open(r);
    };

    document.addEventListener('click', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        const act = t.getAttribute('data-action');
        if (act !== 'realm') return;
        const realmId = t.getAttribute('data-realm') || '';
        e.preventDefault();
        onRealmClick(realmId);
    });
}

async function refreshDuelServiceHealth() {
    if (!(duelServiceHealthEl instanceof HTMLElement)) return;
    duelServiceHealthEl.textContent = 'Duel stack: checking…';

    const tryFetchJson = async (url) => {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            const data = await res.json().catch(() => null);
            return { ok: res.ok, status: res.status, data };
        } catch (e) {
            return { ok: false, status: 0, data: { error: String(e?.message || e) } };
        }
    };

    try {
        const browser = await tryFetchJson('/duel/session/health');
        const windbot = await tryFetchJson('/duel/service/health');

        const browserTxt = browser.ok && browser.data?.ok ? 'Browser CPU: ready' : 'Browser CPU: not configured';
        const windbotTxt =
            windbot.ok && windbot.data?.ok
                ? `WindBot CPU: online • ${String(windbot.data.edoproHttpUrl || '')}`
                : 'WindBot CPU: offline (optional)';

        duelServiceHealthEl.textContent = `${browserTxt} • ${windbotTxt}`;
        return !!(browser.ok && browser.data?.ok);
    } catch (e) {
        duelServiceHealthEl.textContent = `Duel stack: status unavailable (${String(e?.message || e)})`;
        return false;
    }
}

function setDuelSessionOut(text) {
    if (!(duelSessionOutEl instanceof HTMLElement)) return;
    duelSessionOutEl.textContent = String(text || '');
}

function initBrowserDuelSessionUi() {
    if (!(duelSessionStartBtn instanceof HTMLButtonElement)) return;
    if (duelSessionResumeBtn && !(duelSessionResumeBtn instanceof HTMLButtonElement)) return;
    if (!(duelSessionStopBtn instanceof HTMLButtonElement)) return;
    if (!(duelSessionProcessBtn instanceof HTMLButtonElement)) return;
    if (!(duelSessionSendBtn instanceof HTMLButtonElement)) return;
    if (!(duelSessionAutoChk instanceof HTMLInputElement)) return;
    if (duelSessionDefaultRawInput && !(duelSessionDefaultRawInput instanceof HTMLInputElement)) return;
    if (duelSessionSendDefaultBtn && !(duelSessionSendDefaultBtn instanceof HTMLButtonElement)) return;

    const SESSION_KEY = 'ygo_duel_session_v0';
    const SESSION_SEQ_KEY = 'ygo_duel_session_seq_v0';
    const DUEL_DECK_P1_KEY = 'ygo_duel_deck_p1_v1';
    const DUEL_DECK_P2_KEY = 'ygo_duel_deck_p2_v1';
    const CPU_PROMPT_DELAY_MS = 250;
    const STALL_WARN_MS = 4500;
    const STALL_HARD_MS = 12000;
    let sessionId = '';
let reconnectTimer = null;
let reconnectAttempts = 0;
 let es = null;
    let autoTimer = 0;
    let inputLikelyNeeded = false;
    let lastPrompt = null;
    let lastSeq = 0;
    let cpuMode = false;
    let lastCpuPromptSeq = 0;
    let cpuBusy = false;
    let waitingForHuman = false;
    let lastCoreEventAt = 0;
    let lastProgressAt = 0;
    const hud = { turn: null, phase: null, lp0: null, lp1: null, status: 'Idle' };
    let canStartWithSelectedDecks = true;

    const append = (line) => {
        const prev = String(duelSessionOutEl?.textContent || '');
        const next = prev ? `${prev}\n${line}` : line;
        setDuelSessionOut(next.slice(-40000));
    };

    const setEnabled = (on) => {
        duelSessionStopBtn.disabled = !on;
        duelSessionProcessBtn.disabled = !on;
        duelSessionSendBtn.disabled = !on;
        duelSessionAutoChk.disabled = !on;
        if (duelSessionSendDefaultBtn instanceof HTMLButtonElement) duelSessionSendDefaultBtn.disabled = !on;
    };

    const setHealth = (txt) => {
        if (!(duelSessionHealthEl instanceof HTMLElement)) return;
        duelSessionHealthEl.textContent = String(txt || '');
    };

    const setPrompt = (on) => {
        inputLikelyNeeded = !!on;
        if (duelSessionPromptEl instanceof HTMLElement) duelSessionPromptEl.hidden = !inputLikelyNeeded;
        if (!inputLikelyNeeded) {
            lastPrompt = null;
            if (duelSessionChoicesEl instanceof HTMLElement) duelSessionChoicesEl.innerHTML = '';
        }
    };

    const setHud = (patch) => {
        if (!patch || typeof patch !== 'object') return;
        if ('turn' in patch) hud.turn = patch.turn;
        if ('phase' in patch) hud.phase = patch.phase;
        if ('lp0' in patch) hud.lp0 = patch.lp0;
        if ('lp1' in patch) hud.lp1 = patch.lp1;
        if ('status' in patch) hud.status = String(patch.status || '');

        const setText = (el, v) => {
            if (!(el instanceof HTMLElement)) return;
            el.textContent = v == null || v === '' ? '—' : String(v);
        };
        setText(duelHudTurnEl, hud.turn);
        setText(duelHudPhaseEl, hud.phase);
        setText(duelHudLp0El, hud.lp0);
        setText(duelHudLp1El, hud.lp1);
        setText(duelHudStatusEl, hud.status || '—');
    };

    const bytesFromHex = (hex) => {
        const clean = String(hex || '').replace(/[^0-9a-fA-F]/g, '');
        if (clean.length < 2) return new Uint8Array();
        const out = new Uint8Array(Math.floor(clean.length / 2));
        for (let i = 0; i < out.length; i++) {
            out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16) & 0xff;
        }
        return out;
    };

    const readU8 = (buf, off) => (off < buf.length ? buf[off] : 0);
    const readI32LE = (buf, off) => {
        if (off + 4 > buf.length) return 0;
        return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >> 0;
    };

    const int32ToHexLE = (n) => {
        const v = (Number(n) >> 0) >>> 0;
        const b0 = v & 0xff;
        const b1 = (v >>> 8) & 0xff;
        const b2 = (v >>> 16) & 0xff;
        const b3 = (v >>> 24) & 0xff;
        return [b0, b1, b2, b3].map((x) => x.toString(16).padStart(2, '0')).join('');
    };

    const decodePromptFromCoreMessage = (coreMsg) => {
        const hex = String(coreMsg?.data || '').trim();
        if (!hex) return null;
        const buf = bytesFromHex(hex);
        if (!buf.length) return null;

        const type = readU8(buf, 0);
        // Minimal subset of ocgcore message identifiers we can act on.
        // (Matches EDOPro constants: 12/13/14 for prompts)
        if (type === 13 /* MSG_SELECT_YESNO */) {
            const player = readU8(buf, 1);
            const desc = readI32LE(buf, 2);
            return { kind: 'yesno', player, desc };
        }
        if (type === 14 /* MSG_SELECT_OPTION */) {
            const player = readU8(buf, 1);
            const count = readU8(buf, 2);
            const opts = [];
            let off = 3;
            for (let i = 0; i < count && off + 4 <= buf.length; i++) {
                const desc = readI32LE(buf, off);
                opts.push({ index: i, desc });
                off += 4;
            }
            return { kind: 'option', player, options: opts };
        }
        if (type === 12 /* MSG_SELECT_EFFECTYN */) {
            const player = readU8(buf, 1);
            const desc = readI32LE(buf, 2);
            return { kind: 'effectyn', player, desc };
        }
        if (type === 1 /* MSG_RETRY */) {
            return { kind: 'retry' };
        }
        return null;
    };

    const coreTypeToName = (t) => {
        const n = Number(t);
        if (!Number.isFinite(n)) return '';
        if (n === 40) return 'NEW_TURN';
        if (n === 41) return 'NEW_PHASE';
        if (n === 94) return 'LPUPDATE';
        if (n === 4) return 'START';
        if (n === 5) return 'WIN';
        if (n === 12) return 'SELECT_EFFECTYN';
        if (n === 13) return 'SELECT_YESNO';
        if (n === 14) return 'SELECT_OPTION';
        return '';
    };

    const decodeCoreStageFromPayload = (payloadHex) => {
        const buf = bytesFromHex(payloadHex);
        if (!buf.length) return null;
        const type = readU8(buf, 0);
        if (type === 40 /* MSG_NEW_TURN */) {
            const player = readU8(buf, 1);
            return { kind: 'turn', player };
        }
        if (type === 41 /* MSG_NEW_PHASE */) {
            const phase = readU16LE(buf, 1);
            return { kind: 'phase', phase };
        }
        if (type === 94 /* MSG_LPUPDATE */) {
            const player = readU8(buf, 1);
            const lp = readI32LE(buf, 2);
            return { kind: 'lp', player, lp };
        }
        return null;
    };

    function readU16LE(buf, off) {
        if (off + 2 > buf.length) return 0;
        return buf[off] | (buf[off + 1] << 8);
    }

    const phaseName = (p) => {
        const n = Number(p);
        // Common phase constants in ocgcore are small ints; mapping here is best-effort.
        // 0: draw, 1: standby, 2: main1, 3: battle, 4: main2, 5: end
        if (n === 0) return 'Draw';
        if (n === 1) return 'Standby';
        if (n === 2) return 'Main 1';
        if (n === 3) return 'Battle';
        if (n === 4) return 'Main 2';
        if (n === 5) return 'End';
        return String(n);
    };

    const renderPromptChoices = (prompt) => {
        if (!(duelSessionChoicesEl instanceof HTMLElement)) return;
        duelSessionChoicesEl.innerHTML = '';
        if (!prompt || typeof prompt !== 'object') return;

        const addBtn = (label, onClick) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-small btn-primary';
            b.textContent = label;
            b.addEventListener('click', onClick);
            duelSessionChoicesEl.appendChild(b);
        };
        const addMuted = (text) => {
            const d = document.createElement('div');
            d.className = 'muted';
            d.style.marginRight = '8px';
            d.textContent = text;
            duelSessionChoicesEl.appendChild(d);
        };

        if (prompt.kind === 'retry') {
            addMuted('Retry: previous input was invalid.');
            return;
        }

        if (prompt.kind === 'yesno' || prompt.kind === 'effectyn') {
            addMuted(`Prompt: ${prompt.kind} (desc=${String(prompt.desc ?? '')})`);
            addBtn('Yes', () => void sendResponseInt(1));
            addBtn('No', () => void sendResponseInt(0));
            return;
        }

        if (prompt.kind === 'option') {
            const options = Array.isArray(prompt.options) ? prompt.options : [];
            addMuted(`Choose option (${options.length})`);
            for (const o of options) {
                const label = `#${o.index}` + (Number.isFinite(o.desc) ? ` (desc=${o.desc})` : '');
                addBtn(label, () => void sendResponseInt(o.index));
            }
        }
    };

    const sendResponseInt = async (value) => {
        const replier = Number.parseInt(String(duelSessionReplierInput?.value || '0'), 10);
        await sendResponseIntFor({ replier: Number.isFinite(replier) ? replier : 0, value });
    };

    const sendResponseIntFor = async ({ replier, value }) => {
        if (!sessionId) return;
        const rawHex = int32ToHexLE(value);
        try {
            await fetch('/duel/session/input', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, replier: Number.isFinite(replier) ? replier : 0, rawHex }),
            });
            setPrompt(false);
            waitingForHuman = false;
            if (cpuMode && duelSessionAutoChk instanceof HTMLInputElement) {
                duelSessionAutoChk.checked = true;
                if (!inputLikelyNeeded) startAuto();
            }
        } catch {
            append('[send failed]');
        }
    };

    const loadCpuModePref = () => {
        try {
            return String(localStorage.getItem(DUEL_CPU_MODE_KEY) || '').trim() === '1';
        } catch {
            return false;
        }
    };

    const setCpuModePref = (on) => {
        try {
            localStorage.setItem(DUEL_CPU_MODE_KEY, on ? '1' : '0');
        } catch {
            // ignore
        }
    };

    const saveSessionId = (id) => {
        try {
            if (!id) {
                localStorage.removeItem(SESSION_KEY);
                localStorage.removeItem(SESSION_SEQ_KEY);
            } else {
                localStorage.setItem(SESSION_KEY, id);
                localStorage.setItem(SESSION_SEQ_KEY, String(lastSeq || 0));
            }
        } catch {
            // ignore
        }
        if (duelSessionResumeBtn instanceof HTMLButtonElement) {
            duelSessionResumeBtn.hidden = !id;
        }
    };

    const loadDeckPref = (key, fallback) => {
        try {
            const v = String(localStorage.getItem(key) || '').trim();
            return v || fallback || '';
        } catch {
            return fallback || '';
        }
    };

    const saveDeckPref = (key, value) => {
        try {
            localStorage.setItem(key, String(value || '').trim());
        } catch {
            // ignore
        }
    };

    const getDeckObjById = (id) => {
        const did = String(id || '').trim();
        if (!did) return null;
        const obj = deckStore?.decks?.[did];
        return obj && typeof obj === 'object' ? obj : null;
    };

    const deckCounts = (deckObj) => {
        const sec = deckObj?.sections || {};
        const sum = (s) => Object.values(sec?.[s] || {}).reduce((a, v) => a + (Number(v) || 0), 0);
        const main = sum('main');
        const extra = sum('extra');
        const side = sum('side');
        return { main, extra, side, total: main + extra + side };
    };

    const validateDeckForDuel = (deckObj) => {
        if (!deckObj) return { ok: false, reason: 'No deck selected.' };
        const c = deckCounts(deckObj);
        if (c.main < 40) return { ok: false, reason: `Main deck too small (${c.main}). Need at least 40.` };
        if (c.main > 60) return { ok: false, reason: `Main deck too large (${c.main}). Max 60.` };
        if (c.extra > 15) return { ok: false, reason: `Extra deck too large (${c.extra}). Max 15.` };
        return { ok: true, reason: `Main ${c.main} • Extra ${c.extra} • Side ${c.side}` };
    };

    const buildDeckSectionIdListFrom = (deckObj, section) => {
        const obj = deckObj?.sections?.[section] || {};
        const ids = [];
        for (const [id, qty] of Object.entries(obj)) {
            const n = Number(qty) || 0;
            for (let i = 0; i < n; i++) ids.push(Number(id));
        }
        return ids.filter((n) => Number.isFinite(n) && n > 0).map((n) => Math.floor(n));
    };

    const syncDeckSelectors = () => {
        if (!(duelSessionDeckP1El instanceof HTMLSelectElement)) return;
        if (!(duelSessionDeckP2El instanceof HTMLSelectElement)) return;

        const makeOpt = (value, label) => {
            const o = document.createElement('option');
            o.value = String(value || '');
            o.textContent = String(label || value || '');
            return o;
        };

        const p1Pref = loadDeckPref(DUEL_DECK_P1_KEY, activeDeckId);
        const p2Pref = loadDeckPref(DUEL_DECK_P2_KEY, '');

        const order = Array.isArray(deckStore?.order) ? deckStore.order.slice() : [];
        const decks = deckStore?.decks || {};

        duelSessionDeckP1El.innerHTML = '';
        for (const id of order) {
            const d = decks?.[id];
            const name = (d && typeof d === 'object' ? String(d.name || '') : '').trim() || id;
            duelSessionDeckP1El.appendChild(makeOpt(id, name));
        }

        duelSessionDeckP2El.innerHTML = '';
        duelSessionDeckP2El.appendChild(makeOpt('', 'CPU deck: Mirror your deck'));
        for (const id of order) {
            const d = decks?.[id];
            const name = (d && typeof d === 'object' ? String(d.name || '') : '').trim() || id;
            duelSessionDeckP2El.appendChild(makeOpt(id, name));
        }

        if (p1Pref && order.includes(p1Pref)) duelSessionDeckP1El.value = p1Pref;
        else if (order[0]) duelSessionDeckP1El.value = order[0];

        if (p2Pref && order.includes(p2Pref)) duelSessionDeckP2El.value = p2Pref;
        else duelSessionDeckP2El.value = '';

        const p1Deck = getDeckObjById(duelSessionDeckP1El.value);
        const p2Deck = duelSessionDeckP2El.value ? getDeckObjById(duelSessionDeckP2El.value) : p1Deck;
        const v1 = validateDeckForDuel(p1Deck);
        const v2 = validateDeckForDuel(p2Deck);
        const ok = !!v1.ok && !!v2.ok;
        canStartWithSelectedDecks = ok;
        if (duelSessionDeckStatusEl instanceof HTMLElement) {
            duelSessionDeckStatusEl.textContent = ok ? `Deck OK • ${v1.reason}` : `Deck invalid • ${!v1.ok ? v1.reason : v2.reason}`;
        }
        duelSessionStartBtn.disabled = duelSessionStartBtn.disabled || !ok;
        duelSessionStartBtn.title = ok ? 'Start browser duel (uses selected decks)' : 'Fix deck size to start duels.';
    };

    const loadSavedSessionId = () => {
        try {
            return String(localStorage.getItem(SESSION_KEY) || '').trim();
        } catch {
            return '';
        }
    };

    const loadSavedSessionSeq = () => {
        try {
            const n = Number(String(localStorage.getItem(SESSION_SEQ_KEY) || '').trim() || 0);
            return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
        } catch {
            return 0;
        }
    };

    const saveSeq = () => {
        try {
            if (!sessionId) return;
            localStorage.setItem(SESSION_SEQ_KEY, String(lastSeq || 0));
        } catch {
            // ignore
        }
    };

    const closeStream = () => {
        if (es) {
            try {
                es.close();
            } catch {
                // ignore
            }
        }
        es = null;
    };

    const refreshHealth = async () => {
        try {
            const res = await fetch('/duel/session/health');
            const raw = await res.text();
            const data = raw ? safeJsonParse(raw) : null;
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            if (data?.ok) {
                setHealth(`Core: ready • ${String(data.coreIntegrator || '')}`);
            } else {
                setHealth(`Core: not configured • ${String(data?.hint || '')}`);
            }
        } catch {
            setHealth('Core: status unavailable');
        }
    };

    const stopAuto = () => {
        if (autoTimer) window.clearInterval(autoTimer);
        autoTimer = 0;
    };

    const startAuto = () => {
        stopAuto();
        autoTimer = window.setInterval(async () => {
            if (!sessionId) return;
            if (waitingForHuman) return;
            if (cpuBusy) return;

            const now = Date.now();
            const last = Math.max(Number(lastCoreEventAt || 0), Number(lastProgressAt || 0));
            if (last > 0 && now - last > STALL_HARD_MS) {
                stopAuto();
                append('[stalled] No core output for a while. Try: Stop → Duel a CPU (browser) again.');
                setHud({ status: 'Stalled (no core output)' });
                return;
            }
            if (last > 0 && now - last > STALL_WARN_MS) {
                setHud({ status: 'Processing… (slow)' });
            }

            try {
                await fetch('/duel/session/cmd', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, command: 'PROCESS', data: {} }),
                });
            } catch {
                // ignore
            }
        }, 250);
    };

    duelSessionAutoChk.addEventListener('change', () => {
        if (duelSessionAutoChk.checked) startAuto();
        else stopAuto();
    });

    void refreshHealth();
    window.setInterval(() => void refreshHealth(), 8000);

    setDuelSessionOut('Not running. Start a browser duel to see core messages.');
    setEnabled(false);
    setPrompt(false);
    const savedAtBoot = loadSavedSessionId();
    lastSeq = loadSavedSessionSeq();
    saveSessionId(savedAtBoot);
    syncDeckSelectors();
    duelSessionDeckP1El?.addEventListener('change', () => {
        if (duelSessionDeckP1El instanceof HTMLSelectElement) {
            saveDeckPref(DUEL_DECK_P1_KEY, duelSessionDeckP1El.value);
            // If CPU is mirroring, keep it mirrored.
            if (duelSessionDeckP2El instanceof HTMLSelectElement && !duelSessionDeckP2El.value) {
                // nothing
            }
        }
        syncDeckSelectors();
    });
    duelSessionDeckP2El?.addEventListener('change', () => {
        if (duelSessionDeckP2El instanceof HTMLSelectElement) {
            saveDeckPref(DUEL_DECK_P2_KEY, duelSessionDeckP2El.value);
        }
        syncDeckSelectors();
    });

    const connectToSession = (id) => {
        sessionId = String(id || '').trim();
        if (!sessionId) return;
        cpuMode = loadCpuModePref();
        lastCoreEventAt = Date.now();
        lastProgressAt = Date.now();
        setEnabled(true);
        setPrompt(false);
        setHud({ status: cpuMode ? 'CPU duel: starting…' : 'Streaming…' });
        setDuelSessionOut(`Browser duel connected: ${sessionId}\nStreaming…`);
        closeStream();
        const since = lastSeq > 0 ? `&since=${encodeURIComponent(String(lastSeq))}` : '';
        es = new EventSource(`/duel/session/stream?sessionId=${encodeURIComponent(sessionId)}${since}`);
        es.onmessage = (ev) => {
          reconnectAttempts = 0;
            const msg = safeJsonParse(ev.data);
            if (!msg) return;
            if (Number.isFinite(Number(msg.seq))) {
                lastSeq = Math.max(lastSeq, Math.floor(Number(msg.seq)));
                saveSeq();
            }
            if (msg.type === 'core') {
                const core = msg.msg;
                lastCoreEventAt = Date.now();
                const receiver = core && typeof core === 'object' && core.type === 'MESSAGE' ? Number(core.receiver) : NaN;
                const isMessage = core && typeof core === 'object' && core.type === 'MESSAGE';
                const decoded = isMessage ? decodePromptFromCoreMessage(core) : null;

                // Receiver 0: human player prompts.
                if (isMessage && receiver === 0) {
                    lastPrompt = decoded;
                    waitingForHuman = true;
                    setPrompt(true);
                    renderPromptChoices(decoded);
                    setHud({ status: decoded ? `Your input: ${decoded.kind}` : 'Your input needed (unknown prompt)' });
                    // Don’t keep ticking while input is required.
                    stopAuto();
                }

                // Receiver 1: CPU prompts. For demo, auto-answer a safe default so the duel doesn’t stall.
                if (cpuMode && isMessage && receiver === 1 && decoded && Number(msg.seq || 0) > lastCpuPromptSeq) {
                    lastCpuPromptSeq = Number(msg.seq || 0);
                    cpuBusy = true;
                    setHud({ status: `CPU input: ${decoded.kind} (auto)` });
                    // Best-effort safe defaults:
                    // - yes/no prompts: default "No" (0)
                    // - options: pick option 0
                    // - retry: send 0
                    const value = decoded.kind === 'yesno' || decoded.kind === 'effectyn' ? 0 : decoded.kind === 'option' ? 0 : 0;
                    window.setTimeout(() => {
                        void sendResponseIntFor({ replier: 1, value }).finally(() => {
                            cpuBusy = false;
                            if (cpuMode && duelSessionAutoChk instanceof HTMLInputElement) {
                                duelSessionAutoChk.checked = true;
                                if (!waitingForHuman) startAuto();
                                setHud({ status: 'CPU duel: running' });
                            }
                        });
                    }, CPU_PROMPT_DELAY_MS);
                }

                if (core && typeof core === 'object' && core.type === 'MESSAGE') {
                    const stage = decodeCoreStageFromPayload(String(core.data || ''));
                    if (stage && stage.kind === 'turn') {
                        setHud({ turn: `P${stage.player}` });
                        if (cpuMode && !cpuBusy && !waitingForHuman) setHud({ status: stage.player === 0 ? 'Your turn' : 'CPU turn' });
                        lastProgressAt = Date.now();
                    } else if (stage && stage.kind === 'phase') {
                        setHud({ phase: phaseName(stage.phase) });
                        lastProgressAt = Date.now();
                    } else if (stage && stage.kind === 'lp') {
                        if (stage.player === 0) setHud({ lp0: stage.lp });
                        else if (stage.player === 1) setHud({ lp1: stage.lp });
                        lastProgressAt = Date.now();
                    }
                }
                // Render a more readable log line.
                if (core && typeof core === 'object' && core.type === 'MESSAGE') {
                    const t = coreTypeToName(core.header);
                    const rcv = Number.isFinite(Number(core.receiver)) ? ` r=${core.receiver}` : '';
                    append(`[${t || core.header}]${rcv} ${String(core.data || '').slice(0, 120)}${String(core.data || '').length > 120 ? '…' : ''}`);
                } else {
                    append(JSON.stringify(core));
                }
            } else {
                append(JSON.stringify(msg));
                if (msg.type === 'exit') {
                    setPrompt(false);
                    setHud({ status: 'Ended' });
                    setEnabled(false);
                    saveSessionId('');
                    sessionId = '';
                    stopAuto();
                    closeStream();
                }
            }
        };
        es.onerror = () => {
    closeStream();

    if (reconnectTimer) {
        return; // already scheduled
    }

    reconnectAttempts += 1;
if (reconnectAttempts >= 6) {
    append('[stream error] reconnect stopped. Session may have ended.');
    setHud({ status: 'Disconnected' });
    setEnabled(false);
    stopAuto();
    saveSessionId('');
    sessionId = '';
    return;
}
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
    append(`[stream error] reconnecting in ${Math.floor(delay / 1000)}s…`);

    reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        if (sessionId) {
            connectToSession(sessionId);
        }
    }, delay);
};
        if (duelSessionAutoChk.checked) startAuto();
    };

    if (duelSessionResumeBtn instanceof HTMLButtonElement) {
        duelSessionResumeBtn.addEventListener('click', () => {
            const saved = loadSavedSessionId();
            if (!saved) return;
            connectToSession(saved);
        });
    }

    duelSessionStartBtn.addEventListener('click', async () => {
        duelSessionStartBtn.disabled = true;
        setDuelSessionOut('Starting browser duel…');
        await refreshHealth();

        try {
            // Starting via this button implies "CPU duel (browser)" for the demo.
            cpuMode = true;
            setCpuModePref(true);
            syncDeckSelectors();
            if (!canStartWithSelectedDecks) throw new Error('deck_invalid');
            const p1Id = duelSessionDeckP1El instanceof HTMLSelectElement ? duelSessionDeckP1El.value : activeDeckId;
            const p2Id = duelSessionDeckP2El instanceof HTMLSelectElement ? duelSessionDeckP2El.value : '';
            const p1Deck = getDeckObjById(p1Id);
            const p2Deck = p2Id ? getDeckObjById(p2Id) : p1Deck;
            const p1 = { mainDeck: buildDeckSectionIdListFrom(p1Deck, 'main'), extraDeck: buildDeckSectionIdListFrom(p1Deck, 'extra') };
            const p2 = { mainDeck: buildDeckSectionIdListFrom(p2Deck, 'main'), extraDeck: buildDeckSectionIdListFrom(p2Deck, 'extra') };
            const res = await fetch('/duel/session/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ p1, p2 }),
            });
            const raw = await res.text();
            const data = raw ? safeJsonParse(raw) : null;
            if (!res.ok) throw new Error(String(data?.error || `HTTP ${res.status}`) + (data?.hint ? `\n${data.hint}` : ''));
            const newId = String(data?.sessionId || '');
            if (!newId) throw new Error('No sessionId returned');
            saveSessionId(newId);
            connectToSession(newId);
            if (duelSessionAutoChk instanceof HTMLInputElement) duelSessionAutoChk.checked = true;
        } catch (e) {
            const msg = String(e?.message || e);
            if (msg.includes('unauthorized') || msg.includes('forbidden')) {
                setDuelSessionOut('Failed: sign in first (Duelist ARC requires login for duels in production).');
                void refreshDuelLoginRequiredBanner();
            } else if (msg.includes('deck_invalid')) {
                setDuelSessionOut('Failed: deck invalid. Fix main (40–60) and extra (<=15), then try again.');
            } else if (msg.includes('not_configured')) {
                setDuelSessionOut('Failed: core not configured. Set EDOPRO_SERVER_TS_ROOT and ensure CoreIntegrator exists.');
            } else if (msg.includes('rate_limited')) {
                setDuelSessionOut('Failed: rate limited. Slow down and try again.');
            } else {
                setDuelSessionOut(`Failed: ${msg}`);
            }
            sessionId = '';
            setEnabled(false);
            setPrompt(false);
            setHud({ status: 'Failed' });
            stopAuto();
            closeStream();
        } finally {
            duelSessionStartBtn.disabled = false;
        }
    });

    duelSessionStopBtn.addEventListener('click', async () => {
        if (!sessionId) return;
        duelSessionStopBtn.disabled = true;
        try {
            await fetch('/duel/session/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId }),
            });
            setDuelSessionOut('Stopped.');
        } catch {
            setDuelSessionOut('Stop failed.');
        } finally {
            sessionId = '';
            setEnabled(false);
            setPrompt(false);
            setHud({ status: 'Stopped' });
            stopAuto();
            duelSessionAutoChk.checked = false;
            closeStream();
            saveSessionId('');
        }
    });

    duelSessionProcessBtn.addEventListener('click', async () => {
        if (!sessionId) return;
        try {
            await fetch('/duel/session/cmd', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, command: 'PROCESS', data: {} }),
            });
        } catch {
            append('[process failed]');
        }
    });

    duelSessionSendBtn.addEventListener('click', async () => {
        if (!sessionId) return;
        const rawHex = String(duelSessionRawInput?.value || '').trim();
        const replier = Number.parseInt(String(duelSessionReplierInput?.value || '0'), 10);
        if (!rawHex) return;
        try {
            await fetch('/duel/session/input', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, replier: Number.isFinite(replier) ? replier : 0, rawHex }),
            });
            // Any valid send likely satisfies the waiting prompt.
            setPrompt(false);
            waitingForHuman = false;
            if (cpuMode && duelSessionAutoChk instanceof HTMLInputElement) {
                duelSessionAutoChk.checked = true;
                startAuto();
            }
        } catch {
            append('[send failed]');
        }
    });

    if (duelSessionSendDefaultBtn instanceof HTMLButtonElement) {
        duelSessionSendDefaultBtn.addEventListener('click', async () => {
            if (!sessionId) return;
            const rawHex = String(duelSessionDefaultRawInput?.value || '').trim();
            const replier = Number.parseInt(String(duelSessionReplierInput?.value || '0'), 10);
            if (!rawHex) return;
            try {
                await fetch('/duel/session/input', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, replier: Number.isFinite(replier) ? replier : 0, rawHex }),
                });
                // Clear the prompt banner after sending *something*.
                setPrompt(false);
                waitingForHuman = false;
                if (cpuMode && duelSessionAutoChk instanceof HTMLInputElement) {
                    duelSessionAutoChk.checked = true;
                    startAuto();
                }
            } catch {
                append('[send failed]');
            }
        });
    }
}

function buildDeckSectionIdList(section) {
    const obj = deck?.sections?.[section] || {};
    const ids = [];
    for (const [id, qty] of Object.entries(obj)) {
        const n = Number(qty) || 0;
        for (let i = 0; i < n; i++) ids.push(Number(id));
    }
    return ids.filter((n) => Number.isFinite(n) && n > 0).map((n) => Math.floor(n));
}

function initLocalDuelUi() {
    if (!(duelLocalStartBtn instanceof HTMLButtonElement)) return;
    if (!(duelLocalStopBtn instanceof HTMLButtonElement)) return;
    if (!(duelLocalProcessBtn instanceof HTMLButtonElement)) return;
    if (!(duelLocalSendBtn instanceof HTMLButtonElement)) return;
    if (!(duelLocalAutoChk instanceof HTMLInputElement)) return;

    let duelId = '';
    let es = null;
    let autoTimer = 0;

    const setEnabled = (on) => {
        duelLocalStopBtn.disabled = !on;
        duelLocalProcessBtn.disabled = !on;
        duelLocalSendBtn.disabled = !on;
        duelLocalAutoChk.disabled = !on;
    };

const render = () => {
    if (apiUser && apiUser.id) {
        setStatus(`Signed in as: ${String(apiUser.handle || `#${apiUser.id}`)}`);
        duelAuthLogoutBtn.hidden = false;
        duelAuthLoginBtn.hidden = true;
        duelAuthRegisterBtn.hidden = true;
        duelAuthPassInput.value = '';
    } else {
        setStatus('Guest mode: not signed in. Register or login to sync decks later.');
        duelAuthLogoutBtn.hidden = true;
        duelAuthLoginBtn.hidden = false;
        duelAuthRegisterBtn.hidden = false;
    }
};

// 👇 PASTE RIGHT HERE
(async () => {
    try {
        const user = await apiGetMe();
        apiUser = user;
        deckSyncMode = apiUser ? 'api' : 'guest';

        if (apiUser && apiUser.id) {
            await replaceDeckStoreFromApi();
        } else {
            switchToGuestDeckStore();
        }

        render();
    } catch {
        render();
    }
})();
    const append = (line) => {
        const prev = String(duelLocalOutEl?.textContent || '');
        const next = prev ? `${prev}\n${line}` : line;
        setDuelLocalOut(next.slice(-20000));
    };

    const setHealth = (txt) => {
        if (!(duelLocalHealthEl instanceof HTMLElement)) return;
        duelLocalHealthEl.textContent = String(txt || '');
    };

    const refreshHealth = async () => {
        try {
            const res = await fetch('/duel/local/health');
            const raw = await res.text();
            const data = raw ? safeJsonParse(raw) : null;
            if (res.status === 404 || res.status === 403) {
                if (duelLocalBlockEl instanceof HTMLElement) duelLocalBlockEl.hidden = true;
                return;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            if (data?.ok) {
                setHealth(`Core: ready • ${String(data.coreIntegrator || '')}`);
            } else {
                setHealth(`Core: not configured • ${String(data?.hint || '')}`);
            }
        } catch {
            setHealth('Core: status unavailable');
        }
    };

    const stopAuto = () => {
        if (autoTimer) window.clearInterval(autoTimer);
        autoTimer = 0;
    };

    const startAuto = () => {
        stopAuto();
        autoTimer = window.setInterval(async () => {
            if (!duelId) return;
            try {
                await fetch('/duel/local/cmd', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ duelId, command: 'PROCESS', data: {} }),
                });
            } catch {
                // ignore
            }
        }, 250);
    };

    duelLocalAutoChk.addEventListener('change', () => {
        if (duelLocalAutoChk.checked) startAuto();
        else stopAuto();
    });

    refreshHealth();

    setDuelLocalOut('Not running. Start a local duel to see core messages.');
    setEnabled(false);

    duelLocalStartBtn.addEventListener('click', async () => {
        duelLocalStartBtn.disabled = true;
        setDuelLocalOut('Starting local duel…');
        await refreshHealth();

        try {
            const p1 = { mainDeck: buildDeckSectionIdList('main'), extraDeck: buildDeckSectionIdList('extra') };
            const p2 = { mainDeck: buildDeckSectionIdList('main'), extraDeck: buildDeckSectionIdList('extra') };
            const res = await fetch('/duel/local/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ p1, p2 }),
            });
            const raw = await res.text();
            const data = raw ? safeJsonParse(raw) : null;
            if (!res.ok) throw new Error(String(data?.error || `HTTP ${res.status}`) + (data?.hint ? `\n${data.hint}` : ''));
            duelId = String(data?.duelId || '');
            if (!duelId) throw new Error('No duelId returned');

            setEnabled(true);
            setDuelLocalOut(`Local duel started: ${duelId}\nStreaming…`);

            if (es) {
                try {
                    es.close();
                } catch {
                    // ignore
                }
            }
            es = new EventSource(`/duel/local/stream?duelId=${encodeURIComponent(duelId)}`);
            es.onmessage = (ev) => {
                const msg = safeJsonParse(ev.data);
                if (!msg) return;
                if (msg.type === 'core') append(JSON.stringify(msg.msg));
                else append(JSON.stringify(msg));
            };
            es.onerror = () => {
                append('[stream error]');
            };

            if (duelLocalAutoChk.checked) startAuto();
        } catch (e) {
            setDuelLocalOut(`Failed: ${String(e?.message || e)}`);
            duelId = '';
            setEnabled(false);
            stopAuto();
        } finally {
            duelLocalStartBtn.disabled = false;
        }
    });

    duelLocalStopBtn.addEventListener('click', async () => {
        if (!duelId) return;
        duelLocalStopBtn.disabled = true;
        try {
            await fetch('/duel/local/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ duelId }),
            });
            setDuelLocalOut('Stopped.');
        } catch {
            setDuelLocalOut('Stop failed.');
        } finally {
            duelId = '';
            setEnabled(false);
            stopAuto();
            duelLocalAutoChk.checked = false;
            if (es) {
                try {
                    es.close();
                } catch {
                    // ignore
                }
            }
            es = null;
        }
    });

    duelLocalProcessBtn.addEventListener('click', async () => {
        if (!duelId) return;
        try {
            await fetch('/duel/local/cmd', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ duelId, command: 'PROCESS', data: {} }),
            });
        } catch {
            append('[process failed]');
        }
    });

    duelLocalSendBtn.addEventListener('click', async () => {
        if (!duelId) return;
        const rawHex = String(duelLocalRawInput?.value || '').trim();
        const replier = Number.parseInt(String(duelLocalReplierInput?.value || '0'), 10);
        if (!rawHex) return;
        const hexPairs = rawHex.replace(/[^0-9a-fA-F|]/g, '').toLowerCase();
        // CoreIntegrator expects hex bytes separated by | (see its main.cpp parser).
        const msg = hexPairs.includes('|') ? hexPairs : hexPairs.match(/.{1,2}/g)?.join('|') || '';
        try {
            await fetch('/duel/local/cmd', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ duelId, command: 'RESPONSE', data: { replier: Number.isFinite(replier) ? replier : 0, message: msg } }),
            });
        } catch {
            append('[send failed]');
        }
    });
}

async function initApp() {
    await detectBackend();
    applyStaticModeUi();
    initUI();
    await initDatasets();
    if (BACKEND_AVAILABLE) {
        await bootstrapAuthAndDecks();
    } else {
        apiUser = null;
        deckSyncMode = 'guest';
        removeServerDatasetOption();
    }

    // Load preferred dataset.
    const preferred = localStorage.getItem(DATASET_PREF_KEY) || '';
    const chosen = preferred || datasetSelect?.value || 'cards/sample-cards.json';
    try {
        if (chosen.startsWith('__saved__:')) {
            const id = chosen.slice('__saved__:'.length);
            if (datasetSelect) datasetSelect.value = chosen;
            loadCardsFromSavedDataset(id);
        } else if (chosen === '__custom__') {
            loadCardsFromCustomStorage();
        } else {
            if (datasetSelect) datasetSelect.value = chosen;
            await loadCardsFromUrl(chosen, { label: datasetSelect?.options[datasetSelect.selectedIndex]?.textContent });
        }
    } catch (err) {
        console.error('Error loading cards:', err);
        showError('Failed to load dataset');
        setDatasetStatus('Dataset: error');
    }
    updateDatasetToolsState();
    selectFromHash();
    renderGoldfish();
    if (BACKEND_AVAILABLE) {
        initPlatformPrototype();
    }
    initDuelAuthUi();
    initDemoLandingUi();
    initRealmsUi();
    applyDemoQuery();
    if (BACKEND_AVAILABLE) {
        void renderDemoStatus();
        window.setInterval(() => void renderDemoStatus(), 8000);
        void renderCpuReadiness();
        window.setInterval(() => void renderCpuReadiness(), 10000);
    }
}

initApp();

function demoLoadSampleDeckById(id) {
    const sid = String(id || '').trim();
    if (!sid) return { ok: false, error: 'missing_sample' };
    const s = SAMPLE_DECKS.find((x) => x.id === sid) || null;
    if (!s) return { ok: false, error: 'unknown_sample' };
    const res = importDeckListFromText(s.text);
    if (deck) deck.name = s.name;
    if (deckNameInput) deckNameInput.value = deck?.name || s.name;
    markDeckUpdated();
    saveDeck();
    renderDeck();
    renderGoldfish();
    return { ok: true, missing: Array.isArray(res?.missing) ? res.missing : [] };
}

function demoDraw5({ isMulligan } = {}) {
    const mainTotal = buildMainDeckIdList().length;
    if (mainTotal <= 0) return;
    goldfish.openingHandSize = 5;
    goldfishNewHand({ isMulligan: !!isMulligan });
    renderGoldfish();
}

function applyDemoQuery() {
    let params;
    try {
        params = new URLSearchParams(window.location.search || '');
    } catch {
        return;
    }

    const demo = String(params.get('demo') || '').trim();
    const view = String(params.get('view') || '').trim();
    const tour = String(params.get('tour') || '').trim();
    const sample = String(params.get('sample') || '').trim();
    const draw = String(params.get('draw') || '').trim();

    // Keep demo build label consistent even if the user uses URL params without toggling demo mode.
    if (demoBuildInlineEl instanceof HTMLElement) {
        demoBuildInlineEl.textContent = DEMO_BUILD_LABEL;
    }
    if (demoBuildFooterEl instanceof HTMLElement) {
        demoBuildFooterEl.textContent = DEMO_BUILD_LABEL;
    }

    if (demo === '1' || demo.toLowerCase() === 'true') {
        setDemoModePref(true);
        applyDemoMode(true);
    }

    if (view === 'demo' || view === 'duel' || view === 'select') setActiveView(view);

    if (sample) {
        demoPendingSampleId = sample;
        if (duelSampleDeckSelect instanceof HTMLSelectElement) duelSampleDeckSelect.value = sample;
        const res = demoLoadSampleDeckById(sample);
        if (res.ok) setActiveView('duel');
    }

    if (draw === '5') {
        setActiveView('duel');
        demoDraw5({ isMulligan: false });
    }

    if (tour === '1' || tour.toLowerCase() === 'true') {
        openDemoTour({ force: true });
        return;
    }

    // First-run onboarding: if demo mode is enabled, show the tour once.
    if (getDemoModePref()) openDemoTour({ force: false });
}

async function renderCpuReadiness() {
    if (!(cpuReadinessEl instanceof HTMLElement)) return;

    const rows = [];
    const pill = (label, ok) =>
        `<span class="pill ${ok ? 'pill-ok' : 'pill-warn'}">${escapeHtml(label)}</span>`;

    let edoproOk = false;
    let windbotOk = false;
    let banlistCount = 0;
    let banlistHint = '';

    try {
        const res = await fetch('/duel/service/health', { cache: 'no-store' });
        const data = await res.json().catch(() => null);
        edoproOk = !!(res.ok && data?.ok);
        rows.push(pill(edoproOk ? 'EDOPro HTTP: online' : 'EDOPro HTTP: offline', edoproOk));
    } catch {
        rows.push(pill('EDOPro HTTP: offline', false));
    }

    try {
        const res = await fetch('/cpu-duel/edopro/health', { cache: 'no-store' });
        const data = await res.json().catch(() => null);
        windbotOk = !!(res.ok && data?.ok);
        rows.push(pill(windbotOk ? 'WindBot: configured' : 'WindBot: missing', windbotOk));
    } catch {
        rows.push(pill('WindBot: missing', false));
    }

    try {
        const res = await fetch('/duel/service/banlists', { cache: 'no-store' });
        const data = await res.json().catch(() => null);
        const lists = Array.isArray(data?.banlists) ? data.banlists : [];
        banlistCount = lists.length;
        banlistHint = String(data?.hint || '').trim();
        rows.push(pill(`Banlists: ${banlistCount}`, banlistCount > 0));
    } catch {
        rows.push(pill('Banlists: 0', false));
    }

    const okAll = edoproOk && windbotOk && banlistCount > 0;
    const headline = okAll ? 'Ready to host CPU duels.' : 'Not fully configured for CPU duels yet.';

    const fixes = [];
    if (!edoproOk) fixes.push('Start EDOpro-server-ts and set `EDOPRO_HTTP_URL` on this server.');
    if (!windbotOk) fixes.push('Set `WINDBOT_EXE` (and optionally `WINDBOT_CWD`) on this server.');
    if (banlistCount <= 0) fixes.push('Set `EDOPRO_SERVER_TS_ROOT` (or `EDOPRO_RESOURCES_ROOT`) so banlists can be discovered.');
    if (banlistHint) fixes.push(String(banlistHint));

    cpuReadinessEl.innerHTML =
        `<div class="row">${rows.join(' ')}</div>` +
        `<span class="muted">${escapeHtml(headline)}</span>` +
        (fixes.length
            ? `<span class="muted">Fixes: ${escapeHtml(fixes.join(' '))}</span>`
            : `<span class="muted">Tip: open Duel → pick a banlist → Start CPU duel.</span>`);
}

function initDuelAuthUi() {
    if (!BACKEND_AVAILABLE) return;
    if (!(duelAuthStatusEl instanceof HTMLElement)) return;
    if (!(duelAuthHandleInput instanceof HTMLInputElement)) return;
    if (!(duelAuthPassInput instanceof HTMLInputElement)) return;
    if (!(duelAuthLoginBtn instanceof HTMLButtonElement)) return;
    if (!(duelAuthRegisterBtn instanceof HTMLButtonElement)) return;
    if (!(duelAuthLogoutBtn instanceof HTMLButtonElement)) return;

    const LAST_HANDLE_KEY = 'ygo_auth_last_handle_v1';
    try {
        const last = String(localStorage.getItem(LAST_HANDLE_KEY) || '').trim();
        if (last && !duelAuthHandleInput.value) duelAuthHandleInput.value = last;
    } catch {
        // ignore
    }

    const setBusy = (busy) => {
        duelAuthLoginBtn.disabled = !!busy;
        duelAuthRegisterBtn.disabled = !!busy;
        duelAuthLogoutBtn.disabled = !!busy;
        duelAuthHandleInput.disabled = !!busy;
        duelAuthPassInput.disabled = !!busy;
        if (duelAuthEmailRegisterInput instanceof HTMLInputElement) duelAuthEmailRegisterInput.disabled = !!busy;
        if (duelAuthEmailSaveBtn instanceof HTMLButtonElement) duelAuthEmailSaveBtn.disabled = !!busy;
        if (duelAuthEmailInput instanceof HTMLInputElement) duelAuthEmailInput.disabled = !!busy;
    };

    const setStatus = (text) => {
        duelAuthStatusEl.textContent = String(text || '');
    };

    const render = () => {
        if (apiUser && apiUser.id) {
            setStatus(`Signed in as: ${String(apiUser.handle || `#${apiUser.id}`)}`);
            duelAuthLogoutBtn.hidden = false;
            duelAuthLoginBtn.hidden = true;
            duelAuthRegisterBtn.hidden = true;
            if (duelAuthEmailRegisterInput instanceof HTMLInputElement) duelAuthEmailRegisterInput.hidden = true;
            duelAuthPassInput.value = '';
            if (duelAuthEmailBlockEl instanceof HTMLElement) duelAuthEmailBlockEl.hidden = false;
        } else {
            setStatus('Guest mode: not signed in. Register or login to sync decks later.');
            duelAuthLogoutBtn.hidden = true;
            duelAuthLoginBtn.hidden = false;
            duelAuthRegisterBtn.hidden = false;
            // Keep the email field collapsed by default to reduce confusion during login.
            // It will be revealed when the user clicks Register.
            if (duelAuthEmailRegisterInput instanceof HTMLInputElement) duelAuthEmailRegisterInput.hidden = true;
            if (duelAuthEmailBlockEl instanceof HTMLElement) duelAuthEmailBlockEl.hidden = true;
        }
    };

    const refreshEmailField = async () => {
        if (!(duelAuthEmailInput instanceof HTMLInputElement)) return;
        if (!apiUser || !apiUser.id) return;
        try {
            const prof = await apiGetProfile();
            if (prof && typeof prof === 'object') {
                duelAuthEmailInput.value = String(prof.email || '').trim();
            }
        } catch {
            // ignore
        }
    };

    const doAuth = async (mode) => {
        const handle = String(duelAuthHandleInput.value || '').trim();
        const password = String(duelAuthPassInput.value || '');
        const email =
            mode === 'register' && duelAuthEmailRegisterInput instanceof HTMLInputElement
                ? String(duelAuthEmailRegisterInput.value || '').trim()
                : '';
        if (!handle || !password) {
            setStatus('Enter a handle and password.');
            return;
        }

        setBusy(true);
        try {
            const user = mode === 'register' ? await apiRegister(handle, password, email) : await apiLogin(handle, password);
            apiUser = user;
            deckSyncMode = apiUser ? 'api' : 'guest';
            if (apiUser && apiUser.id) {
                await replaceDeckStoreFromApi();
                setOddsPanelMinimized(false);
                setDeckLabHintDismissed(false);
            } else {
                switchToGuestDeckStore();
            }
            try {
                localStorage.setItem(LAST_HANDLE_KEY, handle);
            } catch {
                // ignore
            }
            if (mode === 'register' && duelAuthEmailRegisterInput instanceof HTMLInputElement) duelAuthEmailRegisterInput.value = '';
            render();
            await refreshEmailField();
        } catch (e) {
            if (String(e?.code || '') === 'reserved_handle') {
                setStatus('That username is reserved. Please choose another name.');
            } else {
                setStatus(`${mode === 'register' ? 'Register' : 'Login'} failed: ${String(e?.userMessage || e?.code || e?.message || 'error')}`);
            }
        } finally {
            setBusy(false);
        }
    };

    duelAuthLoginBtn.addEventListener('click', () => void doAuth('login'));
    duelAuthRegisterBtn.addEventListener('click', () => {
        if (duelAuthEmailRegisterInput instanceof HTMLInputElement) {
            duelAuthEmailRegisterInput.hidden = false;
            // Don’t force; just nudge focus for convenience.
            if (!duelAuthEmailRegisterInput.value) duelAuthEmailRegisterInput.focus();
        }
        void doAuth('register');
    });
    duelAuthPassInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') void doAuth('login');
    });

    duelAuthLogoutBtn.addEventListener('click', async () => {
        setBusy(true);
        try {
            await apiLogout();
        } catch {
            // ignore
        }
        apiUser = null;
        deckSyncMode = 'guest';
        switchToGuestDeckStore();
        render();
        if (duelAuthEmailInput instanceof HTMLInputElement) duelAuthEmailInput.value = '';
        setBusy(false);
    });

    if (duelAuthEmailSaveBtn instanceof HTMLButtonElement) {
        duelAuthEmailSaveBtn.addEventListener('click', async () => {
            if (!(duelAuthEmailInput instanceof HTMLInputElement)) return;
            if (!apiUser || !apiUser.id) return;
            const email = String(duelAuthEmailInput.value || '').trim();
            if (!email) {
                setStatus('Enter an email address.');
                return;
            }
            setBusy(true);
            try {
                const res = await apiSaveEmail(email);
                setStatus(String(res?.message || 'Email saved.'));
                await refreshEmailField();
            } catch (e) {
                const code = String(e?.code || '');
                if (code === 'invalid_email') setStatus('Invalid email address.');
                else if (code === 'email_taken') setStatus('That email is already in use.');
                else setStatus(`Save email failed: ${String(e?.userMessage || e?.code || e?.message || 'error')}`);
            } finally {
                setBusy(false);
            }
        });
    }

    render();
    void refreshEmailField();
    window.setInterval(render, 2000);
}

function initPlatformPrototype() {
    const panel = document.getElementById('platform');
    if (!panel) return;

    const userSelect = document.getElementById('plat-user');
    const userNewInput = document.getElementById('plat-user-new');
    const userPassInput = document.getElementById('plat-user-pass');
    const userCreateBtn = document.getElementById('plat-user-create');
    const userLoginBtn = document.getElementById('plat-user-login');
    const userLogoutBtn = document.getElementById('plat-user-logout');
    const phaseEl = document.getElementById('plat-phase');
    const countdownEl = document.getElementById('plat-countdown');
    const seasonNewBtn = document.getElementById('plat-season-new');
    const endTournamentBtn = document.getElementById('plat-phase-end-tournament');
    const stateExportBtn = document.getElementById('plat-state-export');
    const stateImportBtn = document.getElementById('plat-state-import');
    const stateResetBtn = document.getElementById('plat-state-reset');
    const stateFileInput = document.getElementById('plat-state-file');
    const oppInput = document.getElementById('plat-match-opponent');
    const formatSelect = document.getElementById('plat-match-format');
    const deckASelect = document.getElementById('plat-match-deck-a');
    const deckBSelect = document.getElementById('plat-match-deck-b');
    const startBtn = document.getElementById('plat-match-start');
    const matchesEl = document.getElementById('plat-matches');
    const standingsEl = document.getElementById('plat-standings');
    const seasonStatsEl = document.getElementById('plat-season-stats');
    const rolesEl = document.getElementById('plat-roles');
    const intermissionEl = document.getElementById('plat-intermission');
    const eventLogEl = document.getElementById('plat-event-log');

    if (
        !(userSelect instanceof HTMLSelectElement) ||
        !(userNewInput instanceof HTMLInputElement) ||
        !(userCreateBtn instanceof HTMLButtonElement) ||
        !(userPassInput instanceof HTMLInputElement) ||
        !(userLoginBtn instanceof HTMLButtonElement) ||
        !(userLogoutBtn instanceof HTMLButtonElement) ||
        !(phaseEl instanceof HTMLElement) ||
        !(countdownEl instanceof HTMLElement) ||
        !(seasonNewBtn instanceof HTMLButtonElement) ||
        !(endTournamentBtn instanceof HTMLButtonElement) ||
        !(stateExportBtn instanceof HTMLButtonElement) ||
        !(stateImportBtn instanceof HTMLButtonElement) ||
        !(stateResetBtn instanceof HTMLButtonElement) ||
        !(stateFileInput instanceof HTMLInputElement) ||
        !(oppInput instanceof HTMLInputElement) ||
        !(formatSelect instanceof HTMLSelectElement) ||
        !(deckASelect instanceof HTMLSelectElement) ||
        !(deckBSelect instanceof HTMLSelectElement) ||
        !(startBtn instanceof HTMLButtonElement) ||
        !(matchesEl instanceof HTMLElement) ||
        !(standingsEl instanceof HTMLElement) ||
        !(seasonStatsEl instanceof HTMLElement) ||
        !(rolesEl instanceof HTMLElement) ||
        !(intermissionEl instanceof HTMLElement) ||
        !(eventLogEl instanceof HTMLElement)
    ) {
        return;
    }

    const PLATFORM_KEY = 'YGO_PLATFORM_V0';
    const MS_DAY = 24 * 60 * 60 * 1000;
    const TOURNAMENT_DAYS = 21;
    const INTERMISSION_DAYS = 14;
    const CYCLE_DAYS = TOURNAMENT_DAYS + INTERMISSION_DAYS;
    const COUNTED_MATCHES_PER_DAY = 20;
    const COUNTED_MATCHES_PER_OPPONENT_PER_SEASON = 5;

    let serverCache = { season: null, standings: [], matches: [], loadedAt: 0, error: '' };
    let serverRefreshInFlight = false;

    async function refreshServerCache({ force = false } = {}) {
        if (!apiUser || !apiUser.id) return;
        if (serverRefreshInFlight) return;
        const age = Date.now() - Number(serverCache.loadedAt || 0);
        if (!force && age >= 0 && age < 2500) return;

        serverRefreshInFlight = true;
        try {
            const [t, m] = await Promise.all([apiGetTournaments(), apiListMatches()]);
            serverCache = {
                season: t?.season || null,
                standings: Array.isArray(t?.standings) ? t.standings : [],
                matches: Array.isArray(m) ? m : [],
                loadedAt: Date.now(),
                error: '',
            };
        } catch (e) {
            serverCache = { ...serverCache, loadedAt: Date.now(), error: String(e?.code || e?.message || 'error') };
        } finally {
            serverRefreshInFlight = false;
        }
    }

    function getServerSeasonInfo(season) {
        if (!season || typeof season !== 'object') return null;
        const startTs = Number(season.startTs || 0);
        const tournamentEndTs = Number(season.tournamentEndTs || 0);
        const endTs = Number(season.endTs || 0);
        if (!Number.isFinite(startTs) || !Number.isFinite(tournamentEndTs) || !Number.isFinite(endTs)) return null;
        const now = Date.now();
        const phase = now < tournamentEndTs ? 'tournament' : now < endTs ? 'intermission' : 'ended';
        const nextBoundaryMs = phase === 'tournament' ? tournamentEndTs : endTs;
        return { phase, nextBoundaryMs, startTs, tournamentEndTs, endTs };
    }

    function renderServerMatches(matches) {
        const rows = (Array.isArray(matches) ? matches : []).slice(0, 25);
        if (!rows.length) return '<div class="muted">No matches recorded yet.</div>';
        const fmtLabel = (f) => {
            const v = String(f || '').toLowerCase();
            if (v === 'ocg') return 'OCG';
            if (v === 'goat') return 'GOAT';
            return 'TCG';
        };
        const tr = rows
            .map((m) => {
                const when = new Date(Number(m.createdAt || 0)).toLocaleString();
                const res = String(m.result || '').toUpperCase() || '—';
                const counted = m.counted ? 'counted' : 'not counted';
                return `<tr><td>${escapeHtml(String(m.opponent || ''))}</td><td>${escapeHtml(fmtLabel(m.format))}</td><td>${escapeHtml(res)}</td><td>${escapeHtml(counted)}</td><td>${escapeHtml(when)}</td></tr>`;
            })
            .join('');
        return `
            <table>
              <thead><tr><th>Opponent</th><th>Format</th><th>Result</th><th>Counted</th><th>When</th></tr></thead>
              <tbody>${tr}</tbody>
            </table>
        `.trim();
    }

    function renderServerStandings(standings) {
        const rows = (Array.isArray(standings) ? standings : []).slice(0, 10);
        if (!rows.length) return '<div class="muted">No standings yet.</div>';
        const tr = rows
            .map((r) => {
                return `<tr><td>${Number(r.rank || 0) || ''}</td><td>${escapeHtml(String(r.handle || ''))}</td><td>${Number(r.points || 0)}</td><td>${Number(r.w || 0)}-${Number(r.l || 0)}-${Number(r.d || 0)}</td><td>${Number(r.games || 0)}</td></tr>`;
            })
            .join('');
        return `<table><thead><tr><th>#</th><th>Player</th><th>Pts</th><th>W-L-D</th><th>G</th></tr></thead><tbody>${tr}</tbody></table>`;
    }

    function makeId(prefix) {
        const p = String(prefix || 'id');
        if (window.crypto?.randomUUID) return `${p}_${window.crypto.randomUUID()}`;
        return `${p}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }

    function defaultSeasonStartMs() {
        const d = new Date();
        const day = (d.getDay() + 6) % 7; // Monday=0
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - day);
        return d.getTime();
    }

    function startOfTodayMs() {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(PLATFORM_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            if (!parsed || typeof parsed !== 'object') throw new Error('bad');
            if (!Array.isArray(parsed.users)) parsed.users = [];
            if (!Array.isArray(parsed.matches)) parsed.matches = [];
            if (!Number.isFinite(parsed.seasonStartMs)) parsed.seasonStartMs = defaultSeasonStartMs();
            if (typeof parsed.activeUserId !== 'string') parsed.activeUserId = '';
            if (!Number.isFinite(parsed.seasonId)) {
                // Best-effort: if you used the earlier time-derived season id, keep it stable.
                const legacy = getSeasonInfoLegacy({ seasonStartMs: parsed.seasonStartMs });
                parsed.seasonId = legacy.seasonId;
            }
            if (!parsed.qualifications || typeof parsed.qualifications !== 'object') parsed.qualifications = {};
            if (!parsed.phaseOverride || typeof parsed.phaseOverride !== 'object') parsed.phaseOverride = { phase: '', setAtMs: 0 };
            if (!parsed.seasonStats || typeof parsed.seasonStats !== 'object') parsed.seasonStats = {};
            if (!parsed.intermission || typeof parsed.intermission !== 'object') parsed.intermission = {};
            if (!Array.isArray(parsed.eventLog)) parsed.eventLog = [];
            // Lightweight migration: older matches might not have status/format/decks.
            for (const m of parsed.matches) {
                if (!m || typeof m !== 'object') continue;
                if (typeof m.status !== 'string') m.status = typeof m.resultA === 'string' ? 'complete' : 'pending';
                if (typeof m.format !== 'string') m.format = 'tcg';
                if (typeof m.deckAId !== 'string') m.deckAId = '';
                if (typeof m.deckBId !== 'string') m.deckBId = '';
                if (typeof m.counted !== 'boolean') m.counted = typeof m.resultA === 'string';
                if (typeof m.countReason !== 'string') m.countReason = '';
            }
            return parsed;
        } catch {
            return {
                version: 0,
                seasonStartMs: defaultSeasonStartMs(),
                seasonId: 1,
                activeUserId: '',
                users: [],
                matches: [],
                qualifications: {},
                phaseOverride: { phase: '', setAtMs: 0 },
                seasonStats: {},
                intermission: {},
                eventLog: [],
            };
        }
    }

    function saveState(state) {
        localStorage.setItem(PLATFORM_KEY, JSON.stringify(state || {}));
    }

    function ensureUser(state, handle) {
        const h = String(handle || '').trim();
        if (!h) return null;
        const existing = state.users.find((u) => String(u?.handle || '').toLowerCase() === h.toLowerCase()) || null;
        if (existing) return existing;
        const user = { id: makeId('u'), handle: h, createdMs: Date.now() };
        state.users.push(user);
        return user;
    }

    function ensureActiveUser(state) {
        const active = state.users.find((u) => u.id === state.activeUserId) || null;
        if (active) return active;
        if (state.users.length) {
            state.activeUserId = state.users[0].id;
            return state.users[0];
        }
        const user = ensureUser(state, 'Player');
        state.activeUserId = user ? user.id : '';
        return user;
    }

    function getSeasonInfoLegacy(state) {
        const startMs = Number(state.seasonStartMs);
        const now = Date.now();
        const deltaDays = Math.floor((now - startMs) / MS_DAY);
        const seasonIndex = Math.max(0, Math.floor(deltaDays / CYCLE_DAYS));
        const seasonStart = startMs + seasonIndex * CYCLE_DAYS * MS_DAY;
        const dayInSeason = Math.max(0, Math.floor((now - seasonStart) / MS_DAY));
        const inTournament = dayInSeason < TOURNAMENT_DAYS;
        const phase = inTournament ? 'tournament' : 'intermission';
        const phaseDay = inTournament ? dayInSeason : dayInSeason - TOURNAMENT_DAYS;
        const week = Math.floor(phaseDay / 7) + 1;
        const nextBoundaryMs = inTournament ? seasonStart + TOURNAMENT_DAYS * MS_DAY : seasonStart + CYCLE_DAYS * MS_DAY;
        return { seasonId: seasonIndex + 1, phase, week, dayInSeason, seasonStart, nextBoundaryMs };
    }

    function getSeasonInfo(state) {
        const seasonStart = Number(state.seasonStartMs);
        const seasonId = Math.max(1, Math.floor(Number(state.seasonId) || 1));
        const now = Date.now();
        const dayInSeason = Math.max(0, Math.floor((now - seasonStart) / MS_DAY));

        const overridePhase = String(state.phaseOverride?.phase || '');
        const forcedIntermission = overridePhase === 'intermission';

        const inTournament = !forcedIntermission && dayInSeason < TOURNAMENT_DAYS;
        const phase = inTournament ? 'tournament' : 'intermission';
        const phaseDay = inTournament ? dayInSeason : Math.max(0, dayInSeason - TOURNAMENT_DAYS);
        const week = Math.floor(phaseDay / 7) + 1;

        // Even if forced into intermission early, we count down to the end of the season window.
        const nextBoundaryMs = inTournament ? seasonStart + TOURNAMENT_DAYS * MS_DAY : seasonStart + CYCLE_DAYS * MS_DAY;

        return {
            seasonId,
            phase,
            week,
            dayInSeason,
            seasonStart,
            nextBoundaryMs,
            forcedIntermission,
        };
    }

    function formatCountdown(ms) {
        const total = Math.max(0, Math.floor(ms / 1000));
        const days = Math.floor(total / (24 * 3600));
        const hours = Math.floor((total % (24 * 3600)) / 3600);
        const mins = Math.floor((total % 3600) / 60);
        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${mins}m`;
        return `${Math.max(0, mins)}m`;
    }

    function pointsFor(result) {
        if (result === 'win') return 3;
        if (result === 'draw') return 1;
        return 0;
    }

    function invertResult(result) {
        if (result === 'win') return 'loss';
        if (result === 'loss') return 'win';
        return 'draw';
    }

    function todayKey() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function getSeasonStats(state, seasonId) {
        const sid = String(seasonId);
        if (!state.seasonStats[sid] || typeof state.seasonStats[sid] !== 'object') state.seasonStats[sid] = {};
        return state.seasonStats[sid];
    }

    function getPlayerSeasonStat(state, seasonId, userId) {
        const store = getSeasonStats(state, seasonId);
        const uid = String(userId || '');
        if (!store[uid] || typeof store[uid] !== 'object') {
            store[uid] = {
                pts: 0,
                w: 0,
                l: 0,
                d: 0,
                gamesCounted: 0,
                perOpponentCounted: {},
                perDayCounted: {},
            };
        }
        const s = store[uid];
        if (!s.perOpponentCounted || typeof s.perOpponentCounted !== 'object') s.perOpponentCounted = {};
        if (!s.perDayCounted || typeof s.perDayCounted !== 'object') s.perDayCounted = {};
        return s;
    }

    function computeStandings(state, seasonId) {
        const map = new Map();
        const users = state.users.slice();
        for (const u of users) {
            map.set(u.id, { user: u, pts: 0, w: 0, l: 0, d: 0, games: 0 });
        }
        const matches = state.matches.filter(
            (m) => Number(m?.seasonId) === Number(seasonId) && String(m?.status || '') === 'complete' && m?.counted === true
        );
        for (const m of matches) {
            const a = map.get(m.aUserId);
            const b = map.get(m.bUserId);
            if (!a || !b) continue;
            const ra = String(m.resultA || '');
            const rb = invertResult(ra);
            a.pts += pointsFor(ra);
            b.pts += pointsFor(rb);
            a.games += 1;
            b.games += 1;
            if (ra === 'win') a.w += 1;
            else if (ra === 'loss') a.l += 1;
            else a.d += 1;
            if (rb === 'win') b.w += 1;
            else if (rb === 'loss') b.l += 1;
            else b.d += 1;
        }
        const list = Array.from(map.values());
        list.sort((x, y) => {
            if (y.pts !== x.pts) return y.pts - x.pts;
            if (y.w !== x.w) return y.w - x.w;
            if (y.games !== x.games) return y.games - x.games;
            return String(x.user.handle).localeCompare(String(y.user.handle));
        });
        return list;
    }

    function renderStandingsTable(standings) {
        const rows = standings.slice(0, 10);
        if (!rows.length) return '<div class="muted">No standings yet.</div>';
        const tr = rows
            .map((r, idx) => {
                return `<tr><td>${idx + 1}</td><td>${escapeHtml(r.user.handle)}</td><td>${r.pts}</td><td>${r.w}-${r.l}-${r.d}</td><td>${r.games}</td></tr>`;
            })
            .join('');
        return `<table><thead><tr><th>#</th><th>Player</th><th>Pts</th><th>W-L-D</th><th>G</th></tr></thead><tbody>${tr}</tbody></table>`;
    }

    function renderSeasonStatsTable(state, seasonId, activeUserId) {
        const statsStore = getSeasonStats(state, seasonId);
        const rows = state.users
            .map((u) => {
                const s = getPlayerSeasonStat(state, seasonId, u.id);
                return { user: u, pts: Number(s.pts || 0), w: Number(s.w || 0), l: Number(s.l || 0), d: Number(s.d || 0), g: Number(s.gamesCounted || 0) };
            })
            .sort((a, b) => {
                if (b.pts !== a.pts) return b.pts - a.pts;
                if (b.w !== a.w) return b.w - a.w;
                if (b.g !== a.g) return b.g - a.g;
                return String(a.user.handle).localeCompare(String(b.user.handle));
            });

        if (!rows.length) return '<div class="muted">No season stats yet.</div>';

        const tr = rows
            .map((r, idx) => {
                const isActive = String(r.user.id || '') === String(activeUserId || '');
                const style = isActive ? ' style="background: rgba(255,255,255,0.04);"' : '';
                return `<tr${style}><td>${idx + 1}</td><td>${escapeHtml(r.user.handle)}</td><td>${r.pts}</td><td>${r.w}-${r.l}-${r.d}</td><td>${r.g}</td></tr>`;
            })
            .join('');

        void statsStore;
        return `<table><thead><tr><th>#</th><th>Player</th><th>Pts</th><th>W-L-D</th><th>Counted</th></tr></thead><tbody>${tr}</tbody></table>`;
    }

    function renderRoles({ standings, phase, qualificationSnapshot }) {
        if (phase !== 'intermission') return '<div class="muted">Intermission roles appear during the 2-week event phase.</div>';

        const byId = new Map(standings.map((r) => [r.user.id, r.user.handle]));
        const fromSnapshot = qualificationSnapshot && Array.isArray(qualificationSnapshot.giantIds);
        const giants = fromSnapshot
            ? qualificationSnapshot.giantIds.map((id) => byId.get(id) || '(unknown)')
            : standings.slice(0, 4).map((r) => r.user.handle);
        const living = fromSnapshot
            ? (qualificationSnapshot.livingIds || []).map((id) => byId.get(id) || '(unknown)')
            : standings.slice(4, 12).map((r) => r.user.handle);
        const g = giants.length ? giants.join(', ') : '—';
        const l = living.length ? living.join(', ') : '—';
        const stamp = fromSnapshot ? new Date(Number(qualificationSnapshot.ts || 0)).toLocaleString() : '';
        const head = fromSnapshot ? `<div class="muted" style="margin-bottom:6px;">Finalized at ${escapeHtml(stamp)}</div>` : '';
        return `${head}<div><div><strong>Giant Duelists</strong>: ${escapeHtml(g)}</div><div style="margin-top:6px;"><strong>Living Cards</strong>: ${escapeHtml(l)}</div><div class="muted" style="margin-top:6px;">Prototype assignment only; card-binding actions are next-layer work.</div></div>`;
    }

    function getQualifiedRoles(state, seasonId, standings) {
        const snap = state.qualifications?.[String(seasonId)] || null;
        if (snap && Array.isArray(snap.giantIds) && Array.isArray(snap.livingIds)) {
            return { snap, giantIds: snap.giantIds.slice(), livingIds: snap.livingIds.slice() };
        }
        return {
            snap: null,
            giantIds: standings.slice(0, 4).map((r) => r.user.id),
            livingIds: standings.slice(4, 12).map((r) => r.user.id),
        };
    }

    function getIntermissionState(state, seasonId) {
        const sid = String(seasonId);
        if (!state.intermission[sid] || typeof state.intermission[sid] !== 'object') state.intermission[sid] = {};
        const s = state.intermission[sid];
        if (!s.giants || typeof s.giants !== 'object') s.giants = {};
        return s;
    }

    function ensureGiantConfig(intermissionState, giantId) {
        const gid = String(giantId || '');
        if (!gid) return null;
        if (!intermissionState.giants[gid] || typeof intermissionState.giants[gid] !== 'object') {
            intermissionState.giants[gid] = { deckId: '', slots: [] };
        }
        const cfg = intermissionState.giants[gid];
        if (typeof cfg.deckId !== 'string') cfg.deckId = '';
        if (!Array.isArray(cfg.slots)) cfg.slots = [];
        if (cfg.slots.length === 0) {
            for (let i = 1; i <= 8; i++) {
                cfg.slots.push({ slotId: `slot_${i}`, label: `Slot ${i}`, cardLabel: '', livingId: '' });
            }
        }
        return cfg;
    }

    function renderEventLog(state, seasonId) {
        const sid = Number(seasonId);
        const items = (state.eventLog || [])
            .filter((e) => Number(e?.seasonId) === sid)
            .sort((a, b) => Number(b?.ts || 0) - Number(a?.ts || 0))
            .slice(0, 25);

        if (!items.length) {
            eventLogEl.innerHTML = '<div class="muted">Event log (last 25): no actions yet.</div>';
            return;
        }
        const rows = items
            .map((e) => {
                const when = new Date(Number(e.ts || 0)).toLocaleString();
                const who = escapeHtml(String(e.actorHandle || ''));
                const what = escapeHtml(String(e.action || ''));
                const note = String(e.note || '').trim();
                const extra = note ? ` • ${escapeHtml(note)}` : '';
                return `<tr><td>${escapeHtml(when)}</td><td>${who}</td><td>${what}${extra}</td></tr>`;
            })
            .join('');

        eventLogEl.innerHTML = `<div class="muted" style="margin-bottom:6px;">Event log (last 25)</div><table><thead><tr><th>When</th><th>Who</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    function renderIntermission(state, info, { standings, roles, activeUser }) {
        if (info.phase !== 'intermission') {
            intermissionEl.innerHTML = '<div class="muted">Intermission gameplay tools appear during the intermission phase.</div>';
            return;
        }

        const userById = new Map(state.users.map((u) => [u.id, u]));
        const giants = roles.giantIds;
        const living = roles.livingIds;

        const activeId = String(activeUser?.id || '');
        const isGiant = activeId && giants.includes(activeId);
        const isLiving = activeId && living.includes(activeId);

        const inter = getIntermissionState(state, info.seasonId);

        const giantOptions = giants
            .map((id) => {
                const h = userById.get(id)?.handle || '(unknown)';
                const sel = isGiant && id === activeId ? ' selected' : '';
                return `<option value="${escapeHtml(id)}"${sel}>${escapeHtml(h)}</option>`;
            })
            .join('');

        const decks = getDeckList();
        const deckOptions = decks.map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join('');

        const giantCfg = isGiant ? ensureGiantConfig(inter, activeId) : null;
        const deckSel = giantCfg ? String(giantCfg.deckId || '') : '';

        const slotRows =
            giantCfg && Array.isArray(giantCfg.slots)
                ? giantCfg.slots
                      .map((s) => {
                          const label = escapeHtml(String(s.label || 'Slot'));
                          const slotId = escapeHtml(String(s.slotId || ''));
                          const cardLabel = escapeHtml(String(s.cardLabel || ''));
                          const curLiving = String(s.livingId || '');
                          const opts =
                              `<option value="">(unassigned)</option>` +
                              living
                                  .map((id) => {
                                      const h = userById.get(id)?.handle || '(unknown)';
                                      const selected = id === curLiving ? ' selected' : '';
                                      return `<option value="${escapeHtml(id)}"${selected}>${escapeHtml(h)}</option>`;
                                  })
                                  .join('');
                          return `<tr data-slot-id="${slotId}"><td>${label}</td><td><input data-role="cardLabel" type="text" value="${cardLabel}" placeholder="Card name/slot note" /></td><td><select data-role="living">${opts}</select></td><td><button class="btn btn-small" type="button" data-action="save-slot">Save</button></td></tr>`;
                      })
                      .join('')
                : '';

        const giantBlock = isGiant
            ? `
                <div class="muted" style="margin-bottom:6px;">Giant Duelist setup (you)</div>
                <div class="row">
                    <label class="select">
                        <span class="sr-only">Your deck for intermission</span>
                        <select id="plat-giant-deck">
                            <option value="">Deck: (none)</option>
                            ${deckOptions}
                        </select>
                    </label>
                    <button class="btn btn-small" type="button" data-action="save-giant-deck">Set deck</button>
                    <div class="muted">Assign Living Cards to a few “slots”. (Prototype: not bound to real card ids yet.)</div>
                </div>
                <table>
                  <thead><tr><th>Slot</th><th>Card / Note</th><th>Living Card</th><th></th></tr></thead>
                  <tbody>${slotRows}</tbody>
                </table>
            `
            : '';

        const livingBlock = isLiving
            ? `
                <div class="muted" style="margin:10px 0 6px;">Living Card actions (you)</div>
                <div class="row">
                    <label class="select">
                        <span class="sr-only">Action</span>
                        <select id="plat-lc-action">
                            <option value="request_summon" selected>Request: Summon</option>
                            <option value="request_set">Request: Set</option>
                            <option value="request_activate">Request: Activate</option>
                            <option value="request_hold">Request: Hold / Wait</option>
                        </select>
                    </label>
                    <input id="plat-lc-note" type="text" placeholder="Optional note" />
                    <button class="btn btn-small" type="button" data-action="lc-submit">Submit</button>
                </div>
                <div class="muted">Prototype: 1 action per “turn” is not enforced yet—this is just the log + UI seam.</div>
            `
            : '';

        const spectatorHint =
            !isGiant && !isLiving ? `<div class="muted">You are not qualified this season. You can still view roles and the event log.</div>` : '';

        intermissionEl.innerHTML = `
            <div class="muted" style="margin-bottom:6px;">Intermission gameplay layer (prototype)</div>
            ${spectatorHint}
            <div class="row">
                <label class="select">
                    <span class="sr-only">Giant Duelist</span>
                    <select id="plat-giant-select" ${isGiant ? 'disabled' : ''}>
                        ${giantOptions}
                    </select>
                </label>
                <div class="muted">Top qualifiers = Giant Duelists. Runner-ups = Living Cards.</div>
            </div>
            ${giantBlock}
            ${livingBlock}
        `;

        if (isGiant) {
            const sel = document.getElementById('plat-giant-deck');
            if (sel instanceof HTMLSelectElement) sel.value = deckSel;
        }

        void standings;
    }

    function escapeHtml(s) {
        return String(s || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function syncUserSelect(state) {
        const active = ensureActiveUser(state);
        userSelect.innerHTML = '';

        // Server-backed identity (single-user selection for now).
        if (apiUser && apiUser.id) {
            const opt = document.createElement('option');
            opt.value = String(active?.id || '');
            opt.textContent = `Logged in: ${apiUser.handle}`;
            opt.selected = true;
            userSelect.appendChild(opt);
            userSelect.disabled = true;
            return;
        }

        userSelect.disabled = false;
        for (const u of state.users) {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = u.handle;
            if (active && u.id === active.id) opt.selected = true;
            userSelect.appendChild(opt);
        }
    }

    function getDeckList() {
        const store = deckStore && typeof deckStore === 'object' ? deckStore : null;
        const decksObj = store && store.decks && typeof store.decks === 'object' ? store.decks : {};
        const order = Array.isArray(store?.order) ? store.order : Object.keys(decksObj);
        const seen = new Set();
        const out = [];
        for (const id of order) {
            const k = String(id || '');
            const d = decksObj[k];
            if (!k || !d || typeof d !== 'object') continue;
            if (seen.has(k)) continue;
            seen.add(k);
            out.push({ id: k, name: String(d.name || '').trim() || `Deck ${k.slice(-4)}` });
        }
        // Include any decks not in order list.
        for (const [k, d] of Object.entries(decksObj)) {
            if (!k || !d || typeof d !== 'object') continue;
            if (seen.has(k)) continue;
            out.push({ id: String(k), name: String(d.name || '').trim() || `Deck ${String(k).slice(-4)}` });
        }
        return out;
    }

    function syncDeckSelects() {
        const decks = getDeckList();
        const activeDeckId = String(deckStore?.activeId || '');

        const fill = (sel, preferredId) => {
            sel.innerHTML = '';
            const none = document.createElement('option');
            none.value = '';
            none.textContent = 'Deck: (none)';
            sel.appendChild(none);
            for (const d of decks) {
                const opt = document.createElement('option');
                opt.value = d.id;
                opt.textContent = `Deck: ${d.name}`;
                if (preferredId && d.id === preferredId) opt.selected = true;
                sel.appendChild(opt);
            }
        };

        fill(deckASelect, activeDeckId);
        fill(deckBSelect, '');
    }

    function renderMatches(state, info) {
        const active = ensureActiveUser(state);
        const inSeason = state.matches
            .filter((m) => Number(m?.seasonId) === Number(info.seasonId))
            .sort((a, b) => Number(b?.ts || 0) - Number(a?.ts || 0));

        const pending = inSeason.filter((m) => String(m?.status || '') === 'pending');
        const recent = inSeason.filter((m) => String(m?.status || '') === 'complete').slice(0, 8);

        const deckNameById = new Map(getDeckList().map((d) => [d.id, d.name]));
        const userHandleById = new Map(state.users.map((u) => [u.id, u.handle]));

        const fmtLabel = (f) => {
            const v = String(f || '').toLowerCase();
            if (v === 'ocg') return 'OCG';
            if (v === 'goat') return 'GOAT';
            return 'TCG';
        };

        const pendingRows = pending.length
            ? pending
                  .map((m) => {
                      const oppId = m.bUserId === active?.id ? m.aUserId : m.bUserId;
                      const oppHandle = userHandleById.get(oppId) || 'Opponent';
                      const aDeck = deckNameById.get(String(m.deckAId || '')) || '(none)';
                      const bDeck = deckNameById.get(String(m.deckBId || '')) || '(none)';
                      const when = new Date(Number(m.ts || 0)).toLocaleString();
                      const id = String(m.id || '');
                      return `<tr data-match-id="${escapeHtml(id)}"><td>${escapeHtml(oppHandle)}</td><td>${escapeHtml(fmtLabel(m.format))}</td><td>${escapeHtml(aDeck)}</td><td>${escapeHtml(bDeck)}</td><td>${escapeHtml(when)}</td><td><select data-role="result"><option value="win" selected>Win</option><option value="loss">Loss</option><option value="draw">Draw</option></select> <button class="btn btn-small" type="button" data-action="complete">Complete</button> <button class="btn btn-small" type="button" data-action="delete">Delete</button></td></tr>`;
                  })
                  .join('')
            : `<tr><td colspan="6" class="muted">No pending matches.</td></tr>`;

        const recentRows = recent.length
            ? recent
                  .map((m) => {
                      const oppId = m.bUserId === active?.id ? m.aUserId : m.bUserId;
                      const oppHandle = userHandleById.get(oppId) || 'Opponent';
                      const res = String(m.resultA || '').toUpperCase() || '—';
                      const counted = m.counted === true ? 'counted' : 'not counted';
                      const note = m.counted === true ? '' : ` • ${escapeHtml(String(m.countReason || 'rules'))}`;
                      const id = String(m.id || '');
                      return `<tr data-match-id="${escapeHtml(id)}"><td>${escapeHtml(oppHandle)}</td><td>${escapeHtml(fmtLabel(m.format))}</td><td>${escapeHtml(res)}</td><td>${escapeHtml(counted)}${note}</td><td><button class="btn btn-small" type="button" data-action="delete">Delete</button></td></tr>`;
                  })
                  .join('')
            : `<tr><td colspan="4" class="muted">No completed matches yet.</td></tr>`;

        matchesEl.innerHTML = `
            <div class="muted" style="margin-bottom:6px;">Matches (Season ${info.seasonId})</div>
            <div class="muted" style="margin:6px 0 4px;">Pending</div>
            <table>
              <thead><tr><th>Opponent</th><th>Format</th><th>You</th><th>Opp</th><th>Started</th><th>Result</th></tr></thead>
              <tbody>${pendingRows}</tbody>
            </table>
            <div class="muted" style="margin:10px 0 4px;">Recent (last 8)</div>
            <table>
              <thead><tr><th>Opponent</th><th>Format</th><th>Result</th><th>Counted</th><th></th></tr></thead>
              <tbody>${recentRows}</tbody>
            </table>
        `;
    }

    function render() {
        const state = loadState();
        const active = ensureActiveUser(state);
        saveState(state);
        syncUserSelect(state);
        syncDeckSelects();

        if (apiUser && apiUser.id) {
            void refreshServerCache();
            const seasonInfo = getServerSeasonInfo(serverCache.season);
            const sid = serverCache?.season?.id ? Number(serverCache.season.id) : 0;
            const phaseLabel =
                seasonInfo?.phase === 'tournament'
                    ? `Standard Tournament • server season ${sid || '—'}`
                    : seasonInfo?.phase === 'intermission'
                      ? `Intermission Event • server season ${sid || '—'}`
                      : `Server season ${sid || '—'}`;
            phaseEl.textContent = phaseLabel;
            countdownEl.textContent = seasonInfo ? formatCountdown(seasonInfo.nextBoundaryMs - Date.now()) : '';

            const err = String(serverCache.error || '');
            matchesEl.innerHTML =
                `<div class="muted" style="margin-bottom:6px;">Matches (server)</div>` +
                (err ? `<div class="muted">Server error: ${escapeHtml(err)}</div>` : renderServerMatches(serverCache.matches));
            standingsEl.innerHTML =
                `<div class="muted" style="margin-bottom:6px;">Standings (server top 10)</div>` +
                (err ? `<div class="muted">Server error: ${escapeHtml(err)}</div>` : renderServerStandings(serverCache.standings));
            seasonStatsEl.innerHTML = `<div class="muted" style="margin-bottom:6px;">Season stats</div><div class="muted">Server mode: coming next.</div>`;
            rolesEl.innerHTML = `<div class="muted" style="margin-bottom:6px;">Event roles</div><div class="muted">Server mode: coming later.</div>`;
            intermissionEl.innerHTML = `<div class="muted" style="margin-bottom:6px;">Intermission gameplay</div><div class="muted">Server mode: coming later.</div>`;
            eventLogEl.innerHTML = `<div class="muted" style="margin-bottom:6px;">Event log</div><div class="muted">Server mode: coming later.</div>`;

            // Disable local-only prototype controls while logged in.
            seasonNewBtn.disabled = true;
            endTournamentBtn.disabled = true;
            stateExportBtn.disabled = true;
            stateImportBtn.disabled = true;
            stateResetBtn.disabled = true;

            startBtn.disabled = !seasonInfo || seasonInfo.phase !== 'tournament';
            startBtn.title = startBtn.disabled ? 'Matches disabled outside tournament phase (server)' : 'Record a ranked match (server)';
            return;
        }

        // Re-enable local-only prototype controls when not logged in.
        seasonNewBtn.disabled = false;
        stateExportBtn.disabled = false;
        stateImportBtn.disabled = false;
        stateResetBtn.disabled = false;

        const info = getSeasonInfo(state);
        const phaseLabel =
            info.phase === 'tournament'
                ? `Standard Tournament • week ${info.week} of 3 (Season ${info.seasonId})`
                : `Intermission Event • week ${info.week} of 2 (Season ${info.seasonId})`;
        phaseEl.textContent = phaseLabel;
        countdownEl.textContent = formatCountdown(info.nextBoundaryMs - Date.now());

        const standings = computeStandings(state, info.seasonId);
        renderMatches(state, info);
        standingsEl.innerHTML = `<div class="muted" style="margin-bottom:6px;">Standings (top 10)</div>${renderStandingsTable(standings)}`;
        seasonStatsEl.innerHTML = `<div class="muted" style="margin-bottom:6px;">Season stats (counted)</div>${renderSeasonStatsTable(state, info.seasonId, active?.id)}`;
        const roles = getQualifiedRoles(state, info.seasonId, standings);
        rolesEl.innerHTML = `<div class="muted" style="margin-bottom:6px;">Event roles</div>${renderRoles({ standings, phase: info.phase, qualificationSnapshot: roles.snap })}`;
        renderIntermission(state, info, { standings, roles, activeUser: active });
        renderEventLog(state, info.seasonId);

        startBtn.disabled = !active || info.phase !== 'tournament';
        startBtn.title =
            info.phase === 'tournament'
                ? 'Start a ranked match (local prototype)'
                : 'Starting matches is disabled during intermission (prototype rule)';

        endTournamentBtn.disabled = info.phase !== 'tournament';
        endTournamentBtn.title =
            info.phase === 'tournament'
                ? 'Finalize qualifiers and switch to intermission (local prototype)'
                : 'Tournament is already ended for this season (prototype)';
    }

    userCreateBtn.addEventListener('click', async () => {
        const handle = String(userNewInput.value || '').trim();
        const password = String(userPassInput.value || '');
        if (!handle || !password) return;
        try {
            const user = await apiRegister(handle, password);
            apiUser = user;
            userNewInput.value = '';
            userPassInput.value = '';
            deckSyncMode = apiUser ? 'api' : 'guest';
            await replaceDeckStoreFromApi();
            await refreshServerCache({ force: true });
            setOddsPanelMinimized(false);
            setDeckLabHintDismissed(false);
            render();
        } catch (e) {
            if (String(e?.code || '') === 'reserved_handle') {
                alert('That username is reserved. Please choose another name.');
            } else {
                alert(`Register failed: ${String(e?.userMessage || e?.code || e?.message || 'error')}`);
            }
        }
    });

    userLoginBtn.addEventListener('click', async () => {
        const handle = String(userNewInput.value || '').trim();
        const password = String(userPassInput.value || '');
        if (!handle || !password) return;
        try {
            const user = await apiLogin(handle, password);
            apiUser = user;
            userPassInput.value = '';
            deckSyncMode = apiUser ? 'api' : 'guest';
            await replaceDeckStoreFromApi();
            await refreshServerCache({ force: true });
            setOddsPanelMinimized(false);
            setDeckLabHintDismissed(false);
            render();
        } catch (e) {
            alert(`Login failed: ${String(e.code || e.message || 'error')}`);
        }
    });

    userLogoutBtn.addEventListener('click', async () => {
        try {
            await apiLogout();
        } catch {
            // ignore
        }
        apiUser = null;
        deckSyncMode = 'guest';
        serverCache = { season: null, standings: [], matches: [], loadedAt: 0, error: '' };
        switchToGuestDeckStore();
        render();
    });

    userSelect.addEventListener('change', () => {
        if (apiUser && apiUser.id) return;
        const id = String(userSelect.value || '');
        const state = loadState();
        if (state.users.some((u) => u.id === id)) {
            state.activeUserId = id;
            saveState(state);
        }
        render();
    });

    seasonNewBtn.addEventListener('click', () => {
        const state = loadState();
        state.seasonId = Math.max(1, Math.floor(Number(state.seasonId) || 1)) + 1;
        state.seasonStartMs = startOfTodayMs();
        state.phaseOverride = { phase: '', setAtMs: 0 };
        saveState(state);
        render();
    });

    stateExportBtn.addEventListener('click', () => {
        const state = loadState();
        const safeSeason = Math.max(1, Math.floor(Number(state.seasonId) || 1));
        const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '').replaceAll('Z', 'Z');
        const filename = `ygo-platform-v0-season-${safeSeason}-${stamp}.json`;
        const text = JSON.stringify(state, null, 2);
        downloadTextFile(filename, text, 'application/json');
    });

    stateImportBtn.addEventListener('click', () => {
        stateFileInput.value = '';
        stateFileInput.click();
    });

    stateFileInput.addEventListener('change', async () => {
        const f = stateFileInput.files && stateFileInput.files[0];
        if (!f) return;
        try {
            const text = await f.text();
            const parsed = JSON.parse(text);
            if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
            localStorage.setItem(PLATFORM_KEY, JSON.stringify(parsed));
            render();
            alert('Platform state imported.');
        } catch (e) {
            alert('Import failed: invalid JSON.');
        } finally {
            stateFileInput.value = '';
        }
    });

    stateResetBtn.addEventListener('click', () => {
        const ok = confirm('Reset platform state? This will delete local platform accounts, matches, seasons, and standings. (Decks/cards stay.)');
        if (!ok) return;
        localStorage.removeItem(PLATFORM_KEY);
        render();
    });

    endTournamentBtn.addEventListener('click', () => {
        const state = loadState();
        const info = getSeasonInfo(state);
        if (info.phase !== 'tournament') return;
        const standings = computeStandings(state, info.seasonId);

        const giantIds = standings.slice(0, 4).map((r) => r.user.id);
        const livingIds = standings.slice(4, 12).map((r) => r.user.id);
        state.qualifications[String(info.seasonId)] = {
            ts: Date.now(),
            giantIds,
            livingIds,
        };

        state.phaseOverride = { phase: 'intermission', setAtMs: Date.now() };
        saveState(state);
        render();
    });

    startBtn.addEventListener('click', async () => {
        const opponentHandle = String(oppInput.value || '').trim();
        const format = String(formatSelect.value || 'tcg');
        const deckAId = String(deckASelect.value || '');
        const deckBId = String(deckBSelect.value || '');
        if (!opponentHandle) return;

        if (apiUser && apiUser.id) {
            const raw = prompt('Result? (win/loss/draw)', 'win');
            const result = String(raw || '').trim().toLowerCase();
            if (!['win', 'loss', 'draw'].includes(result)) return;
            try {
                await apiCreateMatch({
                    opponentHandle,
                    result,
                    format,
                    deckAId: apiDeckIdToNumber(deckAId),
                    deckBId: apiDeckIdToNumber(deckBId),
                });
                oppInput.value = '';
                await refreshServerCache({ force: true });
                render();
            } catch (e) {
                alert(`Match record failed: ${String(e.code || e.message || 'error')}`);
            }
            return;
        }

        const state = loadState();
        const active = ensureActiveUser(state);
        if (!active) return;

        const info = getSeasonInfo(state);
        if (info.phase !== 'tournament') return;

        const opponent = ensureUser(state, opponentHandle);
        if (!opponent) return;
        if (opponent.id === active.id) return;

        const match = {
            id: makeId('m'),
            ts: Date.now(),
            completedTs: 0,
            seasonId: info.seasonId,
            aUserId: active.id,
            bUserId: opponent.id,
            status: 'pending',
            format,
            deckAId,
            deckBId,
            resultA: '',
        };
        state.matches.push(match);
        saveState(state);
        oppInput.value = '';
        render();
    });

    matchesEl.addEventListener('click', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        const btn = t.closest('button[data-action]');
        if (!(btn instanceof HTMLButtonElement)) return;
        const row = btn.closest('tr[data-match-id]');
        if (!(row instanceof HTMLElement)) return;
        const matchId = String(row.getAttribute('data-match-id') || '');
        if (!matchId) return;

        const state = loadState();
        const info = getSeasonInfo(state);
        const action = String(btn.getAttribute('data-action') || '');

        const m = state.matches.find((x) => String(x?.id || '') === matchId) || null;
        if (!m) return;

        if (action === 'delete') {
            const ok = confirm('Delete this match?');
            if (!ok) return;
            state.matches = state.matches.filter((x) => String(x?.id || '') !== matchId);
            saveState(state);
            render();
            return;
        }

        if (action !== 'complete') return;
        if (info.phase !== 'tournament') return;
        if (String(m.status || '') !== 'pending') return;

        const resSel = row.querySelector('select[data-role="result"]');
        const result = resSel instanceof HTMLSelectElement ? String(resSel.value || 'win') : 'win';

        m.status = 'complete';
        m.completedTs = Date.now();
        m.resultA = result;
        m.counted = true;
        m.countReason = '';

        // Anti-farming (prototype): enforce counted caps per day and per opponent.
        const sid = info.seasonId;
        const aId = String(m.aUserId || '');
        const bId = String(m.bUserId || '');
        const dayKey = todayKey();

        const aStat = getPlayerSeasonStat(state, sid, aId);
        const bStat = getPlayerSeasonStat(state, sid, bId);

        const aDay = Number(aStat.perDayCounted[dayKey] || 0);
        const bDay = Number(bStat.perDayCounted[dayKey] || 0);

        const aOpp = Number(aStat.perOpponentCounted[bId] || 0);
        const bOpp = Number(bStat.perOpponentCounted[aId] || 0);

        let counted = true;
        let reason = '';
        if (aDay >= COUNTED_MATCHES_PER_DAY || bDay >= COUNTED_MATCHES_PER_DAY) {
            counted = false;
            reason = `daily cap (${COUNTED_MATCHES_PER_DAY})`;
        } else if (aOpp >= COUNTED_MATCHES_PER_OPPONENT_PER_SEASON || bOpp >= COUNTED_MATCHES_PER_OPPONENT_PER_SEASON) {
            counted = false;
            reason = `opponent cap (${COUNTED_MATCHES_PER_OPPONENT_PER_SEASON})`;
        }

        if (counted) {
            const ra = String(m.resultA || '');
            const rb = invertResult(ra);
            aStat.pts += pointsFor(ra);
            bStat.pts += pointsFor(rb);
            aStat.gamesCounted += 1;
            bStat.gamesCounted += 1;
            if (ra === 'win') aStat.w += 1;
            else if (ra === 'loss') aStat.l += 1;
            else aStat.d += 1;
            if (rb === 'win') bStat.w += 1;
            else if (rb === 'loss') bStat.l += 1;
            else bStat.d += 1;
            aStat.perDayCounted[dayKey] = aDay + 1;
            bStat.perDayCounted[dayKey] = bDay + 1;
            aStat.perOpponentCounted[bId] = aOpp + 1;
            bStat.perOpponentCounted[aId] = bOpp + 1;
        } else {
            m.counted = false;
            m.countReason = reason;
        }

        saveState(state);
        render();
    });

    intermissionEl.addEventListener('click', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        const btn = t.closest('button[data-action]');
        if (!(btn instanceof HTMLButtonElement)) return;
        const action = String(btn.getAttribute('data-action') || '');

        const state = loadState();
        const info = getSeasonInfo(state);
        if (info.phase !== 'intermission') return;

        const standings = computeStandings(state, info.seasonId);
        const roles = getQualifiedRoles(state, info.seasonId, standings);
        const active = ensureActiveUser(state);
        const activeId = String(active?.id || '');

        if (action === 'save-giant-deck') {
            if (!activeId || !roles.giantIds.includes(activeId)) return;
            const sel = document.getElementById('plat-giant-deck');
            const deckId = sel instanceof HTMLSelectElement ? String(sel.value || '') : '';
            const inter = getIntermissionState(state, info.seasonId);
            const cfg = ensureGiantConfig(inter, activeId);
            if (!cfg) return;
            cfg.deckId = deckId;
            saveState(state);
            render();
            return;
        }

        if (action === 'save-slot') {
            if (!activeId || !roles.giantIds.includes(activeId)) return;
            const row = btn.closest('tr[data-slot-id]');
            if (!(row instanceof HTMLElement)) return;
            const slotId = String(row.getAttribute('data-slot-id') || '');
            if (!slotId) return;
            const cardInput = row.querySelector('input[data-role="cardLabel"]');
            const livingSel = row.querySelector('select[data-role="living"]');
            const cardLabel = cardInput instanceof HTMLInputElement ? String(cardInput.value || '').trim() : '';
            const livingId = livingSel instanceof HTMLSelectElement ? String(livingSel.value || '') : '';
            if (livingId && !roles.livingIds.includes(livingId)) return;
            const inter = getIntermissionState(state, info.seasonId);
            const cfg = ensureGiantConfig(inter, activeId);
            if (!cfg) return;
            const slot = cfg.slots.find((s) => String(s?.slotId || '') === slotId) || null;
            if (!slot) return;
            slot.cardLabel = cardLabel;
            slot.livingId = livingId;
            saveState(state);
            render();
            return;
        }

        if (action === 'lc-submit') {
            if (!activeId || !roles.livingIds.includes(activeId)) return;
            const actionSel = document.getElementById('plat-lc-action');
            const noteInput = document.getElementById('plat-lc-note');
            const act = actionSel instanceof HTMLSelectElement ? String(actionSel.value || '') : '';
            const note = noteInput instanceof HTMLInputElement ? String(noteInput.value || '').trim() : '';
            if (!act) return;
            state.eventLog.push({
                id: makeId('e'),
                ts: Date.now(),
                seasonId: info.seasonId,
                actorId: activeId,
                actorHandle: String(active.handle || ''),
                action: act,
                note,
            });
            saveState(state);
            if (noteInput instanceof HTMLInputElement) noteInput.value = '';
            render();
        }
    });

    render();
    window.setInterval(render, 5000);
}

function isFavorite(card) {
    const id = String(card?.id ?? '');
    return id ? favorites.has(id) : false;
}

function toggleFavorite(card) {
    const id = String(card?.id ?? '');
    if (!id) return;
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    saveFavorites();
}

function loadFavorites() {
    try {
        const raw = localStorage.getItem(FAVORITES_KEY);
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return new Set();
        return new Set(arr.map((x) => String(x)));
    } catch {
        return new Set();
    }
}

function saveFavorites() {
    try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites)));
    } catch {
        // ignore
    }
}

function getCardId(card) {
    const id = String(card?.id ?? '').trim();
    return id || null;
}

function sanitizeDeckObject(d) {
    if (!d || typeof d !== 'object') return emptyDeck();

    // v2 format
    if (Number(d.version) === 2 && d.sections && typeof d.sections === 'object') {
        const name = typeof d.name === 'string' ? d.name : '';
        const notes = typeof d.notes === 'string' ? d.notes : '';
        const updatedAt = Number.isFinite(Number(d.updatedAt)) ? Number(d.updatedAt) : 0;
        const sections = { main: {}, extra: {}, side: {} };
        for (const sec of DECK_SECTIONS) {
            const obj = d.sections[sec];
            if (!obj || typeof obj !== 'object') continue;
            for (const [k, v] of Object.entries(obj)) {
                const qty = Number(v);
                if (!Number.isFinite(qty)) continue;
                const n = Math.max(0, Math.min(60, Math.floor(qty)));
                if (n > 0) sections[sec][String(k)] = n;
            }
        }
        return { version: 2, name, notes, updatedAt, sections };
    }

    // v1 format (upgrade)
    const name = typeof d.name === 'string' ? d.name : '';
    const notes = typeof d.notes === 'string' ? d.notes : '';
    const cardsObj = d.cards && typeof d.cards === 'object' ? d.cards : {};
    const main = {};
    for (const [k, v] of Object.entries(cardsObj)) {
        const qty = Number(v);
        if (!Number.isFinite(qty)) continue;
        const n = Math.max(0, Math.min(60, Math.floor(qty)));
        if (n > 0) main[String(k)] = n;
    }
    return { version: 2, name, notes, updatedAt: 0, sections: { main, extra: {}, side: {} } };
}

function loadDeckLegacy() {
    try {
        const raw = localStorage.getItem(DECK_KEY);
        if (!raw) return emptyDeck();
        const d = JSON.parse(raw);
        return sanitizeDeckObject(d);
    } catch {
        return emptyDeck();
    }
}

function saveDeckLegacy(d) {
    try {
        localStorage.setItem(DECK_KEY, JSON.stringify(d));
    } catch {
        // ignore
    }
}

function generateDeckId() {
    const rand = Math.random().toString(36).slice(2, 8);
    return `deck_${Date.now().toString(36)}_${rand}`;
}

function loadDeckStore() {
    const newStore = () => {
        const id = generateDeckId();
        const legacy = loadDeckLegacy();
        return { version: 1, activeId: id, order: [id], decks: { [id]: legacy } };
    };

    try {
        const raw = localStorage.getItem(DECKS_KEY);
        if (!raw) {
            const store = newStore();
            localStorage.setItem(DECKS_KEY, JSON.stringify(store));
            return store;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Number(parsed.version) !== 1) throw new Error('bad store');
        const decksObj = parsed.decks && typeof parsed.decks === 'object' ? parsed.decks : {};
        const decks = {};
        for (const [id, d] of Object.entries(decksObj)) decks[String(id)] = sanitizeDeckObject(d);
        const ids = Object.keys(decks);
        if (ids.length === 0) {
            const store = newStore();
            localStorage.setItem(DECKS_KEY, JSON.stringify(store));
            return store;
        }
        const order = Array.isArray(parsed.order) ? parsed.order.map((x) => String(x)) : ids.slice();
        const uniqOrder = [];
        const seen = new Set();
        for (const id of order) {
            if (!decks[id]) continue;
            if (seen.has(id)) continue;
            seen.add(id);
            uniqOrder.push(id);
        }
        for (const id of ids) {
            if (seen.has(id)) continue;
            uniqOrder.push(id);
        }
        const activeId = decks[String(parsed.activeId)] ? String(parsed.activeId) : uniqOrder[0];
        return { version: 1, activeId, order: uniqOrder, decks };
    } catch {
        const store = newStore();
        try {
            localStorage.setItem(DECKS_KEY, JSON.stringify(store));
        } catch {
            // ignore
        }
        return store;
    }
}

function saveDeckStore() {
    try {
        if (!deckStore || typeof deckStore !== 'object') return;
        if (deckSyncMode === 'api') return;
        localStorage.setItem(DECKS_KEY, JSON.stringify(deckStore));
    } catch {
        // ignore
    }
}

function populateDeckSelect() {
    if (!deckSelectEl) return;
    const ids = Array.isArray(deckStore.order) ? deckStore.order.slice() : Object.keys(deckStore.decks || {});
    deckSelectEl.innerHTML = '';
    for (const id of ids) {
        const d = deckStore.decks?.[id];
        if (!d) continue;
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = (d.name || '').trim() ? d.name.trim() : `Untitled (${id.slice(-6)})`;
        deckSelectEl.appendChild(opt);
    }
    deckSelectEl.value = activeDeckId;
    if (deckDelBtn) deckDelBtn.disabled = ids.length <= 1;
}

function deckTotalsMap(d) {
    const out = new Map();
    const sections = d?.sections && typeof d.sections === 'object' ? d.sections : {};
    for (const sec of DECK_SECTIONS) {
        const obj = sections?.[sec] || {};
        for (const [id, qty] of Object.entries(obj)) {
            const n = Number(qty) || 0;
            if (n <= 0) continue;
            out.set(String(id), (out.get(String(id)) || 0) + n);
        }
    }
    return out;
}

function getUnknownDeckIds() {
    const known = new Set(cards.map((c) => String(c?.id ?? '')));
    const totals = deckTotalsMap(deck);
    return Array.from(totals.keys()).filter((id) => !known.has(id));
}

function getDeckDisplayNameById(id) {
    const d = deckStore?.decks?.[id];
    const name = d && typeof d.name === 'string' ? d.name.trim() : '';
    return name || `Untitled (${String(id).slice(-6)})`;
}

function getDeckDiffText(base, other, otherName = 'Other') {
    const a = deckTotalsMap(base);
    const b = deckTotalsMap(other);
    const ids = new Set([...a.keys(), ...b.keys()]);
    const rows = [];
    for (const id of ids) {
        const av = a.get(id) || 0;
        const bv = b.get(id) || 0;
        if (av === bv) continue;
        const name = cards.find((c) => String(c?.id ?? '') === id)?.name || id;
        const delta = bv - av;
        const sign = delta > 0 ? '+' : '';
        rows.push({ id, name: String(name), av, bv, delta, line: `${sign}${delta} (${av}→${bv}) ${name} [${id}]` });
    }
    rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.name.localeCompare(y.name));
    const head = `Diff vs ${otherName} (showing up to 60 changes)`;
    const body = rows.slice(0, 60).map((r) => r.line).join('\n') || 'No differences.';
    return `${head}\n${body}\n`;
}

function populateDeckCompareSelect() {
    if (!deckCompareSelect) return;
    deckCompareSelect.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'Compare: None';
    deckCompareSelect.appendChild(none);

    const ids = Array.isArray(deckStore.order) ? deckStore.order : Object.keys(deckStore.decks || {});
    for (const id of ids) {
        if (id === activeDeckId) continue;
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = `Compare: ${getDeckDisplayNameById(id)}`;
        deckCompareSelect.appendChild(opt);
    }
}

function renderDeckCompare() {
    if (!deckCompareOut || !deckCompareSelect) return;
    const otherId = String(deckCompareSelect.value || '').trim();
    if (!otherId) {
        const unknown = getUnknownDeckIds();
        const msg = unknown.length ? `Unknown card ids in this dataset: ${unknown.length}` : 'Pick another saved deck to compare.';
        deckCompareOut.innerHTML = `<div class="muted">${escapeHtml(msg)}</div>`;
        if (deckPruneUnknownBtn) deckPruneUnknownBtn.disabled = unknown.length === 0;
        return;
    }
    const other = deckStore.decks?.[otherId] || null;
    if (!other) {
        deckCompareOut.innerHTML = `<div class="muted">Selected deck not found.</div>`;
        return;
    }
    const text = getDeckDiffText(deck, other, getDeckDisplayNameById(otherId));
    deckCompareOut.innerHTML = `<pre>${escapeHtml(text)}</pre>`;
    if (deckPruneUnknownBtn) deckPruneUnknownBtn.disabled = getUnknownDeckIds().length === 0;
}

function setActiveDeck(id) {
    const nextId = String(id || '').trim();
    const next = deckStore.decks?.[nextId] || null;
    if (!next) return;
    activeDeckId = nextId;
    deck = next;
    deckStore.activeId = nextId;
    saveDeckStore();
    if (deckSyncMode !== 'api') saveDeckLegacy(deck);
    populateDeckSelect();
    populateDeckCompareSelect();
    if (deckNameInput) deckNameInput.value = deck.name || '';
    if (deckNotesInput) deckNotesInput.value = deck.notes || '';
    syncTargetUiFromStore();
    renderDeck();
    renderDeckCompare();
    if (selectedCard) renderDetail(selectedCard);
}

async function createNewDeck({ name } = {}) {
    const d = emptyDeck();
    if (typeof name === 'string') d.name = name.trim();

    if (deckSyncMode === 'api') {
        try {
            const created = await apiUpsertDeck({ id: null, name: d.name || 'Untitled', deck: d });
            const sid = created && created.id ? `srv_${Number(created.id)}` : '';
            if (!sid) throw new Error('create_failed');
            deckStore.decks[sid] = sanitizeDeckObject(created.deck);
            deckStore.decks[sid].name = String(created.name || d.name || '');
            deckStore.decks[sid].updatedAt = Number(created.updatedAt || Date.now());
            if (!Array.isArray(deckStore.order)) deckStore.order = [];
            deckStore.order.unshift(sid);
            setActiveDeck(sid);
            populateDeckSelect();
            populateDeckCompareSelect();
            return;
        } catch (e) {
            alert(`Create deck failed: ${String(e.code || e.message || 'error')}`);
            return;
        }
    }

    const id = generateDeckId();
    deckStore.decks[id] = d;
    if (!Array.isArray(deckStore.order)) deckStore.order = [];
    deckStore.order.push(id);
    setActiveDeck(id);
    saveDeck();
}

function markDeckUpdated() {
    if (!deck || typeof deck !== 'object') return;
    deck.updatedAt = Date.now();
}

async function duplicateActiveDeck() {
    const baseName = (deck?.name || '').trim() || 'Untitled';
    const copy = JSON.parse(JSON.stringify(deck || emptyDeck()));
    copy.name = `Copy of ${baseName}`;
    await createNewDeck({ name: copy.name });
    deck = deckStore.decks[activeDeckId];
    deck.sections = copy.sections;
    deck.notes = copy.notes || '';
    markDeckUpdated();
    saveDeck();
    renderDeck();
    if (selectedCard) renderDetail(selectedCard);
}

async function deleteActiveDeck() {
    const ids = Array.isArray(deckStore.order) ? deckStore.order.slice() : Object.keys(deckStore.decks || {});
    if (ids.length <= 1) return;
    const name = (deck?.name || '').trim() || 'Untitled';
    const ok = confirm(`Delete deck "${name}"? This cannot be undone.`);
    if (!ok) return;

     if (deckSyncMode === 'api') {
        const sid = apiDeckIdToNumber(activeDeckId);
        if (sid) {
            try {
                await apiDeleteDeck(sid);
            } catch (e) {
                alert(`Delete failed: ${String(e.code || e.message || 'error')}`);
                return;
            }
        }
    }
    delete deckStore.decks[activeDeckId];
    deckStore.order = ids.filter((x) => x !== activeDeckId);
    const nextId = deckStore.order[0];
    if (nextId) setActiveDeck(nextId);
    saveDeckStore();
    populateDeckSelect();
}

function saveDeck() {
    if (!deckStore.decks) deckStore.decks = {};
    deckStore.decks[activeDeckId] = deck;
    deckStore.activeId = activeDeckId;
    if (!Array.isArray(deckStore.order)) deckStore.order = [];
    if (!deckStore.order.includes(activeDeckId)) deckStore.order.push(activeDeckId);
    saveDeckStore();
    if (deckSyncMode !== 'api') saveDeckLegacy(deck);
    populateDeckSelect();
    populateDeckCompareSelect();
    scheduleActiveDeckSync();
}

function getDeckQty(id, section) {
    if (!id) return 0;
    const sec = deck?.sections?.[section] || {};
    return Number(sec[id] ?? 0) || 0;
}

function getDeckQtyAll(id) {
    const main = getDeckQty(id, 'main');
    const extra = getDeckQty(id, 'extra');
    const side = getDeckQty(id, 'side');
    return { main, extra, side, total: main + extra + side };
}

function _setDeckQty(id, section, qty) {
    if (!deck.sections) deck.sections = { main: {}, extra: {}, side: {} };
    if (!deck.sections[section]) deck.sections[section] = {};
    if (qty <= 0) delete deck.sections[section][id];
    else deck.sections[section][id] = qty;
}

function addToDeck(card, delta, section) {
    const id = getCardId(card);
    if (!id) return;
    const cur = getDeckQty(id, section);
    const next = Math.max(0, Math.min(60, cur + delta));
    _setDeckQty(id, section, next);
    markDeckUpdated();
    saveDeck();
}

function onAddToDeck(card, section) {
    addToDeck(card, 1, section);
    renderDeck();
    renderDetail(card);
}

function onRemoveFromDeck(card) {
    const id = getCardId(card);
    if (!id) return;
    // Remove from main, else extra, else side.
    for (const sec of DECK_SECTIONS) {
        const cur = getDeckQty(id, sec);
        if (cur > 0) {
            addToDeck(card, -1, sec);
            break;
        }
    }
    renderDeck();
    renderDetail(card);
}

function renderDeck() {
    if (!deckMetaEl || !deckListEl) return;

    const sectionEntries = (section) => {
        const obj = deck.sections?.[section] || {};
        return Object.entries(obj)
            .map(([id, qty]) => {
                const card = cards.find((c) => String(c?.id ?? '') === id) || null;
                const name = card?.name ? String(card.name) : id;
                const type = card?.type ? String(card.type) : '-';
                const attribute = card?.attribute ? String(card.attribute) : '-';
                return { id, section, qty: Number(qty) || 0, name, type, attribute, card };
            })
            .filter((e) => e.qty > 0)
            .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
    };

    const mainEntries = sectionEntries('main');
    const extraEntries = sectionEntries('extra');
    const sideEntries = sectionEntries('side');

    const allEntries = [...mainEntries, ...extraEntries, ...sideEntries];
    const mainTotal = mainEntries.reduce((acc, e) => acc + e.qty, 0);
    const extraTotal = extraEntries.reduce((acc, e) => acc + e.qty, 0);
    const sideTotal = sideEntries.reduce((acc, e) => acc + e.qty, 0);
    const total = mainTotal + extraTotal + sideTotal;
    const unique = new Set(allEntries.map((e) => e.id)).size;
    const deckName = (deck.name || '').trim() || 'Untitled';
    const edited = deck.updatedAt ? new Date(Number(deck.updatedAt)).toLocaleString() : '';
    deckMetaEl.textContent = `${deckName} • ${total} cards (M ${mainTotal} • E ${extraTotal} • S ${sideTotal}) • ${unique} unique${
        edited ? ` • edited ${edited}` : ''
    }`;

    if (deckWarningsEl) {
        const warnings = [];
        if (mainTotal > 60) warnings.push('Main deck over 60 cards.');
        if (extraTotal > 15) warnings.push('Extra deck over 15 cards.');
        if (sideTotal > 15) warnings.push('Side deck over 15 cards.');

        // Soft warning for >3 copies (across all sections).
        const copies = new Map();
        for (const e of allEntries) copies.set(e.id, (copies.get(e.id) || 0) + e.qty);
        const over = Array.from(copies.entries()).filter(([, qty]) => qty > 3);
        if (over.length) warnings.push(`Over 3 copies: ${over.slice(0, 3).map(([id, qty]) => `${qty}x ${cards.find((c) => String(c?.id ?? '') === id)?.name || id}`).join(' • ')}${over.length > 3 ? '…' : ''}`);

        deckWarningsEl.innerHTML = warnings.length
            ? warnings.map((w) => `<span class="pill">${escapeHtml(w)}</span>`).join(' ')
            : '';
    }

    if (allEntries.length === 0) {
        deckListEl.innerHTML = `<div class="deck-meta">No cards yet. Select a card and add it to Main / Extra / Side.</div>`;
        return;
    }

    const renderSection = (title, entries) => {
        if (entries.length === 0) return '';
        const rows = entries
            .map((e) => {
                const dataId = encodeURIComponent(e.id);
                return `
                    <div class="deck-item" data-id="${dataId}" data-section="${escapeHtml(e.section)}" tabindex="0">
                        <div class="left">
                            <div class="name">${escapeHtml(e.name)}</div>
                            <div class="sub">${escapeHtml(e.type)} • ${escapeHtml(e.attribute)}</div>
                        </div>
                        <div class="right">
                            <button class="btn btn-small" type="button" data-action="dec" aria-label="Decrease">-</button>
                            <span class="qty">${e.qty}</span>
                            <button class="btn btn-small" type="button" data-action="inc" aria-label="Increase">+</button>
                        </div>
                    </div>
                `.trim();
            })
            .join('\n');
        return `<div class="deck-section"><h3>${escapeHtml(title)}</h3>${rows}</div>`;
    };

    deckListEl.innerHTML =
        renderSection('Main', mainEntries) +
        renderSection('Extra', extraEntries) +
        renderSection('Side', sideEntries);

    // Deck event delegation
    deckListEl.onclick = (ev) => {
        const t = ev.target;
        if (!(t instanceof Element)) return;
        const row = t.closest('.deck-item');
        if (!(row instanceof Element)) return;
        const encoded = row.getAttribute('data-id') || '';
        const id = decodeURIComponent(encoded);
        const section = row.getAttribute('data-section') || 'main';
        const action = t.getAttribute('data-action');

        if (action === 'dec') {
            ev.stopPropagation();
            addToDeck({ id }, -1, section);
            renderDeck();
            if (selectedCard && getCardId(selectedCard) === id) renderDetail(selectedCard);
            return;
        }
        if (action === 'inc') {
            ev.stopPropagation();
            addToDeck({ id }, 1, section);
            renderDeck();
            if (selectedCard && getCardId(selectedCard) === id) renderDetail(selectedCard);
            return;
        }

        const target = cards.find((c) => String(c?.id ?? '') === id);
        if (target) selectCard(target);
    };

    renderDeckCompare();
    renderOddsPanel();
    renderGoldfish();
}

async function exportDeck() {
    const payload = JSON.stringify(deck, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(payload);
            alert('Deck copied to clipboard.');
            return;
        } catch {
            // fall through
        }
    }
    prompt('Copy your deck JSON:', payload);
}

function getDeckListText() {
    const deckName = (deck?.name || '').trim() || 'Untitled';
    const lines = [`# ${deckName}`];

    const renderSection = (sec, title) => {
        const obj = deck?.sections?.[sec] || {};
        const entries = Object.entries(obj)
            .map(([id, qty]) => {
                const n = Number(qty) || 0;
                if (n <= 0) return null;
                const card = cards.find((c) => String(c?.id ?? '') === String(id)) || null;
                const name = card?.name ? String(card.name) : String(id);
                return { name, qty: n };
            })
            .filter(Boolean)
            .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));

        const total = entries.reduce((acc, e) => acc + e.qty, 0);
        lines.push(``, `## ${title} (${total})`);
        for (const e of entries) lines.push(`${e.qty}x ${e.name}`);
    };

    renderSection('main', 'Main');
    renderSection('extra', 'Extra');
    renderSection('side', 'Side');

    return lines.join('\n').trim() + '\n';
}

function getDeckListWithIdsText() {
    const deckName = (deck?.name || '').trim() || 'Untitled';
    const lines = [`# ${deckName}`];

    const renderSection = (sec, title) => {
        const obj = deck?.sections?.[sec] || {};
        const entries = Object.entries(obj)
            .map(([id, qty]) => {
                const n = Number(qty) || 0;
                if (n <= 0) return null;
                const card = cards.find((c) => String(c?.id ?? '') === String(id)) || null;
                const name = card?.name ? String(card.name) : String(id);
                return { id: String(id), name, qty: n };
            })
            .filter(Boolean)
            .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));

        const total = entries.reduce((acc, e) => acc + e.qty, 0);
        lines.push(``, `## ${title} (${total})`);
        for (const e of entries) lines.push(`${e.qty}x ${e.name} [${e.id}]`);
    };

    renderSection('main', 'Main');
    renderSection('extra', 'Extra');
    renderSection('side', 'Side');

    return lines.join('\n').trim() + '\n';
}

async function exportDeckList() {
    const payload = getDeckListText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(payload);
            alert('Deck list copied to clipboard.');
            return;
        } catch {
            // fall through
        }
    }
    prompt('Copy your deck list:', payload);
}

function normalizeNameKey(name) {
    return String(name || '')
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, ' ')
        .trim();
}

function importDeckListFromText(pasted) {
    if (!pasted) return { ok: false, missing: [] };

    const nameToId = new Map();
    for (const c of cards) {
        const n = String(c?.name ?? '').trim();
        if (!n) continue;
        const key = normalizeNameKey(n);
        if (!key) continue;
        if (!nameToId.has(key)) nameToId.set(key, String(c.id));
    }

    const next = emptyDeck();
    next.name = (deck?.name || '').trim() || 'Imported';

    let section = 'main';
    const missing = [];
    const lines = String(pasted).split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = String(raw || '').trim();
        if (!line) continue;
        if (line.startsWith('#')) {
            const h = line.replace(/^#+\s*/, '').toLowerCase();
            if (h.includes('main')) section = 'main';
            else if (h.includes('extra')) section = 'extra';
            else if (h.includes('side')) section = 'side';
            continue;
        }
        if (line.endsWith(':')) {
            const h = line.slice(0, -1).trim().toLowerCase();
            if (h === 'main' || h === 'main deck') section = 'main';
            else if (h === 'extra' || h === 'extra deck') section = 'extra';
            else if (h === 'side' || h === 'side deck') section = 'side';
            continue;
        }

        let qty = 1;
        let name = line;
        let m = line.match(/^\s*(\d+)\s*x?\s+(.+?)\s*$/i);
        if (m) {
            qty = Number(m[1]) || 1;
            name = m[2];
        } else {
            m = line.match(/^\s*(.+?)\s*x\s*(\d+)\s*$/i);
            if (m) {
                name = m[1];
                qty = Number(m[2]) || 1;
            } else {
                m = line.match(/^\s*(\d+)\s*[-–]\s*(.+?)\s*$/);
                if (m) {
                    qty = Number(m[1]) || 1;
                    name = m[2];
                }
            }
        }

        qty = Math.max(1, Math.min(60, Math.floor(qty)));
        name = String(name || '').trim();
        if (!name) continue;

        const key = normalizeNameKey(name);
        const id = nameToId.get(key) || null;
        if (!id) {
            missing.push(`${qty}x ${name}`);
            continue;
        }
        const cur = Number(next.sections?.[section]?.[id] ?? 0) || 0;
        const put = Math.max(0, Math.min(60, cur + qty));
        next.sections[section][id] = put;
    }

    deck = next;
    if (!deckStore.decks) deckStore.decks = {};
    deckStore.decks[activeDeckId] = deck;
    if (deckNameInput) deckNameInput.value = deck.name || '';
    if (deckNotesInput) deckNotesInput.value = deck.notes || '';
    markDeckUpdated();
    saveDeck();
    renderDeck();
    if (selectedCard) renderDetail(selectedCard);

    return { ok: true, missing };
}

function importDeckList() {
    const pasted = prompt(
        'Paste a plain-text deck list to import.\n\nSupported:\n- "3x Card Name"\n- "Card Name x3"\n- Section headers like "## Main", "## Extra", "## Side"\n\nUnknown names will be listed at the end.'
    );
    if (!pasted) return;
    const res = importDeckListFromText(pasted);
    if (!res.ok) return;
    if (res.missing.length) {
        alert(
            `Imported with missing cards (${res.missing.length}).\n\nNot found in the current dataset:\n` +
                res.missing.slice(0, 25).join('\n') +
                (res.missing.length > 25 ? `\n…(+${res.missing.length - 25} more)` : '')
        );
    } else {
        alert('Deck list imported.');
    }
}

function getDeckYdkText() {
    const lines = ['#created by Duelist ARC', '#main'];
    const emit = (sec, header) => {
        if (header) lines.push(header);
        const obj = deck?.sections?.[sec] || {};
        const entries = Object.entries(obj)
            .map(([id, qty]) => ({ id: String(id), qty: Number(qty) || 0 }))
            .filter((e) => e.qty > 0);
        for (const e of entries) {
            for (let i = 0; i < e.qty; i++) lines.push(e.id);
        }
    };
    emit('main', null);
    emit('extra', '#extra');
    emit('side', '!side');
    return lines.join('\n').trim() + '\n';
}

async function exportDeckYdk() {
    const payload = getDeckYdkText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(payload);
            alert('YDK copied to clipboard.');
            return;
        } catch {
            // fall through
        }
    }
    prompt('Copy your deck .ydk:', payload);
}

function importDeckYdkFromText(text) {
    const raw = String(text || '');
    if (!raw.trim()) return { ok: false, error: 'Empty file' };

    const next = emptyDeck();
    next.name = (deck?.name || '').trim() || 'Imported';

    let section = 'main';
    const lines = raw.split(/\r?\n/);
    for (const ln of lines) {
        const line = String(ln || '').trim();
        if (!line) continue;
        if (line.startsWith('#created')) continue;
        if (line === '#main') {
            section = 'main';
            continue;
        }
        if (line === '#extra') {
            section = 'extra';
            continue;
        }
        if (line === '!side') {
            section = 'side';
            continue;
        }
        if (line.startsWith('#')) continue;

        const id = line;
        const cur = Number(next.sections?.[section]?.[id] ?? 0) || 0;
        const put = Math.max(0, Math.min(60, cur + 1));
        next.sections[section][id] = put;
    }

    deck = next;
    if (!deckStore.decks) deckStore.decks = {};
    deckStore.decks[activeDeckId] = deck;
    if (deckNameInput) deckNameInput.value = deck.name || '';
    if (deckNotesInput) deckNotesInput.value = deck.notes || '';
    markDeckUpdated();
    saveDeck();
    renderDeck();
    if (selectedCard) renderDetail(selectedCard);
    return { ok: true };
}

function importDeckYdk() {
    const pasted = prompt('Paste deck .ydk contents to import:');
    if (!pasted) return;
    const res = importDeckYdkFromText(pasted);
    if (!res.ok) alert(`Import failed: ${res.error || 'invalid .ydk'}`);
    else alert('YDK imported.');
}

function importDeckFromJsonText(text) {
    const pasted = String(text || '');
    if (!pasted.trim()) return { ok: false, error: 'Empty file' };
    try {
        const parsed = JSON.parse(pasted);
        if (!parsed || typeof parsed !== 'object') throw new Error('not an object');

        // v2
        if (Number(parsed.version) === 2 && parsed.sections && typeof parsed.sections === 'object') {
            const next = emptyDeck();
            next.name = typeof parsed.name === 'string' ? parsed.name : '';
            for (const sec of DECK_SECTIONS) {
                const obj = parsed.sections?.[sec];
                if (!obj || typeof obj !== 'object') continue;
                for (const [k, v] of Object.entries(obj)) {
                    const qty = Number(v);
                    if (!Number.isFinite(qty)) continue;
                    const n = Math.max(0, Math.min(60, Math.floor(qty)));
                    if (n > 0) next.sections[sec][String(k)] = n;
                }
            }
            deck = next;
        } else {
            // v1 import
            const name = typeof parsed.name === 'string' ? parsed.name : '';
            const cardsObj = parsed.cards && typeof parsed.cards === 'object' ? parsed.cards : {};
            const next = emptyDeck();
            next.name = name;
            for (const [k, v] of Object.entries(cardsObj)) {
                const qty = Number(v);
                if (!Number.isFinite(qty)) continue;
                const n = Math.max(0, Math.min(60, Math.floor(qty)));
                if (n > 0) next.sections.main[String(k)] = n;
            }
            deck = next;
        }

        if (deckNameInput) deckNameInput.value = deck.name || '';
        if (deckNotesInput) deckNotesInput.value = deck.notes || '';
        if (!deckStore.decks) deckStore.decks = {};
        deckStore.decks[activeDeckId] = deck;
        markDeckUpdated();
        saveDeck();
        renderDeck();
        if (selectedCard) renderDetail(selectedCard);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: 'Invalid JSON format' };
    }
}

function downloadTextFile(filename, text, mime = 'text/plain') {
    try {
        const blob = new Blob([String(text || '')], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch {
        alert('Download failed in this browser.');
    }
}

function importDeck() {
    const pasted = prompt('Paste deck JSON to import:');
    if (!pasted) return;
    try {
        const parsed = JSON.parse(pasted);
        if (!parsed || typeof parsed !== 'object') throw new Error('not an object');

        // v2
        if (Number(parsed.version) === 2 && parsed.sections && typeof parsed.sections === 'object') {
            const next = emptyDeck();
            next.name = typeof parsed.name === 'string' ? parsed.name : '';
            for (const sec of DECK_SECTIONS) {
                const obj = parsed.sections?.[sec];
                if (!obj || typeof obj !== 'object') continue;
                for (const [k, v] of Object.entries(obj)) {
                    const qty = Number(v);
                    if (!Number.isFinite(qty)) continue;
                    const n = Math.max(0, Math.min(60, Math.floor(qty)));
                    if (n > 0) next.sections[sec][String(k)] = n;
                }
            }
            deck = next;
        } else {
            // v1 import
            const name = typeof parsed.name === 'string' ? parsed.name : '';
            const cardsObj = parsed.cards && typeof parsed.cards === 'object' ? parsed.cards : {};
            const next = emptyDeck();
            next.name = name;
            for (const [k, v] of Object.entries(cardsObj)) {
                const qty = Number(v);
                if (!Number.isFinite(qty)) continue;
                const n = Math.max(0, Math.min(60, Math.floor(qty)));
                if (n > 0) next.sections.main[String(k)] = n;
            }
            deck = next;
        }

        if (deckNameInput) deckNameInput.value = deck.name || '';
        if (deckNotesInput) deckNotesInput.value = deck.notes || '';
        if (!deckStore.decks) deckStore.decks = {};
        deckStore.decks[activeDeckId] = deck;
        markDeckUpdated();
        saveDeck();
        renderDeck();
        if (selectedCard) renderDetail(selectedCard);
    } catch (e) {
        alert('Import failed: invalid JSON format.');
    }
}
