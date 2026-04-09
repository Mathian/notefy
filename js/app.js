import { initAuth, submitRegistration, toggleConsent, submitConsent } from './auth.js';
import { STATE } from './state.js';
import { showScreen, showToast, closeContextMenu } from './ui.js';
import {
  startNotesListener, renderNotes, openNoteEditor, closeNoteEditor,
  scheduleNoteSave, toggleNotePin, showColorPicker, closeColorPicker,
  setNoteColor, deleteCurrentNote, showNoteOptions
} from './notes.js';
import {
  startTasksListener, renderTasks, filterTasks, openTaskEditor,
  closeTaskModal, selectPriority, saveTask, toggleTask, openTaskById
} from './tasks.js';
import { dbGet, dbSet } from './db.js';

const tg = window.Telegram?.WebApp;

// ── Entry point ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (tg) {
    tg.ready();
    tg.expand();
    // Apply Telegram color scheme
    document.documentElement.style.setProperty('--safe-bottom',
      tg.safeAreaInset?.bottom ? tg.safeAreaInset.bottom + 'px' : 'env(safe-area-inset-bottom, 0px)');
  }

  initAuth();

  // Note editor auto-save
  document.getElementById('note-title-input')?.addEventListener('input', scheduleNoteSave);
  document.getElementById('note-content-input')?.addEventListener('input', scheduleNoteSave);

  // Auto-grow textarea
  const ta = document.getElementById('note-content-input');
  if (ta) {
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    });
  }
});

// ── Main app init (called after successful auth) ───────────────────────────
export function initMain() {
  showScreen('main');
  switchTab('notes');
  loadProfileData();

  // Start real-time listeners
  startNotesListener();
  startTasksListener();

  // Set Telegram MainButton (optional)
  if (tg?.MainButton) {
    tg.MainButton.hide();
  }
}

// ── Tab switching ──────────────────────────────────────────────────────────
export function switchTab(tab) {
  STATE.currentTab = tab;

  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById('tab-' + tab)?.classList.add('active');
  document.getElementById('nav-' + tab)?.classList.add('active');

  // Haptic feedback
  tg?.HapticFeedback?.selectionChanged();

  // Hide/show search bar when switching
  if (tab !== 'notes') {
    closeSearch();
  }
}

// ── FAB ────────────────────────────────────────────────────────────────────
export function handleFab() {
  tg?.HapticFeedback?.impactOccurred('light');
  if (STATE.currentTab === 'notes') {
    openNoteEditor(null);
  } else if (STATE.currentTab === 'tasks') {
    openTaskEditor(null);
  }
}

// ── Search ─────────────────────────────────────────────────────────────────
let searchOpen = false;

export function toggleSearch() {
  searchOpen = !searchOpen;
  const bar = document.getElementById('search-bar');
  bar?.classList.toggle('open', searchOpen);
  if (searchOpen) {
    setTimeout(() => document.getElementById('search-input')?.focus(), 200);
  } else {
    STATE.searchQuery = '';
    document.getElementById('search-input').value = '';
    renderNotes('');
  }
}

function closeSearch() {
  searchOpen = false;
  document.getElementById('search-bar')?.classList.remove('open');
  STATE.searchQuery = '';
  const input = document.getElementById('search-input');
  if (input) input.value = '';
}

export function searchNotes(query) {
  STATE.searchQuery = query;
  renderNotes(query);
}

// ── Profile ────────────────────────────────────────────────────────────────
async function loadProfileData() {
  const user = STATE.user;
  if (!user) return;

  const initial = (user.name || '?')[0].toUpperCase();
  const avatarEl = document.getElementById('profile-avatar');
  const nameEl = document.getElementById('profile-name');
  const phoneEl = document.getElementById('profile-phone');
  const subEl = document.getElementById('settings-name-sub');

  if (avatarEl) avatarEl.textContent = initial;
  if (nameEl) nameEl.textContent = user.name || 'Пользователь';
  if (phoneEl) phoneEl.textContent = user.phone || '';
  if (subEl) subEl.textContent = user.name || '';

  // Add TG username if available
  if (user.tgUsername) {
    const ph = document.getElementById('profile-phone');
    if (ph) ph.textContent = `${user.phone} · @${user.tgUsername}`;
  }
}

export function openEditName() {
  const input = document.getElementById('new-name-input');
  if (input) input.value = STATE.user?.name || '';
  const { openModal } = window._ui || {};
  document.getElementById('name-modal-overlay')?.classList.add('open');
  document.getElementById('name-modal-sheet')?.classList.add('open');
  setTimeout(() => input?.focus(), 300);
}

export function closeEditName() {
  document.getElementById('name-modal-overlay')?.classList.remove('open');
  document.getElementById('name-modal-sheet')?.classList.remove('open');
}

export async function saveName() {
  const name = document.getElementById('new-name-input')?.value.trim();
  if (!name) { showToast('Введите имя'); return; }

  const btn = document.querySelector('#name-modal-sheet .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Сохранение...'; }

  try {
    await dbSet('users', STATE.uid, { name, updatedAt: new Date().toISOString() });
    STATE.user.name = name;
    closeEditName();
    loadProfileData();
    showToast('Имя обновлено ✅');
  } catch (e) {
    showToast('Ошибка сохранения');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Сохранить'; }
  }
}

export function openTerms() {
  const url = STATE.termsUrl || 'privacy.html';
  if (tg) tg.openLink(url);
  else window.open(url, '_blank');
}

export function openPrivacy() {
  const url = 'privacy.html';
  if (tg) tg.openLink(window.location.origin + '/' + url);
  else window.open(url, '_blank');
}

// ── updateTopBar (also defined inline in HTML for pre-module use) ─────────
export function updateTopBar(tab) {
  const el = document.getElementById('top-bar-actions');
  if (!el) return;
  if (tab === 'notes') {
    el.innerHTML = `<button class="icon-btn-top" onclick="toggleSearch()">🔍</button>`;
  } else {
    el.innerHTML = '';
  }
  const fab = document.getElementById('fab-btn');
  if (fab) fab.style.display = tab === 'profile' ? 'none' : 'flex';
}

// ── Expose all functions to window (for inline onclick) ───────────────────
Object.assign(window, {
  // Auth
  submitRegistration,
  toggleConsent,
  submitConsent,
  // App
  switchTab,
  handleFab,
  toggleSearch,
  searchNotes,
  openEditName,
  closeEditName,
  saveName,
  openTerms,
  openPrivacy,
  // Notes
  openNote: (id) => {
    const note = STATE.notes.find(n => n.id === id);
    if (note) openNoteEditor(note);
  },
  closeNoteEditor,
  toggleNotePin,
  showColorPicker,
  closeColorPicker,
  setNoteColor,
  deleteCurrentNote,
  showNoteOptions,
  // Tasks
  filterTasks,
  closeTaskModal,
  selectPriority,
  saveTask,
  toggleTaskCheck: toggleTask,
  openTaskById,
  // Context menu
  closeContextMenu,
  // Top bar
  updateTopBar,
});
