export class TestError extends Error {
    constructor(
        props: Pick<TestError, 'cause'|'message'|'name'|'stack'>,
    ) {
        super(props.message, {cause: props.cause})
        this.name = props.name
        this.message = props.message
        this.stack = props.stack
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            stack: this.stack,
        }
    }
}
