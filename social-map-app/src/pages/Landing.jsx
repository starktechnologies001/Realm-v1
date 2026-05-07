import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LocationOnboarding from '../components/LocationOnboarding';
import { supabase } from '../supabaseClient';

export default function Landing() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  
  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement.getAttribute('data-theme') === 'dark' || 
    (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );

  useEffect(() => {
    let mounted = true;
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session && mounted) {
        navigate('/map');
      } else if (mounted) {
        setChecking(false);
      }
    };
    checkSession();
    return () => { mounted = false; };
  }, [navigate]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      if (document.documentElement.getAttribute('data-theme') === 'system' || !document.documentElement.hasAttribute('data-theme')) {
         setIsDarkMode(e.matches);
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'data-theme') {
                const theme = document.documentElement.getAttribute('data-theme');
                if (theme === 'dark') setIsDarkMode(true);
                else if (theme === 'light') setIsDarkMode(false);
                else setIsDarkMode(mediaQuery.matches);
            }
        });
    });
    observer.observe(document.documentElement, { attributes: true });

    return () => {
        mediaQuery.removeEventListener('change', handleChange);
        observer.disconnect();
    };
  }, []);

  const handleEnableLocation = () => {
    // Request location permission first
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => {
           // Successfully granted permission, proceed to login
           navigate('/signup');
        },
        (error) => {
           console.warn("Location permission denied/error", error);
           // Still proceed, they can enable it later
           navigate('/signup');
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 0 }
      );
    } else {
      navigate('/signup');
    }
  };

  if (checking) {
    return (
        <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-primary, #000)' }}>
            <div className="spinner" style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid var(--brand-blue, #0084ff)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
    );
  }

  return <LocationOnboarding onEnable={handleEnableLocation} isDarkMode={isDarkMode} />;
}
