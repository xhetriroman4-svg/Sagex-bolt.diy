import { useStore } from '@nanostores/react';
import { motion } from 'framer-motion';
import { Send, Plus, Clock, AlertCircle, CheckCircle, BarChart3, Globe, X } from 'lucide-react';
import { useState, useCallback } from 'react';
import {
  apiRequests,
  apiResponses,
  isSendingRequest,
  activeRequestId,
  activeResponseId,
  requestHistory,
  historyFilter,
  apiEnvironments,
  activeEnvironmentId,
  createRequest,
  updateRequest,
  sendRequest,
  switchEnvironment,
  getFilteredHistory,
  getApiUsageAnalytics,
  clearHistory,
} from '~/lib/stores/api-tester';
import { formatTokenCount } from '~/lib/stores/token-tracker';
import type { HttpMethod } from '~/lib/stores/api-tester';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'text-green-400',
  POST: 'text-yellow-400',
  PUT: 'text-blue-400',
  PATCH: 'text-purple-400',
  DELETE: 'text-red-400',
  HEAD: 'text-white/40',
  OPTIONS: 'text-white/40',
};

const STATUS_COLORS: Record<string, string> = {
  '2': 'text-green-400',
  '3': 'text-yellow-400',
  '4': 'text-orange-400',
  '5': 'text-red-400',
};

