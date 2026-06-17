const fs = require('fs');

// 1. Profile.jsx fixes
let profileJsx = fs.readFileSync('src/pages/Profile.jsx', 'utf8');

// Add role="main"
if (!profileJsx.includes('role="main"')) {
    profileJsx = profileJsx.replace('<div className="profile-page">', '<div className="profile-page" role="main">');
}

// Add aria-labels to toggle switches
let toggleCount = 0;
profileJsx = profileJsx.replace(/(<label className="toggle-switch">\s*<input)(\s+type="checkbox")/g, (match, p1, p2) => {
    toggleCount++;
    let label = "Toggle switch";
    if (toggleCount === 1) label = "Hide Status";
    else if (toggleCount === 2) label = "Show Last Seen";
    else if (toggleCount === 3) label = "Ghost Mode";
    else if (toggleCount === 4) label = "Location Services";
    else if (toggleCount === 5) label = "Mute Notifications";
    // Check if it already has aria-label to prevent duplicates
    if (p1.includes('aria-label')) return match;
    return `${p1} aria-label="${label}"${p2}`;
});

fs.writeFileSync('src/pages/Profile.jsx', profileJsx, 'utf8');
console.log('Fixed Profile.jsx');

// 2. Profile.css fixes
let profileCss = fs.readFileSync('src/pages/Profile.css', 'utf8');

// .tag contrast (light mode: #C2185B instead of #ff6482)
if (profileCss.includes('color: #ff6482;')) {
    profileCss = profileCss.replace('color: #ff6482;', 'color: #C2185B;');
    // Add dark mode override if not exists
    if (!profileCss.includes('html[data-theme="dark"] .tag')) {
        profileCss += '\nhtml[data-theme="dark"] .tag { color: #ff8ca3; }\n';
    }
}

// .logout-btn contrast (light mode: #C62828 instead of #ff453a)
if (profileCss.includes('color: #ff453a; font-weight: 600; font-size: 1rem;')) {
    profileCss = profileCss.replace('color: #ff453a; font-weight: 600; font-size: 1rem;', 'color: #D32F2F; font-weight: 600; font-size: 1rem;');
    if (!profileCss.includes('html[data-theme="dark"] .logout-btn')) {
        profileCss += '\nhtml[data-theme="dark"] .logout-btn { color: #ff6961; border-color: rgba(255, 105, 97, 0.3); }\n';
    }
}

fs.writeFileSync('src/pages/Profile.css', profileCss, 'utf8');
console.log('Fixed Profile.css');

// 3. BottomNav.jsx fixes
let bottomNav = fs.readFileSync('src/components/BottomNav.jsx', 'utf8');

// Remove opacity: 0.8 from .nav-label and .nav-item to ensure contrast
if (bottomNav.includes('opacity: 0.8;')) {
    bottomNav = bottomNav.replace(/opacity:\s*0\.8;/g, 'opacity: 1;');
}

fs.writeFileSync('src/components/BottomNav.jsx', bottomNav, 'utf8');
console.log('Fixed BottomNav.jsx');
