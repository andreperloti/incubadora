'use client'

import { useEffect, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

type Metrics = {
  kpis: {
    abertas: number
    resolvidasHoje: number
    tempoMedioResposta: number
    alertasAtivos: number
  }
  ranking: { name: string; atendidas: number; tempoMedio: number }[]
  servicos: { label: string; count: number }[]
  volumePorHora: { hora: string; conversas: number }[]
}

function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-extrabold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export function MetricsSection() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/metrics')
      .then((r) => r.json())
      .then((data) => {
        setMetrics(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="mt-8 text-center text-gray-400 text-sm py-8">
        Carregando métricas...
      </div>
    )
  }

  if (!metrics) return null

  const maxServico = Math.max(...metrics.servicos.map((s) => s.count), 1)

  return (
    <div className="mt-10 space-y-8">
      <h2 className="text-lg font-semibold text-gray-800">Métricas do dia</h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Conversas abertas"
          value={metrics.kpis.abertas}
          color="text-blue-600"
        />
        <KpiCard
          label="Resolvidas hoje"
          value={metrics.kpis.resolvidasHoje}
          color="text-green-600"
        />
        <KpiCard
          label="Tempo médio"
          value={`${metrics.kpis.tempoMedioResposta} min`}
          sub="do início ao encerramento"
          color="text-purple-600"
        />
        <KpiCard
          label="Alertas ativos"
          value={metrics.kpis.alertasAtivos}
          color={metrics.kpis.alertasAtivos > 0 ? 'text-red-600' : 'text-gray-500'}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Ranking de atendentes */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Ranking de atendentes (hoje)</h3>
          {metrics.ranking.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum atendimento encerrado hoje.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left pb-2">Atendente</th>
                  <th className="text-right pb-2">Atendidos</th>
                  <th className="text-right pb-2">Tempo médio</th>
                </tr>
              </thead>
              <tbody>
                {metrics.ranking.map((r, i) => (
                  <tr key={r.name} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 font-medium text-gray-800">
                      <span className="text-gray-400 mr-2 text-xs">#{i + 1}</span>
                      {r.name}
                    </td>
                    <td className="py-2 text-right text-green-600 font-bold">{r.atendidas}</td>
                    <td className="py-2 text-right text-gray-500">{r.tempoMedio} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Serviços mais solicitados */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Serviços mais solicitados (hoje)
          </h3>
          {metrics.servicos.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum dado disponível.</p>
          ) : (
            <div className="space-y-3">
              {metrics.servicos.map((s) => (
                <div key={s.label}>
                  <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                    <span>{s.label}</span>
                    <span className="font-semibold">{s.count}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${(s.count / maxServico) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Volume por hora */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Volume de conversas por hora (últimas 24h)
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={metrics.volumePorHora} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorVol" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#25D366" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#25D366" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="hora"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              interval={3}
            />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
            />
            <Area
              type="monotone"
              dataKey="conversas"
              stroke="#25D366"
              strokeWidth={2}
              fill="url(#colorVol)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
