import { EnvironmentManager } from "./environmentManager";
import { Communications } from "./communication/agentCommunication";
import { state } from "./state";
import { initializeDebuggerHandler } from "../mainBackground";
import { getDebuggerInstance } from "../debuggerActions";

// Constants for result types
export const RESULT_SCREENSHOT = "screenshot";
export const RESULT_TEXT = "text";
export const SCREENSHOT_DELAY_MS = 1100;

/**
 * Handles actions execution for the agent
 */
export class ActionHandler {
    constructor() {
        this.envManager = new EnvironmentManager();
        this.communications = new Communications();
        this.debuggerHandler = state.debuggerHandler;
    }

    /**
     * Send action to the browser and handle the response
     * @param {Object} action - The action to perform { name, params }
     * @returns {Promise<Array>} [result, resultType]
     */
    async sendAction(action) {
        let result;
        let resultType;
        let validStatus = false;

        console.log(
            `[ActionHandler] Received action: ${action.name}. Params:`,
            action.params
        );

        // Ensure debugger is available for actions that need it
        if (action.name !== "screenshot") {
            const debuggerAvailable = await this.ensureDebuggerAvailable();
            if (!debuggerAvailable) {
                throw new Error(
                    "[ActionHandler] Debugger not available for action execution"
                );
            }
        }

        console.log(
            `[ActionHandler] Executing action: ${action.name}. Params:`,
            action.params
        );

        if (action.name === "screenshot") {
            result = await this.envManager.getScreenshot();
            this.communications.sendActionToSidePanel(action.name);

            resultType = RESULT_SCREENSHOT;
            return [result, resultType];
        }

        try {
            const processedAction =
                this.prepareActionWithConvertedCoordinates(action);

            switch (processedAction.name) {
                case "type":
                case "key":
                case "hold_key":
                    // First send a cue to the screen
                    await this.communications.sendAutopilotCue(processedAction);

                    // Send keyboard actions directly to debugger
                    const keyResponse = await this.handleKeyboardAction(
                        processedAction
                    );
                    validStatus = keyResponse.success;
                    break;

                case "left_click":
                case "double_click":
                case "triple_click":
                case "right_click":
                case "middle_click":
                case "mouse_move":
                case "scroll":
                    // First send a cue to the screen
                    await this.communications.sendAutopilotCue(processedAction);

                    // Handle mouse actions with coordinate conversion
                    const mouseResponse = await this.handleMouseAction(
                        processedAction
                    );
                    validStatus = mouseResponse.success;
                    break;

                case "left_click_drag":
                    // First send a cue to the screen
                    await this.communications.sendAutopilotCue(processedAction);

                    // Handle drag action with start and end coordinates
                    const dragResponse = await this.handleDragAction(
                        processedAction
                    );
                    validStatus = dragResponse.success;
                    break;

                case "wait":
                    // Handle wait action
                    await this.waitAction(processedAction.params.duration);
                    validStatus = true;
                    break;

                case "cursor_position":
                    // Return cursor position information
                    result = this.cursorPositionAction();
                    resultType = RESULT_TEXT;
                    return [result, resultType];

                case "left_mouse_down":
                case "left_mouse_up":
                    // Return implementation message
                    result = this.mouseDownUpAction();
                    resultType = RESULT_TEXT;
                    return [result, resultType];

                default:
                    console.log(
                        `[ActionHandler] Unknown action: ${processedAction.name}`
                    );
                    validStatus = true;
            }

            // Send reference for action taken
            this.communications.sendActionToSidePanel(processedAction.name);

            // If action was successful, take a screenshot
            if (validStatus) {
                await this.delay(SCREENSHOT_DELAY_MS);
                result = await this.envManager.getScreenshot();
                this.communications.sendActionToSidePanel("screenshot");

                resultType = RESULT_SCREENSHOT;
            }

            return [result, resultType];
        } catch (error) {
            console.error(
                `[ActionHandler] Error executing action ${action.name}:`,
                error
            );
        }
    }

    /**
     * Send action to the browser and handle the response
     * @param {Object} action - The action to perform { name, params }
     * @returns {Promise<Array>} [result, resultType]
     */
    async copilotAction(action) {
        let result;
        let resultType;

        const processedAction =
            this.prepareActionWithConvertedCoordinates(action);

        if (!(processedAction.name === "screenshot")) {
            await this.communications.sendCopilotCue(processedAction);
            await this.delay(SCREENSHOT_DELAY_MS);
        }

        result = await this.envManager.getScreenshot();
        this.communications.sendActionToSidePanel("screenshot");
        resultType = RESULT_SCREENSHOT;

        return [result, resultType];
    }

