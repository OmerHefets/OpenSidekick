import React from "react";
import { createRoot } from "react-dom/client";
import ChatApp from "./chat/ChatApp";
import CopilotManager from "./copilot/copilotManager";

const EXTENSION_URL_PATTERN = "chrome-extension://";

/**
 * Check if the current context is the sidebar
 * @returns {boolean} True if in sidebar context
 */
function isSidebarContext() {
    return (
        document.getElementById("root") &&
        (window.location.href.includes(EXTENSION_URL_PATTERN) ||
            document
                .querySelector("html")
                ?.getAttribute("data-extension-sidebar"))
    );
}

/**
 * Initialize the sidebar React application
 */
function initializeSidebar() {
    console.log("[Index] In sidebar context, initializing chat");
    const root = createRoot(document.getElementById("root"));
    root.render(<ChatApp />);
}

/**
 * Initialize the content script for website interaction
 */
function initializeContentScript() {
    console.log("[Index] In main page, injecting copilotManager");

    const copilotManager = new CopilotManager();
    copilotManager.init();
}

// index.js main logic
if (isSidebarContext()) {
    initializeSidebar();
} else {
    initializeContentScript();
}
