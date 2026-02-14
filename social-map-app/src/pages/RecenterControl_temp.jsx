
// Control to manually recenter map
function RecenterControl({ lat, lng }) {
    const map = useMap();

    const handleRecenter = (e) => {
        e.stopPropagation();
        if (lat && lng) {
            map.flyTo([lat, lng], 18, { animate: true, duration: 1.5 });
        }
    };

    return (
        <div 
            className="leaflet-bottom leaflet-right" 
            style={{ 
                bottom: '90px', /* Above default attribution/zoom if present, or just reasonable spacing */
                right: '20px', 
                zIndex: 1000,
                pointerEvents: 'auto'
            }}
        >
            <div className="leaflet-control">
                <button
                    onClick={handleRecenter}
                    title="Recenter Map"
                    style={{
                        width: '44px',
                        height: '44px',
                        backgroundColor: 'white',
                        border: 'none',
                        borderRadius: '50%',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.2rem',
                        color: '#333',
                        transition: 'transform 0.2s'
                    }}
                    onMouseDown={e => e.stopPropagation()}
                    onDoubleClick={e => e.stopPropagation()}
                >
                    🔄
                </button>
            </div>
        </div>
    );
}
