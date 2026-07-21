import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { getAvatarHeadshot } from '../utils/avatarUtils';
import Toast from './Toast';
import FullProfileModal from './FullProfileModal';
import ReportModal from './ReportModal';

export default function MessageRequestsPage({ onClose, currentUser }) {
    const navigate = useNavigate();
    const [localUser, setLocalUser] = useState(currentUser);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [toastMsg, setToastMsg] = useState(null);
    const [processingId, setProcessingId] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);
    const [reportTargetUser, setReportTargetUser] = useState(null);

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
                            name: sender.username || sender.full_name,
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
            setReportTargetUser(targetUser);
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
                {/* Ambient background orbs */}
                <div className="requests-orb-tl" />
                <div className="requests-orb-br" />

                <header className="glass-header">
                    <div className="header-top" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', position: 'relative', zIndex: 1 }}>
                        <button className="back-btn" onClick={handleClose} aria-label="Go back">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="19" y1="12" x2="5" y2="12"></line>
                                <polyline points="12 19 5 12 12 5"></polyline>
                            </svg>
                        </button>
                        <h1 className="page-title" style={{ margin: 0, fontSize: '1.25rem' }}>Message Requests</h1>
                    </div>
                </header>

                <div className="requests-page-content" style={{ position: 'relative', zIndex: 1 }}>
                    {loading ? (
                        <div className="loading-state">
                            <div className="spinner"></div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>Loading requests...</p>
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
                                        width="44"
                                        height="44"
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
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    }
                    
                    .requests-orb-tl {
                      position: fixed; top: -10%; left: -10%;
                      width: 50vw; height: 50vw; max-width: 350px; max-height: 350px;
                      background: radial-gradient(circle, rgba(124,58,237,0.05) 0%, transparent 70%);
                      border-radius: 50%; pointer-events: none; z-index: 0;
                    }
                    .requests-orb-br {
                      position: fixed; bottom: -10%; right: -10%;
                      width: 50vw; height: 50vw; max-width: 350px; max-height: 350px;
                      background: radial-gradient(circle, rgba(99,102,241,0.05) 0%, transparent 70%);
                      border-radius: 50%; pointer-events: none; z-index: 0;
                    }

                    .glass-header {
                        background: var(--card-bg, rgba(255, 255, 255, 0.7));
                        backdrop-filter: blur(20px);
                        -webkit-backdrop-filter: blur(20px);
                        border-bottom: 1px solid var(--glass-border);
                        z-index: 10;
                    }

                    .back-btn {
                        background: none;
                        border: none;
                        color: var(--text-primary);
                        cursor: pointer;
                        padding: 8px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: background-color 0.2s, transform 0.1s;
                    }
                    .back-btn:hover {
                        background-color: var(--bg-secondary, rgba(0,0,0,0.04));
                    }
                    .back-btn:active {
                        transform: scale(0.92);
                    }
                    
                    .page-title {
                        font-weight: 700;
                        color: var(--text-primary);
                        letter-spacing: -0.5px;
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
                        background: var(--bg-secondary, #ffffff);
                        border-radius: 20px;
                        padding: 20px;
                        border: 1px solid var(--glass-border);
                        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.02), 0 2px 4px rgba(0, 0, 0, 0.01);
                        transition: transform 0.2s ease, box-shadow 0.2s ease;
                    }
                    
                    .request-card:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.04);
                    }
                    
                    .request-header {
                        display: flex;
                        align-items: center;
                        gap: 14px;
                        margin-bottom: 16px;
                    }
                    
                    .request-avatar {
                        width: 44px;
                        height: 44px;
                        border-radius: 50%;
                        object-fit: cover;
                        border: 2px solid var(--bg-secondary, #ffffff);
                        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.06);
                    }
                    
                    .request-info h4 {
                        margin: 0 0 2px 0;
                        font-size: 1rem;
                        font-weight: 700;
                        color: var(--text-primary);
                        letter-spacing: -0.1px;
                    }
                    @media (max-width: 480px) {
                        .request-info h4 {
                            font-size: 0.95rem;
                        }
                    }
                    
                    .request-time {
                        font-size: 0.76rem;
                        color: var(--text-secondary);
                        font-weight: 500;
                    }
                    
                    .request-thought {
                        font-size: 0.86rem;
                        padding: 10px 14px;
                        background: linear-gradient(135deg, rgba(124, 58, 237, 0.06) 0%, rgba(99, 102, 241, 0.04) 100%);
                        border-left: 3px solid #7C3AED;
                        border-radius: 4px 12px 12px 4px;
                        margin-bottom: 14px;
                    }
                    
                    .request-thought strong {
                        color: #7C3AED;
                        display: block;
                        font-size: 0.8rem;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        margin-bottom: 4px;
                    }
                    
                    .request-thought p {
                        margin: 0;
                        color: var(--text-primary);
                        font-style: italic;
                        font-weight: 500;
                    }
                    
                    .request-message {
                        margin-bottom: 18px;
                        padding-left: 2px;
                    }
                    
                    .request-message p {
                        margin: 0;
                        font-size: 0.96rem;
                        color: var(--text-primary);
                        line-height: 1.45;
                        font-weight: 400;
                    }
                    
                    .request-actions {
                        display: flex;
                        gap: 12px;
                    }
                    
                    .request-actions button {
                        flex: 1;
                        padding: 12px;
                        border-radius: 12px;
                        font-weight: 600;
                        font-size: 0.95rem;
                        cursor: pointer;
                        border: none;
                        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                        box-sizing: border-box;
                    }

                    .request-actions button:active {
                        transform: scale(0.97);
                    }

                    .request-actions button:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                        transform: none;
                    }
                    
                    .decline-btn {
                        background: rgba(239, 68, 68, 0.08);
                        color: #EF4444;
                        border: 1.5px solid rgba(239, 68, 68, 0.1) !important;
                    }
                    
                    .decline-btn:hover:not(:disabled) {
                        background: rgba(239, 68, 68, 0.14);
                        border-color: rgba(239, 68, 68, 0.2) !important;
                    }
                    
                    .accept-btn {
                        background: linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%);
                        color: white;
                        box-shadow: 0 4px 14px rgba(124, 58, 237, 0.2);
                    }

                    .accept-btn:hover:not(:disabled) {
                        box-shadow: 0 6px 20px rgba(124, 58, 237, 0.3);
                        transform: translateY(-1px);
                    }
                    .accept-btn:active:not(:disabled) {
                        transform: translateY(1px) scale(0.97);
                    }

                    .loading-state {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 40px;
                        height: 60%;
                    }
                    .spinner {
                        width: 32px;
                        height: 32px;
                        border: 3px solid rgba(124, 58, 237, 0.1);
                        border-top-color: #7C3AED;
                        border-radius: 50%;
                        animation: spin 0.8s linear infinite;
                        margin-bottom: 16px;
                    }
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }

                    .empty-state {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 40px 20px;
                        text-align: center;
                        height: 60%;
                    }
                    .empty-icon {
                        font-size: 3rem;
                        margin-bottom: 16px;
                        filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.05));
                    }
                    .empty-state h3 {
                        font-size: 1.15rem;
                        font-weight: 700;
                        color: var(--text-primary);
                        margin: 0 0 8px 0;
                    }
                    .empty-state p {
                        font-size: 0.9rem;
                        color: var(--text-secondary);
                        max-width: 250px;
                        margin: 0;
                        line-height: 1.4;
                    }
                `}</style>
            </motion.div>

            {/* Report Modal */}
            {reportTargetUser && (
                <ReportModal
                    targetUser={reportTargetUser}
                    onClose={() => setReportTargetUser(null)}
                    onSuccess={() => showToast("Report submitted successfully ✅")}
                    onError={(msg) => showToast(msg)}
                />
            )}
        </AnimatePresence>
    );
}
