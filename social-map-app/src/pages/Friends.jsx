import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import UserProfileCard from '../components/UserProfileCard';

export default function Friends() {
    const [requests, setRequests] = useState([]);
    const [friends, setFriends] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState(null);
    const [viewingProfile, setViewingProfile] = useState(null);
    const [activeMenuId, setActiveMenuId] = useState(null);
    const [activeTab, setActiveTab] = useState('friends');
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

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setActiveMenuId(null);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const handleUnfriend = async (e, friendshipId) => {
        e.stopPropagation();
        if(confirm("Are you sure you want to remove this friend?")) {
            await supabase.from('friendships').delete().eq('id', friendshipId);
            setFriends(friends.filter(f => f.friendship_id !== friendshipId));
            setActiveMenuId(null);
        }
    };

    const toggleMenu = (e, id) => {
        e.stopPropagation();
        setActiveMenuId(activeMenuId === id ? null : id);
    };

    const handleViewProfile = (e, friend) => {
        e.stopPropagation();
        const userObj = {
            id: friend.id,
            name: friend.full_name || friend.username,
            avatar: friend.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.username}`,
            status: friend.status,
            gender: friend.gender,
            friendshipStatus: 'accepted' // For UserProfileCard logic
        };
        setViewingProfile(userObj);
        setActiveMenuId(null);
    };

    const handleCardAction = (action, user) => {
        if (action === 'message') {
            setViewingProfile(null);
            navigate('/chat', { state: { targetUser: user } });
        }
        // Handle other actions if needed
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
                <div className="tab-container">
                    <button 
                        className={`tab-btn ${activeTab === 'friends' ? 'active' : ''}`}
                        onClick={() => setActiveTab('friends')}
                    >
                        Friends
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'requests' ? 'active' : ''}`}
                        onClick={() => setActiveTab('requests')}
                    >
                        Requests
                        {requests.length > 0 && <span className="tab-badge">{requests.length}</span>}
                    </button>
                </div>
                <div style={{ width: 40 }}></div> {/* Spacer */}
            </header>

            <div className="scroll-content">
                {/* Requests Tab */}
                {activeTab === 'requests' && (
                    <div className="section">
                        {requests.length === 0 ? (
                             <div className="empty-state">
                                <div className="empty-icon">📭</div>
                                <p>No pending requests.</p>
                            </div>
                        ) : (
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
                        )}
                    </div>
                )}

                {/* Friends Tab */}
                {activeTab === 'friends' && (
                    <div className="section">
                        <h2 style={{ 
                            textAlign: 'left', 
                            fontSize: '2rem', 
                            fontWeight: 'bold', 
                            color: 'white',
                            margin: '10px 20px 20px 20px',
                            padding: 0
                        }}>Friends</h2>
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
                                        
                                        {/* Action Menu Button */}
                                        <div className="menu-wrapper">
                                            <button className="btn-menu" onClick={(e) => toggleMenu(e, friend.id)}>
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <circle cx="12" cy="12" r="1"></circle>
                                                    <circle cx="12" cy="5" r="1"></circle>
                                                    <circle cx="12" cy="19" r="1"></circle>
                                                </svg>
                                            </button>
                                            
                                            {/* Dropdown Menu */}
                                            {activeMenuId === friend.id && (
                                                <div className="dropdown-menu">

                                                    <button className="danger" onClick={(e) => handleUnfriend(e, friend.friendship_id)}>
                                                        Unfriend
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Profile Modal */}
            <UserProfileCard 
                user={viewingProfile} 
                onClose={() => setViewingProfile(null)} 
                onAction={handleCardAction}
            />

            <style>{`
                .tab-container {
                    display: flex; gap: 8px;
                    background: rgba(40,40,40,0.5);
                    padding: 4px; border-radius: 100px;
                    border: 1px solid var(--border-subtle);
                }
                .tab-btn {
                    padding: 6px 16px; border-radius: 20px;
                    border: none; background: transparent;
                    color: #888; font-size: 0.85rem; font-weight: 600;
                    cursor: pointer; transition: all 0.2s;
                    display: flex; align-items: center; gap: 6px;
                }
                .tab-btn.active {
                    background: white; color: black;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                }
                .tab-btn:hover:not(.active) { color: white; }
                
                .tab-badge {
                    background: #ff453a; color: white;
                    font-size: 0.65rem; padding: 2px 6px; border-radius: 10px;
                }

                .empty-state {
                    display: flex; flex-direction: column; align-items: center;
                    justify-content: center; height: 300px;
                    color: #666; gap: 10px;
                }
                .empty-icon { font-size: 3rem; opacity: 0.5; }

                /* Action Menu */
                .menu-wrapper { position: relative; }
                .btn-menu {
                    width: 40px; height: 40px;
                    background: transparent; border: none;
                    color: #aaa; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    border-radius: 50%;
                    transition: all 0.2s;
                }
                .btn-menu:hover { background: rgba(255,255,255,0.1); color: white; }

                .dropdown-menu {
                    position: absolute;
                    top: 45px; right: 0;
                    background: #252525;
                    border: 1px solid #333;
                    border-radius: 12px;
                    width: 150px;
                    z-index: 100;
                    box-shadow: 0 5px 20px rgba(0,0,0,0.5);
                    overflow: hidden;
                    animation: fadeIn 0.1s ease;
                }
                .dropdown-menu button {
                    width: 100%; text-align: left;
                    padding: 12px 16px;
                    background: transparent; border: none;
                    color: white; font-size: 0.9rem;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .dropdown-menu button:hover { background: #333; }
                .dropdown-menu button.danger { color: #ff4444; }
                .dropdown-menu button.danger:hover { background: rgba(255, 68, 68, 0.1); }
                
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-5px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                :root {
                    /* Solid Professional Theme */
                    --card-bg: #1e1e1e;
                    --card-bg-hover: #2a2a2a;
                    --bg-dark: #0a0a0a;
                    --border-subtle: #333333;
                    --text-primary: #ffffff;
                    --text-secondary: #a0a0a0;
                    --accent-cyan: #00d4ff;
                }

                .friends-page {
                    min-height: 100vh;
                    background: var(--bg-dark);
                    color: var(--text-primary);
                    font-family: 'Inter', sans-serif;
                    position: relative;
                }

                /* Removed Ambient Glow */
                .ambient-glow { display: none; }

                .glass-header {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 20px;
                    position: sticky; top: 0; z-index: 10;
                    background: var(--bg-dark);
                    /* Removed border for ultra-clean look */
                }

                .back-btn {
                    width: 40px; height: 40px;
                    background: transparent; border: none;
                    color: white; font-size: 1.2rem;
                    cursor: pointer; display: flex; align-items: center; justify-content: center;
                }

                .page-title {
                    font-size: 1.1rem; margin: 0; font-weight: 600;
                    color: var(--text-secondary);
                }

                .scroll-content { padding: 0; padding-bottom: 100px; }

                .section { margin-bottom: 0; }
                .section-header { 
                    font-size: 0.85rem; color: var(--accent-cyan); 
                    text-transform: uppercase; letter-spacing: 1px;
                    padding: 15px 20px 5px 20px; font-weight: 700;
                    display: flex; align-items: center; gap: 10px;
                    background: var(--bg-dark);
                }
                .badge { 
                    background: #ff453a; color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.7rem; 
                    box-shadow: none;
                }

                .list { display: flex; flex-direction: column; gap: 0; }

                .friend-card {
                    display: flex; align-items: center; gap: 16px;
                    padding: 12px 20px; /* Compact padding */
                    background: transparent;
                    border: none;
                    border-radius: 12px; /* Slight radius for hover state */
                    margin: 2px 10px; /* Inset hover effect */
                    cursor: pointer; transition: background 0.2s;
                    position: relative; overflow: visible; /* Allow menu overflow */
                }
                .friend-card:hover { 
                    background: var(--card-bg-hover);
                    transform: none;
                    box-shadow: none;
                }
                .friend-card:active { background: #333; }

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
