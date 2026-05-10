import { useState, useEffect } from 'react';
import { Target, Copy, CheckCircle, Code2, Trash2, Settings, Home, Loader2, Play, Terminal, Zap, Shield, Save, ChevronDown, X, MousePointerClick, Type, FileOutput, CornerDownLeft, RefreshCw, ExternalLink, Rocket } from 'lucide-react';
import './App.css';

interface ActionStep {
  id: string;
  action: 'click' | 'type' | 'extract' | 'press_enter';
  selector: string;
  xpath: string;
  innerText: string;
  contextText?: string;
  typeValue?: string;
  timestamp: number;
}

interface TaskInput {
  name: string;
  defaultValue: string;
}

interface SavedTask {
  id: string;
  name: string;
  url: string;
  code: string;
  inputs?: TaskInput[];
  executionResult?: {
    isRunning?: boolean;
    success?: boolean;
    output?: string;
    error?: string;
    healingAttempt?: number;
    maxAttempts?: number;
    healed?: boolean;
  };
}

type Provider = 'openai' | 'anthropic' | 'google' | 'openrouter';

interface ModelInfo {
  id: string;
  name: string;
}

const POPULAR_OPENROUTER_MODELS = [
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'openai/gpt-4o', name: 'GPT-4o' },
  { id: 'google/gemini-pro-1.5', name: 'Gemini 1.5 Pro' },
  { id: 'meta-llama/llama-3.1-405b', name: 'Llama 3.1 405B' },
  { id: 'mistralai/mistral-large', name: 'Mistral Large' },
  { id: 'custom', name: 'Custom Model ID...' },
];

