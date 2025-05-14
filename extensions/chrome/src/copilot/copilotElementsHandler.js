import React from "react";
import { createRoot } from "react-dom/client";
import Marker from "./Marker";
import Snackbar from "./Snackbar";

/**
 * Handler class for managing Copilot UI elements
 * Responsible for adding and removing marker elements and snackbars to guide the user
 */
class CopilotElementsHandler {
    constructor() {
        // Create a container for all copilot elements
        this.container = document.createElement("div");
        this.container.id = "opensidekick-elements-container";
        this.container.style.position = "absolute";
        this.container.style.top = "0";
        this.container.style.left = "0";
        this.container.style.width = "100%";
        this.container.style.height = "100%";
        this.container.style.pointerEvents = "none";
        this.container.style.zIndex = "9999";

        // A map to keep track of all active markers and their React roots
        this.markers = new Map();

        // Store snackbar-related references
        this.snackbar = null;

        // Counter for generating unique IDs
        this.markerIdCounter = 0;
    }

    /**
     * Initialize the handler by appending the container to the DOM
     */
    init() {
        document.body.appendChild(this.container);
        console.log("CopilotElementsHandler initialized");
    }

    /**
     * Insert a marker at the specified coordinates
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {string} ID of the created marker
     */
    insertMarker(x, y) {
        const markerId = `copilot-marker-${this.markerIdCounter++}`;

        // Create a new div for this specific marker
        const markerContainer = document.createElement("div");
        markerContainer.id = `container-${markerId}`;
        markerContainer.style.pointerEvents = "none";
        this.container.appendChild(markerContainer);

        // Create a React root for this marker
        const root = createRoot(markerContainer);

        // Render the Marker component into the root
        root.render(<Marker x={x} y={y} id={markerId} />);

        // Store references to both the container and root
        this.markers.set(markerId, { container: markerContainer, root });

        console.log(`Marker inserted at (${x}, ${y}) with ID: ${markerId}`);
        return markerId;
    }

    /**
     * Delete a specific marker by ID
     * @param {string} markerId - ID of the marker to delete
     * @returns {boolean} Whether the deletion was successful
     */
    deleteMarker(markerId) {
        const marker = this.markers.get(markerId);

        if (marker) {
            // Unmount the React component by calling root.unmount()
            marker.root.unmount();

            // Remove the container element from the DOM
            this.container.removeChild(marker.container);

            // Remove from our tracking map
            this.markers.delete(markerId);

            console.log(`Marker with ID: ${markerId} deleted`);
            return true;
        }

        console.warn(`Marker with ID: ${markerId} not found`);
        return false;
    }

    /**
     * Delete all markers
     */
    deleteAllMarkers() {
        for (const markerId of this.markers.keys()) {
            this.deleteMarker(markerId);
        }
        console.log("All markers deleted");
    }

    /**
     * Show a snackbar with the specified text and type
     * @param {string} text - Text to display in the snackbar
     * @param {string} type - Type of snackbar (info, success, warning, error)
     * @returns {string} ID of the created snackbar
     */
    showSnackbar(text, type = "regular") {
        // If there's already a snackbar, remove it first
        if (this.snackbar) {
            this.hideSnackbar();
        }

        const snackbarId = "copilot-snackbar";

        // Create a new div for the snackbar
        const snackbarContainer = document.createElement("div");
        snackbarContainer.id = `container-${snackbarId}`;
        this.container.appendChild(snackbarContainer);

        // Create a React root for the snackbar
        const root = createRoot(snackbarContainer);

        // Render the Snackbar component into the root
        root.render(<Snackbar text={text} type={type} id={snackbarId} />);

        // Store references to both the container and root
        this.snackbar = { container: snackbarContainer, root, id: snackbarId };

        console.log(`Snackbar displayed with type: ${type} and text: ${text}`);
        return snackbarId;
    }

    /**
     * Hide the currently displayed snackbar
     * @returns {boolean} Whether the operation was successful
     */
    hideSnackbar() {
        if (this.snackbar) {
            // Unmount the React component by calling root.unmount()
            this.snackbar.root.unmount();

            // Remove the container element from the DOM
            this.container.removeChild(this.snackbar.container);

            // Clear the reference
            const snackbarId = this.snackbar.id;
            this.snackbar = null;

            console.log(`Snackbar with ID: ${snackbarId} hidden`);
            return true;
        }

        console.warn("No active snackbar to hide");
        return false;
    }

    /**
     * Clean up when no longer needed
     */
    cleanup() {
        this.deleteAllMarkers();
        if (this.snackbar) {
            this.hideSnackbar();
        }
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        console.log("CopilotElementsHandler cleaned up");
    }
}

export default CopilotElementsHandler;
