export async function dispatchNativeInput(operation, port) {
    let inputStarted = false;
    try {
        const state = await port.inspect();
        if (state.alreadyChecked)
            return;
        if (state.requiresReveal) {
            inputStarted = true;
            await port.revealAndValidate();
        }
        if (operation.kind === 'press') {
            inputStarted = true; // Focus can run application handlers, even before the key is sent.
            await port.focusAndValidate();
            const key = operation.key;
            const code = { Enter: 13, Tab: 9, Escape: 27, ArrowDown: 40, ArrowUp: 38 }[key];
            await port.key({ type: key === 'Enter' ? 'keyDown' : 'rawKeyDown', key, code: key, windowsVirtualKeyCode: code, ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
            await port.key({ type: 'keyUp', key, code: key, windowsVirtualKeyCode: code });
            return;
        }
        const point = await port.point();
        if (point.alreadyChecked)
            return;
        inputStarted = true;
        await port.mouse({ type: 'mouseMoved', x: point.x, y: point.y });
        if (operation.kind === 'hover')
            return; // Hover's intended state change is not a stale-target error.
        const recheck = async () => { const latest = await port.point(); if (latest.x !== point.x || latest.y !== point.y)
            throw new Error('UNKNOWN_OUTCOME'); };
        await recheck();
        await port.mouse({ type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
        await recheck();
        await port.mouse({ type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
        if (operation.kind === 'check' || operation.kind === 'uncheck')
            await port.confirmToggle();
    }
    catch {
        throw new Error(inputStarted ? 'UNKNOWN_OUTCOME' : 'TARGET_CHANGED');
    }
}
//# sourceMappingURL=nativeInput.js.map