    /**
     * Handle keyboard-related actions
     * @param {Object} action - Action details
     * @returns {Promise<Object>} Action response
     */
    async handleKeyboardAction(action) {
        switch (action.name) {
            case "type":
                return await this.debuggerHandler.typeText(action.params.text);
            case "key":
                return await this.debuggerHandler.pressKey(action.params.text);
            case "hold_key":
                return await this.debuggerHandler.holdKey(
                    action.params.text,
                    action.params.duration || 1 // Default to 1 second if not specified
                );
            default:
                throw new Error(`Unknown keyboard action: ${action.name}`);
        }
    }

    /**
     * Handle mouse-related actions
     * @param {Object} action - Action details
     * @returns {Promise<Object>} Action response
     */
    async handleMouseAction(action) {
        const [x, y] = action.params.coordinate;

        switch (action.name) {
            case "left_click":
                return await this.debuggerHandler.leftClick(x, y);
            case "double_click":
                return await this.debuggerHandler.doubleClick(x, y);
            case "triple_click":
                return await this.debuggerHandler.tripleClick(x, y);
            case "right_click":
                return await this.debuggerHandler.rightClick(x, y);
            case "middle_click":
                return await this.debuggerHandler.middleClick(x, y);
            case "mouse_move":
                return await this.debuggerHandler.mouseMove(x, y);
            case "scroll":
                return await this.debuggerHandler.scroll(
                    x,
                    y,
                    action.params.scroll_direction,
                    action.params.scroll_amount
                );
            default:
                throw new Error(`Unknown mouse action: ${action.name}`);
        }
    }

    /**
     * Handle drag action
     * @param {Object} action - Action details
     * @returns {Promise<Object>} Action response
     */
    async handleDragAction(action) {
        const startCoords = action.params.convertedStartCoordinates;
        const endCoords = action.params.convertedEndCoordinates;

        return await this.debuggerHandler.leftClickDrag(
            startCoords.x,
            startCoords.y,
            endCoords.x,
            endCoords.y
        );
    }

    /**
     * Wait for specified duration
     * @param {number} duration - Duration in seconds
     * @returns {Promise<void>}
     */
    async waitAction(duration) {
        // Similar to Python, shorten the sleep delay by half
        const milliseconds = (duration / 2) * 1000;
        return new Promise((resolve) => setTimeout(resolve, milliseconds));
    }

    /**
     * Return cursor position information
     * @returns {string} Position information message
     */
    cursorPositionAction() {
        return "X=0, Y=0; Note that you are operating on a web browser. Your cursor should be at the last action you performed with coordinates";
    }

    /**
     * Return message about mouse down/up limitations
     * @returns {string} Implementation message
     */
    mouseDownUpAction() {
        return "This method is not allowed in the browser since you do not have the cursor position. If you'd like to press down the cursor and then move in any direction, consider simply clicking on the required position, then using the 'scroll' method to move in the spreadsheet or app.";
    }

    /**
     * Processes an action by creating a copy with converted coordinates if needed
     * @param {Object} action - The original action
     * @returns {Object} - Either a copy with converted coordinates or the original action
     */
    prepareActionWithConvertedCoordinates(action) {
        // Only process actions that need coordinate conversion
        if (
            ![
                "left_click",
                "double_click",
                "triple_click",
                "right_click",
                "middle_click",
                "mouse_move",
                "scroll",
                "left_click_drag",
            ].includes(action.name)
        ) {
            // Return original action for actions that don't need coordinate conversion
            return action;
        }

        // Create a deep copy of the action object
        const actionCopy = JSON.parse(JSON.stringify(action));

        // Convert coordinates based on action type
        if (action.name === "left_click_drag") {
            // Handle drag action's start and end coordinates
            if (actionCopy.params.start_coordinate) {
                const [reshapedXStart, reshapedYStart] =
                    actionCopy.params.start_coordinate;
                const startCoords =
                    this.envManager.convertToOriginalCoordinates(
                        reshapedXStart,
                        reshapedYStart
                    );
                actionCopy.params.start_coordinate = [
                    startCoords.x,
                    startCoords.y,
                ];
            }

            if (actionCopy.params.coordinate) {
                const [reshapedX, reshapedY] = actionCopy.params.coordinate;
                const endCoords = this.envManager.convertToOriginalCoordinates(
                    reshapedX,
                    reshapedY
                );
                actionCopy.params.coordinate = [endCoords.x, endCoords.y];
            }
        } else if (actionCopy.params.coordinate) {
            // Handle regular mouse actions with single coordinate
            const [reshapedX, reshapedY] = actionCopy.params.coordinate;
            const { x, y } = this.envManager.convertToOriginalCoordinates(
                reshapedX,
                reshapedY
            );
            actionCopy.params.coordinate = [x, y];
        }

        return actionCopy;
    }

