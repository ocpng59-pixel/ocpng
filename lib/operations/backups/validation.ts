export function validateBackupReason(input: string): string {
  const reason = input.trim();
  if (reason.length < 3 || reason.length > 500) {
    throw new Error('Administrative reason must be 3 to 500 characters.');
  }
  return reason;
}

export function validateRecoveryTimeUnix(input: number): number {
  if (!Number.isFinite(input) || !Number.isInteger(input) || input < 0) {
    throw new Error('Recovery time must be a non-negative Unix timestamp.');
  }
  return input;
}
