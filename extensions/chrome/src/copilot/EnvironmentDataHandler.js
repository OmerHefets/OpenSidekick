/**
 * Handles environment-related data requests in the content script
 */
export class EnvironmentDataHandler {
    constructor() {
        this.setupMessageListeners();
        console.log("[EnvironmentDataHandler] Initialized");
    }

    /**
     * Set up message listeners for environment data requests
     */
    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
            console.log("[EnvironmentDataHandler] Received message:", message);

            if (message.type === "GET_DPR") {
                this.fetchDPR(sendResponse);

                return true;
            }
        });
    }

    /**
     * Fetch the device pixel ratio and send it back
     * @param {Function} sendResponse - Callback function to send response
     */
    fetchDPR(sendResponse) {
        try {
            const dpr = window.devicePixelRatio || 1.25;
            console.log("[EnvironmentDataHandler] Device Pixel Ratio:", dpr);

            sendResponse({ dpr });
        } catch (error) {
            console.error(
                "[EnvironmentDataHandler] Error fetching DPR:",
                error
            );
            sendResponse({ dpr: 1.25, error: error.message });
        }
    }
}
