import React, { useEffect, useState, useRef } from "react";
import "./Snackbar.css";

/**
 * Enhanced Snackbar component to display messages at the bottom of the screen
 *
 * @param {Object} props - Component props
 * @param {string} props.text - Message to display in the snackbar
 * @param {string} props.type - Type of snackbar (regular, typing, key)
 * @param {string} props.id - Unique identifier for the snackbar
 * @returns {JSX.Element} Snackbar component
 */
const Snackbar = ({ text, type = "regular", id }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [typedText, setTypedText] = useState("");
    const textRef = useRef(text);
    const typeIndexRef = useRef(0);
    const [keyHighlight, setKeyHighlight] = useState(false);

    useEffect(() => {
        textRef.current = text;
    }, [text]);

    useEffect(() => {
        const animationTimer = setTimeout(() => {
            setIsVisible(true);
        }, 50);

        return () => clearTimeout(animationTimer);
    }, []);

    useEffect(() => {
        // Handle typing effect for the "typing" type after animation completes
        if (type === "typing" && isVisible) {
            setTypedText("");
            typeIndexRef.current = 0;

            const animationCompleteDelay = 300; // Wait for the upward animation to complete

            const startTypingEffect = setTimeout(() => {
                const typingInterval = setInterval(() => {
                    if (typeIndexRef.current < textRef.current.length) {
                        setTypedText(
                            textRef.current.substring(
                                0,
                                typeIndexRef.current + 1
                            )
                        );
                        typeIndexRef.current++;
                    } else {
                        clearInterval(typingInterval);
                    }
                }, 50); // Speed of typing

                return () => clearInterval(typingInterval);
            }, animationCompleteDelay);

            return () => clearTimeout(startTypingEffect);
        }
    }, [isVisible, type, text]);

    useEffect(() => {
        if (type === "key" && isVisible) {
            const keyInterval = setInterval(() => {
                setKeyHighlight((prev) => !prev);
            }, 700);

            return () => clearInterval(keyInterval);
        }
    }, [isVisible, type]);

    const snackbarClasses = `copilot-snackbar ${type} ${
        isVisible ? "show" : ""
    } ${keyHighlight ? "key-highlight" : ""}`;

    return (
        <div id={id} className={snackbarClasses}>
            {type === "typing" ? (
                <div className="typing-container">
                    <span>{typedText}</span>
                    <span className="cursor"></span>
                </div>
            ) : (
                text
            )}
        </div>
    );
};

export default Snackbar;
