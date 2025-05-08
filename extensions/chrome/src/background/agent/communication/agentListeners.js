import { CUAgent } from "../CUAgent.js";

/**
 * Sets up all message listeners for the extension
 */
export function setupAgentMessageListeners() {
    chrome.runtime.onMessage.addListener((message) => {
        console.log("[Communication] Received message:", message.type);

        const agent = CUAgent.getInstance();

        switch (message.type) {
            case "USER_MESSAGE":
                agent.processUserMessage(message.text);
                break;

            case "RESET_AGENT":
                agent.reset();
                break;

            case "STOP_AGENT":
                agent.stop();
                break;

            case "TOGGLE_COPILOT":
                agent.setCopilotMode(message.isEnabled);
                break;
        }
    });
}
