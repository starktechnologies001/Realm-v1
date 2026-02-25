import React, { useEffect, useRef } from 'react';
import { Marker } from 'react-leaflet';

// Duration of the sliding animation (in milliseconds)
const ANIMATION_DURATION = 1000;

export default function SmoothMarker({ position, ...props }) {
    const markerRef = useRef(null);
    const animationFrameRef = useRef(null);
    const prevPositionRef = useRef(position);
    
    // Check if the component is mounted to prevent state updates after unmounting
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    useEffect(() => {
        const marker = markerRef.current;
        if (!marker) return;

        const startPos = prevPositionRef.current;
        const endPos = position;

        // If the position hasn't actually changed, or if it's the very first render, do nothing
        if (
            startPos[0] === endPos[0] && 
            startPos[1] === endPos[1]
        ) {
            return;
        }

        // Cancel any existing animation
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }

        let startTime = null;

        const animate = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = timestamp - startTime;
            
            // Calculate interpolation factor (0 to 1)
            // Use ease-out cubic for a smoother stop
            let t = Math.min(progress / ANIMATION_DURATION, 1);
            t = 1 - Math.pow(1 - t, 3); // Ease out
            
            const currentLat = startPos[0] + (endPos[0] - startPos[0]) * t;
            const currentLng = startPos[1] + (endPos[1] - startPos[1]) * t;

            // Update Leaflet marker directly
            if (marker && marker.setLatLng) {
                marker.setLatLng([currentLat, currentLng]);
            }

            if (progress < ANIMATION_DURATION && isMounted.current) {
                animationFrameRef.current = requestAnimationFrame(animate);
            } else {
                // Animation finished, update the reference for the next move
                prevPositionRef.current = endPos;
                if (marker && marker.setLatLng) {
                    marker.setLatLng(endPos); // Ensure it lands exactly on target
                }
            }
        };

        animationFrameRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [position]);

    // Handle initial render properly
    return (
        <Marker
            position={prevPositionRef.current}
            ref={(ref) => {
                markerRef.current = ref;
                // Forward the ref if the parent passed one
                if (props.innerRef) {
                    if (typeof props.innerRef === 'function') {
                        props.innerRef(ref);
                    } else {
                        props.innerRef.current = ref;
                    }
                }
            }}
            {...props}
        />
    );
}
