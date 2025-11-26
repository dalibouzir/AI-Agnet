import type { Meta, StoryObj } from "@storybook/react";

import { observabilityFixture } from "@/data/observability/fixtures";

import { RunsPanel } from "./RunsPanel";

const meta = {
  title: "Observability/RunsPanel",
  component: RunsPanel,
  args: {
    runs: observabilityFixture.runs.slice(0, 50),
    onExportJSON: () => {},
  },
} satisfies Meta<typeof RunsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
