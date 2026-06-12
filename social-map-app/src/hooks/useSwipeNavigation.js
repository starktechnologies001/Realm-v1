
import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export function useSwipeNavigation() {
    const navigate = useNavigate();
    const location = useLocation();
    
    // Define the route order
    const routes = ['/map', '/friends', '/chat', '/profile'];
    
    const touchStartRef = useRef(null);
    const touchEndRef = useRef(null);

    // Minimum swipe distance (px)
    const MIN_SWIPE_DISTANCE = 50;
    // Maximum vertical distance to ignore scrolling (px)
    const MAX_VERTICAL_DISTANCE = 30;

    const onTouchStart = (e) => {
        touchEndRef.current = null;
        touchStartRef.current = {
            x: e.targetTouches[0].clientX,
            y: e.targetTouches[0].clientY
        };
    };

    const onTouchMove = (e) => {
        touchEndRef.current = {
            x: e.targetTouches[0].clientX,
            y: e.targetTouches[0].clientY
        };
    };

    const onTouchEnd = () => {
        if (!touchStartRef.current || !touchEndRef.current) return;

        // 🛑 DISABLE SWIPE IN ACTIVE CHAT
        // If 'chatId' is in the URL, it means a chat window is open.
        // We disable global swipe to avoid conflicts with message swiping or scrolling.
        if (window.location.href.includes('chatId=')) {
             return;
        }

        const distanceX = touchStartRef.current.x - touchEndRef.current.x;
        const distanceY = touchStartRef.current.y - touchEndRef.current.y;
        
        // Validate vertical constraint (ensure it's a horizontal swipe)
        if (Math.abs(distanceY) > MAX_VERTICAL_DISTANCE) return;

        // Current Route Index
        const currentIndex = routes.indexOf(location.pathname);
        if (currentIndex === -1) return; // Not on a main tab

        // 🛑 DISABLE SWIPE ENTIRELY ON MAP PAGE
        // To prevent conflicts with panning the map
        if (location.pathname === '/map') {
            return;
        }

        if (distanceX > MIN_SWIPE_DISTANCE) {
            // Swiped Left -> Go Next (e.g. Map -> Friends)
            if (currentIndex < routes.length - 1) {
                navigate(routes[currentIndex + 1]);
            }
        }

        if (distanceX < -MIN_SWIPE_DISTANCE) {
            // Swiped Right -> Go Prev (e.g. Friends -> Map)
            if (currentIndex > 0) {
                navigate(routes[currentIndex - 1]);
            }
        }
    };

    return {
        onTouchStart,
        onTouchMove,
        onTouchEnd
    };
}
