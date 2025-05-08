import { state } from "../state";
import LLMConnector from "./llm";

/**
 * LLMPolicy class for processing trajectories through the LLM
 */
class PolicyEngine {
    /**
     * Initialize the LLMPolicy
     * @param {string} llm - The LLM model name
     */
    constructor(llm) {
        this.llm = llm;
        this.model = new LLMConnector();

        console.log("[PolicyEngine] Initialized policy engine");
    }

    /**
     * Process a trajectory through the LLM
     * @param {Array} trajectory - The trajectory to process
     * @return {Promise<Array>} - The processed trajectory
     */
    async process(trajectory) {
        console.log("[PolicyEngine] Processing trajectory:", trajectory);
        return this.model.getCUCompletion(trajectory, state.isCopilotMode);
    }
}

export default PolicyEngine;
