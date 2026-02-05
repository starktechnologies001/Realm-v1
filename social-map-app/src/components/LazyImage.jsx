import React, { useState, useEffect, useRef } from 'react';

const LazyImage = ({ src, alt, className, style, onClick, onError }) => {
    const [imageSrc, setImageSrc] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const imgRef = useRef();

    useEffect(() => {
        let observer;
        
        if (imgRef.current) {
            observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            setImageSrc(src);
                            observer.unobserve(entry.target);
                        }
                    });
                },
                {
                    rootMargin: '50px', // Start loading 50px before image enters viewport
                }
            );

            observer.observe(imgRef.current);
        }

        return () => {
            if (observer && imgRef.current) {
                observer.unobserve(imgRef.current);
            }
        };
    }, [src]);

    const handleLoad = () => {
        setIsLoading(false);
    };

    const handleError = (e) => {
        setIsLoading(false);
        if (onError) onError(e);
    };

    return (
        <div ref={imgRef} style={{ position: 'relative', ...style }}>
            {isLoading && imageSrc && (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 1.5s infinite',
                        borderRadius: 'inherit'
                    }}
                />
            )}
            {imageSrc && (
                <img
                    src={imageSrc}
                    alt={alt}
                    className={className}
                    style={{
                        ...style,
                        opacity: isLoading ? 0 : 1,
                        transition: 'opacity 0.3s ease-in-out'
                    }}
                    onClick={onClick}
                    onLoad={handleLoad}
                    onError={handleError}
                />
            )}
            <style>{`
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
            `}</style>
        </div>
    );
};

export default LazyImage;
