import { render, screen } from "@testing-library/react";

import { observabilityFixture } from "@/data/observability/fixtures";

import { KpiCard } from "../KpiCard";

describe("KpiCard", () => {
  it("renders label and value", () => {
    const kpi = observabilityFixture.kpis[0];
    render(<KpiCard kpi={kpi} />);
    expect(screen.getByText(kpi.label)).toBeInTheDocument();
    expect(screen.getByText(String(kpi.value))).toBeInTheDocument();
  });
});
