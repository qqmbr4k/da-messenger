import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'

interface BridgeStats {
  connected: boolean
  connectedAt: string | null
  domain: string
  ejabberdHost: string
  messagesIn: number
  messagesOut: number
  reconnectAttempts: number
  federationSessions: number
}

interface XmppStatus {
  bridge: BridgeStats
  ejabberd: { registeredUsers: number } | null
}

interface FederationInfo {
  s2sSessions: any
  bridgeStats: BridgeStats
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${ok ? 'bg-green-700 text-green-100' : 'bg-red-800 text-red-200'}`}>
      {ok ? 'Connected' : 'Disconnected'}
    </span>
  )
}

export default function XmppAdminPanel() {
  const { data: status, isLoading: loadingStatus } = useQuery<XmppStatus>({
    queryKey: ['xmpp-stats'],
    queryFn: () => api.get('/xmpp/stats').then(r => r.data),
    refetchInterval: 10_000,
  })

  const { data: sessions, isLoading: loadingSessions } = useQuery<any[]>({
    queryKey: ['xmpp-sessions'],
    queryFn: () => api.get('/xmpp/sessions').then(r => r.data),
    refetchInterval: 15_000,
  })

  const { data: federation } = useQuery<FederationInfo>({
    queryKey: ['xmpp-federation'],
    queryFn: () => api.get('/xmpp/federation').then(r => r.data),
    refetchInterval: 15_000,
  })

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">XMPP / Jabber Administration</h1>

      {/* Bridge Status */}
      <section className="bg-gray-800 rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-gray-200">Bridge Status</h2>
        {loadingStatus ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : status ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              <p className="text-gray-400">Component connection</p>
              <StatusBadge ok={status.bridge.connected} />
            </div>
            <div className="space-y-1">
              <p className="text-gray-400">Domain</p>
              <p className="text-gray-200 font-mono">{status.bridge.domain}</p>
            </div>
            <div className="space-y-1">
              <p className="text-gray-400">Connected since</p>
              <p className="text-gray-200">
                {status.bridge.connectedAt
                  ? new Date(status.bridge.connectedAt).toLocaleString()
                  : '—'}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-gray-400">Reconnect attempts</p>
              <p className="text-gray-200">{status.bridge.reconnectAttempts}</p>
            </div>
            <div className="space-y-1">
              <p className="text-gray-400">Messages in (XMPP→Web)</p>
              <p className="text-green-400 font-mono">{status.bridge.messagesIn}</p>
            </div>
            <div className="space-y-1">
              <p className="text-gray-400">Messages out (Web→XMPP)</p>
              <p className="text-blue-400 font-mono">{status.bridge.messagesOut}</p>
            </div>
            {status.ejabberd && (
              <div className="space-y-1">
                <p className="text-gray-400">Registered XMPP users</p>
                <p className="text-gray-200">{status.ejabberd.registeredUsers ?? '—'}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-red-400 text-sm">Failed to load bridge status</p>
        )}
      </section>

      {/* Connected XMPP Clients */}
      <section className="bg-gray-800 rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-gray-200">Connected XMPP Clients</h2>
        {loadingSessions ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : sessions && sessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2 pr-4">JID</th>
                  <th className="pb-2 pr-4">IP</th>
                  <th className="pb-2 pr-4">Client</th>
                  <th className="pb-2">Priority</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s: any, i: number) => (
                  <tr key={i} className="border-b border-gray-750 text-gray-300">
                    <td className="py-1.5 pr-4 font-mono text-xs">{s.jid || s.user || '—'}</td>
                    <td className="py-1.5 pr-4 font-mono text-xs">{s.ip || '—'}</td>
                    <td className="py-1.5 pr-4">{s.client_version || s.connection || '—'}</td>
                    <td className="py-1.5">{s.priority ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">
            {sessions && sessions.length === 0
              ? 'No XMPP clients currently connected'
              : 'ejabberd not reachable — start the stack with federation profile to enable'}
          </p>
        )}
      </section>

      {/* Federation (S2S) */}
      <section className="bg-gray-800 rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-gray-200">Federation (Server-to-Server)</h2>
        <div className="text-sm space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-gray-400">Outgoing S2S sessions:</span>
            <span className="text-gray-200 font-mono">
              {federation
                ? typeof federation.s2sSessions === 'number'
                  ? federation.s2sSessions
                  : JSON.stringify(federation.s2sSessions)
                : '—'}
            </span>
          </div>
          <div className="bg-gray-750 rounded p-3 text-xs text-gray-400 space-y-1">
            <p className="font-semibold text-gray-300">How to test federation:</p>
            <p>1. Start the second XMPP node: <code className="bg-gray-700 px-1 rounded">docker compose --profile federation up -d ejabberd-b</code></p>
            <p>2. Connect a Jabber client to <code className="bg-gray-700 px-1 rounded">localhost:5222</code> (server A) and another to <code className="bg-gray-700 px-1 rounded">localhost:5223</code> (server B)</p>
            <p>3. Add contact <code className="bg-gray-700 px-1 rounded">user@xmpp-b.localhost</code> from server A — federation handshake will appear above</p>
            <p>4. Domains: <code className="bg-gray-700 px-1 rounded">xmpp.localhost</code> and <code className="bg-gray-700 px-1 rounded">xmpp-b.localhost</code></p>
          </div>
        </div>
      </section>

      {/* Connection guide */}
      <section className="bg-gray-800 rounded-lg p-4 space-y-2">
        <h2 className="font-semibold text-gray-200">How to connect via Jabber client</h2>
        <div className="text-sm text-gray-400 space-y-1">
          <p>Use any XMPP client (Gajim, Pidgin, Conversations, etc.) with these settings:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-2">
            <li>Server: <code className="bg-gray-700 text-gray-200 px-1 rounded">xmpp.localhost</code> (port 5222)</li>
            <li>Username: your DAMessenger username</li>
            <li>Password: your DAMessenger password</li>
            <li>TLS: optional (disabled in dev)</li>
          </ul>
          <p className="mt-2">Messages exchanged via the Jabber client will appear in the web UI and vice versa.</p>
        </div>
      </section>
    </div>
  )
}
