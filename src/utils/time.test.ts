import { describe, it, expect } from 'vitest';
import { formatTime, formatTimeWithMs, formatTimeInSeconds, formatSMILDuration, parseTimeInput } from './time';

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

describe('formatTimeInSeconds', () => {
  it('writes the value the SMIL file carries', () => {
    expect(formatTimeInSeconds(254.46)).toBe('254.460s');
    expect(formatTimeInSeconds(0)).toBe('0.000s');
    expect(formatTimeInSeconds(73.74)).toBe('73.740s');
  });

  it('round-trips through parseTimeInput without losing precision', () => {
    for (const value of [0, 0.27, 254.46, 601.005]) {
      expect(parseTimeInput(formatTimeInSeconds(value))).toBeCloseTo(value, 3);
    }
  });
});

describe('formatSMILDuration', () => {
  it('formats zero', () => {
    expect(formatSMILDuration(0)).toBe('00:00:00.00');
  });

  it('formats minutes and seconds with two decimals', () => {
    expect(formatSMILDuration(61.5)).toBe('00:01:01.50');
  });

  it('formats hours', () => {
    expect(formatSMILDuration(3661)).toBe('01:01:01.00');
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

  it('parses SMIL clock and suffixed times', () => {
    expect(parseTimeInput('00:00:03')).toBe(3);
    expect(parseTimeInput('00:00:03.500')).toBe(3.5);
    expect(parseTimeInput('2s')).toBe(2);
  });

  it('returns 0 for garbage', () => {
    expect(parseTimeInput('abc')).toBe(0);
  });
});
