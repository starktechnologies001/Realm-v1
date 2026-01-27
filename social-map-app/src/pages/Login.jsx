import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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

  const location = useLocation();
  const navigate = useNavigate();
  // Derive mode from URL
  const isSignUp = location.pathname === '/signup';

  useEffect(() => {
  if (isSignUp) return;

  let isMounted = true;

  const checkSession = async () => {
    
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return;

    const user = sessionData.session.user;

    // Try to fetch profile
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    // 🔴 Profile does not exist → CREATE IT
    if (!profile || error) {
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          email: user.email,
          username: user.user_metadata?.name || user.email.split('@')[0],
          full_name: user.user_metadata?.full_name,
          avatar_url: user.user_metadata?.avatar_url,
          status: 'Online'
        });

      if (insertError) {
        console.error('Profile creation failed', insertError);
        await supabase.auth.signOut();
        return;
      }
    }

    if (isMounted) {
      navigate('/map');
    }
  };

  checkSession();

  return () => {
    isMounted = false;
  };
}, [isSignUp, navigate]);


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
      const siteUrl = import.meta.env.VITE_SITE_URL;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
          redirectTo: '${siteUrl}/map'
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
            onClick={() => { navigate('/login'); setError(''); }}
          >
            Log In
          </button>
          <button
            className={`toggle-btn ${isSignUp ? 'active' : ''}`}
            onClick={() => { navigate('/signup'); setError(''); }}
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
           --glass-border: rgba(255, 255, 255, 0.1);
           --glass-bg: rgba(20, 20, 20, 0.6);
           --brand-blue: #007aff;
           --brand-gradient: linear-gradient(135deg, #007aff 0%, #00c6ff 100%);
        }

        .login-container {
          min-height: 100vh;
          display: flex;
          background-color: #000;
          /* Subtle ambient background matching screenshot */
          background-image: 
              radial-gradient(circle at 50% 0%, rgba(0, 122, 255, 0.15) 0%, transparent 50%);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          padding: 20px;
          overflow-y: auto; /* Ensure scroll container behavior */
        }

        .login-card {
          width: 100%;
          max-width: 400px;
          background: #1c1c1e;
          border-radius: 20px;
          padding: 40px 30px;
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1);
          display: flex;
          flex-direction: column;
          align-items: center;
          margin: auto; /* Safe centering for scrolling */
        }

        .app-title {
          font-size: 2.5rem;
          font-weight: 700;
          margin: 0;
          margin-bottom: 5px;
          color: #0caeff;
          text-shadow: 0 0 20px rgba(0, 174, 255, 0.5);
          letter-spacing: -0.5px;
        }

        .app-subtitle {
          color: #888;
          font-size: 1rem;
          margin: 0 0 30px 0;
          font-weight: 400;
        }

        .auth-toggle {
          display: flex;
          background: #000;
          padding: 4px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          width: 100%;
          margin-bottom: 25px;
        }

        .toggle-btn {
          flex: 1;
          padding: 10px;
          background: transparent;
          border: 1px solid transparent;
          color: #666;
          font-weight: 600;
          font-size: 0.95rem;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .toggle-btn.active {
          background: #1c1c1e;
          color: white;
          border-color: #007aff;
          box-shadow: 0 0 10px rgba(0, 122, 255, 0.3);
        }

        .login-form {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .input-group {
          width: 100%;
          position: relative;
        }

        .input-field {
          width: 100%;
          background: #2c2c2e;
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 14px 16px;
          border-radius: 12px;
          color: white;
          font-size: 1rem;
          outline: none;
          transition: all 0.2s;
          box-sizing: border-box;
        }

        .input-field::placeholder {
          color: #666;
        }

        .input-field:focus {
          border-color: #007aff;
          background: #3a3a3c;
        }

        .btn-primary {
          width: 100%;
          padding: 14px;
          border-radius: 12px;
          border: none;
          background: #0099ff;
          color: white;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 10px;
          box-shadow: 0 4px 12px rgba(0, 153, 255, 0.3);
        }

        .btn-primary:hover {
          background: #0088cc;
          transform: translateY(-1px);
        }
        
        .btn-primary:active {
          transform: scale(0.98);
        }

        .auth-separator {
          width: 100%;
          display: flex;
          align-items: center;
          text-align: center;
          margin: 25px 0;
          color: #444;
          font-size: 0.9rem;
        }

        .auth-separator::before,
        .auth-separator::after {
          content: '';
          flex: 1;
          border-bottom: 1px solid #333;
        }

        .auth-separator span {
          padding: 0 10px;
        }

        .btn-google {
          width: 100%;
          padding: 14px;
          border-radius: 12px;
          border: none;
          background: white;
          color: #000;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: all 0.2s;
        }

        .btn-google:hover {
          background: #f0f0f0;
        }

        .error-message {
            background: rgba(255, 69, 58, 0.1);
            color: #ff453a;
            padding: 12px;
            border-radius: 8px;
            font-size: 0.9rem;
            text-align: center;
            width: 100%;
            margin-bottom: 10px;
            border: 1px solid rgba(255, 69, 58, 0.2);
        }

        /* Signup Specifics */
        .signup-fields {
            display: flex;
            flex-direction: column;
            gap: 16px;
            width: 100%;
        }

        .field-section label {
            display: block;
            color: #aaa;
            font-size: 0.85rem;
            margin-bottom: 6px;
            margin-left: 4px;
        }

        .custom-select-wrapper {
            position: relative;
        }

        .glass-select {
            width: 100%;
            background: #2c2c2e;
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.05);
            padding: 14px 16px;
            border-radius: 12px;
            appearance: none;
            font-size: 1rem;
            outline: none;
        }
        
        .glass-select:focus {
            border-color: #007aff;
        }

        .select-arrow {
            position: absolute;
            right: 16px;
            top: 50%;
            transform: translateY(-50%);
            color: #666;
            pointer-events: none;
            font-size: 0.8rem;
        }

        .chip-group {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .chip {
            background: #3a3a3c;
            border: none;
            color: #white;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 0.85rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .chip.selected {
            background: rgba(0, 122, 255, 0.2);
            color: #007aff;
            border: 1px solid rgba(0, 122, 255, 0.3);
        }

        .glass-input-small {
            flex: 1;
            background: #2c2c2e;
            border: 1px solid rgba(255, 255, 255, 0.05);
            padding: 8px 12px;
            border-radius: 8px;
            color: white;
            font-size: 0.9rem;
            outline: none;
        }

        /* Modal */
        .modal-backdrop {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.8);
            backdrop-filter: blur(5px);
            z-index: 100;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .modal-content {
            background: #1c1c1e;
            padding: 30px;
            border-radius: 20px;
            width: 100%;
            max-width: 350px;
            border: 1px solid rgba(255,255,255,0.1);
            text-align: center;
        }
        
        .modal-content h3 { margin-top: 0; color: white; }
        .modal-content p { color: #aaa; font-size: 0.9rem; margin-bottom: 20px; }
        .modal-content input {
            width: 100%;
            padding: 12px;
            margin-bottom: 20px;
            background: #2c2c2e;
            border: 1px solid #333;
            color: white;
            border-radius: 10px;
            box-sizing: border-box;
        }
        
        .modal-footer {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        }
        
        .btn-sec { background: transparent; color: #888; border: none; padding: 10px 15px; cursor: pointer; }
        .btn-pri { background: #007aff; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; }

      `}</style>

    </div>
  );
}
