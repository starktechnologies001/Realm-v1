import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { getAvatar2D, DEFAULT_MALE_AVATAR, DEFAULT_FEMALE_AVATAR, DEFAULT_GENERIC_AVATAR } from '../utils/avatarUtils';
import { useCall } from '../context/CallContext';
import { blockUser } from '../utils/blockUtils';
import FullProfileModal from '../components/FullProfileModal';
import { VerifiedBadgeInline } from '../utils/verifiedBadge.jsx';

export default function Friends() {
    const [requests, setRequests] = useState([]);
    const [friends, setFriends] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem('friends_cache') || '[]'); } catch { return []; }
    });
    const [loading, setLoading] = useState(false); // 🚀 No blocking loading screen
    const [currentUser, setCurrentUser] = useState(() => {
        try { return JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch { return null; }
    });
    const [activeMenuId, setActiveMenuId] = useState(null);
    const [activeTab, setActiveTab] = useState('friends');
    
    const [showUnfriendModal, setShowUnfriendModal] = useState(false);
    const [friendToUnfriend, setFriendToUnfriend] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const navigate = useNavigate();

    const fetchFriendsData = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) {
            navigate('/login');
            return;
        }
        setCurrentUser(user);

        // 🚀 Run both queries in PARALLEL for 2x speed
        const [pendingResult, myFriendsResult] = await Promise.all([
            supabase
                .from('friendships')
                .select('id, requester:profiles!requester_id(id, full_name, username, avatar_url, status, relationship_status, gender, hide_status, show_last_seen, subscription_tier, avatar_effect, is_verified, verified_at, is_online, last_active, hide_online_status)')
                .eq('receiver_id', user.id)
                .eq('status', 'pending'),
            supabase
                .from('friendships')
                .select('id, requester_id, receiver_id, requester:profiles!requester_id(id, full_name, username, avatar_url, status, relationship_status, gender, hide_status, show_last_seen, subscription_tier, avatar_effect, is_verified, verified_at, is_online, last_active, hide_online_status), receiver:profiles!receiver_id(id, full_name, username, avatar_url, status, relationship_status, gender, hide_status, show_last_seen, subscription_tier, avatar_effect, is_verified, verified_at, is_online, last_active, hide_online_status)')
                .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)
                .eq('status', 'accepted')
        ]);

        if (pendingResult.data) {
            setRequests(pendingResult.data.map(p => ({ friendship_id: p.id, ...p.requester })));
        }

        if (myFriendsResult.data) {
            const formatted = myFriendsResult.data.map(f => {
                const isRequester = f.requester_id === user.id;
                const profile = isRequester ? f.receiver : f.requester;
                return { friendship_id: f.id, ...profile };
            });
            setFriends(formatted);
            // 🔥 Cache for instant render next time
            try { sessionStorage.setItem('friends_cache', JSON.stringify(formatted)); } catch {}
        }
    };

    useEffect(() => {
        fetchFriendsData();

        // Real-time listener for profile changes (status, avatar, relationship_status, etc.)
        const profileSub = supabase
            .channel('public:profiles:friends_list')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
                const updatedUser = payload.new;
                setFriends(prev => prev.map(f =>
                    f.id === updatedUser.id ? { ...f, ...updatedUser } : f
                ));
                setRequests(prev => prev.map(r =>
                    r.id === updatedUser.id ? { ...r, ...updatedUser } : r
                ));
            })
            .subscribe();

        // Real-time listener for friendship changes — poke requests appear INSTANTLY
        let friendshipSub = null;
        supabase.auth.getSession().then(({ data: { session } }) => {
            const userId = session?.user?.id;
            if (!userId) return;

            friendshipSub = supabase
                .channel(`friendships_rt_${userId}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'friendships'
                }, async (payload) => {
                    const { eventType, new: newRow, old: oldRow } = payload;

                    if (eventType === 'INSERT') {
                        if (newRow.receiver_id !== userId || newRow.status !== 'pending') return;

                        const { data: profile } = await supabase
                            .from('profiles')
                            .select('id, full_name, username, avatar_url, status, relationship_status, gender, hide_status, show_last_seen, subscription_tier, avatar_effect, is_verified, verified_at, is_online, last_active, hide_online_status')
                            .eq('id', newRow.requester_id)
                            .maybeSingle();

                        if (profile) {
                            setRequests(prev => {
                                if (prev.some(r => r.friendship_id === newRow.id)) return prev;
                                return [{ friendship_id: newRow.id, ...profile }, ...prev];
                            });
                            setActiveTab('requests');
                        }
                    }
                    else if (eventType === 'UPDATE') {
                        if (newRow.receiver_id !== userId) return;
                        if (newRow.status === 'accepted') {
                            setRequests(prev => prev.filter(r => r.friendship_id !== newRow.id));
                            fetchFriendsData();
                        } else if (newRow.status === 'rejected') {
                            setRequests(prev => prev.filter(r => r.friendship_id !== newRow.id));
                        }
                    }
                    else if (eventType === 'DELETE') {
                        const deleted = oldRow;
                        if (deleted) {
                            setRequests(prev => prev.filter(r => r.friendship_id !== deleted.id));
                            setFriends(prev => prev.filter(f => f.friendship_id !== deleted.id));
                        }
                    }
                })
                .subscribe();
        });

        return () => {
            supabase.removeChannel(profileSub);
            if (friendshipSub) supabase.removeChannel(friendshipSub);
        };
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

    const confirmUnfriend = (e, friend) => {
        e.stopPropagation();
        console.log("Confirm unfriend clicked for:", friend);
        setFriendToUnfriend(friend);
        setShowUnfriendModal(true);
        setActiveMenuId(null);
    };

    const handleUnfriend = async () => {
        try {
            console.log("handleUnfriend called. friendToUnfriend:", friendToUnfriend);
            if (!friendToUnfriend) {
                alert("Error: No friend selected to unfriend.");
                return;
            }
            
            if (!currentUser) {
                alert("Error: Current user not found. Please reload.");
                return;
            }

            console.log("Attempting unfriend via pair match...");
            const query = `and(requester_id.eq.${currentUser.id},receiver_id.eq.${friendToUnfriend.id}),and(requester_id.eq.${friendToUnfriend.id},receiver_id.eq.${currentUser.id})`;
            
            // DEBUG: Check existence first
            const { data: exists, error: existError } = await supabase
                .from('friendships')
                .select('*')
                .or(query);

            if (existError) {
                alert("Debug Error Checking: " + existError.message);
                return;
            }

            if (!exists || exists.length === 0) {
                 alert("Debug: Friendship row NOT FOUND in DB. It may have been deleted already.");
                 setFriends(prev => prev.filter(f => f.id !== friendToUnfriend.id)); // Sync UI
                 await fetchFriendsData();
                 setShowUnfriendModal(false);
                 return;
            }

            console.log("Debug: Found row(s) to delete:", exists);
            const rowId = exists[0].id;

            // Robust Unfriend: Delete by matching the pair of users
            const { error, count } = await supabase
                .from('friendships')
                .delete({ count: 'exact' })
                .eq('id', rowId);
            
            if (error) {
                console.error("Error deleting friendship:", error);
                alert("Error unfriending: " + error.message);
                await fetchFriendsData();
                return;
            }

            // Clear any message requests between them so chat is blocked after unfriending
            await supabase
                .from('message_requests')
                .delete()
                .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${friendToUnfriend.id}),and(sender_id.eq.${friendToUnfriend.id},receiver_id.eq.${currentUser.id})`);
            
            console.log("Deleted count:", count);

            if (count === 0) {
                 // If we found it but couldn't delete it -> RLS Issue
                 alert(`Debug: Row matches but DELETE returned 0. This is likely a Database Permission (RLS) issue. Row ID: ${rowId}`);
                 await fetchFriendsData();
                 return;
            }

            // Optimistic Update
            setFriends(prev => prev.filter(f => f.id !== friendToUnfriend.id));

            await fetchFriendsData();
            
            setShowUnfriendModal(false);
            setFriendToUnfriend(null);
            
            alert("Friend removed successfully.");

        } catch (err) {
            console.error("Unexpected error in handleUnfriend:", err);
            alert("An unexpected error occurred: " + err.message);
            await fetchFriendsData(); 
        }
    };

    const cancelUnfriend = () => {
        console.log("Unfriend cancelled");
        setShowUnfriendModal(false);
        setFriendToUnfriend(null);
    };

    const toggleMenu = (e, id) => {
        e.stopPropagation();
        setActiveMenuId(activeMenuId === id ? null : id);
    };

    const handleViewProfile = (e, friend) => {
        e.stopPropagation();
        setActiveMenuId(null);
        navigate(`/profile/${friend.id}`);
    };

    const { startCall } = useCall(); // From CallContext
    
    // ... existing setup ...

    const handleCardAction = async (action, user) => {
        if (action === 'message') {
            setSelectedUser(null);
            navigate('/chat', { state: { targetUser: user } });
        } else if (action === 'call-audio') {
            setSelectedUser(null);
             // Ensure user object has all needed fields for call context
             // "user" from Friends list might be missing some profile fields, but startCall handles basic object
            startCall(user, 'audio');
        } else if (action === 'call-video') {
            setSelectedUser(null);
            startCall(user, 'video');
        } else if (action === 'block') {
             setSelectedUser(null);
             if (window.confirm(`Are you sure you want to block ${user.username || user.name || 'this user'}? They will no longer see you on the map.`)) {
                const { success, error } = await blockUser(currentUser.id, user.id);
                if (success) {
                    alert("User blocked successfully.");
                    setFriends(prev => prev.filter(f => f.id !== user.id)); // Remove from local list
                    setRequests(prev => prev.filter(r => r.id !== user.id));
                } else {
                    alert("Failed to block user. Please try again.");
                    console.error("Block error:", error);
                }
             }
        } else if (action === 'report') {
            setSelectedUser(null);
            const reason = prompt("Reason for reporting:");
            if (reason) {
                try {
                    await supabase.from('reports').insert({
                        reporter_id: currentUser.id,
                        reported_id: user.id,
                        reason: reason
                    });
                    alert("Report submitted. Thank you for keeping the community safe.");
                } catch (err) {
                    console.error("Error reporting user:", err);
                    alert("Failed to submit report.");
                }
            }
        }
    };

    const startChat = (friend) => {
        navigate('/chat', { state: { targetUser: friend } });
    };

    const checkIsOnline = (friend) => {
        if (friend.hide_online_status) return false;
        if (!friend.is_online) return false;
        if (!friend.last_active) return false;
        const diffMs = Date.now() - new Date(friend.last_active).getTime();
        return diffMs < 5 * 60 * 1000;
    };

    const filteredFriends = friends.filter(friend => {
        const term = searchTerm.toLowerCase();
        return (friend.username || '').toLowerCase().includes(term) || (friend.full_name || '').toLowerCase().includes(term);
    });

    if (loading) return <div style={{ padding: 20, color: 'white' }}>Loading friends...</div>;

    return (
        <div className="friends-page">
            <div className="ambient-glow"></div>
            
            <header className="glass-header" style={{ flexDirection: 'column', height: 'auto', padding: '10px 0', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '0 16px' }}>
                    <button className="back-btn" onClick={() => navigate(-1)} style={{ position: 'relative', left: 0 }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5M12 5l-7 7 7 7"/>
                        </svg>
                    </button>
                    <h2 style={{ flex: 1, textAlign: 'center', margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Friends</h2>
                    <button className="back-btn" onClick={() => navigate('/map')} style={{ position: 'relative', right: 0 }} title="Find new friends">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                            <circle cx="9" cy="7" r="4"/>
                            <line x1="19" y1="8" x2="19" y2="14"/>
                            <line x1="22" y1="11" x2="16" y2="11"/>
                        </svg>
                    </button>
                </div>
                
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
                            <>
                                <div className="requests-subtitle">People who want to connect with you</div>
                                <div className="list">
                                    {requests.map(req => (
                                    <div key={req.id} className="friend-card request">
                                        <div 
                                            className={`avatar-container ${
                                                req.subscription_tier === 'silver' ? 'avatar-ring-silver' :
                                                req.subscription_tier === 'gold' ? 'avatar-ring-gold' :
                                                req.subscription_tier === 'diamond' ? 'avatar-ring-diamond' : ''
                                            }`} 
                                            style={{ padding: req.subscription_tier ? 2 : 0, borderRadius: '50%', cursor: 'pointer' }}
                                            onClick={(e) => { e.stopPropagation(); setSelectedUser(req); }}
                                        >
                                            <img 
                                                src={(() => {
                                                let avatarUrl = req.avatar_url;
                                                if (!avatarUrl) {
                                                    if (req.gender === 'Male') avatarUrl = DEFAULT_MALE_AVATAR;
                                                    else if (req.gender === 'Female') avatarUrl = DEFAULT_FEMALE_AVATAR;
                                                    else avatarUrl = DEFAULT_GENERIC_AVATAR;
                                                }
                                                return getAvatar2D(avatarUrl);
                                            })()} 
                                                alt="avatar" 
                                                className="avatar"
                                                loading="eager"
                                                decoding="sync"
                                            />
                                        </div>
                                        <div 
                                            className="info" 
                                            style={{ display: 'flex', flexDirection: 'column', gap: 2, cursor: 'pointer' }}
                                            onClick={(e) => { e.stopPropagation(); setSelectedUser(req); }}
                                        >
                                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, minWidth: 0, width: '100%' }}>
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0 }}>
                                                    {req.username}
                                                </span>
                                                <VerifiedBadgeInline user={req} size={14} />
                                                {req.subscription_tier === 'silver' && <span style={{ fontSize: '0.95rem', flexShrink: 0 }} title="Silver Member">🥈</span>}
                                                {req.subscription_tier === 'gold' && <span style={{ fontSize: '0.95rem', flexShrink: 0 }} title="Gold Elite">🥇</span>}
                                                {req.subscription_tier === 'diamond' && <span style={{ fontSize: '0.95rem', flexShrink: 0 }} title="Diamond Elite">💎</span>}
                                            </h3>
                                            <span className="subtitle">wants to connect</span>
                                        </div>
                                        <div className="actions">
                                            <button className="btn-icon accept" onClick={() => handleAccept(req.friendship_id)}>✓</button>
                                            <button className="btn-icon decline" onClick={() => handleDecline(req.friendship_id)}>✕</button>
                                        </div>
                                    </div>
                                ))}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Friends Tab */}
                {activeTab === 'friends' && (
                    <div className="section">
                        {friends.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-icon">🌍</div>
                                <p>Your circle is empty.</p>
                                <button className="btn-explore" onClick={() => navigate('/map')}>Find People on Map</button>
                            </div>
                        ) : (
                            <>
                                <div className="search-container">
                                    <div className="search-bar">
                                        <svg className="search-icon" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <circle cx="11" cy="11" r="8"></circle>
                                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                        </svg>
                                        <input 
                                            type="text" 
                                            placeholder="Search friends..." 
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                    <button className="filter-btn" title="Filter list">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="4" y1="21" x2="4" y2="14"></line>
                                            <line x1="4" y1="10" x2="4" y2="3"></line>
                                            <line x1="12" y1="21" x2="12" y2="12"></line>
                                            <line x1="12" y1="8" x2="12" y2="3"></line>
                                            <line x1="20" y1="21" x2="20" y2="16"></line>
                                            <line x1="20" y1="12" x2="20" y2="3"></line>
                                            <line x1="1" y1="14" x2="7" y2="14"></line>
                                            <line x1="9" y1="8" x2="15" y2="8"></line>
                                            <line x1="17" y1="16" x2="23" y2="16"></line>
                                        </svg>
                                    </button>
                                </div>
                                <div className="list">
                                    {filteredFriends.map(friend => (
                                    <div 
                                        key={friend.id} 
                                        className="friend-card" 
                                        style={{ zIndex: activeMenuId === friend.id ? 50 : 1 }}
                                        onClick={(e) => handleViewProfile(e, friend)}
                                    >
                                        <div className={`avatar-container ${
                                            friend.subscription_tier === 'silver' ? 'avatar-ring-silver' :
                                            friend.subscription_tier === 'gold' ? 'avatar-ring-gold' :
                                            friend.subscription_tier === 'diamond' ? 'avatar-ring-diamond' : ''
                                        }`} style={{ padding: friend.subscription_tier ? 2 : 0, borderRadius: '50%' }}>
                                            <img 
                                                src={(() => {
                                                let avatarUrl = friend.avatar_url;
                                                if (!avatarUrl) {
                                                    if (friend.gender === 'Male') avatarUrl = DEFAULT_MALE_AVATAR;
                                                    else if (friend.gender === 'Female') avatarUrl = DEFAULT_FEMALE_AVATAR;
                                                    else avatarUrl = DEFAULT_GENERIC_AVATAR;
                                                }
                                                return getAvatar2D(avatarUrl);
                                            })()} 
                                                alt="avatar" 
                                                className="avatar"
                                                loading="eager"
                                                decoding="sync"
                                            />
                                        </div>
                                        <div className="info">
                                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, minWidth: 0, width: '100%' }}>
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0 }}>
                                                    {friend.username}
                                                </span>
                                                <VerifiedBadgeInline user={friend} size={14} />
                                                {friend.subscription_tier === 'silver' && <span style={{ fontSize: '0.95rem', flexShrink: 0 }} title="Silver Member">🥈</span>}
                                                {friend.subscription_tier === 'gold' && <span style={{ fontSize: '0.95rem', flexShrink: 0 }} title="Gold Elite">🥇</span>}
                                                {friend.subscription_tier === 'diamond' && <span style={{ fontSize: '0.95rem', flexShrink: 0 }} title="Diamond Elite">💎</span>}
                                            </h3>
                                            {!friend.hide_status && (
                                                <span className={`status-text ${checkIsOnline(friend) ? 'status-online' : 'status-offline'}`}>
                                                    {checkIsOnline(friend) ? 'Online' : 'Offline'}
                                                </span>
                                            )}
                                        </div>
                                        
                                        <div className="menu-wrapper">
                                            <button
                                                className="message-btn"
                                                onClick={(e) => { e.stopPropagation(); startChat(friend); }}
                                            >
                                                Message
                                            </button>
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

                                                    <button onClick={(e) => { e.stopPropagation(); startChat(friend); }}>
                                                        Chat
                                                    </button>
                                                    <button onClick={(e) => handleViewProfile(e, friend)}>
                                                        View Profile
                                                    </button>
                                                    <div style={{ height: 1, background: '#eee', margin: '4px 0' }}></div>
                                                    <button className="danger" onClick={(e) => confirmUnfriend(e, friend)}>
                                                        Unfriend
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Unfriend Confirmation Modal */}
            {showUnfriendModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Unfriend {friendToUnfriend?.username}?</h3>
                        <p>Are you sure you want to remove this friend? You will need to poke them again to reconnect.</p>
                        <div className="modal-actions">
                            <button className="btn-cancel" onClick={cancelUnfriend}>No, Keep</button>
                            <button className="btn-confirm danger" onClick={handleUnfriend}>Yes, Unfriend</button>
                        </div>
                    </div>
                </div>
            )}

            {selectedUser && (
                <FullProfileModal
                    user={selectedUser}
                    currentUser={currentUser}
                    onClose={() => setSelectedUser(null)}
                    onAction={handleCardAction}
                />
            )}

            <style>{`
                .modal-overlay {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.45);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    display: flex; justify-content: center; align-items: center;
                    z-index: 2000;
                }
                .modal-content {
                    background: #ffffff;
                    padding: 32px 28px;
                    border-radius: 24px;
                    width: 90%; max-width: 400px; text-align: center;
                    border: 1px solid rgba(0,0,0,0.08);
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1), 0 8px 16px rgba(0, 0, 0, 0.05);
                }
                .modal-content h3 {
                    margin: 0 0 16px 0;
                    color: #1d1d1f;
                    font-size: 1.5rem;
                    font-weight: 700;
                    letter-spacing: -0.02em;
                }
                .modal-content p {
                    color: #515154;
                    font-size: 0.95rem;
                    margin-bottom: 28px;
                    line-height: 1.6;
                }
                .modal-actions { display: flex; gap: 12px; justify-content: center; }
                .btn-cancel, .btn-confirm {
                    padding: 14px 20px;
                    border-radius: 14px;
                    border: none;
                    font-weight: 600;
                    font-size: 0.95rem;
                    cursor: pointer;
                    flex: 1;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .btn-cancel {
                    background: #f5f5f7;
                    color: #1d1d1f;
                    border: 1px solid rgba(0,0,0,0.06);
                }
                .btn-cancel:hover {
                    background: #e8e8ed;
                    color: #000;
                    transform: translateY(-2px);
                }
                .btn-confirm.danger {
                    background: #ff3b30;
                    color: white;
                    box-shadow: 0 8px 20px rgba(255, 59, 48, 0.2);
                }
                .btn-confirm.danger:hover {
                    background: #ff453a;
                    box-shadow: 0 12px 28px rgba(255, 59, 48, 0.3);
                    transform: translateY(-2px);
                }
                .btn-cancel:active, .btn-confirm:active {
                    transform: scale(0.96);
                }
            `}</style>

            <style>{`
                .tab-container {
                    display: flex; gap: 8px;
                    background: rgba(0,0,0,0.05);
                    padding: 4px; border-radius: 100px;
                    border: 1px solid var(--border-subtle);
                }
                .tab-btn {
                    padding: 6px 16px; border-radius: 20px;
                    border: none; background: transparent;
                    color: var(--text-primary); font-size: 0.85rem; font-weight: 600;
                    cursor: pointer; transition: all 0.2s;
                    display: flex; align-items: center; gap: 6px;
                }
                .tab-btn.active {
                    background: linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%);
                    color: #fff;
                    box-shadow: 0 2px 10px rgba(124,58,237,0.3);
                }
                .tab-btn:hover:not(.active) { color: #0084ff; }

                /* Dark mode tab buttons */
                html[data-theme="dark"] .tab-btn.active {
                    background: rgba(255, 255, 255, 0.15) !important;
                    color: white !important;
                }

                @media (prefers-color-scheme: dark) {
                    html[data-theme="system"] .tab-btn.active {
                        background: rgba(255, 255, 255, 0.15) !important;
                        color: white !important;
                    }
                }
                
                .tab-badge {
                    background: #ff453a; color: white;
                    font-size: 0.65rem; padding: 2px 6px; border-radius: 10px;
                }

                .empty-state {
                    display: flex; flex-direction: column; align-items: center;
                    justify-content: center; height: 300px;
                    color: var(--text-secondary); gap: 10px;
                }
                .empty-icon { font-size: 3rem; opacity: 0.5; }

                .menu-wrapper { position: relative; display: flex; align-items: center; gap: 10px; }
                .message-btn {
                    font-size: 0.8rem;
                    background: rgba(124,58,237,0.09);
                    color: #7C3AED;
                    padding: 6px 14px;
                    border-radius: 20px;
                    font-weight: 600;
                    border: 1.5px solid rgba(124,58,237,0.18);
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    letter-spacing: 0.2px;
                    cursor: pointer;
                    transition: all 0.2s;
                    white-space: nowrap;
                    background-clip: padding-box;
                }
                .message-btn:hover {
                    background: rgba(124,58,237,0.15);
                    border-color: rgba(124,58,237,0.3);
                }
                .message-btn:active {
                    transform: scale(0.96);
                }
                .btn-menu {
                    width: 40px; height: 40px;
                    background: transparent; border: none;
                    color: var(--text-secondary); cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    border-radius: 50%;
                    transition: all 0.2s;
                    opacity: 0.6;
                }
                .btn-menu:hover { 
                    background: rgba(0, 0, 0, 0.05); 
                    color: var(--text-primary);
                    opacity: 1;
                }

                .dropdown-menu {
                    position: absolute;
                    top: 48px; right: 0;
                    background: white;
                    border: 1px solid rgba(0, 0, 0, 0.08);
                    border-radius: 14px;
                    min-width: 160px;
                    z-index: 100;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08);
                    overflow: hidden;
                    animation: menuSlideIn 0.15s ease-out;
                }
                .dropdown-menu button {
                    width: 100%; text-align: left;
                    padding: 12px 16px;
                    background: transparent; border: none;
                    color: var(--text-primary); font-size: 0.9rem;
                    cursor: pointer;
                    transition: background 0.15s;
                    font-weight: 500;
                }
                .dropdown-menu button:hover { 
                    background: rgba(0, 0, 0, 0.04);
                }
                .dropdown-menu button.danger { 
                    color: #ff3b30;
                }
                .dropdown-menu button.danger:hover { 
                    background: rgba(255, 59, 48, 0.08);
                }
                
                @keyframes menuSlideIn {
                    from { 
                        opacity: 0; 
                        transform: translateY(-8px) scale(0.96);
                    }
                    to { 
                        opacity: 1; 
                        transform: translateY(0) scale(1);
                    }
                }

                .friends-page {
                    min-height: 100vh;
                    background: var(--bg-color);
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
                    background: var(--bg-color);
                    /* Removed border for ultra-clean look */
                }

                /* Dark mode Friends header */
                html[data-theme="dark"] .glass-header {
                    background: rgba(0, 0, 0, 0.95) !important;
                }

                @media (prefers-color-scheme: dark) {
                    html[data-theme="system"] .glass-header {
                        background: rgba(0, 0, 0, 0.95) !important;
                    }
                }

                .back-btn {
                    width: 40px; height: 40px;
                    background: transparent; border: none;
                    color: var(--text-primary); font-size: 1.2rem;
                    cursor: pointer; display: flex; align-items: center; justify-content: center;
                }

                .page-title {
                    font-size: 1.1rem; margin: 0; font-weight: 600;
                    color: var(--text-primary);
                }

                .scroll-content { padding: 0; padding-bottom: 100px; }

                .section { margin-bottom: 0; }
                .section-header { 
                    font-size: 0.85rem; color: var(--accent-cyan); 
                    text-transform: uppercase; letter-spacing: 1px;
                    padding: 15px 20px 5px 20px; font-weight: 700;
                    display: flex; align-items: center; gap: 10px;
                    background: var(--bg-color);
                }
                .badge { 
                    background: #ff453a; color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.7rem; 
                    box-shadow: none;
                }

                .list { display: flex; flex-direction: column; gap: 0; }

                .friend-card {
                    display: flex; align-items: center; gap: 12px;
                    padding: 8px 20px;
                    background: transparent;
                    border: 1px solid transparent;
                    border-radius: 16px;
                    margin: 0;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    position: relative;
                    overflow: visible;
                }
                 .friend-card:hover { 
                    background: rgba(124, 58, 237, 0.04);
                    border-color: rgba(124, 58, 237, 0.08);
                    transform: translateX(2px);
                }
                .friend-card:active { 
                    background: rgba(0, 0, 0, 0.04);
                    transform: translateX(0);
                }

                .avatar-container { position: relative; width: 46px; height: 46px; }
                .avatar { 
                    width: 100%; height: 100%; border-radius: 50%; object-fit: cover; 
                    background: rgba(0,0,0,0.08);
                    border: 2px solid rgba(0,0,0,0.06);
                }
                .status-indicator {
                    position: absolute; bottom: 1px; right: 1px;
                    width: 12px; height: 12px;
                    background: #aaa; border: 2px solid #ffffff;
                    border-radius: 50%;
                }
                .status-indicator.online { background: #30d158; box-shadow: 0 0 6px rgba(48,209,88,0.5); }
                .status-online { color: #30d158 !important; font-weight: 600 !important; }
                .status-offline { color: #aaa !important; }

                .info { flex: 1; min-width: 0; }
                .info h3 { margin: 0; font-size: 0.9rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0; }
                .status-text { font-size: 0.75rem; color: var(--text-secondary); opacity: 0.75; display: block; }
                .subtitle { font-size: 0.75rem; color: var(--accent-cyan); }

                .actions { display: flex; gap: 8px; align-items: center; }
                .btn-icon {
                    width: 36px; height: 36px; border-radius: 50%; border: none;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer; font-size: 1.1rem; font-weight: bold; transition: all 0.2s;
                }
                .btn-icon.accept { 
                    background: #E8F9EE; 
                    color: #24B05B;
                    border: 1px solid rgba(36, 176, 91, 0.12);
                }
                .btn-icon.accept:hover { 
                    background: #d4f5df;
                    transform: scale(1.05);
                }
                .btn-icon.decline { 
                    background: #FEECEC; 
                    color: #FF453A;
                    border: 1px solid rgba(255, 69, 58, 0.12);
                }
                .btn-icon.decline:hover { 
                    background: #fcd7d7;
                    transform: scale(1.05);
                }

                /* Search and Pill inputs */
                .search-container {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 10px 16px;
                }
                .search-bar {
                    background: rgba(118, 118, 128, 0.08);
                    border-radius: 100px;
                    padding: 0 16px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    height: 40px;
                    flex: 1;
                }
                .search-bar input {
                    background: transparent;
                    border: none;
                    outline: none;
                    color: var(--text-primary);
                    font-size: 14px;
                    width: 100%;
                }
                .search-icon {
                    color: var(--text-secondary);
                    opacity: 0.7;
                    display: flex;
                    align-items: center;
                }
                .filter-btn {
                    width: 40px;
                    height: 40px;
                    background: rgba(0, 0, 0, 0.05);
                    border: none;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--text-primary);
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .filter-btn:hover {
                    background: rgba(0, 0, 0, 0.1);
                }
                html[data-theme="dark"] .filter-btn {
                    background: rgba(255, 255, 255, 0.1);
                }
                html[data-theme="dark"] .search-bar {
                    background: rgba(255, 255, 255, 0.08);
                }

                .requests-subtitle {
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                    opacity: 0.75;
                    padding: 14px 20px 6px;
                    font-weight: 500;
                    letter-spacing: -0.1px;
                }

                .empty-state {
                    text-align: center; padding: 40px 20px;
                    color: #6e6e73;
                }
                .empty-icon { font-size: 3rem; margin-bottom: 15px; opacity: 0.5; }
                .btn-explore {
                    background: linear-gradient(135deg, #00C6FF, #0072FF);
                    border: none; padding: 12px 24px; border-radius: 20px;
                    color: white; font-weight: 600; margin-top: 20px;
                    cursor: pointer; box-shadow: 0 4px 15px rgba(0,114,255,0.3);
                }

                @media (max-width: 768px) {
                    .friend-card {
                        padding: 10px 20px;
                        margin: 0;
                        border-radius: 18px;
                    }
                    .friend-card:hover {
                        transform: none;
                    }
                    .avatar-container {
                        width: 44px;
                        height: 44px;
                    }
                    .avatar {
                        border-radius: 14px;
                    }
                    .status-indicator {
                        width: 16px;
                        height: 16px;
                        border-width: 2.5px;
                        bottom: -2px;
                        right: -2px;
                    }
                    .info h3 {
                        font-size: 0.9rem;
                        margin-bottom: 0;
                        font-weight: 600;
                    }
                    .status-text {
                        font-size: 0.75rem;
                    }
                    .btn-menu {
                        width: 44px;
                        height: 44px;
                        background: transparent;
                    }
                    .btn-menu svg {
                        width: 24px;
                        height: 24px;
                    }
                    .section-header {
                        font-size: 0.9rem;
                        padding: 16px 20px 8px 20px;
                    }
                    .friend-badge {
                        font-size: 0.7rem;
                        padding: 4px 10px;
                    }
                }
            `}</style>
        </div>
    );
}
