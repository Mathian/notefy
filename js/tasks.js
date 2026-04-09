import { dbSet, dbDelete, dbListen, newDocRef } from './db.js';
import { STATE } from './state.js';
import { showToast, openModal, closeModal, showContextMenu, formatDueDate } from './ui.js';

let currentTaskId = null;
let currentPriority = 'medium';
let isNewTask = false;

// ── Real-time listener ─────────────────────────────────────────────────────
export function startTasksListener() {
  if (STATE.tasksListener) STATE.tasksListener();
  STATE.tasksListener = dbListen('tasks', STATE.uid, (tasks) => {
    STATE.tasks = tasks.sort((a, b) => {
      // Active first, then by created date desc
      if (a.status === 'done' && b.status !== 'done') return 1;
      if (a.status !== 'done' && b.status === 'done') return -1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    renderTasks();
    updateProfileStats();
  });
}

// ── Filter ─────────────────────────────────────────────────────────────────
export function filterTasks(filter) {
  STATE.tasksFilter = filter;
  document.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('active', c.dataset.filter === filter);
  });
  renderTasks();
}

// ── Render ─────────────────────────────────────────────────────────────────
export function renderTasks() {
  const list = document.getElementById('tasks-list');
  if (!list) return;

  let tasks = STATE.tasks;
  if (STATE.tasksFilter === 'todo') tasks = tasks.filter(t => t.status !== 'done');
  if (STATE.tasksFilter === 'done') tasks = tasks.filter(t => t.status === 'done');

  if (tasks.length === 0) {
    const msgs = {
      all: 'Создайте первую задачу нажав +',
      todo: 'Нет активных задач 🎉',
      done: 'Пока нет выполненных задач',
    };
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <div class="empty-title">Задач нет</div>
        <div class="empty-subtitle">${msgs[STATE.tasksFilter] || ''}</div>
      </div>`;
    return;
  }

  list.innerHTML = tasks.map((t, i) => taskItem(t, i)).join('');

  // Attach long-press handlers
  document.querySelectorAll('.task-item').forEach(item => {
    addLongPress(item, () => {
      const id = item.dataset.id;
      const task = STATE.tasks.find(t => t.id === id);
      if (!task) return;
      showContextMenu(window.innerWidth / 2, 200, [
        { icon: '✏️', label: 'Редактировать', action: () => openTaskEditor(task) },
        { icon: task.status === 'done' ? '🔄' : '✅', label: task.status === 'done' ? 'Отметить активной' : 'Отметить выполненной', action: () => toggleTask(id, task.status) },
        { divider: true },
        { icon: '🗑️', label: 'Удалить', danger: true, action: () => deleteTask(id) },
      ]);
    });
  });
}

function taskItem(task, index) {
  const isDone = task.status === 'done';
  const due = task.dueDate ? formatDueDate(task.dueDate) : null;
  const pLabel = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };

  return `
    <div class="task-item ${isDone ? 'done' : ''} priority-${task.priority || 'medium'}"
         data-id="${task.id}"
         style="animation-delay:${index * 35}ms">
      <div class="task-priority-bar priority-bar-${task.priority || 'medium'}"></div>
      <div class="task-check ${isDone ? 'checked' : ''}"
           onclick="window.toggleTaskCheck('${task.id}', '${task.status || 'todo'}')"></div>
      <div class="task-body" onclick="window.openTaskById('${task.id}')">
        <div class="task-title">${escHtml(task.title || '')}</div>
        ${task.description ? `<div class="task-desc">${escHtml(task.description)}</div>` : ''}
        <div class="task-meta">
          <div class="task-badge priority-${task.priority || 'medium'}">
            <div class="priority-dot"></div>
            ${pLabel[task.priority] || 'Средний'}
          </div>
          ${due ? `<div class="task-badge ${due.overdue ? 'task-due-overdue' : ''}">
            📅 ${due.text}
          </div>` : ''}
        </div>
      </div>
    </div>`;
}

// ── Open / Close Editor ────────────────────────────────────────────────────
export function openTaskEditor(task) {
  if (task) {
    currentTaskId = task.id;
    currentPriority = task.priority || 'medium';
    isNewTask = false;
    document.getElementById('task-title-input').value = task.title || '';
    document.getElementById('task-desc-input').value = task.description || '';
    document.getElementById('task-due-input').value = task.dueDate || '';
    document.getElementById('task-modal-title').textContent = 'Редактировать задачу';
  } else {
    const ref = newDocRef('tasks');
    currentTaskId = ref.id;
    currentPriority = 'medium';
    isNewTask = true;
    document.getElementById('task-title-input').value = '';
    document.getElementById('task-desc-input').value = '';
    document.getElementById('task-due-input').value = '';
    document.getElementById('task-modal-title').textContent = 'Новая задача';
  }

  updatePriorityBtns();
  openModal('task-modal-overlay', 'task-modal-sheet');

  setTimeout(() => document.getElementById('task-title-input')?.focus(), 300);
}

export function closeTaskModal() {
  closeModal('task-modal-overlay', 'task-modal-sheet');
  setTimeout(() => {
    document.getElementById('task-title-input').value = '';
    document.getElementById('task-desc-input').value = '';
    document.getElementById('task-due-input').value = '';
  }, 400);
}

// ── Priority ───────────────────────────────────────────────────────────────
export function selectPriority(p) {
  currentPriority = p;
  updatePriorityBtns();
}

function updatePriorityBtns() {
  document.querySelectorAll('.priority-btn').forEach(btn => {
    btn.className = 'priority-btn';
    if (btn.dataset.priority === currentPriority) {
      btn.classList.add('active-' + currentPriority);
    }
  });
}

// ── Save ───────────────────────────────────────────────────────────────────
export async function saveTask() {
  const title = document.getElementById('task-title-input').value.trim();
  if (!title) {
    document.getElementById('task-title-input').classList.add('shake');
    setTimeout(() => document.getElementById('task-title-input').classList.remove('shake'), 500);
    showToast('Введите название задачи');
    return;
  }

  const btn = document.querySelector('#task-modal-sheet .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Сохранение...'; }

  const now = new Date().toISOString();
  const data = {
    uid: STATE.uid,
    firebaseAuthUid: STATE.firebaseAuthUid,
    title,
    description: document.getElementById('task-desc-input').value.trim(),
    priority: currentPriority,
    dueDate: document.getElementById('task-due-input').value || null,
    status: 'todo',
    updatedAt: now,
  };

  if (isNewTask) {
    data.createdAt = now;
  } else {
    // Keep existing status when editing
    const existing = STATE.tasks.find(t => t.id === currentTaskId);
    if (existing) data.status = existing.status;
  }

  try {
    await dbSet('tasks', currentTaskId, data);
    closeTaskModal();
    showToast(isNewTask ? 'Задача создана ✅' : 'Задача обновлена');
  } catch (e) {
    console.error('Save task error:', e);
    showToast('Ошибка сохранения');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Сохранить задачу'; }
  }
}

// ── Toggle ─────────────────────────────────────────────────────────────────
export async function toggleTask(id, currentStatus) {
  const newStatus = currentStatus === 'done' ? 'todo' : 'done';
  // Optimistic UI
  const item = document.querySelector(`.task-item[data-id="${id}"]`);
  if (item) {
    const check = item.querySelector('.task-check');
    if (newStatus === 'done') {
      item.classList.add('done');
      check.classList.add('checked');
    } else {
      item.classList.remove('done');
      check.classList.remove('checked');
    }
  }
  try {
    await dbSet('tasks', id, { status: newStatus, updatedAt: new Date().toISOString() });
    if (newStatus === 'done') showToast('Выполнено! 🎉');
  } catch (e) {
    console.error('Toggle task error:', e);
    renderTasks(); // revert on error
  }
}

// ── Delete ─────────────────────────────────────────────────────────────────
async function deleteTask(id) {
  try {
    await dbDelete('tasks', id);
    showToast('Задача удалена');
  } catch (e) {
    showToast('Ошибка удаления');
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function addLongPress(el, callback) {
  let timer = null;
  el.addEventListener('touchstart', () => { timer = setTimeout(() => { callback(); timer = null; }, 500); }, { passive: true });
  el.addEventListener('touchend', () => clearTimeout(timer));
  el.addEventListener('touchmove', () => clearTimeout(timer));
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); callback(); });
}

function updateProfileStats() {
  const done = STATE.tasks.filter(t => t.status === 'done').length;
  const el = document.getElementById('stat-tasks');
  if (el) el.textContent = STATE.tasks.length;
  const elDone = document.getElementById('stat-done');
  if (elDone) elDone.textContent = done;
}

// Public accessor for opening by ID
export function openTaskById(id) {
  const task = STATE.tasks.find(t => t.id === id);
  if (task) openTaskEditor(task);
}
