const INTERFACE_LOCALE_STORAGE_KEY = "helmdeck-interface-locale";

export function readStoredInterfaceLocale() {
  try {
    return window.sessionStorage.getItem(INTERFACE_LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredInterfaceLocale(locale: string) {
  try {
    window.sessionStorage.setItem(INTERFACE_LOCALE_STORAGE_KEY, locale);
  } catch {
    return;
  }
}

export function clearStoredInterfaceLocale() {
  try {
    window.sessionStorage.removeItem(INTERFACE_LOCALE_STORAGE_KEY);
  } catch {
    return;
  }
}
