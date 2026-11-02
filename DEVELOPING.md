# Developing Helmdeck

Prefer industry standards over internal re-implementations where they apply.

## Table standard

Consumer apps manage rich or server-driven grids with headless industry standards such as TanStack Table v8. The shipped in-memory data table (`AdminDataTable` and peers) is for bounded in-memory admin tables only, and stays in its deprecation window until retirement in a future major release.

For server-driven tables, bind the grid's state to the URL with `createAdminTableSearchAdapter`, which parses and serializes pagination (`page`/`pageSize`), sort (`field`/`direction`), search, and multi-value filters against a `URLSearchParams`. It reads the current query string through `useAdminSearchParams`, so the page still needs its `<Suspense>` boundary when statically generated, and it ships with no extra dependency. Defaults and query keys are typed and can be overridden per concern. Helmdeck adds no table dependency of its own; consumer apps bring their own grid, and use this adapter for the URL state.
