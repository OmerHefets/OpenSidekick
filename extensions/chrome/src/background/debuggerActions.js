import { state } from "./agent/state";

export class DebuggerHandler {
    constructor() {
        if (state.debuggerHandler) {
            return state.debuggerHandler;
        }

        this.tabId = null;
        this.isAttached = false;
        this.actionQueue = [];
        this.isProcessingAction = false;

        // Bind methods to maintain 'this' context
        this.handleTabActivated = this.handleTabActivated.bind(this);
        this.handleDebuggerDetached = this.handleDebuggerDetached.bind(this);

        // Add event listeners
        chrome.tabs.onActivated.addListener(this.handleTabActivated);
        chrome.debugger.onDetach.addListener(this.handleDebuggerDetached);
    }

    async initialize(tabId) {
        this.tabId = tabId;

        if (!this.tabId) {
            const isTabValid = await this.ensureValidTabId();
            if (!isTabValid) {
                throw new Error(
                    "Failed to obtain valid tab ID during initialization"
                );
            }
        }

        await this.attachDebugger();
    }

    async cleanup() {
        if (this.isAttached) {
            try {
                await this.detachDebugger();
            } catch (error) {
                console.error("Error detaching debugger:", error);
            }
        }

        // Remove event listeners
        chrome.tabs.onActivated.removeListener(this.handleTabActivated);
        chrome.debugger.onDetach.removeListener(this.handleDebuggerDetached);

        // Clear state
        this.tabId = null;
        this.isAttached = false;
        this.actionQueue = [];
        this.isProcessingAction = false;
    }

    async attachDebugger(retryCount = 3) {
        if (!this.tabId) {
            console.error("No tab ID provided");
            return false;
        }

        if (this.isAttached) {
            try {
                await this.executeCommand("Runtime.evaluate", {
                    expression: "1+1",
                });
                console.log("Debugger attachment verified");
                return true;
            } catch (error) {
                console.warn(
                    "Debugger says attached but command failed, resetting state:",
                    error
                );
                this.isAttached = false;
            }
        }

        return new Promise((resolve) => {
            let attemptCount = 0;

            const attemptAttach = (retriesLeft) => {
                attemptCount++;

                const backoffDelay = this.calculateBackoffDelay(attemptCount);

                console.log(
                    `Attempting to attach debugger to tab ${this.tabId}, attempt ${attemptCount}, retries left: ${retriesLeft}, backoff: ${backoffDelay}ms`
                );

                chrome.debugger.attach({ tabId: this.tabId }, "1.3", () => {
                    if (chrome.runtime.lastError) {
                        const error = chrome.runtime.lastError.message;
                        console.error("Attachment failed:", error);

                        if (retriesLeft > 0) {
                            console.log(
                                `Retrying attachment in ${backoffDelay}ms. Retries left: ${
                                    retriesLeft - 1
                                }`
                            );
                            setTimeout(
                                () => attemptAttach(retriesLeft - 1),
                                backoffDelay
                            );
                        } else {
                            console.error("All attachment attempts failed");
                            resolve(false);
                        }
                        return;
                    }

                    console.log("Debugger successfully attached");
                    this.isAttached = true;

                    this.executeCommand("Runtime.evaluate", {
                        expression: "1+1",
                    })
                        .then(() => {
                            console.log(
                                "Debugger attachment verified with test command"
                            );
                            resolve(true);
                        })
                        .catch((cmdError) => {
                            console.error(
                                "Attachment succeeded but test command failed:",
                                cmdError
                            );
                            this.isAttached = false;
                            if (retriesLeft > 0) {
                                setTimeout(
                                    () => attemptAttach(retriesLeft - 1),
                                    backoffDelay
                                );
                            } else {
                                resolve(false);
                            }
                        });
                });
            };

            attemptAttach(retryCount);
        });
    }

    async detachDebugger() {
        if (!this.isAttached || !this.tabId) {
            return true; // Nothing to detach
        }

        return new Promise((resolve) => {
            chrome.debugger.detach({ tabId: this.tabId }, () => {
                if (chrome.runtime.lastError) {
                    console.error(
                        "Detachment failed:",
                        chrome.runtime.lastError
                    );
                    resolve(false);
                    return;
                }

                this.isAttached = false;
                resolve(true);
            });
        });
    }

    async handleTabActivated(activeInfo) {
        if (this.tabId !== activeInfo.tabId) {
            console.log("[Debugger] Handle tab activated - detaching debugger");
            if (this.isAttached) {
                console.log("[Debugger] Debugger attached, detaching");
                await this.detachDebugger();
            }

            this.tabId = activeInfo.tabId;
            await this.attachDebugger();
        }
    }

