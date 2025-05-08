import React from "react";
import "./ChatStyles.css";

const CopilotDoneMessage = ({ content }) => {
    return (
        <div className="user-message">
            <div className="message-bubble">{content}</div>
        </div>
    );
};

export default CopilotDoneMessage;
