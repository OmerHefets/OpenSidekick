import { mapActionToTitle } from "../../../utils/actionResponseHandler";

/**
 * Handles communication between the agent and UI components
 */
export class Communications {
    /**
     * Send an AI message to the sidepanel
     * @param {string} message - The message text to send
     */
    sendTextToSidePanel(message) {
        console.log("[Communications] Send message to sidepanel:", message);
        chrome.runtime.sendMessage({
            type: "AI_RESPONSE",
            aiMessage: message,
        });
    }

    sendActionToSidePanel(actionName) {
        console.log("[Communications] Send action to sidepanel:", actionName);

        const actionTitle = mapActionToTitle(actionName);
        chrome.runtime.sendMessage({
            type: "ACTION_RESPONSE",
            title: actionTitle,
        });
    }

    /**
     * Signal that the current run has finished
     */
    finishRun() {
        console.log("[Communications] Finishing run");
        chrome.runtime.sendMessage({
            type: "FINISH_RUN",
        });
    }

    /**
     * Request a screenshot from the environment
     * @returns {Promise<Object>} The screenshot data
     */
    requestScreenshot() {
        console.log("[Communications] Requesting screenshot");

        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                {
                    type: "SCREENSHOT",
                },
                (response) => {
                    if (chrome.runtime.lastError) {
                        console.log(
                            `[Communications] Screenshot request failed: ${chrome.runtime.lastError.message}`
                        );
                        reject(chrome.runtime.lastError);
                        return;
                    }

                    if (response && response.success) {
                        console.log(
                            `[Communications] Screenshot request successful`
                        );
                        resolve(response.screenData);
                    } else {
                        console.log(
                            `[Communications] Screenshot request failed: ${
                                response?.error || "Unknown error"
                            }`
                        );
                        reject(response?.error || "Screenshot failed");
                    }
                }
            );
        });
    }

    async sendCopilotCue(actionData) {
        console.log(`[Communications] Sending copilot cue: ${actionData.name}`);

        chrome.runtime.sendMessage({
            type: "COPILOT_WAIT_RESPONSE",
        });

        const tabs = await new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, resolve);
        });

        if (!tabs || !tabs[0]) {
            console.error("[Communications] No active tab found");
            return Promise.reject("No active tab found");
        }

        return new Promise((resolve, reject) => {
            const messageListener = (message) => {
                if (
                    message.type === "COPILOT_DONE_RESPONSE" &&
                    message.actionName === actionData.name
                ) {
                    console.log(
                        `[Communications] Received copilot done response for: ${actionData.name}`
                    );
                    chrome.runtime.onMessage.removeListener(messageListener);
                    resolve(message);
                }
            };

            chrome.runtime.onMessage.addListener(messageListener);

            setTimeout(() => {
                console.log(
                    `[Communications] Action timed out after 60 seconds: ${actionData.name}`
                );
                chrome.runtime.onMessage.removeListener(messageListener);
                reject(new Error("Action timed out after 60 seconds"));
            }, 60000);

            chrome.tabs.sendMessage(tabs[0].id, {
                type: "COPILOT_CUE",
                actionName: actionData.name,
                payload: actionData.params,
            });

            console.log(
                `[Communications] COPILOT_CUE message sent for action: ${actionData.name}`
            );
        });
    }

    async sendAutopilotCue(actionData) {
        console.log(
            `[Communications] Sending autopilot cue: ${actionData.name}`
        );

        return new Promise((resolve) => {
            // Get the active tab
            chrome.tabs.query(
                { active: true, currentWindow: true },
                async (tabs) => {
                    if (tabs.length === 0) {
                        console.warn(
                            "[Communications] No active tab found for sending autopilot cue"
                        );
                        resolve(false);
                        return;
                    }

                    const activeTabId = tabs[0].id;

                    // Send the message to the content script
                    chrome.tabs.sendMessage(
                        activeTabId,
                        {
                            type: "AUTOPILOT_CUE",
                            actionName: actionData.name,
                            payload: actionData.params,
                        },
                        (response) => {
                            if (chrome.runtime.lastError) {
                                console.log(
                                    `[Communications] Error sending autopilot cue: ${chrome.runtime.lastError.message}`
                                );
                                resolve(false);
                            } else {
                                console.log(
                                    `[Communications] Autopilot cue acknowledged for action: ${actionData.name}`
                                );
                                resolve(true);
                            }
                        }
                    );
                }
            );
        });
    }
}
