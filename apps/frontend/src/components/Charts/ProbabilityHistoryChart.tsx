/**
 * Probability History Chart Component
 * 
 * AUDIT FIX v1.2.9 [F-25]: Renamed from ProbabilityChart to avoid confusion with market/ProbabilityChart
 * Use Recharts to show historical market probability changes over time
 */

'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';

interface ProbabilityDataPoint {
  timestamp: string;
  probability: number;
  yesPrice: number;
  noPrice: number;
  volume: number;
}

interface ProbabilityHistoryChartProps {
  data: ProbabilityDataPoint[];
  height?: number;
  showVolume?: boolean;
}

export default function ProbabilityHistoryChart({ data, height = 400, showVolume = true }: ProbabilityHistoryChartProps) {
  // Format data for display
  const chartData = data.map(point => ({
    ...point,
    time: new Date(point.timestamp).toLocaleDateString(),
    probabilityPercent: point.probability * 100,
    yesPercent: point.yesPrice * 100,
    noPercent: point.noPrice * 100,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 rounded-lg shadow-lg border border-gray-200">
          <p className="font-semibold text-gray-900 mb-2">{label}</p>
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span className="text-gray-600">Probability:</span>
              <span className="font-semibold">{payload[0].value.toFixed(2)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-gray-600">YES Price:</span>
              <span className="font-semibold">${(payload[1].value / 100).toFixed(4)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span className="text-gray-600">NO Price:</span>
              <span className="font-semibold">${(payload[2].value / 100).toFixed(4)}</span>
            </div>
            {showVolume && payload[3] && (
              <div className="flex items-center gap-2 pt-1 border-t border-gray-200">
                <span className="text-gray-600">Volume:</span>
                <span className="font-semibold">${(payload[3].value / 1e6).toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Market Probability Over Time</h3>
        <p className="text-sm text-gray-600">Track how market sentiment changes</p>
      </div>
      
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorProbability" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
            </linearGradient>
            <linearGradient id="colorYes" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.6}/>
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0.1}/>
            </linearGradient>
            <linearGradient id="colorNo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.6}/>
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis 
            dataKey="time" 
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
          />
          <YAxis 
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
            tickFormatter={(value) => `${value}%`}
            domain={[0, 100]}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="circle"
          />
          <Area 
            type="monotone" 
            dataKey="probabilityPercent" 
            stroke="#3b82f6" 
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorProbability)"
            name="Probability"
          />
          <Line 
            type="monotone" 
            dataKey="yesPercent" 
            stroke="#22c55e" 
            strokeWidth={2}
            dot={false}
            name="YES Price"
          />
          <Line 
            type="monotone" 
            dataKey="noPercent" 
            stroke="#ef4444" 
            strokeWidth={2}
            dot={false}
            name="NO Price"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
