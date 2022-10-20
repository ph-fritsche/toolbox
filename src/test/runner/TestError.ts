import { Test } from "../Test"
import { TestGroup } from "./TestGroup"

export class TestError extends Error {
    constructor(
        readonly context: TestGroup,
        readonly hook: string,
        reason: string|Error,
        readonly test?: Test,
    ) {
        const {message, cause} = typeof reason === 'string'
            ? {message: reason, cause: undefined}
            : reason
        super(message, {cause})
        if (reason instanceof Error) {
            this.stack = reason.stack
        }
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            stack: this.stack,
        }
    }
}
