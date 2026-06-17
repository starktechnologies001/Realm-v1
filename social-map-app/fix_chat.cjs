const fs = require('fs');

let chat = fs.readFileSync('src/pages/Chat.jsx', 'utf8');

const replacements = [
    ['<button onClick={clearSelection} className="icon-btn">', '<button onClick={clearSelection} className="icon-btn" aria-label="Clear selection">'],
    ['<button className="icon-btn" onClick={() => handleMessageAction(\'reply\')} title="Reply">', '<button className="icon-btn" onClick={() => handleMessageAction(\'reply\')} title="Reply" aria-label="Reply">'],
    ['<button className="icon-btn" onClick={() => handleMessageAction(\'delete\')} title="Delete">', '<button className="icon-btn" onClick={() => handleMessageAction(\'delete\')} title="Delete" aria-label="Delete">'],
    ['<button className="icon-btn" onClick={() => handleMessageAction(\'copy\')} title="Copy">', '<button className="icon-btn" onClick={() => handleMessageAction(\'copy\')} title="Copy" aria-label="Copy">'],
    ['<button className="icon-btn" onClick={() => handleMessageAction(\'forward\')} title="Forward">', '<button className="icon-btn" onClick={() => handleMessageAction(\'forward\')} title="Forward" aria-label="Forward">'],
    ['<button className="icon-btn" onClick={() => showToast(\'Edit coming soon!\')} title="Edit">', '<button className="icon-btn" onClick={() => showToast(\'Edit coming soon!\')} title="Edit" aria-label="Edit">'],
    ['<button onClick={onBack} className="back-btn">', '<button onClick={onBack} className="back-btn" aria-label="Go back">'],
    ['<button title="Audio Call" className="icon-btn" onClick={startVoiceCall}>', '<button title="Audio Call" className="icon-btn" onClick={startVoiceCall} aria-label="Audio call">'],
    ['<button title="Video Call" className="icon-btn" onClick={startVideoCall}>', '<button title="Video Call" className="icon-btn" onClick={startVideoCall} aria-label="Video call">'],
    ['<button className="icon-btn" onClick={() => setShowMenu(!showMenu)}>⋮</button>', '<button className="icon-btn" onClick={() => setShowMenu(!showMenu)} aria-label="Menu">⋮</button>'],
    ['<button className="input-icon-btn attachment-btn" disabled>', '<button className="input-icon-btn attachment-btn" disabled aria-label="Attachments">'],
    ['<button className="input-icon-btn" disabled>', '<button className="input-icon-btn" disabled aria-label="Emojis">'],
    ['<button className="close-viewer" onClick={() => setViewingImage(null)}>✕</button>', '<button className="close-viewer" onClick={() => setViewingImage(null)} aria-label="Close viewer">✕</button>'],
    ['<button className="viewer-back-btn" onClick={() => setViewingImage(null)}>', '<button className="viewer-back-btn" onClick={() => setViewingImage(null)} aria-label="Go back">']
];

let changed = false;
replacements.forEach(([from, to]) => {
    if (chat.includes(from)) {
        chat = chat.replaceAll(from, to);
        changed = true;
    }
});

if (changed) {
    fs.writeFileSync('src/pages/Chat.jsx', chat, 'utf8');
    console.log('Fixed Chat.jsx');
} else {
    console.log('No matches in Chat.jsx');
}
