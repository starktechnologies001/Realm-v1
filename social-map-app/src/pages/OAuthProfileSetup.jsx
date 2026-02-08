import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { uploadToStorage } from '../utils/fileUpload';
import { 
  DEFAULT_MALE_AVATAR, 
  DEFAULT_FEMALE_AVATAR, 
  DEFAULT_GENERIC_AVATAR 
} from '../utils/avatarUtils';
import ImageCropper from '../components/ImageCropper';
import { useLocationContext } from '../context/LocationContext';

const STATUS_OPTIONS = ['Single', 'Married', 'Committed', 'Open to Date'];

  export default function OAuthProfileSetup() {
  const navigate = useNavigate();
  const { permissionStatus, setPermission } = useLocationContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // User data from OAuth
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [googlePhotoUrl, setGooglePhotoUrl] = useState('');
  
  // Profile fields
  const [gender, setGender] = useState('');
  const [status, setStatus] = useState('');
  const [selectedInterests, setSelectedInterests] = useState([]);
  
  // Photo selection
  // Photo selection
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setLoading(false);
        navigate('/login');
        return;
      }

      const user = session.user;
      
      setUserId(user.id);
      setEmail(user.email);
      
      // Get Google profile picture if available
      const googlePhoto = user.user_metadata?.avatar_url || user.user_metadata?.picture;
      if (googlePhoto) {
        setGooglePhotoUrl(googlePhoto);
        setAvatarPreview(googlePhoto);
      }

      setLoading(false);
    };
    
    checkAuth();
  }, [navigate]);

  if (loading) return <Loader />;

  const [cropImage, setCropImage] = useState(null); // State for cropping

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("File is too large (max 5MB)");
      return;
    }

    // Open Cropper
    const reader = new FileReader();
    reader.addEventListener('load', () => {
        setCropImage(reader.result);
    });
    reader.readAsDataURL(file);
    
    // Reset val
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!gender) throw new Error('Please select a gender');
      if (!status) throw new Error('Please select a relationship status');

      let finalAvatarUrl;

      // Priority: 1. Uploaded File, 2. Google Photo, 3. Gender Default
      if (avatarFile) {
        // Upload custom photo
        const { fileUrl, error: uploadError } = await uploadToStorage(avatarFile, userId, null, 'chat-images');
        if (uploadError) throw uploadError;
        finalAvatarUrl = fileUrl;
      } else if (googlePhotoUrl) {
        // Keep Google photo
        finalAvatarUrl = googlePhotoUrl;
      } else {
        // Use default based on gender
        if (gender === 'Male') finalAvatarUrl = DEFAULT_MALE_AVATAR;
        else if (gender === 'Female') finalAvatarUrl = DEFAULT_FEMALE_AVATAR;
        else finalAvatarUrl = DEFAULT_GENERIC_AVATAR;
      }

      // Update profile in database
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          gender,
          status,
          interests: selectedInterests,
          avatar_url: finalAvatarUrl
        })
        .eq('id', userId);

      if (updateError) throw updateError;

      // Update user metadata
      await supabase.auth.updateUser({
        data: {
          gender,
          status,
          avatar_url: finalAvatarUrl,
          interests: selectedInterests
        }
      });

      // Update localStorage
      const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
      localStorage.setItem('currentUser', JSON.stringify({
        ...currentUser,
        gender,
        status,
        avatar_url: finalAvatarUrl,
        interests: selectedInterests
      }));

      navigate('/map');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="oauth-setup-container">
      <div className="oauth-setup-card">
        <h1 className="setup-title">Complete Your Profile</h1>
        <p className="setup-subtitle">Just a few more details to get started</p>

        {error && (
          <div className="alert-error">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="setup-form">
          {/* Photo Selection */}
          <div className="photo-section">
             <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{ position: 'relative', width: '120px', height: '120px', margin: '0 auto 12px' }}>
                  <div style={{ 
                      width: '120px', height: '120px', 
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
                              src={gender === 'Female' ? DEFAULT_FEMALE_AVATAR : (gender === 'Male' ? DEFAULT_MALE_AVATAR : DEFAULT_GENERIC_AVATAR)} 
                              alt="Default Avatar" 
                              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} 
                          />
                      )}
                  </div>
                  
                  <label 
                      htmlFor="avatar-upload"
                      style={{
                          position: 'absolute', bottom: '5px', right: '5px',
                          width: '36px', height: '36px',
                          background: '#0a84ff', // Brand blue
                          borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer',
                          boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                          border: '2px solid #1c1c1e'
                      }}
                  >
                      <span style={{ fontSize: '1.4rem', color: 'white', marginTop: '-3px' }}>+</span>
                  </label>
                  <input 
                      id="avatar-upload" 
                      type="file" 
                      accept="image/*" 
                      onChange={handleFileChange} 
                      style={{ display: 'none' }} 
                  />
                </div>
                <p style={{ fontSize: '0.9rem', color: '#aaa', margin: 0 }}>
                    {avatarFile ? 'New photo selected' : (googlePhotoUrl ? 'Using Google Photo' : 'Upload a photo')}
                </p>
              </div>
          </div>

          {/* Gender */}
          <div className="field-section">
            <label>Gender *</label>
            <select 
              value={gender} 
              onChange={e => {
                setGender(e.target.value);
                // Only update preview if no custom/google photo is active
                if (!avatarFile && !googlePhotoUrl) {
                  const defaultAvatar = e.target.value === 'Male' ? DEFAULT_MALE_AVATAR : 
                                      e.target.value === 'Female' ? DEFAULT_FEMALE_AVATAR : 
                                      DEFAULT_GENERIC_AVATAR;
                  setAvatarPreview(defaultAvatar);
                }
              }}
              className="select-field"
              required
            >
              <option value="">Select Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Non-binary">Non-binary</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Status */}
          <div className="field-section">
            <label>Relationship Status *</label>
            <select 
              value={status} 
              onChange={e => setStatus(e.target.value)}
              className="select-field"
              required
            >
              <option value="">Select Status</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Interests */}
          <div className="field-section">
            <label>Interests <span className="optional">(Optional, up to 5)</span></label>
            <div className="interests-input">
              <input 
                type="text" 
                placeholder="Type and press Enter..." 
                className="interest-input"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = e.target.value.trim();
                    if (val && selectedInterests.length < 5) {
                      const formatted = val.charAt(0).toUpperCase() + val.slice(1);
                      if (!selectedInterests.includes(formatted)) {
                        setSelectedInterests([...selectedInterests, formatted]);
                        e.target.value = '';
                      }
                    }
                  }
                }}
              />
            </div>
            <div className="interests-chips">
              {selectedInterests.map(interest => (
                <span key={interest} className="interest-chip" onClick={() => toggleInterest(interest)}>
                  {interest} ✕
                </span>
              ))}
            </div>
          </div>

          {/* Location Permission Section - Only show if not already enabled */}
          {permissionStatus !== 'granted' && (
            <div className="field-section" style={{ marginTop: '12px', padding: '16px', background: 'rgba(52, 199, 89, 0.1)', borderRadius: '16px', border: '1px solid rgba(52, 199, 89, 0.2)' }}>
                <label style={{ color: '#34c759', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>📍</span> Enable Location
                </label>
                <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', margin: '8px 0 16px', lineHeight: '1.4' }}>
                    To see people around you and appear on the map, you need to enable location services. You can turn this off anytime.
                </p>
                
                <button 
                    type="button" 
                    onClick={() => {
                        if ('geolocation' in navigator) {
                            navigator.geolocation.getCurrentPosition(
                                (position) => {
                                    // Success - Permission Granted
                                    console.log("Location access granted during setup:", position);
                                    setPermission('granted'); // Update Context
                                },
                                (error) => {
                                    console.error("Location access denied:", error);
                                    setPermission('denied'); // Update Context
                                    alert("Location denied. You won't appear on the map, but you can change this in settings later.");
                                }
                            );
                        }
                    }}
                    id="loc-btn"
                    style={{
                        width: '100%',
                        padding: '12px',
                        background: '#34c759',
                        border: 'none',
                        borderRadius: '10px',
                        color: 'white',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                    }}
                >
                    Allow Location Access
                </button>
            </div>
          )}

          <button type="submit" disabled={loading} className="submit-btn">
            {loading ? 'Saving...' : 'Complete Setup'}
          </button>
        </form>
      </div>

      <style>{`
        .oauth-setup-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #000;
          background-image: radial-gradient(circle at 50% 0%, rgba(0, 122, 255, 0.15) 0%, transparent 50%);
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .oauth-setup-card {
          width: 100%;
          max-width: 500px;
          background: #1c1c1e;
          border-radius: 20px;
          padding: 40px 32px;
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1);
        }

        .setup-title {
          font-size: 2rem;
          font-weight: 700;
          color: #0caeff;
          text-align: center;
          margin: 0 0 8px 0;
        }

        .setup-subtitle {
          text-align: center;
          color: #888;
          margin: 0 0 32px 0;
        }

        .alert-error {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: rgba(255, 69, 58, 0.1);
          border: 1px solid rgba(255, 69, 58, 0.2);
          border-left: 4px solid #ff453a;
          border-radius: 12px;
          color: #ff453a;
          margin-bottom: 24px;
        }

        .setup-form {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .photo-section h3 {
          color: white;
          font-size: 1.1rem;
          margin: 0 0 16px 0;
        }

        .photo-preview {
          display: flex;
          justify-content: center;
          margin-bottom: 20px;
        }

        .avatar-circle {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          overflow: hidden;
          border: 3px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.05);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .avatar-circle img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .placeholder-avatar {
          font-size: 3rem;
        }

        .photo-options {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 16px;
        }

        .photo-option {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
          color: #ccc;
        }

        .photo-option:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(0, 122, 255, 0.3);
        }

        .photo-option input[type="radio"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .upload-section {
          text-align: center;
        }

        .upload-btn {
          display: inline-block;
          padding: 12px 24px;
          background: rgba(0, 122, 255, 0.2);
          border: 1px solid #007aff;
          border-radius: 10px;
          color: #007aff;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .upload-btn:hover {
          background: rgba(0, 122, 255, 0.3);
        }

        .field-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .field-section label {
          color: #aaa;
          font-size: 0.9rem;
          margin-left: 4px;
        }

        .optional {
          font-size: 0.8rem;
          color: #666;
        }

        .select-field {
          width: 100%;
          padding: 14px 16px;
          background: #2c2c2e;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: white;
          font-size: 1rem;
          outline: none;
        }

        .select-field:focus {
          border-color: #007aff;
        }

        .interest-input {
          width: 100%;
          padding: 12px 16px;
          background: #2c2c2e;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: white;
          font-size: 0.95rem;
          outline: none;
        }

        .interest-input:focus {
          border-color: #007aff;
        }

        .interests-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 8px;
        }

        .interest-chip {
          padding: 8px 16px;
          background: rgba(0, 122, 255, 0.2);
          border: 1px solid #007aff;
          border-radius: 20px;
          color: #007aff;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .interest-chip:hover {
          background: rgba(0, 122, 255, 0.3);
        }

        .submit-btn {
          width: 100%;
          padding: 16px;
          background: linear-gradient(135deg, #007aff 0%, #00c6ff 100%);
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 8px;
        }

        .submit-btn:hover {
          box-shadow: 0 8px 20px rgba(0, 122, 255, 0.3);
        }

        .submit-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
      `}</style>
      <style>{`
        /* ... styles ... */
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
