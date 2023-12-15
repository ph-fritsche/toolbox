import { transpileCjsToEsm } from '#src/loader/transpileCjsToEsm'

for (const [name, input, expected] of [
    [
        'require to named import',
        `
const { foo, bar } = require('baz');
        `,
        `
import baz from "baz";
const { foo, bar } = baz;
export default {};
        `,
    ],
    [
        'require to default import',
        `
const foo = require('bar');
        `,
        `
import foo from "bar";
export default {};
        `,
    ],
    [
        'require to side-effect import',
        `
require('foo');
        `,
        `
import "foo";
export default {};
        `,
    ],
    [
        'module.exports property to named and default export',
        `
module.exports.foo = 'bar';
        `,
        `
export const foo = 'bar';
export default { foo };
        `,
    ],
    [
        'module.exports object to named and default export',
        `
const foo = 'bar', bar = 'baz';
module.exports = { foo, bar }
        `,
        `
const foo = 'bar', bar = 'baz';
export { foo };
export { bar };
export default {
    foo,
    bar
};
        `,
    ],
    [
        'module.exports non-object to default export',
        `
module.exports = 'foo';
        `,
        `
export default 'foo';
        `,
    ],
]) {
    test(`transpile ${name}`, async () => {
        expect(transpileCjsToEsm(
            input.trim().concat('\n'),
            '/project/file.js',
            {
                cjsToEsmOptions: {
                    cwd: '/project',
                    fileSystem: {
                        lstatSync() {
                            throw undefined
                        },
                        readdirSync() {
                            throw undefined
                        },
                        readFileSync() {
                            throw undefined
                        },
                        statSync() {
                            throw undefined
                        },
                    },
                },
            },
        ).code).toBe(expected.trim().concat('\n'))
    })
}
