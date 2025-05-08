import { StorageCategoryEnum } from "./enums";

/**
 * Schema defining allowed keys in each storage category
 * Acts as a whitelist for valid storage keys
 */
export const STORAGE_SCHEMA = {
    [StorageCategoryEnum.ApiKeys]: {
        anthropic: {
            description: "Anthropic API key",
            defaultValue: "",
            sensitive: true,
        },
        anthropic_created_at: {
            description: "Creation date for Anthropic API key",
            defaultValue: "",
            sensitive: false,
        },
        openai: {
            description: "OpenAI API key",
            defaultValue: "",
            sensitive: true,
        },
        gemini: {
            description: "Gemini API key",
            defaultValue: "",
            sensitive: true,
        },
    },

    [StorageCategoryEnum.Preferences]: {
        darkMode: {
            description: "Dark mode toggle",
            defaultValue: false,
            sensitive: false,
        },
        fontSize: {
            description: "UI font size",
            defaultValue: "medium",
            sensitive: false,
        },
        sidebarPosition: {
            description: "Sidebar position (left/right)",
            defaultValue: "right",
            sensitive: false,
        },
    },

    [StorageCategoryEnum.UserData]: {
        history: {
            description: "Chat history",
            defaultValue: [],
            sensitive: false,
        },
        pinnedPrompts: {
            description: "Saved/pinned prompts",
            defaultValue: [],
            sensitive: false,
        },
    },
};

/**
 * Check if a key is valid in a category
 * @param {string} category - Storage category
 * @param {string} key - Key to check
 * @returns {boolean} - Whether the key is valid
 */
export function isValidStorageKey(category, key) {
    return (
        STORAGE_SCHEMA[category] !== undefined &&
        STORAGE_SCHEMA[category][key] !== undefined
    );
}

/**
 * Get the default value for a key
 * @param {string} category - Storage category
 * @param {string} key - Storage key
 * @returns {any} - Default value
 */
export function getDefaultValueForKey(category, key) {
    if (!isValidStorageKey(category, key)) {
        throw new Error(`Invalid storage key: ${category}.${key}`);
    }

    return STORAGE_SCHEMA[category][key].defaultValue;
}

/**
 * Check if a key contains sensitive data
 * @param {string} category - Storage category
 * @param {string} key - Storage key
 * @returns {boolean} - Whether the key contains sensitive data
 */
export function isSensitiveKey(category, key) {
    if (!isValidStorageKey(category, key)) {
        throw new Error(`Invalid storage key: ${category}.${key}`);
    }

    return STORAGE_SCHEMA[category][key].sensitive === true;
}

/**
 * Get all allowed keys for a category
 * @param {string} category - Storage category
 * @returns {string[]} - Array of valid keys
 */
export function getKeysForCategory(category) {
    if (!STORAGE_SCHEMA[category]) {
        throw new Error(`Invalid storage category: ${category}`);
    }

    return Object.keys(STORAGE_SCHEMA[category]);
}
