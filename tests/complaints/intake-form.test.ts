// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComplaintIntakeForm } from '@/components/complaints/intake-form';
import { checkComplaintIntakeForm, type IntakeCheckResult } from '@/lib/complaints/intake-schema';
import type { IntakeSubmissionResult } from '@/lib/complaints/intake-submission';
import { OCPNG_COMPLAINT_PRIVACY_NOTICE_VERSION } from '@/lib/complaints/intake-privacy';
import { validIntake } from './intake-fixture';

let host: HTMLDivElement;
let root: Root;

const submittedResult: IntakeSubmissionResult = {
  status: 'submitted',
  fieldErrors: {},
  receiptReference: 'OC-RCP-2026-ABCDEF1234567890',
  duplicate: false,
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function render(
  checkAction = async (form: FormData): Promise<IntakeCheckResult> => checkComplaintIntakeForm(form),
  mode: 'public' | 'assisted' = 'public',
  submitAction = async (_form: FormData, _idempotencyKey: string): Promise<IntakeSubmissionResult> => submittedResult,
) {
  await act(() => root.render(createElement(ComplaintIntakeForm, { mode, checkAction, submitAction })));
}

function fill(values: Record<string, string> = validIntake) {
  for (const [name, value] of Object.entries(values)) {
    const control = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
    expect(control, `Missing field ${name}`).not.toBeNull();
    control!.value = value;
  }
}

async function clickButton(label: RegExp) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')]
    .find((candidate) => label.test(candidate.textContent ?? ''));
  expect(button, `Missing button ${label}`).toBeDefined();
  await act(async () => { button!.click(); });
}

async function checkDetails() {
  await clickButton(/Check details/i);
}

