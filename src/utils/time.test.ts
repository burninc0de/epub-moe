import { describe, it, expect } from 'vitest';
import { formatTime, formatTimeWithMs, parseTimeInput } from './time';

describe('formatTime', () => {
  it('formats minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(61)).toBe('1:01');
    expect(formatTime(90.5)).toBe('1:30');
  });
});

describe('formatTimeWithMs', () => {
  it('includes milliseconds', () => {
    expect(formatTimeWithMs(0)).toBe('0:00.000');
    expect(formatTimeWithMs(61.5)).toBe('1:01.500');
    expect(formatTimeWithMs(65.987)).toBe('1:05.987');
  });
});

describe('parseTimeInput', () => {
  it('parses m:ss input', () => {
    expect(parseTimeInput('1:23')).toBe(83);
    expect(parseTimeInput('1:23.5')).toBe(83.5);
  });

  it('parses plain seconds', () => {
    expect(parseTimeInput('45')).toBe(45);
  });

  it('returns 0 for garbage', () => {
    expect(parseTimeInput('abc')).toBe(0);
  });
});
