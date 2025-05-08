/**
 * Handles environment-specific operations like screenshots and other sidebar-related functionalities
 */
class EnvironmentHandler {
    /**
     * Initialize the environment handler and set up message listeners
     */
    initialize() {
        console.log("Initializing EnvironmentHandler");
        this.setupMessageListeners();
    }

    /**
     * Set up Chrome runtime message listeners
     */
    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
            if (message.type === "SCREENSHOT") {
                this.handleScreenshotRequest(message, sendResponse);

                // Return true to indicate we will send response asynchronously
                return true;
            }
        });
    }

    /**
     * Handle screenshot requests from the background script
     * @param {Object} message - The message containing screenshot request details
     * @param {Function} sendResponse - Function to send response back to caller
     */
    async handleScreenshotRequest(message, sendResponse) {
        console.log("SCREENSHOT Message in the SIDEPANEL!", message);

        try {
            const base64Image = await this.captureScreenshot();
            // Send response directly back to the caller
            sendResponse({
                success: true,
                screenData: base64Image,
            });
        } catch (error) {
            console.error("Error taking screenshot:", error);
            sendResponse({
                success: false,
                error: "Failed to capture screenshot",
            });
        }
    }

    /**
     * Take a screenshot of the visible tab area with simple retry mechanism
     * @returns {Promise<string>} Base64-encoded image data (without the prefix)
     */
    async captureScreenshot() {
        const maxRetries = 5;
        const retryDelay = 500; // 0.5 seconds

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // If not the first attempt, wait before retrying
                if (attempt > 0) {
                    await new Promise((resolve) =>
                        setTimeout(resolve, retryDelay)
                    );
                    console.log(
                        `Screenshot attempt ${attempt + 1} of ${maxRetries}...`
                    );
                }

                const dataUrl = await chrome.tabs.captureVisibleTab(null, {
                    format: "png",
                });

                // Convert dataUrl to base64 data only (remove the prefix)
                const base64Data = dataUrl.replace(
                    /^data:image\/png;base64,/,
                    ""
                );

                return await this.scaleImage(base64Data);
            } catch (error) {
                if (attempt === maxRetries - 1) {
                    console.error(
                        `Screenshot failed after ${maxRetries} attempts:`,
                        error
                    );
                    throw error;
                } else {
                    console.warn(
                        `Screenshot attempt ${attempt + 1} failed, retrying...`,
                        error
                    );
                }
            }
        }
    }

    /**
     * Scale an image according to the device pixel ratio
     * @param {string} base64Data - Base64-encoded image data
     * @returns {Promise<string>} Scaled base64-encoded image data
     */
    scaleImage(base64Data) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const dpr = window.devicePixelRatio;
                const canvas = document.createElement("canvas");
                canvas.width = img.width / dpr;
                canvas.height = img.height / dpr;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // Get the scaled image data
                const scaledDataUrl = canvas.toDataURL("image/png");
                const scaledBase64Data = scaledDataUrl.replace(
                    /^data:image\/png;base64,/,
                    ""
                );

                resolve(scaledBase64Data);
            };
            img.src = `data:image/png;base64,${base64Data}`;
        });
    }
}

export default EnvironmentHandler;
