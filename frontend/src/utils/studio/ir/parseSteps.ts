import type { StepIR, TestIR } from '@/types/studio/legacyTestIr';

let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export function parsePlainStepsToIR(lines: string[]): StepIR[] {
  return lines.map((line, index) => {
    const text = line.trim();
    const lower = text.toLowerCase();

    // Go to URL
    if (lower.startsWith('go to ') || lower.startsWith('navigate to ')) {
      const url = text.replace(/^go to\s+|^navigate to\s+/i, '').replace(/^"|"$/g, '');
      return { id: nextId('go'), index, originalText: line, type: 'go_to', url } as StepIR;
    }

    // Click
    if (lower.startsWith('click')) {
      // Click "Login" button
      const m = text.match(/click\s+"(.+?)"/i);
      const targetText = m ? m[1] : undefined;
      return { id: nextId('click'), index, originalText: line, type: 'click', targetText } as StepIR;
    }

    // Type
    if (lower.startsWith('type')) {
      // Type "foo" in the "User ID" field
      const valueMatch = text.match(/type\s+"(.+?)"/i);
      const fieldMatch = text.match(/in\s+the\s+"(.+?)"/i);
      const rawVal = valueMatch ? valueMatch[1] : '';
      const targetFieldText = fieldMatch ? fieldMatch[1] : undefined;
      // Recognize token formats: <var NAME> or <secret SECRET_ID>
      const varToken = rawVal.match(/^<var\s+([A-Z0-9_\-]+)>$/i);
      const secretToken = rawVal.match(/^<secret\s+([A-Za-z0-9_\-]+)>$/i);
      const value = secretToken
        ? { secretId: secretToken[1] }
        : varToken
        ? { varName: varToken[1] }
        : { raw: rawVal };
      return {
        id: nextId('type'),
        index,
        originalText: line,
        type: 'type',
        targetFieldText,
        value,
      } as StepIR;
    }

    // Wait for text
    if (lower.startsWith('wait for')) {
      const m = text.match(/wait for\s+the\s+text\s+"(.+?)"/i) || text.match(/wait for\s+"(.+?)"/i);
      const toWait = m ? m[1] : text.replace(/^wait for\s+/i, '');
      return { id: nextId('wait'), index, originalText: line, type: 'wait_for_text', text: toWait } as StepIR;
    }

    // Check URL contains
    if (lower.startsWith('check that the url contains') || lower.startsWith('check url contains')) {
      const m = text.match(/contains\s+"(.+?)"/i);
      const substr = m ? m[1] : text.replace(/.*contains\s+/i, '');
      return { id: nextId('url'), index, originalText: line, type: 'check_url_contains', substring: substr } as StepIR;
    }

    // Fallback: mark as wait_for_text for now
    return { id: nextId('unknown'), index, originalText: line, type: 'wait_for_text', text: text } as StepIR;
  });
}

export function buildDefaultTestIR(name: string, stepsLines: string[]): TestIR {
  return {
    meta: { name },
    environment: 'Development',
    configuration: {
      browser: 'chrome',
      viewport: { width: 1920, height: 1080 },
      timeout: 30000,
      waitStrategy: 'networkidle',
    },
    variables: [],
    steps: parsePlainStepsToIR(stepsLines),
  };
}


