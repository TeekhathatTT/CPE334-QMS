/** Load state of data fetched from the API. `ready` keeps the last good data across refreshes. */
export type Loadable<T> = { state: 'loading' } | { state: 'error' } | { state: 'ready'; data: T };
