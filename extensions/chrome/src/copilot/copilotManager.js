import CopilotElementsHandler from "./copilotElementsHandler";
import { EnvironmentDataHandler } from "./EnvironmentDataHandler";

/**
 * Manager class for the Copilot mode functionality
 * Handles message listening, event handling, and coordinates with CopilotElementsHandler
 */
class CopilotManager {
    constructor() {
        // Initialize helper classes
        this.elementsHandler = new CopilotElementsHandler();
        this.envDataHandler = new EnvironmentDataHandler();

        // Active marker ID - only one marker should be active at a time
        this.activeMarkerId = null;

        // Active event listener reference for cleanup
        this.activeListener = null;

        // Flag to indicate if a copilot action is in progress
        this.actionInProgress = false;

        // Action families classification
        this.clickActions = [
            "left_click",
            "left_click_drag",
            "double_click",
            "triple_click",
            "right_click",
            "middle_click",
        ];

        this.typingActions = ["key", "hold_key", "type"];

        this.irrelevantActions = ["mouse_move", "scroll"];

        this.pendingActionMessage = null;
        window.addEventListener(
            "beforeunload",
            this.handleBeforeUnload.bind(this)
        );
    }

    /**
     * Initialize the CopilotManager
     * Sets up message listeners and initializes the elements handler
     */
    init() {
        // Initialize the elements handler
        this.elementsHandler.init();

        // Set up message listener from background script
        chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));

        console.log("CopilotManager initialized");
    }

    /**
     * Handle incoming messages from the background script
     * @param {Object} message - The message received
     * @param {Function} sendResponse - Function to send a response
     * @returns {boolean} - Whether the response will be sent asynchronously
     */
    handleMessage(message, _, sendResponse) {
        if (message.type === "COPILOT_CUE") {
            console.log("Received COPILOT_CUE message:", message);

            if (this.actionInProgress) {
                console.warn(
                    "Ignoring action - another action is already in progress"
                );
                return false;
            }

            this.actionInProgress = true;

            this.processCopilotCue(message);
        }

        if (message.type === "AUTOPILOT_CUE") {
            console.log("Received AUTOPILOT_CUE message:", message);

            this.processAutopilotCue(message, sendResponse);

            // Indicate that the response will be sent asynchronously
            return true;
        }

        return false;
    }

    handleBeforeUnload(event) {
        if (this.pendingActionMessage) {
            console.log("Navigation detected, completing pending action");

            chrome.runtime.sendMessage({
                type: "COPILOT_DONE_RESPONSE",
                id: this.pendingActionMessage.id,
                actionName: this.pendingActionMessage.actionName,
            });

            this.pendingActionMessage = null;
        }
    }

    /**
     * Process an autopilot cue by showing appropriate visual feedback
     * @param {Object} message - The message containing action details
     * @param {Function} sendResponse - Function to send a response back
     */
    processAutopilotCue(message, sendResponse) {
        const { actionName, payload } = message;
        let cueId = null;

        // Show appropriate cue based on action type
        if (this.clickActions.includes(actionName)) {
            // For click actions, show a marker at the click coordinates
            const [x, y] = payload.coordinate;
            cueId = this.elementsHandler.insertMarker(x, y);
            console.log(`Showing marker for ${actionName} at (${x}, ${y})`);
        } else if (this.typingActions.includes(actionName)) {
            // For typing actions, show a snackbar with typing info
            const textToShow =
                actionName === "type"
                    ? `Typing: "${payload.text}"`
                    : `Pressing key: ${payload.text}`;

            this.showActionSnackbar(actionName, textToShow);
            console.log(`Showing snackbar for ${actionName}`);
        }

        // Set different timeout durations based on action type
        const timeoutDuration = this.clickActions.includes(actionName)
            ? 1500
            : 2000;

        setTimeout(() => {
            // Clean up the visual cue
            if (this.clickActions.includes(actionName) && cueId) {
                this.elementsHandler.deleteMarker(cueId);
            } else if (this.typingActions.includes(actionName)) {
                this.elementsHandler.hideSnackbar();
            }

            sendResponse({ success: true });
        }, timeoutDuration);
    }

    /**
     * Maps action names to appropriate snackbar class types
     * @param {string} actionName - The action type ("key", "hold_key", or "type")
     * @param {string} textToShow - The text to display in the snackbar
     * @param {string} fallbackType - Optional fallback type if actionName doesn't match (defaults to "regular")
     */
    showActionSnackbar(actionName, textToShow, fallbackType = "regular") {
        // Map action names to snackbar class types
        let snackbarType;

        if (actionName === "type") {
            snackbarType = "typing";
        } else if (actionName === "key" || actionName === "hold_key") {
            snackbarType = "key";
        } else {
            // Use fallback type if actionName doesn't match any defined mapping
            snackbarType = fallbackType;
        }

        // Show the snackbar with the mapped type
        this.elementsHandler.showSnackbar(textToShow, snackbarType);
    }

    /**
     * Process a copilot action
     * @param {Object} message - The message containing action details
     */
    processCopilotCue(message) {
        const { actionName, payload } = message;

        if (this.clickActions.includes(actionName)) {
            // Remove any existing marker
            if (this.activeMarkerId) {
                this.elementsHandler.deleteMarker(this.activeMarkerId);
            }

            const [x, y] = payload.coordinate;
            this.activeMarkerId = this.elementsHandler.insertMarker(x, y);
            console.log(`Showing copilot marker for ${actionName}`);
        } else if (this.typingActions.includes(actionName)) {
            const textToShow =
                actionName === "type"
                    ? `Type: "${payload.text}"`
                    : `Press key: ${payload.text}`;

            this.showActionSnackbar(actionName, textToShow);
            console.log(`Showing copilot snackbar for ${actionName}`);
        }

        // Determine which action family this belongs to and set up the appropriate listener
        if (this.clickActions.includes(actionName)) {
            this.setupClickListener(message);
        } else if (this.typingActions.includes(actionName)) {
            this.setupTypingListener(message);
        } else if (this.irrelevantActions.includes(actionName)) {
            this.handleIrrelevantAction(message);
        } else {
            console.warn(`Unknown action type: ${actionName}`);
            this.completeAction(message, false);
        }
    }

    /**
     * Set up a click event listener for click-family actions
     * @param {Object} message - The message containing action details
     */
    setupClickListener(message) {
        // Store the pending action
        this.pendingActionMessage = message;

        // Remove any existing active listener
        this.removeActiveListener();

        // Create a new click listener
        const clickHandler = (event) => {
            // Clear pending since we're handling it normally
            this.pendingActionMessage = null;

            console.log("Click detected");

            // Remove the marker
            if (this.activeMarkerId) {
                this.elementsHandler.deleteMarker(this.activeMarkerId);
                this.activeMarkerId = null;
            }

            // Remove this event listener
            this.removeActiveListener();

            // Complete action immediately but request a delay in the background
            this.completeAction(message, true, 500);
        };

        // Add the listener to the document
        document.addEventListener("click", clickHandler, { once: true });
        this.activeListener = { type: "click", handler: clickHandler };

        console.log("Click listener set up");
    }

    /**
     * Set up a keyboard event listener for typing-family actions
     * @param {Object} message - The message containing action details
     */
    setupTypingListener(message) {
        // Store the pending action
        this.pendingActionMessage = message;

        // Remove any existing active listener
        this.removeActiveListener();

        // Create a timeout variable
        let inactivityTimeout;

        // Create a new keydown listener
        const keydownHandler = (event) => {
            // Clear any existing timeout
            if (inactivityTimeout) {
                clearTimeout(inactivityTimeout);
            }

            // Don't immediately complete the action or remove the listener
            console.log("Key press detected, waiting for typing to finish");

            // Set a new timeout - will trigger after 2.5 seconds of inactivity
            inactivityTimeout = setTimeout(() => {
                console.log("User finished typing (2.5s inactivity detected)");

                // Clear pending since we're handling it now
                this.pendingActionMessage = null;

                // Remove any marker if it exists
                if (this.activeMarkerId) {
                    this.elementsHandler.deleteMarker(this.activeMarkerId);
                    this.activeMarkerId = null;
                }
                this.elementsHandler.hideSnackbar();

                // Remove this event listener
                this.removeActiveListener();

                // Complete the action with a minimal delay
                this.completeAction(message, true, 500);
            }, 1500);
        };

        // Add the listener to the document
        document.addEventListener("keydown", keydownHandler);

        // Store both the listener and cleanup function
        this.activeListener = {
            type: "keydown",
            handler: keydownHandler,
            inactivityTimeout: inactivityTimeout,
        };

        console.log("Typing listener with inactivity detection set up");
    }

    /**
     * Handle irrelevant actions by simply waiting
     * @param {Object} message - The message containing action details
     */
    handleIrrelevantAction(message) {
        console.log("Handling irrelevant action by waiting");

        // Remove any existing active listener
        this.removeActiveListener();

        // Remove the marker if it exists for some reason
        if (this.activeMarkerId) {
            this.elementsHandler.deleteMarker(this.activeMarkerId);
            this.activeMarkerId = null;
        }

        // Complete immediately but request a delay in the background
        this.completeAction(message, true, 15000);
    }

    /**
     * Remove the active event listener if it exists
     */
    removeActiveListener() {
        if (this.activeListener) {
            document.removeEventListener(
                this.activeListener.type,
                this.activeListener.handler
            );

            // Clear any pending timeout to prevent delayed actions
            if (this.activeListener.inactivityTimeout) {
                clearTimeout(this.activeListener.inactivityTimeout);
            }

            // Reset active listener
            this.activeListener = null;
            console.log("Active listener and associated timeout removed");
        }
    }

    /**
     * Complete an action by sending a message back to the background service
     * @param {Object} message - The original message
     * @param {boolean} success - Whether the action was successful
     * @param {int} delay - Any delay in MS to sending the response
     */
    completeAction(message, success, delay = 0) {
        console.log(
            `Completing action with success=${success}, delay=${delay}`
        );

        chrome.runtime.sendMessage({
            type: "COPILOT_DONE_RESPONSE",
            id: message.id,
            actionName: message.actionName,
        });

        // Reset action in progress flag
        this.actionInProgress = false;
    }

    /**
     * Clean up when the manager is no longer needed
     */
    cleanup() {
        // Remove any active listener
        this.removeActiveListener();

        // Clean up the elements handler
        this.elementsHandler.cleanup();

        console.log("CopilotManager cleaned up");
    }
}

export default CopilotManager;
