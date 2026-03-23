import { WebContainer } from '@webcontainer/api';
import { WORK_DIR_NAME } from '~/utils/constants';
import { cleanStackTrace } from '~/utils/stacktrace';

interface WebContainerContext {
  loaded: boolean;
}

export const webcontainerContext: WebContainerContext = import.meta.hot?.data.webcontainerContext ?? {
  loaded: false,
};

if (import.meta.hot) {
  import.meta.hot.data.webcontainerContext = webcontainerContext;
}

export let webcontainer: Promise<WebContainer> = new Promise(() => {
  // noop for ssr
});

if (!import.meta.env.SSR) {
  webcontainer =
    import.meta.hot?.data.webcontainer ??
    Promise.resolve()
      .then(() => {
        console.log('[WebContainer] Booting WebContainer...');
        return WebContainer.boot({
          coep: 'credentialless',
          workdirName: WORK_DIR_NAME,
          forwardPreviewErrors: true, // Enable error forwarding from iframes
        });
      })
      .then(async (webcontainer) => {
        console.log('[WebContainer] WebContainer booted successfully');
        webcontainerContext.loaded = true;

        const { workbenchStore } = await import('~/lib/stores/workbench');

        // Fetch and set preview script with error handling
        try {
          const response = await fetch('/inspector-script.js');

          if (response.ok) {
            const inspectorScript = await response.text();
            await webcontainer.setPreviewScript(inspectorScript);
            console.log('[WebContainer] Preview script installed');
          } else {
            console.warn('[WebContainer] Failed to fetch inspector script:', response.status);
          }
        } catch (error) {
          console.error('[WebContainer] Error setting preview script:', error);
        }

        // Listen for preview errors
        webcontainer.on('preview-message', (message) => {
          console.log('[WebContainer] Preview message:', message);

          // Handle both uncaught exceptions and unhandled promise rejections
          if (message.type === 'PREVIEW_UNCAUGHT_EXCEPTION' || message.type === 'PREVIEW_UNHANDLED_REJECTION') {
            const isPromise = message.type === 'PREVIEW_UNHANDLED_REJECTION';
            const title = isPromise ? 'Unhandled Promise Rejection' : 'Uncaught Exception';
            workbenchStore.actionAlert.set({
              type: 'preview',
              title,
              description: 'message' in message ? message.message : 'Unknown error',
              content: `Error occurred at ${message.pathname}${message.search}${message.hash}\nPort: ${message.port}\n\nStack trace:\n${cleanStackTrace(message.stack || '')}`,
              source: 'preview',
            });
          }
        });

        // Log server-ready events for debugging
        webcontainer.on('server-ready', (port, url) => {
          console.log('[WebContainer] Server ready on port:', port, 'URL:', url);
        });

        return webcontainer;
      })
      .catch((error) => {
        console.error('[WebContainer] Failed to boot:', error);
        throw error;
      });

  if (import.meta.hot) {
    import.meta.hot.data.webcontainer = webcontainer;
  }
}
