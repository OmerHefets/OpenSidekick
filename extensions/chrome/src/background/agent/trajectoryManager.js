/**
 * Manages the conversation trajectory for the agent
 */
export class TrajectoryManager {
    /**
     * Initialize a new TrajectoryManager
     */
    constructor() {
        this.trajectory = [];
        console.log("[TrajectoryManager] Trajectory manager initialized");
    }

    /**
     * Append a new message to the trajectory
     * @param {Object} message - Message to append to the trajectory
     */
    append(message) {
        console.log("[TrajectoryManager] Add message to trajectory:", message);
        this.trajectory.push(message);
    }

    /**
     * Get the current trajectory
     * @returns {Array} The current trajectory array
     */
    get() {
        return this.trajectory;
    }

    /**
     * Reset the trajectory to empty state
     */
    reset() {
        this.trajectory = [];
        console.log("[TrajectoryManager] Trajectory reset:", this.trajectory);
    }

    /**
     * Clean the latest action in a stop condition
     * Removes any computer-related blocks from the last assistant message
     * If no content remains, removes the message entirely
     */
    cleanupLastAction() {
        console.log("[TrajectoryManager] Cleaning up last action");

        // Check if there's a trajectory and the last message is from the assistant
        if (
            this.trajectory.length > 0 &&
            this.trajectory[this.trajectory.length - 1].role === "assistant"
        ) {
            const lastMessage = this.trajectory[this.trajectory.length - 1];
            const originalContentLength = lastMessage.content.length;

            console.log(
                `[TrajectoryManager] Last message role: ${lastMessage.role}, content blocks: ${originalContentLength}`
            );

            // Filter out computer blocks from the content
            lastMessage.content = lastMessage.content.filter(
                (block) =>
                    !(typeof block === "object" && block.name === "computer")
            );

            const remainingContentLength = lastMessage.content.length;
            console.log(
                `[TrajectoryManager] Filtered computer blocks. Original blocks: ${originalContentLength}, remaining: ${remainingContentLength}`
            );

            // If no content remains, remove the message entirely
            if (remainingContentLength === 0) {
                this.trajectory.pop();
                console.log(
                    "[TrajectoryManager] Removed empty message from trajectory"
                );
            }
        } else {
            console.log(
                "[TrajectoryManager] No assistant message to clean up or trajectory is empty"
            );
        }
    }
}

/**
 * Represents action data with a name and parameters
 */
export class ActionData {
    /**
     * Create a new ActionData instance
     * @param {string} name - The name of the action
     * @param {Object} params - Parameters for the action
     */
    constructor(name, params = {}) {
        this.name = name;
        this.params = params;
    }
}
