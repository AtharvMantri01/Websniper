const HIGHLIGHT_CLASS = 'websniper-highlight';
let activeElement: HTMLElement | null = null;
let isActive = true;

// Inject CSS
const style = document.createElement('style');
style.textContent = `
  .websniper-highlight {
    outline: 2px solid red !important;
    outline-offset: -2px !important;
    background-color: rgba(255, 0, 0, 0.1) !important;
    cursor: crosshair !important;
  }
  body.websniper-active, body.websniper-active * {
    cursor: crosshair !important;
  }
`;
document.head.appendChild(style);
document.body.classList.add('websniper-active');

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
  if (element.id !== '') {
    return `//*[@id="${element.id}"]`;
  }
  if (element === document.body) {
    return element.tagName.toLowerCase();
  }
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
  if (target === activeElement) return;

  if (activeElement) {
    activeElement.classList.remove(HIGHLIGHT_CLASS);
  }

  activeElement = target;
  activeElement.classList.add(HIGHLIGHT_CLASS);
}

function handleClick(e: MouseEvent) {
  if (!isActive) return;
  e.preventDefault();
  e.stopPropagation();

  const target = e.target as HTMLElement;
  if (activeElement) {
    activeElement.classList.remove(HIGHLIGHT_CLASS);
  }

  const selector = getCssSelector(target);
  const xpath = getXPath(target);
  const innerText = target.innerText || '';

  // Re-add class for continuous usage or remove if you want single shot.
  // We'll keep it active for continuous sniping!
  activeElement = target;
  activeElement.classList.add(HIGHLIGHT_CLASS);

  chrome.runtime.sendMessage({
    type: 'SNIPER_SHOT',
    data: {
      selector,
      xpath,
      innerText: innerText.trim()
    }
  });
}

document.addEventListener('mousemove', handleMouseMove, true);
document.addEventListener('click', handleClick, true);

chrome.runtime.onMessage.addListener((request) => {
  if (request.type === 'DEACTIVATE_SNIPER') {
    isActive = false;
    document.body.classList.remove('websniper-active');
    if (activeElement) {
      activeElement.classList.remove(HIGHLIGHT_CLASS);
    }
    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('click', handleClick, true);
  }
});
