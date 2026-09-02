export const OCPNG_COMPLAINT_PRIVACY_NOTICE_VERSION = 'OCPNG-COMPLAINT-PRIVACY-v1' as const;

export const OCPNG_COMPLAINT_PRIVACY_NOTICE = {
  title: 'Privacy and use of your information',
  paragraphs: [
    'The Ombudsman Commission of Papua New Guinea collects the information you provide in this complaint form so that it can receive, assess, manage and, where appropriate, investigate your complaint and carry out its lawful functions.',
    'The information you provide may include your name, contact details, information about a government body or person concerned, and details of the matter you are reporting. Please provide only information that is relevant to your complaint.',
    'Your complaint information will be handled as confidential information within WASDOK 360. Access will be restricted to authorised Ombudsman Commission officers who require the information for their official duties.',
    'The Commission may use or disclose information from your complaint where this is reasonably necessary to assess or manage the matter, to communicate with relevant parties, to obtain information, to undertake an investigation or referral, or where disclosure is otherwise required or authorised by law.',
    'The Commission will take reasonable administrative and technical measures to protect the information against unauthorised access, alteration, disclosure or loss.',
    'Information submitted through this service will form part of the Commission’s official records and will be retained and managed in accordance with applicable law, records-management requirements and Commission policy.',
    'By submitting the complaint, you acknowledge that you have read and understood this privacy notice and agree to the Commission collecting and using the information you provide for the purposes described above.',
    'If you are submitting information about another person, provide only information reasonably necessary for the complaint and do not unnecessarily include highly sensitive personal information.',
  ],
  publicAcknowledgement: 'I have read and understood the Privacy Notice. I acknowledge that the Ombudsman Commission may collect, use and securely retain the information I provide for the purpose of receiving, assessing and managing this complaint, including any lawful investigation or referral arising from it.',
  assistedAcknowledgement: 'I confirm that the privacy notice was explained or made available to the complainant before this complaint was submitted.',
} as const;

export const ASSISTED_PRIVACY_NOT_REQUIRED_REASONS = {
  formal_correspondence_already_received: 'Formal correspondence already received by the Commission',
} as const;

export type AssistedPrivacyNotRequiredReason = keyof typeof ASSISTED_PRIVACY_NOT_REQUIRED_REASONS;

export type ComplaintIntakePrivacyEvidence = {
  noticeVersion: typeof OCPNG_COMPLAINT_PRIVACY_NOTICE_VERSION;
  acknowledgementRequired: boolean;
  method: 'public_checkbox' | 'assisted_acknowledgement' | 'not_required';
  notRequiredReason: AssistedPrivacyNotRequiredReason | null;
};

export type ComplaintIntakePrivacyResult =
  | { ok: true; evidence: ComplaintIntakePrivacyEvidence }
  | { ok: false; message: string };

const selected = (form: FormData, name: string) => form.get(name) === 'yes';
const value = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

export function parseComplaintIntakePrivacy(
  mode: 'public' | 'assisted',
  form: FormData,
): ComplaintIntakePrivacyResult {
  const acknowledged = selected(form, 'privacyAcknowledged');

  if (mode === 'public') {
    if (!acknowledged) {
      return {
        ok: false,
        message: 'You must read and acknowledge the Privacy Notice before submitting your complaint.',
      };
    }
    return {
      ok: true,
      evidence: {
        noticeVersion: OCPNG_COMPLAINT_PRIVACY_NOTICE_VERSION,
        acknowledgementRequired: true,
        method: 'public_checkbox',
        notRequiredReason: null,
      },
    };
  }

  const reason = value(form, 'privacyNotRequiredReason');
  const approvedReason = Object.prototype.hasOwnProperty.call(
    ASSISTED_PRIVACY_NOT_REQUIRED_REASONS,
    reason,
  ) ? reason as AssistedPrivacyNotRequiredReason : null;

  if (acknowledged && reason) {
    return {
      ok: false,
      message: 'Record either an acknowledgement or a not-required reason, not both.',
    };
  }

  if (acknowledged) {
    return {
      ok: true,
      evidence: {
        noticeVersion: OCPNG_COMPLAINT_PRIVACY_NOTICE_VERSION,
        acknowledgementRequired: true,
        method: 'assisted_acknowledgement',
        notRequiredReason: null,
      },
    };
  }

  if (approvedReason) {
    return {
      ok: true,
      evidence: {
        noticeVersion: OCPNG_COMPLAINT_PRIVACY_NOTICE_VERSION,
        acknowledgementRequired: false,
        method: 'not_required',
        notRequiredReason: approvedReason,
      },
    };
  }

  return {
    ok: false,
    message: 'Record the complainant privacy acknowledgement or select an approved reason why acknowledgement is not required.',
  };
}
