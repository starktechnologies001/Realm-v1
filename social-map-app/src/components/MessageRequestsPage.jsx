import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { getAvatarHeadshot } from '../utils/avatarUtils';
import Toast from './Toast';
import FullProfileModal from './FullProfileModal';

export default function MessageRequestsPage({ onClose, currentUser }) {
    const navigate = useNavigate();
    const [localUser, setLocalUser] = useState(currentUser);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [toastMsg, setToastMsg] = useState(null);
    const [processingId, setProcessingId] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);

    const showToast = (msg) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 3000);
    };

    useEffect(() => {
        if (currentUser) {
            setLocalUser(currentUser);
            return;
        }
        const fetchUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .maybeSingle();
                setLocalUser(profile || session.user);
            }
        };
        fetchUser();
    }, [currentUser]);

    useEffect(() => {
        if (!localUser) return;

        const fetchRequests = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('message_requests')
                    .select(`
                        id,
                        content,
                        thought_text,
                        created_at,
                        sender:profiles!sender_id (
                            id,
                            username,
                            full_name,
                            avatar_url,
                            gender,
                            status,
                            relationship_status,
                            hide_status,
                            show_last_seen,
                            subscription_tier,
                            avatar_effect
                        )
                    `)
                    .eq('receiver_id', localUser.id)
                    .eq('status', 'pending')
                    .order('created_at', { ascending: false });

                if (error) throw error;
                setRequests(data || []);
            } catch (err) {
                console.error("Error fetching message requests:", err);
                showToast("Failed to load requests");
            } finally {
                setLoading(false);
            }
        };

        fetchRequests();
    }, [localUser]);

    const handleClose = onClose || (() => navigate(-1));

    const handleAccept = async (request) => {
        if (processingId) return;
        setProcessingId(request.id);
        try {
            const { data, error } = await supabase.rpc('accept_message_request', {
                p_request_id: request.id
            });

            if (error) throw error;

            if (data && data.success) {
                // Remove request from list immediately
                setRequests(prev => prev.filter(r => r.id !== request.id));

                // Navigate to chat with the sender
                const sender = request.sender;
                handleClose();
                navigate('/chat', {
                    state: {
                        targetUser: {
                            id: sender.id,
                            name: sender.full_name || sender.username,
                            username: sender.username,
                            avatar_url: sender.avatar_url,
                            gender: sender.gender,
                        }
                    }
                });
            } else {
                showToast(data?.error || "Failed to accept request");
            }
        } catch (err) {
            console.error("Error accepting request:", err);
            showToast("Error accepting request");
        } finally {
            setProcessingId(null);
        }
    };

    const handleDecline = async (requestId) => {
        if (processingId) return;
        setProcessingId(requestId);
        try {
            const { error } = await supabase
                .from('message_requests')
                .delete()
                .eq('id', requestId);

            if (error) throw error;

            // Remove request from list immediately
            setRequests(prev => prev.filter(r => r.id !== requestId));
            showToast("Request declined");
        } catch (err) {
            console.error("Error declining request:", err);
            showToast("Error declining request");
        } finally {
            setProcessingId(null);
        }
    };

    const handleProfileModalAction = async (action, targetUser) => {
        if (action === 'message') {
            setSelectedUser(null);
        } else if (action === 'call-audio' || action === 'call-video') {
            setSelectedUser(null);
            showToast("Accept the request to start a call");
        } else if (action === 'block') {
            setSelectedUser(null);
            try {
                const { data: existingFriendship } = await supabase
                    .from('friendships')
                    .select('id')
                    .or(`and(requester_id.eq.${localUser.id},receiver_id.eq.${targetUser.id}),and(requester_id.eq.${targetUser.id},receiver_id.eq.${localUser.id})`)
                    .maybeSingle();

                if (existingFriendship) {
                    await supabase
                        .from('friendships')
                        .update({ status: 'blocked', requester_id: localUser.id, receiver_id: targetUser.id })
                        .eq('id', existingFriendship.id);
                } else {
                    await supabase
                        .from('friendships')
                        .insert({ requester_id: localUser.id, receiver_id: targetUser.id, status: 'blocked' });
                }
                showToast(`🚫 Blocked ${targetUser.username || targetUser.full_name}`);
                setRequests(prev => prev.filter(r => r.sender.id !== targetUser.id));
            } catch (err) {
                console.error("Error blocking user:", err);
                showToast("Failed to block user");
            }
        } else if (action === 'unfriend') {
            setSelectedUser(null);
            try {
                await supabase.from('friendships')
                    .delete()
                    .or(`and(requester_id.eq.${localUser.id},receiver_id.eq.${targetUser.id}),and(requester_id.eq.${targetUser.id},receiver_id.eq.${localUser.id})`);
                showToast("Friend request cancelled/removed");
            } catch (err) {
                console.error("Error unfriending:", err);
            }
        } else if (action === 'report') {
            setSelectedUser(null);
            const reason = prompt("Reason for reporting:");
            if (reason) {
                try {
                    await supabase.from('reports').insert({
                        reporter_id: localUser.id,
                        reported_id: targetUser.id,
                        reason: reason
                    });
                    showToast("Report submitted successfully ✅");
                } catch (err) {
                    console.error("Error reporting:", err);
                    showToast("Failed to submit report");
                }
            }
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                className="requests-page-container"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 50 }}
                transition={{ duration: 0.2 }}
            >
                <header className="glass-header">
                    <div className="header-top" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <button className="back-btn" onClick={handleClose} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: '1.5rem', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                            ←
                        </button>
                        <h1 className="page-title" style={{ margin: 0, fontSize: '1.25rem' }}>Message Requests</h1>
                    </div>
                </header>

                <div className="requests-page-content">
                    {loading ? (
                        <div className="loading-state">
                            <div className="spinner"></div>
                            <p>Loading requests...</p>
                        </div>
                    ) : requests.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">📭</div>
                            <h3>No Message Requests</h3>
                            <p>There are no pending message requests.</p>
                        </div>
                    ) : (
                        requests.map(request => (
                            <motion.div
                                key={request.id}
                                className="request-card"
                                initial={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                layout
                            >
                                <div className="request-header">
                                    <img
                                        src={getAvatarHeadshot(request.sender.avatar_url)}
                                        alt={request.sender.username}
                                        className="request-avatar"
                                        width="40"
                                        height="40"
                                        loading="lazy"
                                        decoding="async"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => setSelectedUser(request.sender)}
                                    />
                                    <div 
                                        className="request-info"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => setSelectedUser(request.sender)}
                                    >
                                        <h4>{request.sender.username || request.sender.full_name}</h4>
                                        <span className="request-time">
                                            {new Date(request.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>

                                {request.thought_text && (
                                    <div className="request-thought">
                                        <strong>Replied to your thought:</strong>
                                        <p>"{request.thought_text}"</p>
                                    </div>
                                )}

                                <div className="request-message">
                                    <p>{request.content}</p>
                                </div>

                                <div className="request-actions">
                                    <button
                                        className="decline-btn"
                                        onClick={() => handleDecline(request.id)}
                                        disabled={processingId === request.id}
                                    >
                                        {processingId === request.id ? '...' : 'Decline'}
                                    </button>
                                    <button
                                        className="accept-btn"
                                        onClick={() => handleAccept(request)}
                                        disabled={processingId === request.id}
                                    >
                                        {processingId === request.id ? '...' : 'Accept'}
                                    </button>
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>

                {selectedUser && (
                    <FullProfileModal
                        user={selectedUser}
                        currentUser={localUser}
                        onClose={() => setSelectedUser(null)}
                        onAction={handleProfileModalAction}
                    />
                )}

                {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}

                <style>{`
                    .requests-page-container {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: var(--bg-color);
                        display: flex;
                        flex-direction: column;
                        z-index: 9999;
                    }
                    
                    .requests-page-content {
                        flex: 1;
                        overflow-y: auto;
                        padding: 16px;
                        display: flex;
                        flex-direction: column;
                        gap: 16px;
                    }
                        
                        .request-card {
                            background: var(--bg-secondary);
                            border-radius: 16px;
                            padding: 16px;
                            border: 1px solid var(--glass-border);
                        }
                        
                        .request-header {
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            margin-bottom: 12px;
                        }
                        
                        .request-avatar {
                            width: 40px;
                            height: 40px;
                            border-radius: 50%;
                            object-fit: cover;
                        }
                        
                        .request-info h4 {
                            margin: 0;
                            font-size: 0.95rem;
                            color: var(--text-primary);
                        }
                        @media (max-width: 480px) {
                            .request-info h4 {
                                font-size: 0.88rem;
                            }
                        }
                        
                        .request-time {
                            font-size: 0.75rem;
                            color: var(--text-secondary);
                        }
                        
                        .request-thought {
                            font-size: 0.85rem;
                            padding: 8px 12px;
                            background: rgba(0, 132, 255, 0.1);
                            border-left: 3px solid #0084ff;
                            border-radius: 4px 8px 8px 4px;
                            margin-bottom: 12px;
                        }
                        
                        .request-thought strong {
                            color: #0084ff;
                            display: block;
                            margin-bottom: 4px;
                        }
                        
                        .request-thought p {
                            margin: 0;
                            color: var(--text-primary);
                            font-style: italic;
                        }
                        
                        .request-message {
                            margin-bottom: 16px;
                        }
                        
                        .request-message p {
                            margin: 0;
                            font-size: 0.95rem;
                            color: var(--text-primary);
                            line-height: 1.4;
                        }
                        
                        .request-actions {
                            display: flex;
                            gap: 10px;
                        }
                        
                        .request-actions button {
                            flex: 1;
                            padding: 10px;
                            border-radius: 10px;
                            font-weight: 600;
                            cursor: pointer;
                            border: none;
                            transition: all 0.2s;
                        }

                        .request-actions button:disabled {
                            opacity: 0.5;
                            cursor: not-allowed;
                        }
                        
                        .decline-btn {
                            background: rgba(255, 59, 48, 0.1);
                            color: #ff3b30;
                        }
                        
                        .decline-btn:hover:not(:disabled) {
                            background: rgba(255, 59, 48, 0.2);
                        }
                        
                        .accept-btn {
                            background: #0084ff;
                            color: white;
                        }

                        .accept-btn:hover:not(:disabled) {
                            background: #0073e6;
                        }
                `}</style>
            </motion.div>
        </AnimatePresence>
    );
}
