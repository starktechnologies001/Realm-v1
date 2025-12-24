import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const INTERESTS_OPTIONS = ['Singing', 'Dating', 'Travelling', 'Gaming', 'Cooking', 'Hiking', 'Reading', 'Music'];
const STATUS_OPTIONS = ['Single', 'Married', 'Committed', 'Open to Date'];
const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Other'];

export default function Login() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // New Profile Fields
  const [status, setStatus] = useState('');
  const [gender, setGender] = useState('');
  const [selectedInterests, setSelectedInterests] = useState([]);

  // Selfie Verification State
  const [capturedImage, setCapturedImage] = useState(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
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

    if (!email.trim() || !password.trim()) {
      setError('Please enter email and password.');
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

        // 3. Upload Selfie
        let avatarUrl = '';
        try {
          const blob = await (await fetch(capturedImage)).blob();
          const fileName = `${Date.now()}_${username.replace(/\s+/g, '')}.jpg`;

          const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, blob);

          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage
            .from('avatars')
            .getPublicUrl(fileName);

          avatarUrl = urlData.publicUrl;

        } catch (uploadErr) {
          console.error("Upload failed", uploadErr);
          throw new Error('Failed to upload selfie. Please try again.');
        }

        // 4. Sign Up
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
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

        alert(`Account created! Please check ${email} for a verification link.`);
        setIsSignUp(false);
        setCapturedImage(null); // Reset

      } else {
        // Login Logic
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
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
            // Fallback to metadata if profile fetch fails
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
            // Use profile data from database (includes avatar_url from selfie)
            localStorage.setItem('currentUser', JSON.stringify({
              id: profile.id,
              name: profile.username || profile.full_name,
              username: profile.username,
              full_name: profile.full_name,
              gender: profile.gender,
              avatar_url: profile.avatar_url, // This is the selfie avatar!
              status: profile.status || 'Online',
              interests: profile.interests
            }));
          }
          navigate('/map');
        }
      }
    } catch (err) {
      console.error(err);
      // Handle Supabase "User already registered" error
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
            Sign Up
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleAuth} className="login-form">
          {/* Base Credentials */}
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

          <div className="input-group">
            <input
              type="text"
              className="input-field"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required={isSignUp}
            />
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

              <div className="field-section">
                <label>Gender</label>
                <div className="chip-group">
                  {GENDER_OPTIONS.map(g => (
                    <button
                      key={g}
                      type="button"
                      className={`chip ${gender === g ? 'selected' : ''}`}
                      onClick={() => setGender(g)}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field-section">
                <label>Status</label>
                <div className="chip-group">
                  {STATUS_OPTIONS.map(s => (
                    <button
                      key={s}
                      type="button"
                      className={`chip ${status === s ? 'selected' : ''}`}
                      onClick={() => setStatus(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field-section">
                <label>Interests <span className="sub-label">(Pick up to 5)</span></label>
                <div className="chip-group">
                  {INTERESTS_OPTIONS.map(interest => (
                    <button
                      key={interest}
                      type="button"
                      className={`chip ${selectedInterests.includes(interest) ? 'selected' : ''}`}
                      onClick={() => toggleInterest(interest)}
                    >
                      {interest}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}

          <button type="submit" className="btn-primary">
            {isSignUp ? "Create Profile" : "Log In"}
          </button>

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
        </form>
      </div>

      <style>{`
        .login-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at top right, #1e1e24, var(--bg-color));
          padding: var(--spacing-md);
        }
        
        .login-card {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-md);
          padding: 40px;
          width: 100%;
          max-width: 450px; /* Slightly wider for chips */
          backdrop-filter: blur(12px);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          /* Scroll if too tall on mobile */
          max-height: 95vh;
          overflow-y: auto;
        }

        /* Hide scrollbar */
        .login-card::-webkit-scrollbar {
          width: 0px;
          background: transparent;
        }
        
        .app-title {
          font-size: 2.2rem;
          font-weight: 800;
          margin-bottom: var(--spacing-sm);
          background: var(--brand-gradient);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-align: center;
        }
        
        .app-subtitle {
          color: var(--text-secondary);
          margin-bottom: 24px;
          font-size: 1rem;
          text-align: center;
        }

        .auth-toggle {
          display: flex;
          background: rgba(255, 255, 255, 0.05);
          padding: 4px;
          border-radius: var(--radius-md);
          margin-bottom: 24px;
        }

        .toggle-btn {
          flex: 1;
          padding: 10px;
          border-radius: 8px;
          background: transparent;
          color: var(--text-secondary);
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .toggle-btn.active {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        
        .error-message {
          background: rgba(255, 50, 50, 0.1);
          color: #ff4d4d;
          padding: 10px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 0.9rem;
          border: 1px solid rgba(255, 50, 50, 0.2);
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        .input-field {
          width: 100%;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 14px;
          border-radius: var(--radius-md);
          color: white;
          font-size: 1rem;
          outline: none;
          transition: border-color 0.2s;
        }
        
        .input-field:focus {
          border-color: var(--brand-primary);
        }
        
        .signup-fields {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-top: 8px;
          padding-top: 16px;
          border-top: 1px solid rgba(255,255,255,0.1);
          animation: slideDown 0.3s ease-out;
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .field-section label {
          display: block;
          color: var(--text-secondary);
          font-size: 0.9rem;
          margin-bottom: 8px;
          font-weight: 500;
        }
        
        .sub-label {
          font-size: 0.75rem;
          opacity: 0.7;
          font-weight: normal;
        }

        .chip-group {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .chip {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--text-secondary);
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .chip:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .chip.selected {
          background: var(--brand-primary); /* Or use brand gradient carefully */
          background: linear-gradient(135deg, rgba(0, 240, 255, 0.3), rgba(189, 0, 255, 0.3));
          color: white;
          border-color: var(--brand-primary);
          box-shadow: 0 0 8px rgba(0, 240, 255, 0.3);
        }

        /* Camera UI */
        .camera-container {
            width: 100%;
            height: 200px;
            background: #000;
            border-radius: 16px;
            overflow: hidden;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px dashed rgba(255,255,255,0.2);
        }
        .camera-placeholder {
            width: 100%; height: 100%;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer;
            color: #aaa;
            font-size: 0.9rem;
        }
        .camera-placeholder:hover { background: rgba(255,255,255,0.1); }
        
        .video-wrapper {
            position: relative;
            width: 100%;
            height: 100%;
        }
        .camera-preview {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .capture-btn {
            position: absolute;
            bottom: 20px; left: 50%; transform: translateX(-50%);
            width: 60px; height: 60px;
            border-radius: 50%;
            background: white;
            border: 4px solid rgba(0,0,0,0.2);
            cursor: pointer;
            z-index: 10;
        }
        .capture-btn:active { transform: translateX(-50%) scale(0.9); }
        
        .captured-preview {
            position: relative;
            width: 100%; height: 100%;
        }
        .captured-preview img {
            width: 100%; height: 100%; object-fit: cover;
        }
        .retake-btn {
            position: absolute;
            bottom: 10px; right: 10px;
            background: rgba(0,0,0,0.6);
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.8rem;
        }

        .btn-primary {
          background: var(--brand-gradient);
          color: white;
          padding: 16px;
          border-radius: var(--radius-md);
          font-weight: bold;
          font-size: 1rem;
          cursor: pointer;
          transition: transform 0.1s;
          margin-top: 16px;
        }
        
        .btn-primary:active {
          transform: scale(0.98);
        }

        .auth-separator {
          display: flex;
          align-items: center;
          text-align: center;
          margin: 20px 0;
          color: var(--text-secondary);
          font-size: 0.85rem;
        }
        .auth-separator::before, .auth-separator::after {
          content: '';
          flex: 1;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .auth-separator span {
          padding: 0 10px;
        }

        .btn-google {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          background: white;
          color: #3c4043;
          padding: 14px;
          border-radius: var(--radius-md);
          font-weight: 500;
          font-size: 1rem;
          border: none;
          cursor: pointer;
          transition: background 0.2s;
        }
        .btn-google:hover {
          background: #f1f3f4;
        }
        .btn-google:active {
          background: #e8eaed;
          transform: scale(0.99);
        }
      `}</style>
    </div>
  );
}
