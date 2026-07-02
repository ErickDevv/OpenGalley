import { flushSync } from "react-dom";
import { NavigateFunction } from "react-router-dom";

type DocumentWithViewTransition = Document & {
  startViewTransition: (cb: () => void) => void;
};

export function viewNav(nav: NavigateFunction, to: string) {
  if ("startViewTransition" in document) {
    (document as DocumentWithViewTransition).startViewTransition(() =>
      flushSync(() => nav(to))
    );
  } else {
    nav(to);
  }
}
