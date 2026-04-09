import { dbSet, dbDelete, dbListen, newDocRef } from './db.js';
import { STATE } from './state.js';
import { showToast, openFullModal, closeFullModal, openModal, closeModal, showContextMenu, formatDate } from './ui.js';

let currentNoteId = null;
let currentNoteColor = 'default';
let currentNotePinned = false;
let isNewNote = false;
let saveDebounceTimer = null;

// ── Real-time listener ─────────────────────────────────────────────────────
export function startNotesListener() {
  if (STATE.notesListener) STATE.notesListener();
  STATE.notesListener = dbListen('notes', STATE.uid, (notes) => {
    STATE.notes = notes.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
    renderNotes(STATE.searchQuery);
    updateProfileStats();
  });
}

// ── Render ─────────────────────────────────────────────────────────────────
export function renderNotes(query = '') {
  const q = query.toLowerCase();
  const filtered = q
    ? STATE.notes.filter(n =>
        (n.title || '').toLowerCase().includes(q) ||
        (n.content || '').toLowerCase().includes(q)
      )
    : STATE.notes;

  const pinned = filtered.filter(n => n.pinned);
  const regular = filtered.filter(n => !n.pinned);

  const pinnedSection = document.getElementById('pinned-section');
  const notesSection = document.getElementById('notes-section');

  if (!pinnedSection || !notesSection) return;

  if (filtered.length === 0) {
    pinnedSection.innerHTML = '';
    notesSection.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <div class="empty-title">${q ? 'Ничего не найдено' : 'Нет заметок'}</div>
        <div class="empty-subtitle">${q ? 'Попробуйте другой запрос' : 'Нажмите + чтобы создать первую заметку'}</div>
      </div>`;
    return;
  }

  if (pinned.length > 0) {
    pinnedSection.innerHTML = `
      <div class="notes-section-label">📌 Закреплённые</div>
      <div class="notes-grid">${pinned.map((n, i) => noteCard(n, i)).join('')}</div>`;
  } else {
    pinnedSection.innerHTML = '';
  }

  if (regular.length > 0) {
    notesSection.innerHTML = `
      ${pinned.length > 0 ? '<div class="notes-section-label">Остальные</div>' : ''}
      <div class="notes-grid">${regular.map((n, i) => noteCard(n, i + pinned.length)).join('')}</div>`;
  } else {
    notesSection.innerHTML = '';
  }

  // Attach long-press handlers
  document.querySelectorAll('.note-card').forEach(card => {
    addLongPress(card, () => {
      const id = card.dataset.id;
      const note = STATE.notes.find(n => n.id === id);
      if (!note) return;
      const rect = card.getBoundingClientRect();
      showContextMenu(rect.left + rect.width / 2, rect.top + rect.height / 2, [
        { icon: '✏️', label: 'Редактировать', action: () => openNoteEditor(note) },
        { icon: note.pinned ? '📌' : '📌', label: note.pinned ? 'Открепить' : 'Закрепить', action: () => togglePin(note) },
        { divider: true },
        { icon: '🗑️', label: 'Удалить', danger: true, action: () => deleteNote(id) },
      ]);
    });
  });
}

function noteCard(note, index) {
  const preview = (note.content || '').replace(/\n/g, ' ').trim();
  const date = formatDate(note.updatedAt || note.createdAt);
  return `
    <div class="note-card color-${note.color || 'default'}"
         data-id="${note.id}"
         onclick="window.openNote('${note.id}')"
         style="animation-delay:${index * 40}ms">
      ${note.pinned ? '<div class="note-pin">📌</div>' : ''}
      ${note.title ? `<div class="note-card-title">${escHtml(note.title)}</div>` : ''}
      ${preview ? `<div class="note-card-content">${escHtml(preview)}</div>` : ''}
      <div class="note-card-date">${date}</div>
    </div>`;
}

// ── Open / Close Editor ────────────────────────────────────────────────────
export function openNoteEditor(note) {
  if (note) {
    currentNoteId = note.id;
    currentNoteColor = note.color || 'default';
    currentNotePinned = note.pinned || false;
    isNewNote = false;
    document.getElementById('note-title-input').value = note.title || '';
    document.getElementById('note-content-input').value = note.content || '';
    updateNotePinBtn();
    updateNoteEditorBg();
    const date = note.updatedAt ? `Изменено: ${formatDate(note.updatedAt)}` : '';
    document.getElementById('note-editor-date').textContent = date;
  } else {
    const ref = newDocRef('notes');
    currentNoteId = ref.id;
    currentNoteColor = 'default';
    currentNotePinned = false;
    isNewNote = true;
    document.getElementById('note-title-input').value = '';
    document.getElementById('note-content-input').value = '';
    document.getElementById('note-editor-date').textContent = '';
    updateNotePinBtn();
    updateNoteEditorBg();
  }

  openFullModal('modal-note');

  // Focus content if new
  setTimeout(() => {
    const el = isNewNote
      ? document.getElementById('note-content-input')
      : document.getElementById('note-title-input');
    el?.focus();
  }, 350);
}

export function closeNoteEditor() {
  clearTimeout(saveDebounceTimer);
  saveNoteNow();
  closeFullModal('modal-note');
  setTimeout(() => {
    document.getElementById('note-title-input').value = '';
    document.getElementById('note-content-input').value = '';
  }, 400);
}

// ── Save ───────────────────────────────────────────────────────────────────
export function scheduleNoteSave() {
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(saveNoteNow, 1200);
}

async function saveNoteNow() {
  const title = document.getElementById('note-title-input')?.value.trim() || '';
  const content = document.getElementById('note-content-input')?.value.trim() || '';
  if (!title && !content) return;
  if (!currentNoteId) return;

  const now = new Date().toISOString();
  const data = {
    uid: STATE.uid,
    firebaseAuthUid: STATE.firebaseAuthUid,
    title,
    content,
    color: currentNoteColor,
    pinned: currentNotePinned,
    updatedAt: now,
  };
  if (isNewNote) {
    data.createdAt = now;
    isNewNote = false;
  }

  try {
    await dbSet('notes', currentNoteId, data);
    document.getElementById('note-editor-date').textContent = 'Изменено: только что';
  } catch (e) {
    console.error('Save note error:', e);
  }
}

// ── Pin ────────────────────────────────────────────────────────────────────
export function toggleNotePin() {
  currentNotePinned = !currentNotePinned;
  updateNotePinBtn();
  scheduleNoteSave();
}

async function togglePin(note) {
  await dbSet('notes', note.id, { pinned: !note.pinned });
  showToast(note.pinned ? 'Откреплено' : 'Закреплено 📌');
}

function updateNotePinBtn() {
  const btn = document.getElementById('pin-note-btn');
  if (btn) btn.style.opacity = currentNotePinned ? '1' : '0.4';
}

// ── Color ──────────────────────────────────────────────────────────────────
export function showColorPicker() {
  // Update selected state
  document.querySelectorAll('.color-dot').forEach(d => {
    d.classList.toggle('selected', d.dataset.color === currentNoteColor);
  });
  openModal('color-picker-overlay', 'color-picker-sheet');
}

export function closeColorPicker() {
  closeModal('color-picker-overlay', 'color-picker-sheet');
}

export function setNoteColor(color) {
  currentNoteColor = color;
  updateNoteEditorBg();
  closeColorPicker();
  scheduleNoteSave();
}

function updateNoteEditorBg() {
  const modal = document.getElementById('modal-note');
  if (!modal) return;
  const colorMap = {
    default: '#0e0e0e', amber: '#26200f', green: '#142118',
    blue: '#0f1a26', purple: '#1a142a', rose: '#26101a', teal: '#0f2222'
  };
  modal.style.background = colorMap[currentNoteColor] || colorMap.default;
}

// ── Delete ─────────────────────────────────────────────────────────────────
export function deleteCurrentNote() {
  if (!currentNoteId) return;
  const id = currentNoteId;
  closeNoteEditor();
  setTimeout(() => deleteNote(id), 400);
}

async function deleteNote(id) {
  try {
    await dbDelete('notes', id);
    showToast('Заметка удалена');
  } catch (e) {
    showToast('Ошибка удаления');
  }
}

// ── Show note options ──────────────────────────────────────────────────────
export function showNoteOptions() {
  const note = STATE.notes.find(n => n.id === currentNoteId);
  showContextMenu(window.innerWidth - 20, 80, [
    { icon: '📌', label: currentNotePinned ? 'Открепить' : 'Закрепить', action: toggleNotePin },
    { icon: '🎨', label: 'Цвет', action: showColorPicker },
    { divider: true },
    { icon: '🗑️', label: 'Удалить', danger: true, action: deleteCurrentNote },
  ]);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function addLongPress(el, callback) {
  let timer = null;
  el.addEventListener('touchstart', (e) => {
    timer = setTimeout(() => { callback(); timer = null; }, 500);
  }, { passive: true });
  el.addEventListener('touchend', () => clearTimeout(timer));
  el.addEventListener('touchmove', () => clearTimeout(timer));
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); callback(); });
}

function updateProfileStats() {
  const el = document.getElementById('stat-notes');
  if (el) el.textContent = STATE.notes.length;
}
