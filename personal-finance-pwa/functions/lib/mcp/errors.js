"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notPro = exports.McpToolError = void 0;
class McpToolError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'McpToolError';
    }
}
exports.McpToolError = McpToolError;
const notPro = () => new McpToolError('NOT_PRO', 'Spenza for Claude is a Pro feature. Upgrade to Spenza Pro in the app to use it.');
exports.notPro = notPro;
//# sourceMappingURL=errors.js.map