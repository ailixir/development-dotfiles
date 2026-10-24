/** Browser-free native dispatch sequencing. Ports retain/validate a private live element; this
 * module never accepts a locator or executes page code. Side effects are never retried. */
export interface NativePoint {
    x: number;
    y: number;
    alreadyChecked: boolean;
}
export interface MouseInput {
    type: 'mouseMoved' | 'mousePressed' | 'mouseReleased';
    x: number;
    y: number;
    button?: 'left';
    clickCount?: number;
}
export interface KeyInput {
    type: 'keyDown' | 'rawKeyDown' | 'keyUp';
    key: string;
    code: string;
    windowsVirtualKeyCode: number;
    text?: string;
    unmodifiedText?: string;
}
export interface NativeInputPort {
    inspect(): Promise<{
        alreadyChecked: boolean;
        requiresReveal: boolean;
    }>;
    revealAndValidate(): Promise<void>;
    focusAndValidate(): Promise<void>;
    point(): Promise<NativePoint>;
    confirmToggle(): Promise<void>;
    mouse(input: MouseInput): Promise<void>;
    key(input: KeyInput): Promise<void>;
}
export type NativeOperation = {
    kind: 'click' | 'check' | 'uncheck' | 'hover';
} | {
    kind: 'press';
    key: 'Enter' | 'Tab' | 'Escape' | 'ArrowDown' | 'ArrowUp';
};
export declare function dispatchNativeInput(operation: NativeOperation, port: NativeInputPort): Promise<void>;
