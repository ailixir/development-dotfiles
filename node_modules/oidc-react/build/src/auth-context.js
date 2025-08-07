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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthProvider = exports.initUserManager = exports.hasCodeInUrl = exports.AuthContext = void 0;
var react_1 = __importStar(require("react"));
var oidc_client_ts_1 = require("oidc-client-ts");
exports.AuthContext = react_1.default.createContext(undefined);
/**
 * @private
 * @hidden
 * @param location
 */
var hasCodeInUrl = function (location) {
    var searchParams = new URLSearchParams(location.search);
    var hashParams = new URLSearchParams(location.hash.replace('#', '?'));
    return (searchParams.has('code') ||
        searchParams.has('id_token') ||
        searchParams.has('session_state') ||
        hashParams.has('code') ||
        hashParams.has('id_token') ||
        hashParams.has('session_state'));
};
exports.hasCodeInUrl = hasCodeInUrl;
/**
 * @private
 * @hidden
 * @param props
 */
var initUserManager = function (props) {
    if (props.userManager) {
        return props.userManager;
    }
    var authority = props.authority, clientId = props.clientId, clientSecret = props.clientSecret, redirectUri = props.redirectUri, silentRedirectUri = props.silentRedirectUri, postLogoutRedirectUri = props.postLogoutRedirectUri, responseType = props.responseType, scope = props.scope, automaticSilentRenew = props.automaticSilentRenew, loadUserInfo = props.loadUserInfo, popupWindowFeatures = props.popupWindowFeatures, popupRedirectUri = props.popupRedirectUri, popupWindowTarget = props.popupWindowTarget, extraQueryParams = props.extraQueryParams, metadata = props.metadata;
    return new oidc_client_ts_1.UserManager({
        authority: authority !== null && authority !== void 0 ? authority : '',
        client_id: clientId !== null && clientId !== void 0 ? clientId : '',
        client_secret: clientSecret,
        redirect_uri: redirectUri !== null && redirectUri !== void 0 ? redirectUri : '',
        silent_redirect_uri: silentRedirectUri !== null && silentRedirectUri !== void 0 ? silentRedirectUri : redirectUri,
        post_logout_redirect_uri: postLogoutRedirectUri !== null && postLogoutRedirectUri !== void 0 ? postLogoutRedirectUri : redirectUri,
        response_type: responseType !== null && responseType !== void 0 ? responseType : 'code',
        scope: scope !== null && scope !== void 0 ? scope : 'openid',
        loadUserInfo: loadUserInfo !== null && loadUserInfo !== void 0 ? loadUserInfo : true,
        popupWindowFeatures: popupWindowFeatures,
        popup_redirect_uri: popupRedirectUri,
        popupWindowTarget: popupWindowTarget,
        automaticSilentRenew: automaticSilentRenew,
        extraQueryParams: extraQueryParams,
        metadata: metadata,
    });
};
exports.initUserManager = initUserManager;
/**
 *
 * @param props AuthProviderProps
 */
