import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileCode, Check, XCircle, Loader2, Zap, Clock, ChevronDown, ChevronUp
} from 'lucide-react';
import { useState } from 'react';
import {
  streamingSession, fileProgress, streamingSpeed, estimatedTimeRemaining,
  showProgressBar, getProgressPercentage, formatProgress, getActiveFiles,
  getCompletedFiles, getFailedFiles
} from '~/lib/stores/streaming-optimizer';
import { formatTokenCount } from '~/lib/stores/token-tracker';

export default function StreamingProgress() {
  const $session = useStore(streamingSession);
  const $show = useStore(showProgressBar);
  const $speed = useStore(streamingSpeed);
  const $eta = useStore(estimatedTimeRemaining);
  const $progress = fileProgress;
  const files = useStore($progress);

  const [expanded, setExpanded] = useState(false);

  const progress = getProgressPercentage();
  const isActive = $session.status === 'streaming' || $session.status === 'processing';
  const progressText = formatProgress();
  const activeFiles = getActiveFiles();
  const completedFiles = getCompletedFiles();
  const failedFiles = getFailedFiles();
  const fileList = Object.values(files);

  if ($session.status === 'idle' || !$show) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        className="mx-auto max-w-2xl mb-2"
      >
        <div className="rounded-xl border border-white/10 bg-[#12121a]/90 backdrop-blur-sm overflow-hidden">
          {/* Main Progress Bar */}
          <div className="px-4 py-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                {isActive ? (
                  <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                ) : $session.status === 'complete' ? (
                  <Check className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-red-400" />
                )}
                <span className="text-xs font-medium">
                  {$session.status === 'streaming' ? 'Generating...' :
                   $session.status === 'processing' ? 'Processing...' :
                   $session.status === 'complete' ? 'Complete' : 'Error'}
                </span>
              </div>
              <span className="text-[11px] text-white/50 font-mono">{progressText}</span>
            </div>

            {/* Progress Bar */}
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full transition-all ${
                  $session.status === 'complete' ? 'bg-green-500' :
                  $session.status === 'error' ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-purple-500'
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>

            {/* Stats Row */}
            <div className="flex items-center justify-between mt-1.5 text-[10px] text-white/30">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <FileCode className="w-3 h-3" />
                  {$session.completedFiles}/{$session.totalFiles} files
                </span>
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {formatTokenCount($session.consumedTokens)} tokens
                </span>
              </div>
              {$session.totalFiles > 1 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1 hover:text-white/60 transition-colors"
                >
                  Details
                  {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
            </div>
          </div>

          {/* Expanded File List */}
          <AnimatePresence>
            {expanded && fileList.length > 0 && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                className="border-t border-white/5 overflow-hidden"
              >
                <div className="max-h-48 overflow-y-auto px-4 py-2 space-y-0.5">
                  {fileList.map((file) => (
                    <div key={file.fileId} className="flex items-center gap-2 py-0.5 text-[11px]">
                      {file.status === 'streaming' && (
                        <Loader2 className="w-3 h-3 text-blue-400 animate-spin shrink-0" />
                      )}
                      {file.status === 'complete' && (
                        <Check className="w-3 h-3 text-green-400 shrink-0" />
                      )}
                      {file.status === 'failed' && (
                        <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                      )}
                      {file.status === 'pending' && (
                        <Clock className="w-3 h-3 text-white/20 shrink-0" />
                      )}
                      <span className={`truncate ${file.status === 'streaming' ? 'text-blue-300' : 'text-white/40'}`}>
                        {file.filePath.split('/').pop()}
                      </span>
                      <span className="ml-auto text-[9px] text-white/20 shrink-0">
                        {file.filePath.split('/').slice(0, -1).join('/').replace('/home/project', '') || '/'}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
