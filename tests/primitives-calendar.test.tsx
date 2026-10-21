// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminCalendar, AdminDatePicker, AdminDateRangePicker } from "../src/primitives/calendar";

describe("AdminCalendar", () => {
  it("renders the month and its days", () => {
    render(<AdminCalendar label="Pick a day" defaultMonth="2026-10" locale="en-GB" />);

    expect(screen.getByRole("grid", { name: "Pick a day" })).toBeInTheDocument();
    expect(screen.getByText("October 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thursday, 1 October 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saturday, 31 October 2026" })).toBeInTheDocument();
  });

  it("starts the week on the day the locale starts it", () => {
    const { unmount } = render(<AdminCalendar label="Days" defaultMonth="2026-10" locale="en-GB" />);
    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);
    expect(headers[0]).toMatch(/Mon/i);
    unmount();

    render(<AdminCalendar label="Days" defaultMonth="2026-10" locale="en-US" />);
    expect(screen.getAllByRole("columnheader")[0]?.textContent).toMatch(/Sun/i);
  });

  it("moves through the days with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<AdminCalendar label="Pick a day" defaultMonth="2026-10" locale="en-GB" />);

    const first = screen.getByRole("button", { name: "Thursday, 1 October 2026" });
    first.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Friday, 2 October 2026" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "Friday, 9 October 2026" })).toHaveFocus();
  });

  it("reports the day that was chosen", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AdminCalendar label="Pick a day" defaultMonth="2026-10" locale="en-GB" onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: "Monday, 12 October 2026" }));
    expect(onSelect).toHaveBeenCalledWith("2026-10-12");
  });

  it("marks the selected day and today", () => {
    const today = new Date();
    const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    render(<AdminCalendar label="Pick a day" defaultMonth={month} locale="en-GB" selected={`${month}-12`} />);
    expect(screen.getAllByRole("gridcell").find((cell) => cell.textContent === "12")).toHaveAttribute("aria-selected", "true");
    const todayButton = screen.getAllByRole("button").find((button) => button.getAttribute("aria-current") === "date");
    expect(todayButton).toBeInTheDocument();
  });

  it("puts a day in the month on screen in the tab order", () => {
    render(<AdminCalendar label="Pick a day" defaultMonth="2026-10" locale="en-GB" />);

    const focusable = screen.getAllByRole("button").filter((button) => button.getAttribute("tabindex") === "0");
    expect(focusable).toHaveLength(1);
    expect(focusable[0]).toHaveAccessibleName(/October 2026/);
  });

  it("reports a range as the two days are chosen", async () => {
    const user = userEvent.setup();
    const onRangeChange = vi.fn();
    render(
      <AdminCalendar
        label="Pick a range"
        defaultMonth="2026-10"
        locale="en-GB"
        range={{ from: "2026-10-08" }}
        onRangeChange={onRangeChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Monday, 12 October 2026" }));
    expect(onRangeChange).toHaveBeenCalledWith({ from: "2026-10-08", to: "2026-10-12" });
  });
});

describe("AdminDatePicker", () => {
  it("opens the calendar and reports the day that was chosen", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AdminDatePicker label="Due date" placeholder="Pick a day" value="2026-10-01" locale="en-GB" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Due date: 1 Oct 2026" }));
    expect(screen.getByRole("grid")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Monday, 12 October 2026" }));
    expect(onChange).toHaveBeenCalledWith("2026-10-12");
  });

  it("gives the focus back to the field when the calendar closes", async () => {
    const user = userEvent.setup();
    render(<AdminDatePicker label="Due date" value="2026-10-01" locale="en-GB" />);

    const trigger = screen.getByRole("button", { name: "Due date: 1 Oct 2026" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Monday, 12 October 2026" }));
    expect(trigger).toHaveFocus();
  });

  it("shows the day it holds", () => {
    render(<AdminDatePicker label="Due date" value="2026-10-12" locale="en-GB" />);
    expect(screen.getByRole("button", { name: "Due date: 12 Oct 2026" })).toHaveTextContent("12 Oct 2026");
  });
});

describe("AdminDateRangePicker", () => {
  it("shows the range it holds", () => {
    render(<AdminDateRangePicker label="Due between" from="2026-10-08" to="2026-10-12" locale="en-GB" />);
    expect(screen.getByRole("button", { name: "Due between: 8 Oct 2026 – 12 Oct 2026" })).toHaveTextContent("8 Oct 2026 – 12 Oct 2026");
  });
});
