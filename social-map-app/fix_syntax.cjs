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
    let original = content;

    // Revert the mangled arrow functions
    content = content.replace(/=\s*aria-label="([^"]+)"\s*>/g, '=>');

    // Also the close-btn replacement mangled some tags. Let's look at FullProfileModal.jsx
    // The previous script: content.replace(/(<button[^>]*className="[^"]*close[^"]*"[^>]*)(>)/gi...
    // Actually, `<button className="close-btn" onClick={onClose} aria-label="Close">×</button>` was correct.

    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        console.log("Fixed arrow functions in", file);
    }
});
