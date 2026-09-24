// SPDX-License-Identifier: MIT

export type AdminManagedFormFeedbackLabels = {
  successTitle: string;
  errorTitle: string;
};

export const defaultAdminManagedFormFeedbackLabels: AdminManagedFormFeedbackLabels = {
  successTitle: "Request completed",
  errorTitle: "Request failed",
};

export type AdminSortableMessages = {
  reorderFailed: string;
  toastSuccessTitle: string;
  toastErrorTitle: string;
  announcements: {
    dragStart: (id: string) => string;
    dragOver: (id: string, overId: string) => string;
    dragEnd: (id: string) => string;
    dragCancel: (id: string) => string;
  };
};

export const defaultSortableMessages: AdminSortableMessages = {
  reorderFailed: "Could not save the new order. Please try again.",
  toastSuccessTitle: "Order updated",
  toastErrorTitle: "Could not update the order",
  announcements: {
    dragStart: (id) => `Picked up ${id}.`,
    dragOver: (id, overId) => `${id} is over ${overId}.`,
    dragEnd: (id) => `${id} was moved to a new position.`,
    dragCancel: (id) => `${id} was not moved.`,
  },
};

export type AdminPaginationLabels = {
  nav: string;
  previous: string;
  next: string;
  page: (page: number) => string;
  more: string;
};

export const defaultPaginationLabels: AdminPaginationLabels = {
  nav: "Pagination",
  previous: "Previous",
  next: "Next",
  page: (page) => `Page ${page}`,
  more: "More pages",
};
