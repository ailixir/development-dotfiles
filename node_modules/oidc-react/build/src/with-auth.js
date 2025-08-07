"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withAuth = withAuth;
var use_auth_1 = require("./use-auth");
var react_1 = __importDefault(require("react"));
/**
 * A public higher-order component to access the imperative API
 */
function withAuth(Component) {
    var _a;
    var displayName = "withAuth(".concat((_a = Component.displayName) !== null && _a !== void 0 ? _a : Component.name, ")");
    var C = function (props) {
        var auth = (0, use_auth_1.useAuth)();
        return react_1.default.createElement(Component, __assign({}, props, auth));
    };
    C.displayName = displayName;
    return C;
}
//# sourceMappingURL=with-auth.js.map