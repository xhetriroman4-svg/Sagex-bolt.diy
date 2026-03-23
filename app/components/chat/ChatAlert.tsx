import { AnimatePresence, motion } from 'framer-motion';
import type { ActionAlert } from '~/types/actions';
import { classNames } from '~/utils/classNames';

interface Props {
  alert: ActionAlert;
  clearAlert: () => void;
  postMessage: (message: string) => void;
}

export default function ChatAlert({ alert, clearAlert, postMessage }: Props) {
  const { description, content, source, suggestions, isRecoverable, command } = alert;

  const isPreview = source === 'preview';
  const title = isPreview ? 'Preview Error' : 'Terminal Error';
  const message = isPreview
    ? 'We encountered an error while running the preview. Would you like Bolt to analyze and help resolve this issue?'
    : 'We encountered an error while running terminal commands. Would you like Bolt to analyze and help resolve this issue?';

  const handleAskBolt = () => {
    let promptMessage = `*Fix this ${isPreview ? 'preview' : 'terminal'} error*\n\n`;

    // Add error description
    promptMessage += `**Error:** ${description}\n\n`;

    // Add command if available
    if (command) {
      promptMessage += `**Command:** \`\`\`sh\n${command}\n\`\`\`\n\n`;
    }

    // Add error output
    promptMessage += `**Output:**\n\`\`\`${isPreview ? 'js' : 'sh'}\n${content}\n\`\`\`\n\n`;

    // Add suggestions if available
    if (suggestions && suggestions.length > 0) {
      promptMessage += `**Possible solutions I've identified:**\n`;
      suggestions.forEach((s, i) => {
        promptMessage += `${i + 1}. ${s}\n`;
      });
      promptMessage += '\n';
    }

    // Add recovery note if applicable
    if (isRecoverable) {
      promptMessage += `*This error appears to be recoverable. Please help me fix it.*\n`;
    }

    postMessage(promptMessage);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className={`rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 mb-2`}
      >
        <div className="flex items-start">
          {/* Icon */}
          <motion.div
            className="flex-shrink-0"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className={`i-ph:warning-duotone text-xl text-bolt-elements-button-danger-text`}></div>
          </motion.div>
          {/* Content */}
          <div className="ml-3 flex-1">
            <motion.h3
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className={`text-sm font-medium text-bolt-elements-textPrimary flex items-center gap-2`}
            >
              {title}
              {isRecoverable && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-500">Recoverable</span>
              )}
            </motion.h3>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className={`mt-2 text-sm text-bolt-elements-textSecondary`}
            >
              <p>{message}</p>
              {description && (
                <div className="text-xs text-bolt-elements-textSecondary p-2 bg-bolt-elements-background-depth-3 rounded mt-4 mb-4 font-mono overflow-x-auto">
                  Error: {description}
                </div>
              )}

              {/* Show suggestions if available */}
              {suggestions && suggestions.length > 0 && (
                <div className="mt-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                  <div className="flex items-center gap-2 text-blue-400 text-xs font-medium mb-2">
                    <div className="i-ph:lightbulb-duotone"></div>
                    Suggested Solutions
                  </div>
                  <ul className="text-xs text-bolt-elements-textSecondary space-y-1.5">
                    {suggestions.map((suggestion, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="text-blue-400 mt-0.5">•</span>
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>

            {/* Actions */}
            <motion.div
              className="mt-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className={classNames('flex gap-2')}>
                <button
                  onClick={handleAskBolt}
                  className={classNames(
                    `px-3 py-1.5 rounded-md text-sm font-medium`,
                    'bg-bolt-elements-button-primary-background',
                    'hover:bg-bolt-elements-button-primary-backgroundHover',
                    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bolt-elements-button-danger-background',
                    'text-bolt-elements-button-primary-text',
                    'flex items-center gap-1.5',
                  )}
                >
                  <div className="i-ph:chat-circle-duotone"></div>
                  Ask Bolt to Fix
                </button>
                <button
                  onClick={clearAlert}
                  className={classNames(
                    `px-3 py-1.5 rounded-md text-sm font-medium`,
                    'bg-bolt-elements-button-secondary-background',
                    'hover:bg-bolt-elements-button-secondary-backgroundHover',
                    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bolt-elements-button-secondary-background',
                    'text-bolt-elements-button-secondary-text',
                  )}
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
