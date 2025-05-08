import React from "react";
import "./ChatStyles.css";

const ActionMessage = ({ action }) => {
    return (
        <div className="action-message">
            <div className="action-bubble">{action}</div>
        </div>
    );
};

export default ActionMessage;
