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

                await this.initializeWithActiveTab();
            }
        }
        return true;
    }

    async initializeWithActiveTab() {
        return new Promise((resolve) => {
            chrome.tabs.query(
                { active: true, currentWindow: true },
                async (tabs) => {
                    if (tabs && tabs[0]) {
                        try {
                            await this.debuggerHandler.initialize(tabs[0].id);
                            console.log(
                                "[ActionHandler] Debugger initialized with tab:",
                                tabs[0].id
                            );
                            resolve(true);
                        } catch (error) {
                            console.error(
                                "[ActionHandler] Failed to initialize debugger:",
                                error
                            );
                            resolve(false);
                        }
                    } else {
                        console.error(
                            "[ActionHandler] No active tab found for initialization"
                        );
                        resolve(false);
                    }
                }
            );
        });
    }
}
