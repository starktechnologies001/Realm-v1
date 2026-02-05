import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { uploadToStorage } from '../utils/fileUpload';
import { 
  DEFAULT_MALE_AVATAR, 
  DEFAULT_FEMALE_AVATAR, 
  DEFAULT_GENERIC_AVATAR 
} from '../utils/avatarUtils';
import ImageCropper from '../components/ImageCropper';

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
  
  // Real Faces Logic
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();
  // Derive mode from URL
  const isSignUp = location.pathname === '/signup';

useEffect(() => {
  let mounted = true;

  // 1️⃣ Handle page reload after Google redirect
  const checkExistingSession = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session && mounted) {
      // Validate that the user actually exists (not deleted from Supabase)
      const { data: userData, error } = await supabase.auth.getUser();
      
      if (error || !userData.user) {
        // Session is invalid (user was deleted), clear it
        await supabase.auth.signOut();
        localStorage.removeItem('currentUser');
        return;
      }
      
      // Check if OAuth user needs to complete profile setup
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, gender, status, avatar_url')
        .eq('id', userData.user.id)
        .single();
      
      // Avatar Self-Healing for OAuth/Auto-Login
      if (profile && userData.user.user_metadata?.avatar_url) {
          const metaAvatar = userData.user.user_metadata.avatar_url;
          const profileAvatar = profile.avatar_url;
          
          if (metaAvatar && metaAvatar.startsWith('http') && (!profileAvatar || profileAvatar.startsWith('/defaults/') || profileAvatar.includes('dicebear'))) {
               console.log("🚑 [AutoLogin] Healing avatar...", { metaAvatar, profileAvatar });
               await supabase.from('profiles').update({ avatar_url: metaAvatar }).eq('id', profile.id);
               // Also update local object if we use it later, though MapHome refetches
               profile.avatar_url = metaAvatar;
          }
      }

      // If OAuth user is missing required fields, redirect to setup
      if (profile && (!profile.gender || !profile.status)) {
        navigate('/oauth-profile-setup');
        return;
      }
      
      // Ensure LocalStorage is synced (MapHome uses it for optimistic loading)
      if (profile) {
          const currentStored = localStorage.getItem('currentUser');
          if (!currentStored) {
              localStorage.setItem('currentUser', JSON.stringify({
                  id: profile.id,
                  // We might not have all fields here due to limited select, but ID is critical
                  // Actually, MapHome fetches fresh profile, so ID is enough to start.
                  // But to be safe let's trust MapHome's fetch.
                  // However, if we want strict optimistic load, we might want more data.
                  // For now, let's just let MapHome handle the full fetch.
                  // BUT we must ensure the HEALED avatar is in DB, which we just did.
              }));
          }
      }
      
      navigate('/map', { state: { preloadedAvatar: profile?.avatar_url || userData.user.user_metadata?.avatar_url } });
    }
  };

  checkExistingSession();

  // 2️⃣ Handle fresh sign-in event
  const { data: listener } = supabase.auth.onAuthStateChange(
    (event, session) => {
      if (event === 'SIGNED_IN' && session && mounted) {
        const avatar = session.user?.user_metadata?.avatar_url;
        navigate('/map', { state: { preloadedAvatar: avatar } });
      }
    }
  );

  return () => {
    mounted = false;
    listener.subscription.unsubscribe();
  };
}, [navigate]);

  const [error, setError] = useState('');
  const [messageType, setMessageType] = useState('error'); // 'error' | 'success'
  const [signupStep, setSignupStep] = useState(1); // 1: Email, 2: Username, 3: Password, 4: Profile

  const showMessage = (msg, type = 'error') => {
    setError(msg);
    setMessageType(type);
    if (type === 'success') {
        setTimeout(() => setError(''), 5000);
    }
  };

  // Step Navigation Handlers
  const handleNextStep = async () => {
    setError('');
    
    if (signupStep === 1) {
      // Validate Email Format
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showMessage('Please enter a valid email address', 'error');
        return;
      }
      
      // Check if email already exists
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('email')
          .eq('email', email.toLowerCase())
          .maybeSingle();
        
        if (data) {
          showMessage('This email already exists', 'error');
          return;
        }
      } catch (err) {
        console.error('Email check error:', err);
      }
      
      setSignupStep(2);
    } else if (signupStep === 2) {
      // Validate Username & Check Availability
      if (!username.trim() || username.length < 3) {
        showMessage('Username must be at least 3 characters', 'error');
        return;
      }
      if (usernameError) {
        showMessage('Username already exists', 'error');
        return;
      }
      // Double-check availability before proceeding
      try {
        const { data } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', username)
          .single();
        
        if (data) {
          showMessage('Username already exists', 'error');
          setUsernameError('Username is already taken');
          return;
        }
      } catch (err) {
        // No match found, username is available
      }
      setSignupStep(3);
    } else if (signupStep === 3) {
      // Validate Password
      if (!validatePassword(password)) {
        showMessage('Password must be 8+ chars with Upper, Lower, Number & Symbol.', 'error');
        return;
      }
      setSignupStep(4);
    }
  };

  const handleBackStep = () => {
    setError('');
    if (signupStep > 1) {
      setSignupStep(signupStep - 1);
    }
  };

  const [usernameError, setUsernameError] = useState('');
  const [checkingUsername, setCheckingUsername] = useState(false);

  // Check Username Availability
  React.useEffect(() => {
    const checkUsername = async () => {
      if (!username || username.length < 3 || !isSignUp || signupStep !== 2) {
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
  }, [username, isSignUp, signupStep]);

  const [loading, setLoading] = useState(false);

  const [cropImage, setCropImage] = useState(null); // State for cropping

  // Handle File Selection -- Updated for Cropping
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showMessage("File is too large (max 5MB) ⚠️", 'error');
      return;
    }

    // Instead of setting avatarFile immediately, read it for the cropper
    const reader = new FileReader();
    reader.addEventListener('load', () => {
        setCropImage(reader.result);
    });
    reader.readAsDataURL(file);
    
    // Reset input
    e.target.value = null;
  };

  const onCropComplete = (croppedBlob) => {
      setCropImage(null);
      // Create a File from Blob
      const file = new File([croppedBlob], `avatar_${Date.now()}.jpg`, { type: 'image/jpeg' });
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
  };

  const onCropCancel = () => {
      setCropImage(null);
  };


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
      showMessage(`Please enter ${isSignUp ? "email" : "username"} and password.`, 'error');
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

        // 3. Upload Avatar FIRST (if file selected)
        // 3. Upload Avatar FIRST (if file selected)
        let finalAvatarUrl;
        
        // Priority 1: Uploaded File
        if (avatarFile) {
            // Use 'public' folder to ensure anonymous uploads are allowed
            const publicFolder = 'public';
            
            try {
                // Upload to 'chat-images' (public bucket)
                const { fileUrl, error: uploadError } = await uploadToStorage(avatarFile, publicFolder, null, 'chat-images');
                
                if (!uploadError && fileUrl) {
                    console.log('Pre-signup upload success:', fileUrl);
                    finalAvatarUrl = fileUrl;
                } else {
                    console.error('Pre-signup upload failed:', uploadError);
                     // Fallback to default if upload fails
                     if (gender === 'Male') finalAvatarUrl = DEFAULT_MALE_AVATAR;
                     else if (gender === 'Female') finalAvatarUrl = DEFAULT_FEMALE_AVATAR;
                     else finalAvatarUrl = DEFAULT_GENERIC_AVATAR;
                }
            } catch (err) {
                 console.error('Pre-signup upload exception:', err);
                 // Fallback to default
                 if (gender === 'Male') finalAvatarUrl = DEFAULT_MALE_AVATAR;
                 else if (gender === 'Female') finalAvatarUrl = DEFAULT_FEMALE_AVATAR;
                 else finalAvatarUrl = DEFAULT_GENERIC_AVATAR;
            }
        } else {
            // Priority 2: Gender Default (No file uploaded)
            if (gender === 'Male') finalAvatarUrl = DEFAULT_MALE_AVATAR;
            else if (gender === 'Female') finalAvatarUrl = DEFAULT_FEMALE_AVATAR;
            else finalAvatarUrl = DEFAULT_GENERIC_AVATAR;
        }

        // 4. Sign Up with the FINAL avatar URL
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/confirm-email`,
            data: {
              username: username,
              full_name: username,
              avatar_url: finalAvatarUrl, 
              status: status,
              gender: gender,
              interests: selectedInterests
            }
          }
        });

        if (signUpError) throw signUpError;
        
        // 5. Success
        showMessage('✅ Account created! Please check your email to verify your account.', 'success');
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

            // SELF-HEALING: Check if Auth Metadata has a photo but Profile is default
            // This fixes cases where the DB Trigger failed to copy the signup photo
            const metaAvatar = data.session.user.user_metadata.avatar_url;
            const profileAvatar = profile.avatar_url;
            
            if (metaAvatar && metaAvatar.startsWith('http') && (!profileAvatar || profileAvatar.startsWith('/defaults/') || profileAvatar.includes('dicebear'))) {
                 console.log("🚑 Avatar Mismatch Detected! Healing profile...", { metaAvatar, profileAvatar });
                 // Force update profile
                 await supabase.from('profiles').update({ avatar_url: metaAvatar }).eq('id', profile.id);
                 
                 // Update local storage to reflect the fix immediately
                 const healedUser = JSON.parse(localStorage.getItem('currentUser'));
                 healedUser.avatar_url = metaAvatar;
                 localStorage.setItem('currentUser', JSON.stringify(healedUser));
                 
                 // Navigate with healed avatar
                 navigate('/map', { state: { preloadedAvatar: metaAvatar } });
            } else {
                 navigate('/map', { state: { preloadedAvatar: profile.avatar_url } });
            }

            // Mark setup as complete since they are logging in with a valid profile
            localStorage.setItem('setup_complete', 'true');
          }
          navigate('/map');
        }
      }
    } catch (err) {
      console.error(err);
      // Detailed error handling for duplicates
      if (err.message && (
          err.message.includes('User already registered') || 
          err.message.includes('unique constraint') ||
          err.message.includes('already exists')
      )) {
        showMessage('This email already exists', 'error');
      } else {
        showMessage(err.message || 'Authentication failed', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
  try {
    const siteUrl = import.meta.env.VITE_SITE_URL;

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
        redirectTo: `${siteUrl}/login`
      }
    });
  } catch (err) {
    console.error("Google Login Error:", err);
    showMessage("Failed to initialize Google Login", 'error');
  }
};

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="app-title">Nearo</h1>
        <p className="app-subtitle">
          {isSignUp ? "Create your profile" : "Welcome Back"}
        </p>

        <div className="auth-toggle">
          <button
            className={`toggle-btn ${!isSignUp ? 'active' : ''}`}
            onClick={() => { navigate('/login'); setError(''); setSignupStep(1); }}
          >
            Log In
          </button>
          <button
            className={`toggle-btn ${isSignUp ? 'active' : ''}`}
            onClick={() => { navigate('/signup'); setError(''); setSignupStep(1); }}
          >
            Signup
          </button>
        </div>


        {error && (
            <div className={`alert-message alert-${messageType}`}>
                <div className="alert-icon">
                    {messageType === 'success' ? '✅' : '⚠️'}
                </div>
                <div className="alert-content">{error}</div>
            </div>
        )}

        <form onSubmit={handleAuth} className="login-form">
          {/* Login Form */}
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
              <div style={{ textAlign: 'right', marginTop: '8px' }}>
                <span 
                  onClick={() => setShowForgotPassword(true)}
                  style={{ color: '#aaa', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Forgot Password?
                </span>
              </div>
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? 'Logging In...' : 'Log In'}
              </button>
            </>
          )}

          {/* Multi-Step Signup Wizard */}
          {isSignUp && (
            <>
              {/* Step Indicator */}
              <div className="step-indicator">
                <div className={`step ${signupStep >= 1 ? 'active' : ''}`}>1</div>
                <div className="step-line"></div>
                <div className={`step ${signupStep >= 2 ? 'active' : ''}`}>2</div>
                <div className="step-line"></div>
                <div className={`step ${signupStep >= 3 ? 'active' : ''}`}>3</div>
                <div className="step-line"></div>
                <div className={`step ${signupStep >= 4 ? 'active' : ''}`}>4</div>
              </div>

              {/* Step 1: Email */}
              {signupStep === 1 && (
                <div className="signup-step">
                  <h3 className="step-title">What's your email?</h3>
                  <div className="input-group">
                    <input
                      type="email"
                      className="input-field"
                      placeholder="Email Address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoFocus
                    />
                  </div>
                </div>
              )}

              {/* Step 2: Username */}
              {signupStep === 2 && (
                <div className="signup-step">
                  <h3 className="step-title">Choose a username</h3>
                  <div className="input-group">
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      style={usernameError ? { borderColor: '#ff453a' } : {}}
                      autoFocus
                    />
                    {checkingUsername && <span style={{position: 'absolute', right: '12px', top: '12px', fontSize: '0.8rem', color: '#888'}}>Checking...</span>}
                    {usernameError && <span style={{fontSize: '0.8rem', color: '#ff453a', marginTop: '4px', display: 'block', marginLeft: '4px'}}>{usernameError}</span>}
                  </div>
                </div>
              )}

              {/* Step 3: Password */}
              {signupStep === 3 && (
                <div className="signup-step">
                  <h3 className="step-title">Create a secure password</h3>
                  <div className="input-group">
                    <input
                      type="password"
                      className="input-field"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoFocus
                    />
                    <p style={{ fontSize: '0.75rem', color: '#888', marginTop: '8px', marginLeft: '4px' }}>
                      8+ chars with Upper, Lower, Number & Symbol
                    </p>
                  </div>
                </div>
              )}

              {/* Step 4: Profile Details */}
              {signupStep === 4 && (
                <div className="signup-step">
                  <h3 className="step-title">Complete your profile</h3>
                  
                  {/* Avatar Upload Preview */}
                  <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <div style={{ position: 'relative', width: '100px', height: '100px', margin: '0 auto 12px' }}>
                      <div style={{ 
                          width: '100px', height: '100px', 
                          borderRadius: '50%',
                          border: '3px solid rgba(255,255,255,0.2)',
                          background: 'rgba(255,255,255,0.05)',
                          overflow: 'hidden',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                          {avatarPreview ? (
                              <img src={avatarPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                              <img 
                                  src={gender === 'Female' ? DEFAULT_FEMALE_AVATAR : DEFAULT_MALE_AVATAR} 
                                  alt="Default Avatar" 
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} 
                              />
                          )}
                      </div>
                      
                      <label 
                          htmlFor="avatar-upload"
                          style={{
                              position: 'absolute', bottom: '0', right: '0',
                              width: '32px', height: '32px',
                              background: 'var(--brand-blue)',
                              borderRadius: '50%',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer',
                              boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                              border: '2px solid #1c1c1e'
                          }}
                      >
                          <span style={{ fontSize: '1.2rem', color: 'white', marginTop: '-2px' }}>+</span>
                      </label>
                      <input 
                          id="avatar-upload" 
                          type="file" 
                          accept="image/*" 
                          onChange={handleFileChange} 
                          style={{ display: 'none' }} 
                      />
                    </div>
                    <p style={{ fontSize: '0.85rem', color: '#aaa', margin: 0 }}>
                        {avatarPreview ? 'Photo selected' : 'Upload a profile photo'}
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
                    <label>Interests <span className="sub-label">(Optional, up to 5)</span></label>
                    
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
                                        showMessage('Max 5 interests', 'error');
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

              {/* Navigation Buttons */}
              <div className="step-navigation">
                {signupStep > 1 && (
                  <button type="button" onClick={handleBackStep} className="btn-back">
                    ← Back
                  </button>
                )}
                {signupStep < 4 ? (
                  <button type="button" onClick={handleNextStep} className="btn-next">
                    Next →
                  </button>
                ) : (
                  <button type="submit" disabled={loading} className="btn-submit">
                    {loading ? 'Creating Account...' : 'Sign Up'}
                  </button>
                )}
              </div>
            </>
          )}
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

      {/* Forgot Password Modal */}
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
                      showMessage("Please enter your email", 'error');
                      return;
                    }
                    setLoading(true);
                    try {
                      const { error } = await supabase.auth.signInWithOtp({
                        email: resetEmail,
                        options: { shouldCreateUser: false }
                      });
                      if (error) throw error;
                      showMessage("OTP sent to your email! 📧", 'success');
                      setResetStep(2);
                    } catch (err) {
                      showMessage(err.message, 'error');
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
                      showMessage("Please enter the code", 'error');
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
                        showMessage("Code verified! Set your new password.", 'success');
                      } else {
                        throw new Error("Verification failed. Try again.");
                      }
                    } catch (err) {
                      showMessage(err.message, 'error');
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
                      showMessage("Password must be at least 6 characters", 'error');
                      return;
                    }
                    setLoading(true);
                    try {
                      const { error } = await supabase.auth.updateUser({
                        password: newResetPassword
                      });
                      if (error) throw error;
                      showMessage("Password updated successfully! ✅", 'success');
                      setShowForgotPassword(false);
                      setResetStep(1);
                      setResetEmail('');
                      setResetOtp('');
                      setNewResetPassword('');
                      setPassword('');
                    } catch (err) {
                      showMessage(err.message, 'error');
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
          background-image: 
              radial-gradient(circle at 50% 0%, rgba(0, 122, 255, 0.15) 0%, transparent 50%);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          padding: 20px;
          overflow-y: auto;
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
          margin: auto;
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
          background: linear-gradient(135deg, #007aff 0%, #00c6ff 100%);
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.1s ease, box-shadow 0.2s;
        }

        .btn-primary:active {
          transform: scale(0.98);
        }

        .btn-primary:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .auth-separator {
          width: 100%;
          display: flex;
          align-items: center;
          margin: 20px 0;
          color: #666;
          font-size: 0.9rem;
        }

        .auth-separator::before,
        .auth-separator::after {
          content: "";
          flex: 1;
          height: 1px;
          background: rgba(255, 255, 255, 0.1);
        }

        .auth-separator span {
          padding: 0 10px;
        }

        .btn-google {
          width: 100%;
          background: white;
          color: #333;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 12px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          font-size: 1rem;
          transition: background 0.2s;
        }

        .btn-google:hover {
          background: #f0f0f0;
        }

        /* Alert Styles */
        .alert-message {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 14px 16px;
          border-radius: 12px;
          font-size: 0.9rem;
          line-height: 1.4;
          width: 100%;
          backdrop-filter: blur(10px);
          animation: slideIn 0.3s ease-out;
          text-align: left;
          box-sizing: border-box;
          margin-bottom: 20px;
        }
        
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(-5px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .alert-error {
          background: rgba(255, 69, 58, 0.1);
          border: 1px solid rgba(255, 69, 58, 0.2);
          color: #ff453a;
          border-left: 4px solid #ff453a;
        }

        .alert-success {
          background: rgba(48, 209, 88, 0.1);
          border: 1px solid rgba(48, 209, 88, 0.2);
          color: #30d158;
          border-left: 4px solid #30d158;
        }
        
        .alert-icon { font-size: 1.1rem; margin-top: -2px; }
        .alert-content { flex: 1; }

        /* Step Indicator */
        .step-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 30px;
          width: 100%;
        }

        .step {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #2c2c2e;
          color: #666;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 0.9rem;
          transition: all 0.3s;
        }

        .step.active {
          background: var(--brand-gradient);
          color: white;
          box-shadow: 0 0 15px rgba(0, 122, 255, 0.4);
        }

        .step-line {
          width: 40px;
          height: 2px;
          background: #2c2c2e;
        }

        /* Signup Step */
        .signup-step {
          width: 100%;
          animation: fadeIn 0.3s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .step-title {
          font-size: 1.3rem;
          font-weight: 600;
          color: white;
          margin: 0 0 20px 0;
          text-align: center;
        }

        /* Step Navigation */
        .step-navigation {
          display: flex;
          gap: 12px;
          width: 100%;
          margin-top: 10px;
        }

        .btn-back {
          flex: 1;
          padding: 14px;
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.8);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          cursor: pointer;
          font-size: 0.95rem;
          font-weight: 600;
          transition: all 0.2s;
        }

        .btn-back:hover {
          background: rgba(255,255,255,0.1);
          color: white;
        }

        .btn-next, .btn-submit {
          flex: 1;
          padding: 14px;
          background: linear-gradient(135deg, #007aff 0%, #00c6ff 100%);
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-next:hover, .btn-submit:hover {
          box-shadow: 0 8px 20px rgba(0, 122, 255, 0.3);
        }

        .btn-submit:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        /* Field Sections */
        .field-section {
          margin-bottom: 16px;
        }

        .field-section label {
          display: block;
          color: #aaa;
          font-size: 0.9rem;
          margin-bottom: 8px;
          margin-left: 4px;
        }
        
        .sub-label {
             font-size: 0.75rem; color: #666; font-weight: 400;
        }

        .custom-select-wrapper {
          position: relative;
        }

        .glass-select {
          width: 100%;
          background: #2c2c2e;
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 14px 16px;
          border-radius: 12px;
          font-size: 1rem;
          appearance: none;
          outline: none;
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
          padding: 8px 16px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.05);
          color: #ccc;
          border: 1px solid rgba(255, 255, 255, 0.1);
          cursor: pointer;
          font-size: 0.9rem;
          transition: all 0.2s;
        }

        .chip:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .chip.selected {
          background: rgba(0, 122, 255, 0.2);
          border-color: #007aff;
          color: #007aff;
        }
        
         .glass-input-small {
            flex: 1;
            background: #2c2c2e;
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: white;
            padding: 10px 14px;
            border-radius: 10px;
            font-size: 0.95rem;
            outline: none;
        }
        .btn-primary-small {
            transition: transform 0.1s;
        }
        .btn-primary-small:active { transform: scale(0.95); }
        
        /* Modal Styles */
        .modal-backdrop {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.8);
          backdrop-filter: blur(5px);
          z-index: 1000;
          display: flex; align-items: center; justify-content: center;
        }
        
        .modal-content {
          background: rgba(28, 28, 30, 0.95);
          width: 90%; max-width: 380px;
          padding: 32px; border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.1);
          text-align: center;
          color: white;
          box-shadow: 0 20px 40px rgba(0,0,0,0.4);
          animation: popIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        @keyframes popIn {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .modal-content h3 { margin: 0 0 10px 0; color: white; }
        .modal-content p { color: #aaa; font-size: 0.9rem; margin-bottom: 20px; }
        .modal-content input {
          width: 100%; padding: 12px; border-radius: 10px;
          background: #2c2c2e; border: 1px solid rgba(255,255,255,0.1);
          color: white; font-size: 1rem; margin-bottom: 20px;
          text-align: center;
        }
        .modal-footer { display: flex; gap: 10px; }
        .btn-sec, .btn-pri {
          flex: 1; padding: 12px; border-radius: 10px; border: none;
          font-weight: 600; cursor: pointer; font-size: 0.95rem;
        }
        .btn-sec { background: rgba(255,255,255,0.1); color: #ccc; }
        .btn-pri { background: var(--brand-blue); color: white; }

      `}</style>
      {cropImage && (
        <ImageCropper
            imageSrc={cropImage}
            onCropComplete={onCropComplete}
            onCancel={onCropCancel}
        />
      )}
    </div>
  );
}
