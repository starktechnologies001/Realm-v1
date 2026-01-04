import React, { useEffect, useRef } from 'react';

export default function AvatarCreator({ onClose, onAvatarExported }) {
    const subdomain = 'demo'; // Use 'demo' or your own subdomain
    const frameRef = useRef(null);

    useEffect(() => {
        const subscribe = (event) => {
            const json = parse(event);

            if (json?.source !== 'readyplayerme') {
                return;
            }

            // Subscribe to all events
            if (json.eventName === 'v1.frame.ready') {
                if (frameRef.current) {
                    frameRef.current.contentWindow.postMessage(
                        JSON.stringify({
                            target: 'readyplayerme',
                            type: 'subscribe',
                            eventName: 'v1.**'
                        }),
                        '*'
                    );
                }
            }

            // Get Avatar URL
            if (json.eventName === 'v1.avatar.exported') {
                console.log(`Avatar URL: ${json.data.url}`);
                const glbUrl = json.data.url;
                
                // Convert GLB URL to 2D Image URL (Full Body Portrait)
                // Use .png instead of .glb
                // scene=fullbody-portrait-v1-transparent gives a nice standing pose
                const pngUrl = glbUrl.replace('.glb', '.png') + '?scene=fullbody-portrait-v1-transparent';
                
                // Pass both URLs: 2D for map (snapshot) and 3D for profile (GLB)
                onAvatarExported(pngUrl, glbUrl);
            }

            // Close User
            if (json.eventName === 'v1.user.set') {
                console.log(`User with id ${json.data.id} set: ${JSON.stringify(json)}`);
            }
        };

        const parse = (event) => {
            try {
                return JSON.parse(event.data);
            } catch (error) {
                return null;
            }
        };

        window.addEventListener('message', subscribe);
        document.body.style.overflow = 'hidden'; // Prevent background scrolling

        return () => {
            window.removeEventListener('message', subscribe);
            document.body.style.overflow = 'auto';
        };
    }, [onAvatarExported]);

    return (
        <div style={styles.overlay}>
            <div style={styles.container}>
                <button style={styles.closeBtn} onClick={onClose}>✕</button>
                <iframe
                    ref={frameRef}
                    src={`https://${subdomain}.readyplayer.me/avatar?frameApi`}
                    style={styles.iframe}
                    allow="camera *; microphone *"
                    title="Avatar Creator"
                />
            </div>
        </div>
    );
}

const styles = {
    overlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.85)',
        zIndex: 20000,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
    },
    container: {
        width: '100%', height: '100%',
        maxWidth: '1200px', // Full screen feel but contained on ultra-wide
        maxHeight: '100%',
        position: 'relative',
        backgroundColor: '#1a1a1a'
    },
    iframe: {
        width: '100%', height: '100%',
        border: 'none',
    },
    closeBtn: {
        position: 'absolute', top: '20px', right: '20px',
        background: 'rgba(0,0,0,0.5)',
        color: 'white',
        border: 'none', borderRadius: '50%',
        width: '40px', height: '40px',
        fontSize: '20px', cursor: 'pointer',
        zIndex: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
    }
};