export default function ApiTester() {
  const $requests = useStore(apiRequests);
  const $responses = useStore(apiResponses);
  const $sending = useStore(isSendingRequest);
  const $activeReqId = useStore(activeRequestId);
  const $activeRespId = useStore(activeResponseId);
  const $history = useStore(requestHistory);
  const $filter = useStore(historyFilter);
  const $envs = useStore(apiEnvironments);
  const $activeEnvId = useStore(activeEnvironmentId);

  const [activeTab, setActiveTab] = useState<'request' | 'response' | 'history' | 'analytics'>('request');
  const [showEnvironments, setShowEnvironments] = useState(false);
  const [responseView, setResponseView] = useState<'body' | 'headers'>('body');

  const activeRequest = $activeReqId ? $requests[$activeReqId] : null;
  const activeResponse = $activeRespId ? $responses[$activeRespId] : null;
  const filteredHistory = getFilteredHistory();
  const analytics = getApiUsageAnalytics();

  const handleNewRequest = useCallback(() => {
    createRequest();
    setActiveTab('request');
  }, []);

  const handleSend = useCallback(async () => {
    if (!$activeReqId) {
      return;
    }

    await sendRequest($activeReqId);
    setActiveTab('response');
  }, [$activeReqId]);

  const handleMethodChange = useCallback(
    (method: HttpMethod) => {
      if (!$activeReqId) {
        return;
      }

      updateRequest($activeReqId, { method });
    },
    [$activeReqId],
  );

  const handleUrlChange = useCallback(
    (url: string) => {
      if (!$activeReqId) {
        return;
      }

      updateRequest($activeReqId, { url });
    },
    [$activeReqId],
  );

  const handleBodyChange = useCallback(
    (body: string) => {
      if (!$activeReqId) {
        return;
      }

      updateRequest($activeReqId, { body });
    },
    [$activeReqId],
  );

  const handleHeaderChange = useCallback(
    (index: number, field: 'key' | 'value', value: string) => {
      if (!activeRequest) {
        return;
      }

      const newHeaders = [...activeRequest.headers];
      newHeaders[index] = { ...newHeaders[index], [field]: value };
      updateRequest(activeRequest.id, { headers: newHeaders });
    },
    [activeRequest],
  );

  const addHeader = useCallback(() => {
    if (!activeRequest) {
      return;
    }

    updateRequest(activeRequest.id, {
      headers: [...activeRequest.headers, { key: '', value: '', enabled: true }],
    });
  }, [activeRequest]);

  const removeHeader = useCallback(
    (index: number) => {
      if (!activeRequest) {
        return;
      }

      const newHeaders = activeRequest.headers.filter((_, i) => i !== index);
      updateRequest(activeRequest.id, { headers: newHeaders });
    },
    [activeRequest],
  );

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const formatTime = (ms: number) => {
    if (ms < 1000) {
      return `${ms}ms`;
    }

    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="h-full flex flex-col bg-[#0a0a0f] text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold">API Tester</h3>
        </div>
        <div className="flex items-center gap-1">
          <select
            value={$activeEnvId || ''}
            onChange={(e) => e.target.value && switchEnvironment(e.target.value)}
            onClick={() => setShowEnvironments(!showEnvironments)}
            className="text-[11px] bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none"
          >
            {Object.values($envs).map((env) => (
              <option key={env.id} value={env.id}>
                {env.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleNewRequest}
            className="p-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 transition-colors"
            title="New Request"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-white/10 px-2">
        {(['request', 'response', 'history', 'analytics'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-xs font-medium transition-colors relative ${
              activeTab === tab ? 'text-white' : 'text-white/40 hover:text-white/60'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {activeTab === tab && (
              <motion.div layoutId="api-tab" className="absolute bottom-0 left-0 right-0 h-px bg-cyan-400" />
            )}
            {tab === 'history' && <span className="ml-1 text-[9px] text-white/20">{Object.keys($history).length}</span>}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Request Tab */}
        {activeTab === 'request' && activeRequest && (
          <div className="p-4 space-y-3">
            {/* Method + URL Row */}
            <div className="flex gap-2">
              <select
                value={activeRequest.method}
                onChange={(e) => handleMethodChange(e.target.value as HttpMethod)}
                className={`text-xs font-bold bg-white/5 border border-white/10 rounded px-2 py-2 outline-none w-24 ${METHOD_COLORS[activeRequest.method]}`}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m} className="text-white bg-[#1a1a2e]">
                    {m}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={activeRequest.url}
                onChange={(e) => handleUrlChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Enter request URL..."
                className="flex-1 text-xs bg-white/5 border border-white/10 rounded px-3 py-2 text-white placeholder:text-white/30 outline-none focus:border-cyan-500 font-mono"
                autoFocus
              />
              <button
                onClick={handleSend}
                disabled={$sending}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                {$sending ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                    <Send className="w-3.5 h-3.5" />
                  </motion.div>
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Send
              </button>
            </div>

            {/* Headers */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-white/50 font-medium">Headers</span>
                <button onClick={addHeader} className="text-[10px] text-cyan-400 hover:text-cyan-300">
                  + Add Header
                </button>
              </div>
              <div className="space-y-1">
                {activeRequest.headers.map((header, idx) => (
                  <div key={idx} className="flex gap-1.5 items-center">
                    <input
                      type="text"
                      value={header.key}
                      onChange={(e) => handleHeaderChange(idx, 'key', e.target.value)}
                      placeholder="Key"
                      className="flex-1 text-[11px] bg-white/5 border border-white/10 rounded px-2 py-1 text-white placeholder:text-white/20 outline-none font-mono"
                    />
                    <input
                      type="text"
                      value={header.value}
                      onChange={(e) => handleHeaderChange(idx, 'value', e.target.value)}
                      placeholder="Value"
                      className="flex-1 text-[11px] bg-white/5 border border-white/10 rounded px-2 py-1 text-white placeholder:text-white/20 outline-none font-mono"
                    />
                    <button onClick={() => removeHeader(idx)} className="p-1 hover:bg-red-500/10 rounded">
                      <X className="w-3 h-3 text-red-400/60" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Body */}
            {activeRequest.method !== 'GET' && activeRequest.method !== 'HEAD' && (
              <div>
                <span className="text-[11px] text-white/50 font-medium mb-1 block">Request Body</span>
                <textarea
                  value={activeRequest.body}
                  onChange={(e) => handleBodyChange(e.target.value)}
                  placeholder="Request body (JSON, form data, etc.)..."
                  className="w-full h-40 text-[11px] bg-white/5 border border-white/10 rounded p-3 text-white placeholder:text-white/20 outline-none font-mono resize-y"
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'request' && !activeRequest && (
          <div className="flex flex-col items-center justify-center h-full text-white/20 text-xs p-8 text-center">
            <Globe className="w-12 h-12 mb-3 opacity-20" />
            <p>No request selected</p>
            <p className="mt-1">Create a new request or select from history</p>
            <button
              onClick={handleNewRequest}
              className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded text-xs transition-colors"
            >
              New Request
            </button>
          </div>
        )}

        {/* Response Tab */}
        {activeTab === 'response' && activeResponse && (
          <div className="h-full flex flex-col">
            {/* Response Status Bar */}
            <div
              className={`flex items-center justify-between px-4 py-2 border-b border-white/10 ${
                activeResponse.status >= 200 && activeResponse.status < 300
                  ? 'bg-green-500/5'
                  : activeResponse.status >= 400
                    ? 'bg-red-500/5'
                    : 'bg-white/5'
              }`}
            >
              <div className="flex items-center gap-3">
                {activeResponse.error ? (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                ) : (
                  <CheckCircle
                    className={`w-4 h-4 ${activeResponse.status < 400 ? 'text-green-400' : 'text-red-400'}`}
                  />
                )}
                <span
                  className={`text-sm font-bold ${STATUS_COLORS[String(activeResponse.status)[0]] || 'text-white/40'}`}
                >
                  {activeResponse.status || 'ERR'}
                </span>
                <span className="text-xs text-white/30">{activeResponse.statusText}</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-white/30">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTime(activeResponse.responseTime)}
                </span>
                <span>{formatBytes(activeResponse.bodySize)}</span>
              </div>
            </div>

            {/* Response Sub-tabs */}
            <div className="flex border-b border-white/10 px-2">
              {(['body', 'headers'] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => setResponseView(view)}
                  className={`px-3 py-1.5 text-[11px] ${responseView === view ? 'text-white border-b border-white' : 'text-white/40'}`}
                >
                  {view.charAt(0).toUpperCase() + view.slice(1)}
                </button>
              ))}
            </div>

            {/* Response Content */}
            <div className="flex-1 overflow-auto p-4">
              {responseView === 'body' ? (
                activeResponse.error ? (
                  <p className="text-sm text-red-400">{activeResponse.error}</p>
                ) : (
                  <pre className="text-[11px] font-mono text-white/80 whitespace-pre-wrap break-all">
                    {activeResponse.body
                      ? (() => {
                          try {
                            return JSON.stringify(JSON.parse(activeResponse.body), null, 2);
                          } catch {
                            return activeResponse.body;
                          }
                        })()
                      : '(empty response)'}
                  </pre>
                )
              ) : (
                <div className="space-y-0.5">
                  {Object.entries(activeResponse.headers).map(([key, value]) => (
                    <div key={key} className="flex gap-2 text-[11px] font-mono">
                      <span className="text-cyan-400 shrink-0 w-40 truncate">{key}</span>
                      <span className="text-white/60 break-all">{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'response' && !activeResponse && (
          <div className="flex flex-col items-center justify-center h-full text-white/20 text-xs p-8 text-center">
            <Send className="w-12 h-12 mb-3 opacity-20" />
            <p>No response yet</p>
            <p className="mt-1">Send a request to see the response</p>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="h-full flex flex-col">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10">
              <input
                type="text"
                value={$filter}
                onChange={(e) => historyFilter.set(e.target.value)}
                placeholder="Filter history..."
                className="flex-1 text-xs bg-white/5 border border-white/10 rounded px-2 py-1 text-white placeholder:text-white/30 outline-none"
              />
              <button onClick={clearHistory} className="text-[10px] text-red-400/60 hover:text-red-400">
                Clear All
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredHistory.map((entry) => (
                <button
                  key={entry.response.id}
                  onClick={() => {
                    activeRequestId.set(entry.request.id);
                    activeResponseId.set(entry.response.id);
                    setActiveTab('request');
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-white/5 border-b border-white/5 text-left transition-colors"
                >
                  <span className={`text-[11px] font-bold w-16 ${METHOD_COLORS[entry.request.method]}`}>
                    {entry.request.method}
                  </span>
                  <span className="text-[11px] font-mono truncate flex-1 text-white/60">{entry.request.url}</span>
                  <span
                    className={`text-[11px] font-bold ${STATUS_COLORS[String(entry.response.status)[0]] || 'text-white/40'}`}
                  >
                    {entry.response.status || 'ERR'}
                  </span>
                  <span className="text-[10px] text-white/20">{formatTime(entry.response.responseTime)}</span>
                  <span className="text-[10px] text-white/15">
                    {new Date(entry.response.timestamp).toLocaleTimeString()}
                  </span>
                </button>
              ))}
              {filteredHistory.length === 0 && (
                <div className="text-center py-8 text-white/20 text-xs">No request history</div>
              )}
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="p-4 space-y-4">
            <h4 className="text-xs font-semibold text-white/70 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              API Usage Analytics
            </h4>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <div className="text-[10px] text-white/30">Total Requests</div>
                <div className="text-lg font-bold">{analytics.totalRequests}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <div className="text-[10px] text-white/30">Avg Response Time</div>
                <div className="text-lg font-bold">{formatTime(analytics.averageResponseTime)}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <div className="text-[10px] text-white/30">Success Rate</div>
                <div
                  className={`text-lg font-bold ${analytics.successRate >= 80 ? 'text-green-400' : analytics.successRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}
                >
                  {analytics.successRate}%
                </div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <div className="text-[10px] text-white/30">Data Transferred</div>
                <div className="text-lg font-bold">{formatBytes(analytics.totalDataTransferred)}</div>
              </div>
            </div>

            {analytics.tokensUsed > 0 && (
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <div className="text-[10px] text-white/30 mb-1">API Tokens Used</div>
                <div className="text-lg font-bold text-purple-400">{formatTokenCount(analytics.tokensUsed)}</div>
              </div>
            )}

            {Object.keys(analytics.byMethod).length > 0 && (
              <div>
                <div className="text-[10px] text-white/40 mb-1">Requests by Method</div>
                <div className="space-y-1">
                  {Object.entries(analytics.byMethod)
                    .sort((a, b) => b[1] - a[1])
                    .map(([method, count]) => (
                      <div key={method} className="flex items-center gap-2">
                        <span
                          className={`text-[11px] font-bold w-16 ${METHOD_COLORS[method as HttpMethod] || 'text-white/40'}`}
                        >
                          {method}
                        </span>
                        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-cyan-500/60 rounded-full"
                            style={{ width: `${(count / analytics.totalRequests) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-white/30 w-8 text-right">{count}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {Object.keys(analytics.byStatusRange).length > 0 && (
              <div>
                <div className="text-[10px] text-white/40 mb-1">Status Distribution</div>
                <div className="flex gap-2">
                  {Object.entries(analytics.byStatusRange).map(([range, count]) => (
                    <div key={range} className="flex-1 text-center bg-white/5 rounded-lg p-2">
                      <div className={`text-xs font-bold ${STATUS_COLORS[range[0]] || 'text-white/40'}`}>{count}</div>
                      <div className="text-[9px] text-white/30">{range}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
