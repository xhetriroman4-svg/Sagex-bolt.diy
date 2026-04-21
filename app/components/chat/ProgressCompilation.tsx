import { AnimatePresence, motion } from 'framer-motion';
import React, { useState, useEffect } from 'react';
import type { ProgressAnnotation } from '~/types/context';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';
import { useStore } from '@nanostores/react';
import { streamingState, tokenUsage, streamingStartTime } from '~/lib/stores/streaming';

function formatTokenCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }

  return String(count);
}

function getElapsedTime(startTime: number): string {
  if (!startTime) {
    return '';
  }

  const elapsed = Math.floor((Date.now() - startTime) / 1000);

  if (elapsed < 60) {
    return `${elapsed}s`;
  }

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return `${mins}m ${secs}s`;
}

export default function ProgressCompilation({ data }: { data?: ProgressAnnotation[] }) {
  const [progressList, setProgressList] = React.useState<ProgressAnnotation[]>([]);
  const [expanded, setExpanded] = useState(false);
  const isStreaming = useStore(streamingState);
  const usage = useStore(tokenUsage);
  const startTime = useStore(streamingStartTime);
  const [elapsed, setElapsed] = useState('');

  // Update elapsed timer during streaming
  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;

    if (!isStreaming || !startTime) {
      setElapsed('');
    } else {
      timer = setInterval(() => {
        setElapsed(getElapsedTime(startTime));
      }, 1000);
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [isStreaming, startTime]);

  React.useEffect(() => {
    if (!data || data.length == 0) {
      setProgressList([]);
      return;
    }

    const progressMap = new Map<string, ProgressAnnotation>();
    data.forEach((x) => {
      const existingProgress = progressMap.get(x.label);

      if (existingProgress && existingProgress.status === 'complete') {
        return;
      }

      progressMap.set(x.label, x);
    });

    const newData = Array.from(progressMap.values());
    newData.sort((a, b) => a.order - b.order);
    setProgressList(newData);
  }, [data]);

  if (progressList.length === 0 && !isStreaming) {
    return <></>;
  }

  const showTokenInfo = isStreaming || usage.totalTokens > 0;

  return (
    <AnimatePresence>
      <div
        className={classNames(
          'bg-bolt-elements-background-depth-2',
          'border border-bolt-elements-borderColor',
          'shadow-lg rounded-lg relative w-full max-w-chat mx-auto z-prompt',
          'p-1',
        )}
      >
        <div
          className={classNames(
            'bg-bolt-elements-item-backgroundAccent',
            'p-1 rounded-lg text-bolt-elements-item-contentAccent',
            'flex flex-wrap items-center gap-1',
          )}
        >
          <div className="flex-1 min-w-0">
            <AnimatePresence>
              {expanded ? (
                <motion.div
                  className="actions"
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: '0px' }}
                  transition={{ duration: 0.15 }}
                >
                  {progressList.map((x, i) => {
                    return <ProgressItem key={i} progress={x} />;
                  })}
                </motion.div>
              ) : (
                <ProgressItem progress={progressList.slice(-1)[0]} />
              )}
            </AnimatePresence>
          </div>

          {/* Token usage & elapsed time indicator */}
          {showTokenInfo && (
            <div className="flex items-center gap-2 text-xs px-2 py-0.5 rounded-md bg-black/20 text-bolt-elements-textSecondary whitespace-nowrap">
              {isStreaming && (
                <>
                  <span className="flex items-center gap-1">
                    <span className="i-svg-spinners:90-ring-with-bg text-xs" />
                    <span>Generating{elapsed ? ` (${elapsed})` : ''}...</span>
                  </span>
                </>
              )}
              {usage.totalTokens > 0 && (
                <span
                  className="flex items-center gap-1"
                  title={`Prompt: ${formatTokenCount(usage.promptTokens)} | Completion: ${formatTokenCount(usage.completionTokens)} | Total: ${formatTokenCount(usage.totalTokens)}`}
                >
                  <span className="i-ph:lightning" />
                  <span>{formatTokenCount(usage.completionTokens)} tokens</span>
                </span>
              )}
            </div>
          )}

          {progressList.length > 1 && (
            <motion.button
              initial={{ width: 0 }}
              animate={{ width: 'auto' }}
              exit={{ width: 0 }}
              transition={{ duration: 0.15, ease: cubicEasingFn }}
              className="p-1 rounded-lg bg-bolt-elements-item-backgroundAccent hover:bg-bolt-elements-artifacts-backgroundHover"
              onClick={() => setExpanded((v) => !v)}
            >
              <div className={expanded ? 'i-ph:caret-up-bold' : 'i-ph:caret-down-bold'}></div>
            </motion.button>
          )}
        </div>
      </div>
    </AnimatePresence>
  );
}

const ProgressItem = ({ progress }: { progress: ProgressAnnotation }) => {
  return (
    <motion.div
      className={classNames('flex text-sm gap-3')}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="flex items-center gap-1.5 ">
        <div>
          {progress.status === 'in-progress' ? (
            <div className="i-svg-spinners:90-ring-with-bg"></div>
          ) : progress.status === 'complete' ? (
            <div className="i-ph:check"></div>
          ) : null}
        </div>
      </div>
      {progress.message}
    </motion.div>
  );
};
