import { approve, Memory, MemoryError } from './memory.ts';
import type { Approval, EligibilityReason } from './memory.ts';
import type { QuietHoursPolicy } from './quiet-hours.ts';

export type SimulationScenario = 'success' | 'confirmed_failure' | 'timeout' | 'crash_after_delivery';
export type SimulationResult = {
  synthetic: true;
  commitmentId: string;
  status: 'deferred' | 'completed' | 'failed' | 'needs_review';
  reason: EligibilityReason | 'state_changed' | 'reservation_failed' | 'delivered' |
    'confirmed_failure' | 'timeout' | 'crash_after_delivery' | 'outcome_save_failed';
  attempted: boolean;
  simulatedDelivery: 'not_attempted' | 'delivered' | 'not_delivered' | 'unknown';
  reservationKey: string | null;
  attempt: number | null;
  outcomeSaved: boolean;
  needsReview: boolean;
};

/** One bounded synthetic attempt. No sender injection, network, timers, scheduler or automatic retry.
 * Store/Memory are trusted host capabilities. Use synthetic storage only.
 * The await models the boundary between fake delivery and outcome persistence. */
export async function simulateReminder(
  memory: Memory, commitmentId: string, now: number, policy: QuietHoursPolicy,
  scenario: SimulationScenario, approval?: Approval,
): Promise<SimulationResult> {
  approve(approval);
  if (typeof commitmentId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(commitmentId) ||
      !['success', 'confirmed_failure', 'timeout', 'crash_after_delivery'].includes(scenario)) {
    throw new MemoryError('INVALID');
  }
  // Capture approval; caller mutation during the asynchronous boundary cannot alter this operation.
  const authorized = { approved: true } as const;
  const base: SimulationResult = {
    synthetic: true, commitmentId, status: 'failed', reason: 'reservation_failed',
    attempted: false, simulatedDelivery: 'not_attempted', reservationKey: null,
    attempt: null, outcomeSaved: false, needsReview: false,
  };
  // Validation/read errors propagate as sanitized MemoryError. Never call the fake sender on error.
  const eligibility = memory.eligibilityPreview(now, policy).find(r => r.commitmentId === commitmentId);
  if (!eligibility) throw new MemoryError('NOT_FOUND');
  if (!eligibility.eligible) return {
    ...base, status: eligibility.reason === 'delivery_unresolved' ? 'needs_review' : 'deferred',
    reason: eligibility.reason, needsReview: eligibility.reason === 'delivery_unresolved',
  };
  let reservation;
  try { reservation = memory.claimWithPolicy(commitmentId, now, policy, authorized); }
  catch {
    // A reservation was not returned: do not attempt delivery or blindly retry.
    return { ...base, needsReview: true };
  }
  if (!reservation) return { ...base, status: 'deferred', reason: 'state_changed' };

  // Closed fake sender: scenario is the only input, no address/content/provider capability exists.
  const simulatedDelivery = scenario === 'confirmed_failure' ? 'not_delivered' :
    scenario === 'timeout' ? 'unknown' : 'delivered';
  const attempted: SimulationResult = {
    ...base, attempted: true, simulatedDelivery, reservationKey: reservation.key,
    attempt: reservation.attempts, status: 'needs_review', needsReview: true,
  };
  await Promise.resolve();
  if (scenario === 'crash_after_delivery') {
    // Simulated process interruption: deliberately skip settlement, preserving pending.
    return { ...attempted, reason: 'crash_after_delivery' };
  }
  const outcome = scenario === 'success' ? 'sent' : scenario === 'confirmed_failure' ? 'failed' : 'unknown';
  try { memory.settle(reservation.key, reservation.attempts, outcome, authorized); }
  catch {
    // Never convert an unrecorded delivery into a confirmed failure or retry it.
    return { ...attempted, reason: 'outcome_save_failed' };
  }
  return {
    ...attempted, outcomeSaved: true,
    status: scenario === 'timeout' ? 'needs_review' : scenario === 'success' ? 'completed' : 'failed',
    reason: scenario === 'success' ? 'delivered' : scenario,
    needsReview: scenario === 'timeout',
  };
}

/** Fixed vocabulary only: no commitment text, provider errors or recovery evidence. */
export function formatSimulation(result: SimulationResult): string {
  return `Synthetic reminder ${result.commitmentId}: ${result.status} (${result.reason}). ` +
    `Fake attempt: ${result.attempted ? 'yes' : 'no'}; outcome saved: ${result.outcomeSaved ? 'yes' : 'no'}; ` +
    `review needed: ${result.needsReview ? 'yes' : 'no'}. No real message sent.`;
}
