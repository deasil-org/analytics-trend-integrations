import { LIMITS } from "@analyticstrend/event-schema";

// Form submissions (0.7.0), off unless the site turns them on: that a form
// was sent, named by the id or name attribute the site's own markup gives it.
// Never a field, a value, or the address the form is sent to, any of which
// can be a person's own.

export type FormEvent = { name: "form_submit"; props?: { $form: string } };

type FormElement = { tagName?: string; getAttribute(name: string): string | null };

/** The event a submit from this element is, or null when it is not a form. */
export function formEvent(target: unknown): FormEvent | null {
  const element = target as FormElement | null;
  if (!element || typeof element.getAttribute !== "function" || element.tagName?.toUpperCase() !== "FORM") return null;
  const name = element.getAttribute("id") || element.getAttribute("name");
  return name ? { name: "form_submit", props: { $form: name.slice(0, LIMITS.MAX_CAPTURED_VALUE_LENGTH) } } : { name: "form_submit" };
}

export type FormDocument = {
  addEventListener(type: "submit", listener: (event: never) => void, capture?: boolean): void;
  removeEventListener(type: "submit", listener: (event: never) => void, capture?: boolean): void;
};

/**
 * Watches submits, in the capture phase so a page that stops the event's
 * propagation still has it counted. Never prevents or delays the submit: one
 * that leaves the page is delivered by the page-hide flush. A form the browser
 * refuses as invalid fires no submit, so it is not counted. Returns a function
 * that stops watching.
 */
export function watchForms(
  send: (event: FormEvent) => void,
  doc: FormDocument = globalThis.document as unknown as FormDocument,
): () => void {
  const onSubmit = (event: { target: unknown }) => {
    const found = formEvent(event.target);
    if (found) send(found);
  };
  doc.addEventListener("submit", onSubmit as (event: never) => void, true);
  return () => doc.removeEventListener("submit", onSubmit as (event: never) => void, true);
}
