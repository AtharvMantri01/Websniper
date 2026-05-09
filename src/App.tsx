import { useState, useEffect } from 'react';
import { Target, Copy, CheckCircle, Code2, Trash2, Settings, Home, Loader2, Play, Terminal, Zap, Shield, Save } from 'lucide-react';
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

type Provider = 'openai' | 'anthropic';

function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'settings' | 'armory'>('home');
  const [shots, setShots] = useState<SniperShot[]>([]);
  const [savedTasks, setSavedTasks] = useState<SavedTask[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<string | null>(null);

  // Settings State
  const [provider, setProvider] = useState<Provider>('openai');
  const [apiKey, setApiKey] = useState<string>('');

  useEffect(() => {
    // Load settings and tasks from storage
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['provider', 'apiKey', 'savedTasks'], (result) => {
        if (result.provider) setProvider(result.provider as Provider);
        if (result.apiKey) setApiKey(result.apiKey as string);
        if (result.savedTasks) setSavedTasks(result.savedTasks as SavedTask[]);
      });
    }

    // Inject content script into active tab when side panel opens
    chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id) {
        chrome.scripting?.executeScript({
          target: { tabId: activeTab.id },
          files: ['content.js']
        }).catch(err => console.log('Script injection error or already injected:', err));
      }
    });

    // Listen for incoming shots
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
    
    if (chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(messageListener);
    }

    return () => {
      if (chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(messageListener);
      }
    };
  }, []);

  const saveSettings = () => {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ provider, apiKey });
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

  const clearShots = () => setShots([]);

  const updateShotCommand = (id: string, command: string) => {
    setShots(prev => prev.map(s => s.id === id ? { ...s, command } : s));
  };
  
  const updateShotTaskName = (id: string, taskName: string) => {
    setShots(prev => prev.map(s => s.id === id ? { ...s, taskName } : s));
  };

  const saveTask = (shot: SniperShot) => {
    if (!shot.generatedCode) return;
    if (!shot.taskName || shot.taskName.trim() === '') {
      alert("Please enter a Task Name to save.");
      return;
    }

    chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTabUrl = tabs[0]?.url || 'Unknown URL';
      const newTask: SavedTask = {
        id: Math.random().toString(36).substr(2, 9),
        name: shot.taskName!.trim(),
        url: activeTabUrl,
        code: shot.generatedCode!
      };

      const updatedTasks = [newTask, ...savedTasks];
      setSavedTasks(updatedTasks);

      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ savedTasks: updatedTasks }, () => {
          // Visual feedback can be added here
          updateShotTaskName(shot.id, ''); // clear input
        });
      }
    });
  };

  const deleteSavedTask = (taskId: string) => {
    const updatedTasks = savedTasks.filter(t => t.id !== taskId);
    setSavedTasks(updatedTasks);
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ savedTasks: updatedTasks });
    }
  };

  const runSavedTask = async (task: SavedTask) => {
    setSavedTasks(prev => prev.map(t => t.id === task.id ? { 
      ...t, 
      executionResult: { isRunning: true } 
    } : t));

    try {
      const response = await fetch('http://localhost:8000/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: task.code })
      });
      
      const result = await response.json();
      setSavedTasks(prev => prev.map(t => t.id === task.id ? { 
        ...t, 
        executionResult: { 
          isRunning: false,
          success: result.success,
          output: result.output,
          error: result.error
        } 
      } : t));
    } catch (err: any) {
      setSavedTasks(prev => prev.map(t => t.id === task.id ? { 
        ...t, 
        executionResult: { 
          isRunning: false,
          success: false,
          error: "Failed to connect to execution engine. Is it running on port 8000?"
        } 
      } : t));
    }
  };

  const generateAPI = async (shot: SniperShot) => {
    if (!apiKey) {
      alert("Please configure your API Key in the Settings tab.");
      return;
    }
    if (!shot.command || shot.command.trim() === '') {
      alert("Please enter a command.");
      return;
    }

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
      if (provider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Command: ${shot.command}` }
            ]
          })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        code = data.choices[0].message.content;
      } else {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: 'user', content: `Command: ${shot.command}` }]
          })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        code = data.content[0].text;
      }

      code = code.replace(/^```python\n?/, '').replace(/```$/, '').trim();
      setShots(prev => prev.map(s => s.id === shot.id ? { ...s, isGenerating: false, generatedCode: code } : s));
    } catch (err: any) {
      setShots(prev => prev.map(s => s.id === shot.id ? { ...s, isGenerating: false, error: err.message || "Failed to generate script" } : s));
    }
  };

  const runLive = async (shot: SniperShot) => {
    if (!shot.generatedCode) return;
    
    setShots(prev => prev.map(s => s.id === shot.id ? { 
      ...s, 
      executionResult: { isRunning: true } 
    } : s));

    try {
      const response = await fetch('http://localhost:8000/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: shot.generatedCode })
      });
      
      const result = await response.json();
      setShots(prev => prev.map(s => s.id === shot.id ? { 
        ...s, 
        executionResult: { 
          isRunning: false,
          success: result.success,
          output: result.output,
          error: result.error
        } 
      } : s));
    } catch (err: any) {
      setShots(prev => prev.map(s => s.id === shot.id ? { 
        ...s, 
        executionResult: { 
          isRunning: false,
          success: false,
          error: "Failed to connect to execution engine. Is it running on port 8000?"
        } 
      } : s));
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-top">
          <div className="logo">
            <Target className="icon text-primary" size={24} />
            <h1>WebSniper</h1>
          </div>
          <div className="tabs">
            <button 
              className={`tab-btn ${activeTab === 'home' ? 'active' : ''}`} 
              onClick={() => setActiveTab('home')}
              title="Home"
            >
              <Home size={18} />
            </button>
            <button 
              className={`tab-btn ${activeTab === 'armory' ? 'active' : ''}`} 
              onClick={() => setActiveTab('armory')}
              title="The Armory"
            >
              <Shield size={18} />
            </button>
            <button 
              className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} 
              onClick={() => setActiveTab('settings')}
              title="Settings"
            >
              <Settings size={18} />
            </button>
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
              <select 
                value={provider} 
                onChange={(e) => {
                  setProvider(e.target.value as Provider);
                  setTimeout(saveSettings, 100);
                }}
                className="select-input"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>

            <div className="form-group">
              <label>API Key</label>
              <input 
                type="password" 
                value={apiKey} 
                onChange={(e) => setApiKey(e.target.value)}
                onBlur={saveSettings}
                placeholder={`Enter ${provider === 'openai' ? 'OpenAI' : 'Anthropic'} API Key`}
                className="text-input"
              />
              <p className="help-text">Saved securely to local storage.</p>
            </div>
            
            <button className="btn-primary" onClick={saveSettings}>
              Save Settings
            </button>
          </div>
        )}

        {activeTab === 'armory' && (
          <div className="armory-panel fade-in">
            <h2 className="panel-title">The Armory</h2>
            {savedTasks.length === 0 ? (
              <div className="empty-state">
                <Shield size={48} className="empty-icon" />
                <p>No tasks saved yet. Go to Home to save tasks.</p>
              </div>
            ) : (
              <div className="shots-list">
                {savedTasks.map((task) => (
                  <div key={task.id} className="shot-card fade-in">
                    <div className="shot-header">
                      <span className="shot-title">{task.name}</span>
                      <button 
                        className="clear-btn" 
                        onClick={() => deleteSavedTask(task.id)}
                        title="Delete Task"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="shot-body">
                      <div className="task-url">
                        <span className="json-key">URL:</span> <span className="json-string">{task.url.length > 50 ? task.url.substring(0, 50) + '...' : task.url}</span>
                      </div>
                      
                      <div className="code-result">
                        <div className="code-header">
                          <span>Playwright Python</span>
                          <div className="code-actions">
                            <button 
                              className="run-btn"
                              onClick={() => runSavedTask(task)}
                              disabled={task.executionResult?.isRunning}
                              title="Run Now"
                            >
                              {task.executionResult?.isRunning ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
                              Run Now
                            </button>
                            <button 
                              className="copy-btn" 
                              onClick={() => copyToClipboard(task.code, task.id, 'code')}
                              title="Copy Code"
                            >
                              {copiedCodeIndex === task.id ? <CheckCircle size={14} className="text-success" /> : <Copy size={14} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {task.executionResult && !task.executionResult.isRunning && (
                        <div className={`terminal-output fade-in ${task.executionResult.success ? 'success' : 'error'}`}>
                          <div className="terminal-header">
                            <Terminal size={14} />
                            <span>Execution Output</span>
                            <span className={`status-badge ${task.executionResult.success ? 'status-success' : 'status-error'}`}>
                              {task.executionResult.success ? 'Success' : 'Failed'}
                            </span>
                          </div>
                          <pre className="terminal-body">
                            <code>{task.executionResult.success ? task.executionResult.output : task.executionResult.error}</code>
                          </pre>
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
              <span className="badge">
                <span className="dot"></span> Active
              </span>
              {shots.length > 0 && (
                <button className="clear-btn" onClick={clearShots} title="Clear Shots">
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            {shots.length === 0 ? (
              <div className="empty-state">
                <Code2 size={48} className="empty-icon" />
                <p>Hover over elements on the page and click to capture their data.</p>
              </div>
            ) : (
              <div className="shots-list">
                {shots.map((shot, idx) => (
                  <div key={shot.id} className="shot-card fade-in">
                    <div className="shot-header">
                      <span className="shot-title">Shot #{shots.length - idx}</span>
                      <button 
                        className="copy-btn" 
                        onClick={() => copyToClipboard(JSON.stringify({
                          selector: shot.selector,
                          xpath: shot.xpath,
                          innerText: shot.innerText
                        }, null, 2), idx, 'json')}
                        title="Copy JSON"
                      >
                        {copiedIndex === idx ? <CheckCircle size={16} className="text-success" /> : <Copy size={16} />}
                      </button>
                    </div>
                    
                    <div className="shot-body">
                      <pre className="json-display">
                        <code>
                          <span className="json-key">"selector"</span>: <span className="json-string">"{shot.selector}"</span>,<br/>
                          <span className="json-key">"xpath"</span>: <span className="json-string">"{shot.xpath}"</span>,<br/>
                          <span className="json-key">"innerText"</span>: <span className="json-string">"{shot.innerText.slice(0, 50)}{shot.innerText.length > 50 ? '...' : ''}"</span>
                        </code>
                      </pre>
                      
                      <div className="ai-section">
                        <div className="command-input-group">
                          <input 
                            type="text" 
                            className="text-input command-input" 
                            placeholder="Command (e.g., Extract all items like this)"
                            value={shot.command}
                            onChange={(e) => updateShotCommand(shot.id, e.target.value)}
                          />
                          <button 
                            className="btn-primary icon-btn" 
                            onClick={() => generateAPI(shot)}
                            disabled={shot.isGenerating}
                            title="Generate API"
                          >
                            {shot.isGenerating ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
                          </button>
                        </div>
                        
                        {shot.error && (
                          <div className="error-message">{shot.error}</div>
                        )}
                        
                        {shot.generatedCode && (
                          <div className="code-result fade-in">
                            <div className="code-header">
                              <span>Playwright Python</span>
                              <div className="code-actions">
                                <button 
                                  className="run-btn"
                                  onClick={() => runLive(shot)}
                                  disabled={shot.executionResult?.isRunning}
                                  title="Run Live"
                                >
                                  {shot.executionResult?.isRunning ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
                                  Run Live
                                </button>
                                <button 
                                  className="copy-btn" 
                                  onClick={() => copyToClipboard(shot.generatedCode!, shot.id, 'code')}
                                  title="Copy Code"
                                >
                                  {copiedCodeIndex === shot.id ? <CheckCircle size={14} className="text-success" /> : <Copy size={14} />}
                                </button>
                              </div>
                            </div>
                            <pre className="python-display">
                              <code>{shot.generatedCode}</code>
                            </pre>
                            <div className="save-task-section">
                               <input 
                                  type="text" 
                                  className="text-input save-task-input" 
                                  placeholder="Task Name (e.g., Scrape Prices)"
                                  value={shot.taskName}
                                  onChange={(e) => updateShotTaskName(shot.id, e.target.value)}
                                />
                                <button 
                                  className="save-btn"
                                  onClick={() => saveTask(shot)}
                                  title="Save Task to Armory"
                                >
                                  <Save size={14} />
                                  Save Task
                                </button>
                            </div>
                          </div>
                        )}
                        
                        {shot.executionResult && !shot.executionResult.isRunning && (
                          <div className={`terminal-output fade-in ${shot.executionResult.success ? 'success' : 'error'}`}>
                            <div className="terminal-header">
                              <Terminal size={14} />
                              <span>Execution Output</span>
                              <span className={`status-badge ${shot.executionResult.success ? 'status-success' : 'status-error'}`}>
                                {shot.executionResult.success ? 'Success' : 'Failed'}
                              </span>
                            </div>
                            <pre className="terminal-body">
                              <code>{shot.executionResult.success ? shot.executionResult.output : shot.executionResult.error}</code>
                            </pre>
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
