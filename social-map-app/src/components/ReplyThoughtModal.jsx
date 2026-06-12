import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import Toast from './Toast';
import './ReplyThoughtModal.css';

export default function ReplyThoughtModal({ isOpen, onClose, currentUser, targetUserId, thoughtText, friendshipsMapRef }) {
    const [replyText, setReplyText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const isSendingRef = useRef(false);

    if (!isOpen || !targetUserId) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSendingRef.current || !replyText.trim() || !currentUser) return;
        
        isSendingRef.current = true;
        setIsSending(true);
        
        try {
            const isFriend = friendshipsMapRef.current.get(targetUserId)?.status === 'accepted';
            
            if (isFriend) {
                // Insert into messages as a normal chat
                const tempId = `temp_${Date.now()}`;
                
                // Embed the thought context into the message so it's clear what they are replying to
                const messageContent = `Replying to your thought: "${thoughtText}"\n\n${replyText.trim()}`;
                
                const { error } = await supabase
                    .from('messages')
                    .insert({
                        sender_id: currentUser.id,
                        receiver_id: targetUserId,
                        content: messageContent,
                        message_type: 'text',
                        is_read: false,
                        delivery_status: 'sent' // Fallback, will update if recipient is online
                    });
                    
                if (error) throw error;
            } else {
                // Insert into message_requests
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
                    if (error.code === '23505') { // Unique violation
                        throw new Error("You already have a pending request with this user.");
                    }
                    throw error;
                }
            }
            
            Toast.show(isFriend ? "Message sent!" : "Message request sent!");
            setReplyText('');
            onClose();
        } catch (err) {
            console.error("Error sending reply:", err);
            Toast.show(err.message || "Failed to send reply");
        } finally {
            isSendingRef.current = false;
            setIsSending(false);
        }
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
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
