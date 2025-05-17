import React, { useState, useEffect, useRef } from "react";
import IntroTitle from "./IntroTitle";
import UserMessage from "./UserMessage";
import SidekickMessage from "./SidekickMessage";
import ActionMessage from "./ActionMessage";
import Loader from "./Loader";
import ChatBox from "./ChatBox";
import "./ChatApp.css";
import CopilotDoneMessage from "./CopilotDoneMessage";
import CopilotWaitMessage from "./CopilotWaitMessage";
import { mapActionToTitle } from "../utils/actionResponseHandler";
import { SettingsSvg } from "./icons/SettingsIcon";
import ErrorMessage from "./ErrorMessage";

const ChatApp = () => {
    const [initializedChat, setInitializedChat] = useState(false);
    const [isOperating, setIsOperating] = useState(false);
    const [isWaitingForUser, setIsWaitingForUser] = useState(false);
    const [messages, setMessages] = useState([]);
    const [isCopilotMode, setIsCopilotMode] = useState(true);
    const messagesEndRef = useRef(null);

    console.log("[ChatApp] Component initialized");

    // Scroll to bottom of messages
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const openOptionsPage = () => {
        console.log("[ChatApp] Opening options page");
        chrome.runtime.openOptionsPage();
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        console.log("[ChatApp] Running initialization effect");

        chrome.runtime.sendMessage({ type: "PANEL_OPENED" }, (response) => {
            console.log("[ChatApp] Panel open notification sent:", response);
        });

        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                console.log(
                    "[ChatApp] Document hidden, notifying background to stop polling"
                );
                chrome.runtime.sendMessage(
                    { type: "PANEL_CLOSED" },
                    (response) => {
                        console.log(
                            "[ChatApp] Panel closed notification sent:",
                            response
                        );
                    }
                );
            } else if (document.visibilityState === "visible") {
                console.log(
                    "[ChatApp] Document visible, notifying background to start polling"
                );
                chrome.runtime.sendMessage(
                    { type: "PANEL_OPENED" },
                    (response) => {
                        console.log(
                            "[ChatApp] Panel open notification sent:",
                            response
                        );
                    }
                );
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);

        // Set up cleanup function to run when component unmounts
        return () => {
            console.log("[ChatApp] Running cleanup effect");

            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange
            );
            console.log("[ChatApp] Visibility change listener removed");

            chrome.runtime.sendMessage({ type: "PANEL_CLOSED" }, (response) => {
                console.log(
                    "[ChatApp] Panel closed notification sent:",
                    response
                );
            });
        };
    }, []);

    useEffect(() => {
        console.log("[ChatApp] Setting up message listeners");

        const handleSidekickMessage = (message) => {
            console.log(`[ChatApp] Received message of type: ${message.type}`);

            if (message.type === "AI_RESPONSE") {
                console.log("[ChatApp] Processing AI response message");
                setMessages((prev) => [
                    ...prev,
                    { type: "sidekick", content: message.aiMessage },
                ]);
            } else if (message.type === "ACTION_RESPONSE") {
                console.log(
                    `[ChatApp] Processing action response: ${message.title}`
                );
                setMessages((prev) => [
                    ...prev,
                    { type: "action", content: message.title },
                ]);
            } else if (message.type === "COPILOT_WAIT_RESPONSE") {
                console.log("[ChatApp] Processing copilot wait response");
                setMessages((prev) => [
                    ...prev,
                    {
                        type: "copilot_wait",
                        content: "Waiting for your response",
                    },
                ]);
                setIsWaitingForUser(true);
                console.log("[ChatApp] Set waiting for user: true");
            } else if (message.type === "COPILOT_DONE_RESPONSE") {
                console.log(
                    `[ChatApp] Processing copilot done response for action: ${message.actionName}`
                );
                const newMessage = mapActionToTitle(message.actionName);
                setMessages((prev) => {
                    // Create a copy of the previous messages array
                    const updatedMessages = [...prev];

                    if (
                        updatedMessages.length > 0 &&
                        updatedMessages[updatedMessages.length - 1].type ===
                            "copilot_wait"
                    ) {
                        console.log(
                            "[ChatApp] Replacing copilot_wait with copilot_done"
                        );
                        updatedMessages[updatedMessages.length - 1] = {
                            type: "copilot_done",
                            content: newMessage,
                        };
                    } else {
                        console.log(
                            "[ChatApp] Adding new copilot_done message"
                        );
                        updatedMessages.push({
                            type: "copilot_done",
                            content: newMessage,
                        });
                    }

                    return updatedMessages;
                });
                setIsWaitingForUser(false);
                console.log("[ChatApp] Set waiting for user: false");
            } else if (message.type === "FINISH_RUN") {
                console.log("[ChatApp] Processing finish run message");
                setIsOperating(false);
                console.log("[ChatApp] Set operating: false");
            } else if (message.type === "ERROR_RESPONSE") {
                console.log("[ChatApp] Error message received, cancel run");
                setMessages((prev) => [...prev, { type: "error" }]);
                handleStopOperation();
            }
        };

        chrome.runtime.onMessage.addListener(handleSidekickMessage);
        console.log("[ChatApp] Chrome runtime message listener added");

        return () => {
            console.log("[ChatApp] Removing chrome runtime message listener");
            chrome.runtime.onMessage.removeListener(handleSidekickMessage);
        };
    }, []);

    const handleSendMessage = (text) => {
        console.log(
            `[ChatApp] Handling send message: "${text.substring(0, 30)}${
                text.length > 30 ? "..." : ""
            }"`
        );

        setMessages((prev) => [...prev, { type: "user", content: text }]);

        if (!initializedChat) {
            console.log("[ChatApp] Initializing chat for first time");
            setInitializedChat(true);
        }

        setIsOperating(true);
        console.log("[ChatApp] Set operating: true");

        console.log("[ChatApp] Sending USER_MESSAGE to background");
        chrome.runtime.sendMessage({ type: "USER_MESSAGE", text });
    };

    const handleStopOperation = () => {
        console.log("[ChatApp] Handling stop operation");

        chrome.runtime.sendMessage({ type: "STOP_AGENT" });
        console.log("[ChatApp] STOP_AGENT message sent to background");

        setIsOperating(false);
        console.log("[ChatApp] Set operating: false");
    };

    const handleReset = () => {
        console.log("[ChatApp] Handling reset");

        chrome.runtime.sendMessage({ type: "RESET_AGENT" });
        console.log("[ChatApp] RESET_AGENT message sent to background");

        setMessages([]);
        setInitializedChat(false);
        setIsOperating(false);
        console.log("[ChatApp] Chat state reset");
    };

    const handleToggleCopilot = (newCopilotState) => {
        console.log(`[ChatApp] Toggling copilot mode to: ${newCopilotState}`);

        setIsCopilotMode(newCopilotState);

        chrome.runtime.sendMessage({
            type: "TOGGLE_COPILOT",
            isEnabled: newCopilotState,
        });
        console.log("[ChatApp] TOGGLE_COPILOT message sent to background");
    };

    console.log(
        `[ChatApp] Rendering with state - initialized: ${initializedChat}, operating: ${isOperating}, waiting: ${isWaitingForUser}, messages: ${messages.length}`
    );

    return (
        <div
            className={`chat-app ${initializedChat ? "chat-initialized" : ""}`}
        >
            {!initializedChat && (
                <div className="options-button-container">
                    <div className="options-button" onClick={openOptionsPage}>
                        <SettingsSvg />
                    </div>
                </div>
            )}

            <div className="messages-container">
                {messages.map((msg, index) => {
                    if (msg.type === "user") {
                        return <UserMessage key={index} text={msg.content} />;
                    } else if (msg.type === "sidekick") {
                        return (
                            <SidekickMessage key={index} text={msg.content} />
                        );
                    } else if (msg.type === "action") {
                        return (
                            <ActionMessage key={index} action={msg.content} />
                        );
                    } else if (msg.type === "copilot_wait") {
                        return <CopilotWaitMessage key={index} />;
                    } else if (msg.type === "copilot_done") {
                        return (
                            <CopilotDoneMessage
                                key={index}
                                content={msg.content}
                            />
                        );
                    } else if (msg.type === "error") {
                        return <ErrorMessage key={index} />;
                    }
                    return null;
                })}

                {isOperating && !isWaitingForUser && <Loader />}
                <div ref={messagesEndRef} />
            </div>

            <div
                className={`input-container ${
                    initializedChat ? "bottom-fixed" : "centered"
                }`}
            >
                {!initializedChat && <IntroTitle />}
                <ChatBox
                    isOperating={isOperating}
                    onSendMessage={handleSendMessage}
                    onStopOperation={handleStopOperation}
                    onReset={handleReset}
                    initializedChat={initializedChat}
                    isCopilotMode={isCopilotMode}
                    onToggleCopilot={handleToggleCopilot}
                />
            </div>
        </div>
    );
};

export default ChatApp;
