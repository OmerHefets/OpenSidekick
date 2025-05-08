import { createStorage } from "./base";
import { StorageEnum, StorageCategoryEnum } from "./enums";
import {
    STORAGE_SCHEMA,
    isValidStorageKey,
    getDefaultValueForKey,
    isSensitiveKey,
    getKeysForCategory,
} from "./schema";

/**
 * Central manager for storage operations
 * Handles organization, encryption, and validation
 */
class StorageManager {
    constructor() {
        this.categoryStores = {};
        this.initialized = false;
        console.log("[StorageManager] Created new instance");
    }

    /**
     * Initialize storage for all categories
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.initialized) {
            return;
        }

        for (const category of Object.values(StorageCategoryEnum)) {
            const shouldAlwaysEncrypt =
                category === StorageCategoryEnum.ApiKeys;

            this.categoryStores[category] = createStorage(
                category,
                {}, // Empty object as default
                {
                    storageEnum: StorageEnum.Local,
                    liveUpdate: true,
                    encryption: shouldAlwaysEncrypt,
                }
            );
        }

        this.initialized = true;
    }

    /**
     * Get a value from storage
     * @param {string} category - Storage category
     * @param {string} key - Storage key
     * @returns {Promise<any>} - Stored value or default
     */
    async getValue(category, key) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!isValidStorageKey(category, key)) {
            console.error(
                `[StorageManager] Invalid storage key: ${category}.${key}`
            );
            throw new Error(`Invalid storage key: ${category}.${key}`);
        }

        const categoryData = (await this.categoryStores[category].get()) || {};

        return categoryData[key] !== undefined
            ? categoryData[key]
            : getDefaultValueForKey(category, key);
    }

    /**
     * Set a value in storage
     * @param {string} category - Storage category
     * @param {string} key - Storage key
     * @param {any} value - Value to store
     * @returns {Promise<void>}
     */
    async setValue(category, key, value) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!isValidStorageKey(category, key)) {
            console.error(
                `[StorageManager] Invalid storage key: ${category}.${key}`
            );
            throw new Error(`Invalid storage key: ${category}.${key}`);
        }

        const categoryData = (await this.categoryStores[category].get()) || {};

        const updatedData = {
            ...categoryData,
            [key]: value,
        };

        await this.categoryStores[category].set(updatedData);
    }

    /**
     * Get all values for a category
     * @param {string} category - Storage category
     * @returns {Promise<Object>} - All values in the category
     */
    async getCategoryValues(category) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!STORAGE_SCHEMA[category]) {
            console.error(
                `[StorageManager] Invalid storage category: ${category}`
            );
            throw new Error(`Invalid storage category: ${category}`);
        }

        const storedData = (await this.categoryStores[category].get()) || {};
        const result = {};
        const keys = getKeysForCategory(category);

        for (const key of keys) {
            result[key] =
                storedData[key] !== undefined
                    ? storedData[key]
                    : getDefaultValueForKey(category, key);
        }

        return result;
    }

    /**
     * Remove a specific value
     * @param {string} category - Storage category
     * @param {string} key - Storage key
     * @returns {Promise<void>}
     */
    async removeValue(category, key) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!isValidStorageKey(category, key)) {
            console.error(
                `[StorageManager] Invalid storage key: ${category}.${key}`
            );
            throw new Error(`Invalid storage key: ${category}.${key}`);
        }

        const categoryData = (await this.categoryStores[category].get()) || {};

        if (categoryData[key] === undefined) {
            return;
        }

        const { [key]: removed, ...updatedData } = categoryData;

        await this.categoryStores[category].set(updatedData);
    }

    /**
     * Clear all values in a category
     * @param {string} category - Storage category
     * @returns {Promise<void>}
     */
    async clearCategory(category) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!STORAGE_SCHEMA[category]) {
            console.error(
                `[StorageManager] Invalid storage category: ${category}`
            );
            throw new Error(`Invalid storage category: ${category}`);
        }

        await this.categoryStores[category].set({});
    }
}

// Create a singleton instance
const storageManager = new StorageManager();

export default storageManager;