    handleDebuggerDetached(source, reason) {
        if (source.tabId === this.tabId) {
            this.isAttached = false;
            console.log("Debugger detached:", reason);

            if (reason !== "target_closed") {
                this.attachDebugger().catch(console.error);
            }
        }
    }

    async executeCommand(method, params = {}, retryCount = 2) {
        const startTime = Date.now();
        let succeeded = false;

        const commandId = Math.random().toString(36).substring(2, 8);
        console.log(`[${commandId}] Executing command: ${method}`, params);

        const isTabValid = await this.ensureValidTabId();
        if (!isTabValid) {
            const error = new Error(
                "Failed to obtain valid tab ID for command execution"
            );
            console.error(`[${commandId}] Command failed:`, error);
            this.logCommandStats(method, startTime, false, error.message);
            throw error;
        }

        if (!this.isAttached || !this.tabId) {
            console.log(
                `[${commandId}] Debugger not attached, attempting to attach before command execution`
            );
            const attached = await this.attachDebugger();
            if (!attached) {
                const error = new Error(
                    "Failed to attach debugger for command execution"
                );
                console.error(`[${commandId}] Command failed:`, error);
                this.logCommandStats(method, startTime, false, error.message);
                throw error;
            }
        }

        return new Promise((resolve, reject) => {
            const executeWithRetry = (retriesLeft, lastError = null) => {
                if (lastError) {
                    console.warn(
                        `[${commandId}] Retry after error:`,
                        lastError
                    );
                }

                const retryAttempt = retryCount - retriesLeft + 1;
                const backoffDelay = this.calculateBackoffDelay(
                    retryAttempt,
                    2, // Base multiplier for commands (exponential)
                    100, // Start with shorter delays for commands
                    2000 // Cap at 2 seconds
                );

                chrome.debugger.sendCommand(
                    { tabId: this.tabId },
                    method,
                    params,
                    (result) => {
                        if (chrome.runtime.lastError) {
                            const error = chrome.runtime.lastError.message;
                            console.error(
                                `[${commandId}] Command ${method} failed:`,
                                error
                            );

                            if (
                                error.includes("Detached") ||
                                error.includes("not attached")
                            ) {
                                this.isAttached = false;

                                if (retriesLeft > 0) {
                                    console.log(
                                        `[${commandId}] Reattaching debugger and retrying in ${backoffDelay}ms. Retries left: ${
                                            retriesLeft - 1
                                        }`
                                    );

                                    chrome.debugger.detach(
                                        { tabId: this.tabId },
                                        () => {
                                            setTimeout(() => {
                                                this.attachDebugger().then(
                                                    (success) => {
                                                        if (success) {
                                                            setTimeout(
                                                                () =>
                                                                    executeWithRetry(
                                                                        retriesLeft -
                                                                            1,
                                                                        error
                                                                    ),
                                                                100
                                                            );
                                                        } else {
                                                            this.logCommandStats(
                                                                method,
                                                                startTime,
                                                                false,
                                                                error
                                                            );
                                                            reject(
                                                                new Error(
                                                                    `Failed to reattach debugger: ${error}`
                                                                )
                                                            );
                                                        }
                                                    }
                                                );
                                            }, backoffDelay);
                                        }
                                    );
                                    return;
                                }
                            } else if (
                                error.includes("Cannot find context") ||
                                error.includes("Cannot access") ||
                                error.includes("Target closed")
                            ) {
                                console.warn(
                                    `[${commandId}] Tab context changed during command:`,
                                    error
                                );
                                this.isAttached = false;

                                if (retriesLeft > 0) {
                                    this.ensureValidTabId().then((isValid) => {
                                        if (isValid) {
                                            this.attachDebugger().then(
                                                (attached) => {
                                                    if (attached) {
                                                        setTimeout(
                                                            () =>
                                                                executeWithRetry(
                                                                    retriesLeft -
                                                                        1,
                                                                    error
                                                                ),
                                                            backoffDelay
                                                        );
                                                    } else {
                                                        this.logCommandStats(
                                                            method,
                                                            startTime,
                                                            false,
                                                            error
                                                        );
                                                        reject(
                                                            new Error(
                                                                `Failed to reattach to new tab: ${error}`
                                                            )
                                                        );
                                                    }
                                                }
                                            );
                                        } else {
                                            this.logCommandStats(
                                                method,
                                                startTime,
                                                false,
                                                error
                                            );
                                            reject(
                                                new Error(
                                                    `No valid tab found: ${error}`
                                                )
                                            );
                                        }
                                    });
                                    return;
                                }
                            }

                            if (retriesLeft > 0) {
                                console.log(
                                    `[${commandId}] Retrying command in ${backoffDelay}ms. Retries left: ${
                                        retriesLeft - 1
                                    }`
                                );
                                setTimeout(
                                    () =>
                                        executeWithRetry(
                                            retriesLeft - 1,
                                            error
                                        ),
                                    backoffDelay
                                );
                                return;
                            }

                            this.logCommandStats(
                                method,
                                startTime,
                                false,
                                error
                            );
                            reject(new Error(error));
                            return;
                        }

                        succeeded = true;
                        const duration = Date.now() - startTime;
                        console.log(
                            `[${commandId}] Command ${method} succeeded in ${duration}ms`
                        );
                        this.logCommandStats(method, startTime, true);
                        resolve(result);
                    }
                );
            };

            executeWithRetry(retryCount);
        });
    }

