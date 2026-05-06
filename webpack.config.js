const nodeExternals = require('webpack-node-externals');

/**
 * Workspace package @saas/common lives under node_modules and would otherwise be
 * externalized by webpack-node-externals. Node would then load `main` (.ts with ESM)
 * and throw "Cannot use import statement outside a module". Allowlist bundles it.
 */
module.exports = function (options) {
  return {
    externals: [
      nodeExternals({
        allowlist: [/^@saas\/common$/],
      }),
    ],
  };
};
