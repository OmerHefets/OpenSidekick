import React, { useState, useEffect } from "react";
import "./Options.css";
import storageManager from "../services/storage/storageManager";
import { StorageCategoryEnum } from "../services/storage/enums";

const Options = () => {
    const [apiKey, setApiKey] = useState("");
    const [savedKey, setSavedKey] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [createdDate, setCreatedDate] = useState("");

    // Load the saved API key when component mounts
    useEffect(() => {
        const loadApiKey = async () => {
            try {
                const key = await storageManager.getValue(
                    StorageCategoryEnum.ApiKeys,
                    "anthropic"
                );

                // Also load creation date if a key exists
                if (key) {
                    const date = await storageManager.getValue(
                        StorageCategoryEnum.ApiKeys,
                        "anthropic_created_at"
                    );
                    setCreatedDate(date || formatCurrentDate());
                }

                setSavedKey(key || "");
            } catch (error) {
                console.error("Error loading API key:", error);
            }
        };

        loadApiKey();
    }, []);

    const formatCurrentDate = () => {
        const date = new Date();
        const month = date.toLocaleString("default", { month: "short" });
        const day = date.getDate();
        const year = date.getFullYear();
        return `${month} ${day}, ${year}`;
    };

    const handleSaveKey = async () => {
        try {
            setIsSaving(true);
            const currentDate = formatCurrentDate();

            await storageManager.setValue(
                StorageCategoryEnum.ApiKeys,
                "anthropic",
                apiKey
            );

            await storageManager.setValue(
                StorageCategoryEnum.ApiKeys,
                "anthropic_created_at",
                currentDate
            );

            setSavedKey(apiKey);
            setCreatedDate(currentDate);
            setApiKey("");
        } catch (error) {
            console.error("Error saving API key:", error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteKey = async () => {
        try {
            setIsSaving(true);
            await storageManager.setValue(
                StorageCategoryEnum.ApiKeys,
                "anthropic",
                ""
            );

            await storageManager.setValue(
                StorageCategoryEnum.ApiKeys,
                "anthropic_created_at",
                ""
            );

            setSavedKey("");
            setCreatedDate("");
        } catch (error) {
            console.error("Error deleting API key:", error);
        } finally {
            setIsSaving(false);
        }
    };

    // Display only the first few characters and last few characters of the API key
    const maskApiKey = (key) => {
        if (!key) return "";
        const prefix = key.substring(0, 8);
        return `${prefix}...`;
    };

    return (
        <div className="options-container">
            <div className="options-layout">
                <aside className="options-sidebar">
                    <div className="brand-logo">OpenSidekick</div>
                    <nav>
                        <ul>
                            <li className="active">API Keys</li>
                        </ul>
                    </nav>
                </aside>
                <main className="options-content">
                    <div className="api-keys-card">
                        <h2>API keys</h2>
                        <p className="api-keys-description">
                            API keys are stored locally and used to power the
                            computer using agent. OpenSidekick currently
                            supports only Anthropic's API.
                        </p>

                        <div className="api-key-form">
                            {!savedKey && (
                                <div className="input-with-button">
                                    <input
                                        type="password"
                                        value={apiKey}
                                        onChange={(e) =>
                                            setApiKey(e.target.value)
                                        }
                                        placeholder="Enter your Anthropic API key"
                                        className="api-key-input"
                                        onKeyDown={(e) => {
                                            if (
                                                e.key === "Enter" &&
                                                apiKey &&
                                                !isSaving
                                            ) {
                                                handleSaveKey();
                                            }
                                        }}
                                    />
                                    <button
                                        onClick={handleSaveKey}
                                        disabled={!apiKey || isSaving}
                                        className="save-button"
                                    >
                                        {isSaving ? "Saving..." : "Save Key"}
                                    </button>
                                </div>
                            )}

                            {savedKey && (
                                <div className="api-keys-table">
                                    <div className="table-header">
                                        <div className="table-cell">KEY</div>
                                        <div className="table-cell">
                                            CREATED AT
                                        </div>
                                        <div className="table-cell">MANAGE</div>
                                    </div>
                                    <div className="table-row">
                                        <div className="table-cell key-cell">
                                            {maskApiKey(savedKey)}
                                        </div>
                                        <div className="table-cell">
                                            {createdDate}
                                        </div>
                                        <div className="table-cell">
                                            <button
                                                onClick={handleDeleteKey}
                                                className="delete-button"
                                            >
                                                Delete Key
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default Options;
