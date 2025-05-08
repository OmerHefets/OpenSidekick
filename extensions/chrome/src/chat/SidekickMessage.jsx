import React, { useState, useEffect, useRef } from "react";
import "./ChatStyles.css";

const SidekickMessage = ({ text }) => {
    const [displayText, setDisplayText] = useState("");
    const [isTyping, setIsTyping] = useState(true);
    const textRef = useRef(text || "");
    const indexRef = useRef(0);

    useEffect(() => {
        if (!text) return;

        // Reset everything on new text
        textRef.current = text;
        indexRef.current = 0;
        setDisplayText("");
        setIsTyping(true);

        const typingInterval = setInterval(() => {
            if (indexRef.current < textRef.current.length) {
                setDisplayText((current) => {
                    const expectedLength = indexRef.current + 1;

                    const newText = textRef.current.substring(
                        0,
                        expectedLength
                    );

                    return newText;
                });

                indexRef.current += 1;
            } else {
                clearInterval(typingInterval);
                setIsTyping(false);
            }
        }, 15); // Speed of typing

        return () => clearInterval(typingInterval);
    }, [text]);

    return (
        <div className="sidekick-message">
            <div className="message-content">
                {displayText}
                {isTyping && <span className="typing-cursor">|</span>}
            </div>
        </div>
    );
};

export default SidekickMessage;
