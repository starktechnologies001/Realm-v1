import React, { useEffect, useRef } from 'react';

const SUBDOMAIN = 'demo'; // Replace with your partner subdomain if you have one

export default function AvatarEditor({ onSave, onClose }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    const handleMessage = (event) => {
      // Standard way to get source
      const source = event.source;
      
      // If the event didn't come from our iframe, ignore it
      if (iframeRef.current && source !== iframeRef.current.contentWindow) return;

      if (!event.data) return;

      try {
        const json = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

        if (json.source !== 'readyplayerme') return;

        console.log('RPM Event:', json.eventName);

        // Subscribe to events
        if (json.eventName === 'v1.frame.ready') {
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

        // Handle Export
        if (json.eventName === 'v1.avatar.exported') {
          console.log('Avatar Exported:', json.data.url);
          let url = json.data.url;
          // Optimization: Compress textures and optimize for web
          // textureAtlas=1024 reduces size but keeps good quality
          // lod=0 keeps full geometry (high detail)
          url += '?quality=medium&textureAtlas=1024&lod=0'; 
          onSave(url);
        }
      } catch (error) {
        // Ignore non-JSON messages
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSave]);

  return (
    <div className="avatar-editor-overlay" style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 20000,
        display: 'flex', flexDirection: 'column'
    }}>
      <div style={{ padding: '20px', display: 'flex', justifyContent: 'flex-end' }}>
        <button 
            onClick={onClose}
            style={{ 
                background: 'rgba(255,255,255,0.2)', color: 'white', 
                border: 'none', padding: '10px 20px', borderRadius: '8px', 
                cursor: 'pointer', fontWeight: 'bold'
            }}
        >
            Close / Cancel
        </button>
      </div>
      <iframe
        ref={iframeRef}
        src={`https://${SUBDOMAIN}.readyplayer.me/avatar?frameApi`} 
        style={{ width: '100%', height: '100%', border: 'none' }}
        allow="camera *; microphone *"
        title="Avatar Editor"
      />
    </div>
  );
}
