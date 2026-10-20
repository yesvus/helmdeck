// SPDX-License-Identifier: MIT
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminContactForm } from "../src/primitives/contact-form";

describe("AdminContactForm", () => {
  it("submits bounded fields and reports success", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AdminContactForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Subject"), "Question");
    await user.type(screen.getByLabelText("Message"), "Hello Helmdeck");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      name: "Ada Lovelace",
      email: "ada@example.com",
      subject: "Question",
      message: "Hello Helmdeck",
    }));
    expect(screen.getByRole("status")).toHaveTextContent("Your message was sent.");
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });

  it("reports a failed submission and preserves the fields", async () => {
    const user = userEvent.setup();
    render(<AdminContactForm onSubmit={async () => { throw new Error("failed"); }} />);
    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Subject"), "Question");
    await user.type(screen.getByLabelText("Message"), "Hello Helmdeck");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Your message could not be sent");
    expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace");
  });
});
