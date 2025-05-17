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
                    An error occurred. Either the engine you requested does not
                    exist or there was another issue processing your request. If
                    this issue persists please contact us through our help
                    center at help.openai.com.
                </div>
            </div>
        </div>
    );
};

export default ErrorMessage;