    logCommandStats(method, startTime, success, errorMessage = null) {
        const duration = Date.now() - startTime;

        if (!this.commandStats) {
            this.commandStats = {
                total: 0,
                success: 0,
                failure: 0,
                byMethod: {},
            };
        }

        this.commandStats.total++;
        this.commandStats[success ? "success" : "failure"]++;

        if (!this.commandStats.byMethod[method]) {
            this.commandStats.byMethod[method] = {
                total: 0,
                success: 0,
                failure: 0,
                avgDuration: 0,
                errors: [],
            };
        }

        const methodStats = this.commandStats.byMethod[method];
        methodStats.total++;
        methodStats[success ? "success" : "failure"]++;

        const prevTotal = methodStats.avgDuration * (methodStats.total - 1);
        methodStats.avgDuration = (prevTotal + duration) / methodStats.total;

        if (!success && errorMessage) {
            if (methodStats.errors.length >= 10) {
                methodStats.errors.shift();
            }
            methodStats.errors.push({
                time: new Date().toISOString(),
                duration,
                error: errorMessage,
            });
        }

        if (this.commandStats.total % 50 === 0) {
            console.log(
                "Debugger command statistics:",
                JSON.stringify(this.commandStats, null, 2)
            );
        }
    }

    async ensureValidTabId() {
        if (!this.tabId) {
            console.log("No tabId found, fetching active tab");
            try {
                const tabs = await chrome.tabs.query({
                    active: true,
                    currentWindow: true,
                });

                if (!tabs || tabs.length === 0) {
                    console.error("No active tabs found");
                    return false;
                }

                this.tabId = tabs[0].id;
                console.log(
                    `Retrieved active tabId: ${this.tabId}, URL: ${tabs[0].url}`
                );

                this.tabUrl = tabs[0].url;
                return true;
            } catch (error) {
                console.error("Error getting active tab:", error);
                return false;
            }
        }

        try {
            const tab = await chrome.tabs.get(this.tabId);

            if (tab.url !== this.tabUrl) {
                console.log(
                    `Tab URL changed from ${this.tabUrl} to ${tab.url}`
                );
                this.tabUrl = tab.url;

                if (
                    this.isAttached &&
                    this.getOrigin(tab.url) !== this.getOrigin(this.tabUrl)
                ) {
                    console.log(
                        "Tab navigated to different origin, debugger may need reattachment"
                    );

                    this.attachmentNeedsVerification = true;
                }
            }

            return true;
        } catch (error) {
            console.log(
                `TabId ${this.tabId} is no longer valid, fetching new active tab`
            );

            try {
                const tabs = await chrome.tabs.query({
                    active: true,
                    currentWindow: true,
                });

                if (!tabs || tabs.length === 0) {
                    console.error("No active tabs found for replacement");
                    this.tabId = null;
                    this.tabUrl = null;
                    return false;
                }

                const oldTabId = this.tabId;
                this.tabId = tabs[0].id;
                this.tabUrl = tabs[0].url;

                console.log(
                    `Updated from tabId ${oldTabId} to ${this.tabId}, URL: ${this.tabUrl}`
                );

                // If we had a debugger attached to the old tab, we need to reattach
                if (this.isAttached) {
                    console.log(
                        "Tab changed while debugger was attached, need to reattach"
                    );
                    this.isAttached = false;
                }

                return true;
            } catch (queryError) {
                console.error(
                    "Error getting replacement active tab:",
                    queryError
                );
                this.tabId = null;
                this.tabUrl = null;
                return false;
            }
        }
    }

    getOrigin(url) {
        try {
            if (!url) return null;
            const parsed = new URL(url);
            return parsed.origin;
        } catch (e) {
            return null;
        }
    }