async function acknowledgePrivacy() {
  const checkbox = host.querySelector<HTMLInputElement>('input[name="privacyAcknowledged"]');
  expect(checkbox).not.toBeNull();
  await act(() => {
    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('complaint intake interaction', () => {
  it('prevents native POST submission before JavaScript hydrates the form', () => {
    const markup = renderToStaticMarkup(createElement(ComplaintIntakeForm, {
      mode: 'public',
      checkAction: async (): Promise<IntakeCheckResult> => ({ status: 'valid', fieldErrors: {} }),
      submitAction: async () => submittedResult,
    }));
    const template = document.createElement('template');
    template.innerHTML = markup;
    const form = template.content.querySelector('form')!;
    expect(form.method).toBe('post');
    expect(form.querySelector('fieldset')?.disabled).toBe(true);
    expect(form.querySelector('button')?.disabled).toBe(true);
  });

  it('enables checking after hydration installs the client handler', async () => {
    const element = createElement(ComplaintIntakeForm, {
      mode: 'public',
      checkAction: async (): Promise<IntakeCheckResult> => ({ status: 'valid', fieldErrors: {} }),
      submitAction: async () => submittedResult,
    });
    const container = document.createElement('div');
    container.innerHTML = renderToString(element);
    document.body.append(container);
    let hydratedRoot!: Root;
    try {
      expect(container.querySelector('button')?.disabled).toBe(true);
      await act(() => { hydratedRoot = hydrateRoot(container, element); });
      expect(container.querySelector('button')?.disabled).toBe(false);
      expect(container.querySelector('fieldset')?.disabled).toBe(false);
    } finally {
      await act(() => hydratedRoot?.unmount());
      container.remove();
    }
  });

  it.each(['public', 'assisted'] as const)('shows labelled complaint fields in %s mode', async (mode) => {
    await render(undefined, mode);
    for (const name of Object.keys(validIntake)) {
      const control = host.querySelector<HTMLInputElement>(`[name="${name}"]`);
      expect(control).not.toBeNull();
      expect(host.querySelector(`label[for="${control!.id}"]`)?.textContent).toBeTruthy();
    }
    expect(host.querySelector('input[name="subject"]')?.getAttribute('maxlength')).toBe('200');
    expect(host.querySelector('textarea[name="allegation"]')?.hasAttribute('required')).toBe(true);
  });

  it('blocks invalid input locally and focuses a linked error summary', async () => {
    await render(async () => { throw new Error('Invalid form reached the server'); });
    await checkDetails();
    const summary = host.querySelector('[role="alert"]');
    expect(summary).not.toBeNull();
    expect(document.activeElement).toBe(summary);
    const control = host.querySelector('[name="complainantName"]');
    expect(control?.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector(`a[href="#${control?.id}"]`)).not.toBeNull();
  });

  it('shows the approved versioned privacy notice only after server validation succeeds', async () => {
    await render();
    expect(host.textContent).not.toMatch(/Privacy and use of your information/);
    fill();
    await checkDetails();
    expect(host.textContent).toMatch(/Privacy and use of your information/);
    expect(host.textContent).toContain(OCPNG_COMPLAINT_PRIVACY_NOTICE_VERSION);
    expect(host.querySelector('input[name="privacyAcknowledged"]')).not.toBeNull();
    expect(host.textContent).toMatch(/Your complaint information will be handled as confidential information/);
  });

  it('requires public acknowledgement before invoking the trusted submission action', async () => {
    const submitAction = vi.fn(async () => submittedResult);
    await render(undefined, 'public', submitAction);
    fill();
    await checkDetails();
    await clickButton(/Submit complaint/i);
    expect(submitAction).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/acknowledge the Privacy Notice/i);
  });

  it('submits public intake with acknowledgement and displays the controlled receipt', async () => {
    const submitAction = vi.fn(async () => submittedResult);
    await render(undefined, 'public', submitAction);
    fill();
    await checkDetails();
    await acknowledgePrivacy();
    await clickButton(/Submit complaint/i);

    expect(submitAction).toHaveBeenCalledTimes(1);
    const [form, idempotencyKey] = submitAction.mock.calls[0];
    expect(form.get('privacyAcknowledged')).toBe('yes');
    expect(idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(host.querySelector('[role="status"]')?.textContent).toContain('OC-RCP-2026-ABCDEF1234567890');
    expect(host.querySelector('fieldset')?.disabled).toBe(true);
  });

  it('offers assisted acknowledgement and the single approved not-required reason', async () => {
    await render(undefined, 'assisted');
    fill();
    await checkDetails();
    expect(host.textContent).toMatch(/privacy notice was explained or made available/i);
    const reason = host.querySelector<HTMLSelectElement>('select[name="privacyNotRequiredReason"]');
    expect(reason).not.toBeNull();
    expect([...reason!.options].map((option) => option.value)).toContain('formal_correspondence_already_received');
  });

  it('submits the assisted non-required path with the approved reason', async () => {
    const submitAction = vi.fn(async () => submittedResult);
    await render(undefined, 'assisted', submitAction);
    fill();
    await checkDetails();
    const reason = host.querySelector<HTMLSelectElement>('select[name="privacyNotRequiredReason"]')!;
    await act(() => {
      reason.value = 'formal_correspondence_already_received';
      reason.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await clickButton(/Submit complaint/i);
    expect(submitAction).toHaveBeenCalledTimes(1);
    expect(submitAction.mock.calls[0][0].get('privacyNotRequiredReason')).toBe('formal_correspondence_already_received');
  });

  it('reuses the same idempotency key for an unchanged retry after an unavailable response', async () => {
    const submitAction = vi.fn()
      .mockResolvedValueOnce({ status: 'unavailable', fieldErrors: {}, formError: 'Unable to submit the complaint right now. Please try again.' } satisfies IntakeSubmissionResult)
      .mockResolvedValueOnce(submittedResult);
    await render(undefined, 'public', submitAction);
    fill();
    await checkDetails();
    await acknowledgePrivacy();
    await clickButton(/Submit complaint/i);
    await clickButton(/Submit complaint/i);
    expect(submitAction).toHaveBeenCalledTimes(2);
    expect(submitAction.mock.calls[0][1]).toBe(submitAction.mock.calls[1][1]);
  });

  it('invalidates validation and the retry key when complaint details change', async () => {
    const submitAction = vi.fn(async () => ({ status: 'unavailable', fieldErrors: {}, formError: 'Unable to submit the complaint right now. Please try again.' } satisfies IntakeSubmissionResult));
    await render(undefined, 'public', submitAction);
    fill();
    await checkDetails();
    await acknowledgePrivacy();
    await clickButton(/Submit complaint/i);
    const firstKey = submitAction.mock.calls[0][1];

    const control = host.querySelector<HTMLInputElement>('[name="subject"]')!;
    await act(() => {
      control.value = 'DEMO revised subject';
      control.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(host.textContent).not.toMatch(/Privacy and use of your information/);

    await checkDetails();
    await acknowledgePrivacy();
    await clickButton(/Submit complaint/i);
    expect(submitAction.mock.calls[1][1]).not.toBe(firstKey);
  });

  it('shows a safe retry message on validation network failure', async () => {
    await render(async () => { throw new Error('private upstream details'); });
    fill();
    await checkDetails();
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/try again/i);
    expect(host.textContent).not.toMatch(/upstream/);
  });

  it('prevents duplicate validation checks and locks editing until the request finishes', async () => {
    let finish!: (result: IntakeCheckResult) => void;
    let requests = 0;
    await render(async () => {
      requests++;
      return new Promise<IntakeCheckResult>((resolve) => { finish = resolve; });
    });
    fill();
    await checkDetails();
    await checkDetails();
    expect(requests).toBe(1);
    expect(host.querySelector('fieldset')?.disabled).toBe(true);
    await act(async () => { finish({ status: 'valid', fieldErrors: {} }); });
    expect(host.querySelector('fieldset')?.disabled).toBe(false);
  });
});
