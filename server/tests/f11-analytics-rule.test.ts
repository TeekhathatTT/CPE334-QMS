/**
 * F-11 Operational analytics: pure domain rules (no database).
 * Canonical STS: ANALYTICS-001 in docs/sprints/sprint-3/tests.md §2.2.
 * Contract: docs/features/sprint-3-f11-operational-analytics.md v1.0 (D-3, D-4), SRS BR-25, BR-26.
 */
import { describe, it, expect } from 'vitest';
import {
  bangkokDate,
  parseAnalyticsRange,
  summarizeDurations,
} from '../src/services/analyticsPolicy';
import { AppError } from '../src/errors/AppError';

function expectInvalid(fn: () => unknown) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(400);
    expect((err as AppError).code).toBe('INVALID_ARGUMENT');
    return;
  }
  throw new Error('expected INVALID_ARGUMENT');
}

describe('ANALYTICS-001: analytics policy helpers', () => {
  describe('summarizeDurations (BR-25, D-3)', () => {
    it('returns count 0 and null statistics for an empty list', () => {
      expect(summarizeDurations([])).toEqual({
        count: 0,
        averageSeconds: null,
        medianSeconds: null,
        p90Seconds: null,
        maxSeconds: null,
      });
    });

    it('handles a single sample', () => {
      expect(summarizeDurations([42])).toEqual({
        count: 1,
        averageSeconds: 42,
        medianSeconds: 42,
        p90Seconds: 42,
        maxSeconds: 42,
      });
    });

    it('matches the DS-11 waiting-time expectations (unsorted input)', () => {
      expect(summarizeDurations([300, 120, 600, 450, 900, 60, 30])).toEqual({
        count: 7,
        averageSeconds: 351.4,
        medianSeconds: 300,
        p90Seconds: 720,
        maxSeconds: 900,
      });
    });

    it('matches the DS-11 service-time expectations', () => {
      expect(summarizeDurations([600, 300, 900, 480])).toEqual({
        count: 4,
        averageSeconds: 570,
        medianSeconds: 540,
        p90Seconds: 810,
        maxSeconds: 900,
      });
    });

    it('interpolates the median for an even count', () => {
      expect(summarizeDurations([1, 2]).medianSeconds).toBe(1.5);
    });

    it('rounds half-up to 1 decimal place', () => {
      expect(summarizeDurations([0.05]).averageSeconds).toBe(0.1);
      expect(summarizeDurations([351.428]).averageSeconds).toBe(351.4);
      expect(summarizeDurations([0.25]).maxSeconds).toBe(0.3);
    });
  });

  describe('bangkokDate (BR-26, AC-58)', () => {
    it('buckets instants into Asia/Bangkok calendar dates (UTC+07:00)', () => {
      expect(bangkokDate(new Date('2026-11-20T16:59:59.999Z'))).toBe('2026-11-20');
      expect(bangkokDate(new Date('2026-11-20T17:00:00.000Z'))).toBe('2026-11-21');
      expect(bangkokDate(new Date('2026-11-19T17:00:00.000Z'))).toBe('2026-11-20');
    });
  });

  describe('parseAnalyticsRange (BR-26, AC-59)', () => {
    it('converts an inclusive Bangkok date range to a UTC half-open interval and lists every day', () => {
      const r = parseAnalyticsRange('2026-11-20', '2026-11-26');
      expect(r.fromUtc.toISOString()).toBe('2026-11-19T17:00:00.000Z');
      expect(r.toUtcExclusive.toISOString()).toBe('2026-11-26T17:00:00.000Z');
      expect(r.days).toEqual([
        '2026-11-20',
        '2026-11-21',
        '2026-11-22',
        '2026-11-23',
        '2026-11-24',
        '2026-11-25',
        '2026-11-26',
      ]);
    });

    it('accepts a single day and exactly 31 days, across a month boundary', () => {
      expect(parseAnalyticsRange('2026-11-26', '2026-11-26').days).toEqual(['2026-11-26']);
      const r = parseAnalyticsRange('2026-11-15', '2026-12-15');
      expect(r.days).toHaveLength(31);
      expect(r.days[16]).toBe('2026-12-01');
    });

    it('rejects missing, malformed, impossible, reversed and over-long ranges', () => {
      expectInvalid(() => parseAnalyticsRange(undefined, '2026-11-26'));
      expectInvalid(() => parseAnalyticsRange('2026-11-20', undefined));
      expectInvalid(() => parseAnalyticsRange('2026-11-5', '2026-11-26'));
      expectInvalid(() => parseAnalyticsRange('2026/11/20', '2026-11-26'));
      expectInvalid(() => parseAnalyticsRange('2026-02-30', '2026-03-01'));
      expectInvalid(() => parseAnalyticsRange('2026-13-01', '2026-13-02'));
      expectInvalid(() => parseAnalyticsRange('2026-11-27', '2026-11-26'));
      expectInvalid(() => parseAnalyticsRange('2026-11-15', '2026-12-16'));
    });
  });
});