    calculateBackoffDelay(
        attemptCount,
        baseMultiplier = 1.5,
        minDelay = 1000,
        maxDelay = 10000,
        jitter = true
    ) {
        const baseDelay = Math.min(
            minDelay * Math.pow(baseMultiplier, attemptCount - 1),
            maxDelay
        );

        const randomJitter = jitter ? Math.floor(Math.random() * 200) : 0;

        return baseDelay + randomJitter;
    }

    // Queue actions to prevent conflicts
    async queueAction(actionFn) {
        const isTabValid = await this.ensureValidTabId();
        if (!isTabValid) {
            return Promise.reject(
                new Error("Invalid tab ID for action execution")
            );
        }

        return new Promise((resolve, reject) => {
            const executeAction = async () => {
                try {
                    this.isProcessingAction = true;
                    const result = await actionFn();
                    this.isProcessingAction = false;

                    // Process next action in queue
                    if (this.actionQueue.length > 0) {
                        const nextAction = this.actionQueue.shift();
                        nextAction();
                    }

                    resolve(result);
                } catch (error) {
                    this.isProcessingAction = false;

                    // Process next action in queue
                    if (this.actionQueue.length > 0) {
                        const nextAction = this.actionQueue.shift();
                        nextAction();
                    }

                    reject(error);
                }
            };

            if (this.isProcessingAction) {
                this.actionQueue.push(executeAction);
            } else {
                executeAction();
            }
        });
    }

    // Implementation of automation actions

    // Left click at coordinates
    async leftClick(x, y) {
        return this.queueAction(async () => {
            // Mouse pressed
            await this.executeCommand("Input.dispatchMouseEvent", {
                type: "mousePressed",
                x,
                y,
                button: "left",
                clickCount: 1,
            });

            // Slight delay for realism
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Mouse released
            await this.executeCommand("Input.dispatchMouseEvent", {
                type: "mouseReleased",
                x,
                y,
                button: "left",
                clickCount: 1,
            });

            return { success: true };
        });
    }

    // Left click and drag from start coordinates to end coordinates
    async leftClickDrag(x_start, y_start, x_end, y_end) {
        return this.queueAction(async () => {
            // Configure drag options
            const dragSteps = 10; // Number of intermediate points for smooth dragging
            const dragDelay = 20; // Milliseconds between steps

            // Mouse pressed at starting position
            await this.executeCommand("Input.dispatchMouseEvent", {
                type: "mousePressed",
                x: x_start,
                y: y_start,
                button: "left",
                clickCount: 1,
            });

            // Wait a moment before starting the drag
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Calculate the intermediate points for smooth dragging
            for (let i = 1; i <= dragSteps; i++) {
                const progress = i / dragSteps;
                const x = Math.round(x_start + (x_end - x_start) * progress);
                const y = Math.round(y_start + (y_end - y_start) * progress);

                // Dispatch moved event for each intermediate point
                await this.executeCommand("Input.dispatchMouseEvent", {
                    type: "mouseMoved",
                    x,
                    y,
                    button: "left",
                });

                // Slight delay between moves for realism
                await new Promise((resolve) => setTimeout(resolve, dragDelay));
            }

            // Mouse released at final position
            await this.executeCommand("Input.dispatchMouseEvent", {
                type: "mouseReleased",
                x: x_end,
                y: y_end,
                button: "left",
                clickCount: 1,
            });

            return { success: true };
        });
    }

    // Double click at coordinates
    async doubleClick(x, y) {
        return this.queueAction(async () => {
            // First click - mouse pressed
            await this.executeCommand("Input.dispatchMouseEvent", {
                type: "mousePressed",
                x,
                y,
                button: "left",
                clickCount: 1,
            });

            // Mouse released for first click
            await this.executeCommand("Input.dispatchMouseEvent", {
                type: "mouseReleased",
                x,
                y,
                button: "left",
                clickCount: 1,
            });

            // Small delay between clicks (typically around 100-200ms for a double-click)
            await new Promise((resolve) => setTimeout(resolve, 150));

            // Second click - mouse pressed with clickCount: 2
            await this.executeCommand("Input.dispatchMouseEvent", {
                type: "mousePressed",
                x,
                y,
                button: "left",
                clickCount: 2,
            });

            // Mouse released for second click with clickCount: 2
            await this.executeCommand("Input.dispatchMouseEvent", {
                type: "mouseReleased",
                x,
                y,
                button: "left",
                clickCount: 2,
            });

            return { success: true };
        });
    }

