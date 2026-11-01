# Developing Helmdeck

Prefer industry standards over internal re-implementations where they apply.

## Table standard

Consumer apps manage rich or server-driven grids with headless industry standards such as TanStack Table v8. The shipped in-memory data table (`AdminDataTable` and peers) is for bounded in-memory admin tables only, and stays in its deprecation window until retirement in a future major release. Helmdeck adds no table dependency of its own; consumer apps bring their own.