var AuthProvider = function (_a) {
    var children = _a.children, _b = _a.autoSignIn, autoSignIn = _b === void 0 ? true : _b, autoSignInArgs = _a.autoSignInArgs, _c = _a.autoSignOut, autoSignOut = _c === void 0 ? true : _c, autoSignOutArgs = _a.autoSignOutArgs, onBeforeSignIn = _a.onBeforeSignIn, onSignIn = _a.onSignIn, onSignOut = _a.onSignOut, _d = _a.location, location = _d === void 0 ? window.location : _d, onSignInError = _a.onSignInError, props = __rest(_a, ["children", "autoSignIn", "autoSignInArgs", "autoSignOut", "autoSignOutArgs", "onBeforeSignIn", "onSignIn", "onSignOut", "location", "onSignInError"]);
    var _e = (0, react_1.useState)(true), isLoading = _e[0], setIsLoading = _e[1];
    var _f = (0, react_1.useState)(null), userData = _f[0], setUserData = _f[1];
    var userManager = (0, react_1.useState)(function () { return (0, exports.initUserManager)(props); })[0];
    var isMountedRef = (0, react_1.useRef)(false);
    var signOutHooks = (0, react_1.useCallback)(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    setUserData(null);
                    if (!onSignOut) return [3 /*break*/, 2];
                    return [4 /*yield*/, onSignOut()];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2: return [2 /*return*/];
            }
        });
    }); }, [onSignOut]);
    var signInPopupHooks = (0, react_1.useCallback)(function () { return __awaiter(void 0, void 0, void 0, function () {
        var userFromPopup;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, userManager.signinPopup()];
                case 1:
                    userFromPopup = _a.sent();
                    setUserData(userFromPopup);
                    if (!onSignIn) return [3 /*break*/, 3];
                    return [4 /*yield*/, onSignIn(userFromPopup)];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [4 /*yield*/, userManager.signinPopupCallback()];
                case 4:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); }, [userManager, onSignIn]);
    /**
     * Handles user auth flow on initial render.
     */
    (0, react_1.useEffect)(function () {
        var isMounted = true;
        isMountedRef.current = true;
        setIsLoading(true);
        void (function () { return __awaiter(void 0, void 0, void 0, function () {
            var user, user_1, error_1, state;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!userManager) {
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, userManager.getUser()];
                    case 1:
                        user = _a.sent();
                        if (!(isMounted && (!user || user.expired))) return [3 /*break*/, 11];
                        if (!(0, exports.hasCodeInUrl)(location)) return [3 /*break*/, 8];
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 6, , 7]);
                        return [4 /*yield*/, userManager.signinCallback()];
                    case 3:
                        user_1 = _a.sent();
                        if (!user_1) return [3 /*break*/, 5];
                        setUserData(user_1);
                        if (!onSignIn) return [3 /*break*/, 5];
                        return [4 /*yield*/, onSignIn(user_1)];
                    case 4:
                        _a.sent();
                        _a.label = 5;
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        error_1 = _a.sent();
                        if (onSignInError) {
                            onSignInError(error_1);
                        }
                        else {
                            throw error_1;
                        }
                        return [3 /*break*/, 7];
                    case 7: return [3 /*break*/, 10];
                    case 8:
                        if (!autoSignIn) return [3 /*break*/, 10];
                        state = onBeforeSignIn ? onBeforeSignIn() : undefined;
                        return [4 /*yield*/, userManager.signinRedirect(__assign(__assign({}, autoSignInArgs), { state: state }))];
                    case 9:
                        _a.sent();
                        _a.label = 10;
                    case 10: return [3 /*break*/, 12];
                    case 11:
                        if (isMountedRef.current) {
                            setUserData(user);
                        }
                        _a.label = 12;
                    case 12:
                        setIsLoading(false);
                        return [2 /*return*/];
                }
            });
        }); })();
        return function () {
            isMounted = false;
            isMountedRef.current = false;
        };
    }, [
        location,
        userManager,
        autoSignIn,
        onBeforeSignIn,
        onSignIn,
        onSignInError,
    ]);
    /**
     * Registers UserManager event callbacks for handling changes to user state due to automaticSilentRenew, session expiry, etc.
     */
    (0, react_1.useEffect)(function () {
        var updateUserData = function (user) {
            if (isMountedRef.current) {
                setUserData(user);
            }
        };
        var onSilentRenewError = function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!autoSignOut) return [3 /*break*/, 3];
                        return [4 /*yield*/, signOutHooks()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, userManager.signoutRedirect(autoSignOutArgs)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3: return [2 /*return*/];
                }
            });
        }); };
        userManager.events.addUserLoaded(updateUserData);
        userManager.events.addSilentRenewError(onSilentRenewError);
        return function () {
            userManager.events.removeUserLoaded(updateUserData);
            userManager.events.removeSilentRenewError(onSilentRenewError);
        };
    }, [userManager]);
    var value = (0, react_1.useMemo)(function () {
        return {
            signIn: function (args) { return __awaiter(void 0, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, userManager.signinRedirect(args)];
                        case 1:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            }); },
            signInPopup: function () { return __awaiter(void 0, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, signInPopupHooks()];
                        case 1:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            }); },
            signOut: function () { return __awaiter(void 0, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, userManager.removeUser()];
                        case 1:
                            _a.sent();
                            return [4 /*yield*/, signOutHooks()];
                        case 2:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            }); },
            signOutRedirect: function (args) { return __awaiter(void 0, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, userManager.signoutRedirect(args)];
                        case 1:
                            _a.sent();
                            return [4 /*yield*/, signOutHooks()];
                        case 2:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            }); },
            userManager: userManager,
            userData: userData,
            isLoading: isLoading,
        };
    }, [userManager, isLoading, userData, signInPopupHooks, signOutHooks]);
    return react_1.default.createElement(exports.AuthContext.Provider, { value: value }, children);
};
exports.AuthProvider = AuthProvider;
//# sourceMappingURL=auth-context.js.map