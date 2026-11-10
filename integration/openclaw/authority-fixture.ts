// Evaluation only: a native provider with no readable corpus or write capability.
// The host owns audience minting and lease validation. This fixture never mints it.
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
export default definePluginEntry({
  id: 'alfred-authority-fixture',
  name: 'Synthetic native provider fixture',
  description: 'Cloud evaluation only; no memory content, tools, hooks or writes.',
  kind: 'memory',
  register(api) {
    api.registerMemoryCapability({
      providerRuntime: {
        async open({ context }) {
          context.assertCurrent();
          context.signal?.throwIfAborted();
          return { provider: null, error: 'Synthetic provider has no corpus' };
        },
      },
    });
  },
});
