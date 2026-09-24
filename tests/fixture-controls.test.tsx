import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AdminSelect } from "@yesvus/helmdeck";

describe("public fixture select control", () => {
  it("keeps native selection pointer-operable and reachable with the keyboard", async () => {
    const user = userEvent.setup();
    render(
      <label>
        Product status
        <AdminSelect aria-label="Product status" defaultValue="draft">
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </AdminSelect>
      </label>,
    );
    const select = screen.getByRole("combobox", { name: "Product status" });
    await user.tab();
    expect(select).toHaveFocus();
    await user.selectOptions(select, "published");
    expect(select).toHaveValue("published");
    await user.click(select);
    await user.selectOptions(select, "archived");
    expect(select).toHaveValue("archived");
  });
});
