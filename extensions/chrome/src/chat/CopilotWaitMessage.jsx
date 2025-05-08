import React from "react";
import "./ChatStyles.css";

const CopilotWaitMessage = () => {
    return (
        <div className="copilot-wait-message">
            <div className="wait-bubble">
                <div className="wait-indicator"></div>
                <div className="wait-text">Awaiting your action</div>
            </div>
        </div>
    );
};

export default CopilotWaitMessage;
