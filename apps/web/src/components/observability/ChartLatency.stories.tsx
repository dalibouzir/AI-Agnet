import type { Meta, StoryObj } from "@storybook/react";

import { observabilityFixture } from "@/data/observability/fixtures";

import { ChartLatency } from "./ChartLatency";

const meta = {
  title: "Observability/ChartLatency",
  component: ChartLatency,
  args: {
    data: observabilityFixture.latency.slice(0, 240),
  },
} satisfies Meta<typeof ChartLatency>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
