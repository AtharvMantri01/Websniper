const HIGHLIGHT_CLASS = 'websniper-highlight';
let activeElement: HTMLElement | null = null;
let isActive = false;

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

function handleMouseMove(e: MouseEvent) {
  if (!isActive) return;
  const target = e.target as HTMLElement;
  if (target === activeElement || !target || target === document.body) return;

  if (activeElement) activeElement.classList.remove(HIGHLIGHT_CLASS);
  activeElement = target;
  activeElement.classList.add(HIGHLIGHT_CLASS);
}

function handleClick(e: MouseEvent) {
  if (!isActive) return;
  e.preventDefault();
  e.stopPropagation();

  const target = e.target as HTMLElement;
  const selector = getCssSelector(target);
  const xpath = getXPath(target);
  const innerText = target.innerText || '';

  chrome.runtime.sendMessage({
    type: 'SNIPER_SHOT',
    data: { selector, xpath, innerText: innerText.trim().substring(0, 500) }
  });
}

// Initialization
injectStyles();
document.addEventListener('mousemove', handleMouseMove, true);
document.addEventListener('click', handleClick, true);

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
    if (activeElement) activeElement.classList.remove(HIGHLIGHT_CLASS);
    sendResponse({ status: 'deactivated' });
  } else if (request.type === 'PING') {
    sendResponse({ status: 'pong' });
  }
  return true;
});
