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

export async function initializeDebuggerHandler() {
    if (state.debuggerHandler) {
        console.log("Debugger already initialized, performing health check...");
        const isHealthy = await verifyDebuggerHealth();
        if (isHealthy) {
            console.log("Existing debugger is healthy");
            return;
        }
        console.log("Existing debugger is unhealthy, reinitializing...");
        await cleanupDebuggerHandler();
    }

    console.log("Initializing debugger handler");

    try {
        state.debuggerHandler = getDebuggerInstance();

        state.lastDebuggerInitAttempt = Date.now();

        const [activeTab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
        });

        if (!activeTab) {
            throw new Error("No active tab found for debugger initialization");
        }

        state.activeTabId = activeTab.id;
        state.activeTabUrl = activeTab.url;

        await state.debuggerHandler.initialize(activeTab.id);

        state.lastDebuggerInitSuccess = Date.now();

        console.log(
            "Debugger successfully initialized with tab:",
            activeTab.id
        );

        setupTabEventListeners();

        await verifyDebuggerAttachment();

        return true;
    } catch (error) {
        console.error("Failed to initialize debugger:", error);

        state.lastDebuggerInitFailure = Date.now();
        state.lastDebuggerInitError = error.message;

        await attemptDebuggerRecovery();

        return false;
    }
}

async function verifyDebuggerHealth() {
    if (!state.debuggerHandler || !state.debuggerHandler.isAttached) {
        return false;
    }

    try {
        const result = await state.debuggerHandler.executeCommand(
            "Runtime.evaluate",
            { expression: "1+1" }
        );
        return result === 2;
    } catch (error) {
        console.warn("Debugger health check failed:", error);
        return false;
    }
}

async function verifyDebuggerAttachment() {
    if (!state.debuggerHandler || !state.debuggerHandler.isAttached) {
        throw new Error("Debugger is not attached");
    }

    try {
        await state.debuggerHandler.executeCommand("Runtime.evaluate", {
            expression: "console.log('Debugger attachment test')",
        });
        console.log("Debugger attachment verified");
        return true;
    } catch (error) {
        console.error("Debugger attachment verification failed:", error);
        state.debuggerHandler.isAttached = false;
        return false;
    }
}

async function attemptDebuggerRecovery() {
    console.log("Attempting debugger recovery...");

    try {
        await cleanupDebuggerHandler(true);

        await new Promise((resolve) => setTimeout(resolve, 500));

        state.debuggerHandler = getDebuggerInstance();

        const [activeTab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
        });
        if (!activeTab) {
            throw new Error("No active tab found during recovery");
        }

        await state.debuggerHandler.initialize(activeTab.id, 5);

        console.log("Debugger recovery successful");
        state.lastDebuggerRecoverySuccess = Date.now();

        return true;
    } catch (error) {
        console.error("Debugger recovery failed:", error);
        state.lastDebuggerRecoveryFailure = Date.now();
        state.lastDebuggerRecoveryError = error.message;

        state.debuggerHandler = null;

        return false;
    }
}

function setupTabEventListeners() {
    chrome.tabs.onUpdated.removeListener(handleTabUpdated);
    chrome.tabs.onRemoved.removeListener(handleTabRemoved);

    chrome.tabs.onUpdated.addListener(handleTabUpdated);
    chrome.tabs.onRemoved.addListener(handleTabRemoved);

    console.log("Tab event listeners setup complete");
}

function handleTabUpdated(tabId, changeInfo, tab) {
    if (tabId !== state.activeTabId) return;

    console.log("Active tab updated:", changeInfo);

    if (changeInfo.url && state.activeTabUrl !== changeInfo.url) {
        console.log(
            "Tab URL changed from",
            state.activeTabUrl,
            "to",
            changeInfo.url
        );
        state.activeTabUrl = changeInfo.url;

        verifyDebuggerAttachment().catch(() => {
            console.log(
                "Debugger attachment lost after URL change, reinitializing..."
            );
            initializeDebuggerHandler();
        });
    }

    if (changeInfo.status === "complete") {
        console.log("Tab finished loading, verifying debugger...");
        verifyDebuggerAttachment().catch((error) => {
            console.error(
                "Debugger verification failed after tab load:",
                error
            );
            initializeDebuggerHandler();
        });
    }
}

function handleTabRemoved(tabId, removeInfo) {
    if (tabId !== state.activeTabId) return;

    console.log("Active tab was closed:", removeInfo);

    cleanupDebuggerHandler(true);

    state.activeTabId = null;
    state.activeTabUrl = null;
}

export async function cleanupDebuggerHandler(force = false) {
    if (!state.debuggerHandler && !force) {
        console.log("No debugger handler to clean up");
        return true;
    }

    console.log("Cleaning up debugger handler");

    try {
        if (state.debuggerHandler) {
            await state.debuggerHandler.cleanup();
        }

        chrome.tabs.onUpdated.removeListener(handleTabUpdated);
        chrome.tabs.onRemoved.removeListener(handleTabRemoved);

        state.debuggerHandler = null;
        state.activeTabId = null;
        state.activeTabUrl = null;

        console.log("Debugger cleaned up successfully");
        return true;
    } catch (error) {
        console.error("Error cleaning up debugger:", error);

        if (!force) {
            console.log("Attempting forced cleanup...");

            state.debuggerHandler = null;

            chrome.tabs.onUpdated.removeListener(handleTabUpdated);
            chrome.tabs.onRemoved.removeListener(handleTabRemoved);

            return false;
        }

        return false;
    }
}
