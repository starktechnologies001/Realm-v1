import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

export default function ConfirmEmail() {
  const [status, setStatus] = useState('verifying');
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is confirmed
    const checkConfirmation = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user?.email_confirmed_at) {
        setStatus('success');
        setTimeout(() => navigate('/map'), 2000);
      } else {
        setStatus('pending');
      }
    };

    checkConfirmation();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user?.email_confirmed_at) {
        setStatus('success');
        setTimeout(() => navigate('/map'), 2000);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        padding: '40px',
        borderRadius: '20px',
        textAlign: 'center',
        maxWidth: '400px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
      }}>
        {status === 'verifying' && (
          <>
            <div style={{ fontSize: '3rem', marginBottom: '20px' }}>⏳</div>
            <h2 style={{ color: '#333', marginBottom: '10px' }}>Verifying...</h2>
            <p style={{ color: '#666' }}>Please wait while we verify your email.</p>
          </>
        )}
        
        {status === 'pending' && (
          <>
            <div style={{ fontSize: '3rem', marginBottom: '20px' }}>📧</div>
            <h2 style={{ color: '#333', marginBottom: '10px' }}>Check Your Email</h2>
            <p style={{ color: '#666', marginBottom: '10px' }}>
              We've sent a confirmation link to your email address.
            </p>
            <p style={{ color: '#999', fontSize: '0.9rem', marginTop: '20px' }}>
              Click the link in the email to verify your account.
            </p>
            <button
              onClick={() => navigate('/')}
              style={{
                marginTop: '30px',
                padding: '12px 24px',
                background: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '1rem'
              }}
            >
              Back to Login
            </button>
          </>
        )}
        
        {status === 'success' && (
          <>
            <div style={{ fontSize: '3rem', marginBottom: '20px' }}>✅</div>
            <h2 style={{ color: '#333', marginBottom: '10px' }}>Email Verified!</h2>
            <p style={{ color: '#666', marginBottom: '10px' }}>
              Your account has been confirmed.
            </p>
            <p style={{ color: '#999', fontSize: '0.9rem' }}>
              Redirecting to map...
            </p>
          </>
        )}
      </div>
    </div>
  );
}
