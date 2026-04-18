import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { format } from 'date-fns'

interface Session {
  id: string
  userAgent: string | null
  ipAddress: string | null
  createdAt: string
  expiresAt: string
  isCurrent: boolean
}

export default function SessionsPanel() {
  const qc = useQueryClient()

  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ['sessions'],
    queryFn: () => api.get('/auth/sessions').then(r => r.data),
  })

  const logout = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#313338]">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-white mb-1">Active Sessions</h1>
        <p className="text-[#949ba4] text-sm mb-5">These are all the devices currently logged into your account.</p>
        <div className="space-y-3">
          {sessions.map(s => (
            <div
              key={s.id}
              className={`bg-[#2b2d31] rounded-xl p-4 border transition-colors ${
                s.isCurrent ? 'border-[#5865f2]/50' : 'border-[#3f4248]'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#383a40] flex items-center justify-center text-xl shrink-0">
                    {s.userAgent?.includes('Mobile') ? '📱' : '💻'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-white">{s.userAgent?.split(' ')[0] || 'Unknown browser'}</p>
                      {s.isCurrent && (
                        <span className="text-[11px] bg-[#5865f2]/20 text-[#5865f2] border border-[#5865f2]/30 rounded-full px-2 py-0.5 font-semibold">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#6b6f78] mt-0.5">{s.ipAddress || 'Unknown IP'}</p>
                    <p className="text-xs text-[#4f5258] mt-0.5">Started {format(new Date(s.createdAt), 'MMM d, yyyy HH:mm')}</p>
                  </div>
                </div>
                <button
                  onClick={() => logout.mutate(s.id)}
                  className="text-xs text-[#949ba4] hover:text-red-400 border border-[#3f4248] hover:border-red-900 rounded-lg px-3 py-1.5 transition-colors shrink-0"
                >
                  {s.isCurrent ? 'Sign out' : 'Revoke'}
                </button>
              </div>
            </div>
          ))}
          {sessions.length === 0 && (
            <p className="text-[#6b6f78] text-sm">No active sessions found.</p>
          )}
        </div>
      </div>
    </div>
  )
}
