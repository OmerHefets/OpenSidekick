import { ActionData } from "./trajectoryManager";

/**
 * Parser for processing different input formats
 */
export class Parser {
    /**
     * Convert Anthropic model input to ActionData
     * @param {Object} inputDict - Input dictionary with 'action' and other fields
     * @returns {ActionData} - Structured action data
     */
    convertToActionData(inputDict) {
        if (!inputDict || !inputDict.action) {
            throw new Error("Input must contain an 'action' field");
        }

        const name = inputDict.action;

        // Create a copy of the input dictionary without the action field
        const params = { ...inputDict };
        delete params.action;

        return new ActionData(name, params);
    }
}
