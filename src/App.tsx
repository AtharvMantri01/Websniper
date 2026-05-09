import { useState, useEffect } from 'react';
import { Target, Copy, CheckCircle, Code2, Trash2, Settings, Home, Loader2, Play, Terminal, Zap, Shield, Save, ChevronDown } from 'lucide-react';
import './App.css';

interface SniperShot {
  id: string;
  selector: string;
  xpath: string;
  innerText: string;
  command?: string;
  generatedCode?: string;
  isGenerating?: boolean;
  error?: string;
  taskName?: string;
  executionResult?: {
    isRunning?: boolean;
    success?: boolean;
    output?: string;
    error?: string;
  };
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
  const [shots, setShots] = useState<SniperShot[]>([]);
  const [savedTasks, setSavedTasks] = useState<SavedTask[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<string | null>(null);

  // Settings State
  const [provider, setProvider] = useState<Provider>('openai');
  const [apiKey, setApiKey] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [customModel, setCustomModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isModelsLoading, setIsModelsLoading] = useState(false);

  useEffect(() => {
    // Load settings and tasks from storage
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['provider', 'apiKey', 'model', 'customModel', 'savedTasks'], (result) => {
        if (result.provider) setProvider(result.provider as Provider);
        if (result.apiKey) setApiKey(result.apiKey as string);
        if (result.model) setModel(result.model as string);
        if (result.customModel) setCustomModel(result.customModel as string);
        if (result.savedTasks) setSavedTasks(result.savedTasks as SavedTask[]);
      });
    }

    // Inject content script into active tab
    chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id) {
        chrome.scripting?.executeScript({
          target: { tabId: activeTab.id },
          files: ['content.js']
        }).catch(err => console.log('Script injection error:', err));
      }
    });

    const messageListener = (request: any) => {
      if (request.type === 'SNIPER_SHOT') {
        const newShot: SniperShot = {
          id: Math.random().toString(36).substr(2, 9),
          ...request.data,
          command: '',
          taskName: ''
        };
        setShots(prev => [newShot, ...prev]);
      }
    };
    
    chrome.runtime?.onMessage.addListener(messageListener);
    return () => chrome.runtime?.onMessage.removeListener(messageListener);
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

  const copyToClipboard = (text: string, index: number | string, type: 'json' | 'code') => {
    navigator.clipboard.writeText(text);
    if (type === 'json') {
      setCopiedIndex(index as number);
      setTimeout(() => setCopiedIndex(null), 2000);
    } else {
      setCopiedCodeIndex(index as string);
      setTimeout(() => setCopiedCodeIndex(null), 2000);
    }
  };

  const generateAPI = async (shot: SniperShot) => {
    const activeModel = (provider === 'openrouter' && model === 'custom') ? customModel : model;
    
    if (!apiKey) return alert("Please configure your API Key in Settings.");
    if (!shot.command?.trim()) return alert("Please enter a command.");
    if (!activeModel) return alert("Please select a model in Settings.");

    setShots(prev => prev.map(s => s.id === shot.id ? { ...s, isGenerating: true, error: undefined, generatedCode: undefined } : s));

    const systemPrompt = `You are an expert Python Playwright engineer. Return ONLY a valid Python code snippet using the synchronous Playwright API (sync_playwright). Do not include any markdown formatting like \`\`\`python wrappers or explanations. Just the raw code.
Assume the browser and page are already initialized. Just write the code to interact with the element as requested.

Context:
Selector: ${shot.selector}
XPath: ${shot.xpath}
Inner Text: ${shot.innerText.substring(0, 200)}
`;

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
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: activeModel,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: `Command: ${shot.command}` }]
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
            model: activeModel,
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: 'user', content: `Command: ${shot.command}` }]
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
            contents: [{ parts: [{ text: `${systemPrompt}\n\nCommand: ${shot.command}` }] }]
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        code = data.candidates[0].content.parts[0].text;
      }

      code = code.replace(/^```python\n?/, '').replace(/```$/, '').trim();
      setShots(prev => prev.map(s => s.id === shot.id ? { ...s, isGenerating: false, generatedCode: code } : s));
    } catch (err: any) {
      setShots(prev => prev.map(s => s.id === shot.id ? { ...s, isGenerating: false, error: err.message || "Failed to generate script" } : s));
    }
  };

  const runSavedTask = async (task: SavedTask) => {
    if (!task.code) return;
    setSavedTasks(prev => prev.map(t => t.id === task.id ? { ...t, executionResult: { isRunning: true } } : t));
    try {
      const res = await fetch('http://localhost:8000/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: task.code })
      });
      const result = await res.json();
      setSavedTasks(prev => prev.map(t => t.id === task.id ? { ...t, executionResult: { isRunning: false, success: result.success, output: result.output, error: result.error } } : t));
    } catch (err) {
      setSavedTasks(prev => prev.map(t => t.id === task.id ? { ...t, executionResult: { isRunning: false, success: false, error: "Failed to connect to engine. Is it running on port 8000?" } } : t));
    }
  };

  const runLive = async (shot: SniperShot) => {
    if (!shot.generatedCode) return;
    setShots(prev => prev.map(s => s.id === shot.id ? { ...s, executionResult: { isRunning: true } } : s));
    try {
      const res = await fetch('http://localhost:8000/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: shot.generatedCode })
      });
      const result = await res.json();
      setShots(prev => prev.map(s => s.id === shot.id ? { ...s, executionResult: { isRunning: false, success: result.success, output: result.output, error: result.error } } : s));
    } catch (err) {
      setShots(prev => prev.map(s => s.id === shot.id ? { ...s, executionResult: { isRunning: false, success: false, error: "Failed to connect to engine. Is it running on port 8000?" } } : s));
    }
  };

  const saveTaskToArmory = (shot: SniperShot) => {
    if (!shot.generatedCode || !shot.taskName?.trim()) return alert("Task name required.");
    chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
      const newTask: SavedTask = { id: Math.random().toString(36).substr(2, 9), name: shot.taskName!.trim(), url: tabs[0]?.url || 'Unknown', code: shot.generatedCode! };
      const updated = [newTask, ...savedTasks];
      setSavedTasks(updated);
      chrome.storage.local.set({ savedTasks: updated }, () => updateShotTaskName(shot.id, ''));
    });
  };

  const updateShotCommand = (id: string, command: string) => setShots(prev => prev.map(s => s.id === id ? { ...s, command } : s));
  const updateShotTaskName = (id: string, taskName: string) => setShots(prev => prev.map(s => s.id === id ? { ...s, taskName } : s));
  const clearShots = () => setShots([]);
  const deleteSavedTask = (id: string) => {
    const updated = savedTasks.filter(t => t.id !== id);
    setSavedTasks(updated);
    chrome.storage.local.set({ savedTasks: updated });
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
        <p className="subtitle">Aim, Click, Capture.</p>
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
                          <button className="copy-btn" onClick={() => copyToClipboard(task.code, task.id, 'code')}>{copiedCodeIndex === task.id ? <CheckCircle size={14} /> : <Copy size={14} />}</button>
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
              <span className="badge"><span className="dot"></span> Active</span>
              {shots.length > 0 && <button className="clear-btn" onClick={clearShots}><Trash2 size={16} /></button>}
            </div>
            {shots.length === 0 ? <div className="empty-state"><Code2 size={48} className="empty-icon" /><p>Capture elements to begin.</p></div> : (
              <div className="shots-list">
                {shots.map((shot, idx) => (
                  <div key={shot.id} className="shot-card fade-in">
                    <div className="shot-header">
                      <span className="shot-title">Shot #{shots.length - idx}</span>
                      <button className="copy-btn" onClick={() => copyToClipboard(JSON.stringify({ selector: shot.selector, xpath: shot.xpath, innerText: shot.innerText }, null, 2), idx, 'json')}>{copiedIndex === idx ? <CheckCircle size={16} /> : <Copy size={16} />}</button>
                    </div>
                    <div className="shot-body">
                      <pre className="json-display"><code><span className="json-key">"selector"</span>: <span className="json-string">"{shot.selector}"</span>,<br/><span className="json-key">"xpath"</span>: <span className="json-string">"{shot.xpath}"</span>,<br/><span className="json-key">"innerText"</span>: <span className="json-string">"{shot.innerText.slice(0, 50)}..."</span></code></pre>
                      <div className="ai-section">
                        <div className="command-input-group">
                          <input type="text" className="text-input command-input" placeholder="Command..." value={shot.command} onChange={(e) => updateShotCommand(shot.id, e.target.value)} />
                          <button className="btn-primary icon-btn" onClick={() => generateAPI(shot)} disabled={shot.isGenerating}>{shot.isGenerating ? <Loader2 size={16} className="spin" /> : <Play size={16} />}</button>
                        </div>
                        {shot.error && <div className="error-message">{shot.error}</div>}
                        {shot.generatedCode && (
                          <div className="code-result fade-in">
                            <div className="code-header"><span>Python</span><div className="code-actions">
                              <button className="run-btn" onClick={() => runLive(shot)} disabled={shot.executionResult?.isRunning}>{shot.executionResult?.isRunning ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}Run Live</button>
                              <button className="copy-btn" onClick={() => copyToClipboard(shot.generatedCode!, shot.id, 'code')}>{copiedCodeIndex === shot.id ? <CheckCircle size={14} /> : <Copy size={14} />}</button>
                            </div></div>
                            <pre className="python-display"><code>{shot.generatedCode}</code></pre>
                            <div className="save-task-section">
                               <input type="text" className="text-input save-task-input" placeholder="Task Name" value={shot.taskName} onChange={(e) => updateShotTaskName(shot.id, e.target.value)} />
                               <button className="save-btn" onClick={() => saveTaskToArmory(shot)}><Save size={14} />Save</button>
                            </div>
                          </div>
                        )}
                        {shot.executionResult && !shot.executionResult.isRunning && (
                          <div className={`terminal-output fade-in ${shot.executionResult.success ? 'success' : 'error'}`}>
                            <div className="terminal-header"><Terminal size={14} /><span>Output</span><span className={`status-badge ${shot.executionResult.success ? 'status-success' : 'status-error'}`}>{shot.executionResult.success ? 'Success' : 'Failed'}</span></div>
                            <pre className="terminal-body"><code>{shot.executionResult.success ? shot.executionResult.output : shot.executionResult.error}</code></pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