    // Triple click at coordinates
    async tripleClick(x, y) {
        return this.queueAction(async () => {
            // First click - clickCount: 1
            await this.executeCommand("Input.dispatchMouseEvent", {
                type: "mousePressed",
                x,
                y,
                button: "left",
                clickCount: 1,
            });
            await this.executeCommand("Input.dispatchMouseEvent", {
                type: "mouseReleased",
                x,
                y,
                button: "left",
                clickCount: 1,
            });

            // Small delay between clicks
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Second click - clickCount: 2
            await this.executeCommand("Input.dispatchMouseEvent", {
                type: "mousePressed",
                x,
                y,
                button: "left",
                clickCount: 2,
            });
            await this.executeCommand("Input.dispatchMouseEvent", {
                type: "mouseReleased",
                x,
                y,
                button: "left",
                clickCount: 2,
            });

            // Small delay between clicks
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Third click - clickCount: 3
            await this.executeCommand("Input.dispatchMouseEvent", {
                type: "mousePressed",
                x,
                y,
                button: "left",
                clickCount: 3,
            });
            await this.executeCommand("Input.dispatchMouseEvent", {
                type: "mouseReleased",
                x,
                y,
                button: "left",
                clickCount: 3,
            });

            return { success: true };
        });
    }

    // Right click at coordinates
    async rightClick(x, y) {
        return this.queueAction(async () => {
            // Mouse pressed
            await this.executeCommand("Input.dispatchMouseEvent", {
                type: "mousePressed",
                x,
                y,
                button: "right",
                clickCount: 1,
            });

            // Slight delay for realism
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Mouse released
            await this.executeCommand("Input.dispatchMouseEvent", {
                type: "mouseReleased",
                x,
                y,
                button: "right",
                clickCount: 1,
            });

            return { success: true };
        });
    }

    // Middle click at coordinates
    async middleClick(x, y) {
        return this.queueAction(async () => {
            // Mouse pressed
            await this.executeCommand("Input.dispatchMouseEvent", {
                type: "mousePressed",
                x,
                y,
                button: "middle",
                clickCount: 1,
            });

            // Slight delay for realism
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Mouse released
            await this.executeCommand("Input.dispatchMouseEvent", {
                type: "mouseReleased",
                x,
                y,
                button: "middle",
                clickCount: 1,
            });

            return { success: true };
        });
    }

    // Move mouse cursor to coordinates (hover)
    async mouseMove(x, y) {
        return this.queueAction(async () => {
            await this.executeCommand("Input.dispatchMouseEvent", {
                type: "mouseMoved",
                x,
                y,
                button: "none",
                clickCount: 0,
            });

            return { success: true };
        });
    }

    // Type text
    async typeText(text) {
        return this.queueAction(async () => {
            await this.executeCommand("Input.insertText", { text });

            return { success: true };
        });
    }

    /**
     * Scroll the screen in a specified direction by a specified amount at the given coordinates
     * @param {number} x - The x coordinate where the scroll should occur
     * @param {number} y - The y coordinate where the scroll should occur
     * @param {string} scroll_direction - The direction to scroll: "up", "down", "left", or "right"
     * @param {number} scroll_amount - The number of "clicks" to scroll
     * @returns {Promise<Object>} - Result of the scroll operation
     */
    async scroll(x, y, scroll_direction, scroll_amount) {
        return this.queueAction(async () => {
            // Configure scroll parameters based on direction
            // Standard scroll wheel delta values per "click"
            const SCROLL_DELTA = 100;

            // Calculate deltaX and deltaY based on direction and amount
            let deltaX = 0;
            let deltaY = 0;

            switch (scroll_direction) {
                case "up":
                    deltaY = -SCROLL_DELTA * scroll_amount;
                    break;
                case "down":
                    deltaY = SCROLL_DELTA * scroll_amount;
                    break;
                case "left":
                    deltaX = -SCROLL_DELTA * scroll_amount;
                    break;
                case "right":
                    deltaX = SCROLL_DELTA * scroll_amount;
                    break;
                default:
                    return {
                        success: false,
                        error: `Invalid scroll direction: ${scroll_direction}. Must be up, down, left, or right.`,
                    };
            }

            // Simulate multiple individual scroll events for a more natural scroll behavior
            for (let i = 0; i < scroll_amount; i++) {
                // Calculate single-click delta for this step
                const singleDeltaX = deltaX / scroll_amount;
                const singleDeltaY = deltaY / scroll_amount;

                // Dispatch the wheel event
                await this.executeCommand("Input.dispatchMouseEvent", {
                    type: "mouseWheel",
                    x: x,
                    y: y,
                    deltaX: singleDeltaX,
                    deltaY: singleDeltaY,
                });

                // Small delay between scroll events for a more natural feel
                await new Promise((resolve) => setTimeout(resolve, 50));
            }

            return { success: true };
        });
    }

