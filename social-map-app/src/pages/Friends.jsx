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
                    requester:profiles!requester_id(id, full_name, username, avatar_url, status)
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
                    requester:profiles!requester_id(id, full_name, username, avatar_url, status),
                    receiver:profiles!receiver_id(id, full_name, username, avatar_url, status)
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
            <h1 className="page-title">Social Circle</h1>

            {/* Requests Section */}
            {requests.length > 0 && (
                <div className="section">
                    <h2 className="section-header">Pending Requests <span className="badge">{requests.length}</span></h2>
                    <div className="list">
                        {requests.map(req => (
                            <div key={req.id} className="friend-card request">
                                <img src={req.avatar_url} alt="avatar" className="avatar" />
                                <div className="info">
                                    <h3>{req.full_name || req.username}</h3>
                                    <span>wants to connect</span>
                                </div>
                                <div className="actions">
                                    <button className="btn-accept" onClick={() => handleAccept(req.friendship_id)}>Accept</button>
                                    <button className="btn-decline" onClick={() => handleDecline(req.friendship_id)}>✕</button>
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
                    <p className="empty-msg">No friends yet. Go explore the map! 🗺️</p>
                ) : (
                    <div className="list">
                        {friends.map(friend => (
                            <div key={friend.id} className="friend-card" onClick={() => startChat(friend)}>
                                <img src={friend.avatar_url} alt="avatar" className="avatar" />
                                <div className="info">
                                    <h3>{friend.full_name || friend.username}</h3>
                                    <span className={`status-dot ${friend.status === 'Online' ? 'online' : ''}`}></span>
                                    <span className="status-text">{friend.status || 'Offline'}</span>
                                </div>
                                <button className="btn-chat">💬</button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <style>{`
                .friends-page {
                    min-height: 100vh;
                    background: #0f0f0f;
                    color: white;
                    padding: 20px;
                    padding-bottom: 80px;
                }
                .page-title {
                    font-size: 1.8rem; margin-bottom: 20px;
                    background: linear-gradient(to right, #00f260, #0575E6);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .section { margin-bottom: 30px; }
                .section-header { font-size: 1rem; color: #888; text-transform: uppercase; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
                .badge { background: #ff453a; color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem; }
                
                .list { display: flex; flex-direction: column; gap: 10px; }
                
                .friend-card {
                    display: flex; align-items: center; gap: 15px;
                    padding: 12px;
                    background: rgba(255,255,255,0.05);
                    border-radius: 16px;
                    cursor: pointer; transition: background 0.2s;
                }
                .friend-card:active { background: rgba(255,255,255,0.1); }
                .friend-card.request { border: 1px solid rgba(66, 133, 244, 0.3); }

                .avatar { width: 50px; height: 50px; border-radius: 50%; object-fit: cover; }
                .info { flex: 1; }
                .info h3 { margin: 0; font-size: 1rem; font-weight: 600; }
                .info span { font-size: 0.8rem; color: #aaa; }
                
                .actions { display: flex; gap: 8px; }
                .btn-accept {
                    background: #4285F4; color: white; border: none;
                    padding: 6px 12px; border-radius: 8px; font-weight: 600; cursor: pointer;
                }
                .btn-decline {
                    background: rgba(255,255,255,0.1); color: #ccc; border: none;
                    width: 32px; height: 32px; border-radius: 8px; cursor: pointer;
                }
                .btn-chat {
                    background: none; border: none; font-size: 1.2rem; cursor: pointer;
                }

                .status-dot {
                    display: inline-block; width: 8px; height: 8px;
                    background: #555; border-radius: 50%; margin-right: 5px;
                }
                .status-dot.online { background: #00ff88; }
                .empty-msg { color: #555; text-align: center; margin-top: 20px; font-style: italic; }
            `}</style>
        </div>
    );
}
