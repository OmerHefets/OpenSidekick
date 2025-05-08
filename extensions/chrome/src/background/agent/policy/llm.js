import { Anthropic } from "@anthropic-ai/sdk";
import * as retry from "retry";
import { AUTOPILOT_SYSTEM_PROMPT, COPILOT_SYSTEM_PROMPT } from "./prompts";
import storageManager from "../../../services/storage/storageManager";
import { StorageCategoryEnum } from "../../../services/storage/enums";

/**
 * LLMConnector class for handling interactions with the Anthropic API
 */
class LLMConnector {
    /**
     * Initialize the LLMConnector
     * @param {Object} options - Configuration options
     * @param {number} options.maxRetries - Maximum number of retry attempts
     * @param {number} options.minWait - Minimum wait time in seconds before retry
     * @param {number} options.maxWait - Maximum wait time in seconds before retry
     * @param {string} options.apiKey - Optional API key override
     */
    constructor({
        maxRetries = 5,
        minWait = 1,
        maxWait = 60,
        apiKey = null,
    } = {}) {
        this.maxRetries = maxRetries;
        this.minWait = minWait;
        this.maxWait = maxWait;
        this.apiKey = apiKey;
        this.client = null;
    }

    /**
     * Initialize the Anthropic client with API key from storage
     * @returns {Promise<void>}
     */
    async initializeClient() {
        if (this.client) return;

        let apiKey = this.apiKey;

        if (!apiKey) {
            apiKey = await storageManager.getValue(
                StorageCategoryEnum.ApiKeys,
                "anthropic"
            );

            if (!apiKey) {
                throw new Error(
                    "Anthropic API key not found. Please add your API key in the extension settings."
                );
            }
        }

        this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
        console.log("[LLM] Initialized a LLM new client");
    }

    /**
     * Add cache_control to the last item in the content list of the most recent user message
     * Always creates a deep copy to avoid modifying the original conversation
     * @param {Array} conversation - The conversation history
     * @return {Array} - A copy of the conversation with cache_control added
     * @private
     */
    addCacheControl(conversation) {
        // Create a deep copy to avoid modifying the original conversation
        const conversationCopy = JSON.parse(JSON.stringify(conversation));

        // Find the last message with role 'user'
        for (let i = conversationCopy.length - 1; i >= 0; i--) {
            if (conversationCopy[i]?.role === "user") {
                // Get the content from the last user message
                let content = conversationCopy[i].content;

                // If content is a string, convert it to a list with a single text item
                if (typeof content === "string") {
                    content = [{ type: "text", text: content }];
                } else if (!Array.isArray(content)) {
                    // If content is an object or other non-array type, wrap it in an array
                    content = [content];
                }

                // If the content array is not empty, add cache_control to the last item
                if (content && content.length > 0) {
                    content[content.length - 1].cache_control = {
                        type: "ephemeral",
                    };
                }

                // Update the user message with the modified content
                conversationCopy[i].content = content;
                break;
            }
        }

        return conversationCopy;
    }

    /**
     * Get a completion from Anthropic with retry logic
     * @param {boolean} isCopilot - Whether this is a copilot or autopilot request
     * @param {Array} conversation - The conversation history
     * @param {number} maxTokens - Maximum tokens to generate
     * @param {string} model - Model to use
     * @param {boolean} useCache - Whether to use caching
     * @return {Promise<Array>} - The response content
     */
    async getCUCompletion(
        conversation,
        isCopilot = false,
        maxTokens = 2048,
        model = "claude-3-7-sonnet-20250219",
        useCache = true
    ) {
        await this.initializeClient();

        // Configure retry operation
        const operation = retry.operation({
            retries: this.maxRetries,
            factor: 2,
            minTimeout: this.minWait * 1000,
            maxTimeout: this.maxWait * 1000,
        });

        return new Promise((resolve, reject) => {
            operation.attempt(async (currentAttempt) => {
                try {
                    // Always work with a copy and apply caching if enabled
                    let modifiedConversation;
                    if (useCache) {
                        modifiedConversation =
                            this.addCacheControl(conversation);
                    } else {
                        // Still make a deep copy to ensure we don't modify the original
                        modifiedConversation = JSON.parse(
                            JSON.stringify(conversation)
                        );
                    }

                    const requestOptions = {
                        model,
                        max_tokens: maxTokens,
                        tools: [
                            {
                                type: "computer_20250124",
                                name: "computer",
                                display_width_px: 1024,
                                display_height_px: 768,
                            },
                        ],
                        messages: modifiedConversation,
                        betas: ["computer-use-2025-01-24"],
                        thinking: {
                            type: "enabled",
                            budget_tokens: Math.floor(maxTokens / 2),
                        },
                    };

                    let response;

                    console.log("[LLM] Get response, isCopilot:", isCopilot);
                    if (isCopilot) {
                        response = await this.client.beta.messages.create({
                            system: COPILOT_SYSTEM_PROMPT,
                            ...requestOptions,
                        });
                    } else {
                        response = await this.client.beta.messages.create({
                            system: AUTOPILOT_SYSTEM_PROMPT,
                            ...requestOptions,
                        });
                    }

                    resolve(JSON.parse(JSON.stringify(response.content)));
                } catch (error) {
                    // Only retry on internal server errors
                    if (error.name === "InternalServerError") {
                        console.log(
                            `[LLM] Connection error: ${error.message}. Retrying...`
                        );

                        if (operation.retry(error)) {
                            console.log(
                                `[LLM] Retry attempt ${currentAttempt}/${this.maxRetries} initiated for error: ${error.message}`
                            );
                            return;
                        }
                    }

                    console.log(
                        `[LLM] Error could not be recovered after ${currentAttempt} attempts, rejecting: ${error.message}`
                    );
                    reject(error);
                }
            });
        });
    }
}

export default LLMConnector;
