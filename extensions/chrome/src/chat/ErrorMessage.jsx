import React from "react";
import "./ErrorMessage.css";
import InfoSvg from "./icons/InfoIcon";

const ErrorMessage = () => {
    return (
        <div className="error-box">
            <div className="error-content">
                <div className="error-icon">
                    <InfoSvg />
                </div>
                <div className="error-text">
                    An error occurred. Close the side panel and reopen it in a
                    new tab.
                </div>
            </div>
        </div>
    );
};

export default ErrorMessage;
