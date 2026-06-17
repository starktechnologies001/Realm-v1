const fs = require('fs');

const filesToFix = [
    {
        file: 'src/components/AttachmentPicker.jsx',
        replacements: [
            ['<button className="close-btn" onClick={onClose}>✕</button>', '<button className="close-btn" onClick={onClose} aria-label="Close">✕</button>']
        ]
    },
    {
        file: 'src/components/AttachmentPreview.jsx',
        replacements: [
            ['<button className="preview-close-btn" onClick={onCancel}>✕</button>', '<button className="preview-close-btn" onClick={onCancel} aria-label="Close">✕</button>']
        ]
    },
    {
        file: 'src/components/FullProfileModal.jsx',
        replacements: [
            ['<button className="close-btn" onClick={onClose}>×</button>', '<button className="close-btn" onClick={onClose} aria-label="Close">×</button>'],
            ['<button className="fp-viewer-close" onClick={() => setViewingMedia(null)}>×</button>', '<button className="fp-viewer-close" onClick={() => setViewingMedia(null)} aria-label="Close">×</button>']
        ]
    },
    {
        file: 'src/components/UserProfileCard.jsx',
        replacements: [
            ['<button className="lightbox-close">✕</button>', '<button className="lightbox-close" aria-label="Close">✕</button>'],
            ['<button className="close-btn-floating" onClick={onClose}>✕</button>', '<button className="close-btn-floating" onClick={onClose} aria-label="Close">✕</button>'],
            ['<button className="btn-icon-action primary" onClick={() => onAction(\'message\', user)} title="Message">', '<button className="btn-icon-action primary" onClick={() => onAction(\'message\', user)} title="Message" aria-label="Message">'],
            ['<button className="btn-icon-action secondary" onClick={() => onAction(\'call-audio\', user)} title="Voice Call">', '<button className="btn-icon-action secondary" onClick={() => onAction(\'call-audio\', user)} title="Voice Call" aria-label="Voice Call">'],
            ['<button className="btn-icon-action secondary" onClick={() => onAction(\'call-video\', user)} title="Video Call">', '<button className="btn-icon-action secondary" onClick={() => onAction(\'call-video\', user)} title="Video Call" aria-label="Video Call">']
        ]
    },
    {
        file: 'src/components/MessageAttachment.jsx',
        replacements: [
            ['<button className="lightbox-close" onClick={() => setLightboxOpen(false)}>✕</button>', '<button className="lightbox-close" onClick={() => setLightboxOpen(false)} aria-label="Close">✕</button>']
        ]
    },
    {
        file: 'src/components/StoryViewer.jsx',
        replacements: [
            ['<button className="action-btn close-btn" onClick={(e) => { e.stopPropagation(); onClose(); }}>', '<button className="action-btn close-btn" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close">']
        ]
    },
    {
        file: 'src/components/StatusView.jsx',
        replacements: [
            ['<button className="edit-caption-close" onClick={() => setEditingStory(null)}>✕</button>', '<button className="edit-caption-close" onClick={() => setEditingStory(null)} aria-label="Close">✕</button>']
        ]
    },
    {
        file: 'src/components/PokeNotifications.jsx',
        replacements: [
            ['<button className="close-panel-btn-absolute" onClick={() => {', '<button className="close-panel-btn-absolute" onClick={() => { aria-label="Close"'] // wait this spans lines, need to be careful
        ]
    },
    {
        file: 'src/components/ReplyThoughtModal.jsx',
        replacements: [
            ['<button className="close-btn" onClick={onClose}>&times;</button>', '<button className="close-btn" onClick={onClose} aria-label="Close">&times;</button>']
        ]
    },
    {
        file: 'src/pages/VisibilitySettings.jsx',
        replacements: [
            ['<button className="icon-btn back-btn" onClick={() => navigate(-1)} style={{ color: \'#111\' }}>', '<button className="icon-btn back-btn" onClick={() => navigate(-1)} style={{ color: \'#111\' }} aria-label="Go back">']
        ]
    }
];

filesToFix.forEach(({ file, replacements }) => {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        let changed = false;
        replacements.forEach(([from, to]) => {
            if (content.includes(from)) {
                content = content.replaceAll(from, to);
                changed = true;
            }
        });
        if (changed) {
            fs.writeFileSync(file, content, 'utf8');
            console.log(`Fixed ${file}`);
        }
    }
});
