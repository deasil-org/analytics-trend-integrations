import { storage } from "#imports";

// The person's own "Share anonymous usage" switch, which the popup shows.
// It starts on; set the fallback to false to ask first instead. WXT's own
// default is off, which would send nothing until the extension asked. On
// Firefox, the browser's built-in data-collection toggle applies as well.
export const analyticsEnabled = storage.defineItem<boolean>("local:analytics-enabled", { fallback: true });
