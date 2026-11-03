import { pageTransitionRuntime } from "./pageTransitionRuntime";

/* Prerender same-origin pages when a link is hovered (or pressed), so the click activates a page that is
   already rendered and the transition starts at once instead of after the next document has loaded. */
const SPECULATION_RULES = JSON.stringify({
  prerender: [
    {
      where: {
        and: [
          { href_matches: "/*" },
          { not: { href_matches: "/_next/*" } },
          { not: { href_matches: "/unavailable/*" } },
          { not: { href_matches: "/login*" } },
          { not: { href_matches: "/signup*" } },
          { not: { href_matches: "/forgot-password*" } },
          { not: { selector_matches: "[target=_blank], [download], [rel~=nofollow]" } },
        ],
      },
      eagerness: "moderate",
    },
  ],
});

/** Inlined in <head> so the new document registers `pagereveal` before its first render. */
export function PageTransitionScript() {
  return (
    <>
      <script type="speculationrules" dangerouslySetInnerHTML={{ __html: SPECULATION_RULES }} />
      <script dangerouslySetInnerHTML={{ __html: `(${pageTransitionRuntime.toString()})();` }} />
    </>
  );
}
