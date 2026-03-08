import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        // Log error to console for debugging
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        
        // --- 🚀 NEW VITE LAZY LOAD CHUNK FIX 🚀 ---
        // If the error is a Vite dynamic import failure (failed to fetch a React chunk because
        // it was deployed recently or the mobile wake lost connection), just auto-refresh!
        const isChunkLoadFailed = error?.message?.includes('Failed to fetch dynamically imported module') || 
                                  error?.message?.includes('Importing a module script failed') ||
                                  error?.name === 'ChunkLoadError';
        
        if (isChunkLoadFailed) {
            console.log('🔄 ChunkLoadError detected. Forcing a hard page reload to fetch fresh assets...');
            // In a real mobile app/PWA, refreshing the context is the cleanest recovery
            window.location.reload(true); 
            return; // don't even bother rendering the crash screen
        }

        this.setState({
            error,
            errorInfo
        });

        // Halted auto-recover so the user can capture the crash stack trace
        // if (process.env.NODE_ENV !== 'development') {
        //     setTimeout(() => {
        //         window.location.reload();
        //     }, 4000);
        // }
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
        // Optionally reload the page or navigate to home
        window.location.href = '/';
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '100vh',
                    padding: '20px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    textAlign: 'center'
                }}>
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        backdropFilter: 'blur(10px)',
                        borderRadius: '20px',
                        padding: '40px',
                        maxWidth: '500px',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
                    }}>
                        <div style={{ fontSize: '64px', marginBottom: '20px' }}>😵</div>
                        <h1 style={{ margin: '0 0 16px 0', fontSize: '24px', fontWeight: 600 }}>
                            Oops! Something went wrong
                        </h1>
                        <p style={{ fontSize: '0.95rem', opacity: 0.8, marginBottom: '24px', lineHeight: '1.5' }}>
                            We caught an unexpected background crash. Before restarting, please click <b>Copy Error Details</b> below and paste it to your developer.
                        </p>

                        {/* Developer Debug Info - Only shown if an error object exists */}
                        {this.state.error && (
                            <div style={{
                                width: '100%',
                                background: 'rgba(0,0,0,0.3)',
                                borderRadius: '8px',
                                padding: '12px',
                                marginBottom: '24px',
                                textAlign: 'left',
                                overflowX: 'auto',
                                border: '1px solid rgba(255,107,107,0.3)'
                            }}>
                                <p style={{ fontSize: '0.75rem', color: '#ff6b6b', fontFamily: 'monospace', margin: 0, fontWeight: 'bold' }}>
                                    {this.state.error.toString()}
                                </p>
                                {this.state.errorInfo && this.state.errorInfo.componentStack && (
                                    <pre style={{ 
                                        fontSize: '0.65rem', 
                                        color: 'rgba(255,255,255,0.6)', 
                                        fontFamily: 'monospace', 
                                        marginTop: '8px',
                                        marginBottom: 0,
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                        maxHeight: '100px',
                                        overflowY: 'auto'
                                    }}>
                                        {this.state.errorInfo.componentStack}
                                    </pre>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px' }}>
                            <button 
                                onClick={() => {
                                    const stack = `${this.state.error?.toString()}\n\n${this.state.errorInfo?.componentStack}`;
                                    navigator.clipboard.writeText(stack);
                                    alert('✅ Crash details copied to clipboard. Please paste them your developer!');
                                }}
                                style={{
                                    background: 'rgba(255, 107, 107, 0.2)',
                                    color: '#ff6b6b',
                                    border: '1px solid rgba(255, 107, 107, 0.5)',
                                    borderRadius: '12px',
                                    padding: '12px 32px',
                                    fontSize: '15px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                }}
                            >
                                📋 Copy Technical Error
                            </button>
                            
                            <button 
                                onClick={this.handleReset}
                                style={{
                                    background: 'white',
                                    color: '#667eea',
                                    border: 'none',
                                    borderRadius: '12px',
                                    padding: '12px 32px',
                                    fontSize: '16px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'transform 0.2s',
                                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
                                }}
                            >
                                Restart Application
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
