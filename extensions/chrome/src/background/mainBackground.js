import { state } from "./agent/state.js";
import { DebuggerHandler, getDebuggerInstance } from "./debuggerActions.js";
import { setupAgentMessageListeners } from "./agent/communication/agentListeners.js";

// Init agent listeners
setupAgentMessageListeners();

chrome.runtime.onInstalled.addListener(() => {
    console.log("Sidekick installed.");
    chrome.storage.local.set({ isPanelOpen: false });
});

chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
    if (message.type === "PANEL_OPENED") {
        console.log("Side panel opened via message");
        state.isPanelOpen = true;
        chrome.storage.local.set({ isPanelOpen: true });

        if (!state.isCopilotMode) {
            initializeDebuggerHandler();
        } else {
            console.log("In copilot mode - skipping debugger initialization");
        }

        sendResponse({ status: "Polling started" });
        return true;
    } else if (message.type === "PANEL_CLOSED") {
        console.log("Side panel closed via message");
        state.isPanelOpen = false;
        chrome.storage.local.set({ isPanelOpen: false });

        cleanupDebuggerHandler();

        sendResponse({ status: "Polling stopped" });
        return true;
    }
});

export function initializeDebuggerHandler() {
    if (state.debuggerHandler) {
        console.log(
            "Skipping debugger initialization: " +
                (state.debuggerHandler
                    ? "already initialized"
                    : "in copilot mode")
        );
        return;
    }

    console.log("Initializing debugger handler");

    state.debuggerHandler = getDebuggerInstance();

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
            state.debuggerHandler
                .initialize(tabs[0].id)
                .then(() =>
                    console.log("Debugger initialized with tab:", tabs[0].id)
                )
                .catch((error) =>
                    console.error("Failed to initialize debugger:", error)
                );
        }
    });
}

export function cleanupDebuggerHandler() {
    if (!state.debuggerHandler) return;

    console.log("Cleaning up debugger handler");

    state.debuggerHandler
        .cleanup()
        .then(() => console.log("Debugger cleaned up successfully"))
        .catch((error) => console.error("Error cleaning up debugger:", error));

    state.debuggerHandler = null;
}
