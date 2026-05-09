const HIGHLIGHT_CLASS = 'websniper-highlight';
const ACTION_MENU_ID = 'websniper-action-menu';
let activeElement: HTMLElement | null = null;
let isActive = false;
let isGhostMode = false;
let pendingTarget: {
  element: HTMLElement;
  selector: string;
  xpath: string;
  innerText: string;
  contextText: string;
} | null = null;

// Function to inject styles safely
function injectStyles() {
  if (document.getElementById('websniper-styles')) return;
  const style = document.createElement('style');
  style.id = 'websniper-styles';
  style.textContent = `
    .websniper-highlight {
      outline: 2px solid #ef4444 !important;
      outline-offset: -2px !important;
      background-color: rgba(239, 68, 68, 0.1) !important;
      transition: outline 0.1s ease-in-out !important;
      pointer-events: auto !important;
    }
    body.websniper-active, body.websniper-active * {
      cursor: crosshair !important;
    }
    #${ACTION_MENU_ID} {
      position: fixed;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 6px;
      background: #1e293b;
      border: 1px solid #475569;
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
      animation: wsMenuIn 0.15s ease-out;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      min-width: 150px;
    }
    #${ACTION_MENU_ID} * {
      cursor: default !important;
    }
    @keyframes wsMenuIn {
      from { opacity: 0; transform: scale(0.9) translateY(-4px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    #${ACTION_MENU_ID} .ws-menu-title {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #94a3b8;
      padding: 4px 8px 6px;
      border-bottom: 1px solid #334155;
      margin-bottom: 2px;
    }
    #${ACTION_MENU_ID} button.ws-action-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #e2e8f0;
      font-size: 13px;
      font-weight: 500;
      font-family: inherit;
      transition: background 0.12s, color 0.12s;
      white-space: nowrap;
    }
    #${ACTION_MENU_ID} button.ws-action-btn:hover {
      background: #334155;
      color: #fff;
    }
    #${ACTION_MENU_ID} button.ws-action-btn .ws-action-icon {
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      flex-shrink: 0;
    }
    #${ACTION_MENU_ID} button.ws-action-btn .ws-action-icon.click-icon {
      background: rgba(59, 130, 246, 0.2);
      color: #60a5fa;
    }
    #${ACTION_MENU_ID} button.ws-action-btn .ws-action-icon.type-icon {
      background: rgba(245, 158, 11, 0.2);
      color: #fbbf24;
    }
    #${ACTION_MENU_ID} button.ws-action-btn .ws-action-icon.extract-icon {
      background: rgba(16, 185, 129, 0.2);
      color: #10b981;
    }
    #${ACTION_MENU_ID} .ws-menu-close {
      position: absolute;
      top: 4px;
      right: 6px;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: #64748b;
      font-size: 14px;
      cursor: pointer !important;
      transition: background 0.15s, color 0.15s;
      font-family: inherit;
      line-height: 1;
    }
    #${ACTION_MENU_ID} .ws-menu-close:hover {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function getCssSelector(el: Element): string {
  if (el.tagName.toLowerCase() == "html") return "html";
  let str = el.tagName.toLowerCase();
  str += (el.id != "") ? "#" + el.id : "";
  if (el.className && typeof el.className === 'string') {
    const classes = el.className.split(/\s+/).filter(c => c !== '' && c !== HIGHLIGHT_CLASS);
    for (let i = 0; i < classes.length; i++) {
      str += "." + classes[i];
    }
  }
  return str;
}

function getXPath(element: Element | null): string {
  if (!element || element.nodeType !== 1) return '';
  if (element.id !== '') return `//*[@id="${element.id}"]`;
  if (element === document.body) return 'body';
  
  let ix = 0;
  const siblings = element.parentNode?.childNodes;
  if (siblings) {
    for (let i = 0; i < siblings.length; i++) {
      const sibling = siblings[i];
      if (sibling === element) {
        return getXPath(element.parentNode as Element) + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
      }
      if (sibling.nodeType === 1 && (sibling as Element).tagName === element.tagName) {
        ix++;
      }
    }
  }
  return '';
}

function dismissMenuDOM() {
  const existing = document.getElementById(ACTION_MENU_ID);
  if (existing) existing.remove();
}

function removeActionMenu() {
  dismissMenuDOM();
  pendingTarget = null;
}

function selectAction(action: 'click' | 'type' | 'extract') {
  if (!pendingTarget) return;

  let typeValue: string | undefined;
  if (action === 'type') {
    const result = window.prompt('Enter text to type:');
    if (result === null) {
      // User cancelled the prompt
      removeActionMenu();
      return;
    }
    typeValue = result;
  }

  chrome.runtime.sendMessage({
    type: 'SNIPER_ACTION',
    data: {
      action,
      selector: pendingTarget.selector,
      xpath: pendingTarget.xpath,
      innerText: pendingTarget.innerText.trim(),
      contextText: pendingTarget.contextText.trim().substring(0, 2000),
      ...(typeValue !== undefined ? { typeValue } : {})
    }
  });

  removeActionMenu();
}

