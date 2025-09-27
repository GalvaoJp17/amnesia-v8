import test from 'node:test';
import assert from 'node:assert/strict';
import { maskText, rehydrateText } from '../src/content/llm/piiGuard.ts';

test('maskText replaces PII with stable placeholders', () => {
  const sample = 'Reach me at jane.doe@example.com or +1 (555) 123-9876.';
  const { sanitized, matches } = maskText(sample);

  assert.ok(!sanitized.includes('jane.doe@example.com'));
  assert.ok(!sanitized.includes('555'));
  assert.ok(/\[\[PII-EMAIL-1\]\]/.test(sanitized));
  assert.ok(matches.length >= 2);

  const restored = rehydrateText(sanitized, matches);
  assert.equal(restored, sample);
});

function rehydrateStreamChunks(chunks: string[], matches: ReturnType<typeof maskText>['matches']) {
  const mapping = new Map(matches.map((item) => [item.token, item.value]));
  const tokenPattern = /\[\[PII-[A-Z]+-\d+\]\]/g;
  let carry = '';
  let output = '';

  for (const chunk of chunks) {
    carry += chunk;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    tokenPattern.lastIndex = 0;
    while ((match = tokenPattern.exec(carry)) !== null) {
      const token = match[0];
      const start = match.index;
      output += carry.slice(lastIndex, start);
      output += mapping.get(token) ?? token;
      lastIndex = start + token.length;
    }
    carry = carry.slice(lastIndex);
    if (carry.length > 32) {
      output += carry.slice(0, carry.length - 32);
      carry = carry.slice(-32);
    }
  }

  if (carry) {
    tokenPattern.lastIndex = 0;
    output += carry.replace(tokenPattern, (token) => mapping.get(token) ?? token);
  }

  return output;
}

test('streaming chunk rehydration handles split tokens', () => {
  const original = 'Prompt contains SSN 123-45-6789 and card 4242 4242 4242 4242.';
  const { sanitized, matches } = maskText(original);

  const midpoint = Math.floor(sanitized.length / 2);
  const chunks = [sanitized.slice(0, midpoint - 3), sanitized.slice(midpoint - 3)];
  const restored = rehydrateStreamChunks(chunks, matches);

  assert.equal(restored, original);
});
