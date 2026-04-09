import { auth } from './config.js';
import { signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { dbGet, dbSet } from './db.js';
import { STATE } from './state.js';
import { showScreen, showToast } from './ui.js';

const tg = window.Telegram?.WebApp;

export async function initAuth() {
  showScreen('loading');

  // Get UID from URL or localStorage
  const urlParams = new URLSearchParams(window.location.search);
  const urlUid = urlParams.get('uid');

  if (urlUid) {
    STATE.uid = urlUid;
    localStorage.setItem('notefy_uid', urlUid);
    window.history.replaceState({}, document.title, window.location.pathname);
  } else {
    STATE.uid = localStorage.getItem('notefy_uid');
  }

  if (!STATE.uid) {
    showScreen('error');
    return;
  }

  // Anonymous Firebase Auth
  try {
    const cred = await signInAnonymously(auth);
    STATE.firebaseAuthUid = cred.user.uid;
  } catch (e) {
    console.error('Auth error:', e);
    showScreen('error');
    return;
  }

  // Load settings (terms URL etc)
  const settings = await dbGet('settings', 'general');
  if (settings?.termsUrl) STATE.termsUrl = settings.termsUrl;

  // Check user in Firestore
  try {
    const user = await dbGet('users', STATE.uid);

    if (user) {
      STATE.user = user;
      if (user.consentGiven) {
        const { initMain } = await import('./app.js');
        initMain();
      } else {
        showConsentScreen();
      }
    } else {
      await showRegisterScreen();
    }
  } catch (e) {
    console.error('User load error:', e);
    showScreen('error');
  }
}

async function showRegisterScreen() {
  // Load user_links — bot saves phone + firstName here
  const link = await dbGet('user_links', STATE.uid);

  // Prefill phone
  if (link?.phone) {
    const phone = String(link.phone).startsWith('+') ? link.phone : '+' + link.phone;
    document.getElementById('reg-phone').value = phone;
    STATE._phone = phone;
  }

  // Prefill name: first from user_links (set by bot), fallback to Telegram initData
  const tgUser = tg?.initDataUnsafe?.user;
  const firstName = link?.firstName || tgUser?.first_name || '';
  if (firstName) {
    document.getElementById('reg-name').value = firstName;
  }

  showScreen('register');

  // Focus name input
  setTimeout(() => {
    const nameInput = document.getElementById('reg-name');
    if (nameInput && !nameInput.value) nameInput.focus();
  }, 400);
}

export async function submitRegistration() {
  const nameInput = document.getElementById('reg-name');
  const btn = document.getElementById('reg-submit');
  const name = nameInput?.value.trim() || '';

  if (!name) {
    shakeElement('reg-name');
    showToast('Введите ваше имя');
    return;
  }

  // Disable button safely
  if (btn) { btn.disabled = true; btn.textContent = 'Сохранение...'; }

  try {
    console.log('[Register] uid:', STATE.uid, 'authUid:', STATE.firebaseAuthUid);

    if (!STATE.uid) throw new Error('UID не определён');
    if (!STATE.firebaseAuthUid) throw new Error('Firebase Auth не готов');

    const tgUser = tg?.initDataUnsafe?.user;
    const userData = {
      uid: STATE.uid,
      firebaseAuthUid: STATE.firebaseAuthUid,
      name,
      phone: STATE._phone || '',
      tgId: tgUser?.id?.toString() || '',
      tgUsername: tgUser?.username || '',
      consentGiven: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    console.log('[Register] Saving user:', userData);
    await dbSet('users', STATE.uid, userData);
    STATE.user = userData;

    console.log('[Register] Success → consent screen');
    showConsentScreen();
  } catch (e) {
    console.error('[Register] Error:', e?.code, e?.message, e);
    const msg = e?.code === 'permission-denied'
      ? 'Нет доступа. Обратитесь к администратору.'
      : `Ошибка: ${e?.message || 'попробуйте снова'}`;
    showToast(msg, 4000);
    if (btn) { btn.disabled = false; btn.textContent = 'Продолжить →'; }
  }
}

function showConsentScreen() {
  // Set terms link
  const termsLink = document.getElementById('terms-link');
  if (STATE.termsUrl) {
    termsLink.href = STATE.termsUrl;
  } else {
    termsLink.href = 'privacy.html';
  }

  // Reset checkboxes
  setConsentState('agree-terms', false);
  setConsentState('agree-privacy', false);
  updateConsentBtn();

  showScreen('consent');
}

export function toggleConsent(key) {
  const box = document.getElementById('checkbox-' + key);
  const isChecked = box.classList.contains('checked');
  setConsentState(key, !isChecked);
  updateConsentBtn();
}

function setConsentState(key, checked) {
  const box = document.getElementById('checkbox-' + key);
  if (checked) box.classList.add('checked');
  else box.classList.remove('checked');
}

function updateConsentBtn() {
  const allChecked =
    document.getElementById('checkbox-agree-terms').classList.contains('checked') &&
    document.getElementById('checkbox-agree-privacy').classList.contains('checked');

  const btn = document.getElementById('consent-submit');
  btn.disabled = !allChecked;
  btn.style.opacity = allChecked ? '1' : '0.5';
}

export async function submitConsent() {
  const btn = document.getElementById('consent-submit');
  if (btn.disabled) return;

  btn.disabled = true;
  btn.textContent = 'Сохранение...';

  try {
    await dbSet('users', STATE.uid, {
      consentGiven: true,
      consentAt: new Date().toISOString(),
    });
    STATE.user.consentGiven = true;

    const { initMain } = await import('./app.js');
    initMain();
  } catch (e) {
    console.error('Consent error:', e);
    showToast('Ошибка. Попробуйте снова.');
    btn.disabled = false;
    btn.textContent = 'Принять и продолжить';
  }
}

function shakeElement(id) {
  const el = document.getElementById(id);
  el?.classList.add('shake');
  setTimeout(() => el?.classList.remove('shake'), 500);
}
