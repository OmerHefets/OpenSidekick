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
     * Get the Device Pixel Ratio from the active tab
     * @returns {Promise<number>} The device pixel ratio
     */
    async getDPR() {
        console.log("[Communications] Request DPR from content script");

        return new Promise((resolve) => {
            try {
                chrome.tabs.query(
                    { active: true, currentWindow: true },
                    (tabs) => {
                        if (!tabs || !tabs[0] || !tabs[0].id) {
                            console.warn(
                                "[Communications] No active tab found, using default DPR of 1.25"
                            );
                            resolve(1.25);
                            return;
                        }

                        chrome.tabs.sendMessage(
                            tabs[0].id,
                            { type: "GET_DPR" },
                            (response) => {
                                if (chrome.runtime.lastError) {
                                    console.warn(
                                        "[Communications] Error getting DPR:",
                                        chrome.runtime.lastError
                                    );
                                    resolve(1.25);
                                    return;
                                }

                                if (
                                    response &&
                                    typeof response.dpr === "number"
                                ) {
                                    console.log(
                                        "[Communications] Retrieved DPR:",
                                        response.dpr
                                    );
                                    resolve(response.dpr);
                                } else {
                                    console.warn(
                                        "[Communications] Invalid DPR response, using default 1.0"
                                    );
                                    resolve(1.25);
                                }
                            }
                        );
                    }
                );
            } catch (error) {
                console.error("[Communications] Error in getDPR:", error);
                resolve(1.25);
            }
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
