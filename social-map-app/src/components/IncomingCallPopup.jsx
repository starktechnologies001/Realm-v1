import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { acceptCall, declineCall } from '../services/callSignalingService';
import { getAvatarHeadshot } from '../utils/avatarUtils';
import { supabase } from '../supabaseClient';

const IncomingCallPopup = ({ call, onAccept, onDecline, onDismiss }) => {
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const audioRef = useRef(null);
  const timeoutRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Play ringtone
    if (audioRef.current) {
      audioRef.current.loop = true;
      audioRef.current.play().catch(err => console.log('Audio play failed:', err));
    }

    // Auto-dismiss after 30 seconds
    timeoutRef.current = setTimeout(async () => {
      console.log('⏱️ Call timeout - marking as missed');
      await declineCall(call.session_id);
      onDismiss();
    }, 30000);

    return () => {
      // Stop ringtone
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [call, onDismiss]);

  const handleAccept = async () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    await acceptCall(call.session_id);
    onAccept(call);
  };

  const handleDecline = async (reason = null) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    
    // Decline the call first
    await declineCall(call.session_id, reason);
    
    // If a reason is provided, navigate to chat with the decline message in reply form
    if (reason) {
      // Wait a bit for the call log to be created by CallContext
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Try to find the call log message with retry logic
      let callLogMessage = null;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (!callLogMessage && attempts < maxAttempts) {
        const { data: messages } = await supabase
          .from('messages')
          .select('*')
          .eq('message_type', 'call_log')
          .or(`and(sender_id.eq.${call.caller.id},receiver_id.eq.${call.caller.id}),and(sender_id.eq.${call.caller.id},receiver_id.eq.${call.caller.id})`)
          .order('created_at', { ascending: false })
          .limit(10);
        
        // Find the most recent declined call log message
        callLogMessage = messages?.find(msg => {
          try {
            const content = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
            return (content.status === 'declined' || content.status === 'rejected') && 
                   msg.created_at > new Date(Date.now() - 5000).toISOString(); // Within last 5 seconds
          } catch {
            return false;
          }
        });
        
        if (!callLogMessage && attempts < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        attempts++;
      }
      
      console.log('📞 Found call log message:', callLogMessage);
      
      // Navigate to chat with reply context
      navigate('/chat', {
        state: {
          targetUser: call.caller,
          replyToMessage: callLogMessage,
          quickReplyText: reason
        }
      });
    }
    
    onDecline();
  };

  const quickReplies = [
    "I'm busy, call you later",
    "Can't talk right now",
    "In a meeting"
  ];

  return (
    <div className="incoming-call-overlay">
      <audio ref={audioRef} src="/ringtone.mp3" />
      
      <div className="incoming-call-popup">
        <div className="caller-info">
          <img 
            src={getAvatarHeadshot(call.caller?.avatar_url) || `https://avatar.iran.liara.run/public?username=${call.caller?.username}`}
            alt="Caller" 
            className="caller-avatar" 
          />
          <h3>{call.caller?.username || call.caller?.full_name || 'Unknown'}</h3>
          <p className="call-type">
            {call.call_type === 'audio' ? '📞 Audio Call' : '🎥 Video Call'}
          </p>
        </div>
        
        <div className="call-actions">
          <button className="accept-btn" onClick={handleAccept}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
            </svg>
            Accept
          </button>
          <button className="decline-btn" onClick={() => handleDecline()}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.68-1.36-2.66-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
            </svg>
            Decline
          </button>
        </div>
        
        <div className="quick-replies-toggle">
          <button 
            className="toggle-btn"
            onClick={() => setShowQuickReplies(!showQuickReplies)}
          >
            {showQuickReplies ? 'Hide' : 'Decline with message'}
          </button>
        </div>

        {showQuickReplies && (
          <div className="quick-replies">
            {quickReplies.map((reply, index) => (
              <button 
                key={index}
                className="quick-reply-btn"
                onClick={() => handleDecline(reply)}
              >
                {reply}
              </button>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .incoming-call-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          animation: fadeIn 0.3s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .incoming-call-popup {
          background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
          border-radius: 24px;
          padding: 40px 32px;
          max-width: 400px;
          width: 90%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          animation: slideUp 0.4s ease-out;
        }

        @keyframes slideUp {
          from {
            transform: translateY(50px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .caller-info {
          text-align: center;
          margin-bottom: 32px;
        }

        .caller-avatar {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          margin-bottom: 16px;
          border: 4px solid rgba(255, 255, 255, 0.1);
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7);
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 0 0 20px rgba(76, 175, 80, 0);
          }
        }

        .caller-info h3 {
          margin: 0 0 8px 0;
          font-size: 1.5rem;
          color: white;
          font-weight: 600;
        }

        .call-type {
          margin: 0;
          font-size: 1rem;
          color: #aaa;
        }

        .call-actions {
          display: flex;
          gap: 16px;
          margin-bottom: 20px;
        }

        .accept-btn, .decline-btn {
          flex: 1;
          padding: 16px;
          border: none;
          border-radius: 16px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s;
        }

        .accept-btn {
          background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
          color: white;
        }

        .accept-btn:hover {
          transform: scale(1.05);
          box-shadow: 0 8px 20px rgba(76, 175, 80, 0.4);
        }

        .decline-btn {
          background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);
          color: white;
        }

        .decline-btn:hover {
          transform: scale(1.05);
          box-shadow: 0 8px 20px rgba(244, 67, 54, 0.4);
        }

        .quick-replies-toggle {
          text-align: center;
          margin-bottom: 12px;
        }

        .toggle-btn {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #aaa;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .toggle-btn:hover {
          border-color: rgba(255, 255, 255, 0.4);
          color: white;
        }

        .quick-replies {
          display: flex;
          flex-direction: column;
          gap: 8px;
          animation: slideDown 0.3s ease-out;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .quick-reply-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #ddd;
          padding: 12px;
          border-radius: 12px;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .quick-reply-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
          color: white;
        }
      `}</style>
    </div>
  );
};

export default IncomingCallPopup;
