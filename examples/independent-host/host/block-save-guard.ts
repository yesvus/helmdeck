export function createBlockSaveGuard() {
  let revision = 0;
  let pending = false;

  return {
    get pending() {
      return pending;
    },
    markChanged() {
      revision += 1;
    },
    save<T>(operation: () => Promise<T>) {
      if (pending) return null;
      pending = true;
      const savedRevision = revision;
      return operation()
        .then((value) => ({ value, unchanged: revision === savedRevision }))
        .finally(() => {
          pending = false;
        });
    },
  };
}
