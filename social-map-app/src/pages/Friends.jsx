import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function Friends() {
    const [requests, setRequests] = useState([]);
    const [friends, setFriends] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchFriendsData = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setCurrentUser(user);

            // Fetch Pending Requests (where I am receiver)
            const { data: pending } = await supabase
                .from('friendships')
                .select(`
                    id, 
                    requester:profiles!requester_id(id, full_name, username, avatar_url, status, gender)
                `)
                .eq('receiver_id', user.id)
                .eq('status', 'pending');

            if (pending) {
                setRequests(pending.map(p => ({
                    friendship_id: p.id,
                    ...p.requester
                })));
            }

            // Fetch Friends (I am requester OR receiver, status accepted)
            const { data: myFriends } = await supabase
                .from('friendships')
                .select(`
                    id,
                    requester_id,
                    receiver_id,
                    requester:profiles!requester_id(id, full_name, username, avatar_url, status, gender),
                    receiver:profiles!receiver_id(id, full_name, username, avatar_url, status, gender)
                `)
                .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)
                .eq('status', 'accepted');

            if (myFriends) {
                const formatted = myFriends.map(f => {
                    const isRequester = f.requester_id === user.id;
                    const profile = isRequester ? f.receiver : f.requester;
                    return {
                        friendship_id: f.id,
                        ...profile
                    };
                });
                setFriends(formatted);
            }
            setLoading(false);
        };

        fetchFriendsData();
    }, []);

    const handleAccept = async (id) => {
        await supabase.from('friendships').update({ status: 'accepted' }).eq('id', id);
        // Refresh (optimistic update)
        const req = requests.find(r => r.friendship_id === id);
        setRequests(requests.filter(r => r.friendship_id !== id));
        setFriends([...friends, req]);
    };

    const handleDecline = async (id) => {
        await supabase.from('friendships').delete().eq('id', id);
        setRequests(requests.filter(r => r.friendship_id !== id));
    };

    const startChat = (friend) => {
        navigate('/chat', { state: { targetUser: friend } });
    };

    if (loading) return <div style={{ padding: 20, color: 'white' }}>Loading friends...</div>;

    return (
        <div className="friends-page">
            <div className="ambient-glow"></div>
            
            <header className="glass-header">
                <button className="back-btn" onClick={() => navigate(-1)}>←</button>
                <h1 className="page-title">Social Circle</h1>
                <div style={{ width: 40 }}></div> {/* Spacer */}
            </header>

            <div className="scroll-content">
                {/* Requests Section */}
                {requests.length > 0 && (
                    <div className="section">
                        <h2 className="section-header">Pending Requests <span className="badge">{requests.length}</span></h2>
                        <div className="list">
                            {requests.map(req => (
                                <div key={req.id} className="friend-card request">
                                    <div className="avatar-container">
                                        <img src={(() => {
                                            const safeName = encodeURIComponent(req.username || req.full_name || 'User');
                                            const g = req.gender?.toLowerCase();
                                            if (g === 'male') return `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&hair=short01,short02,short03,short04,short05,short06,short07,short08&earringsProbability=0`;
                                            if (g === 'female') return `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&glassesProbability=0&mustacheProbability=0&beardProbability=0&hair=long01,long02,long03,long04,long05,long10,long12`;
                                            return `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeName}`;
                                        })()} alt="avatar" className="avatar" />
                                    </div>
                                    <div className="info">
                                        <h3>{req.full_name || req.username}</h3>
                                        <span className="subtitle">wants to connect</span>
                                    </div>
                                    <div className="actions">
                                        <button className="btn-icon accept" onClick={() => handleAccept(req.friendship_id)}>✓</button>
                                        <button className="btn-icon decline" onClick={() => handleDecline(req.friendship_id)}>✕</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Friends List */}
                <div className="section">
                    <h2 className="section-header">Your Friends</h2>
                    {friends.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">🌍</div>
                            <p>Your circle is empty.</p>
                            <button className="btn-explore" onClick={() => navigate('/map')}>Find People on Map</button>
                        </div>
                    ) : (
                        <div className="list">
                            {friends.map(friend => (
                                <div key={friend.id} className="friend-card" onClick={() => startChat(friend)}>
                                    <div className="avatar-container">
                                        <img src={(() => {
                                            const safeName = encodeURIComponent(friend.username || friend.full_name || 'User');
                                            const g = friend.gender?.toLowerCase();
                                            if (g === 'male') return `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&hair=short01,short02,short03,short04,short05,short06,short07,short08&earringsProbability=0`;
                                            if (g === 'female') return `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&glassesProbability=0&mustacheProbability=0&beardProbability=0&hair=long01,long02,long03,long04,long05,long10,long12`;
                                            return `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeName}`;
                                        })()} alt="avatar" className="avatar" />
                                        <div className={`status-indicator ${friend.status === 'Online' ? 'online' : ''}`}></div>
                                    </div>
                                    <div className="info">
                                        <h3>{friend.full_name || friend.username}</h3>
                                        <span className="status-text">{friend.status || 'Offline'}</span>
                                    </div>
                                    <button className="btn-msg">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                :root {
                    --glass-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
                    --glass-border: rgba(255, 255, 255, 0.15);
                    --accent-cyan: #00d4ff;
                    --text-primary: #ffffff;
                    --text-secondary: #aaaaaa;
                }

                .friends-page {
                    min-height: 100vh;
                    background: radial-gradient(ellipse at top, #1a1a2e 0%, #0a0a0a 60%);
                    color: var(--text-primary);
                    font-family: 'Inter', sans-serif;
                    position: relative;
                }

                .ambient-glow {
                    position: absolute; top: -100px; left: 50%; transform: translateX(-50%);
                    width: 400px; height: 400px;
                    background: radial-gradient(circle, rgba(0, 212, 255, 0.15) 0%, transparent 70%);
                    filter: blur(60px); pointer-events: none;
                }

                .glass-header {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 20px;
                    position: sticky; top: 0; z-index: 10;
                    backdrop-filter: blur(10px);
                }

                .back-btn {
                    width: 40px; height: 40px;
                    background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 12px; color: white; font-size: 1.2rem;
                    cursor: pointer; display: flex; align-items: center; justify-content: center;
                }

                .page-title {
                    font-size: 1.2rem; margin: 0; font-weight: 700;
                    background: linear-gradient(to right, #fff, #aaa);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                .scroll-content { padding: 20px; padding-bottom: 100px; }

                .section { margin-bottom: 30px; }
                .section-header { 
                    font-size: 0.8rem; color: var(--accent-cyan); 
                    text-transform: uppercase; letter-spacing: 1px;
                    margin-bottom: 15px; font-weight: 700;
                    display: flex; align-items: center; gap: 10px;
                }
                .badge { 
                    background: #ff453a; color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.7rem; 
                    box-shadow: 0 2px 8px rgba(255, 69, 58, 0.4);
                }

                .list { display: flex; flex-direction: column; gap: 12px; }

                .friend-card {
                    display: flex; align-items: center; gap: 16px;
                    padding: 16px;
                    background: var(--glass-bg);
                    backdrop-filter: blur(12px);
                    border: 1px solid var(--glass-border);
                    border-radius: 20px;
                    cursor: pointer; transition: all 0.2s;
                    position: relative; overflow: hidden;
                }
                .friend-card:hover { 
                    background: linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.08));
                    transform: translateY(-2px);
                    border-color: rgba(255,255,255,0.3);
                    box-shadow: 0 8px 20px rgba(0,0,0,0.3);
                }
                .friend-card:active { transform: scale(0.98); }

                .avatar-container { position: relative; width: 56px; height: 56px; }
                .avatar { 
                    width: 100%; height: 100%; border-radius: 18px; object-fit: cover; 
                    background: rgba(0,0,0,0.2);
                }
                .status-indicator {
                    position: absolute; bottom: -2px; right: -2px;
                    width: 14px; height: 14px;
                    background: #666; border: 2px solid #1a1a2e;
                    border-radius: 50%;
                }
                .status-indicator.online { background: #00ff88; box-shadow: 0 0 8px rgba(0,255,136,0.5); }

                .info { flex: 1; }
                .info h3 { margin: 0; font-size: 1.05rem; font-weight: 600; color: white; margin-bottom: 4px; }
                .status-text { font-size: 0.85rem; color: #888; display: block; }
                .subtitle { font-size: 0.8rem; color: var(--accent-cyan); }

                .btn-msg {
                    width: 44px; height: 44px;
                    background: rgba(255,255,255,0.1);
                    border-radius: 14px; border: none;
                    color: white; display: flex; align-items: center; justify-content: center;
                    cursor: pointer; transition: all 0.2s;
                }
                .btn-msg:hover { background: var(--accent-cyan); color: #000; }

                .actions { display: flex; gap: 8px; }
                .btn-icon {
                    width: 36px; height: 36px; border-radius: 12px; border: none;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer; font-weight: bold; transition: all 0.2s;
                }
                .btn-icon.accept { background: #00ff88; color: #000; }
                .btn-icon.accept:hover { box-shadow: 0 0 12px rgba(0,255,136,0.4); }
                .btn-icon.decline { background: rgba(255,69,58,0.2); color: #ff453a; }
                .btn-icon.decline:hover { background: #ff453a; color: white; }

                .empty-state {
                    text-align: center; padding: 40px 20px;
                    color: #666;
                }
                .empty-icon { font-size: 3rem; margin-bottom: 15px; opacity: 0.5; }
                .btn-explore {
                    background: linear-gradient(135deg, #00C6FF, #0072FF);
                    border: none; padding: 12px 24px; border-radius: 20px;
                    color: white; font-weight: 600; margin-top: 20px;
                    cursor: pointer; box-shadow: 0 4px 15px rgba(0,114,255,0.3);
                }
            `}</style>
        </div>
    );
}
