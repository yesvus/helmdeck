// Shared by the pre-paint boot script in the root layout and the client provider, so the two
// cannot disagree about where the preference lives or what counts as a valid value.
export const shellThemeStorageKey = "helmdeck-demo-theme";

export const darkSchemeQuery = "(prefers-color-scheme: dark)";

// Runs before first paint. Without it a dark-mode visitor sees a light flash on every navigation,
// because the provider only applies the theme in an effect, after hydration. It establishes the
// initial value and nothing else: the provider takes over as soon as it mounts.
//
// The storage read has its own try, separate from the outer one. A single try around everything
// meant a throwing localStorage, as in a restricted or private context, skipped the matchMedia
// fallback as well and left the page unthemed until the provider mounted.
export const themeBootScript = `(function(){try{var k=${JSON.stringify(
  shellThemeStorageKey,
)};var s=null;try{s=window.localStorage.getItem(k);}catch(e){}var t=(s==="light"||s==="dark")?s:(window.matchMedia(${JSON.stringify(
  darkSchemeQuery,
)}).matches?"dark":"light");document.documentElement.dataset.adminTheme=t;}catch(e){}})();`;
