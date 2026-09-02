import { describe, expect, it } from 'vitest';
import {
  OCPNG_COMPLAINT_PRIVACY_NOTICE_VERSION,
  parseComplaintIntakePrivacy,
} from '@/lib/complaints/intake-privacy';

function privacyForm(entries: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.append(key, value);
  return form;
}

describe('WASDOK-66 complaint intake privacy contract', () => {
  it('uses the approved version identifier for recorded privacy evidence', () => {
    expect(OCPNG_COMPLAINT_PRIVACY_NOTICE_VERSION).toBe('OCPNG-COMPLAINT-PRIVACY-v1');
  });

  it('rejects public submission until the privacy acknowledgement is explicitly selected', () => {
    expect(parseComplaintIntakePrivacy('public', privacyForm())).toEqual({
      ok: false,
      message: 'You must read and acknowledge the Privacy Notice before submitting your complaint.',
    });
  });

  it('builds minimal public-checkbox evidence and ignores browser-supplied metadata', () => {
    const form = privacyForm({
      privacyAcknowledged: 'yes',
      privacyNoticeVersion: 'forged-version',
      privacyAcknowledgedAt: '1999-01-01T00:00:00Z',
      complainantName: 'must not be copied into consent evidence',
    });

    expect(parseComplaintIntakePrivacy('public', form)).toEqual({
      ok: true,
      evidence: {
        noticeVersion: 'OCPNG-COMPLAINT-PRIVACY-v1',
        acknowledgementRequired: true,
        method: 'public_checkbox',
        notRequiredReason: null,
      },
    });
  });

  it('records assisted acknowledgement without trusting a browser actor or timestamp', () => {
    const form = privacyForm({
      privacyAcknowledged: 'yes',
      privacyActorId: '00000000-0000-0000-0000-000000000000',
      privacyAcknowledgedAt: '1999-01-01T00:00:00Z',
    });

    expect(parseComplaintIntakePrivacy('assisted', form)).toEqual({
      ok: true,
      evidence: {
        noticeVersion: 'OCPNG-COMPLAINT-PRIVACY-v1',
        acknowledgementRequired: true,
        method: 'assisted_acknowledgement',
        notRequiredReason: null,
      },
    });
  });

  it('allows the assisted non-required path only for an approved reason code', () => {
    expect(parseComplaintIntakePrivacy('assisted', privacyForm({
      privacyNotRequiredReason: 'formal_correspondence_already_received',
    }))).toEqual({
      ok: true,
      evidence: {
        noticeVersion: 'OCPNG-COMPLAINT-PRIVACY-v1',
        acknowledgementRequired: false,
        method: 'not_required',
        notRequiredReason: 'formal_correspondence_already_received',
      },
    });

    expect(parseComplaintIntakePrivacy('assisted', privacyForm({
      privacyNotRequiredReason: 'made-up-browser-reason',
    }))).toEqual({
      ok: false,
      message: 'Record the complainant privacy acknowledgement or select an approved reason why acknowledgement is not required.',
    });
  });

  it('rejects conflicting assisted acknowledgement and not-required evidence', () => {
    expect(parseComplaintIntakePrivacy('assisted', privacyForm({
      privacyAcknowledged: 'yes',
      privacyNotRequiredReason: 'formal_correspondence_already_received',
    }))).toEqual({
      ok: false,
      message: 'Record either an acknowledgement or a not-required reason, not both.',
    });
  });
});
