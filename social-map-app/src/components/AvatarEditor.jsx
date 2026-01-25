import React, { useEffect, useRef, useState } from 'react';

// Using 'demo' is standard, but sometimes flaky. 
// If this persists, we might need a custom subdomain.
const SUBDOMAIN = 'demo'; 

export default function AvatarEditor({ onSave, onClose }) {
  const iframeRef = useRef(null);
  const [loadError, setLoadError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Construct URL
  const editorUrl = `https://${SUBDOMAIN}.readyplayer.me/avatar?frameApi&clearCache=true`;

  useEffect(() => {
    console.log('🔵 [AvatarEditor] Component Mounted');
    
    const handleMessage = (event) => {
      const source = event.source;
      if (iframeRef.current && source !== iframeRef.current.contentWindow) return;
      if (!event.data) return;

      try {
        const json = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

        if (json.source !== 'readyplayerme') return;

        console.log('🔵 [AvatarEditor] RPM Event:', json.eventName);

        if (json.eventName === 'v1.frame.ready') {
          setIsLoading(false);
          if (iframeRef.current && iframeRef.current.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
              JSON.stringify({
                target: 'readyplayerme',
                type: 'subscribe',
                eventName: 'v1.avatar.exported'
              }),
              '*'
            );
          }
        }

        if (json.eventName === 'v1.avatar.exported') {
          console.log('🔵 [AvatarEditor] Avatar Exported:', json.data.url);
          let url = json.data.url;
          url += '?quality=medium&textureAtlas=1024&lod=0'; 
          onSave(url);
        }
      } catch (error) {
        // Ignore non-json
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSave]);

  return (
    <div className="avatar-editor-overlay" style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 20000,
        display: 'flex', flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{ padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111', borderBottom: '1px solid #333' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{color: 'white', fontWeight: 'bold'}}>Avatar Creator</span>
            <span style={{color: '#888', fontSize: '12px'}}>Powered by Ready Player Me</span>
        </div>
        <button 
            onClick={onClose}
            style={{ 
                background: '#333', color: 'white', 
                border: '1px solid #555', padding: '8px 16px', borderRadius: '6px', 
                cursor: 'pointer', fontWeight: 'bold', fontSize: '14px'
            }}
        >
            Close
        </button>
      </div>
      
      {/* Fallback / Troubleshooting UI */}
      <div style={{ padding: '10px', backgroundColor: '#222', color: '#ccc', fontSize: '13px', textAlign: 'center', borderBottom: '1px solid #333' }}>
          If the editor is black or not loading: 
          <a 
            href={editorUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            style={{ color: '#00C6FF', marginLeft: '10px', fontWeight: 'bold' }}
          >
              Open in New Tab ↗
          </a>
      </div>

      {/* Main Iframe */}
      <div style={{ flex: 1, position: 'relative' }}>
          {isLoading && !loadError && (
              <div style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', 
                  pointerEvents: 'none', zIndex: 0, textAlign: 'center'
              }}>
                  <div className="spinner" style={{
                      width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.3)', 
                      borderRadius: '50%', borderTopColor: '#fff', animation: 'spin 1s ease-in-out infinite',
                      margin: '0 auto 15px auto'
                  }}></div>
                  <div style={{color: '#888'}}>Loading 3D Engine...</div>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
          )}

          <iframe
            ref={iframeRef}
            src={editorUrl}
            style={{ 
                width: '100%', height: '100%', border: 'none', 
                position: 'relative', zIndex: 1
            }}
            allow="camera *; microphone *; clipboard-write *"
            title="Avatar Editor"
          />
      </div>
    </div>
  );
}
