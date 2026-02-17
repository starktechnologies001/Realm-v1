
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

        // EDGE DETECTION FOR MAP
        // If on Map, only allow swipe if it started near the edge (e.g., 50px)
        if (location.pathname === '/map') {
            const isLeftEdge = touchStartRef.current.x < 50;
            const isRightEdge = touchStartRef.current.x > window.innerWidth - 50;
            
            // If swiping Left (to go Next), must start from Right Edge? 
            // - No, standard is dragging the screen.
            // But dragging the map pans it.
            // Edge swipe:
            // - To go Next (Right tab), drag Left. Start from Right Edge? That feels like closing a drawer.
            // - Usually, you standard swipe.
            // Let's enforce Edge Swipe strictly for Map.
            
            // Swipe Left (Go Next) -> Start from Right Edge? No, usually Start from anywhere?
            // If I am on Map, and I want to go to Friends (Next), I swipe LEFT.
            // This conflicts with panning Map East.
            // So I must start swipe from Right Edge to trigger navigation?
            // Or usually, Map allows panning, but if you hit the boundary? No.
            
            // Let's try: ONLY edge swipes on Map.
            // To go Next (/friends), Swipe Left. MUST start from Right Edge? (confusing)
            // Actually, "Side Menu" logic often uses Left Edge to go Back/Open Menu.
            
            // Let's implement:
            // Swipe Left (deltaX > 0) -> Requires Right Edge if on Map
            // Swipe Right (deltaX < 0) -> Requires Left Edge if on Map
            
            const isSwipeLeft = distanceX > MIN_SWIPE_DISTANCE;
            const isSwipeRight = distanceX < -MIN_SWIPE_DISTANCE;

            if (isSwipeLeft && !isRightEdge) return; // Ignore non-edge swipe on map
            if (isSwipeRight && !isLeftEdge) return; // Ignore non-edge swipe on map
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
