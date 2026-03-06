import React, { useState, useRef, useEffect, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { uploadToStorage } from '../utils/fileUpload';
import { 
  DEFAULT_MALE_AVATAR, 
  DEFAULT_FEMALE_AVATAR, 
  DEFAULT_GENERIC_AVATAR 
} from '../utils/avatarUtils';
// 🚀 ImageCropper is only needed after a user selects a photo — lazy load it
const ImageCropper = React.lazy(() => import('../components/ImageCropper'));

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
          redirectTo: `${siteUrl}/map`
        }
      });
    } catch (err) {
      console.error("Google Login Error:", err);
      showMessage("Failed to initialize Google Login", 'error');
    }
  };

  useEffect(() => {
    let mounted = true;

    // 1️⃣ Handle page reload after Google redirect (or session recovery)
    const checkExistingSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session && mounted) {
        // Validate that the user actually exists
        const { data: userData, error } = await supabase.auth.getUser();
        
        if (error || !userData.user) {
          await supabase.auth.signOut();
          localStorage.removeItem('currentUser');
          return;
        }
        
        // Profiles are handled by MapHome/Layout now
        navigate('/map');
      }
    };

    checkExistingSession();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  const [error, setError] = useState('');
  const [messageType, setMessageType] = useState('error'); // 'error' | 'success'
  const [signupStep, setSignupStep] = useState(1); // 1: Email, 2: Username, 3: Password, 4: Profile
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({}); // per-field inline errors

  const clearFieldError = (field) => setFieldErrors(prev => ({ ...prev, [field]: '' }));

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
    setFieldErrors({});
    
    if (signupStep === 1) {
      // Validate Everything for Step 1
      let errs = {};
      
      if (!email.trim()) {
        errs.email = 'Email address is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errs.email = 'Please enter a valid email address';
      }
      
      if (!username.trim() || username.length < 3) {
        errs.username = 'Username must be at least 3 characters';
      }
      
      if (!password.trim()) {
        errs.password = 'Password is required';
      } else if (!validatePassword(password)) {
        errs.password = 'Password must be 8+ chars with Upper, Lower, Number & Symbol';
      }
      
      if (Object.keys(errs).length > 0) {
        setFieldErrors(errs);
        return;
      }

      if (usernameError) {
        setFieldErrors({ username: 'Username already exists' });
        return;
      }
      
      setLoading(true);
      
      try {
        // Check if email already exists
        const { data: emailData } = await supabase
          .from('profiles')
          .select('email')
          .eq('email', email.toLowerCase())
          .maybeSingle();
        
        if (emailData) {
          showMessage('Email is already registered. Please login.', 'error');
          setLoading(false);
          return;
        }

        // Double-check username availability
        const { data: userData } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', username)
          .maybeSingle();
        
        if (userData) {
          setFieldErrors({ username: 'Username already exists' });
          setUsernameError('Username is already taken');
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error('Validation check error:', err);
      }
      
      setLoading(false);
      setSignupStep(2);
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
      if (!username || username.length < 3 || !isSignUp || signupStep !== 1) {
        setUsernameError('');
        return;
      }
      setCheckingUsername(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', username)
          .maybeSingle();
        
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
    setFieldErrors({});
    setLoading(true);

    if (!isSignUp) {
      // Login: validate both fields inline
      const form = e.target;
      const actualUsername = username || form.elements[0]?.value || '';
      const actualPassword = password || form.elements[1]?.value || '';

      const errs = {};
      if (!actualUsername.trim()) errs.username = 'Username is required';
      if (!actualPassword.trim()) errs.password = 'Password is required';
      if (Object.keys(errs).length > 0) {
        setFieldErrors(errs);
        setLoading(false);
        return;
      }
      
      // Sync state if form had autofilled values not caught by React
      if (!username && actualUsername) setUsername(actualUsername);
      if (!password && actualPassword) setPassword(actualPassword);
    } else {
      // Signup step 4: validate gender and status
      const errs = {};
      if (!gender) errs.gender = 'Please select a gender';
      if (!status) errs.status = 'Please select a relationship status';
      if (Object.keys(errs).length > 0) {
        setFieldErrors(errs);
        setLoading(false);
        return;
      }
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
              relationship_status: status,
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
        const form = e.target;
        const actualUsername = username || form.elements[0]?.value || '';
        const actualPassword = password || form.elements[1]?.value || '';

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('email')
          .eq('username', actualUsername)
          .maybeSingle();

        if (profileError || !profileData || !profileData.email) {
          throw new Error('Username not found. Please check your username.');
        }

        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: profileData.email,
          password: actualPassword,
        });

        if (signInError) throw signInError;

        if (data.session) {
          // Fetch complete profile from database to get avatar and all fields
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.session.user.id)
            .maybeSingle();

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
              status: userMeta.status || 'Online',
              relationship_status: userMeta.relationship_status
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
              relationship_status: profile.relationship_status,
              interests: profile.interests
            }));

            navigate('/map', { state: { preloadedAvatar: profile.avatar_url } });

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
        showMessage('Email is already registered. Please login.', 'error');
      } else {
        showMessage(err.message || 'Authentication failed', 'error');
      }
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="app-title">Nearo</h1>
        <p className="app-subtitle">
          {isSignUp ? "Create your profile" : "Discover, Connect, Meet"}
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
                  onChange={(e) => { setUsername(e.target.value); clearFieldError('username'); }}
                  style={fieldErrors.username ? { borderColor: '#ff453a' } : {}}
                  required
                />
                {fieldErrors.username && <span style={{ fontSize: '0.8rem', color: '#ff453a', marginTop: '4px', display: 'block', marginLeft: '4px' }}>{fieldErrors.username}</span>}
              </div>
              <div className="input-group" style={{ position: 'relative' }}>
                <input
                  type={showPassword ? "text" : "password"}
                  className="input-field"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }}
                  style={{ paddingRight: '40px', ...(fieldErrors.password ? { borderColor: '#ff453a' } : {}) }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: showPassword ? '#0caeff' : '#666', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', lineHeight: 0, transition: 'color 0.2s' }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  )}
                </button>
                {fieldErrors.password && <span style={{ fontSize: '0.8rem', color: '#ff453a', marginTop: '4px', display: 'block', marginLeft: '4px' }}>{fieldErrors.password}</span>}
              </div>
              <div style={{ textAlign: 'right', marginTop: '6px' }}>
                <span
                  onClick={() => setShowForgotPassword(true)}
                  className="forgot-link"
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
              </div>

              {/* Step 1: Account Details */}
              {signupStep === 1 && (
                <div className="signup-step">
                  <h3 className="step-title">Create your account</h3>
                  
                  <div className="input-group" style={{ marginBottom: '16px' }}>
                    <input
                      type="email"
                      className="input-field"
                      placeholder="Email Address"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
                      style={fieldErrors.email ? { borderColor: '#ff453a' } : {}}
                      autoFocus
                    />
                    {fieldErrors.email && <span style={{ fontSize: '0.8rem', color: '#ff453a', marginTop: '6px', display: 'block', marginLeft: '4px' }}>{fieldErrors.email}</span>}
                  </div>

                  <div className="input-group" style={{ marginBottom: '16px' }}>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Username"
                      value={username}
                      onChange={(e) => { setUsername(e.target.value); clearFieldError('username'); }}
                      style={(usernameError || fieldErrors.username) ? { borderColor: '#ff453a' } : {}}
                    />
                    {checkingUsername && <span style={{position: 'absolute', right: '12px', top: '16px', fontSize: '0.8rem', color: '#888'}}>Checking...</span>}
                    {(usernameError || fieldErrors.username) && <span style={{fontSize: '0.8rem', color: '#ff453a', marginTop: '6px', display: 'block', marginLeft: '4px'}}>{fieldErrors.username || usernameError}</span>}
                  </div>

                  <div className="input-group" style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? "text" : "password"}
                      className="input-field"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }}
                      style={{ paddingRight: '40px', ...(fieldErrors.password ? { borderColor: '#ff453a' } : {}) }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ position: 'absolute', right: '14px', top: '24px', transform: 'translateY(-50%)', background: 'none', border: 'none', color: showPassword ? '#0caeff' : '#666', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', lineHeight: 0, transition: 'color 0.2s' }}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      )}
                    </button>
                    {fieldErrors.password
                      ? <p style={{ fontSize: '0.75rem', color: '#ff453a', marginTop: '8px', marginLeft: '4px' }}>{fieldErrors.password}</p>
                      : <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginTop: '8px', marginLeft: '4px' }}>8+ chars with Upper, Lower, Number & Symbol</p>
                    }
                  </div>
                </div>
              )}

              {/* Step 2: Profile Details */}
              {signupStep === 2 && (
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
                    <label>Gender {!gender && <span style={{ color: '#ff453a', fontSize: '0.8rem' }}>*</span>}</label>
                    <div className="custom-select-wrapper">
                      <select 
                        value={gender} 
                        onChange={e => { setGender(e.target.value); clearFieldError('gender'); }}
                        className="glass-select"
                        style={fieldErrors.gender ? { borderColor: '#ff453a' } : {}}
                      >
                        <option value="" disabled>Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Non-binary">Non-binary</option>
                        <option value="Other">Other</option>
                      </select>
                      <div className="select-arrow">▼</div>
                    </div>
                    {fieldErrors.gender && <span style={{ fontSize: '0.8rem', color: '#ff453a', marginTop: '2px', display: 'block', marginLeft: '4px' }}>{fieldErrors.gender}</span>}
                  </div>

                  {/* Status */}
                  <div className="field-section">
                    <label>Relationship Status {!status && <span style={{ color: '#ff453a', fontSize: '0.8rem' }}>*</span>}</label>
                    <div className="custom-select-wrapper">
                      <select 
                        value={status} 
                        onChange={e => { setStatus(e.target.value); clearFieldError('status'); }}
                        className="glass-select"
                        style={fieldErrors.status ? { borderColor: '#ff453a' } : {}}
                      >
                        <option value="" disabled>Select Status</option>
                        {STATUS_OPTIONS.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <div className="select-arrow">▼</div>
                    </div>
                    {fieldErrors.status && <span style={{ fontSize: '0.8rem', color: '#ff453a', marginTop: '2px', display: 'block', marginLeft: '4px' }}>{fieldErrors.status}</span>}
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
                {signupStep < 2 ? (
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
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        :root {
          --glass-border: rgba(255, 255, 255, 0.05);
          --brand-blue: #0a84ff;
          --brand-gradient: linear-gradient(135deg, #0a84ff 0%, #0051ff 100%);
          --brand-glow: 0 8px 32px rgba(10, 132, 255, 0.25);
          --text-primary: #ffffff;
          --text-secondary: rgba(255, 255, 255, 0.5);
          --input-bg: rgba(0, 0, 0, 0.3);
        }

        .login-container {
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #030304;
          background-image:
            radial-gradient(circle at 50% -20%, rgba(10, 132, 255, 0.12) 0%, transparent 60%),
            radial-gradient(circle at 100% 100%, rgba(120, 40, 255, 0.06) 0%, transparent 50%),
            radial-gradient(circle at 0% 100%, rgba(0, 200, 255, 0.03) 0%, transparent 40%);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          padding: 16px;
          padding-bottom: env(safe-area-inset-bottom);
          overflow-y: auto;
          box-sizing: border-box;
        }

        .login-card {
          width: 100%;
          max-width: 420px;
          background: rgba(18, 18, 22, 0.55);
          backdrop-filter: blur(48px) saturate(180%);
          -webkit-backdrop-filter: blur(48px) saturate(180%);
          border-radius: 28px;
          padding: 24px 24px 20px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.02),
            0 32px 64px rgba(0, 0, 0, 0.5),
            inset 0 1px 0 rgba(255,255,255,0.06);
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
          overflow: hidden;
          animation: cardIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        @keyframes cardIn {
          from { opacity: 0; transform: translateY(24px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* Top glow line */
        .login-card::before {
          content: '';
          position: absolute;
          top: 0; left: 15%; right: 15%; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(10, 132, 255, 0.5), transparent);
          border-radius: 50%;
        }

        /* Ambient inner glow */
        .login-card::after {
          content: '';
          position: absolute;
          top: -100px; left: 50%; transform: translateX(-50%);
          width: 300px; height: 200px;
          background: radial-gradient(ellipse, rgba(10, 132, 255, 0.1) 0%, transparent 60%);
          pointer-events: none;
        }

        @media (max-width: 480px) {
          .login-card { padding: 20px 16px 16px; border-radius: 24px; }
        }

        .app-title {
          font-size: clamp(2rem, 7vw, 2.8rem);
          font-weight: 800;
          margin: 0 0 4px 0;
          background: linear-gradient(135deg, #ffffff 0%, #a5caff 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          text-shadow: 0 10px 40px rgba(10, 132, 255, 0.2);
          letter-spacing: -1.2px;
          line-height: 1.1;
          display: inline-block;
        }

        .app-subtitle {
          color: var(--text-secondary);
          font-size: 0.85rem;
          margin: 0 0 16px 0;
          font-weight: 500;
          letter-spacing: 0.2px;
        }

        /* Segmented pill toggle */
        .auth-toggle {
          display: flex;
          background: rgba(0, 0, 0, 0.25);
          padding: 4px;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.04);
          width: 100%;
          margin-bottom: 16px;
        }

        .toggle-btn {
          flex: 1;
          padding: 12px 0;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.45);
          font-weight: 600;
          font-size: 0.9rem;
          letter-spacing: 0.3px;
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .toggle-btn.active {
          background: rgba(255, 255, 255, 0.08); /* Sophisticated Dark Pill */
          color: white;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05);
        }

        .login-form {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .input-group {
          width: 100%;
          position: relative;
        }

        .input-field {
          width: 100%;
          background: var(--input-bg);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 12px 36px 12px 14px;
          border-radius: 12px;
          color: white;
          font-size: 0.9rem;
          font-family: inherit;
          font-weight: 500;
          outline: none;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          box-sizing: border-box;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
        }

        .input-field::placeholder { color: rgba(255, 255, 255, 0.25); font-weight: 400; }

        .input-field:focus {
          border-color: rgba(10, 132, 255, 0.4);
          background: rgba(10, 132, 255, 0.03);
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.1), 0 0 0 4px rgba(10, 132, 255, 0.1);
        }

        .btn-primary {
          width: 100%;
          padding: 12px;
          background: var(--brand-gradient);
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 0.9rem;
          font-weight: 700;
          font-family: inherit;
          letter-spacing: 0.3px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: var(--brand-glow), inset 0 1px 0 rgba(255,255,255,0.2);
          margin-top: 4px;
          position: relative;
        }

        .btn-primary:hover { 
          transform: translateY(-2px); 
          box-shadow: 0 12px 40px rgba(10, 132, 255, 0.35), inset 0 1px 0 rgba(255,255,255,0.2); 
        }
        .btn-primary:active { transform: scale(0.98); filter: brightness(0.95); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; transform: none; filter: none; }

        /* Forgot password */
        .forgot-link {
          color: rgba(100, 180, 255, 0.85);
          font-size: 0.85rem;
          cursor: pointer;
          text-align: right;
          font-weight: 500;
          transition: color 0.2s;
          margin-top: -6px;
        }
        .forgot-link:hover { color: #80c4ff; }

        .auth-separator {
          width: 100%;
          display: flex;
          align-items: center;
          margin: 16px 0 16px;
          color: rgba(255, 255, 255, 0.3);
        }

        .auth-separator::before,
        .auth-separator::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(255, 255, 255, 0.08);
        }

        .auth-separator span {
          padding: 0 16px;
          text-transform: uppercase;
          font-size: 0.7rem;
          letter-spacing: 1.5px;
          font-weight: 600;
        }

        .btn-google {
          width: 100%;
          background: rgba(255, 255, 255, 0.04);
          color: white;
          font-weight: 600;
          font-family: inherit;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 12px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          cursor: pointer;
          font-size: 0.85rem;
          letter-spacing: 0.2px;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .btn-google:hover { 
          background: rgba(255, 255, 255, 0.08); 
          border-color: rgba(255, 255, 255, 0.15);
          transform: translateY(-1px);
        }
        .btn-google:active { transform: scale(0.98); }

        /* Alert */
        .alert-message {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 16px;
          border-radius: 14px;
          font-size: 0.875rem;
          line-height: 1.45;
          width: 100%;
          animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          text-align: left;
          box-sizing: border-box;
          margin-bottom: 20px;
          font-weight: 500;
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .alert-error { background: rgba(255, 60, 50, 0.12); border: 1px solid rgba(255, 60, 50, 0.25); color: #ff6a62; }
        .alert-success { background: rgba(52, 199, 89, 0.12); border: 1px solid rgba(52, 199, 89, 0.25); color: #4ade80; }
        .alert-icon { font-size: 1.1rem; margin-top: 1px; flex-shrink: 0; }
        .alert-content { flex: 1; }

        /* Step Indicator */
        .step-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
          width: 100%;
          gap: 0;
        }

        .step {
          width: 32px; height: 32px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.85rem;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          border: 1px solid rgba(255,255,255,0.08);
          flex-shrink: 0;
        }
        .step.active {
          background: var(--brand-gradient);
          color: white;
          box-shadow: 0 0 20px rgba(10, 132, 255, 0.4);
          border-color: transparent;
        }
        .step-line {
          flex: 1;
          max-width: 48px;
          height: 1.5px;
          background: rgba(255, 255, 255, 0.08);
          margin: 0 8px;
        }

        /* Signup Step */
        .signup-step {
          width: 100%;
          animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .step-title {
          font-size: 1.2rem;
          font-weight: 700;
          color: white;
          margin: 0 0 12px 0;
          text-align: center;
          letter-spacing: -0.3px;
        }

        .step-navigation {
          display: flex;
          gap: 12px;
          width: 100%;
          margin-top: 8px;
        }
        .btn-back {
          flex: 1;
          padding: 12px;
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.8);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 600;
          font-family: inherit;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .btn-back:hover { background: rgba(255,255,255,0.09); color: white; }

        .btn-next, .btn-submit {
          flex: 1;
          padding: 12px;
          background: var(--brand-gradient);
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 0.9rem;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: var(--brand-glow), inset 0 1px 0 rgba(255,255,255,0.2);
        }
        .btn-next:hover, .btn-submit:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(10, 132, 255, 0.35), inset 0 1px 0 rgba(255,255,255,0.2); }
        .btn-next:active, .btn-submit:active { transform: scale(0.98); }
        .btn-submit:disabled { opacity: 0.55; cursor: not-allowed; transform: none; filter: none; }

        /* Field Sections */
        .field-section { margin-bottom: 20px; }
        .field-section label {
          display: block;
          color: var(--text-secondary);
          font-size: 0.85rem;
          margin-bottom: 8px;
          margin-left: 4px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .sub-label { font-size: 0.75rem; opacity: 0.7; font-weight: 500; text-transform: none; letter-spacing: 0; }

        .custom-select-wrapper { position: relative; }
        .glass-select {
          width: 100%;
          background: var(--input-bg);
          color: white;
          border: 1px solid rgba(255,255,255,0.06);
          padding: 12px 36px 12px 14px;
          border-radius: 12px;
          font-size: 0.9rem;
          font-family: inherit;
          font-weight: 500;
          appearance: none;
          outline: none;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
        }
        .glass-select option { background: #1c1c1e; color: white; }
        .glass-select:focus { border-color: rgba(10,132,255,0.4); background: rgba(10,132,255,0.03); box-shadow: inset 0 2px 4px rgba(0,0,0,0.1), 0 0 0 4px rgba(10, 132, 255, 0.1); }
        .select-arrow {
          position: absolute; right: 16px; top: 50%; transform: translateY(-50%);
          color: var(--text-secondary); pointer-events: none; font-size: 0.75rem;
        }

        .chip-group { display: flex; flex-wrap: wrap; gap: 8px; }
        .chip {
          padding: 8px 16px; border-radius: 20px;
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.7);
          border: 1px solid rgba(255,255,255,0.08);
          cursor: pointer; font-size: 0.85rem; font-family: inherit; font-weight: 500;
          transition: all 0.25s ease;
        }
        .chip:hover { background: rgba(255,255,255,0.1); color: white; }
        .chip.selected { background: rgba(10,132,255,0.15); border-color: rgba(10,132,255,0.4); color: #7dd3fc; }

        .glass-input-small {
          flex: 1;
          background: var(--input-bg);
          border: 1px solid rgba(255,255,255,0.06);
          color: white;
          padding: 14px 16px;
          border-radius: 14px;
          font-size: 0.95rem;
          font-family: inherit;
          font-weight: 500;
          outline: none;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
        }
        .glass-input-small:focus { border-color: rgba(10,132,255,0.4); }
        .btn-primary-small { transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
        .btn-primary-small:active { transform: scale(0.95); }

        /* Modal */
        .modal-backdrop {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.85);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          z-index: 1000;
          display: flex; align-items: center; justify-content: center;
        }
        .modal-content {
          background: rgba(20, 20, 24, 0.85);
          backdrop-filter: blur(40px) saturate(150%);
          -webkit-backdrop-filter: blur(40px) saturate(150%);
          width: 90%; max-width: 400px;
          padding: 40px 32px; border-radius: 32px;
          border: 1px solid rgba(255,255,255,0.08);
          text-align: center;
          color: white;
          box-shadow: 0 32px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06);
          animation: popIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes popIn {
          from { transform: scale(0.92) translateY(20px); opacity: 0; }
          to   { transform: scale(1) translateY(0); opacity: 1; }
        }
        .modal-content h3 { margin: 0 0 12px; color: white; font-weight: 700; font-size: 1.45rem; letter-spacing: -0.3px; }
        .modal-content p { color: rgba(255,255,255,0.6); font-size: 0.95rem; margin-bottom: 28px; line-height: 1.5; }
        .modal-content input {
          width: 100%; padding: 14px; border-radius: 14px; box-sizing: border-box;
          background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.06);
          color: white; font-size: 1.05rem; margin-bottom: 24px;
          text-align: center; letter-spacing: 2px; font-family: inherit; font-weight: 600;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
          transition: all 0.25s ease;
        }
        .modal-content input:focus { border-color: rgba(10,132,255,0.4); outline: none; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1), 0 0 0 4px rgba(10, 132, 255, 0.1); }
        .modal-footer { display: flex; gap: 12px; }
        .btn-sec, .btn-pri {
          flex: 1; padding: 16px; border-radius: 16px; border: none;
          font-weight: 600; font-family: inherit; cursor: pointer; font-size: 0.95rem; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .btn-sec { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.05); }
        .btn-sec:hover { background: rgba(255,255,255,0.1); color: white; }
        .btn-pri { background: var(--brand-gradient); color: white; box-shadow: var(--brand-glow), inset 0 1px 0 rgba(255,255,255,0.2); }
        .btn-pri:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(10,132,255,0.35), inset 0 1px 0 rgba(255,255,255,0.2); }
        .btn-pri:active { transform: scale(0.98); }

      `}</style>
      {cropImage && (
        <Suspense fallback={null}>
          <ImageCropper
              imageSrc={cropImage}
              onCropComplete={onCropComplete}
              onCancel={onCropCancel}
          />
        </Suspense>
      )}
    </div>
  );
}
