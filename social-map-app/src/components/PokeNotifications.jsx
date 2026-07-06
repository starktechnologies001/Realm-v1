import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { getAvatar2D } from '../utils/avatarUtils';
import confetti from 'canvas-confetti';

export default function PokeNotifications({ currentUser }) {
    const [pendingPokes, setPendingPokes] = useState([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const [seenIds, setSeenIds] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('seen_poke_ids') || '[]');
        } catch (e) {
            return [];
        }
    });
    // Track whether user manually dismissed the panel this session
    const dismissedKey = 'poke_panel_dismissed';

    const unseenPokes = pendingPokes
        .filter(poke => !seenIds.includes(poke.id))
        .sort((a, b) => {
            const aType = a.is_diamond_poke ? 2 : (a.is_super_poke ? 1 : 0);
            const bType = b.is_diamond_poke ? 2 : (b.is_super_poke ? 1 : 0);
            if (aType !== bType) return bType - aType;
            return new Date(b.created_at) - new Date(a.created_at);
        });

    useEffect(() => {
        if (!currentUser) return;

        // Fetch pending pokes
        const fetchPendingPokes = async () => {
            const { data, error } = await supabase
                .from('friendships')
                .select(`
                    id,
                    requester_id,
                    created_at,
                    is_super_poke,
                    is_diamond_poke,
                    requester:profiles!requester_id(id, full_name, username, avatar_url, gender)
                `)
                .eq('receiver_id', currentUser.id)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (!error && data) {
                setPendingPokes(data);
                
                // Get list of seen/dismissed poke IDs from localStorage
                let storedSeen = [];
                try {
                    storedSeen = JSON.parse(localStorage.getItem('seen_poke_ids') || '[]');
                } catch (e) {
                    storedSeen = [];
                }
                setSeenIds(storedSeen);

                // Check if there is any poke that hasn't been seen/dismissed yet
                const hasUnseen = data.some(poke => !storedSeen.includes(poke.id));

                // Do not auto-show remaining poke requests popup on initial load / login
                setShowNotifications(false);

                // Self-clean localStorage seen_poke_ids to keep only active pending IDs
                try {
                    const activeIds = data.map(p => p.id);
                    const updatedSeen = storedSeen.filter(id => activeIds.includes(id));
                    localStorage.setItem('seen_poke_ids', JSON.stringify(updatedSeen));
                    setSeenIds(updatedSeen);
                } catch (e) {
                    console.error('Error cleaning up seen pokes', e);
                }
            }
        };

        fetchPendingPokes();

        // Real-time subscription for new pokes
        const channel = supabase
            .channel(`poke_notifications_${currentUser.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'friendships'
            }, async (payload) => {
                const { eventType, new: newRec, old: oldRec } = payload;

                if (eventType === 'INSERT') {
                    if (newRec.receiver_id === currentUser.id && newRec.status === 'pending') {
                        // Fetch requester details
                        const { data: requester } = await supabase
                            .from('profiles')
                            .select('id, full_name, username, avatar_url, gender')
                            .eq('id', newRec.requester_id)
                            .maybeSingle();

                        if (requester) {
                            const newPoke = {
                                ...newRec,
                                requester
                            };
                            setPendingPokes(prev => {
                                if (prev.find(p => p.id === newPoke.id)) return prev;
                                return [newPoke, ...prev];
                            });
                            // A brand-new poke always shows the panel — clear dismissed flag
                            sessionStorage.removeItem(dismissedKey);
                            setShowNotifications(true);
                            
                            // Confetti burst for premium pokes!
                            if (newPoke.is_diamond_poke) {
                                confetti({ particleCount: 100, spread: 80, colors: ['#06b6d4', '#22d3ee', '#ffffff'], origin: { y: 0.15, x: 0.85 } });
                            } else if (newPoke.is_super_poke) {
                                confetti({ particleCount: 80, spread: 60, colors: ['#facc15', '#fbbf24', '#ffffff'], origin: { y: 0.15, x: 0.85 } });
                            }

                            // Play notification sound
                            const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
                            audio.play().catch(e => console.log(e));
                        }
                    }
                }
                else if (eventType === 'UPDATE') {
                    if (newRec.receiver_id === currentUser.id) {
                        if (newRec.status === 'pending') {
                            // It's a new poke (re-poke via update)! 
                            // Clear from seenIds so it alerts the user again
                            setSeenIds(prev => prev.filter(id => id !== newRec.id));
                            try {
                                const currentSeen = JSON.parse(localStorage.getItem('seen_poke_ids') || '[]');
                                const updatedSeen = currentSeen.filter(id => id !== newRec.id);
                                localStorage.setItem('seen_poke_ids', JSON.stringify(updatedSeen));
                            } catch (e) {
                                console.error('Error updating seen pokes on update', e);
                            }

                            // Fetch requester details
                            const { data: requester } = await supabase
                                .from('profiles')
                                .select('id, full_name, username, avatar_url, gender')
                                .eq('id', newRec.requester_id)
                                .maybeSingle();

                            if (requester) {
                                 const newPoke = { ...newRec, requester };
                                 
                                 setPendingPokes(prev => {
                                     // Double check uniqueness
                                     if (prev.find(p => p.id === newPoke.id)) return prev;
                                     return [newPoke, ...prev];
                                 });
                                 // A re-poke always shows the panel — clear dismissed flag
                                 sessionStorage.removeItem(dismissedKey);
                                 setShowNotifications(true);
                                 
                                 // Confetti burst for premium pokes!
                                 if (newPoke.is_diamond_poke) {
                                     confetti({ particleCount: 100, spread: 80, colors: ['#06b6d4', '#22d3ee', '#ffffff'], origin: { y: 0.15, x: 0.85 } });
                                 } else if (newPoke.is_super_poke) {
                                     confetti({ particleCount: 80, spread: 60, colors: ['#facc15', '#fbbf24', '#ffffff'], origin: { y: 0.15, x: 0.85 } });
                                 }

                                 // Play sound
                                 const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
                                 audio.play().catch(e => console.log(e));
                            }
                        } else {
                            // Remove from list if accepted or declined
                            setPendingPokes(prev => prev.filter(p => p.id !== newRec.id));
                        }
                    }
                }
                else if (eventType === 'DELETE') {
                    // Remove from list if deleted (cancelled)
                    if (oldRec) {
                        setPendingPokes(prev => prev.filter(p => p.id !== oldRec.id));
                    }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser]);

    const handleAccept = async (poke) => {
        try {
            const { error } = await supabase
                .from('friendships')
                .update({ status: 'accepted' })
                .eq('id', poke.id);

            if (error) throw error;

            // Remove from pending list
            setPendingPokes(prev => prev.filter(p => p.id !== poke.id));

            // Show success message
            const toast = document.createElement('div');
            toast.textContent = `🎉 You're now friends with ${poke.requester.username || poke.requester.full_name}!`;
            toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#00ff99;color:#000;padding:12px 20px;border-radius:10px;font-weight:bold;z-index:10000;';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);

        } catch (err) {
            console.error('Accept error:', err);
        }
    };

    const handleDecline = async (poke) => {
        try {
            const { error } = await supabase
                .from('friendships')
                .update({ status: 'declined' })
                .eq('id', poke.id);

            if (error) throw error;

            // Remove from pending list
            setPendingPokes(prev => prev.filter(p => p.id !== poke.id));

        } catch (err) {
            console.error('Decline error:', err);
        }
    };

    const panelRef = useRef(null);

    // Click outside to dismiss
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showNotifications && 
                panelRef.current && 
                !panelRef.current.contains(event.target) &&
                !event.target.closest('.poke-badge')) {
                setShowNotifications(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showNotifications]);

    if (unseenPokes.length === 0) return null;

    return (
        <>
            {/* Notification Badge */}
            <div className="poke-badge" onClick={() => setShowNotifications(!showNotifications)}>
                👋 {unseenPokes.length}
            </div>

            {/* Notification Panel */}
            {showNotifications && (
                <div className="poke-notifications-panel" ref={panelRef}>
                    <button className="close-panel-btn-absolute" onClick={() => {
                        // Mark all current pending pokes as seen/dismissed in localStorage
                        try {
                            const currentSeen = JSON.parse(localStorage.getItem('seen_poke_ids') || '[]');
                            const newSeen = Array.from(new Set([...currentSeen, ...pendingPokes.map(p => p.id)]));
                            localStorage.setItem('seen_poke_ids', JSON.stringify(newSeen));
                            setSeenIds(newSeen);
                        } catch (e) {
                            console.error('Error saving seen pokes', e);
                        }
                        setShowNotifications(false);
                    }} title="Dismiss">✕</button>
                    <div className="poke-list">
                        {unseenPokes.slice(0, 1).map(poke => (
                            <div key={poke.id} className={`poke-item ${poke.is_diamond_poke ? 'diamond-poke-highlight' : poke.is_super_poke ? 'super-poke-highlight' : ''}`}>
                                <img 
                                    src={poke.requester.avatar_url ? getAvatar2D(poke.requester.avatar_url) : (() => {
                                        const safeName = encodeURIComponent(poke.requester.username || poke.requester.full_name || 'User');
                                        if (poke.requester.gender === 'Male') return `https://api.dicebear.com/7.x/avataaars/svg?seed=male-${safeName}`;
                                        if (poke.requester.gender === 'Female') return `https://api.dicebear.com/7.x/avataaars/svg?seed=female-${safeName}`;
                                        return `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeName}`;
                                    })()} 
                                    alt={poke.requester.username || poke.requester.full_name} 
                                    className="poke-avatar"
                                    onError={(e) => {
                                        const safeName = encodeURIComponent(poke.requester.username || poke.requester.full_name || 'User');
                                        e.target.src = `https://avatar.iran.liara.run/public?username=${safeName}`;
                                    }}
                                />
                                <div className="poke-info">
                                    <span className={`poke-title-label ${poke.is_diamond_poke ? 'diamond-poke-text' : poke.is_super_poke ? 'super-poke-text' : ''}`}>
                                        {poke.is_diamond_poke
                                            ? '💎 Diamond Poke!'
                                            : poke.is_super_poke 
                                                ? '⭐ Super Poke!' 
                                                : (unseenPokes.length > 1 ? `👋 Poke Request (+${unseenPokes.length - 1})` : '👋 Poke Request')}
                                    </span>
                                    <strong>
                                        {poke.is_diamond_poke
                                            ? `${poke.requester.username || poke.requester.full_name} Diamond Poked You`
                                            : poke.is_super_poke 
                                                ? `${poke.requester.username || poke.requester.full_name} Super Poked You` 
                                                : (poke.requester.username || poke.requester.full_name)}
                                    </strong>
                                </div>
                                <div className="poke-actions">
                                    <button className="accept-btn" onClick={() => handleAccept(poke)} title="Accept">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </button>
                                    <button className="decline-btn" onClick={() => handleDecline(poke)} title="Decline">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <style>{`
                .super-poke-highlight {
                    background: linear-gradient(135deg, rgba(250, 204, 21, 0.2), rgba(234, 179, 8, 0.2)) !important;
                    border: 1.5px solid #facc15 !important;
                    box-shadow: 0 4px 15px rgba(250, 204, 21, 0.25) !important;
                    transform: scale(1.02);
                }
                .super-poke-text {
                    color: #facc15 !important;
                    font-weight: 700;
                    text-shadow: 0 0 8px rgba(250, 204, 21, 0.5);
                }

                .poke-badge {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: linear-gradient(135deg, #FF69B4, #FF1493);
                    color: white;
                    padding: 10px 16px;
                    border-radius: 25px;
                    font-weight: bold;
                    font-size: 0.9rem;
                    box-shadow: 0 4px 15px rgba(255, 20, 147, 0.5);
                    cursor: pointer;
                    z-index: 9999;
                    animation: bounce 2s infinite;
                }

                @keyframes bounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-5px); }
                }

                .poke-notifications-panel {
                    position: fixed;
                    top: 75px;
                    right: 20px;
                    width: 295px;
                    max-width: 90vw;
                    background: rgba(22, 22, 26, 0.96);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 18px;
                    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
                    z-index: 9998;
                    overflow: hidden;
                    animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    padding: 10px 38px 10px 12px;
                }

                @keyframes slideIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .close-panel-btn-absolute {
                    position: absolute;
                    top: 8px;
                    right: 10px;
                    background: rgba(255, 255, 255, 0.08);
                    border: none;
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 0.75rem;
                    cursor: pointer;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    z-index: 10;
                }

                .close-panel-btn-absolute:hover {
                    background: rgba(255, 255, 255, 0.18);
                    color: white;
                }

                .poke-list {
                    overflow: hidden;
                }

                .poke-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    border-bottom: none;
                }

                .poke-avatar {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    border: 1.5px solid rgba(255, 105, 180, 0.6);
                    box-shadow: 0 0 8px rgba(255, 105, 180, 0.2);
                    object-fit: cover;
                    flex-shrink: 0;
                }

                .poke-info {
                    flex: 1;
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 1px;
                }

                .poke-title-label {
                    font-size: 0.65rem;
                    font-weight: 700;
                    color: #ff69b4;
                    letter-spacing: 0.5px;
                    text-transform: uppercase;
                    margin-bottom: 1px;
                }

                .poke-info strong {
                    color: white;
                    font-size: 0.85rem;
                    font-weight: 600;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .poke-actions {
                    display: flex;
                    gap: 6px;
                    align-items: center;
                    flex-shrink: 0;
                }

                .accept-btn, .decline-btn {
                    width: 28px;
                    height: 28px;
                    border: none;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                }

                .accept-btn {
                    background: #34c759;
                    color: white;
                    box-shadow: 0 2px 8px rgba(52, 199, 89, 0.2);
                }

                .accept-btn:hover {
                    background: #2ed573;
                    color: white;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(52, 199, 89, 0.4);
                }

                .accept-btn:active {
                    transform: translateY(0) scale(0.95);
                }

                .decline-btn {
                    background: #ff3b30;
                    color: white;
                    box-shadow: 0 2px 8px rgba(255, 59, 48, 0.2);
                }

                .decline-btn:hover {
                    background: #ff4757;
                    color: white;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(255, 59, 48, 0.4);
                }

                .decline-btn:active {
                    transform: translateY(0) scale(0.95);
                }

                /* Mobile Optimizations */
                @media (max-width: 480px) {
                    .poke-notifications-panel {
                        top: 75px;
                        left: 16px;
                        right: 16px;
                        width: auto;
                        max-width: 320px;
                        margin: 0 auto;
                        padding: 10px 38px 10px 12px;
                    }
                }
            `}</style>
        </>
    );
}
