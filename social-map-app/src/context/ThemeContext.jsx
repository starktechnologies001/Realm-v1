import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const ThemeContext = createContext();

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within ThemeProvider');
    }
    return context;
};

export const ThemeProvider = ({ children }) => {
    // Initialize from localStorage immediately to prevent flash
    const [theme, setTheme] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('app_theme');
            // User requested default to Light, and we removed System mode.
            // If saved is 'system' or null, default to 'light'.
            if (!saved || saved === 'system') return 'light';
            return saved;
        }
        return 'light';
    });
    const [loading, setLoading] = useState(true);

    // Apply theme to HTML element
    const applyTheme = (themeValue) => {
        document.documentElement.setAttribute('data-theme', themeValue);
    };

    // Apply immediate execution on mount for the HTML attribute
    useEffect(() => {
        applyTheme(theme);
    }, [theme]);

    // Load theme from database or localStorage
    useEffect(() => {
        const loadTheme = async () => {
            try {
                // Try localStorage first (faster)
                let savedTheme = localStorage.getItem('app_theme');
                if (savedTheme === 'system') savedTheme = 'light'; // Coerce system to light
                
                if (savedTheme) {
                    setTheme(savedTheme);
                    applyTheme(savedTheme);
                }

                // Then sync with database
                const { data: { session } } = await supabase.auth.getSession();
                const user = session?.user;
                if (user) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('app_theme')
                        .eq('id', user.id)
                        .maybeSingle();

                    if (profile?.app_theme) {
                        let dbTheme = profile.app_theme;
                        if (dbTheme === 'system') dbTheme = 'light'; // Coerce system to light
                        
                        setTheme(dbTheme);
                        applyTheme(dbTheme);
                        localStorage.setItem('app_theme', dbTheme);
                    }
                }
            } catch (error) {
                console.error('Error loading theme:', error);
            } finally {
                setLoading(false);
            }
        };

        loadTheme();
    }, []);

    // Update theme
    const updateTheme = async (newTheme) => {
        console.log('🎨 Updating theme to:', newTheme);
        setTheme(newTheme);
        applyTheme(newTheme);
        localStorage.setItem('app_theme', newTheme);
        console.log('✅ Theme applied to HTML:', document.documentElement.getAttribute('data-theme'));

        // Save to database
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;
            if (user) {
                await supabase
                    .from('profiles')
                    .update({ app_theme: newTheme })
                    .eq('id', user.id);
            }
        } catch (error) {
            console.error('Error saving theme:', error);
        }
    };

    return (
        <ThemeContext.Provider value={{ theme, updateTheme, loading }}>
            {children}
        </ThemeContext.Provider>
    );
};
