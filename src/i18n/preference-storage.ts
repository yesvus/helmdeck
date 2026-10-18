const INTERFACE_LOCALE_STORAGE_KEY = "helmdeck-interface-locale";
const INTERFACE_LOCALE_READER_KEY = "helmdeck-interface-locale-reader";

export function readStoredInterfaceLocale() {
  try {
    return window.sessionStorage.getItem(INTERFACE_LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readStoredInterfaceLocaleReader() {
  try {
    return window.sessionStorage.getItem(INTERFACE_LOCALE_READER_KEY);
  } catch {
    return null;
  }
}

export function writeStoredInterfaceLocale(locale: string, reader: string | null) {
  window.sessionStorage.setItem(INTERFACE_LOCALE_STORAGE_KEY, locale);
  window.sessionStorage.setItem(INTERFACE_LOCALE_READER_KEY, reader ?? "anonymous");
}

export function clearStoredInterfaceLocale() {
  try {
    window.sessionStorage.removeItem(INTERFACE_LOCALE_STORAGE_KEY);
    window.sessionStorage.removeItem(INTERFACE_LOCALE_READER_KEY);
  } catch {
    return;
  }
}
