import type { Meta, StoryObj } from "@storybook/react";

import { observabilityFixture } from "@/data/observability/fixtures";

import { KpiCard } from "./KpiCard";

const meta = {
  title: "Observability/KpiCard",
  component: KpiCard,
  args: {
    kpi: observabilityFixture.kpis[0],
  },
} satisfies Meta<typeof KpiCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
