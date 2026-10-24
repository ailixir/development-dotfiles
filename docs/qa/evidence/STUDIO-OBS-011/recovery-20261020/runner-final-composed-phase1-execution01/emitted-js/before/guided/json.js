/** Bounded wire JSON parser: native JSON.parse alone loses duplicate keys and replaces bad UTF-8. */
export function parseWireJson(bytes) {
    try {
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        let index = 0;
        const whitespace = () => { while (/[\x20\t\r\n]/u.test(text[index] ?? 'x'))
            index++; };
        const string = () => {
            const start = index++;
            while (index < text.length) {
                const character = text[index++];
                if (character === '\\') {
                    index++;
                    continue;
                }
                if (character === '"') {
                    const value = JSON.parse(text.slice(start, index));
                    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))
                        throw new Error();
                    return value;
                }
            }
            throw new Error();
        };
        const value = (depth) => {
            if (depth > 64)
                throw new Error();
            whitespace();
            const character = text[index];
            if (character === '"')
                return string();
            if (character === '{') {
                index++;
                whitespace();
                const result = {};
                if (text[index] === '}') {
                    index++;
                    return result;
                }
                for (;;) {
                    whitespace();
                    if (text[index] !== '"')
                        throw new Error();
                    const key = string();
                    if (Object.hasOwn(result, key))
                        throw new Error();
                    whitespace();
                    if (text[index++] !== ':')
                        throw new Error();
                    Object.defineProperty(result, key, { value: value(depth + 1), enumerable: true, writable: true, configurable: true });
                    whitespace();
                    const separator = text[index++];
                    if (separator === '}')
                        return result;
                    if (separator !== ',')
                        throw new Error();
                }
            }
            if (character === '[') {
                index++;
                whitespace();
                const result = [];
                if (text[index] === ']') {
                    index++;
                    return result;
                }
                for (;;) {
                    result.push(value(depth + 1));
                    whitespace();
                    const separator = text[index++];
                    if (separator === ']')
                        return result;
                    if (separator !== ',')
                        throw new Error();
                }
            }
            for (const [literal, result] of [['true', true], ['false', false], ['null', null]])
                if (text.startsWith(literal, index)) {
                    index += literal.length;
                    return result;
                }
            const match = /^-?(?:0|[1-9][0-9]*)/u.exec(text.slice(index));
            if (!match)
                throw new Error();
            index += match[0].length;
            const number = Number(match[0]);
            if (!Number.isSafeInteger(number) || Object.is(number, -0))
                throw new Error();
            return number;
        };
        const result = value(0);
        whitespace();
        if (index !== text.length)
            throw new Error();
        return result;
    }
    catch {
        throw new Error('SCHEMA');
    }
}
//# sourceMappingURL=json.js.map