// ============================================
// Notification Window Script
// ============================================

let notificationData = null;
let windowId = null;
let autoCloseTimer = null;

// Мапінг типів нотифікацій на emoji
const TYPE_EMOJI_MAP = {
  'ead36165-7815-45d1-9805-1faa47de504a': '✍️', // Visa
  '337065ba-e6e6-4086-b493-0f6de115bc7a': '🔔', // Reminder
  '7e1bf266-2e6b-49a5-982b-4ae407f3ae26': '⚙️', // System
  '8ebcc160-7a78-444b-8904-0a78348a5141': '📧', // Email
  'ae6c7636-32fd-4548-91a7-1784a28e7f9e': '⭐', // Custom
  'fa41b6a0-eafd-4bb9-a913-aa74000b46f6': '💬'  // ESN
};

const TYPE_NAME_MAP = {
  'ead36165-7815-45d1-9805-1faa47de504a': 'Visa',
  '337065ba-e6e6-4086-b493-0f6de115bc7a': 'Reminder',
  '7e1bf266-2e6b-49a5-982b-4ae407f3ae26': 'System',
  '8ebcc160-7a78-444b-8904-0a78348a5141': 'Email',
  'ae6c7636-32fd-4548-91a7-1784a28e7f9e': 'Custom',
  'fa41b6a0-eafd-4bb9-a913-aa74000b46f6': 'ESN'
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Notification Window] DOM loaded');

  // Отримуємо ID вікна
  chrome.windows.getCurrent((window) => {
    windowId = window.id;
    console.log('[Notification Window] Window ID:', windowId);

    // Запитуємо дані у background
    requestNotificationData();
  });

  // Слухаємо повідомлення від background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'notification-data') {
      console.log('[Notification Window] Received data:', message.data);
      notificationData = message.data;
      renderNotification();
      sendResponse({ success: true });
      return true;
    }
  });

  // Setup event listeners
  setupEventListeners();
});

// ============================================
// REQUEST DATA
// ============================================

function requestNotificationData() {
  // Даємо час background script відправити дані
  setTimeout(() => {
    if (!notificationData) {
      console.warn('[Notification Window] No data received, closing...');
      window.close();
    }
  }, 2000);
}

// ============================================
// RENDER NOTIFICATION
// ============================================

function renderNotification() {
  if (!notificationData) return;

  const {
    title,
    message,
    typeId,
    priority,
    createdOn,
    isVisa,
    autoClose
  } = notificationData;

  // Title - повний заголовок
  document.getElementById('notifTitle').textContent = title || 'Notification';

  // Message - один рядок з ellipsis (автоматично через CSS)
  document.getElementById('notifMessage').textContent = message || '';

  // Type emoji + name
  const typeEmoji = TYPE_EMOJI_MAP[typeId] || '⭐';
  const typeName = TYPE_NAME_MAP[typeId] || 'Custom';

  document.getElementById('typeEmoji').textContent = typeEmoji;
  document.getElementById('typeName').textContent = typeName;

  // Time
  const timeEl = document.getElementById('notifTime');
  if (createdOn) {
    timeEl.textContent = formatTime(createdOn);
  }

  // Visa section
  if (isVisa) {
    document.getElementById('visaSection').style.display = 'block';
    document.getElementById('visaBtn').style.display = 'flex';
    document.getElementById('doneBtn').style.display = 'none';
  } else {
    document.getElementById('visaSection').style.display = 'none';
    document.getElementById('visaBtn').style.display = 'none';
    document.getElementById('doneBtn').style.display = 'flex';
  }

  // Auto-close timer
  if (autoClose > 0) {
    startAutoCloseTimer(autoClose);
  }

  // Авто-розмір вікна під контент
  adjustWindowSize();
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
  // Body click - відкрити URL і позначити як прочитане
  document.getElementById('notifBody').addEventListener('click', (e) => {
    // Перевіряємо чи клік не на visa select або кнопках
    if (e.target.closest('.visa-section')) {
      return; // Не відкриваємо URL при кліку на visa розділ
    }
    handleAction('click');
  });

  // Delete button - видалити і відмінити повтори
  document.getElementById('deleteBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    handleAction('delete');
  });

  // Done button - закрити і відмінити повтори
  document.getElementById('doneBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    handleAction('done');
  });

  // Visa submit button
  document.getElementById('visaBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    handleVisaSubmit();
  });
}

// ============================================
// ACTIONS
// ============================================

function handleAction(action) {
  if (!notificationData) return;
  
  console.log('[Notification Window] Action:', action);
  
  // Відправляємо повідомлення в background
  chrome.runtime.sendMessage({
    type: 'notification-action',
    windowId: windowId,
    action: action,
    data: notificationData
  }).then(() => {
    window.close();
  }).catch(err => {
    console.error('[Notification Window] Failed to send action:', err);
    window.close();
  });
}

function handleVisaSubmit() {
  const select = document.getElementById('visaSelect');
  const decision = select.value;
  
  if (!decision) {
    // Highlight select якщо не обрано
    select.style.borderColor = '#dc2626';
    select.focus();
    setTimeout(() => {
      select.style.borderColor = '#f59e0b';
    }, 1000);
    return;
  }
  
  console.log('[Notification Window] Visa decision:', decision);
  
  // Відправляємо повідомлення в background
  chrome.runtime.sendMessage({
    type: 'notification-action',
    windowId: windowId,
    action: 'visa',
    data: {
      ...notificationData,
      decision: decision
    }
  }).then(() => {
    window.close();
  }).catch(err => {
    console.error('[Notification Window] Failed to send visa decision:', err);
    window.close();
  });
}

// ============================================
// AUTO-CLOSE TIMER
// ============================================

function startAutoCloseTimer(seconds) {
  const timerBar = document.getElementById('timerBar');
  timerBar.style.animation = `timer-countdown ${seconds}s linear`;
  
  autoCloseTimer = setTimeout(() => {
    console.log('[Notification Window] Auto-closing...');
    window.close();
  }, seconds * 1000);
}

// ============================================
// HELPERS
// ============================================

function formatTime(isoString) {
  if (!isoString) return '';

  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'щойно';
  if (diffMins < 60) return `${diffMins}хв тому`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}год тому`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'вчора';
  return `${diffDays}д тому`;
}

// Авто-розмір вікна під контент
function adjustWindowSize() {
  // Отримуємо розміри контенту
  const container = document.getElementById('notifContainer');
  const body = document.getElementById('notifBody');

  if (!container || !body) return;

  // Затримка щоб контент встиг відрендеритись
  setTimeout(() => {
    const contentHeight = container.scrollHeight;
    const contentWidth = Math.max(350, Math.min(500, body.scrollWidth + 32));

    // Оновлюємо розмір вікна
    chrome.windows.getCurrent((win) => {
      chrome.windows.update(win.id, {
        width: Math.ceil(contentWidth),
        height: Math.ceil(contentHeight + 50) // +50 для запасу
      }).catch(err => {
        console.log('[Notification Window] Could not resize:', err);
      });
    });
  }, 100);
}
