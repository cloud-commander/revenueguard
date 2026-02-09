import { render, screen } from "@testing-library/react";
import { RevenueTicker } from "../RevenueTicker";
import { describe, it, expect } from "vitest";

describe("RevenueTicker Component", () => {
  it("should render revenue digits correctly", () => {
    render(<RevenueTicker value={123} mode="safe" label="Secured" />);

    // In 'en-GB', 123 becomes '£123'
    // We expect individual digits/chars: £, 1, 2, 3
    expect(screen.getByText("£")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Secured")).toBeInTheDocument();
  });

  it("should apply correct styling for safe mode", () => {
    render(<RevenueTicker value={100} mode="safe" />);
    // Check for success color class in the label container
    const label = screen.getByText("Revenue Secured");
    expect(label).toHaveClass("text-[var(--color-status-success)]");
  });

  it("should apply correct styling for eventual mode", () => {
    render(<RevenueTicker value={100} mode="eventual" />);
    const label = screen.getByText("Revenue Secured");
    expect(label).toHaveClass("text-[var(--color-status-alert)]");
  });
});
