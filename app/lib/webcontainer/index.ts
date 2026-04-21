import { WebContainer } from '@webcontainer/api';
import { WORK_DIR_NAME } from '~/utils/constants';
import { cleanStackTrace } from '~/utils/stacktrace';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('WebContainer');

interface WebContainerContext {
  loaded: boolean;
}

export const webcontainerContext: WebContainerContext = import.meta.hot?.data.webcontainerContext ?? {
  loaded: false,
};

if (import.meta.hot) {
  import.meta.hot.data.webcontainerContext = webcontainerContext;
}

export let webcontainer: Promise<WebContainer> = new Promise((resolve, reject) => {
  if (import.meta.env?.TEST || (typeof process !== 'undefined' && process.env.NODE_ENV === 'test')) {
    return; // Prevent UnhandledPromiseRejection in tests
  }

  reject(new Error('WebContainer not initialized - SSR environment'));
});

if (!import.meta.hot?.data.webcontainer && !import.meta.env.SSR) {
  webcontainer = Promise.resolve()
    .then(() => {
      logger.info('Booting WebContainer...');
      return WebContainer.boot({
        coep: 'credentialless',
        workdirName: WORK_DIR_NAME,
        forwardPreviewErrors: true, // Enable error forwarding from iframes
      });
    })
    .then(async (webcontainerInstance) => {
      logger.info('WebContainer booted successfully');
      webcontainerContext.loaded = true;

      // Dynamic import with error handling
      let workbenchStore: typeof import('~/lib/stores/workbench').workbenchStore;

      try {
        const module = await import('~/lib/stores/workbench');
        workbenchStore = module.workbenchStore;
      } catch (error) {
        logger.error('Failed to import workbench store:', error);

        // Continue without workbench store - preview will still work
      }

      // Fetch and set preview script with error handling
      try {
        const response = await fetch('/inspector-script.js');

        if (response.ok) {
          const inspectorScript = await response.text();
          await webcontainerInstance.setPreviewScript(inspectorScript);
          logger.info('Preview script installed');
        } else {
          logger.warn('Failed to fetch inspector script:', response.status);
        }
      } catch (error) {
        logger.error('Error setting preview script:', error);
      }

      // Listen for preview errors with error boundary
      webcontainerInstance.on('preview-message', (message) => {
        try {
          logger.debug('Preview message:', message);

          // Handle both uncaught exceptions and unhandled promise rejections
          if (message.type === 'PREVIEW_UNCAUGHT_EXCEPTION' || message.type === 'PREVIEW_UNHANDLED_REJECTION') {
            if (workbenchStore) {
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
          }
        } catch (handlerError) {
          logger.error('Error in preview-message handler:', handlerError);
        }
      });

      // Log server-ready events for debugging
      webcontainerInstance.on('server-ready', (port, url) => {
        logger.info('Server ready on port:', port, 'URL:', url);
      });

      return webcontainerInstance;
    })
    .catch((error) => {
      logger.error('Failed to boot:', error);
      throw error;
    });

  if (import.meta.hot) {
    import.meta.hot.data.webcontainer = webcontainer;
  }
} else if (import.meta.hot?.data.webcontainer) {
  webcontainer = import.meta.hot.data.webcontainer;
}
