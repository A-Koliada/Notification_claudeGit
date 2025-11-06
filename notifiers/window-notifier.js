// ============================================
// Window Notifier - Mini-window notifications with repeat support
// ============================================

export class WindowNotifier {
  constructor(onAction) {
    this.onAction = onAction; // callback: (notificationId, action, data) => {}
    this.activeWindows = new Map(); // windowId -> notification data
    this.cascadeOffset = 0;

    // Відстеження повторів для кожної нотифікації
    // notificationId -> { count: number, timerId: number|null, cancelled: boolean }
    this.repeatTracker = new Map();

    this._setupListeners();
  }

  _log(...args) {
    console.log("[WindowNotifier]", ...args);
  }

  _setupListeners() {
    // Слухаємо повідомлення від notification.html
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "notification-action") {
        const { windowId, action, data } = message;
        this._log("Action received:", action, windowId);

        // При будь-якій дії користувача - відміняємо повтори для цієї нотифікації
        if (data && data.id) {
          this._cancelRepeats(data.id);
        }

        this.onAction(windowId, action, data);

        // Закриваємо вікно
        if (windowId) {
          this.close(windowId);
        }

        sendResponse({ success: true });
        return true;
      }
    });

    // Слухаємо закриття вікон
    chrome.windows.onRemoved.addListener((windowId) => {
      if (this.activeWindows.has(windowId)) {
        this._log("Window closed:", windowId);
        this.activeWindows.delete(windowId);
        this._adjustCascade();
      }
    });
  }

  /**
   * Показує Mini-window notification з підтримкою повторів
   * @param {Object} notification - об'єкт нотифікації з БД
   * @param {Object} options - налаштування (autoClose, position, cascade, repeatCount, repeatInterval)
   */
  async show(notification, options = {}) {
    const {
      autoClose = 10,
      position = { right: 20, top: 20 },
      width = 400,
      height = 250,
      cascade = true,
      repeatCount = 3,        // Кількість повторів (0 = без повторів, -1 = нескінченно)
      repeatInterval = 60     // Інтервал повторів в секундах (відповідає bringToFrontInterval)
    } = options;

    const notifId = notification.id || notification.Id;

    // Розрахунок позиції з каскадом
    let top = position.top;
    
    if (cascade) {
      top += this.cascadeOffset;
      this.cascadeOffset += 30; // Зсув для наступного вікна
      
      if (this.cascadeOffset > 300) {
        this.cascadeOffset = 0;
      }
    }

    // Розрахунок left (від правого краю екрану)
    const screenWidth = window.screen.availWidth;
    const left = screenWidth - width - position.right;

    const notificationData = {
      id: notification.id || notification.Id,
      title: notification.title || notification.DnTitle,
      message: notification.message || notification.DnMessage,
      sourceUrl: notification.sourceUrl || notification.DnSourceUrl,
      typeId: notification.typeId || notification.DnNotificationTypeId,
      visaStatusId: notification.visaStatusId || notification.DnVisaStatusId,
      priority: notification.priority || notification.DnPriority || 0,
      createdOn: notification.createdOn || notification.CreatedOn,
      isVisa: this._isVisaType(notification.typeId || notification.DnNotificationTypeId),
      autoClose: autoClose
    };

    try {
      // Перевіряємо чи нотифікація не скасована
      const tracker = this.repeatTracker.get(notifId);
      if (tracker && tracker.cancelled) {
        this._log("Notification was cancelled, skipping:", notifId);
        return;
      }

      const window = await chrome.windows.create({
        url: chrome.runtime.getURL("ui/notification.html"),
        type: "popup",
        width: width,
        height: height,
        left: left,
        top: top,
        focused: false
      });

      this._log("Mini-window created:", window.id);

      // Зберігаємо дані
      this.activeWindows.set(window.id, notificationData);

      // Відправляємо дані у вікно після його створення
      setTimeout(() => {
        chrome.runtime.sendMessage({
          type: "notification-data",
          windowId: window.id,
          data: notificationData
        }).catch(() => {
          // Вікно може бути вже закрите
        });
      }, 100);

      // Встановлюємо повтори якщо потрібно
      this._setupRepeats(notification, options);

    } catch (err) {
      console.error("[WindowNotifier] Failed to create window:", err);
      throw err;
    }
  }

  /**
   * Встановлює повтори для нотифікації
   */
  _setupRepeats(notification, options) {
    const {
      repeatCount = 3,
      repeatInterval = 60
    } = options;

    const notifId = notification.id || notification.Id;

    // Якщо без повторів або вже скасовано
    if (repeatCount === 0) {
      this._log("No repeats configured for:", notifId);
      return;
    }

    // Отримуємо або створюємо tracker
    let tracker = this.repeatTracker.get(notifId);
    if (!tracker) {
      tracker = { count: 0, timerId: null, cancelled: false };
      this.repeatTracker.set(notifId, tracker);
    }

    // Якщо вже скасовано
    if (tracker.cancelled) {
      this._log("Repeats already cancelled for:", notifId);
      return;
    }

    // Збільшуємо лічильник показів
    tracker.count++;

    // Перевіряємо чи потрібні ще повтори
    const needMoreRepeats = repeatCount === -1 || tracker.count < repeatCount;

    if (needMoreRepeats && repeatInterval > 0) {
      // Очищуємо попередній таймер якщо є
      if (tracker.timerId) {
        clearTimeout(tracker.timerId);
      }

      // Встановлюємо новий таймер для наступного показу
      tracker.timerId = setTimeout(() => {
        this._log("Repeating notification:", notifId, "count:", tracker.count);
        this.show(notification, options);
      }, repeatInterval * 1000);

      this._log("Repeat scheduled for:", notifId, "in", repeatInterval, "seconds, count:", tracker.count);
    } else {
      this._log("No more repeats for:", notifId, "final count:", tracker.count);
      // Очищуємо tracker після завершення повторів
      setTimeout(() => {
        this.repeatTracker.delete(notifId);
      }, 60000); // Через хвилину після останнього показу
    }
  }

  /**
   * Відміняє всі повтори для нотифікації
   */
  _cancelRepeats(notifId) {
    const tracker = this.repeatTracker.get(notifId);
    if (tracker) {
      this._log("Cancelling repeats for:", notifId);
      tracker.cancelled = true;

      if (tracker.timerId) {
        clearTimeout(tracker.timerId);
        tracker.timerId = null;
      }

      // Видаляємо через 1 секунду
      setTimeout(() => {
        this.repeatTracker.delete(notifId);
      }, 1000);
    }
  }

  /**
   * Закриває вікно нотифікації
   */
  async close(windowId) {
    try {
      await chrome.windows.remove(windowId);
      this.activeWindows.delete(windowId);
      this._adjustCascade();
    } catch (err) {
      // Вікно вже закрите
    }
  }

  /**
   * Закриває всі активні вікна і скасовує всі повтори
   */
  async closeAll() {
    const windowIds = Array.from(this.activeWindows.keys());
    for (const id of windowIds) {
      await this.close(id);
    }
    this.cascadeOffset = 0;

    // Скасовуємо всі повтори
    for (const [notifId, tracker] of this.repeatTracker.entries()) {
      if (tracker.timerId) {
        clearTimeout(tracker.timerId);
      }
    }
    this.repeatTracker.clear();
  }

  /**
   * Коригує зсув каскаду після закриття вікна
   */
  _adjustCascade() {
    const count = this.activeWindows.size;
    if (count === 0) {
      this.cascadeOffset = 0;
    } else if (this.cascadeOffset > count * 30) {
      this.cascadeOffset = count * 30;
    }
  }

  /**
   * Перевіряє чи це Visa тип
   */
  _isVisaType(typeId) {
    // Visa TypeId з вашого довідника
    return typeId === 'ead36165-7815-45d1-9805-1faa47de504a';
  }
}

export default WindowNotifier;
