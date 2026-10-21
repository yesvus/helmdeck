// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminField } from "../src/primitives/field";
import {
  AdminCheckbox,
  AdminRadioGroup,
  AdminSwitch,
  AdminToggle,
} from "../src/primitives/form-controls";
import { AdminTable } from "../src/primitives/table";

describe("AdminCheckbox", () => {
  it("takes its name, description and error state from the field around it", () => {
    render(
      <AdminField label="Send a receipt" hint="The receipt goes to the billing address" error="Choose an address" id="receipt">
        <AdminCheckbox />
      </AdminField>,
    );

    const checkbox = screen.getByRole("checkbox", { name: "Send a receipt" });
    expect(checkbox).toHaveAttribute("id", "receipt");
    expect(checkbox).toHaveAttribute("aria-invalid", "true");
    expect(checkbox.getAttribute("aria-describedby")).toContain("receipt-hint");
    expect(checkbox.getAttribute("aria-describedby")).toContain("receipt-error");
    expect(screen.getByRole("alert")).toHaveTextContent("Choose an address");
  });

  it("is reachable and toggled with the keyboard", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AdminCheckbox aria-label="Include archived" onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox", { name: "Include archived" });
    await user.tab();
    expect(checkbox).toHaveFocus();
    await user.keyboard(" ");
    expect(onChange).toHaveBeenCalled();
    expect(checkbox).toBeChecked();
  });

  it("reports a partly selected state", () => {
    render(<AdminCheckbox aria-label="Select all" indeterminate />);
    expect(screen.getByRole("checkbox", { name: "Select all" })).toHaveProperty("indeterminate", true);
  });
});

describe("AdminSwitch", () => {
  it("reports its state as a switch and toggles with the space key", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<AdminSwitch aria-label="Email notifications" onCheckedChange={onCheckedChange} />);

    const control = screen.getByRole("switch", { name: "Email notifications" });
    expect(control).not.toBeChecked();
    await user.tab();
    await user.keyboard(" ");
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(control).toBeChecked();
  });

  it("takes its name and error state from the field around it", () => {
    render(
      <AdminField label="Email notifications" error="Turned off by policy" id="notifications">
        <AdminSwitch />
      </AdminField>,
    );

    const control = screen.getByRole("switch", { name: "Email notifications" });
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control.getAttribute("aria-describedby")).toContain("notifications-error");
  });
});

describe("AdminRadioGroup", () => {
  const options = [
    { value: "published", label: "Published" },
    { value: "draft", label: "Draft", hint: "Not visible to visitors" },
    { value: "archived", label: "Archived" },
  ];

  it("is named by the field's label and reports the chosen value", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <AdminField label="Status" id="status">
        <AdminRadioGroup name="status" options={options} onValueChange={onValueChange} />
      </AdminField>,
    );

    const group = screen.getByRole("radiogroup", { name: "Status" });
    expect(group).toHaveAttribute("id", "status");
    await user.click(screen.getByRole("radio", { name: "Draft" }));
    expect(onValueChange).toHaveBeenCalledWith("draft");
    expect(screen.getByRole("radio", { name: "Draft" })).toBeChecked();
  });

  it("moves between the options with the arrow keys", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <AdminRadioGroup name="status" options={options} defaultValue="published" onValueChange={onValueChange} />,
    );

    await user.tab();
    expect(screen.getByRole("radio", { name: "Published" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(onValueChange).toHaveBeenCalledWith("draft");
    expect(screen.getByRole("radio", { name: "Draft" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(onValueChange).toHaveBeenLastCalledWith("published");
  });

  it("skips a disabled option when it moves", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <AdminRadioGroup
        name="status"
        options={[options[0], { ...options[1], disabled: true }, options[2]]}
        defaultValue="published"
        onValueChange={onValueChange}
      />,
    );

    await user.tab();
    await user.keyboard("{ArrowDown}");
    expect(onValueChange).toHaveBeenCalledWith("archived");
  });
});

describe("AdminToggle", () => {
  it("reports its state and toggles when it is pressed", async () => {
    const user = userEvent.setup();
    const onPressedChange = vi.fn();
    render(
      <AdminToggle pressed={false} onPressedChange={onPressedChange}>
        Compact
      </AdminToggle>,
    );

    const toggle = screen.getByRole("button", { name: "Compact" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.tab();
    await user.keyboard("{Enter}");
    expect(onPressedChange).toHaveBeenCalledWith(true);
  });

  it("takes its name from the field's label", () => {
    render(
      <AdminField label="Compact density" id="density">
        <AdminToggle pressed />
      </AdminField>,
    );

    const toggle = screen.getByRole("button", { name: "Compact density" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });
});

describe("the table's row selection", () => {
  it("uses the checkbox primitive and reports a partly selected header", () => {
    render(
      <AdminTable
        columns={[{ key: "name", header: "Name", cell: (row: { name: string }) => row.name }]}
        rows={[{ name: "First" }, { name: "Second" }]}
        getKey={(row) => row.name}
        selection={{
          selectedKeys: new Set(["First"]),
          onSelectionChange: () => {},
          label: "Row",
          selectAllLabel: "Select every row",
        }}
      />,
    );

    const header = screen.getByRole("checkbox", { name: "Select every row" });
    expect(header).toHaveProperty("indeterminate", true);
    expect(header).toHaveClass("accent-brand-600");
    expect(screen.getByRole("checkbox", { name: "Row First" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Row Second" })).not.toBeChecked();
  });
});
