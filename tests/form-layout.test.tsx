// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminField, AdminFieldGrid, AdminFormActions } from "../src/primitives/field";
import { AdminInput, AdminTextarea, adminInputClassName } from "../src/primitives/input";

describe("form layout primitives", () => {
  it("connects a field label to its control and announces validation errors", () => {
    render(
      <AdminField id="email" label="E-posta" hint="İş e-posta adresinizi girin" error="Geçerli bir adres girin">
        <AdminInput id="email" aria-invalid="true" />
      </AdminField>,
    );

    expect(screen.getByLabelText("E-posta")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Geçerli bir adres girin");
  });

  it("uses a shared control scale and responsive layout classes", () => {
    const { container } = render(
      <>
        <AdminTextarea aria-label="Açıklama" />
        <AdminFieldGrid><div>Bir</div><div>İki</div></AdminFieldGrid>
        <AdminFormActions><button>Vazgeç</button><button>Kaydet</button></AdminFormActions>
      </>,
    );

    expect(screen.getByRole("textbox", { name: "Açıklama" })).toHaveClass("min-h-28");
    expect(adminInputClassName).toContain("h-11");
    expect(container.querySelector(".sm\\:grid-cols-2")).toBeInTheDocument();
    expect(container.querySelector(".sm\\:justify-end")).toBeInTheDocument();
  });
});
