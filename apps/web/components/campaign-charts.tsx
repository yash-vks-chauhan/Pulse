'use client';

import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

/**
 * Recharts visualisations for the campaign detail page, themed through the
 * shadcn <ChartContainer> (colours come from the app's CSS tokens, so they
 * adapt to dark mode). Three real-data charts: cumulative delivery over time,
 * the final status mix, and per-channel performance.
 */

export interface TimelinePoint {
  t: string;
  delivered: number;
  engaged: number;
  clicked: number;
}

export interface ChannelStat {
  channel: string;
  delivered: number;
  engaged: number;
  clicked: number;
}

/** Funnel-stage colours, shared across the charts and kept in sync with the
 *  delivery funnel (accent → violet → success). */
const STAGE_CONFIG = {
  delivered: { label: 'Delivered', color: 'hsl(var(--accent))' },
  engaged: { label: 'Opened / read', color: 'hsl(262 83% 62%)' },
  clicked: { label: 'Clicked', color: 'hsl(var(--success))' },
} satisfies ChartConfig;

function compact(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return `${value}`;
}

const timeTick = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/* ------------------------- delivery over time (area) ---------------------- */

export function DeliveryAreaChart({ data }: { data: TimelinePoint[] }) {
  return (
    <ChartContainer config={STAGE_CONFIG} className="aspect-auto h-[260px] w-full">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <defs>
          {(['delivered', 'engaged', 'clicked'] as const).map((key) => (
            <linearGradient key={key} id={`area-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.28} />
              <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="t"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={40}
          tickFormatter={timeTick}
        />
        <YAxis tickLine={false} axisLine={false} width={32} tickFormatter={compact} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value) =>
                new Date(value as string).toLocaleString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
              }
            />
          }
        />
        <Area
          dataKey="delivered"
          type="monotone"
          stroke="var(--color-delivered)"
          fill="url(#area-delivered)"
          strokeWidth={2}
        />
        <Area
          dataKey="engaged"
          type="monotone"
          stroke="var(--color-engaged)"
          fill="url(#area-engaged)"
          strokeWidth={2}
        />
        <Area
          dataKey="clicked"
          type="monotone"
          stroke="var(--color-clicked)"
          fill="url(#area-clicked)"
          strokeWidth={2}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  );
}

/* ----------------------------- status donut ------------------------------- */

const STATUS_ORDER = [
  'DELIVERED',
  'OPENED',
  'READ',
  'CLICKED',
  'CONVERTED',
  'SENT',
  'QUEUED',
  'FAILED',
] as const;

const STATUS_COLOR: Record<string, string> = {
  DELIVERED: 'hsl(var(--accent))',
  OPENED: 'hsl(262 83% 62%)',
  READ: 'hsl(262 83% 74%)',
  CLICKED: 'hsl(var(--success))',
  CONVERTED: 'hsl(161 94% 22%)',
  SENT: 'hsl(var(--muted-foreground))',
  QUEUED: 'hsl(var(--border))',
  FAILED: 'hsl(var(--destructive))',
};

export function StatusDonut({ statusCounts }: { statusCounts: Record<string, number> }) {
  const data = STATUS_ORDER.filter((status) => (statusCounts[status] ?? 0) > 0).map((status) => ({
    status,
    label: status.charAt(0) + status.slice(1).toLowerCase(),
    value: statusCounts[status] ?? 0,
    fill: STATUS_COLOR[status],
  }));
  const total = data.reduce((sum, item) => sum + item.value, 0);

  const config: ChartConfig = Object.fromEntries(
    data.map((item) => [item.status, { label: item.label, color: item.fill }]),
  );

  return (
    <ChartContainer config={config} className="mx-auto aspect-square h-[220px]">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="status" hideLabel />} />
        <Pie
          data={data}
          dataKey="value"
          nameKey="status"
          innerRadius={58}
          outerRadius={84}
          paddingAngle={2}
          strokeWidth={2}
        >
          {data.map((item) => (
            <Cell key={item.status} fill={item.fill} />
          ))}
          <Label
            content={({ viewBox }) => {
              if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                const cx = viewBox.cx ?? 0;
                const cy = viewBox.cy ?? 0;
                return (
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={cx} y={cy} className="fill-foreground text-2xl font-semibold tabular-nums">
                      {total.toLocaleString()}
                    </tspan>
                    <tspan x={cx} y={cy + 20} className="fill-muted-foreground text-[11px]">
                      messages
                    </tspan>
                  </text>
                );
              }
              return null;
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

/* -------------------------- per-channel (bars) ---------------------------- */

export function ChannelBarChart({ channels }: { channels: ChannelStat[] }) {
  const data = channels.map((channel) => ({
    channel: channel.channel.charAt(0).toUpperCase() + channel.channel.slice(1),
    delivered: channel.delivered,
    engaged: channel.engaged,
    clicked: channel.clicked,
  }));

  return (
    <ChartContainer config={STAGE_CONFIG} className="aspect-auto h-[240px] w-full">
      <BarChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="channel" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={32} tickFormatter={compact} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="delivered" fill="var(--color-delivered)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="engaged" fill="var(--color-engaged)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="clicked" fill="var(--color-clicked)" radius={[3, 3, 0, 0]} />
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  );
}
