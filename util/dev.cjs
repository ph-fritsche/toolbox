const { expect } = require('expect')
const mock = require('jest-mock')
const { test, describe, after, afterEach, before, beforeEach } = require('node:test')

global.expect = expect
global.mock = mock

global.test = test
global.describe = describe
global.afterAll = after
global.afterEach = afterEach
global.beforeAll = before
global.beforeEach = beforeEach
