// SPDX-License-Identifier: MIT

export const ADMIN_THEME_PREFERENCE_STORAGE_KEY = "helmdeck-admin-theme";
export const ADMIN_THEME_COOKIE_NAME = "helmdeck_theme";
export function writeAdminThemeCookie(resolvedTheme: "light" | "dark") {
  document.cookie = `${ADMIN_THEME_COOKIE_NAME}=v1:${resolvedTheme}; Path=/; SameSite=Lax`;
}
export const ADMIN_THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(ADMIN_THEME_PREFERENCE_STORAGE_KEY)};var o="helmdeck-demo-theme";var s=null;try{s=window.localStorage.getItem(k);if(s===null){s=window.localStorage.getItem(o);if(s==="light"||s==="dark"||s==="system"){window.localStorage.setItem(k,s);window.localStorage.removeItem(o);}}}catch(e){}var t=(s==="light"||s==="dark")?s:(window.matchMedia(${JSON.stringify("(prefers-color-scheme: dark)")}).matches?"dark":"light");document.documentElement.dataset.adminTheme=t;document.cookie=${JSON.stringify(ADMIN_THEME_COOKIE_NAME)}+"=v1:"+t+"; Path=/; SameSite=Lax";}catch(e){}})();`;
