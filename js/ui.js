let toastTimer = null;
let currentScreen = 'loading';

export function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) {
    el.classList.add('active');
    currentScreen = name;
  }
}

export function showToast(msg, duration = 2500) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

export function openModal(overlayId, sheetId) {
  document.getElementById(overlayId)?.classList.add('open');
  document.getElementById(sheetId)?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeModal(overlayId, sheetId) {
  document.getElementById(overlayId)?.classList.remove('open');
  document.getElementById(sheetId)?.classList.remove('open');
  document.body.style.overflow = '';
}

export function openFullModal(id) {
  document.getElementById(id)?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeFullModal(id) {
  document.getElementById(id)?.classList.remove('open');
  document.body.style.overflow = '';
}

export function showContextMenu(x, y, items) {
  const menu = document.getElementById('context-menu');
  const overlay = document.getElementById('ctx-overlay');
  if (!menu) return;

  menu.innerHTML = items.map((item, i) => {
    if (item.divider) return `<div class="context-divider"></div>`;
    return `<div class="context-item ${item.danger ? 'danger' : ''}" onclick="window.__ctxAction(${i})">${item.icon ? item.icon + ' ' : ''}${item.label}</div>`;
  }).join('');

  window.__ctxAction = (i) => {
    closeContextMenu();
    items[i].action?.();
  };

  // Position the menu
  const menuW = 180;
  const menuH = items.length * 44;
  let left = Math.min(x, window.innerWidth - menuW - 16);
  let top = Math.min(y, window.innerHeight - menuH - 16);

  menu.style.left = left + 'px';
  menu.style.top = top + 'px';

  overlay.classList.add('open');
  menu.classList.add('open');
}

export function closeContextMenu() {
  document.getElementById('context-menu')?.classList.remove('open');
  document.getElementById('ctx-overlay')?.classList.remove('open');
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  const days = Math.floor(diff / 86400000);

  if (days === 0) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return 'Вчера';
  } else if (days < 7) {
    return d.toLocaleDateString('ru-RU', { weekday: 'short' });
  } else {
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }
}

export function formatDueDate(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.floor((d - now) / 86400000);

  if (diff < 0) return { text: 'Просрочено', overdue: true };
  if (diff === 0) return { text: 'Сегодня', overdue: false };
  if (diff === 1) return { text: 'Завтра', overdue: false };
  return {
    text: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
    overdue: false
  };
}