    /**
     * Creates a delay for the specified duration
     * @param {number} ms - Delay duration in milliseconds
     * @returns {Promise<void>}
     */
    async delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Ensures that the debugger is available and properly attached
     * @returns {Promise<boolean>} True if debugger is available and ready
     */
    async ensureDebuggerAvailable() {
        // Step 1: Check if debugger handler exists
        if (!this.debuggerHandler) {
            console.log(
                "[ActionHandler] Debugger handler is null, attempting to initialize"
            );
            this.debuggerHandler = state.debuggerHandler;

            // Step 2: If still null, try to get a new instance
            if (!this.debuggerHandler) {
                console.log("[ActionHandler] Initializing debugger handler");
                this.debuggerHandler = getDebuggerInstance();

                if (!this.debuggerHandler) {
                    console.error(
                        "[ActionHandler] Failed to initialize debugger handler"
                    );
                    return false;
                }

                // Step 3: Initialize with active tab
                const initialized = await this.initializeWithActiveTab();
                if (!initialized) {
                    console.error(
                        "[ActionHandler] Failed to initialize debugger with active tab"
                    );
                    return false;
                }
            }
        }

        // Step 4: Verify debugger is attached and operational
        return await this.verifyDebuggerOperational();
    }

    /**
     * New method to verify the debugger is operational by testing a simple command
     * @returns {Promise<boolean>} True if the debugger is operational
     */
    async verifyDebuggerOperational() {
        if (!this.debuggerHandler) {
            return false;
        }

        // Check if the debugger reports it's attached
        if (!this.debuggerHandler.isAttached) {
            console.log(
                "[ActionHandler] Debugger reports it's not attached, attempting to attach"
            );

            try {
                // Try to refresh the tab ID before attempting to attach
                const isTabValid =
                    await this.debuggerHandler.ensureValidTabId();
                if (!isTabValid) {
                    console.error(
                        "[ActionHandler] Failed to obtain a valid tab ID"
                    );
                    return false;
                }

                // Attempt to attach the debugger
                const attached = await this.debuggerHandler.attachDebugger(3); // 3 retries
                if (!attached) {
                    console.error("[ActionHandler] Failed to attach debugger");
                    return false;
                }
            } catch (error) {
                console.error(
                    "[ActionHandler] Error during debugger attachment:",
                    error
                );
                return false;
            }
        }

        // Verify the debugger is truly operational with a simple command
        try {
            await this.debuggerHandler.executeCommand("Runtime.evaluate", {
                expression: "1+1",
            });
            console.log("[ActionHandler] Debugger verified operational");
            return true;
        } catch (error) {
            console.error(
                "[ActionHandler] Debugger failed operational verification:",
                error
            );

            try {
                console.log(
                    "[ActionHandler] Attempting to recover debugger connection"
                );

                // First detach if we think we're attached
                if (this.debuggerHandler.isAttached) {
                    await this.debuggerHandler.detachDebugger();
                }

                // Refresh tab ID
                await this.debuggerHandler.ensureValidTabId();

                // Try to attach again
                const reattached = await this.debuggerHandler.attachDebugger(2);
                if (!reattached) {
                    console.error(
                        "[ActionHandler] Failed to recover debugger connection"
                    );
                    return false;
                }

                // Verify again after recovery
                await this.debuggerHandler.executeCommand("Runtime.evaluate", {
                    expression: "1+1",
                });
                console.log(
                    "[ActionHandler] Debugger recovered and verified operational"
                );
                return true;
            } catch (recoveryError) {
                console.error(
                    "[ActionHandler] Failed to recover debugger:",
                    recoveryError
                );
                return false;
            }
        }
    }

    javascript;
    /**
     * Ensures that the debugger is available and properly attached
     * @returns {Promise<boolean>} True if debugger is available and ready
     */
    async ensureDebuggerAvailable() {
        if (!this.debuggerHandler) {
            console.log(
                "[ActionHandler] Debugger handler is null, attempting to initialize"
            );
            this.debuggerHandler = state.debuggerHandler;

            if (!this.debuggerHandler) {
                console.log("[ActionHandler] Initializing debugger handler");
                this.debuggerHandler = getDebuggerInstance();

                if (!this.debuggerHandler) {
                    console.error(
                        "[ActionHandler] Failed to initialize debugger handler"
                    );
                    return false;
                }

                const initialized = await this.initializeWithActiveTab();
                if (!initialized) {
                    console.error(
                        "[ActionHandler] Failed to initialize debugger with active tab"
                    );
                    return false;
                }
            }
        }

        return await this.verifyDebuggerOperational();
    }