function showActionMenu(x: number, y: number) {
  dismissMenuDOM(); // only remove old menu DOM, preserve pendingTarget set by handleClick

  const menu = document.createElement('div');
  menu.id = ACTION_MENU_ID;

  // Prevent the menu itself from triggering sniper events (bubble phase so child buttons fire first)
  menu.addEventListener('mousemove', (e) => e.stopPropagation());
  menu.addEventListener('click', (e) => e.stopPropagation());

  // Title
  const title = document.createElement('div');
  title.className = 'ws-menu-title';
  title.textContent = 'Select Action';
  menu.appendChild(title);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'ws-menu-close';
  closeBtn.innerHTML = '×';
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); removeActionMenu(); });
  menu.appendChild(closeBtn);

  // Actions
  const actions: { key: 'click' | 'type' | 'extract'; label: string; iconClass: string; icon: string }[] = [
    { key: 'click', label: 'Click', iconClass: 'click-icon', icon: '↗' },
    { key: 'type', label: 'Type Text', iconClass: 'type-icon', icon: 'T' },
    { key: 'extract', label: 'Extract', iconClass: 'extract-icon', icon: '⤓' },
  ];

  for (const a of actions) {
    const btn = document.createElement('button');
    btn.className = 'ws-action-btn';
    btn.innerHTML = `<span class="ws-action-icon ${a.iconClass}">${a.icon}</span>${a.label}`;
    btn.addEventListener('click', (e) => { e.stopPropagation(); selectAction(a.key); });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);

  // Position: clamp to viewport
  const rect = menu.getBoundingClientRect();
  const clampedX = Math.min(x + 8, window.innerWidth - rect.width - 8);
  const clampedY = Math.min(y + 8, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(4, clampedX)}px`;
  menu.style.top = `${Math.max(4, clampedY)}px`;
}

function handleMouseMove(e: MouseEvent) {
  if (!isActive || isGhostMode) return;
  // Don't highlight if hovering over the action menu
  const menu = document.getElementById(ACTION_MENU_ID);
  if (menu && (menu === e.target || menu.contains(e.target as Node))) return;

  const target = e.target as HTMLElement;
  if (target === activeElement || !target || target === document.body) return;

  if (activeElement) activeElement.classList.remove(HIGHLIGHT_CLASS);
  activeElement = target;
  activeElement.classList.add(HIGHLIGHT_CLASS);
}

function handleClick(e: MouseEvent) {
  if (!isActive || isGhostMode) return;

  // If clicking inside the action menu, let it handle itself
  const menu = document.getElementById(ACTION_MENU_ID);
  if (menu && (menu === e.target || menu.contains(e.target as Node))) return;

  e.preventDefault();
  e.stopPropagation();

  const target = e.target as HTMLElement;
  const selector = getCssSelector(target);
  const xpath = getXPath(target);
  const innerText = target.innerText || '';
  const contextText = target.parentElement?.innerText || innerText;

  pendingTarget = { element: target, selector, xpath, innerText, contextText };
  showActionMenu(e.clientX, e.clientY);
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    removeActionMenu();
  }
  // Alt+S toggles Ghost Mode
  if (e.altKey && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    isGhostMode = !isGhostMode;
    if (isGhostMode) {
      // Entering Ghost Mode: remove all visual indicators
      document.body.classList.remove('websniper-active');
      if (activeElement) activeElement.classList.remove(HIGHLIGHT_CLASS);
      activeElement = null;
      removeActionMenu();
    } else {
      // Leaving Ghost Mode: restore targeting visuals
      if (isActive) document.body.classList.add('websniper-active');
    }
    chrome.runtime.sendMessage({ type: 'SNIPER_GHOST_MODE', data: { ghost: isGhostMode } });
  }
}

// Initialization
injectStyles();
document.addEventListener('mousemove', handleMouseMove, true);
document.addEventListener('click', handleClick, true);
document.addEventListener('keydown', handleKeyDown, true);

// Notify side panel that we are ready
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' });

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'ACTIVATE_SNIPER') {
    isActive = true;
    injectStyles(); // Ensure styles are there
    document.body.classList.add('websniper-active');
    sendResponse({ status: 'activated' });
  } else if (request.type === 'DEACTIVATE_SNIPER') {
    isActive = false;
    document.body.classList.remove('websniper-active');
    removeActionMenu();
    if (activeElement) activeElement.classList.remove(HIGHLIGHT_CLASS);
    sendResponse({ status: 'deactivated' });
  } else if (request.type === 'PING') {
    sendResponse({ status: 'pong' });
  }
  return true;
});
