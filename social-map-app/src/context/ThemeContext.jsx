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

// All 6 Silver-exclusive premium themes
export const SILVER_THEMES = [
    {
        key: 'aurora',
        name: 'Aurora',
        icon: '🌌',
        preview: 'linear-gradient(135deg, #030d17, #10b981 40%, #6d28d9)',
        description: 'Northern lights inspire'
    },
    {
        key: 'ocean_blue',
        name: 'Ocean',
        icon: '🌊',
        preview: 'linear-gradient(135deg, #051622, #38bdf8 60%, #0ea5e9)',
        description: 'Deep sea calm'
    },
    {
        key: 'sunset_orange',
        name: 'Sunset',
        icon: '🌅',
        preview: 'linear-gradient(135deg, #1e0b00, #f97316 55%, #fb923c)',
        description: 'Warm dusk glow'
    },
    {
        key: 'emerald',
        name: 'Emerald',
        icon: '💚',
        preview: 'linear-gradient(135deg, #021a0d, #22c55e 55%, #4ade80)',
        description: 'Verdant forest'
    },
    {
        key: 'glass_theme',
        name: 'Glass Theme',
        icon: '🔮',
        preview: 'linear-gradient(135deg, #0a0a1a, #6366f1 50%, #a855f7)',
        description: 'Frosted glass luxury'
    },
    {
        key: 'dark_plus',
        name: 'Dark Plus',
        icon: '🌑',
        preview: 'linear-gradient(135deg, #0d0d0d, #141414 50%, #1a1a1a)',
        description: 'Ultra dark refined'
    },
];

// All 5 Gold-exclusive animated themes
export const GOLD_THEMES = [
    {
        key: 'galaxy',
        name: 'Galaxy',
        icon: '🌌',
        preview: 'linear-gradient(135deg, #09090e, #2e0854 50%, #4c0082)',
        description: 'Animated shifting nebula'
    },
    {
        key: 'neon',
        name: 'Neon',
        icon: '⚡',
        preview: 'linear-gradient(135deg, #000000, #ff007f 50%, #00f0ff)',
        description: 'Flashing pulse lights'
    },
    {
        key: 'cyberpunk',
        name: 'Cyberpunk',
        icon: '🤖',
        preview: 'linear-gradient(135deg, #18001e, #fde047 50%, #000000)',
        description: 'Tech grid movement'
    },
    {
        key: 'royal_black',
        name: 'Royal Black',
        icon: '⚜️',
        preview: 'linear-gradient(135deg, #080808, #b45309 50%, #171717)',
        description: 'Shimmering black gold'
    },
    {
        key: 'aurora_motion',
        name: 'Aurora Motion',
        icon: '🟢',
        preview: 'linear-gradient(135deg, #030a16, #10b981 50%, #047857)',
        description: 'Animate auroral curtains'
    }
];

// All 5 Diamond-exclusive premium themes
export const DIAMOND_THEMES = [
    {
        key: 'diamond_crystal',
        name: 'Diamond Crystal',
        icon: '💎',
        preview: 'linear-gradient(135deg, #0b1528, #00e5ff 60%, #38bdf8)',
        description: 'Translucent ice-blue luxury'
    },
    {
        key: 'space_black',
        name: 'Space Black',
        icon: '🕳️',
        preview: 'linear-gradient(135deg, #050505, #1e1e1e 60%, #525252)',
        description: 'Elite jet-black'
    },
    {
        key: 'platinum',
        name: 'Platinum',
        icon: '💿',
        preview: 'linear-gradient(135deg, #1a1a1e, #e5e7eb 60%, #9ca3af)',
        description: 'Metallic platinum glow'
    },
    {
        key: 'aurora_elite',
        name: 'Aurora Elite',
        icon: '✨',
        preview: 'linear-gradient(135deg, #040914, #10b981 60%, #059669)',
        description: 'Emerald-auroral curtains'
    },
    {
        key: 'royal_diamond',
        name: 'Royal Diamond',
        icon: '👑',
        preview: 'linear-gradient(135deg, #090514, #a855f7 60%, #d946ef)',
        description: 'Rich royal velvet'
    }
];

// Premium theme keys set for quick lookup
export const PREMIUM_THEME_KEYS = new Set([
    ...SILVER_THEMES.map(t => t.key),
    ...GOLD_THEMES.map(t => t.key),
    ...DIAMOND_THEMES.map(t => t.key)
]);
// Standard app-level themes (light/dark)
const STANDARD_THEMES = new Set(['light', 'dark']);

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

    // Apply theme to HTML element — handles both standard and premium themes
    const applyTheme = (themeValue) => {
        if (STANDARD_THEMES.has(themeValue)) {
            // Standard: set data-theme, clear premium attribute
            document.documentElement.setAttribute('data-theme', themeValue);
            document.documentElement.removeAttribute('data-theme-premium');
        } else if (PREMIUM_THEME_KEYS.has(themeValue)) {
            // Premium: keep base data-theme as 'dark' for standard component overrides,
            // and set premium attribute for our custom CSS vars
            document.documentElement.setAttribute('data-theme', 'dark');
            document.documentElement.setAttribute('data-theme-premium', themeValue);
        } else {
            // Fallback: treat as standard dark
            document.documentElement.setAttribute('data-theme', 'dark');
            document.documentElement.removeAttribute('data-theme-premium');
        }
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

    // Listen for auth state changes to reset theme on logout
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') {
                console.log('🚪 Auth event: SIGNED_OUT, resetting theme to light');
                setTheme('light');
                applyTheme('light');
                localStorage.removeItem('app_theme');
            }
        });

        return () => {
            subscription?.unsubscribe();
        };
    }, []);

    // Update theme (supports both standard and premium themes)
    const updateTheme = async (newTheme) => {
        console.log('🎨 Updating theme to:', newTheme);
        setTheme(newTheme);
        applyTheme(newTheme);
        localStorage.setItem('app_theme', newTheme);
        console.log('✅ Theme applied:', newTheme, '| Premium:', PREMIUM_THEME_KEYS.has(newTheme));

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
        <ThemeContext.Provider value={{ theme, updateTheme, loading, SILVER_THEMES, GOLD_THEMES, DIAMOND_THEMES, PREMIUM_THEME_KEYS }}>
            {children}
        </ThemeContext.Provider>
    );
};
