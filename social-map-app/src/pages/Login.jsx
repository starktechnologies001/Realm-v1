import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { generateRandomRPMAvatar } from '../utils/avatarUtils';

const INTERESTS_OPTIONS = ['Singing', 'Dating', 'Travelling', 'Gaming', 'Cooking', 'Hiking', 'Reading', 'Music'];
const STATUS_OPTIONS = ['Single', 'Married', 'Committed', 'Open to Date'];
const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Other'];



export default function Login() {
  // New Reset Password States
  const [resetStep, setResetStep] = useState(1); // 1: Email, 2: OTP, 3: New Password
  const [resetOtp, setResetOtp] = useState('');
  const [newResetPassword, setNewResetPassword] = useState('');

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isEmailVerified, setIsEmailVerified] = useState(false);


  // New Profile Fields
  const [status, setStatus] = useState('');
  const [gender, setGender] = useState('');
  const [selectedInterests, setSelectedInterests] = useState([]);

  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [checkingUsername, setCheckingUsername] = useState(false);

  // Check Username Availability
  React.useEffect(() => {
    const checkUsername = async () => {
      if (!username || username.length < 3 || !isSignUp) {
        setUsernameError('');
        return;
      }
      setCheckingUsername(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', username)
          .single();
        
        if (data) {
          setUsernameError('Username is already taken');
        } else {
          setUsernameError('');
        }
      } catch (err) {
        // Ignore "row not found" error which means username is available
        setUsernameError('');
      } finally {
        setCheckingUsername(false);
      }
    };

    const timeout = setTimeout(checkUsername, 500);
    return () => clearTimeout(timeout);
  }, [username, isSignUp]);

  // ... (rest of code) ...
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const toggleInterest = (interest) => {
    if (selectedInterests.includes(interest)) {
      setSelectedInterests(selectedInterests.filter(i => i !== interest));
    } else {
      if (selectedInterests.length < 5) {
        setSelectedInterests([...selectedInterests, interest]);
      }
    }
  };



  const validatePassword = (pwd) => {
    const minLength = 8;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pwd);
    return pwd.length >= minLength && hasUpper && hasLower && hasNumber && hasSpecial;
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (isSignUp ? !email.trim() : !username.trim() || !password.trim()) {
      setError(`Please enter ${isSignUp ? "email" : "username"} and password.`);
      setLoading(false);
      return;
    }

    try {
      if (isSignUp) {
        // 1. Strict Validation
        if (!username.trim()) throw new Error('Username is required.');
        if (!status) throw new Error('Please select a relationship status.');
        if (!gender) throw new Error('Please select a gender.');

        // 2. Password Strength
        if (!validatePassword(password)) {
          throw new Error('Password must be 8+ chars with Upper, Lower, Number & Symbol.');
        }

        // 3. (Selfie Verification Removed)

        // Assign specific default avatar based on gender (User Request)
        let avatarUrl;
        if (gender === 'Male') {
            avatarUrl = '/defaults/male_avatar.jpg';
        } else if (gender === 'Female') {
            avatarUrl = '/defaults/female_avatar.jpg';
        } else {
            // Fallback for Non-binary/Other to a neutral one or one of the above
            // Using Male as generic fallback or maybe I should copy a neutral one.
            // For now, let's use Male as generic default if no other option, or maybe a dicebear backup.
            // User said: "if female then girl avatar if male then boy avatar". didn't specify others.
            // I'll use a neutral dicebear for others to be safe, or just default to male.
            // Let's use DiceBear for others to keep it distinct.
             avatarUrl = `https://api.dicebear.com/9.x/adventurer/svg?seed=${username}`;
        }

        // 4. Sign Up
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/confirm-email`,
            data: {
              username: username,
              full_name: username,
              avatar_url: avatarUrl,
              status: status,
              gender: gender,
              interests: selectedInterests
            }
          }
        });

        if (signUpError) throw signUpError;

        setError('✅ Account created! Please check your email to verify your account.');
        setTimeout(() => navigate("/confirm-email"), 2000);

      } else {
        // Login Logic - Look up email from username
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('email')
          .eq('username', username)
          .single();

        if (profileError || !profileData || !profileData.email) {
          throw new Error('Username not found. Please check your username.');
        }

        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: profileData.email,
          password,
        });

        if (signInError) throw signInError;

        if (data.session) {
          // Fetch complete profile from database to get avatar and all fields
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.session.user.id)
            .single();

          if (profileError) {
            console.error('Profile fetch error:', profileError);
            const userMeta = data.session.user.user_metadata;
            localStorage.setItem('currentUser', JSON.stringify({
              id: data.session.user.id,
              name: userMeta.username || data.session.user.email,
              username: userMeta.username,
              full_name: userMeta.full_name,
              gender: userMeta.gender,
              avatar_url: userMeta.avatar_url,
              status: userMeta.status || 'Online'
            }));
          } else {
            localStorage.setItem('currentUser', JSON.stringify({
              id: profile.id,
              name: profile.username || profile.full_name,
              username: profile.username,
              full_name: profile.full_name,
              gender: profile.gender,
              avatar_url: profile.avatar_url, 
              status: profile.status || 'Online',
              interests: profile.interests
            }));
          }
          navigate('/map');
        }
      }
    } catch (err) {
      console.error(err);
      if (err.message && (err.message.includes('User already registered') || err.message.includes('unique constraint'))) {
        setError('⚠️ This email is already linked to an account! Please Log In instead.');
      } else {
        setError(err.message || 'Authentication failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
          redirectTo: window.location.origin + '/map'
        }
      });
      if (error) throw error;
    } catch (err) {
      console.error("Google Login Error:", err);
      setError("Failed to initialize Google Login");
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="app-title">SocialMap</h1>
        <p className="app-subtitle">
          {isSignUp ? "Create your profile" : "Welcome Back"}
        </p>

        <div className="auth-toggle">
          <button
            className={`toggle-btn ${!isSignUp ? 'active' : ''}`}
            onClick={() => { setIsSignUp(false); setError(''); }}
          >
            Log In
          </button>
          <button
            className={`toggle-btn ${isSignUp ? 'active' : ''}`}
            onClick={() => { setIsSignUp(true); setError(''); }}
          >
            Signup
          </button>
        </div>


        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleAuth} className="login-form">
          {/* Base Credentials */}
          {isSignUp && (
            <div className="input-group">
              <input
                type="email"
                className="input-field"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          )}
          {!isSignUp && (
            <>
              <div className="input-group">
                <input
                  type="text"
                  className="input-field"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="input-group">
                <input
                  type="password"
                  className="input-field"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </>
          )}


          {isSignUp && (
          <>
          <div className="input-group">
            <input
              type="text"
              className="input-field"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={usernameError ? { borderColor: '#ff453a' } : {}}
            />
            {checkingUsername && <span style={{position: 'absolute', right: '12px', top: '12px', fontSize: '0.8rem', color: '#888'}}>Checking...</span>}
            {usernameError && <span style={{fontSize: '0.8rem', color: '#ff453a', marginTop: '4px', display: 'block', marginLeft: '4px'}}>{usernameError}</span>}
          </div>

          <div className="input-group">
            <input
              type="password"
              className="input-field"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          </>
          )}
          {/* Extended Profile Fields (Sign Up Only) */}
          {isSignUp && (
            <div className="signup-fields">

              {/* Selfie Camera Section */}


              {/* Avatar Preview */}
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <div style={{ 
                      width: '100px', height: '100px', 
                      borderRadius: '50%', margin: '0 auto 10px',
                      border: '3px solid rgba(255,255,255,0.2)',
                      background: 'rgba(255,255,255,0.05)',
                      overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                      {gender === 'Male' ? (
                          <img src="/defaults/male_avatar.jpg" alt="Boy Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : gender === 'Female' ? (
                          <img src="/defaults/female_avatar.jpg" alt="Girl Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                          <span style={{ fontSize: '2rem', opacity: 0.5 }}>👤</span>
                      )}
                  </div>
                  <p style={{ fontSize: '0.85rem', color: '#aaa', margin: 0 }}>
                      {gender ? `Default ${gender} Avatar` : 'Select gender to preview avatar'}
                  </p>
              </div>

              {/* Gender */}
              <div className="field-section">
                <label>Gender</label>
                <div className="custom-select-wrapper">
                  <select 
                    value={gender} 
                    onChange={e => setGender(e.target.value)}
                    className="glass-select"
                  >
                    <option value="" disabled>Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Non-binary">Non-binary</option>
                    <option value="Other">Other</option>
                  </select>
                  <div className="select-arrow">▼</div>
                </div>
              </div>

              {/* Status */}
              <div className="field-section">
                <label>Relationship Status</label>
                <div className="custom-select-wrapper">
                  <select 
                    value={status} 
                    onChange={e => setStatus(e.target.value)}
                    className="glass-select"
                  >
                    <option value="" disabled>Select Status</option>
                    {STATUS_OPTIONS.map(s => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <div className="select-arrow">▼</div>
                </div>
              </div>

              {/* Interests */}
              <div className="field-section">
                <label>Interests <span className="sub-label">(Type and add up to 5)</span></label>
                
                {/* Selected Interests Chips */}
                <div className="chip-group" style={{ marginBottom: '10px' }}>
                  {selectedInterests.map(interest => (
                    <button 
                      key={interest}
                      type="button"
                      className="chip selected"
                      onClick={() => toggleInterest(interest)}
                    >
                      {interest} ✕
                    </button>
                  ))}
                </div>
                
                {/* Add Interest Input & Button */}
                <div className="add-interest-row" style={{ display: 'flex', gap: '8px' }}>
                    <input 
                        type="text" 
                        placeholder="Type interest..." 
                        className="glass-input-small"
                        id="interestInput"
                        onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                document.getElementById('addInterestBtn').click();
                            }
                        }}
                    />
                    <button 
                        type="button"
                        id="addInterestBtn"
                        className="btn-primary-small"
                        onClick={() => {
                            const input = document.getElementById('interestInput');
                            const val = input.value.trim();
                            if (val) {
                                const formatted = val.charAt(0).toUpperCase() + val.slice(1);
                                if (!selectedInterests.includes(formatted) && selectedInterests.length < 5) {
                                    setSelectedInterests([...selectedInterests, formatted]);
                                    input.value = '';
                                } else if (selectedInterests.length >= 5) {
                                    alert('Max 5 interests');
                                }
                            }
                        }}
                        style={{ whiteSpace: 'nowrap', padding: '0 16px', borderRadius: '10px', background: 'var(--brand-gradient)', border: 'none', color: 'white', fontWeight: '600', cursor: 'pointer' }}
                    >
                        Add +
                    </button>
                </div>
              </div>

            </div>
          )}

          {/* Forgot Password Link - Only for Login */}
          {!isSignUp && (
            <div style={{ textAlign: 'right', marginTop: '8px' }}>
              <span 
                onClick={() => setShowForgotPassword(true)}
                style={{ color: '#aaa', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Forgot Password?
              </span>
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? (isSignUp ? 'Creating Account...' : 'Logging In...') : (isSignUp ? 'Sign Up' : 'Log In')}
          </button>
        </form>

        <div className="auth-separator">
          <span>or</span>
        </div>

        <button type="button" className="btn-google" onClick={handleGoogleLogin}>
          <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
            <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
              <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z" />
              <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z" />
              <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.734 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z" />
              <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.799 L -6.744 42.389 C -8.804 40.469 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z" />
            </g>
          </svg>
          Continue with Gmail
        </button>
      </div>

      {/* Forgot Password Modal - Placed OUTSIDE main card to avoid stacking issues */}
      {showForgotPassword && (
        <div className="modal-backdrop">
          <div className="modal-content">
            {resetStep === 1 && (
              <>
                <h3>Reset Password 🔒</h3>
                <p>Enter your email to receive a verification code.</p>
                <input 
                  type="email" 
                  placeholder="Enter your email" 
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
                <div className="modal-footer">
                  <button className="btn-sec" onClick={() => { setShowForgotPassword(false); setResetStep(1); }}>Cancel</button>
                  <button className="btn-pri" onClick={async () => {
                    if (!resetEmail) {
                      alert("Please enter your email");
                      return;
                    }
                    setLoading(true);
                    try {
                      // Send OTP (Sign in with OTP behaves as passwordless login)
                      const { error } = await supabase.auth.signInWithOtp({
                        email: resetEmail,
                        options: { shouldCreateUser: false }
                      });
                      if (error) throw error;
                      alert("OTP sent to your email! 📧");
                      setResetStep(2);
                    } catch (err) {
                      alert(err.message);
                    } finally {
                      setLoading(false);
                    }
                  }}>Send OTP</button>
                </div>
              </>
            )}

            {resetStep === 2 && (
              <>
                <h3>Verify OTP 🔢</h3>
                <p>Enter the 6-digit code sent to {resetEmail}</p>
                <input 
                  type="text" 
                  placeholder="Enter 6-digit code" 
                  value={resetOtp}
                  onChange={(e) => setResetOtp(e.target.value)}
                />
                <div className="modal-footer">
                  <button className="btn-sec" onClick={() => setResetStep(1)}>Back</button>
                  <button className="btn-pri" onClick={async () => {
                    if (!resetOtp) {
                      alert("Please enter the code");
                      return;
                    }
                    setLoading(true);
                    try {
                      const { data, error } = await supabase.auth.verifyOtp({
                        email: resetEmail,
                        token: resetOtp,
                        type: 'email'
                      });
                      if (error) throw error;
                      if (data.session) {
                        setResetStep(3);
                        alert("Code verified! Set your new password.");
                      } else {
                        throw new Error("Verification failed. Try again.");
                      }
                    } catch (err) {
                      alert(err.message);
                    } finally {
                      setLoading(false);
                    }
                  }}>Verify Code</button>
                </div>
              </>
            )}

            {resetStep === 3 && (
              <>
                <h3>New Password 🔑</h3>
                <p>Set a new secure password for your account.</p>
                <input 
                  type="password" 
                  placeholder="New Password" 
                  value={newResetPassword}
                  onChange={(e) => setNewResetPassword(e.target.value)}
                  style={{ marginBottom: '10px' }}
                />
                <div className="modal-footer">
                  <button className="btn-sec" onClick={() => { setShowForgotPassword(false); setResetStep(1); }}>Cancel</button>
                  <button className="btn-pri" onClick={async () => {
                    if (newResetPassword.length < 6) {
                      alert("Password must be at least 6 characters");
                      return;
                    }
                    setLoading(true);
                    try {
                      const { error } = await supabase.auth.updateUser({
                        password: newResetPassword
                      });
                      if (error) throw error;
                      alert("Password updated successfully! ✅");
                      setShowForgotPassword(false);
                      setResetStep(1);
                      setResetEmail('');
                      setResetOtp('');
                      setNewResetPassword('');
                      setPassword(''); // clear old input
                    } catch (err) {
                      alert(err.message);
                    } finally {
                      setLoading(false);
                    }
                  }}>Update Password</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}


      <style>{`
        :root {
           --glass-border: rgba(255, 255, 255, 0.12);
           --glass-bg: rgba(20, 20, 20, 0.7);
           --brand-gradient: linear-gradient(135deg, #00d4ff 0%, #0084ff 100%);
           --brand-glow: rgba(0, 132, 255, 0.4);
        }

        .login-container {
          min-height: 100vh;
          display: flex;
          background: linear-gradient(180deg, #000000 0%, #0a0a0a 100%);
          position: relative;
          overflow-y: auto;
          padding: 40px 20px;
        }

        /* Enhanced Ambient Background Glows */
        .login-container::before, .login-container::after {
            content: ''; 
            position: absolute; 
            border-radius: 50%; 
            filter: blur(120px); 
            z-index: 0;
            animation: float 8s ease-in-out infinite;
        }
        .login-container::before {
            top: -15%; 
            right: -15%; 
            width: 600px; 
            height: 600px;
            background: radial-gradient(circle, rgba(0, 212, 255, 0.25), transparent 70%);
        }
        .login-container::after {
            bottom: -15%; 
            left: -15%; 
            width: 500px; 
            height: 500px;
            background: radial-gradient(circle, rgba(0, 132, 255, 0.2), transparent 70%);
            animation-delay: -4s;
        }
        
        @keyframes float {
            0%, 100% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(20px, 20px) scale(1.05); }
        }
        
        .login-card {
          position: relative; 
          z-index: 1;
          background: linear-gradient(135deg, rgba(28, 28, 30, 0.85) 0%, rgba(20, 20, 22, 0.9) 100%);
          border: 1.5px solid rgba(255, 255, 255, 0.15);
          border-radius: 28px;
          padding: 40px 36px;
          width: 90%;
          max-width: 460px;
          margin: auto;
          backdrop-filter: blur(30px) saturate(180%);
          -webkit-backdrop-filter: blur(30px) saturate(180%);
          box-shadow: 
            0 30px 60px -15px rgba(0, 0, 0, 0.7),
            0 0 0 1px rgba(255, 255, 255, 0.05) inset,
            0 1px 0 rgba(255, 255, 255, 0.1) inset;
          animation: slideUp 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .login-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(0, 212, 255, 0.5), transparent);
        }

        .login-card::-webkit-scrollbar { width: 0px; background: transparent; }
        
        .app-title {
          font-size: 2.75rem;
          font-weight: 800;
          margin-bottom: 6px;
          background: linear-gradient(135deg, #00d4ff 0%, #0084ff 50%, #00d4ff 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-align: center;
          letter-spacing: -1.5px;
          animation: shimmer 3s linear infinite;
          filter: drop-shadow(0 2px 8px rgba(0, 212, 255, 0.3));
        }
        
        @keyframes shimmer {
            to { background-position: 200% center; }
        }
        
        .app-subtitle {
          color: #999;
          margin-bottom: 24px;
          font-size: 1.05rem;
          text-align: center;
          font-weight: 500;
          letter-spacing: 0.3px;
        }

        .auth-toggle {
          display: flex;
          background: rgba(0, 0, 0, 0.4);
          padding: 5px;
          border-radius: 16px;
          margin-bottom: 28px;
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 2px 8px rgba(0,0,0,0.3) inset;
        }

        .toggle-btn {
          flex: 1;
          padding: 13px;
          border-radius: 12px;
          background: transparent;
          color: #888;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          font-size: 0.98rem;
          border: none;
          position: relative;
        }

        .toggle-btn.active {
          background: linear-gradient(135deg, rgba(0, 212, 255, 0.15) 0%, rgba(0, 132, 255, 0.15) 100%);
          color: white;
          box-shadow: 
            0 4px 12px rgba(0, 132, 255, 0.25),
            0 0 0 1px rgba(0, 212, 255, 0.2) inset;
        }
        
        .error-message {
          background: linear-gradient(135deg, rgba(255, 69, 58, 0.12) 0%, rgba(255, 69, 58, 0.08) 100%);
          color: #ff6b6b;
          padding: 14px;
          border-radius: 14px;
          margin-bottom: 24px;
          font-size: 0.92rem;
          border: 1px solid rgba(255, 69, 58, 0.25);
          text-align: center;
          font-weight: 500;
          box-shadow: 0 2px 8px rgba(255, 69, 58, 0.15);
        }

        .login-form {
          display: flex; 
          flex-direction: column; 
          gap: 20px;
        }
        
        .input-group {
            position: relative;
        }
        
        .input-field {
          width: 100%;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.02) 100%);
          border: 1.5px solid rgba(255, 255, 255, 0.12);
          padding: 14px 18px;
          border-radius: 14px;
          color: white;
          font-size: 0.98rem;
          outline: none;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-sizing: border-box;
          font-weight: 500;
        }
        
        .input-field:focus {
          background: linear-gradient(135deg, rgba(0, 212, 255, 0.08) 0%, rgba(0, 132, 255, 0.05) 100%);
          border-color: #00d4ff;
          box-shadow: 
            0 0 0 4px rgba(0, 212, 255, 0.12),
            0 2px 12px rgba(0, 212, 255, 0.2);
          transform: translateY(-1px);
        }
        
        .input-field::placeholder {
            color: rgba(255, 255, 255, 0.4);
        }

        .glass-select {
            width: 100%; 
            padding: 14px 18px; 
            border-radius: 14px;
            background: linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%);
            border: 1.5px solid rgba(255,255,255,0.12);
            color: white; 
            font-size: 0.98rem; 
            appearance: none; 
            outline: none; 
            cursor: pointer;
            transition: all 0.3s;
            font-weight: 500;
        }
        
        .glass-select:focus { 
            border-color: #00d4ff; 
            background: linear-gradient(135deg, rgba(0, 212, 255, 0.08) 0%, rgba(0, 132, 255, 0.05) 100%);
            box-shadow: 0 0 0 4px rgba(0, 212, 255, 0.12);
        }
        
        .signup-fields {
          display: flex; 
          flex-direction: column; 
          gap: 20px;
          margin-top: 0; 
          padding-top: 0;
          border-top: none;
          animation: slideDown 0.4s ease-out;
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-15px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes slideUp { 
            from { opacity: 0; transform: translateY(40px) scale(0.95); } 
            to { opacity: 1; transform: translateY(0) scale(1); } 
        }

        .field-section label {
          display: block; 
          color: #ddd; 
          font-size: 0.92rem;
          margin-bottom: 12px; 
          font-weight: 600; 
          padding-left: 4px;
          letter-spacing: 0.3px;
        }
        
        .sub-label { 
            font-size: 0.78rem; 
            opacity: 0.6; 
            font-weight: 400; 
        }

        .chip-group { 
            display: flex; 
            flex-wrap: wrap; 
            gap: 10px; 
        }

        .chip {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.03) 100%);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #ccc; 
          padding: 10px 18px; 
          border-radius: 22px;
          font-size: 0.92rem; 
          cursor: pointer; 
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          font-weight: 500;
        }

        .chip:hover { 
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.08) 100%);
            color: white;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }

        .chip.selected {
          background: var(--brand-gradient);
          color: white; 
          border-color: transparent;
          box-shadow: 0 4px 16px rgba(0, 132, 255, 0.35);
          transform: translateY(-2px);
        }

        /* Dropdown Styles */
        .custom-select-wrapper { 
            position: relative; 
            width: 100%; 
        }
        
        .select-arrow {
            position: absolute; 
            right: 18px; 
            top: 50%; 
            transform: translateY(-50%);
            color: rgba(255,255,255,0.5); 
            pointer-events: none; 
            font-size: 0.75rem;
        }
        
        .glass-select option { 
            background: #1a1a1a; 
            color: white; 
        }

        /* Interest Input */
        .add-interest-row { 
            margin-top: 12px; 
            width: 100%; 
        }
        
        .glass-input-small {
            width: 100%; 
            padding: 12px 16px; 
            border-radius: 12px;
            background: rgba(255,255,255,0.04); 
            border: 1.5px dashed rgba(255,255,255,0.2);
            color: white; 
            font-size: 0.92rem; 
            outline: none; 
            transition: all 0.3s;
            box-sizing: border-box;
            font-weight: 500;
        }
        
        .glass-input-small:focus { 
            border-color: #00d4ff; 
            border-style: solid;
            background: rgba(0, 212, 255, 0.05);
            box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.1);
        }

        /* Camera UI */
        .camera-container {
            width: 100%; 
            height: 240px; 
            background: linear-gradient(135deg, #0a0a0a 0%, #000000 100%);
            border-radius: 18px; 
            overflow: hidden; 
            position: relative;
            display: flex; 
            align-items: center; 
            justify-content: center;
            border: 1.5px dashed rgba(255,255,255,0.2);
            transition: all 0.3s;
            box-shadow: 0 4px 16px rgba(0,0,0,0.3) inset;
        }
        
        .camera-container:hover { 
            border-color: #00d4ff;
            box-shadow: 
                0 4px 16px rgba(0,0,0,0.3) inset,
                0 0 0 3px rgba(0, 212, 255, 0.1);
        }

        .camera-placeholder {
            width: 100%; 
            height: 100%; 
            display: flex; 
            flex-direction: column;
            align-items: center; 
            justify-content: center; 
            cursor: pointer;
            color: #888; 
            font-size: 0.98rem; 
            gap: 12px;
            font-weight: 500;
            transition: all 0.3s;
        }
        
        .camera-placeholder:hover { 
            color: white; 
            background: rgba(0, 212, 255, 0.05);
        }
        
        .video-wrapper, .captured-preview {
            position: relative; 
            width: 100%; 
            height: 100%;
        }
        
        .camera-preview, .captured-preview img {
            width: 100%; 
            height: 100%; 
            object-fit: cover;
        }
        
        .capture-btn {
            position: absolute; 
            bottom: 24px; 
            left: 50%; 
            transform: translateX(-50%);
            width: 68px; 
            height: 68px; 
            border-radius: 50%;
            background: linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%);
            border: 5px solid rgba(0,0,0,0.3);
            cursor: pointer; 
            z-index: 10; 
            transition: all 0.2s;
            box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        }
        
        .capture-btn:active { 
            transform: translateX(-50%) scale(0.92);
        }
        
        .retake-btn {
            position: absolute; 
            bottom: 18px; 
            right: 18px;
            background: rgba(0,0,0,0.7); 
            backdrop-filter: blur(8px);
            color: white; 
            border: 1px solid rgba(255,255,255,0.2);
            padding: 10px 16px;
            border-radius: 12px; 
            cursor: pointer; 
            font-size: 0.88rem; 
            font-weight: 600;
            transition: all 0.2s;
        }
        
        .retake-btn:hover {
            background: rgba(0,0,0,0.85);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }

        .btn-primary {
          background: var(--brand-gradient);
          color: white; 
          border: none; 
          padding: 15px;
          border-radius: 14px; 
          font-weight: 700; 
          font-size: 1rem;
          cursor: pointer; 
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          margin-top: 4px;
          box-shadow: 
            0 8px 24px -6px rgba(0, 132, 255, 0.45),
            0 0 0 1px rgba(0, 212, 255, 0.2) inset;
          position: relative;
          overflow: hidden;
        }
        
        .btn-primary::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: left 0.5s;
        }
        
        .btn-primary:hover::before {
            left: 100%;
        }
        
        .btn-primary:hover { 
            transform: translateY(-3px);
            box-shadow: 
                0 12px 32px -6px rgba(0, 132, 255, 0.55),
                0 0 0 1px rgba(0, 212, 255, 0.3) inset;
        }
        
        .btn-primary:active { 
            transform: translateY(-1px);
        }
        
        .btn-primary:disabled { 
            opacity: 0.6; 
            cursor: not-allowed; 
            transform: none;
        }

        .auth-separator {
          display: flex; 
          align-items: center; 
          text-align: center;
          margin: 20px 0;
          color: #666; 
          font-size: 0.9rem;
        }
        
        .auth-separator::before, .auth-separator::after {
          content: ''; 
          flex: 1; 
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        
        .auth-separator span { 
            padding: 0 18px; 
        }

        .login-container .login-card .btn-google {
          width: 100%; 
          background: linear-gradient(135deg, #ffffff 0%, #f8f8f8 100%);
          color: #000000 !important;
          border: 1px solid rgba(0,0,0,0.08);
          padding: 14px;
          border-radius: 14px;
          font-weight: 600; 
          font-size: 0.98rem;
          display: flex; 
          align-items: center; 
          justify-content: center;
          gap: 12px; 
          cursor: pointer; 
          transition: all 0.3s;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .login-container .login-card .btn-google:hover { 
            background: linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%);
            transform: translateY(-2px);
            box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        }

        /* Modal Styles */
        .modal-backdrop {
            position: fixed; 
            top: 0; 
            left: 0; 
            right: 0; 
            bottom: 0;
            background: rgba(0,0,0,0.88); 
            backdrop-filter: blur(20px);
            z-index: 1000; 
            display: flex; 
            align-items: center; 
            justify-content: center;
            animation: fadeIn 0.3s ease;
        }
        
        .modal-content {
            background: linear-gradient(135deg, rgba(28, 28, 30, 0.95) 0%, rgba(20, 20, 22, 0.95) 100%);
            border: 1.5px solid rgba(255,255,255,0.15);
            border-radius: 28px; 
            padding: 36px;
            width: 90%; 
            max-width: 420px;
            box-shadow: 
                0 30px 70px rgba(0,0,0,0.8),
                0 0 0 1px rgba(255,255,255,0.05) inset;
            animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            text-align: center;
        }
        
        .modal-content h3 { 
            margin: 0 0 12px 0; 
            color: white; 
            font-size: 1.6rem;
            font-weight: 700;
        }
        
        .modal-content p { 
            font-size: 0.98rem; 
            color: #aaa; 
            margin-bottom: 28px; 
            line-height: 1.6; 
        }
        
        .modal-content input {
            width: 100%; 
            padding: 15px 18px; 
            border-radius: 14px;
            border: 1.5px solid rgba(255,255,255,0.12);
            background: rgba(0,0,0,0.3); 
            color: white;
            outline: none; 
            margin-bottom: 28px; 
            font-size: 1rem;
            box-sizing: border-box; 
            transition: all 0.3s;
            font-weight: 500;
        }
        
        .modal-content input:focus { 
            border-color: #00d4ff;
            background: rgba(0, 212, 255, 0.05);
            box-shadow: 0 0 0 4px rgba(0, 212, 255, 0.12);
        }
        
        .modal-footer { 
            display: flex; 
            justify-content: center; 
            gap: 14px; 
        }
        
        .btn-sec { 
            background: transparent; 
            color: #888; 
            border: none; 
            cursor: pointer; 
            padding: 13px 22px; 
            font-weight: 600; 
            font-size: 0.98rem;
            transition: all 0.2s;
            border-radius: 12px;
        }
        
        .btn-sec:hover { 
            color: white;
            background: rgba(255,255,255,0.05);
        }
        
        .btn-pri { 
            background: var(--brand-gradient);
            color: white; 
            border: none; 
            padding: 13px 26px; 
            border-radius: 14px; 
            cursor: pointer; 
            font-weight: 600; 
            font-size: 0.98rem;
            box-shadow: 0 4px 16px rgba(0, 132, 255, 0.35);
            transition: all 0.3s;
        }
        
        .btn-pri:hover { 
            transform: translateY(-2px);
            box-shadow: 0 6px 24px rgba(0, 132, 255, 0.45);
        }

        @keyframes fadeIn { 
            from { opacity: 0; } 
            to { opacity: 1; } 
        }
      `}</style>
    </div>
  );
}
