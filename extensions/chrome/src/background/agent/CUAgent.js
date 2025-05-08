import {
    cleanupDebuggerHandler,
    initializeDebuggerHandler,
} from "../mainBackground";
import { ActionHandler, RESULT_SCREENSHOT } from "./actions.js";
import { Communications } from "./communication/agentCommunication.js";
import { Parser } from "./parser.js";
import PolicyEngine from "./policy/policyEngine.js";
import { state } from "./state";
import { TrajectoryManager } from "./trajectoryManager";

// Singleton instance
let instance = null;

/**
 * Main agent class that handles core functionality
 */
export class CUAgent {
    /**
     * Get the singleton instance of CUAgent
     * @returns {CUAgent} The singleton instance
     */
    static getInstance() {
        if (!instance) {
            console.log("[CUAgent] Initializing agent instance");
            instance = new CUAgent();
        }
        return instance;
    }

    constructor() {
        this.cancelRequest = false;
        this.trajectory = new TrajectoryManager();
        this.communications = new Communications();
        this.actions = new ActionHandler();
        this.parser = new Parser();
        this.llmEngine = new PolicyEngine();

        console.log("[CUAgent] Agent instance initialized");
    }

    /**
     * Process a user message
     */
    async processUserMessage(text) {
        console.log("[CUAgent] Processing user message:", text);
        let result, type;

        this.cancelRequest = false;
        this.trajectory.append({
            role: "user",
            content: text,
        });

        while (true) {
            // Check cancellation flag at the start of each loop iteration
            if (this.cancelRequest) {
                console.log("[CUAgent] Agent stopped successfully.");
                break;
            }

            // Process the trajectory with LLM engine
            const actionBlocks = await this.llmEngine.process(
                this.trajectory.get()
            );

            // Check cancellation flag after potentially long-running operation
            if (this.cancelRequest) {
                console.log("[CUAgent] Agent stopped successfully.");
                break;
            }

            // Append actions to trajectory
            this.trajectory.append({
                role: "assistant",
                content: actionBlocks,
            });

            // Extract text action and real action
            const textAction = actionBlocks.find((b) => b.type === "text");
            const realAction = actionBlocks.find((b) => b.type === "tool_use");

            // Process text actions for the chat
            if (textAction) {
                this.communications.sendTextToSidePanel(textAction.text);
            }

            // If no real action, finish the run
            if (!realAction) {
                this.communications.finishRun();
                break;
            }

            // Check cancellation flag before starting next potentially long operation
            if (this.cancelRequest) {
                console.log("[CUAgent] Agent stopped successfully.");
                break;
            }

            // Convert action data
            const actionPayload = this.parser.convertToActionData(
                realAction.input
            );

            // Handle validation based on copilot mode
            // let validation;
            // if (!isCopilotMode) {
            //     validation = await this.actions.validateElement(actionPayload);
            // } else {
            //     validation = DEFAULT_VALIDATION;
            // }

            if (state.isCopilotMode) {
                [result, type] = await this.actions.copilotAction(
                    actionPayload
                );
            } else {
                [result, type] = await this.actions.sendAction(actionPayload);
            }

            // Check cancellation flag after another potentially long-running operation
            if (this.cancelRequest) {
                console.log("[CUAgent] Agent stopped successfully.");
                break;
            }

            // Prepare content based on result type
            let content;
            if (type === RESULT_SCREENSHOT) {
                content = [
                    {
                        type: "image",
                        source: {
                            type: "base64",
                            media_type: "image/png",
                            data: result,
                        },
                    },
                ];
            } else {
                content = result;
            }

            // Append environment observation to trajectory
            this.trajectory.append({
                role: "user",
                content: [
                    {
                        type: "tool_result",
                        tool_use_id: realAction.id,
                        content: content,
                    },
                ],
            });
        }
    }

    /**
     * Reset the agent
     */
    async reset() {
        console.log("[CUAgent] Resetting agent");

        this.trajectory.reset();
    }

    /**
     * Stop any ongoing agent operations
     */
    async stop() {
        console.log("[CUAgent] Stopping agent operation");

        this.cancelRequest = true;
        await this.performStopCleanup();
    }

    /**
     * Set the copilot mode
     */
    async setCopilotMode(isEnabled) {
        console.log("[CUAgent] Setting copilot mode to:", isEnabled);

        state.isCopilotMode = isEnabled;
        if (state.isPanelOpen) {
            if (state.isCopilotMode) {
                cleanupDebuggerHandler();
            } else {
                initializeDebuggerHandler();
            }
        }
    }

    async performStopCleanup() {
        console.log("Performing cleanup after stopping");

        this.trajectory.cleanupLastAction();
    }
}
