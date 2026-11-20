# Validation

## Automated

- `npm test`: 9 tests passed; legacy/canonical JSON round trip, schema/reference validation, selected context semantics, transactional operations, concurrent revision conflict, corruption preservation, backup rotation, official MCP-client negotiation/resources/read/write/search/selection, read-only enforcement.
- `node scripts/check-packaged-mcp.mjs`: Linux packaged app.asar server works using the app's own runtime with ELECTRON_RUN_AS_NODE=1.
- `npm run test:web`: browser flow test covering editing, persistence, selection export, complete backup export, legacy import, invalid import rejection, cross-tab sync, small-screen dialog and CSP-compatible code.

## Actual Linux desktop checks

- Opened source desktop application and the packaged Linux binary.
- Created a word block via double click, confirmed JSON on disk.
- Closed and reopened the app; content persisted.
- Used MCP over stdio with the embedded runtime to create a block; observed it appear in the live desktop.
- Opened MCP panel; generated config points at actual executable/data directory; packaged config uses app.asar path.
- Exported context through the native save dialog and checked JSON contents.
- Found and fixed original toolbar pointer event propagation that cleared selection. Repeated selected export and verified exactly one selected node.
- Imported legacy JSON through the native picker and confirmation; observed restored graph and persisted revision.
- Drew a rectangle, then undid it.
- Simulated simultaneous title editing and MCP modification. Observed conflict banner; local unsaved text remained visible; disk retained Agent's change. Reload confirmation restored the current revision.
- Improved Chinese word block and edge-label wrapping.

## Platform limits

Windows x64 package can be produced with electron-builder. Local testing was Linux; Windows GUI and macOS were not tested. GitHub CI additionally builds Windows and Linux and runs the shared core/MCP tests. See actual Actions results for the commit, not merely this document. Unsigned desktop distribution; no remote HTTP MCP or automatic browser-to-desktop synchronization.
