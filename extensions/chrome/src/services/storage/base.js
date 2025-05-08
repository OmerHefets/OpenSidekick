import { encryptionService } from "../security/encryption";
import { StorageEnum } from "./enums";

/**
 * Creates a storage interface with specified options
 * @param {string} key - Storage key
 * @param {any} defaultValue - Default value if no data found
 * @param {Object} options - Storage options
 * @param {StorageEnum} options.storageEnum - Storage type
 * @param {boolean} options.liveUpdate - Whether to listen for updates
 * @param {boolean} options.encryption - Whether to encrypt data
 * @returns {Object} - Storage interface with methods
 */
export function createStorage(key, defaultValue = null, options = {}) {
    const {
        storageEnum = StorageEnum.Local,
        liveUpdate = false,
        encryption = false,
    } = options;

    // Get Chrome storage API
    const storageArea = chrome.storage[storageEnum];

    // Create storage interface
    const storage = {
        /**
         * Get data from storage
         * @returns {Promise<any>} - Stored data or default value
         */
        async get() {
            return new Promise((resolve) => {
                storageArea.get([key], async (result) => {
                    if (chrome.runtime.lastError) {
                        console.error(
                            `[Storage] Error getting ${key}:`,
                            chrome.runtime.lastError
                        );
                        resolve(defaultValue);
                        return;
                    }

                    // If no data found, return default
                    if (result[key] === undefined) {
                        resolve(defaultValue);
                        return;
                    }

                    if (encryption) {
                        try {
                            const decrypted = await encryptionService.decrypt(
                                key,
                                result[key]
                            );
                            resolve(decrypted);
                        } catch (error) {
                            console.error(
                                `[Storage] Decryption error for key ${key}:`,
                                error
                            );
                            resolve(defaultValue);
                        }
                    } else {
                        resolve(result[key]);
                    }
                });
            });
        },

        /**
         * Set data in storage
         * @param {any} data - Data to store
         * @returns {Promise<void>}
         */
        async set(data) {
            return new Promise(async (resolve) => {
                let valueToStore = data;

                if (encryption) {
                    try {
                        valueToStore = await encryptionService.encrypt(
                            key,
                            data
                        );
                    } catch (error) {
                        console.error(
                            `[Storage] Encryption error for key ${key}:`,
                            error
                        );
                        resolve();
                        return;
                    }
                }

                // Store in Chrome storage
                storageArea.set({ [key]: valueToStore }, () => {
                    if (chrome.runtime.lastError) {
                        console.error(
                            `[Storage] Error setting key ${key}:`,
                            chrome.runtime.lastError
                        );
                        resolve();
                        return;
                    }

                    resolve();
                });
            });
        },

        /**
         * Remove data from storage
         * @returns {Promise<void>}
         */
        async remove() {
            return new Promise((resolve) => {
                storageArea.remove(key, () => {
                    if (chrome.runtime.lastError) {
                        console.error(
                            `[Storage] Error removing key ${key}:`,
                            chrome.runtime.lastError
                        );
                        resolve();
                        return;
                    }
                    resolve();
                });
            });
        },

        /**
         * Clear all storage (use with caution)
         * @returns {Promise<void>}
         */
        async clear() {
            return new Promise((resolve) => {
                storageArea.clear(() => {
                    if (chrome.runtime.lastError) {
                        console.error(
                            "[Storage] Error clearing storage:",
                            chrome.runtime.lastError
                        );
                        resolve();
                        return;
                    }
                    resolve();
                });
            });
        },
    };

    return storage;
}
