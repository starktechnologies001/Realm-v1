const fs = require('fs');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = dir + '/' + file;
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            if (file.endsWith('.jsx')) results.push(file);
        }
    });
    return results;
}

const files = walk('/Users/anonymous/Desktop/realmm/social-map-app/src');
files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;

    // Add aria-label="Menu" to btn-menu without aria-label
    if (content.match(/<button[^>]*className="btn-menu"[^>]*>/g)) {
        content = content.replace(/(<button[^>]*className="btn-menu"[^>]*)(>)/g, (match, p1, p2) => {
            if (p1.includes('aria-label')) return match;
            changed = true;
            return `${p1} aria-label="Menu"${p2}`;
        });
    }

    // Add aria-label="Close" to close-btn
    content = content.replace(/(<button[^>]*className="[^"]*close[^"]*"[^>]*)(>)/gi, (match, p1, p2) => {
        if (p1.includes('aria-label')) return match;
        changed = true;
        return `${p1} aria-label="Close"${p2}`;
    });

    // Replace <button>X</button> without className
    content = content.replace(/(<button[^>]*)(>)\s*(✕|✖|×|&times;)\s*(<\/button>)/gi, (match, p1, p2, p3, p4) => {
        if (p1.includes('aria-label')) return match;
        changed = true;
        return `${p1} aria-label="Close"${p2}${p3}${p4}`;
    });

    // Add aria-label="Action" to icon-btn without aria-label
    content = content.replace(/(<button[^>]*className="[^"]*icon-btn[^"]*"[^>]*)(>)/g, (match, p1, p2) => {
        if (p1.includes('aria-label')) return match;
        changed = true;
        // extract title if exists
        let label = "Action";
        let m = p1.match(/title="([^"]+)"/);
        if (m) label = m[1];
        return `${p1} aria-label="${label}"${p2}`;
    });

    // Add aria-label="Action" to btn-icon without aria-label
    content = content.replace(/(<button[^>]*className="[^"]*btn-icon[^"]*"[^>]*)(>)/g, (match, p1, p2) => {
        if (p1.includes('aria-label')) return match;
        changed = true;
        let label = "Action";
        let m = p1.match(/title="([^"]+)"/);
        if (m) label = m[1];
        else if (p1.includes('accept')) label = "Accept";
        else if (p1.includes('decline')) label = "Decline";
        return `${p1} aria-label="${label}"${p2}`;
    });
    
    // Add role="main" to chat-page-container
    if (file.endsWith('Chat.jsx')) {
        if (!content.includes('role="main"')) {
            content = content.replace(/<div className="chat-page-container">/, '<div className="chat-page-container" role="main">');
            changed = true;
        }
    }

    if (changed) {
        fs.writeFileSync(file, content, 'utf8');
        console.log("Updated", file);
    }
});