    /**
     * Method to verify the debugger is operational by testing a simple command
     * @returns {Promise<boolean>} True if the debugger is operational
     */
    async verifyDebuggerOperational() {
        if (!this.debuggerHandler) {
            return false;
        }

        // Check if the debugger reports it's attached
        if (!this.debuggerHandler.isAttached) {
            console.log(
                "[ActionHandler] Debugger reports it's not attached, attempting to attach"
            );

            try {
                // Try to refresh the tab ID before attempting to attach
                const isTabValid =
                    await this.debuggerHandler.ensureValidTabId();
                if (!isTabValid) {
                    console.error(
                        "[ActionHandler] Failed to obtain a valid tab ID"
                    );
                    return false;
                }

                // Attempt to attach the debugger
                const attached = await this.debuggerHandler.attachDebugger(3);
                if (!attached) {
                    console.error("[ActionHandler] Failed to attach debugger");
                    return false;
                }
            } catch (error) {
                console.error(
                    "[ActionHandler] Error during debugger attachment:",
                    error
                );
                return false;
            }
        }

        // Verify the debugger is truly operational with a simple command
        try {
            // Run a simple test command that should always succeed if debugger is working
            await this.debuggerHandler.executeCommand("Runtime.evaluate", {
                expression: "1+1",
            });
            console.log("[ActionHandler] Debugger verified operational");
            return true;
        } catch (error) {
            console.error(
                "[ActionHandler] Debugger failed operational verification:",
                error
            );

            // If verification failed, try to recover by forcing reattachment
            try {
                console.log(
                    "[ActionHandler] Attempting to recover debugger connection"
                );

                // First detach if we think we're attached
                if (this.debuggerHandler.isAttached) {
                    await this.debuggerHandler.detachDebugger();
                }

                // Refresh tab ID
                await this.debuggerHandler.ensureValidTabId();

                // Try to attach again
                const reattached = await this.debuggerHandler.attachDebugger(2);
                if (!reattached) {
                    console.error(
                        "[ActionHandler] Failed to recover debugger connection"
                    );
                    return false;
                }

                // Verify again after recovery
                await this.debuggerHandler.executeCommand("Runtime.evaluate", {
                    expression: "1+1",
                });
                console.log(
                    "[ActionHandler] Debugger recovered and verified operational"
                );
                return true;
            } catch (recoveryError) {
                console.error(
                    "[ActionHandler] Failed to recover debugger:",
                    recoveryError
                );
                return false;
            }
        }
    }

    /**
     * Improved method to initialize debugger with active tab
     * @returns {Promise<boolean>} True if initialization succeeded
     */
    async initializeWithActiveTab() {
        try {
            const tabs = await new Promise((resolve) => {
                chrome.tabs.query(
                    { active: true, currentWindow: true },
                    (tabs) => {
                        resolve(tabs);
                    }
                );
            });

            if (!tabs || !tabs.length) {
                console.error("[ActionHandler] No active tabs found");
                return false;
            }

            const activeTab = tabs[0];

            this.activeTabId = activeTab.id;
            this.activeTabUrl = activeTab.url;
            console.log(
                `[ActionHandler] Found active tab: ${activeTab.id}, URL: ${activeTab.url}`
            );

            if (this.isUnsupportedUrl(activeTab.url)) {
                console.warn(
                    `[ActionHandler] Tab URL may not support debugging: ${activeTab.url}`
                );
                // We'll still try, but log a warning
            }

            try {
                await this.debuggerHandler.initialize(activeTab.id);

                try {
                    await this.debuggerHandler.executeCommand(
                        "Runtime.evaluate",
                        {
                            expression: "1+1",
                        }
                    );
                    console.log(
                        "[ActionHandler] Debugger successfully initialized and verified with tab:",
                        activeTab.id
                    );
                    return true;
                } catch (verifyError) {
                    console.error(
                        "[ActionHandler] Debugger initialized but failed verification:",
                        verifyError
                    );

                    // Try to recover by reattaching
                    console.log(
                        "[ActionHandler] Attempting to reattach debugger"
                    );
                    await this.debuggerHandler.detachDebugger();
                    const reattached =
                        await this.debuggerHandler.attachDebugger(3);
                    return reattached;
                }
            } catch (error) {
                console.error(
                    "[ActionHandler] Failed to initialize debugger:",
                    error
                );
                return false;
            }
        } catch (error) {
            console.error(
                "[ActionHandler] Error during tab query or initialization:",
                error
            );
            return false;
        }
    }

    /**
     * Helper method to check if URL is likely unsupported for debugging
     * @param {string} url - URL to check
     * @returns {boolean} True if URL is likely unsupported
     */
    isUnsupportedUrl(url) {
        if (!url) return false;

        // Check for URLs that typically don't support debugging
        const unsupportedPatterns = [
            /^chrome:\/\//, // Chrome internal pages
            /^chrome-extension:\/\//, // Chrome extensions
            /^about:/, // Browser internal pages
            /^file:\/\//, // Local files (may have permission issues)
            /^view-source:/, // View source pages
            /^devtools:/, // DevTools pages
        ];

        return unsupportedPatterns.some((pattern) => pattern.test(url));
    }
}
