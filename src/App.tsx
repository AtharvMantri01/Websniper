import { useState, useEffect } from 'react';
import { Target, Copy, CheckCircle, Code2, Trash2 } from 'lucide-react';
import './App.css';

interface SniperShot {
  selector: string;
  xpath: string;
  innerText: string;
}

function App() {
  const [shots, setShots] = useState<SniperShot[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
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
        setShots(prev => [request.data, ...prev]);
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

  const copyToClipboard = (data: any, index: number) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const clearShots = () => setShots([]);

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo">
          <Target className="icon text-primary" size={24} />
          <h1>WebSniper</h1>
        </div>
        <p className="subtitle">Aim, Click, Capture.</p>
      </header>

      <div className="main-content">
        <div className="controls">
          <span className="badge">
            <span className="dot"></span>
            Active
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
              <div key={idx} className="shot-card fade-in">
                <div className="shot-header">
                  <span className="shot-title">Shot #{shots.length - idx}</span>
                  <button 
                    className="copy-btn" 
                    onClick={() => copyToClipboard(shot, idx)}
                    title="Copy JSON"
                  >
                    {copiedIndex === idx ? (
                      <CheckCircle size={16} className="text-success" />
                    ) : (
                      <Copy size={16} />
                    )}
                  </button>
                </div>
                <pre className="json-display">
                  <code>
                    <span className="json-key">"selector"</span>: <span className="json-string">"{shot.selector}"</span>,<br/>
                    <span className="json-key">"xpath"</span>: <span className="json-string">"{shot.xpath}"</span>,<br/>
                    <span className="json-key">"innerText"</span>: <span className="json-string">"{shot.innerText.slice(0, 50)}{shot.innerText.length > 50 ? '...' : ''}"</span>
                  </code>
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
