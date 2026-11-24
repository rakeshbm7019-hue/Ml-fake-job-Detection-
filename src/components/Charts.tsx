import React, { useState } from 'react';
import type { TrainingEpochMetric } from '../types.ts';

interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export const DistributionRingChart: React.FC<{
  segments: DonutSegment[];
  centerValue: string;
  centerLabel: string;
}> = ({ segments, centerValue, centerLabel }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const size = 176;
  const strokeWidth = 22;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let cumulativeOffset = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative w-44 h-44 shrink-0">
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(148, 163, 184, 0.12)"
            strokeWidth={strokeWidth}
          />
          {total > 0 &&
            segments.map((seg, idx) => {
              if (seg.value <= 0) return null;
              const ratio = seg.value / total;
              const dashLength = ratio * circumference;
              const dashOffset = -cumulativeOffset;
              cumulativeOffset += dashLength;
              const isHovered = hoveredIdx === idx;
              return (
                <circle
                  key={seg.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={`${Math.max(dashLength - 2, 0)} ${circumference}`}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="butt"
                  className="transition-all duration-150 cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              );
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="text-2xl font-semibold text-slate-50 tabular-nums font-display">
            {hoveredIdx !== null ? segments[hoveredIdx].value : centerValue}
          </span>
          <span className="text-xs text-slate-400">
            {hoveredIdx !== null ? segments[hoveredIdx].label : centerLabel}
          </span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2.5">
        {segments.map((seg, idx) => {
          const pct = total > 0 ? ((seg.value / total) * 100).toFixed(1) : '0.0';
          return (
            <div
              key={seg.label}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-colors ${
                hoveredIdx === idx
                  ? 'bg-slate-800/70 border-slate-700'
                  : 'bg-slate-900/50 border-slate-800/70'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-sm text-slate-200">{seg.label}</span>
              </div>
              <div className="flex items-center gap-3 text-sm tabular-nums font-mono">
                <span className="text-slate-100 font-medium">{seg.value}</span>
                <span className="text-slate-400 w-12 text-right">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const LossCurveChart: React.FC<{
  data: TrainingEpochMetric[];
}> = ({ data }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!data || data.length < 2) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-slate-400">
        Train the classifier to view optimization loss curves.
      </div>
    );
  }

  const width = 560;
  const height = 210;
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const allLosses = data.flatMap((d) => [d.trainLoss, d.testLoss]);
  const minLoss = Math.min(...allLosses) * 0.9;
  const maxLoss = Math.max(...allLosses) * 1.05 || 1;

  const xPos = (idx: number) =>
    padL + (idx / (data.length - 1)) * innerW;
  const yPos = (val: number) =>
    padT + innerH - ((val - minLoss) / (maxLoss - minLoss || 1)) * innerH;

  const trainPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(d.trainLoss).toFixed(1)}`)
    .join(' ');
  const testPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(d.testLoss).toFixed(1)}`)
    .join(' ');

  const hovered = hoverIdx !== null ? data[hoverIdx] : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="w-3 h-0.5 bg-indigo-400 inline-block" />
            Train Log-Loss
          </span>
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="w-3 h-0.5 bg-sky-400 inline-block" />
            Test Log-Loss
          </span>
        </div>
        {hovered ? (
          <div className="font-mono tabular-nums text-slate-300">
            Epoch {hovered.epoch} · Train {hovered.trainLoss.toFixed(4)} · Test{' '}
            {hovered.testLoss.toFixed(4)} · Acc {(hovered.testAccuracy * 100).toFixed(1)}%
          </div>
        ) : (
          <div className="font-mono tabular-nums text-slate-400">
            Final Test Loss: {data[data.length - 1].testLoss.toFixed(4)}
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-52 overflow-visible">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padT + innerH * (1 - t);
          const val = minLoss + (maxLoss - minLoss) * t;
          return (
            <g key={t}>
              <line
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
                stroke="rgba(148, 163, 184, 0.1)"
                strokeDasharray="3 3"
              />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-500 text-[10px] font-mono"
              >
                {val.toFixed(2)}
              </text>
            </g>
          );
        })}

        <path d={trainPath} fill="none" stroke="#818CF8" strokeWidth="2.2" />
        <path d={testPath} fill="none" stroke="#38BDF8" strokeWidth="2.2" />

        {data.map((d, i) => (
          <g key={d.epoch}>
            <circle
              cx={xPos(i)}
              cy={yPos(d.trainLoss)}
              r={hoverIdx === i ? 4.5 : 2.5}
              fill="#818CF8"
            />
            <circle
              cx={xPos(i)}
              cy={yPos(d.testLoss)}
              r={hoverIdx === i ? 4.5 : 2.5}
              fill="#38BDF8"
            />
            <rect
              x={xPos(i) - innerW / (data.length * 2)}
              y={padT}
              width={innerW / data.length}
              height={innerH}
              fill="transparent"
              className="cursor-crosshair"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
            />
          </g>
        ))}

        {/* X axis epoch labels */}
        {[0, Math.floor((data.length - 1) / 2), data.length - 1].map((idx) => (
          <text
            key={idx}
            x={xPos(idx)}
            y={height - 6}
            textAnchor="middle"
            className="fill-slate-500 text-[10px] font-mono"
          >
            Ep {data[idx].epoch}
          </text>
        ))}
      </svg>
    </div>
  );
};

export const TimelineBarChart: React.FC<{
  series: { label: string; genuine: number; fake: number }[];
}> = ({ series }) => {
  if (!series || series.length === 0) {
    return (
      <div className="h-44 flex items-center justify-center text-sm text-slate-400">
        No prediction timeline yet. Analyze job postings to populate daily detection bars.
      </div>
    );
  }

  const maxVal = Math.max(1, ...series.map((s) => s.genuine + s.fake));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-slate-300">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
          Genuine
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" />
          Potentially Fake
        </span>
      </div>
      <div className="h-40 flex items-end gap-2 pt-2">
        {series.map((item) => {
          const genH = (item.genuine / maxVal) * 100;
          const fakeH = (item.fake / maxVal) * 100;
          return (
            <div
              key={item.label}
              className="flex-1 flex flex-col items-center gap-1.5 group"
              title={`${item.label}: ${item.genuine} Genuine, ${item.fake} Fake`}
            >
              <div className="w-full max-w-[38px] h-32 flex flex-col justify-end rounded-sm overflow-hidden bg-slate-900/70 border border-slate-800/70">
                {item.fake > 0 && (
                  <div
                    className="w-full bg-rose-500/90 transition-all duration-200 group-hover:bg-rose-400"
                    style={{ height: `${fakeH}%` }}
                  />
                )}
                {item.genuine > 0 && (
                  <div
                    className="w-full bg-emerald-500/90 transition-all duration-200 group-hover:bg-emerald-400"
                    style={{ height: `${genH}%` }}
                  />
                )}
              </div>
              <span className="text-[11px] font-mono text-slate-400 truncate max-w-full">
                {item.label.slice(5)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const HorizontalWeightBars: React.FC<{
  items: { label: string; value: number; subtitle?: string }[];
  barColor: string;
  emptyText?: string;
}> = ({ items, barColor, emptyText = 'No terms recorded yet.' }) => {
  if (!items || items.length === 0) {
    return <div className="text-sm text-slate-400 py-6 text-center">{emptyText}</div>;
  }

  const maxVal = Math.max(...items.map((i) => Math.abs(i.value)), 0.001);

  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const pct = Math.min(100, (Math.abs(item.value) / maxVal) * 100);
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-200 font-medium truncate pr-3">{item.label}</span>
              <span className="font-mono tabular-nums text-slate-400 shrink-0">
                {item.subtitle ? `${item.subtitle} · ` : ''}
                {item.value > 0 ? `+${item.value.toFixed(3)}` : item.value.toFixed(3)}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-800/80 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{ width: `${pct}%`, backgroundColor: barColor }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