    // Fixed pressKey method
    async pressKey(keyCommand) {
        return this.queueAction(async () => {
            console.log(`Executing key command: ${keyCommand}`);

            // Parse the key command (handles syntax like "ctrl+c" or "alt+Tab")
            const keys = this.parseKeyCommand(keyCommand);
            console.log("Parsed keys:", keys);

            // Get all modifier keys
            const modifierKeys = keys.filter((k) => k.isModifier);
            // Calculate combined modifier mask for all modifiers
            const totalModifierMask = this.calculateModifierMask(modifierKeys);

            // Log what we're about to do
            console.log(`Using modifier mask: ${totalModifierMask}`);
            if (modifierKeys.length > 0) {
                console.log(
                    `Applying modifiers: ${modifierKeys
                        .map((k) => k.key)
                        .join(", ")}`
                );
            }

            try {
                // Press all modifier keys first
                for (const key of modifierKeys) {
                    await this.executeCommand("Input.dispatchKeyEvent", {
                        type: "keyDown",
                        modifiers: totalModifierMask, // Use the total modifier mask
                        windowsVirtualKeyCode: key.keyCode,
                        code: key.code,
                        key: key.key,
                    });
                }

                // Then press the main key (non-modifier)
                const mainKey = keys.find((k) => !k.isModifier);
                if (mainKey) {
                    console.log(
                        `Pressing main key: ${mainKey.key} with modifiers: ${totalModifierMask}`
                    );

                    // Key down
                    await this.executeCommand("Input.dispatchKeyEvent", {
                        type: "keyDown",
                        modifiers: totalModifierMask, // Use the total modifier mask
                        windowsVirtualKeyCode: mainKey.keyCode,
                        code: mainKey.code,
                        key: mainKey.key,
                    });

                    // If it's a printable character, also dispatch a char event
                    if (mainKey.text) {
                        // Important: when used with modifiers like Ctrl, we don't want
                        // to send the actual character
                        if (totalModifierMask === 0) {
                            await this.executeCommand(
                                "Input.dispatchKeyEvent",
                                {
                                    type: "char",
                                    modifiers: totalModifierMask,
                                    text: mainKey.text,
                                    key: mainKey.key,
                                }
                            );
                        }
                    }

                    // Key up for main key
                    await this.executeCommand("Input.dispatchKeyEvent", {
                        type: "keyUp",
                        modifiers: totalModifierMask, // Use the total modifier mask
                        windowsVirtualKeyCode: mainKey.keyCode,
                        code: mainKey.code,
                        key: mainKey.key,
                    });
                }

                // Release modifier keys in reverse order
                for (const key of modifierKeys.reverse()) {
                    await this.executeCommand("Input.dispatchKeyEvent", {
                        type: "keyUp",
                        modifiers: totalModifierMask, // Use the total modifier mask
                        windowsVirtualKeyCode: key.keyCode,
                        code: key.code,
                        key: key.key,
                    });
                }

                return { success: true };
            } catch (error) {
                console.error("Error in pressKey:", error);
                return { success: false, error: error.message };
            }
        });
    }

    // Parse key command string like "ctrl+c" or "alt+Tab"
    parseKeyCommand(keyCommand) {
        // Split by + or - (both are common separators)
        const parts = keyCommand.split(/[+\-]/);
        const keys = [];
        let modifierMask = 0;

        // Process each part of the command
        for (const part of parts) {
            const keyInfo = this.getKeyInfo(part.trim().toLowerCase());

            if (keyInfo) {
                // Track total modifier mask
                if (keyInfo.isModifier) {
                    modifierMask |= keyInfo.modifierMask;
                }

                // Add to keys array
                keys.push(keyInfo);
            }
        }

        // Apply cumulative modifier mask to each key
        for (const key of keys) {
            if (!key.isModifier) {
                key.modifierMask = modifierMask;
            }
        }

        return keys;
    }

    // Calculate combined modifier mask
    calculateModifierMask(modifierKeys) {
        return modifierKeys.reduce((mask, key) => mask | key.modifierMask, 0);
    }

