import { useState, useEffect } from 'react';
import { Target, Copy, CheckCircle, Code2, Trash2, Settings, Home, Loader2, Play, Terminal, Zap, Shield, Save, ChevronDown, X, MousePointerClick, Type, FileOutput } from 'lucide-react';
import './App.css';

interface ActionStep {
  id: string;
  action: 'click' | 'type' | 'extract';
  selector: string;
  xpath: string;
  innerText: string;
  contextText?: string;
  typeValue?: string;
  timestamp: number;
}

interface SavedTask {
  id: string;
  name: string;
  url: string;
  code: string;
  executionResult?: {
    isRunning?: boolean;
    success?: boolean;
    output?: string;
    error?: string;
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

  // Action Sequence state
  const [actionSequence, setActionSequence] = useState<ActionStep[]>([]);
  const [workflowCommand, setWorkflowCommand] = useState<string>('');
  const [workflowCode, setWorkflowCode] = useState<string | undefined>();
  const [workflowGenerating, setWorkflowGenerating] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | undefined>();
  const [workflowTaskName, setWorkflowTaskName] = useState('');
  const [workflowResult, setWorkflowResult] = useState<{ isRunning?: boolean; success?: boolean; output?: string; error?: string } | undefined>();

  // Settings State
  const [provider, setProvider] = useState<Provider>('openai');
  const [apiKey, setApiKey] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [customModel, setCustomModel] = useState<string>('');
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
      chrome.storage.local.get(['provider', 'apiKey', 'model', 'customModel', 'savedTasks'], (result) => {
        if (result.provider) setProvider(result.provider as Provider);
        if (result.apiKey) setApiKey(result.apiKey as string);
        if (result.model) setModel(result.model as string);
        if (result.customModel) setCustomModel(result.customModel as string);
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
      chrome.storage.local.set({ provider, apiKey, model, customModel });
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

    const stepsDescription = actionSequence.map((s, i) => {
      let desc = `Step ${i + 1}: [${s.action.toUpperCase()}] selector="${s.selector}" xpath="${s.xpath}" elementText="${s.innerText.slice(0, 100)}"`;
      if (s.action === 'type' && s.typeValue) desc += ` typeValue="${s.typeValue}"`;
      if (s.contextText) desc += ` context="${s.contextText.slice(0, 300)}"`;
      return desc;
    }).join('\n');

    const systemPrompt = `You are an expert Python Playwright automation engineer. Return ONLY raw Python code. No markdown, no \`\`\`python, no explanations.

ENVIRONMENT:
- A variable called 'page' is already available. It is a Playwright Page object that has already navigated to the target URL.
- Do NOT call sync_playwright(), do NOT launch a browser, do NOT call page.goto(). These are already done for you.
- Just write the interaction/extraction code.

You will receive an ACTION SEQUENCE — an ordered list of steps the user recorded on a web page.
Generate a single Python script that executes ALL steps in sequential order.

ACTION TYPES:
- "click": Click the element. Use page.locator(selector).click(timeout=10000)
- "type": Click the element then type text into it. Use page.locator(selector).fill(value, timeout=10000)
- "extract": Extract text content from the element. Use page.locator(selector).text_content(timeout=10000) and print() the result.

MANDATORY RULES — VIOLATION MEANS BROKEN CODE:
1. Before EVERY interaction, wait for the element: page.wait_for_selector(selector, timeout=15000)
2. Between EVERY step, add: page.wait_for_timeout(1000)
3. After any click that may trigger navigation or page changes, add: page.wait_for_load_state("domcontentloaded")
4. Always add timeout=10000 to .click(), .fill(), .text_content() calls.
5. Always print extracted data to stdout.
6. Wrap the entire script in a try/except with meaningful error messages that identify which step failed.
7. Use the CSS selector as primary. If the CSS selector looks too generic, use xpath= prefix with the XPath instead.
8. ONLY use these Playwright locator methods: page.locator(css_or_xpath_selector).
9. NEVER guess HTML tag names. NEVER use locators like "p:has-text(...)" or "div:has-text(...)".

ACTION SEQUENCE:
${stepsDescription}

${workflowCommand ? `USER INSTRUCTION: ${workflowCommand}` : ''}`;

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

  const runWorkflowLive = async () => {
    if (!workflowCode) return;
    setWorkflowResult({ isRunning: true });
    chrome.tabs?.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      const url = tab?.url || '';
      try {
        const res = await fetch('http://127.0.0.1:8000/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: workflowCode, url })
        });
        const result = await res.json();
        setWorkflowResult({ isRunning: false, success: result.success, output: result.output, error: result.error });
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
      setSavedTasks(prev => prev.map(t => t.id === task.id ? { ...t, executionResult: { isRunning: false, success: result.success, output: result.output, error: result.error } } : t));
    } catch {
      setSavedTasks(prev => prev.map(t => t.id === task.id ? { ...t, executionResult: { isRunning: false, success: false, error: "Failed to connect to engine. Is it running on port 8000?" } } : t));
    }
  };

  const saveWorkflowToArmory = () => {
    if (!workflowCode || !workflowTaskName.trim()) return alert("Task name required.");
    chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
      const newTask: SavedTask = { id: Math.random().toString(36).substr(2, 9), name: workflowTaskName.trim(), url: tabs[0]?.url || 'Unknown', code: workflowCode };
      const updated = [newTask, ...savedTasks];
      setSavedTasks(updated);
      chrome.storage.local.set({ savedTasks: updated }, () => setWorkflowTaskName(''));
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
    return <FileOutput size={12} />;
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
          </div>
        )}

        {activeTab === 'armory' && (
          <div className="armory-panel fade-in">
            <h2 className="panel-title">The Armory</h2>
            {savedTasks.length === 0 ? <div className="empty-state"><Shield size={48} className="empty-icon" /><p>No tasks saved yet.</p></div> : (
              <div className="shots-list">
                {savedTasks.map(task => (
                  <div key={task.id} className="shot-card fade-in">
                    <div className="shot-header"><span className="shot-title">{task.name}</span><button className="clear-btn" onClick={() => deleteSavedTask(task.id)}><Trash2 size={16} /></button></div>
                    <div className="shot-body">
                      <div className="task-url"><span className="json-key">URL:</span> <span className="json-string">{task.url}</span></div>
                      <div className="code-result">
                        <div className="code-header"><span>Playwright Python</span><div className="code-actions">
                          <button className="run-btn" onClick={() => runSavedTask(task)} disabled={task.executionResult?.isRunning}>{task.executionResult?.isRunning ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}Run Now</button>
                          <button className="copy-btn" onClick={() => copyToClipboard(task.code, task.id)}>{copiedCodeIndex === task.id ? <CheckCircle size={14} /> : <Copy size={14} />}</button>
                        </div></div>
                      </div>
                      {task.executionResult && !task.executionResult.isRunning && (
                        <div className={`terminal-output fade-in ${task.executionResult.success ? 'success' : 'error'}`}>
                          <div className="terminal-header"><Terminal size={14} /><span>Output</span><span className={`status-badge ${task.executionResult.success ? 'status-success' : 'status-error'}`}>{task.executionResult.success ? 'Success' : 'Failed'}</span></div>
                          <pre className="terminal-body"><code>{task.executionResult.success ? task.executionResult.output : task.executionResult.error}</code></pre>
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
              </div>
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

                  {workflowError && <div className="error-message">{workflowError}</div>}

                  {workflowCode && (
                    <div className="code-result fade-in">
                      <div className="code-header"><span>Playwright Python ({actionSequence.length} steps)</span><div className="code-actions">
                        <button className="run-btn" onClick={runWorkflowLive} disabled={workflowResult?.isRunning}>{workflowResult?.isRunning ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}Run Live</button>
                        <button className="copy-btn" onClick={() => copyToClipboard(workflowCode, 'workflow')}>{copiedCodeIndex === 'workflow' ? <CheckCircle size={14} /> : <Copy size={14} />}</button>
                      </div></div>
                      <pre className="python-display"><code>{workflowCode}</code></pre>
                      <div className="save-task-section">
                        <input type="text" className="text-input save-task-input" placeholder="Task Name" value={workflowTaskName} onChange={(e) => setWorkflowTaskName(e.target.value)} />
                        <button className="save-btn" onClick={saveWorkflowToArmory}><Save size={14} />Save</button>
                      </div>
                    </div>
                  )}

                  {workflowResult && !workflowResult.isRunning && (
                    <div className={`terminal-output fade-in ${workflowResult.success ? 'success' : 'error'}`}>
                      <div className="terminal-header"><Terminal size={14} /><span>Output</span><span className={`status-badge ${workflowResult.success ? 'status-success' : 'status-error'}`}>{workflowResult.success ? 'Success' : 'Failed'}</span></div>
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
