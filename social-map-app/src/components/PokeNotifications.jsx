import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { getAvatar2D } from '../utils/avatarUtils';

export default function PokeNotifications({ currentUser }) {
    const [pendingPokes, setPendingPokes] = useState([]);
    const [showNotifications, setShowNotifications] = useState(false);

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
                    requester:profiles!requester_id(id, full_name, username, avatar_url, gender)
                `)
                .eq('receiver_id', currentUser.id)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (!error && data) {
                setPendingPokes(data);
                // REMOVED: if (data.length > 0) setShowNotifications(true); 
                // We want to treat this as an 'Inbox' (badge only), not a pop-up on every refresh.
            }
        };

        fetchPendingPokes();

        // Real-time subscription for new pokes
        const channel = supabase
            .channel('poke_notifications')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'friendships',
                filter: `receiver_id=eq.${currentUser.id}`
            }, async (payload) => {
                if (payload.new.status === 'pending') {
                    // Fetch requester details
                    const { data: requester } = await supabase
                        .from('profiles')
                        .select('id, full_name, username, avatar_url, gender')
                        .eq('id', payload.new.requester_id)
                        .single();

                    if (requester) {
                        const newPoke = {
                            ...payload.new,
                            requester
                        };
                        setPendingPokes(prev => [newPoke, ...prev]);
                        setShowNotifications(true);
                        
                        // Play notification sound
                        const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
                        audio.play().catch(e => console.log(e));
                    }
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'friendships',
                filter: `receiver_id=eq.${currentUser.id}`
            }, async (payload) => {
                console.log('Poke Update Payload:', payload);
                if (payload.new.status === 'pending') {
                    // It's a new poke (re-poke via update)! 
                    // Check if we already have it to avoid duplicates
                    setPendingPokes(prev => {
                        if (prev.find(p => p.id === payload.new.id)) return prev;
                        return prev; // We need to fetch details first, so handled below
                    });

                    // Fetch requester details
                    const { data: requester } = await supabase
                        .from('profiles')
                        .select('id, full_name, username, avatar_url, gender')
                        .eq('id', payload.new.requester_id)
                        .single();

                    if (requester) {
                         const newPoke = { ...payload.new, requester };
                         
                         setPendingPokes(prev => {
                             // Double check uniqueness
                             if (prev.find(p => p.id === newPoke.id)) return prev;
                             return [newPoke, ...prev];
                         });
                         setShowNotifications(true);
                         
                         // Play sound
                         const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
                         audio.play().catch(e => console.log(e));
                    }
                } else {
                    // Remove from list if accepted or declined
                    setPendingPokes(prev => prev.filter(p => p.id !== payload.new.id));
                }
            })
            .on('postgres_changes', {
                event: 'DELETE',
                schema: 'public',
                table: 'friendships'
            }, (payload) => {
                // Remove from list if deleted (cancelled)
                setPendingPokes(prev => prev.filter(p => p.id !== payload.old.id));
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

    if (!showNotifications || pendingPokes.length === 0) return null;

    return (
        <>
            {/* Notification Badge */}
            <div className="poke-badge" onClick={() => setShowNotifications(!showNotifications)}>
                👋 {pendingPokes.length}
            </div>

            {/* Notification Panel */}
            {showNotifications && (
                <div className="poke-notifications-panel" ref={panelRef}>
                    <div className="panel-header">
                        <h3>👋 Poke Requests</h3>
                        <button onClick={() => setShowNotifications(false)}>✕</button>
                    </div>
                    <div className="poke-list">
                        {pendingPokes.map(poke => (
                            <div key={poke.id} className="poke-item">
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
                                    <strong>{poke.requester.username || poke.requester.full_name}</strong>
                                    <span>sent you a poke!</span>
                                </div>
                                <div className="poke-actions">
                                    <button className="accept-btn" onClick={() => handleAccept(poke)}>
                                        ✓
                                    </button>
                                    <button className="decline-btn" onClick={() => handleDecline(poke)}>
                                        ✗
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <style>{`
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
                    top: 70px;
                    right: 20px;
                    width: 320px;
                    max-height: 400px;
                    background: rgba(30, 30, 30, 0.98);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 15px;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
                    z-index: 9998;
                    overflow: hidden;
                    animation: slideIn 0.3s ease-out;
                }

                @keyframes slideIn {
                    from { opacity: 0; transform: translateY(-20px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .panel-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 15px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    background: rgba(255, 105, 180, 0.1);
                }

                .panel-header h3 {
                    margin: 0;
                    font-size: 1rem;
                    color: white;
                }

                .panel-header button {
                    background: none;
                    border: none;
                    color: #aaa;
                    font-size: 1.2rem;
                    cursor: pointer;
                    width: 30px;
                    height: 30px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .panel-header button:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                }

                .poke-list {
                    max-height: 340px;
                    overflow-y: auto;
                }

                .poke-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 15px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                    transition: background 0.2s;
                }

                .poke-item:hover {
                    background: rgba(255, 255, 255, 0.05);
                }

                .poke-avatar {
                    width: 45px;
                    height: 45px;
                    border-radius: 50%;
                    border: 2px solid #FF69B4;
                }

                .poke-info {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .poke-info strong {
                    color: white;
                    font-size: 0.95rem;
                }

                .poke-info span {
                    color: #aaa;
                    font-size: 0.8rem;
                }

                .poke-actions {
                    display: flex;
                    gap: 8px;
                }

                .accept-btn, .decline-btn {
                    width: 35px;
                    height: 35px;
                    border: none;
                    border-radius: 50%;
                    font-size: 1.1rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }

                .accept-btn {
                    background: linear-gradient(135deg, #00ff99, #00cc77);
                    color: white;
                    box-shadow: 0 2px 10px rgba(0, 255, 153, 0.3);
                }

                .accept-btn:hover {
                    transform: scale(1.1);
                    box-shadow: 0 4px 15px rgba(0, 255, 153, 0.5);
                }

                .decline-btn {
                    background: linear-gradient(135deg, #ff5555, #cc0000);
                    color: white;
                    box-shadow: 0 2px 10px rgba(255, 85, 85, 0.3);
                }

                .decline-btn:hover {
                    transform: scale(1.1);
                    box-shadow: 0 4px 15px rgba(255, 85, 85, 0.5);
                }
            `}</style>
        </>
    );
}
