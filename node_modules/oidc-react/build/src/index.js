"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebStorageStateStore = exports.Log = exports.UserManager = exports.User = void 0;
__exportStar(require("./use-auth"), exports);
__exportStar(require("./with-auth"), exports);
__exportStar(require("./auth-context"), exports);
__exportStar(require("./auth-context-interface"), exports);
var oidc_client_ts_1 = require("oidc-client-ts");
Object.defineProperty(exports, "User", { enumerable: true, get: function () { return oidc_client_ts_1.User; } });
Object.defineProperty(exports, "UserManager", { enumerable: true, get: function () { return oidc_client_ts_1.UserManager; } });
Object.defineProperty(exports, "Log", { enumerable: true, get: function () { return oidc_client_ts_1.Log; } });
Object.defineProperty(exports, "WebStorageStateStore", { enumerable: true, get: function () { return oidc_client_ts_1.WebStorageStateStore; } });
//# sourceMappingURL=index.js.map