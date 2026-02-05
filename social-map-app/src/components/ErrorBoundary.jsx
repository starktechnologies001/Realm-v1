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
        
        this.setState({
            error,
            errorInfo
        });
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
                        <p style={{ margin: '0 0 24px 0', opacity: 0.9, fontSize: '16px' }}>
                            Don't worry, we've logged the error. Click below to return to the app.
                        </p>
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
                            onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
                            onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
                        >
                            Return to Home
                        </button>
                        
                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <details style={{ 
                                marginTop: '24px', 
                                textAlign: 'left',
                                background: 'rgba(0, 0, 0, 0.2)',
                                padding: '16px',
                                borderRadius: '8px',
                                fontSize: '12px'
                            }}>
                                <summary style={{ cursor: 'pointer', marginBottom: '8px', fontWeight: 600 }}>
                                    Error Details (Dev Only)
                                </summary>
                                <pre style={{ 
                                    whiteSpace: 'pre-wrap', 
                                    wordBreak: 'break-word',
                                    margin: 0,
                                    opacity: 0.8
                                }}>
                                    {this.state.error.toString()}
                                    {'\n\n'}
                                    {this.state.errorInfo?.componentStack}
                                </pre>
                            </details>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
