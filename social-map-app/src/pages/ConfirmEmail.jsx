import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';

export default function ConfirmEmail() {
  const [status, setStatus] = useState('verifying'); // Default to verifying while we check
  const [errorMessage, setErrorMessage] = useState('');
  
  // Resend Logic
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || '');
  const [timeLeft, setTimeLeft] = useState(90); // 1 minute 30 seconds
  const [sending, setSending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  
  const navigate = useNavigate();

  // Timer Effect
  useEffect(() => {
    if (timeLeft > 0) {
        const timerId = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
        return () => clearInterval(timerId);
    }
  }, [timeLeft]);

  const handleResend = async () => {
      if (!email) {
          setResendMessage("Email address not found. Please try logging in.");
          return;
      }
      setSending(true);
      setResendMessage("");
      try {
          const { error } = await supabase.auth.resend({
              type: 'signup',
              email: email,
              options: {
                  emailRedirectTo: `${window.location.origin}/confirm-email`
              }
          });
          if (error) throw error;
          
          setResendMessage("Confirmation link sent! 📧");
          setTimeLeft(90); // Reset timer
      } catch (err) {
          console.error("Resend error:", err);
          setResendMessage(err.message || "Failed to resend email.");
      } finally {
          setSending(false);
      }
  };

  useEffect(() => {
    // 1. Parse URL hash for errors (Supabase returns errors in hash)
    const hash = window.location.hash;
    if (hash && hash.includes('error=')) {
        const params = new URLSearchParams(hash.substring(1));
        const errorDesc = params.get('error_description');
        setErrorMessage(errorDesc?.replace(/\+/g, ' ') || 'Verification link expired or invalid.');
        setStatus('error');
        return;
    }

    // 2. Standard checking logic
    let intervalId;

    const checkConfirmation = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (user?.email_confirmed_at) {
          setStatus('success');
          // Ensure session is fresh
          await supabase.auth.refreshSession();
          clearInterval(intervalId);
        } else {
             // If we don't have a user, and we also don't have an error hash, 
             // and we aren't in the middle of a hash-based flow (no access_token)...
             // We assume we are in the "Waiting" state (redirected from Signup).
             
             // However, checks might fail initially if session is establishing.
             // We'll only switch to 'pending' if we really think we are just waiting.
             if (!user && !hash.includes('access_token') && !hash.includes('type=signup') && !hash.includes('type=recovery')) {
                 setStatus('pending');
             } 
             
             // If we DO have a user but email_confirmed_at is false, status is pending.
             if (user && !user.email_confirmed_at) {
                 setStatus('pending');
             }
        }
      } catch (err) {
        console.error("Confirmation check failed:", err);
      }
    };

    // Initial check
    checkConfirmation();

    // Poll every 3 seconds
    intervalId = setInterval(checkConfirmation, 3000);

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email_confirmed_at) {
          setStatus('success');
          clearInterval(intervalId);
        }
      }
    });
    
    // Check on window focus
    const onFocus = () => checkConfirmation();
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="confirm-email-container">
      <div className="confirm-card">
        
        {status === 'verifying' && (
          <div className="status-content">
            <div className="icon-wrapper pulse">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
            <h2>Verifying...</h2>
            <p>Please wait while we verify your email address.</p>
          </div>
        )}
        
        {status === 'pending' && (
          <div className="status-content">
            <div className="icon-wrapper">
              {/* Mail Icon */}
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            </div>
            <h2>Check Your Email</h2>
            <p>We've sent a confirmation link to your inbox.</p>
            
            <div className="info-box">
                <p>Click the link in the email to activate your account.</p>
            </div>

            <div style={{ marginBottom: '20px', width: '100%' }}>
                <button 
                    onClick={handleResend} 
                    disabled={timeLeft > 0 || sending}
                    className="secondary-btn"
                    style={{ 
                        background: 'rgba(255,255,255,0.1)', 
                        border: '1px solid rgba(255,255,255,0.2)',
                        marginBottom: '10px',
                        cursor: (timeLeft > 0 || sending) ? 'default' : 'pointer',
                        opacity: (timeLeft > 0 || sending) ? 0.6 : 1
                    }}
                >
                    {sending ? 'Sending...' : timeLeft > 0 ? `Resend Email (${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')})` : 'Resend Email'}
                </button>
                {resendMessage && <p style={{ fontSize: '0.85rem', color: resendMessage.includes('sent') ? '#4ade80' : '#ff453a', margin: '5px 0 0 0' }}>{resendMessage}</p>}
            </div>
            
            <button onClick={() => navigate('/')} className="primary-btn">
              Back to Login
            </button>
          </div>
        )}
        
        {status === 'success' && (
          <div className="status-content">
            <div className="icon-wrapper spread success-icon">
              {/* Green Tick */}
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h2>Email verified successfully</h2>
            <p>You can now log in to your account.</p>
            
            <button onClick={() => navigate('/')} className="primary-btn success-btn">
              Back to Login
            </button>
          </div>
        )}
        
        {status === 'error' && (
          <div className="status-content">
            <div className="icon-wrapper error-icon">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ff453a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                 <circle cx="12" cy="12" r="10"></circle>
                 <line x1="15" y1="9" x2="9" y2="15"></line>
                 <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            </div>
            <h2 style={{color: '#ff453a'}}>Verification Failed</h2>
            <p>{errorMessage}</p>
            
            <button onClick={() => navigate('/')} className="primary-btn error-btn">
               Back to Login
            </button>
          </div>
        )}

      </div>

      <style>{`
        .confirm-email-container {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: #000;
            background-image: 
                radial-gradient(circle at 50% 0%, rgba(0, 122, 255, 0.1) 0%, transparent 50%);
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: white;
        }

        .confirm-card {
            width: 100%;
            max-width: 420px;
            padding: 48px 36px;
            border-radius: 28px;
            background: rgba(28, 28, 30, 0.95);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
            text-align: center;
            animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
            z-index: 10;
        }

        @keyframes slideUp {
            from { transform: translateY(30px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }

        .status-content {
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .icon-wrapper {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 28px;
        }
        
        .success-icon {
            background: rgba(74, 222, 128, 0.1);
            border-color: rgba(74, 222, 128, 0.2);
            animation: scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        .error-icon {
            background: rgba(255, 69, 58, 0.1); 
            border-color: rgba(255, 69, 58, 0.2);
            animation: shake 0.4s ease-in-out;
        }
        
        @keyframes scaleIn {
            from { transform: scale(0.5); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
        }
        
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
        }

        .pulse { animation: pulse 2s infinite; }

        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.1); }
            70% { box-shadow: 0 0 0 15px rgba(255, 255, 255, 0); }
            100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
        }

        h2 {
            margin: 0 0 12px 0;
            font-size: 1.85rem;
            font-weight: 700;
            color: #fff;
            letter-spacing: -0.5px;
        }

        p {
            margin: 0 0 28px 0;
            color: #aaa;
            line-height: 1.6;
            font-size: 0.95rem;
        }

        .info-box {
            background: rgba(15, 25, 42, 0.9);
            border: 1px solid rgba(94, 234, 212, 0.25);
            border-radius: 16px;
            padding: 20px 24px;
            margin-bottom: 28px;
            width: 100%;
            box-sizing: border-box;
        }

        .info-box p {
            margin: 0;
            color: #5eead4;
            font-size: 0.95rem;
            font-weight: 500;
            line-height: 1.5;
        }

        .primary-btn {
            background: linear-gradient(135deg, #00d4ff 0%, #0084ff 100%);
            color: white;
            border: none;
            padding: 16px 24px;
            border-radius: 14px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            width: 100%;
            box-shadow: 0 6px 16px rgba(0, 132, 255, 0.35);
        }

        .primary-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(0, 132, 255, 0.45);
        }

        .primary-btn:active {
            transform: scale(0.98);
        }
        
        .success-btn {
            background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
            box-shadow: 0 6px 16px rgba(34, 197, 94, 0.35);
        }
        
        .success-btn:hover {
            box-shadow: 0 8px 24px rgba(34, 197, 94, 0.45);
        }
        
        .error-btn {
            background: linear-gradient(135deg, #ff453a 0%, #ff3b30 100%);
            box-shadow: 0 6px 16px rgba(255, 69, 58, 0.35);
        }
        
        .error-btn:hover {
            box-shadow: 0 8px 24px rgba(255, 69, 58, 0.45);
        }

      `}</style>
    </div>
  );
}
