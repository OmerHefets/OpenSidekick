import { Communications } from "./communication/agentCommunication";

/**
 * Manages environment-related functionality and image processing
 */
export class EnvironmentManager {
    static instance = null;

    /**
     * Get the singleton instance of EnvironmentManager
     * @returns {EnvironmentManager} The singleton instance
     */
    static getInstance() {
        if (!EnvironmentManager.instance) {
            EnvironmentManager.instance = new EnvironmentManager();
        }
        return EnvironmentManager.instance;
    }

    constructor() {
        if (EnvironmentManager.instance) {
            return EnvironmentManager.instance;
        }

        this.communications = new Communications();
        this.originalDimensions = { width: 1024, height: 768 };
        this.padding = { top: 0, left: 0 };
        this.scaleFactor = { x: 1.0, y: 1.0 };

        EnvironmentManager.instance = this;
    }

    /**
     * Takes a screenshot and processes it to the target size
     * @param {Object} targetSize - Target dimensions { width, height }
     * @returns {Promise<string>} Base64 encoded image data
     */
    async getScreenshot(targetSize = { width: 1024, height: 768 }) {
        console.log("[EnvironmentManager] Taking screenshot");

        try {
            const base64Screenshot = await this.captureScreenshot();

            // Process the screenshot
            const processedScreenshot = await this.processScreenshot(
                base64Screenshot,
                targetSize
            );
            return processedScreenshot;
        } catch (error) {
            console.error("[EnvironmentManager] Screenshot error:", error);
            this.communications.errorMessage();
            throw error;
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
     * Scale an image according to the device pixel ratio without using Image object
     * @param {string} base64Data - Base64-encoded image data
     * @returns {Promise<string>} Scaled base64-encoded image data
     */
    async scaleImage(base64Data) {
        try {
            const dpr = await this.communications.getDPR();
            console.log("[EnvHandler] DPR ratio:", dpr);

            const binaryString = atob(base64Data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);

            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const blob = new Blob([bytes], { type: "image/png" });

            const imageBitmap = await createImageBitmap(blob);

            const canvas = new OffscreenCanvas(
                imageBitmap.width / dpr,
                imageBitmap.height / dpr
            );

            const ctx = canvas.getContext("2d");
            ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);

            const scaledBlob = await canvas.convertToBlob({
                type: "image/png",
            });
            const scaledBase64 = await this.blobToBase64(scaledBlob);

            return scaledBase64.replace(/^data:image\/png;base64,/, "");
        } catch (error) {
            console.error("[EnvironmentManager] Error scaling image:", error);
            throw error;
        }
    }

    /**
     * Process the screenshot to match the target size with padding if necessary
     * @param {string} base64Image - Base64 encoded image data
     * @param {Object} targetSize - Target dimensions { width, height }
     * @returns {Promise<string>} Processed base64 encoded image data
     */
    async processScreenshot(
        base64Image,
        targetSize = { width: 1024, height: 768 }
    ) {
        try {
            // Decode base64 to binary array
            const binaryString = atob(base64Image);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);

            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Create a blob from the bytes
            const blob = new Blob([bytes], { type: "image/png" });

            // Use createImageBitmap which is available in workers/background contexts
            const imageBitmap = await createImageBitmap(blob);

            // Store original dimensions
            const currentWidth = imageBitmap.width;
            const currentHeight = imageBitmap.height;
            this.originalDimensions = {
                width: currentWidth,
                height: currentHeight,
            };

            // Reset padding
            this.padding = { top: 0, left: 0 };

            // Calculate aspect ratios
            const currentRatio = currentWidth / currentHeight;
            const targetRatio = targetSize.width / targetSize.height;

            // Create an OffscreenCanvas for the padded image
            const canvas = new OffscreenCanvas(
                currentRatio > targetRatio
                    ? currentWidth
                    : Math.round(currentHeight * targetRatio),
                currentRatio > targetRatio
                    ? Math.round(currentWidth / targetRatio)
                    : currentHeight
            );
            const ctx = canvas.getContext("2d");

            // Add padding based on aspect ratio comparison
            if (currentRatio > targetRatio) {
                // Width is too large relative to height, add padding on top/bottom
                const newHeight = Math.round(currentWidth / targetRatio);
                const paddingHeight = Math.floor(
                    (newHeight - currentHeight) / 2
                );

                // Fill with black background
                ctx.fillStyle = "black";
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Draw the image with top padding
                ctx.drawImage(imageBitmap, 0, paddingHeight);

                // Store top padding for coordinate conversion
                this.padding.top = paddingHeight;
            } else {
                // Height is too large relative to width, add padding on left/right
                // Fill with black background
                ctx.fillStyle = "black";
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Draw the image on the left (no left padding)
                ctx.drawImage(imageBitmap, 0, 0);
            }

            // Calculate scale factors between padded and target size
            this.scaleFactor = {
                x: canvas.width / targetSize.width,
                y: canvas.height / targetSize.height,
            };

            // Create an OffscreenCanvas for the resized image
            const resizedCanvas = new OffscreenCanvas(
                targetSize.width,
                targetSize.height
            );
            const resizedCtx = resizedCanvas.getContext("2d");

            // Use high-quality image smoothing
            resizedCtx.imageSmoothingEnabled = true;
            resizedCtx.imageSmoothingQuality = "high";

            // Draw the padded image scaled to the target size
            resizedCtx.drawImage(
                canvas,
                0,
                0,
                canvas.width,
                canvas.height,
                0,
                0,
                targetSize.width,
                targetSize.height
            );

            // Convert to base64 string
            const blob2 = await resizedCanvas.convertToBlob({
                type: "image/png",
            });
            const resizedBase64 = await this.blobToBase64(blob2);

            return resizedBase64.replace(/^data:image\/png;base64,/, "");
        } catch (error) {
            console.error("Error processing screenshot:", error);
            throw error;
        }
    }

    /**
     * Helper function to convert Blob to base64
     * @param {Blob} blob - Blob to convert
     * @returns {Promise<string>} Base64 string
     */
    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Convert coordinates from the padded 1024x768 image back to original image coordinates
     * @param {number} x - x-coordinate in the padded image (0-1023)
     * @param {number} y - y-coordinate in the padded image (0-767)
     * @returns {Object} Original coordinates { x, y }
     */
    convertToOriginalCoordinates(x, y) {
        if (!this.originalDimensions) {
            throw new Error("No screenshot has been processed yet");
        }

        // Step 1: Scale coordinates back to padded image size
        const paddedX = x * this.scaleFactor.x;
        const paddedY = y * this.scaleFactor.y;

        // Step 2: Remove padding offsets
        const originalX = paddedX;
        const originalY = paddedY - this.padding.top;

        // Step 3: Ensure coordinates are within original image bounds
        const boundedX = Math.max(
            0,
            Math.min(originalX, this.originalDimensions.width - 1)
        );
        const boundedY = Math.max(
            0,
            Math.min(originalY, this.originalDimensions.height - 1)
        );

        return {
            x: Math.round(boundedX),
            y: Math.round(boundedY),
        };
    }
}
