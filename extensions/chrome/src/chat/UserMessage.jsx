import React from "react";
import "./ChatStyles.css";

const UserMessage = ({ text }) => {
    return (
        <div className="user-message">
            <div className="message-bubble">{text}</div>
        </div>
    );
};

export default UserMessage;