    // Map key name to key codes and modifier flags
    getKeyInfo(keyName) {
        // Key mapping table
        const keyMap = {
            // Modifiers
            ctrl: {
                key: "Control",
                code: "ControlLeft",
                keyCode: 17,
                isModifier: true,
                modifierMask: 2,
            },
            alt: {
                key: "Alt",
                code: "AltLeft",
                keyCode: 18,
                isModifier: true,
                modifierMask: 1,
            },
            shift: {
                key: "Shift",
                code: "ShiftLeft",
                keyCode: 16,
                isModifier: true,
                modifierMask: 8,
            },
            meta: {
                key: "Meta",
                code: "MetaLeft",
                keyCode: 91,
                isModifier: true,
                modifierMask: 4,
            },
            command: {
                key: "Meta",
                code: "MetaLeft",
                keyCode: 91,
                isModifier: true,
                modifierMask: 4,
            },
            win: {
                key: "Meta",
                code: "MetaLeft",
                keyCode: 91,
                isModifier: true,
                modifierMask: 4,
            },

            // Special keys
            enter: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" },
            return: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" },
            tab: { key: "Tab", code: "Tab", keyCode: 9, text: "\t" },
            space: { key: " ", code: "Space", keyCode: 32, text: " " },
            backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
            delete: { key: "Delete", code: "Delete", keyCode: 46 },
            del: { key: "Delete", code: "Delete", keyCode: 46 },
            escape: { key: "Escape", code: "Escape", keyCode: 27 },
            esc: { key: "Escape", code: "Escape", keyCode: 27 },

            // Arrow keys
            up: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
            down: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
            left: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
            right: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },

            // Function keys
            f1: { key: "F1", code: "F1", keyCode: 112 },
            f2: { key: "F2", code: "F2", keyCode: 113 },
            f3: { key: "F3", code: "F3", keyCode: 114 },
            f4: { key: "F4", code: "F4", keyCode: 115 },
            f5: { key: "F5", code: "F5", keyCode: 116 },
            f6: { key: "F6", code: "F6", keyCode: 117 },
            f7: { key: "F7", code: "F7", keyCode: 118 },
            f8: { key: "F8", code: "F8", keyCode: 119 },
            f9: { key: "F9", code: "F9", keyCode: 120 },
            f10: { key: "F10", code: "F10", keyCode: 121 },
            f11: { key: "F11", code: "F11", keyCode: 122 },
            f12: { key: "F12", code: "F12", keyCode: 123 },

            // Navigation keys
            home: { key: "Home", code: "Home", keyCode: 36 },
            end: { key: "End", code: "End", keyCode: 35 },
            pageup: { key: "PageUp", code: "PageUp", keyCode: 33 },
            pagedown: { key: "PageDown", code: "PageDown", keyCode: 34 },

            // Editing keys
            insert: { key: "Insert", code: "Insert", keyCode: 45 },
            ins: { key: "Insert", code: "Insert", keyCode: 45 },

            // Common symbols
            ";": { key: ";", code: "Semicolon", keyCode: 186, text: ";" },
            "=": { key: "=", code: "Equal", keyCode: 187, text: "=" },
            ",": { key: ",", code: "Comma", keyCode: 188, text: "," },
            "-": { key: "-", code: "Minus", keyCode: 189, text: "-" },
            ".": { key: ".", code: "Period", keyCode: 190, text: "." },
            "/": { key: "/", code: "Slash", keyCode: 191, text: "/" },
            "`": { key: "`", code: "Backquote", keyCode: 192, text: "`" },
            "[": { key: "[", code: "BracketLeft", keyCode: 219, text: "[" },
            "\\": { key: "\\", code: "Backslash", keyCode: 220, text: "\\" },
            "]": { key: "]", code: "BracketRight", keyCode: 221, text: "]" },
            "'": { key: "'", code: "Quote", keyCode: 222, text: "'" },
        };

        // Check if it's a single character (like "a", "b", "1", etc.)
        if (keyName.length === 1 && !keyMap[keyName]) {
            const charCode = keyName.charCodeAt(0);
            let keyCode = charCode;

            // Convert lowercase letters to uppercase for keyCode (matches keyboard behavior)
            if (charCode >= 97 && charCode <= 122) {
                keyCode = keyName.toUpperCase().charCodeAt(0);
            }

            return {
                key: keyName,
                code: `Key${keyName.toUpperCase()}`,
                keyCode: keyCode,
                text: keyName,
                isModifier: false,
                modifierMask: 0,
            };
        }

