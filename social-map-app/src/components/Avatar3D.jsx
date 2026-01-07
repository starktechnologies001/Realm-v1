import React, { Suspense, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment, ContactShadows, useAnimations } from '@react-three/drei';

function Model({ url, animation = 'Idle' }) {
    const group = useRef();
    const { scene, animations } = useGLTF(url);
    const { actions } = useAnimations(animations, group);

    // Center the model
    useEffect(() => {
        scene.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Cleanup cache when URL changes or component unmounts to ensure fresh load next time
        return () => {
            useGLTF.clear(url);
        };
    }, [scene, url]);

    return (
        <group ref={group} dispose={null} position={[0, -0.9, 0]}>
            <primitive object={scene} />
        </group>
    );
}

export default function Avatar3D({ url, style }) {
    if (!url) return null;

    return (
        <div style={{ width: '100%', height: '100%', ...style }}>
            <Canvas
                camera={{ position: [0, 0.5, 3], fov: 45 }}
                shadows
                dpr={[1, 2]}
            >
                <ambientLight intensity={0.7} />
                <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} shadow-mapSize={2048} castShadow />
                <group position={[0, -0.5, 0]}>
                    <Suspense fallback={
                        <mesh position={[0, 1, 0]}>
                            <boxGeometry args={[0.5, 0.5, 0.5]} />
                            <meshStandardMaterial color="#ccc" wireframe />
                        </mesh>
                    }>
                        <Model url={url} />
                        <Environment preset="city" />
                        <ContactShadows resolution={1024} scale={10} blur={1} opacity={0.5} far={10} color="#8a6246" />
                    </Suspense>
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

// Preload to avoid mounting jank
// useGLTF.preload('/path/to/default.glb') // We can't preload dynamic URLs easily without knowing them
