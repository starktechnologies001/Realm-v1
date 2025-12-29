import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const INTERESTS_OPTIONS = ['Singing', 'Dating', 'Travelling', 'Gaming', 'Cooking', 'Hiking', 'Reading', 'Music'];
const STATUS_OPTIONS = ['Single', 'Married', 'Committed', 'Open to Date'];
const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Other'];

const DEFAULT_AVATARS = {
  'Male': 'https://avatar.iran.liara.run/public/boy',
  'Female': 'https://avatar.iran.liara.run/public/girl',
  'Non-binary': 'https://avatar.iran.liara.run/public',
  'Other': 'https://avatar.iran.liara.run/public'
};

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
  const [capturedImage, setCapturedImage] = useState(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

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

  const startCamera = async () => {
    setIsCameraOpen(true);
    setCapturedImage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Could not access camera. Please allow permissions.");
      setIsCameraOpen(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);

      const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.8);
      setCapturedImage(dataUrl);

      // Stop stream
      const stream = videoRef.current.srcObject;
      if (stream) {
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
      }
      setIsCameraOpen(false);
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
        if (!capturedImage) throw new Error('A selfie is mandatory for verification! 📸');

        // 2. Password Strength
        if (!validatePassword(password)) {
          throw new Error('Password must be 8+ chars with Upper, Lower, Number & Symbol.');
        }

        // 3. Upload Selfie (for verification) & Assign Gender-Based Avatar
        let avatarUrl = '';
        try {
          // Upload selfie to storage for verification purposes
          const blob = await (await fetch(capturedImage)).blob();
          const fileName = `${Date.now()}_${username.replace(/\s+/g, '')}.jpg`;

          const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, blob);


          if (uploadError) throw uploadError;

          // Use gender-based avatar instead of selfie as profile picture
          const safeUsername = encodeURIComponent(username || 'User');
          const baseUrl = DEFAULT_AVATARS[gender] || DEFAULT_AVATARS['Other'];
          avatarUrl = `${baseUrl}?username=${safeUsername}`;

        } catch (uploadErr) {
          console.error("Upload failed", uploadErr);
          throw new Error('Failed to upload selfie. Please try again.');
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
        setCapturedImage(null); // Reset

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
              <div className="field-section">
                <label>Profile Picture</label>
                <div className="camera-container">
                  <canvas ref={canvasRef} style={{ display: 'none' }} />

                  {!isCameraOpen && !capturedImage && (
                    <div className="camera-placeholder" onClick={startCamera}>
                      <span>📸 Tap to take selfie</span>
                    </div>
                  )}

                  {isCameraOpen && (
                    <div className="video-wrapper">
                      <video ref={videoRef} autoPlay playsInline muted className="camera-preview"></video>
                      <button type="button" className="capture-btn" onClick={capturePhoto}></button>
                    </div>
                  )}

                  {capturedImage && !isCameraOpen && (
                    <div className="captured-preview">
                      <img src={capturedImage} alt="Selfie" />
                      <button type="button" className="retake-btn" onClick={startCamera}>Retake</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Gender */}
              <div className="field-section">
                <label>Gender <span className="sub-label">For customized avatars</span></label>
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
          Continue with Google
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
           --brand-gradient: linear-gradient(135deg, #00C6FF 0%, #0072FF 100%);
        }

        .login-container {
          min-height: 100vh;
          display: flex;
          /* align-items/justify-content removed to prevent top clipping */
          background: #050505;
          position: relative;
          overflow-y: auto;
          padding: 40px 20px;
        }

        /* Ambient Background Glows */
        .login-container::before, .login-container::after {
            content: ''; position: absolute; border-radius: 50%; filter: blur(100px); z-index: 0;
        }
        .login-container::before {
            top: -10%; right: -10%; width: 500px; height: 500px;
            background: radial-gradient(circle, rgba(0, 114, 255, 0.2), transparent 70%);
        }
        .login-container::after {
            bottom: -10%; left: -10%; width: 400px; height: 400px;
            background: radial-gradient(circle, rgba(189, 0, 255, 0.15), transparent 70%);
        }
        
        .login-card {
          position: relative; z-index: 1;
          background: rgba(30, 30, 30, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 24px;
          padding: 32px;
          width: 90%;
          max-width: 440px;
          margin: auto; /* Changed to auto for safe vertical centering */
          backdrop-filter: blur(25px) saturate(180%);
          -webkit-backdrop-filter: blur(25px) saturate(180%);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
          animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* Hide scrollbar */
        .login-card::-webkit-scrollbar { width: 0px; background: transparent; }
        
        .app-title {
          font-size: 2.5rem; /* Slightly smaller */
          font-weight: 800;
          margin-bottom: 4px; /* Reduced from 8px */
          background: linear-gradient(to right, #4facfe 0%, #00f2fe 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-align: center;
          letter-spacing: -1px;
        }
        
        .app-subtitle {
          color: #888;
          margin-bottom: 16px; /* Reduced from 32px */
          font-size: 1rem;
          text-align: center;
          font-weight: 400;
        }

        .auth-toggle {
          display: flex;
          background: rgba(0, 0, 0, 0.3);
          padding: 4px;
          border-radius: 14px;
          margin-bottom: 20px; /* Reduced from 32px */
          border: 1px solid rgba(255,255,255,0.05);
        }

        .toggle-btn {
          flex: 1;
          padding: 12px;
          border-radius: 10px;
          background: transparent;
          color: #888;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          font-size: 0.95rem;
          border: none;
        }

        .toggle-btn.active {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        
        .error-message {
          background: rgba(255, 69, 58, 0.1);
          color: #ff453a;
          padding: 12px;
          border-radius: 12px;
          margin-bottom: 20px;
          font-size: 0.9rem;
          border: 1px solid rgba(255, 69, 58, 0.2);
          text-align: center;
        }

        .login-form {
          display: flex; flex-direction: column; gap: 18px;
        }
        
        .input-field {
          width: 100%;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 12px 16px; /* Reduced from 16px 20px */
          border-radius: 12px; /* Reduced radius slightly */
          color: white;
          font-size: 0.95rem; /* Slightly smaller text */
          outline: none;
          transition: all 0.2s ease;
          box-sizing: border-box;
        }
        
        /* ... focus styles ... */

        .glass-select {
            width: 100%; padding: 12px 16px; border-radius: 12px; /* Matched input */
            background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
            color: white; font-size: 0.95rem; appearance: none; outline: none; cursor: pointer;
            transition: all 0.2s;
        }

        /* ... */

        .btn-primary {
          background: var(--brand-gradient);
          color: white; border: none; padding: 14px; /* Reduced from 16px */
          border-radius: 12px; font-weight: 700; font-size: 1rem;
          cursor: pointer; transition: all 0.2s; margin-top: 10px;
          box-shadow: 0 8px 25px -5px rgba(0, 114, 255, 0.4);
        }
        
        .input-field:focus {
          background: rgba(255, 255, 255, 0.06);
          border-color: #0072FF;
          box-shadow: 0 0 0 4px rgba(0, 114, 255, 0.1);
        }
        
        .signup-fields {
          display: flex; flex-direction: column; gap: 15px;
          margin-top: 0; padding-top: 0; /* Removed spacing */
          border-top: none; /* Removed line */
          animation: slideDown 0.3s ease-out;
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp { 
            from { opacity: 0; transform: translateY(30px) scale(0.95); } 
            to { opacity: 1; transform: translateY(0) scale(1); } 
        }

        .field-section label {
          display: block; color: #ccc; font-size: 0.9rem;
          margin-bottom: 10px; font-weight: 500; padding-left: 4px;
        }
        
        .sub-label { font-size: 0.75rem; opacity: 0.6; font-weight: normal; }

        .chip-group { display: flex; flex-wrap: wrap; gap: 10px; }

        .chip {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #ccc; padding: 8px 16px; border-radius: 20px;
          font-size: 0.9rem; cursor: pointer; transition: all 0.2s;
        }

        .chip:hover { background: rgba(255, 255, 255, 0.1); color: white; }

        .chip.selected {
          background: var(--brand-gradient);
          color: white; border-color: transparent;
          box-shadow: 0 4px 15px rgba(0, 114, 255, 0.3);
        }

        /* Dropdown Styles */
        .custom-select-wrapper { position: relative; width: 100%; }
        .glass-select {
            width: 100%; padding: 12px 16px; border-radius: 12px;
            background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
            color: white; font-size: 0.95rem; appearance: none; outline: none; cursor: pointer;
            transition: all 0.2s;
        }
        .glass-select:focus { border-color: #0072ff; background: rgba(255,255,255,0.1); }
        .select-arrow {
            position: absolute; right: 16px; top: 50%; transform: translateY(-50%);
            color: rgba(255,255,255,0.5); pointer-events: none; font-size: 0.8rem;
        }
        .glass-select option { background: #222; color: white; }

        /* Interest Input */
        .add-interest-row { margin-top: 10px; width: 100%; }
        .glass-input-small {
            width: 100%; padding: 10px 14px; border-radius: 10px;
            background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.2);
            color: white; font-size: 0.9rem; outline: none; transition: all 0.2s;
            box-sizing: border-box;
        }
        .glass-input-small:focus { border-color: #0072ff; background: rgba(255,255,255,0.08); }

        /* Camera UI */
        .camera-container {
            width: 100%; height: 220px; background: #000;
            border-radius: 16px; overflow: hidden; position: relative;
            display: flex; align-items: center; justify-content: center;
            border: 1px dashed rgba(255,255,255,0.2);
            transition: border-color 0.2s;
        }
        .camera-container:hover { border-color: #0072FF; }

        .camera-placeholder {
            width: 100%; height: 100%; display: flex; flex-direction: column;
            align-items: center; justify-content: center; cursor: pointer;
            color: #888; font-size: 0.95rem; gap: 10px;
        }
        .camera-placeholder:hover { color: white; background: rgba(255,255,255,0.03); }
        
        .video-wrapper, .captured-preview {
            position: relative; width: 100%; height: 100%;
        }
        .camera-preview, .captured-preview img {
            width: 100%; height: 100%; object-fit: cover;
        }
        .capture-btn {
            position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
            width: 64px; height: 64px; border-radius: 50%;
            background: white; border: 4px solid rgba(0,0,0,0.2);
            cursor: pointer; z-index: 10; transition: transform 0.1s;
        }
        .capture-btn:active { transform: translateX(-50%) scale(0.9); }
        
        .retake-btn {
            position: absolute; bottom: 15px; right: 15px;
            background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
            color: white; border: none; padding: 8px 14px;
            border-radius: 10px; cursor: pointer; font-size: 0.85rem; font-weight: 600;
        }

        .btn-primary {
          background: var(--brand-gradient);
          color: white; border: none; padding: 12px; /* Reduced from 14px */
          border-radius: 12px; font-weight: 700; font-size: 0.95rem; /* Reduced from 1rem */
          cursor: pointer; transition: all 0.2s; margin-top: 0;
          box-shadow: 0 8px 25px -5px rgba(0, 114, 255, 0.4);
        }
        
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 30px -5px rgba(0, 114, 255, 0.5); }
        .btn-primary:active { transform: translateY(0); }
        
        .btn-primary:disabled { opacity: 0.7; cursor: not-allowed; transform: none; }

        .auth-separator {
          display: flex; align-items: center; text-align: center;
          margin: 12px 0; /* Reduced from 24px */
          color: #666; font-size: 0.9rem;
        }
        .auth-separator::before, .auth-separator::after {
          content: ''; flex: 1; border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .auth-separator span { padding: 0 16px; }

        .btn-google {
          width: 100%; background: white; color: #111;
          border: none; padding: 12px; border-radius: 12px; /* Reduced from 14px */
          font-weight: 600; font-size: 0.95rem; /* Reduced from 1rem */
          display: flex; align-items: center; justify-content: center;
          gap: 12px; cursor: pointer; transition: all 0.2s;
        }
        .btn-google:hover { background: #f5f5f5; transform: translateY(-1px); }

        /* Modal Styles */
        .modal-backdrop {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.85); backdrop-filter: blur(15px);
            z-index: 1000; display: flex; align-items: center; justify-content: center;
            animation: fadeIn 0.3s ease;
        }
        .modal-content {
            background: rgba(30, 30, 30, 0.9);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 24px; padding: 32px;
            width: 90%; max-width: 400px;
            box-shadow: 0 25px 60px rgba(0,0,0,0.7);
            animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            text-align: center;
        }
        .modal-content h3 { margin: 0 0 10px 0; color: white; font-size: 1.5rem; }
        .modal-content p { font-size: 0.95rem; color: #aaa; margin-bottom: 24px; line-height: 1.5; }
        .modal-content input {
            width: 100%; padding: 14px 16px; border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.1);
            background: rgba(0,0,0,0.3); color: white;
            outline: none; margin-bottom: 24px; font-size: 1rem;
            box-sizing: border-box; transition: all 0.2s;
        }
        .modal-content input:focus { border-color: #0072FF; background: rgba(0,0,0,0.5); }
        
        .modal-footer { display: flex; justify-content: center; gap: 12px; }
        .btn-sec { 
            background: transparent; color: #888; border: none; 
            cursor: pointer; padding: 12px 20px; font-weight: 600; font-size: 0.95rem;
            transition: color 0.2s;
        }
        .btn-sec:hover { color: white; }
        .btn-pri { 
            background: var(--brand-gradient); color: white; border: none; 
            padding: 12px 24px; border-radius: 12px; cursor: pointer; 
            font-weight: 600; font-size: 0.95rem;
            box-shadow: 0 4px 15px rgba(0, 114, 255, 0.3);
            transition: all 0.2s;
        }
        .btn-pri:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0, 114, 255, 0.4); }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}