        // Return the mapped key or null if not found
        return keyMap[keyName] || null;
    }

    // Hold key(s) for specified duration with accurate key repetition
    async holdKey(keyCommand, durationSeconds) {
        return this.queueAction(async () => {
            console.log(
                `Holding key command: ${keyCommand} for ${durationSeconds} seconds`
            );

            // Parse the key command
            const keys = this.parseKeyCommand(keyCommand);
            const modifierKeys = keys.filter((k) => k.isModifier);
            const totalModifierMask = this.calculateModifierMask(modifierKeys);
            const mainKey = keys.find((k) => !k.isModifier);

            // Keyboard repeat timing constants (typical system defaults)
            const initialDelay = 500; // ms before first repeat
            const repeatInterval = 40; // ms between subsequent repeats (25 chars/sec)

            try {
                // Press modifier keys
                for (const key of modifierKeys) {
                    await this.executeCommand("Input.dispatchKeyEvent", {
                        type: "keyDown",
                        modifiers: totalModifierMask,
                        windowsVirtualKeyCode: key.keyCode,
                        code: key.code,
                        key: key.key,
                    });
                }

                // Only proceed with key repetition if we have a main key
                if (mainKey) {
                    // Initial key down
                    await this.executeCommand("Input.dispatchKeyEvent", {
                        type: "keyDown",
                        modifiers: totalModifierMask,
                        windowsVirtualKeyCode: mainKey.keyCode,
                        code: mainKey.code,
                        key: mainKey.key,
                    });

                    // For printable characters, dispatch initial char event
                    if (mainKey.text && totalModifierMask === 0) {
                        await this.executeCommand("Input.dispatchKeyEvent", {
                            type: "char",
                            modifiers: totalModifierMask,
                            text: mainKey.text,
                            key: mainKey.key,
                        });
                    }

                    // Calculate total time and number of repeats
                    const totalMs = Math.max(0, durationSeconds * 1000);
                    let remainingMs = totalMs;

                    if (remainingMs <= initialDelay) {
                        // Just wait if duration is too short for repeats
                        await new Promise((resolve) =>
                            setTimeout(resolve, remainingMs)
                        );
                    } else {
                        // Wait initial delay
                        await new Promise((resolve) =>
                            setTimeout(resolve, initialDelay)
                        );
                        remainingMs -= initialDelay;

                        // Calculate number of key repeats
                        const repeatCount = Math.floor(
                            remainingMs / repeatInterval
                        );
                        const finalDelay = remainingMs % repeatInterval;

                        // Process repeats for any key type (not just printable chars)
                        for (let i = 0; i < repeatCount; i++) {
                            // For navigation and other special keys, we simulate a repeat by
                            // doing another keyDown event (this is how browsers handle repeats)
                            await this.executeCommand(
                                "Input.dispatchKeyEvent",
                                {
                                    type: "keyDown",
                                    modifiers: totalModifierMask,
                                    windowsVirtualKeyCode: mainKey.keyCode,
                                    code: mainKey.code,
                                    key: mainKey.key,
                                    isAutoRepeat: true, // Mark as auto-repeat
                                }
                            );

                            // For printable characters, also send a char event
                            if (mainKey.text && totalModifierMask === 0) {
                                await this.executeCommand(
                                    "Input.dispatchKeyEvent",
                                    {
                                        type: "char",
                                        modifiers: totalModifierMask,
                                        text: mainKey.text,
                                        key: mainKey.key,
                                    }
                                );
                            }

                            // Wait between repeats (except for the last one)
                            if (i < repeatCount - 1) {
                                await new Promise((resolve) =>
                                    setTimeout(resolve, repeatInterval)
                                );
                            }
                        }

                        // Wait any remaining time for precise timing
                        if (finalDelay > 0) {
                            await new Promise((resolve) =>
                                setTimeout(resolve, finalDelay)
                            );
                        }
                    }

                    // Release main key
                    await this.executeCommand("Input.dispatchKeyEvent", {
                        type: "keyUp",
                        modifiers: totalModifierMask,
                        windowsVirtualKeyCode: mainKey.keyCode,
                        code: mainKey.code,
                        key: mainKey.key,
                    });
                } else {
                    // If only modifier keys, just hold for duration
                    await new Promise((resolve) =>
                        setTimeout(resolve, durationSeconds * 1000)
                    );
                }

                // Release modifier keys in reverse order
                for (const key of modifierKeys.reverse()) {
                    await this.executeCommand("Input.dispatchKeyEvent", {
                        type: "keyUp",
                        modifiers: totalModifierMask,
                        windowsVirtualKeyCode: key.keyCode,
                        code: key.code,
                        key: key.key,
                    });
                }

                return { success: true };
            } catch (error) {
                console.error("Error in holdKey:", error);
                return { success: false, error: error.message };
            }
        });
    }
}

export function getDebuggerInstance() {
    if (!state.debuggerHandler) {
        state.debuggerHandler = new DebuggerHandler();
    }
    return state.debuggerHandler;
}