const ANTHROPIC_MODELS = [
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
  { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
];

function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'settings' | 'armory'>('home');
  const [savedTasks, setSavedTasks] = useState<SavedTask[]>([]);
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<string | null>(null);
  const [expandedApiTaskId, setExpandedApiTaskId] = useState<string | null>(null);

  // Action Sequence state
  const [actionSequence, setActionSequence] = useState<ActionStep[]>([]);
  const [workflowCommand, setWorkflowCommand] = useState<string>('');
  const [jsonSchema, setJsonSchema] = useState<string>('');
  const [workflowCode, setWorkflowCode] = useState<string | undefined>();
  const [workflowGenerating, setWorkflowGenerating] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | undefined>();
  const [workflowTaskName, setWorkflowTaskName] = useState('');
  const [workflowResult, setWorkflowResult] = useState<{ isRunning?: boolean; success?: boolean; output?: string; error?: string; healed?: boolean } | undefined>();

  // Auto-Fix state
  const [autoFixEnabled, setAutoFixEnabled] = useState(true);
  const [healingStatus, setHealingStatus] = useState<{ active: boolean; attempt: number; maxAttempts: number } | undefined>();

  // Ghost Mode state
  const [isGhostMode, setIsGhostMode] = useState(false);

  // Settings State
  const [provider, setProvider] = useState<Provider>('openai');
  const [apiKey, setApiKey] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [customModel, setCustomModel] = useState<string>('');
  const [proxyPool, setProxyPool] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isModelsLoading, setIsModelsLoading] = useState(false);

  const activateSniper = () => {
    chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id) {
        chrome.tabs.sendMessage(activeTab.id, { type: 'ACTIVATE_SNIPER' }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('Content script not ready, refreshing tab might be needed.');
          } else {
            console.log('Sniper activated:', response);
          }
        });
      }
    });
  };

  useEffect(() => {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['provider', 'apiKey', 'model', 'customModel', 'proxyPool', 'savedTasks'], (result) => {
        if (result.provider) setProvider(result.provider as Provider);
        if (result.apiKey) setApiKey(result.apiKey as string);
        if (result.model) setModel(result.model as string);
        if (result.customModel) setCustomModel(result.customModel as string);
        if (result.proxyPool) setProxyPool(result.proxyPool as string);
        if (result.savedTasks) setSavedTasks(result.savedTasks as SavedTask[]);
      });
    }

    setTimeout(activateSniper, 500);

    const messageListener = (request: any) => {
      if (request.type === 'SNIPER_ACTION') {
        const step: ActionStep = {
          id: Math.random().toString(36).substr(2, 9),
          action: request.data.action,
          selector: request.data.selector,
          xpath: request.data.xpath,
          innerText: request.data.innerText || '',
          contextText: request.data.contextText,
          typeValue: request.data.typeValue,
          timestamp: Date.now(),
        };
        setActionSequence(prev => [...prev, step]);
      } else if (request.type === 'SNIPER_GHOST_MODE') {
        setIsGhostMode(request.data.ghost);
      } else if (request.type === 'CONTENT_SCRIPT_READY') {
        activateSniper();
      }
    };

    const tabUpdateListener = (_tabId: any, changeInfo: any, tab: any) => {
      if (changeInfo.status === 'complete' && tab.active) {
        activateSniper();
      }
    };

    chrome.runtime?.onMessage.addListener(messageListener);
    chrome.tabs?.onUpdated.addListener(tabUpdateListener);

    return () => {
      chrome.runtime?.onMessage.removeListener(messageListener);
      chrome.tabs?.onUpdated.removeListener(tabUpdateListener);
    };
  }, []);

  const [engineStatus, setEngineStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');

  const checkEngine = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/');
      if (res.ok || res.status === 404) setEngineStatus('connected');
      else setEngineStatus('disconnected');
    } catch (e) {
      setEngineStatus('disconnected');
    }
  };

  useEffect(() => {
    checkEngine();
    const interval = setInterval(checkEngine, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (apiKey) {
      fetchModels(provider, apiKey);
    } else {
      setAvailableModels([]);
    }
  }, [provider, apiKey]);

  const fetchModels = async (p: Provider, key: string) => {
    if (p === 'anthropic') {
      setAvailableModels(ANTHROPIC_MODELS);
      if (!model || !ANTHROPIC_MODELS.find(m => m.id === model)) {
        setModel(ANTHROPIC_MODELS[0].id);
      }
      return;
    }
    if (p === 'openrouter') {
      setAvailableModels(POPULAR_OPENROUTER_MODELS);
      return;
    }
    setIsModelsLoading(true);
    try {
      let fetchedModels: ModelInfo[] = [];
      if (p === 'openai') {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${key}` }
        });
        const data = await res.json();
        if (data.data) {
          fetchedModels = data.data
            .filter((m: any) => m.id.includes('gpt'))
            .map((m: any) => ({ id: m.id, name: m.id }));
        }
      } else if (p === 'google') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const data = await res.json();
        if (data.models) {
          fetchedModels = data.models
            .filter((m: any) => m.supportedGenerationMethods.includes('generateContent'))
            .map((m: any) => ({ id: m.name.replace('models/', ''), name: m.displayName || m.name }));
        }
      }
      setAvailableModels(fetchedModels);
      if (fetchedModels.length > 0 && (!model || !fetchedModels.find(m => m.id === model))) {
        setModel(fetchedModels[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
    } finally {
      setIsModelsLoading(false);
    }
  };

  const saveSettings = () => {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ provider, apiKey, model, customModel, proxyPool });
    }
  };

  const copyToClipboard = (text: string, index: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeIndex(index);
    setTimeout(() => setCopiedCodeIndex(null), 2000);
  };

  // ---- Workflow API Generation ----
  const generateWorkflowAPI = async () => {
    const activeModel = (provider === 'openrouter' && model === 'custom') ? customModel : model;
    if (!apiKey) return alert("Please configure your API Key in Settings.");
    if (actionSequence.length === 0) return alert("Add at least one action step.");
    if (!activeModel) return alert("Please select a model in Settings.");

    setWorkflowGenerating(true);
    setWorkflowError(undefined);
    setWorkflowCode(undefined);

    const tabs = await new Promise<chrome.tabs.Tab[]>(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
    const activeTab = tabs[0];
    const workflowUrl = activeTab?.url || '';

    const hasProxies = proxyPool.trim().length > 0;
    const proxyList = proxyPool.trim().split('\n').filter(p => p.trim());

    const stepsDescription = actionSequence.map((s, i) => {
      let desc = `Step ${i + 1}: [${s.action.toUpperCase()}] selector="${s.selector}" xpath="${s.xpath}" elementText="${s.innerText.slice(0, 100)}"`;
      if (s.action === 'type' && s.typeValue) desc += ` typeValue="${s.typeValue}"`;
      if (s.contextText) desc += ` context="${s.contextText.slice(0, 300)}"`;
      return desc;
    }).join('\n');

    const systemPrompt = `You are an expert Python Playwright automation engineer. Return ONLY raw Python code. No markdown, no \`\`\`python, no explanations.

ENVIRONMENT:
${hasProxies ? 
`- You are responsible for launching the browser because a Proxy Pool is configured.
- Use 'from playwright.sync_api import sync_playwright' and 'with sync_playwright() as p:'.
- A 'page' variable is NOT provided. You must create it.` 
: 
`- A variable called 'page' is already available. It is a Playwright Page object that has already navigated to the target URL.
- Do NOT call sync_playwright(), do NOT launch a browser, do NOT call page.goto(). These are already done for you.
- Just write the interaction/extraction code.`}

You will receive an ACTION SEQUENCE — an ordered list of steps the user recorded on a web page.
Generate a single Python script that executes ALL steps in sequential order.

MANDATORY PREAMBLE — MUST be the FIRST lines of every script, BEFORE the try block:
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
${hasProxies ? "import random" : ""}

ACTION TYPES:
- "click": Click the element. Use page.locator(selector).click(timeout=10000)
- "type": Type text into the element (see TYPING RULE below for correct method).
- "extract": Extract text content from the element. Use page.locator(selector).text_content(timeout=10000) and print() the result.
- "press_enter": Press the Enter key globally. Use page.keyboard.press('Enter') followed by page.wait_for_timeout(2000).

MANDATORY RULES — VIOLATION MEANS BROKEN CODE:
1. Before EVERY interaction, wait for the element: page.wait_for_selector(selector, timeout=15000)
2. Between EVERY step, add: page.wait_for_timeout(1000)
3. After any click that may trigger navigation or page changes, add: page.wait_for_load_state("domcontentloaded")
4. Always add timeout=10000 to .click(), .fill(), .text_content() calls.
5. Always print extracted data to stdout.
6. Wrap the entire script in a try/except. In the except block, print the error to stderr using print(f"Error: {e}", file=sys.stderr) and then call sys.exit(1) to signal failure to the runner.
7. Use the CSS selector as primary. If the CSS selector looks too generic, use xpath= prefix with the XPath instead.
8. ONLY use these Playwright locator methods: page.locator(css_or_xpath_selector).
9. NEVER guess HTML tag names. NEVER use locators like "p:has-text(...)" or "div:has-text(...)".
10. CRITICAL TYPING RULE: If an action is [TYPE], check the selector tag. If the selector starts with "div", "span", "p", "td", "li", or any non-input element, DO NOT use .fill(). Instead use this exact pattern:
    page.locator(selector).click(timeout=10000)
    page.wait_for_timeout(500)
    page.keyboard.type('the text')
    Only use .fill(value, timeout=10000) when the selector is clearly an input, textarea, or [contenteditable] element.
11. PRESS ENTER RULE: If the action is [PRESS_ENTER], do NOT use any locator or selector. Just call page.keyboard.press('Enter') and then page.wait_for_timeout(2000) to allow backend/API calls to resolve.
12. PARAMETERIZATION RULE: For EVERY [TYPE] action, you MUST define a Python variable at the TOP of the script (before the try block, after the imports) instead of using a hardcoded string. Name the variable descriptively based on the element context (e.g., search_query, username, email_address, password_field). Then use that variable in .fill() or .keyboard.type(). Example:
    search_query = "laptop"
    ...
    page.keyboard.type(search_query)

${hasProxies ? `
PROXY ROTATION RULE:
You MUST pick a random proxy from this list:
${JSON.stringify(proxyList)}

1. Pick a random proxy string from the list.
2. Parse the proxy string (Format: http://username:password@ip:port or http://ip:port).
3. Launch the browser with the proxy:
   proxy_parts = chosen_proxy.replace('http://', '').split('@')
   if len(proxy_parts) == 2:
       auth, server = proxy_parts
       user, pw = auth.split(':')
       browser = p.chromium.launch(headless=True, proxy={'server': 'http://' + server, 'username': user, 'password': pw})
   else:
       browser = p.chromium.launch(headless=True, proxy={'server': chosen_proxy})
4. Create page: 
   context = browser.new_context()
   page = context.new_page()
5. Navigate to target: page.goto("${workflowUrl}", wait_until="domcontentloaded")
6. Wrap the action sequence in the try/except block.
7. Close browser at the VERY end: browser.close()
` : ''}

ACTION SEQUENCE:
${stepsDescription}

${workflowCommand ? `USER INSTRUCTION: ${workflowCommand}` : ''}

${jsonSchema.trim() ? `OUTPUT SCHEMA — MANDATORY:
A JSON Schema has been provided. Your FINAL output step MUST collect all extracted/gathered data and print a single, strictly formatted JSON string matching this schema.
- Import json at the top of the script.
- Use json.dumps(data, ensure_ascii=False, indent=2) to format the output.
- The JSON string MUST be the LAST thing printed to stdout.
- Do NOT print any other text after the JSON output.

SCHEMA:
${jsonSchema.trim()}` : ''}`;

    try {
      let code = '';
      if (provider === 'openai' || provider === 'openrouter') {
        const url = provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
        const headers: any = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
        if (provider === 'openrouter') {
          headers['HTTP-Referer'] = 'https://websniper.extension';
          headers['X-Title'] = 'WebSniper';
        }
        const res = await fetch(url, {
          method: 'POST', headers,
          body: JSON.stringify({
            model: activeModel,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: `Execute the action sequence above.` }]
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message || data.error);
        code = data.choices[0].message.content;
      } else if (provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: activeModel, max_tokens: 2048, system: systemPrompt,
            messages: [{ role: 'user', content: `Execute the action sequence above.` }]
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        code = data.content[0].text;
      } else if (provider === 'google') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemPrompt}\n\nExecute the action sequence above.` }] }]
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        code = data.candidates[0].content.parts[0].text;
      }
      code = code.replace(/^```python\n?/, '').replace(/```$/, '').trim();
      setWorkflowCode(code);
    } catch (err: any) {
      setWorkflowError(err.message || "Failed to generate script");
    } finally {
      setWorkflowGenerating(false);
    }
  };

  // ---- Reusable helpers ----
  const callLLM = async (sysPrompt: string, userMsg: string): Promise<string> => {
    const activeModel = (provider === 'openrouter' && model === 'custom') ? customModel : model;
    if (!apiKey || !activeModel) throw new Error('API key or model not configured');

    let code = '';
    if (provider === 'openai' || provider === 'openrouter') {
      const url = provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
      const headers: any = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
      if (provider === 'openrouter') { headers['HTTP-Referer'] = 'https://websniper.extension'; headers['X-Title'] = 'WebSniper'; }
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ model: activeModel, messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: userMsg }] }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || data.error);
      code = data.choices[0].message.content;
    } else if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: activeModel, max_tokens: 2048, system: sysPrompt, messages: [{ role: 'user', content: userMsg }] }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      code = data.content[0].text;
    } else if (provider === 'google') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: `${sysPrompt}\n\n${userMsg}` }] }] }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      code = data.candidates[0].content.parts[0].text;
    }
    return code.replace(/^```python\n?/, '').replace(/```$/, '').trim();
  };

  const executeCode = async (code: string, url: string): Promise<{ success: boolean; output: string; error: string }> => {
    const res = await fetch('http://127.0.0.1:8000/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, url })
    });
    return await res.json();
  };

  // ---- Auto-Fix Healing Loop ----
  const autoFixRoutine = async (failedCode: string, errorTrace: string, pageUrl: string, savedTaskId?: string) => {
    const maxAttempts = 3;
    let currentCode = failedCode;
    let currentError = errorTrace;

    const healPrompt = `You are a Playwright debugging expert. You are given Python Playwright code that FAILED with an error.
Fix the code so it works. Return ONLY raw Python code. No markdown, no \`\`\`python, no explanations.

ENVIRONMENT: A 'page' variable (Playwright Page) is already available and navigated to the target URL. Do NOT call sync_playwright(), launch a browser, or page.goto().

COMMON FIXES TO APPLY:
- Increase timeouts for slow-loading elements (use 15000-30000ms)
- Add page.wait_for_selector(selector, timeout=15000) before interacting
- Fix selectors that don't match the DOM (try XPath fallback with "xpath=...")
- Handle dynamic/lazy-loaded content with page.wait_for_load_state("networkidle")
- Replace .fill() with .click() + page.keyboard.type() for non-input elements (div, span, etc.)
- Add page.wait_for_timeout(1000-2000) between steps
- Wrap in try/except with meaningful error messages

Do NOT change the overall logic or goal. Only fix what caused the error.`;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (savedTaskId) {
        setSavedTasks(prev => prev.map(t => t.id === savedTaskId ? { ...t, executionResult: { ...t.executionResult, isRunning: true, healingAttempt: attempt, maxAttempts } } : t));
      } else {
        setHealingStatus({ active: true, attempt, maxAttempts });
      }

      try {
        const fixedCode = await callLLM(healPrompt, `FAILED CODE:\n${currentCode}\n\nERROR TRACE:\n${currentError}`);
        const result = await executeCode(fixedCode, pageUrl);

        if (result.success) {
          if (savedTaskId) {
            let updatedTask: SavedTask | null = null;
            setSavedTasks(prev => {
              const task = prev.find(t => t.id === savedTaskId);
              if (!task) return prev;
              updatedTask = { ...task, code: fixedCode, executionResult: { isRunning: false, success: true, output: result.output, healed: true } };
              const updatedTasks = prev.map(t => t.id === savedTaskId ? updatedTask! : t);
              chrome.storage.local.set({ savedTasks: updatedTasks });
              return updatedTasks;
            });
            if (updatedTask) deployTaskToRunner(updatedTask);
          } else {
            setWorkflowCode(fixedCode);
            setWorkflowResult({ isRunning: false, success: true, output: result.output, healed: true });
            setHealingStatus(undefined);
          }
          return;
        } else {
          currentCode = fixedCode;
          currentError = result.error;
        }
      } catch (err: any) {
        currentError = err.message || 'LLM call failed during healing';
      }
    }

    // All attempts failed
    if (savedTaskId) {
      setSavedTasks(prev => prev.map(t => t.id === savedTaskId ? { ...t, executionResult: { isRunning: false, success: false, error: `Auto-Fix failed after ${maxAttempts} attempts.\n\nLast error:\n${currentError}` } } : t));
    } else {
      setHealingStatus(undefined);
      setWorkflowResult({ isRunning: false, success: false, error: `Auto-Fix failed after ${maxAttempts} attempts.\n\nLast error:\n${currentError}` });
    }
  };

  const runWorkflowLive = async () => {
    if (!workflowCode) return;
    setWorkflowResult({ isRunning: true });
    setHealingStatus(undefined);
    chrome.tabs?.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      const url = tab?.url || '';
      try {
        const result = await executeCode(workflowCode, url);
        if (!result.success && autoFixEnabled) {
          setWorkflowResult({ isRunning: true });
          await autoFixRoutine(workflowCode, result.error, url);
        } else {
          setWorkflowResult({ isRunning: false, success: result.success, output: result.output, error: result.error });
        }
      } catch {
        setWorkflowResult({ isRunning: false, success: false, error: "Failed to connect to engine. Is it running on port 8000?" });
      }
    });
  };

  const runSavedTask = async (task: SavedTask) => {
    if (!task.code) return;
    setSavedTasks(prev => prev.map(t => t.id === task.id ? { ...t, executionResult: { isRunning: true } } : t));
    try {
      const res = await fetch('http://127.0.0.1:8000/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: task.code, url: task.url })
      });
      const result = await res.json();
      if (!result.success && autoFixEnabled) {
        await autoFixRoutine(task.code, result.error, task.url, task.id);
      } else {
        setSavedTasks(prev => prev.map(t => t.id === task.id ? { ...t, executionResult: { isRunning: false, success: result.success, output: result.output, error: result.error } } : t));
      }
    } catch {
      setSavedTasks(prev => prev.map(t => t.id === task.id ? { ...t, executionResult: { isRunning: false, success: false, error: "Failed to connect to engine. Is it running on port 8000?" } } : t));
    }
  };

  const saveWorkflowToArmory = () => {
    if (!workflowCode || !workflowTaskName.trim()) return alert("Task name required.");
    chrome.tabs?.query({ active: true, currentWindow: true }, async (tabs) => {
      const taskName = workflowTaskName.trim();
      const taskUrl = tabs[0]?.url || 'Unknown';

      // Extract input parameters from type actions
      const inputs: TaskInput[] = actionSequence
        .filter(s => s.action === 'type' && s.typeValue)
        .map((s, i) => {
          // Create a descriptive variable name from the element context
          const label = (s.innerText || s.contextText || `input_${i + 1}`)
            .slice(0, 30).trim().toLowerCase()
            .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `input_${i + 1}`;
          return { name: label, defaultValue: s.typeValue! };
        });

      const newTask: SavedTask = { id: Math.random().toString(36).substr(2, 9), name: taskName, url: taskUrl, code: workflowCode, inputs };
      const updated = [newTask, ...savedTasks];
      setSavedTasks(updated);
      chrome.storage.local.set({ savedTasks: updated }, () => setWorkflowTaskName(''));

      // Also persist as a physical .py file on the runner
      try {
        await fetch('http://127.0.0.1:8000/tasks/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: taskName, code: workflowCode, url: taskUrl, inputs })
        });
      } catch { /* Runner might be offline, task is still saved in extension storage */ }
    });
  };

  const removeStep = (id: string) => setActionSequence(prev => prev.filter(s => s.id !== id));
  const clearSequence = () => { setActionSequence([]); setWorkflowCode(undefined); setWorkflowError(undefined); setWorkflowResult(undefined); };

  const deleteSavedTask = (id: string) => {
    const updated = savedTasks.filter(t => t.id !== id);
    setSavedTasks(updated);
    chrome.storage.local.set({ savedTasks: updated });
  };

  const actionIcon = (action: string) => {
    if (action === 'click') return <MousePointerClick size={12} />;
    if (action === 'type') return <Type size={12} />;
    if (action === 'press_enter') return <CornerDownLeft size={12} />;
    return <FileOutput size={12} />;
  };

  const sanitizeTaskName = (name: string) => {
    return name.trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'unnamed_task';
  };

  const deployTaskToRunner = async (task: SavedTask) => {
    try {
      await fetch('http://127.0.0.1:8000/tasks/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: task.name, code: task.code, url: task.url, inputs: task.inputs || [] })
      });
    } catch { /* Runner offline */ }
    setExpandedApiTaskId(expandedApiTaskId === task.id ? null : task.id);
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-top">
          <div className="logo"><Target className="icon text-primary" size={24} /><h1>WebSniper</h1></div>
          <div className="tabs">
            <button className={`tab-btn ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}><Home size={18} /></button>
            <button className={`tab-btn ${activeTab === 'armory' ? 'active' : ''}`} onClick={() => setActiveTab('armory')}><Shield size={18} /></button>
            <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}><Settings size={18} /></button>
          </div>
        </div>
        <p className="subtitle">Aim, Click, Automate.</p>
      </header>

      <div className="main-content">
        {activeTab === 'settings' && (
          <div className="settings-panel fade-in">
            <h2 className="panel-title">LLM Configuration</h2>
            <div className="form-group">
              <label>Provider</label>
              <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)} className="select-input">
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google Gemini</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </div>
            <div className="form-group">
              <label>API Key</label>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} onBlur={saveSettings} placeholder="Enter API Key" className="text-input" />
            </div>
            <div className="form-group">
              <label>Model {isModelsLoading && <Loader2 size={12} className="spin inline-loader" />}</label>
              <div className="select-wrapper">
                <select value={model} onChange={(e) => { setModel(e.target.value); setTimeout(saveSettings, 100); }} className="select-input">
                  {availableModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <ChevronDown size={16} className="select-icon" />
              </div>
            </div>
            {provider === 'openrouter' && model === 'custom' && (
              <div className="form-group fade-in">
                <label>Custom Model ID</label>
                <input type="text" value={customModel} onChange={(e) => setCustomModel(e.target.value)} onBlur={saveSettings} placeholder="e.g., meta-llama/llama-3-70b" className="text-input" />
              </div>
            )}
            <button className="btn-primary" onClick={saveSettings}>Save Settings</button>

            <h2 className="panel-title" style={{marginTop: '1.5rem'}}>Proxy Settings</h2>
            <div className="form-group">
              <label>Proxy Pool (One per line)</label>
              <textarea 
                value={proxyPool} 
                onChange={(e) => setProxyPool(e.target.value)} 
                onBlur={saveSettings}
                placeholder="http://user:pass@ip:port" 
                className="text-input" 
                style={{minHeight: '80px', fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.4'}}
              />
              <p className="hint-text" style={{marginTop: '0.25rem', fontSize: '10px', color: 'var(--text-tertiary)'}}>Format: http://username:password@ip:port</p>
            </div>
          </div>
        )}

        {activeTab === 'armory' && (
          <div className="armory-panel fade-in">
            <h2 className="panel-title">The Armory</h2>
            {savedTasks.length === 0 ? <div className="empty-state"><Shield size={48} className="empty-icon" /><p>No tasks saved yet.</p></div> : (
              <div className="shots-list">
                {savedTasks.map(task => (
                  <div key={task.id} className="shot-card fade-in">
                    <div className="shot-header">
                      <span className="shot-title">{task.name}</span>
                      <div style={{display: 'flex', gap: '0.375rem', alignItems: 'center'}}>
                        <button className={`deploy-btn ${expandedApiTaskId === task.id ? 'active' : ''}`} onClick={() => deployTaskToRunner(task)} title="Deploy as API"><Rocket size={12} />API</button>
                        <button className="clear-btn" onClick={() => deleteSavedTask(task.id)}><Trash2 size={16} /></button>
                      </div>
                    </div>
                    <div className="shot-body">
                      <div className="task-url"><span className="json-key">URL:</span> <span className="json-string">{task.url}</span></div>
                      <div className="code-result">
                        <div className="code-header">
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div className="mac-window-controls">
                              <div className="mac-dot close"></div>
                              <div className="mac-dot minimize"></div>
                              <div className="mac-dot expand"></div>
                            </div>
                            <span>Playwright Python</span>
                          </div>
                          <div className="code-actions">
                          <button className="run-btn" onClick={() => runSavedTask(task)} disabled={task.executionResult?.isRunning}>
                            {task.executionResult?.isRunning ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
                            {task.executionResult?.healingAttempt ? `Healing (${task.executionResult.healingAttempt}/${task.executionResult.maxAttempts})...` : task.executionResult?.isRunning ? 'Running...' : 'Run Now'}
                          </button>
                          <button className="copy-btn" onClick={() => copyToClipboard(task.code, task.id)}>{copiedCodeIndex === task.id ? <CheckCircle size={14} /> : <Copy size={14} />}</button>
                        </div></div>
                      </div>
                      {task.executionResult && !task.executionResult.isRunning && (
                        <div className={`terminal-output fade-in ${task.executionResult.success ? 'success' : 'error'}`}>
                          <div className="terminal-header"><Terminal size={14} /><span>Output</span><span className={`status-badge ${task.executionResult.success ? 'status-success' : 'status-error'}`}>{task.executionResult.healed ? 'Success (Healed)' : task.executionResult.success ? 'Success' : 'Failed'}</span></div>
                          <pre className="terminal-body"><code>{task.executionResult.success ? task.executionResult.output : task.executionResult.error}</code></pre>
                        </div>
                      )}
                      {expandedApiTaskId === task.id && (
                        <div className="api-panel fade-in">
                          <div className="api-panel-title"><Rocket size={14} /> API Integration</div>
                          <div className="api-endpoint">
                            <span className="method-badge">POST</span>
                            <span>http://localhost:8000/api/v1/run/{sanitizeTaskName(task.name)}</span>
                          </div>
                          {task.inputs && task.inputs.length > 0 && (
                            <div className="api-inputs-section">
                              <div className="api-inputs-label">Customizable Inputs</div>
                              <div className="api-inputs-list">
                                {task.inputs.map((inp, i) => (
                                  <span key={i} className="api-input-chip">
                                    <span className="chip-name">{inp.name}</span>
                                    <span className="chip-default">= "{inp.defaultValue}"</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="api-curl-block">
                            <div className="api-tip"><Zap size={10} /> Tip: Pass <code>"urls": ["url1", "url2"]</code> instead of <code>url</code> for bulk execution!</div>
                            <pre>{`curl -X POST http://localhost:8000/api/v1/run/${sanitizeTaskName(task.name)} \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ url: task.url, ...(task.inputs && task.inputs.length > 0 ? { inputs: Object.fromEntries(task.inputs.map(inp => [inp.name, inp.defaultValue])) } : {}) })}'`}</pre>
                            <button className="copy-btn" onClick={() => copyToClipboard(`curl -X POST http://localhost:8000/api/v1/run/${sanitizeTaskName(task.name)} -H "Content-Type: application/json" -d '${JSON.stringify({ url: task.url, ...(task.inputs && task.inputs.length > 0 ? { inputs: Object.fromEntries(task.inputs.map(inp => [inp.name, inp.defaultValue])) } : {}) })}'`, `curl-${task.id}`)}>{copiedCodeIndex === `curl-${task.id}` ? <CheckCircle size={14} /> : <Copy size={14} />}</button>
                          </div>
                          <button className="api-docs-link" onClick={() => window.open('http://localhost:8000/docs', '_blank')}><ExternalLink size={12} /> View Interactive API Docs</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'home' && (
          <>
            <div className="controls">
              <div className="status-group">
                <span className="badge"><span className="dot"></span> Active</span>
                <button className="mini-btn" onClick={activateSniper} title="Re-sync Targeting"><Zap size={12} /></button>
                <div className={`engine-badge ${engineStatus}`}>
                  <Terminal size={12} />
                  <span>Engine: {engineStatus}</span>
                </div>
                {proxyPool.trim().length > 0 && (
                  <div className="engine-badge success" style={{background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)'}}>
                    <Shield size={12} />
                    <span>Proxies Active</span>
                  </div>
                )}
              </div>
            </div>

            <div className={`sniper-banner ${isGhostMode ? 'paused' : 'active'}`}>
              {isGhostMode ? '👻 Sniper: PAUSED (Alt+S to Resume)' : '🎯 Sniper: ON (Alt+S to Pause)'}
            </div>

            {actionSequence.length === 0 ? (
              <div className="workflow-empty-hint">
                <Code2 size={48} className="hint-icon" />
                <p>Click elements on the page to build your workflow.<br />Choose <strong>Click</strong>, <strong>Type Text</strong>, or <strong>Extract</strong> for each step.</p>
              </div>
            ) : (
              <>
                <div className="timeline-header">
                  <span className="timeline-title">Action Sequence <span className="step-count">{actionSequence.length}</span></span>
                  <button className="clear-all-btn" onClick={clearSequence}><Trash2 size={12} /> Clear All</button>
                </div>

                <div className="action-timeline">
                  {actionSequence.map((step, idx) => (
                    <div key={step.id} className="timeline-step">
                      <div className="step-header">
                        <span className="step-badge">{idx + 1}</span>
                        <span className={`action-pill ${step.action}`}>
                          {actionIcon(step.action)} {step.action}
                        </span>
                        <button className="step-delete" onClick={() => removeStep(step.id)} title="Remove step"><X size={14} /></button>
                      </div>
                      <div className="step-detail">
                        <span className="selector-label">sel: </span>{step.selector}
                      </div>
                      {step.innerText && (
                        <div className="step-text-preview">"{step.innerText.slice(0, 60)}{step.innerText.length > 60 ? '…' : ''}"</div>
                      )}
                      {step.action === 'type' && step.typeValue && (
                        <div className="step-type-value">
                          <span className="type-label">TYPE:</span> {step.typeValue}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Generate Section */}
                <div className="workflow-generate">
                  <div className="workflow-generate-header"><Play size={14} /> Generate Workflow Script</div>
                  <div className="workflow-command-group">
                    <input type="text" className="text-input workflow-command-input" placeholder="Optional: describe your workflow goal..." value={workflowCommand} onChange={(e) => setWorkflowCommand(e.target.value)} />
                    <button className="btn-generate" onClick={generateWorkflowAPI} disabled={workflowGenerating}>
                      {workflowGenerating ? <Loader2 size={16} className="spin" /> : <Zap size={16} />}
                      Generate
                    </button>
                  </div>
                  <div>
                    <span className="schema-label">Desired JSON Schema (Optional)</span>
                    <textarea className="schema-textarea" placeholder='{&#10;  "product_name": "string",&#10;  "price": "number",&#10;  "in_stock": "boolean"&#10;}' value={jsonSchema} onChange={(e) => setJsonSchema(e.target.value)} />
                  </div>

                  {workflowError && <div className="error-message">{workflowError}</div>}

                  {workflowCode && (
                    <div className="code-result fade-in">
                      <div className="code-header">
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <div className="mac-window-controls">
                            <div className="mac-dot close"></div>
                            <div className="mac-dot minimize"></div>
                            <div className="mac-dot expand"></div>
                          </div>
                          <span>Playwright Python ({actionSequence.length} steps)</span>
                        </div>
                        <div className="code-actions">
                        <label className="autofix-toggle"><input type="checkbox" checked={autoFixEnabled} onChange={(e) => setAutoFixEnabled(e.target.checked)} /><span className="toggle-slider" />Auto-Fix</label>
                        <button className="run-btn" onClick={runWorkflowLive} disabled={workflowResult?.isRunning || healingStatus?.active}>{healingStatus?.active ? <RefreshCw size={14} className="spin" /> : workflowResult?.isRunning ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}Run Live</button>
                        <button className="copy-btn" onClick={() => copyToClipboard(workflowCode, 'workflow')}>{copiedCodeIndex === 'workflow' ? <CheckCircle size={14} /> : <Copy size={14} />}</button>
                      </div></div>
                      <pre className="python-display"><code>{workflowCode}</code></pre>
                      <div className="save-task-section">
                        <input type="text" className="text-input save-task-input" placeholder="Task Name" value={workflowTaskName} onChange={(e) => setWorkflowTaskName(e.target.value)} />
                        <button className="save-btn" onClick={saveWorkflowToArmory}><Save size={14} />Save</button>
                      </div>
                    </div>
                  )}

                  {healingStatus?.active && (
                    <div className="healing-banner fade-in">
                      <RefreshCw size={14} className="spin" />
                      Healing (Attempt {healingStatus.attempt}/{healingStatus.maxAttempts})...
                    </div>
                  )}

                  {workflowResult && !workflowResult.isRunning && !healingStatus?.active && (
                    <div className={`terminal-output fade-in ${workflowResult.success ? 'success' : 'error'}`}>
                      <div className="terminal-header"><Terminal size={14} /><span>Output</span>{workflowResult.healed ? <span className="status-healed">Success (Healed)</span> : <span className={`status-badge ${workflowResult.success ? 'status-success' : 'status-error'}`}>{workflowResult.success ? 'Success' : 'Failed'}</span>}</div>
                      <pre className="terminal-body"><code>{workflowResult.success ? workflowResult.output : workflowResult.error}</code></pre>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
