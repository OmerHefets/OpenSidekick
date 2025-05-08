import React from "react";
import "./Marker.css";

/**
 * Enhanced Marker component with ripple effect to highlight UI elements for the user
 * Designed to be more noticeable while remaining "invisible" to user interactions
 *
 * @param {Object} props - Component props
 * @param {number} props.x - X coordinate for marker position
 * @param {number} props.y - Y coordinate for marker position
 * @param {string} props.id - Unique identifier for the marker
 * @returns {JSX.Element} Marker component
 */
const Marker = ({ x, y, id }) => {
    return (
        <div
            id={id}
            className="copilot-marker"
            style={{
                left: `${x}px`,
                top: `${y}px`,
                pointerEvents: "none",
            }}
        >
            <div className="ripple-ring"></div>
            <div className="ripple-ring delay-1"></div>
            <div className="ripple-ring delay-2"></div>
        </div>
    );
};

export default Marker;
