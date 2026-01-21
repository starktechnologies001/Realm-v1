import React, { Suspense, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment, ContactShadows, useAnimations, Html } from '@react-three/drei';

// Error Boundary specifically for 3D content
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("🔴 [Avatar3D] 3D Model Crash:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Html center>
            <div style={{ color: 'white', textAlign: 'center', background: 'rgba(0,0,0,0.7)', padding: '10px', borderRadius: '8px' }}>
                <div style={{ fontSize: '24px' }}>⚠️</div>
                <div style={{ fontSize: '12px' }}>Failed to load avatar</div>
            </div>
        </Html>
      );
    }

    return this.props.children;
  }
}

function Model({ url, animation = 'Idle' }) {
    const group = useRef();
    // useGLTF will throw if url is bad, caught by ErrorBoundary
    const { scene, animations } = useGLTF(url); 
    const { actions } = useAnimations(animations, group);

    // Center and shadow setup
    useEffect(() => {
        if (!scene) return;
        scene.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Cleanup cache when URL changes
        return () => {
            try {
                useGLTF.clear(url);
            } catch (e) {
                console.warn("Cache clear error", e);
            }
        };
    }, [scene, url]);

    return (
        <group ref={group} dispose={null} position={[0, -0.9, 0]}>
            <primitive object={scene} />
        </group>
    );
}

export default function Avatar3D({ url, style, poster }) {
    // Basic validation
    if (!url) return null;

    // Ensure we are not trying to load a non-GLB url into the 3D viewer
    // (Sometimes 2D fallbacks accidentally get passed here)
    if (!url.includes('.glb')) {
        return (
             <div style={{ width: '100%', height: '100%', ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f0f0' }}>
                 <img src={url} alt="2D Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
             </div>
        );
    }

    return (
        <div style={{ width: '100%', height: '100%', ...style, position: 'relative' }}>
            <Canvas
                camera={{ position: [0, 0.5, 3], fov: 45 }}
                shadows
                dpr={[1, 2]}
            >
                <ambientLight intensity={0.7} />
                <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} shadow-mapSize={2048} castShadow />
                <group position={[0, -0.5, 0]}>
                    <ErrorBoundary>
                        <Suspense fallback={
                            <Html center>
                                {poster ? (
                                    <div style={{ width: '300px', height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                         <img 
                                            src={poster} 
                                            alt="Loading..." 
                                            style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.8 }} 
                                         />
                                         <div className="spinner" style={{
                                            position: 'absolute',
                                            width: '30px', height: '30px', border: '3px solid rgba(255,255,255,0.8)', 
                                            borderRadius: '50%', borderTopColor: '#000', animation: 'spin 1s ease-in-out infinite'
                                        }}></div>
                                    </div>
                                ) : (
                                    <div className="spinner" style={{
                                        width: '30px', height: '30px', border: '3px solid rgba(255,255,255,0.3)', 
                                        borderRadius: '50%', borderTopColor: '#fff', animation: 'spin 1s ease-in-out infinite'
                                    }}></div>
                                )}
                                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                            </Html>
                        }>
                            <Model url={url} />
                            <Environment preset="city" />
                            <ContactShadows resolution={1024} scale={10} blur={1} opacity={0.5} far={10} color="#8a6246" />
                        </Suspense>
                    </ErrorBoundary>
                </group>
                <OrbitControls 
                    enablePan={false} 
                    minPolarAngle={Math.PI / 2.5} 
                    maxPolarAngle={Math.PI / 2}
                    minDistance={2} /* Zoom constraint */
                    maxDistance={4}
                />
            </Canvas>
        </div>
    );
}
