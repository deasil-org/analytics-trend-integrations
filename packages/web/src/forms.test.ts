import { describe, expect, it, vi } from "vitest";
import { formEvent, watchForms, type FormDocument } from "./forms.ts";

// Form submissions (0.7.0): that a form was sent, named by its id or name
// attribute, and never anything that was typed into it.

const form = (attributes: Record<string, string>, fields: Record<string, string> = {}) => ({
  tagName: "FORM",
  getAttribute: (name: string) => attributes[name] ?? null,
  elements: fields,
});

describe("formEvent", () => {
  it("names a form by its id", () => {
    expect(formEvent(form({ id: "newsletter", name: "signup" }))).toEqual({ name: "form_submit", props: { $form: "newsletter" } });
  });

  it("names it by its name attribute when it has no id", () => {
    expect(formEvent(form({ name: "contact" }))).toEqual({ name: "form_submit", props: { $form: "contact" } });
  });

  it("sends no name for a form with neither", () => {
    expect(formEvent(form({}))).toEqual({ name: "form_submit" });
  });

  it("never reads a field, a value or where the form is sent", () => {
    const sent = formEvent(form({ id: "login", action: "https://shop.example/login?next=/me" }, { email: "jo@example.com", password: "secret" }));
    expect(JSON.stringify(sent)).not.toMatch(/jo@example|secret|action|next=|shop\.example/);
  });

  it("clips a long name, as every captured value is", () => {
    expect(formEvent(form({ id: "x".repeat(200) }))?.props?.$form).toHaveLength(64);
  });

  it("is nothing for a submit from something that is not a form", () => {
    expect(formEvent({ tagName: "DIV", getAttribute: () => null })).toBeNull();
    expect(formEvent(null)).toBeNull();
  });
});

describe("watchForms", () => {
  function page() {
    const listeners = new Map<string, { listener: (event: never) => void; capture?: boolean }>();
    const doc: FormDocument = {
      addEventListener: (type, listener, capture) => void listeners.set(type, { listener, capture }),
      removeEventListener: (type) => void listeners.delete(type),
    };
    const submit = (target: unknown) => (listeners.get("submit")?.listener as ((event: unknown) => void) | undefined)?.({ type: "submit", target });
    return { doc, listeners, submit };
  }

  // In the capture phase, so a page that stops the submit event's propagation
  // still has it counted; never prevented or delayed.
  it("sends one event for each form submitted, listening in the capture phase", () => {
    const { doc, listeners, submit } = page();
    const send = vi.fn();
    watchForms(send, doc);
    expect(listeners.get("submit")?.capture).toBe(true);

    submit(form({ id: "newsletter" }));
    expect(send).toHaveBeenCalledExactlyOnceWith({ name: "form_submit", props: { $form: "newsletter" } });
  });

  it("stops listening when asked", () => {
    const { doc, listeners } = page();
    watchForms(vi.fn(), doc)();
    expect(listeners.has("submit")).toBe(false);
  });
});
