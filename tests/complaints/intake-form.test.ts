// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComplaintIntakeForm } from '@/components/complaints/intake-form';
import { checkComplaintIntakeForm, type IntakeCheckResult } from '@/lib/complaints/intake-schema';
import { validIntake } from './intake-fixture';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

async function render(checkAction = async (form: FormData): Promise<IntakeCheckResult> => checkComplaintIntakeForm(form), mode: 'public' | 'assisted' = 'public') {
  await act(() => root.render(createElement(ComplaintIntakeForm, { mode, checkAction })));
}
function fill(values: Record<string, string> = validIntake) {
  for (const [name, value] of Object.entries(values)) {
    const control = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
    expect(control, `Missing field ${name}`).not.toBeNull();
    control!.value = value;
  }
}
async function submit() {
  const form = host.querySelector('form');
  expect(form).not.toBeNull();
  await act(async () => { form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}

describe('complaint intake interaction', () => {
  it('prevents native GET submission before JavaScript hydrates the form', () => {
    const markup = renderToStaticMarkup(createElement(ComplaintIntakeForm, {
      mode: 'public', checkAction: async (): Promise<IntakeCheckResult> => ({ status: 'valid', fieldErrors: {} }),
    }));
    const template = document.createElement('template');
    template.innerHTML = markup;
    const form = template.content.querySelector('form')!;
    // Native browser fallback must never put complaint values in the URL.
    expect(form.method).toBe('post');
    expect(form.querySelector('fieldset')?.disabled).toBe(true);
    expect(form.querySelector('button')?.disabled).toBe(true);
  });

  it('enables checking after hydration installs the client handler', async () => {
    const element = createElement(ComplaintIntakeForm, {
      mode: 'public', checkAction: async (): Promise<IntakeCheckResult> => ({ status: 'valid', fieldErrors: {} }),
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

  it.each(['public', 'assisted'] as const)('shows labelled fields and the DEMO limit in %s mode', async (mode) => {
    await render(undefined, mode);
    expect(host.textContent).toMatch(/DEMO/);
    expect(host.textContent).toMatch(/does not submit/i);
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
    await submit();
    const summary = host.querySelector('[role="alert"]');
    expect(summary).not.toBeNull();
    expect(document.activeElement).toBe(summary);
    const control = host.querySelector('[name="complainantName"]');
    expect(control?.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector(`a[href="#${control?.id}"]`)).not.toBeNull();
    expect(host.querySelector('[role="status"]')?.textContent).not.toMatch(/Details checked/);
  });

  it('shows success only after the server confirms validation', async () => {
    await render();
    fill();
    await submit();
    expect(host.querySelector('[role="status"]')?.textContent).toMatch(/Details checked.*not been submitted/s);
    expect(host.querySelector<HTMLInputElement>('[name="complainantName"]')?.value).toBe(validIntake.complainantName);
  });

  it('displays server field errors and preserves input', async () => {
    await render(async () => ({ status: 'invalid', fieldErrors: { subject: 'Please check this subject.' }, formError: 'Check the highlighted details.' }));
    fill();
    await submit();
    expect(host.querySelector('[name="subject"]')?.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/Please check this subject/);
    expect(host.querySelector<HTMLInputElement>('[name="subject"]')?.value).toBe(validIntake.subject);
  });

  it('shows a safe retry message on network failure', async () => {
    await render(async () => { throw new Error('DEMO private upstream details'); });
    fill();
    await submit();
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/try again/i);
    expect(host.textContent).not.toMatch(/upstream/);
    expect(host.querySelector('button')?.disabled).toBe(false);
  });

  it('clears the prior validation result when the user edits details', async () => {
    await render(); fill(); await submit();
    const control = host.querySelector<HTMLInputElement>('[name="subject"]')!;
    await act(() => {
      control.value = 'DEMO revised subject';
      control.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(host.querySelector('[role="status"]')?.textContent).not.toMatch(/Details checked/);
  });

  it('prevents duplicate checks and locks editing until the request finishes', async () => {
    let finish!: (result: IntakeCheckResult) => void;
    let requests = 0;
    await render(async () => {
      requests++;
      return new Promise<IntakeCheckResult>((resolve) => { finish = resolve; });
    });
    fill(); await submit(); await submit();
    expect(requests).toBe(1);
    expect(host.querySelector('fieldset')?.disabled).toBe(true);
    expect(host.querySelector('button')?.disabled).toBe(true);
    await act(async () => { finish({ status: 'valid', fieldErrors: {} }); });
    expect(host.querySelector('fieldset')?.disabled).toBe(false);
  });
});
