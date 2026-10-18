const INTERFACE_LOCALE_STORAGE_KEY = "helmdeck-interface-locale";

export function readStoredInterfaceLocale() {
  try {
    return window.sessionStorage.getItem(INTERFACE_LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredInterfaceLocale(locale: string) {
  window.sessionStorage.setItem(INTERFACE_LOCALE_STORAGE_KEY, locale);
}

export function clearStoredInterfaceLocale() {
  try {
    window.sessionStorage.removeItem(INTERFACE_LOCALE_STORAGE_KEY);
  } catch {
    return;
  }
}
