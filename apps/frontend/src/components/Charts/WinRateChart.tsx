/**
 * Win Rate Chart Component
 * 
 * Use Recharts to display user win-rate stats (Improvement #14)
 */

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { MARKET_CATEGORIES } from '../MarketCategorySelector';

interface CategoryWinRate {
  category: string;
  winRate: number;
  totalPredictions: number;
  correctPredictions: number;
  averageReturn: number;
}

interface WinRateChartProps {
  data: CategoryWinRate[];
  overallWinRate: number;
  layout?: 'bar' | 'radar' | 'pie';
}

export default function WinRateChart({ data, overallWinRate, layout = 'bar' }: WinRateChartProps) {
  // Map category IDs to display names
  const chartData = data.map(item => {
    const categoryInfo = MARKET_CATEGORIES.find(cat => cat.id === item.category);
    return {
      ...item,
      categoryName: categoryInfo?.name || item.category,
      icon: categoryInfo?.icon || '📊',
      winRatePercent: item.winRate * 100,
    };
  });

  const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-4 rounded-lg shadow-lg border border-gray-200">
          <p className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <span className="text-xl">{data.icon}</span>
            {data.categoryName}
          </p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Win Rate:</span>
              <span className="font-semibold text-blue-600">{data.winRatePercent.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Correct:</span>
              <span className="font-semibold">{data.correctPredictions}/{data.totalPredictions}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Avg Return:</span>
              <span className={`font-semibold ${data.averageReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {data.averageReturn >= 0 ? '+' : ''}{(data.averageReturn * 100).toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  if (layout === 'radar') {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Win Rate by Category</h3>
          <p className="text-sm text-gray-600">Performance across different prediction categories</p>
        </div>
        
        <ResponsiveContainer width="100%" height={400}>
          <RadarChart data={chartData}>
            <PolarGrid stroke="#e5e7eb" />
            <PolarAngleAxis 
              dataKey="categoryName" 
              tick={{ fill: '#6b7280', fontSize: 12 }}
            />
            <PolarRadiusAxis 
              angle={90} 
              domain={[0, 100]} 
              tick={{ fill: '#6b7280', fontSize: 11 }}
            />
            <Radar 
              name="Win Rate" 
              dataKey="winRatePercent" 
              stroke="#3b82f6" 
              fill="#3b82f6" 
              fillOpacity={0.6} 
            />
            <Tooltip content={<CustomTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
        
        <div className="mt-4 text-center">
          <div className="inline-flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-full">
            <span className="text-sm text-gray-600">Overall Win Rate:</span>
            <span className="text-lg font-bold text-blue-600">{(overallWinRate * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>
    );
  }

  if (layout === 'pie') {
    // Pie chart showing distribution of predictions by category
    const pieData = chartData.map((item, index) => ({
      name: item.categoryName,
      value: item.totalPredictions,
      color: COLORS[index % COLORS.length],
      icon: item.icon,
    }));

    const CustomPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
      const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
      const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
      const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);

      return (
        <text 
          x={x} 
          y={y} 
          fill="white" 
          textAnchor={x > cx ? 'start' : 'end'} 
          dominantBaseline="central"
          fontSize="12"
          fontWeight="600"
        >
          {`${(percent * 100).toFixed(0)}%`}
        </text>
      );
    };

    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Prediction Distribution</h3>
          <p className="text-sm text-gray-600">Your activity across categories</p>
        </div>
        
        <ResponsiveContainer width="100%" height={400}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={CustomPieLabel}
              outerRadius={120}
              fill="#8884d8"
              dataKey="value"
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>

        <div className="grid grid-cols-2 gap-2 mt-4">
          {pieData.map((item, index) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: item.color }}
              ></div>
              <span className="text-gray-600">{item.icon} {item.name}:</span>
              <span className="font-semibold">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Default bar chart
  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Win Rate by Category</h3>
        <p className="text-sm text-gray-600">Your prediction accuracy across different categories</p>
      </div>
      
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis 
            dataKey="categoryName" 
            stroke="#6b7280"
            angle={-45}
            textAnchor="end"
            height={80}
            style={{ fontSize: '11px' }}
          />
          <YAxis 
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
            tickFormatter={(value) => `${value}%`}
            domain={[0, 100]}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          <Bar 
            dataKey="winRatePercent" 
            fill="#3b82f6" 
            name="Win Rate (%)"
            radius={[8, 8, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-4 flex justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          <span className="text-gray-600">Above 50%:</span>
          <span className="font-semibold">{chartData.filter(d => d.winRatePercent > 50).length}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          <span className="text-gray-600">Overall:</span>
          <span className="font-semibold text-blue-600">{(overallWinRate * 100).toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <span className="text-gray-600">Below 50%:</span>
          <span className="font-semibold">{chartData.filter(d => d.winRatePercent < 50).length}</span>
        </div>
      </div>
    </div>
  );
}
