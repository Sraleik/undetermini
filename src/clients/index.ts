// The shipped clients, reachable as `undetermini/clients`.
//
// They live outside the main barrel on purpose: the TUI pulls in `ink`, an ESM
// module with top-level await, and anything that reaches it makes the package's
// CommonJS entry point unloadable — `require('undetermini')` would throw
// ERR_REQUIRE_ASYNC_MODULE even for a consumer that only wanted `EvalEngine`.
// This subpath is declared ESM-only, so a CJS caller gets a resolution error
// instead of a crash at first use.
export { runEvalCli } from './cli/runner';
export { runEvalTui } from './tui/runner';
