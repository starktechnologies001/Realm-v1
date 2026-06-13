import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import './ReplyThoughtModal.css';

export default function ReplyThoughtModal({ isOpen, onClose, currentUser, targetUserId, thoughtText, friendshipsMapRef, showToast }) {
    const [replyText, setReplyText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [accessStatus, setAccessStatus] = useState('loading'); // 'loading' | 'allowed' | 'pending' | 'rejected'
    const isSendingRef = useRef(false);

    // Check request/friendship status when modal opens
    useEffect(() => {
        if (!isOpen || !targetUserId || !currentUser?.id) return;

        const checkStatus = async () => {
            setAccessStatus('loading');

            const isFriend = friendshipsMapRef.current?.get(targetUserId)?.status === 'accepted';
            if (isFriend) {
                setAccessStatus('allowed');
                return;
            }

            const { data: existingRequest } = await supabase
                .from('message_requests')
                .select('status')
                .eq('sender_id', currentUser.id)
                .eq('receiver_id', targetUserId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!existingRequest) {
                setAccessStatus('allowed'); // No prior request — can send one
            } else if (existingRequest.status === 'accepted') {
                setAccessStatus('allowed');
            } else if (existingRequest.status === 'pending') {
                setAccessStatus('pending');
            } else if (existingRequest.status === 'rejected') {
                setAccessStatus('rejected');
            } else {
                setAccessStatus('allowed');
            }
        };

        checkStatus();
    }, [isOpen, targetUserId, currentUser?.id]);

    if (!isOpen || !targetUserId) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSendingRef.current || !replyText.trim() || !currentUser) return;
        if (accessStatus === 'pending' || accessStatus === 'rejected' || accessStatus === 'loading') return;

        isSendingRef.current = true;
        setIsSending(true);

        try {
            const isFriend = friendshipsMapRef.current?.get(targetUserId)?.status === 'accepted';

            if (isFriend || accessStatus === 'allowed') {
                // Check one more time if a prior accepted request exists
                const { data: existingRequest } = await supabase
                    .from('message_requests')
                    .select('status')
                    .eq('sender_id', currentUser.id)
                    .eq('receiver_id', targetUserId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                const requestAccepted = existingRequest?.status === 'accepted';
                const canChat = isFriend || requestAccepted;

                if (canChat) {
                    // Send as normal chat message
                    const messageContent = `Replying to your thought: "${thoughtText}"\n\n${replyText.trim()}`;
                    const { error } = await supabase
                        .from('messages')
                        .insert({
                            sender_id: currentUser.id,
                            receiver_id: targetUserId,
                            content: messageContent,
                            message_type: 'text',
                            is_read: false,
                            delivery_status: 'sent'
                        });
                    if (error) throw error;
                    if (showToast) showToast('Message sent! 💬');
                } else {
                    // Send as message request
                    const { error } = await supabase
                        .from('message_requests')
                        .insert({
                            sender_id: currentUser.id,
                            receiver_id: targetUserId,
                            content: replyText.trim(),
                            thought_text: thoughtText,
                            status: 'pending'
                        });
                    if (error) {
                        if (error.code === '23505') {
                            setAccessStatus('pending');
                            throw new Error('You already have a pending request with this user.');
                        }
                        throw error;
                    }
                    setAccessStatus('pending');
                    if (showToast) showToast('Message request sent! 📨');
                }
            }

            setReplyText('');
            onClose();
        } catch (err) {
            console.error('[ReplyModal] Error:', err);
            if (showToast) showToast(err.message || 'Failed to send reply');
        } finally {
            isSendingRef.current = false;
            setIsSending(false);
        }
    };

    const renderBody = () => {
        if (accessStatus === 'loading') {
            return (
                <div className="reply-status-box">
                    <span className="status-icon">⏳</span>
                    <p>Checking access...</p>
                </div>
            );
        }
        if (accessStatus === 'rejected') {
            return (
                <div className="reply-status-box rejected">
                    <span className="status-icon">🚫</span>
                    <p>Your previous message request was declined.</p>
                    <p className="status-hint">You can only message this person if you become friends.</p>
                </div>
            );
        }
        if (accessStatus === 'pending') {
            return (
                <div className="reply-status-box pending">
                    <span className="status-icon">⏳</span>
                    <p>Message request sent.</p>
                    <p className="status-hint">Waiting for them to accept your request.</p>
                </div>
            );
        }
        // 'allowed' — show reply form
        return (
            <form onSubmit={handleSubmit} className="reply-form">
                <input
                    type="text"
                    placeholder="Type your reply..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    disabled={isSending}
                    autoFocus
                />
                <button type="submit" disabled={!replyText.trim() || isSending}>
                    {isSending ? 'Sending...' : 'Send'}
                </button>
            </form>
        );
    };

    return (
        <AnimatePresence>
            <motion.div
                className="reply-modal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
            >
                <motion.div
                    className="reply-modal-container"
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="reply-modal-header">
                        <h3>Reply to Thought</h3>
                        <button className="close-btn" onClick={onClose}>&times;</button>
                    </div>

                    <div className="reply-modal-content">
                        <div className="thought-context">
                            <span className="quote-icon">"</span>
                            <p>{thoughtText}</p>
                            <span className="quote-icon">"</span>
                        </div>

                        {renderBody()}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
