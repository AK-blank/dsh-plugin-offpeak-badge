/**
 * DeepSeek peak / off-peak badge — host half (node half).
 *
 * This package contributes browser presentation only: the badge lives in the Web
 * client's sidebar brand seat (`sidebar.brand.name`), the collapsed-rail dot and
 * the screen-reader live region live in `shell.overlay`. The billing rule, the
 * holiday calendar and both locale dictionaries are all in the browser half
 * (`exports["./client"]` → `lib/client.js`), evaluated against Beijing wall-clock
 * time in the page.
 *
 * The empty `apply` therefore exists for one reason: it gives the Cordis Loader a
 * host row, which is what makes `dsh-client-modules`' incremental `dsh.client`
 * scan pick the browser half up and add it to the `__DSH_BOOT__` graph.
 *
 * Rule and data sources: see the header of `lib/client.js` and README.
 */

/** Host plugin body — this package ships browser presentation only. */
export function apply() {}
