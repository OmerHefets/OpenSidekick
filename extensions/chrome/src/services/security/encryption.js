/**
 * Provides encryption/decryption services using Web Crypto API
 */
class EncryptionService {
    constructor() {
        this.keyPrefix = "sidekick-extension-";
    }

    /**
     * Generate encryption key from storage key
     * @param {string} storageKey - Storage key to derive encryption key from
     * @returns {Promise<CryptoKey>} - Encryption key
     */
    async getEncryptionKey(storageKey) {
        // Create key material from extension ID and storage key
        const keyMaterial =
            this.keyPrefix + chrome.runtime.id + "-" + storageKey;
        const encoder = new TextEncoder();
        const data = encoder.encode(keyMaterial);

        // Generate a key using SHA-256 and AES-GCM
        const hash = await crypto.subtle.digest("SHA-256", data);
        const key = await crypto.subtle.importKey(
            "raw",
            hash,
            { name: "AES-GCM" },
            false, // Non-extractable
            ["encrypt", "decrypt"]
        );

        return key;
    }

    /**
     * Encrypt data
     * @param {string} storageKey - Storage key (for key derivation)
     * @param {any} data - Data to encrypt
     * @returns {Promise<string>} - Encrypted data as string
     */
    async encrypt(storageKey, data) {
        const key = await this.getEncryptionKey(storageKey);
        const jsonString = JSON.stringify(data);
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(jsonString);

        // Generate random initialization vector
        const iv = crypto.getRandomValues(new Uint8Array(12));

        const encryptedBuffer = await crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv,
            },
            key,
            dataBuffer
        );

        const result = {
            iv: Array.from(iv),
            data: Array.from(new Uint8Array(encryptedBuffer)),
        };

        return JSON.stringify(result);
    }

    /**
     * Decrypt data
     * @param {string} storageKey - Storage key (for key derivation)
     * @param {string} encryptedString - Encrypted data
     * @returns {Promise<any>} - Decrypted data
     */
    async decrypt(storageKey, encryptedString) {
        const key = await this.getEncryptionKey(storageKey);
        const { iv, data } = JSON.parse(encryptedString);

        // Convert arrays back to typed arrays
        const ivArray = new Uint8Array(iv);
        const dataArray = new Uint8Array(data);

        const decryptedBuffer = await crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: ivArray,
            },
            key,
            dataArray
        );

        const decoder = new TextDecoder();
        const jsonString = decoder.decode(decryptedBuffer);
        return JSON.parse(jsonString);
    }
}

// Export singleton instance
export const encryptionService = new EncryptionService();
