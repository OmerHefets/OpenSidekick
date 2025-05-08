import React, { useState, useRef, useEffect } from "react";
import "./ChatBox.css";
import { ResetSvg } from "./icons/ResetIcon";
import { StopSvg } from "./icons/StopIcon";
import { SendSvg } from "./icons/SendIcon";
import { AutopilotSvg } from "./icons/AutopilotIcon";
import storageManager from "../services/storage/storageManager";
import ApiKeyPopup from "./ApiKeyPopup";
import { StorageCategoryEnum } from "../services/storage/enums";

const ChatBox = ({
    isOperating,
    onSendMessage,
    onStopOperation,
    initializedChat,
    onReset,
    isCopilotMode,
    onToggleCopilot,
}) => {
    const [inputValue, setInputValue] = useState("");
    const textareaRef = useRef(null);
    const [hasApiKeys, setHasApiKeys] = useState(null); // null = loading, false = no keys, true = has keys
    const isTyping = inputValue.trim().length > 0;

    // Function to check API keys
    const checkApiKeys = async () => {
        try {
            const anthropicKey = await storageManager.getValue(
                StorageCategoryEnum.ApiKeys,
                "anthropic"
            );
            setHasApiKeys(!!anthropicKey);
        } catch (error) {
            console.error("[ChatBox] Error checking API keys:", error);
            setHasApiKeys(false);
        }
    };

    // Initial API key check
    useEffect(() => {
        checkApiKeys();
    }, []);

    // Focus-based API key check
    useEffect(() => {
        const handleFocus = () => {
            checkApiKeys();
        };

        // Add focus event listener
        window.addEventListener("focus", handleFocus);

        // Cleanup
        return () => {
            window.removeEventListener("focus", handleFocus);
        };
    }, []);

    useEffect(() => {
        if (textareaRef.current && inputValue) {
            autoResizeTextarea({ target: textareaRef.current });
        }
    }, [inputValue]);

    const handleInputChange = (e) => {
        setInputValue(e.target.value);
        autoResizeTextarea(e);
    };

    const autoResizeTextarea = (e) => {
        const textarea = e.target;

        // Use requestAnimationFrame to handle the resize after the next paint
        requestAnimationFrame(() => {
            textarea.style.height = "auto"; // Reset height

            // Calculate new height but cap it at max-height from CSS
            const newHeight = Math.min(textarea.scrollHeight, 150);
            textarea.style.height = `${newHeight}px`;
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (inputValue.trim() && !isOperating && hasApiKeys) {
            onSendMessage(inputValue);
            setInputValue("");
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const handleStopClick = () => {
        onStopOperation();
    };

    const handleReset = () => {
        onReset();
    };

    const handleCopilotToggle = () => {
        onToggleCopilot(!isCopilotMode);
    };

    return (
        <div className={"chat-box"}>
            {hasApiKeys === false && isTyping && <ApiKeyPopup />}

            <form onSubmit={handleSubmit}>
                <div className="input-container textarea-container">
                    <textarea
                        ref={textareaRef}
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Do anything"
                        disabled={isOperating}
                        className={inputValue ? "has-text" : ""}
                        rows="1"
                    />
                </div>
                <div className="buttons-container">
                    <button
                        type="button"
                        className={`mode-toggle-button ${
                            !isCopilotMode ? "mode-active" : ""
                        }`}
                        onClick={handleCopilotToggle}
                        disabled={initializedChat}
                        title={
                            isCopilotMode
                                ? "Switch to Autopilot mode"
                                : "Switch to Copilot mode"
                        }
                    >
                        <AutopilotSvg />
                        Autopilot
                    </button>
                    {initializedChat && (
                        <button
                            type="button"
                            className="reset-button"
                            onClick={handleReset}
                            disabled={isOperating}
                        >
                            <ResetSvg />
                        </button>
                    )}
                    {isOperating ? (
                        <button
                            type="button"
                            className="stop-button"
                            onClick={handleStopClick}
                        >
                            <StopSvg />
                        </button>
                    ) : (
                        <button
                            type="submit"
                            className="send-button"
                            disabled={
                                !inputValue.trim() || hasApiKeys === false
                            }
                        >
                            <SendSvg />
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
};

export default ChatBox;
