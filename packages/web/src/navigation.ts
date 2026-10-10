// Page views on in-app navigation. A single-page app
// changes the address through the History API, so a page view per new path
// means watching pushState, replaceState and the back and forward buttons.
// Only the path counts: a new query string or hash is the same page.

export type NavigationWindow = {
  location: { pathname: string };
  history: Pick<History, "pushState" | "replaceState">;
  addEventListener(type: "popstate", listener: () => void): void;
  removeEventListener(type: "popstate", listener: () => void): void;
};

/**
 * Calls `onPath` with each new path the page moves to. Seeded with the path
 * it starts on, so a router replacing the starting address with itself, as
 * most do on load, is not a page view. Returns a function that undoes it.
 */
export function watchNavigation(
  onPath: (path: string) => void,
  win: NavigationWindow = globalThis as unknown as NavigationWindow,
): () => void {
  const { history } = win;
  const push = history.pushState;
  const replace = history.replaceState;
  let last = win.location.pathname;

  const check = () => {
    const path = win.location.pathname;
    if (path === last) return;
    last = path;
    onPath(path);
  };

  history.pushState = function (...args: Parameters<History["pushState"]>) {
    push.apply(this, args);
    check();
  };
  history.replaceState = function (...args: Parameters<History["replaceState"]>) {
    replace.apply(this, args);
    check();
  };
  win.addEventListener("popstate", check);

  return () => {
    history.pushState = push;
    history.replaceState = replace;
    win.removeEventListener("popstate", check);
  };
}
