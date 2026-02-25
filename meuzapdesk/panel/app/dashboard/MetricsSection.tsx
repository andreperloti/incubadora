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

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string | number
  sub?: string
  accent: string
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: '#202c33', border: '1px solid #2a3942' }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#8696a0' }}>
        {label}
      </p>
      <p className={`text-3xl font-extrabold ${accent}`}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: '#667781' }}>{sub}</p>}
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
      <div className="mt-8 text-center text-sm py-8" style={{ color: '#8696a0' }}>
        Carregando métricas...
      </div>
    )
  }

  if (!metrics) return null

  const maxServico = Math.max(...metrics.servicos.map((s) => s.count), 1)

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Conversas abertas" value={metrics.kpis.abertas} accent="text-blue-400" />
        <KpiCard label="Resolvidas hoje" value={metrics.kpis.resolvidasHoje} accent="text-green-400" />
        <KpiCard
          label="Tempo médio"
          value={`${metrics.kpis.tempoMedioResposta} min`}
          sub="do início ao encerramento"
          accent="text-purple-400"
        />
        <KpiCard
          label="Alertas ativos"
          value={metrics.kpis.alertasAtivos}
          accent={metrics.kpis.alertasAtivos > 0 ? 'text-red-400' : 'text-gray-400'}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Ranking */}
        <div
          className="rounded-xl p-5"
          style={{ background: '#202c33', border: '1px solid #2a3942' }}
        >
          <h3 className="text-sm font-semibold mb-4" style={{ color: '#e9edef' }}>
            Ranking de atendentes (hoje)
          </h3>
          {metrics.ranking.length === 0 ? (
            <p className="text-sm" style={{ color: '#8696a0' }}>Nenhum atendimento encerrado hoje.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs border-b" style={{ color: '#8696a0', borderColor: '#2a3942' }}>
                  <th className="text-left pb-2">Atendente</th>
                  <th className="text-right pb-2">Atendidos</th>
                  <th className="text-right pb-2">Tempo médio</th>
                </tr>
              </thead>
              <tbody>
                {metrics.ranking.map((r, i) => (
                  <tr
                    key={r.name}
                    className="border-b last:border-0"
                    style={{ borderColor: '#2a3942' }}
                  >
                    <td className="py-2 font-medium" style={{ color: '#e9edef' }}>
                      <span className="mr-2 text-xs" style={{ color: '#8696a0' }}>#{i + 1}</span>
                      {r.name}
                    </td>
                    <td className="py-2 text-right font-bold text-green-400">{r.atendidas}</td>
                    <td className="py-2 text-right" style={{ color: '#8696a0' }}>{r.tempoMedio} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Serviços */}
        <div
          className="rounded-xl p-5"
          style={{ background: '#202c33', border: '1px solid #2a3942' }}
        >
          <h3 className="text-sm font-semibold mb-4" style={{ color: '#e9edef' }}>
            Serviços mais solicitados (hoje)
          </h3>
          {metrics.servicos.length === 0 ? (
            <p className="text-sm" style={{ color: '#8696a0' }}>Nenhum dado disponível.</p>
          ) : (
            <div className="space-y-3">
              {metrics.servicos.map((s) => (
                <div key={s.label}>
                  <div className="flex items-center justify-between text-xs mb-1" style={{ color: '#8696a0' }}>
                    <span>{s.label}</span>
                    <span className="font-semibold text-green-400">{s.count}</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: '#2a3942' }}>
                    <div
                      className="h-full rounded-full bg-green-500"
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
      <div
        className="rounded-xl p-5"
        style={{ background: '#202c33', border: '1px solid #2a3942' }}
      >
        <h3 className="text-sm font-semibold mb-4" style={{ color: '#e9edef' }}>
          Volume de conversas por hora (últimas 24h)
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart
            data={metrics.volumePorHora}
            margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorVol" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#25D366" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#25D366" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a3942" />
            <XAxis
              dataKey="hora"
              tick={{ fontSize: 10, fill: '#8696a0' }}
              interval={3}
              axisLine={{ stroke: '#2a3942' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#8696a0' }}
              allowDecimals={false}
              axisLine={{ stroke: '#2a3942' }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                background: '#2a3942',
                border: '1px solid #3d5060',
                color: '#e9edef',
              }}
              labelStyle={{ color: '#8696a0' }}
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
