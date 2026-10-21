// SPDX-License-Identifier: MIT
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation.js";
import { AdminInboxList, type AdminInboxItem } from "@yesvus/helmdeck";
import { archiveMessage, markMessageRead, queryMessages } from "./actions";
import { CONTACT_INBOX_PAGE_SIZE, contactInboxItem } from "../../../../lib/contact-inbox-view";

export function ContactInboxClient() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminInboxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    void queryMessages(page).then((result) => {
      if (!active) return;
      setRows(result.rows.map(contactInboxItem).filter((row): row is AdminInboxItem => row !== null));
      setTotal(result.total);
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setRows([]);
      setTotal(0);
      setLoading(false);
    });
    return () => { active = false; };
  }, [page, revision]);

  const pageCount = Math.ceil(total / CONTACT_INBOX_PAGE_SIZE);
  const refresh = useCallback(() => {
    setLoading(true);
    setRevision((current) => current + 1);
  }, []);
  const changePage = useCallback((nextPage: number) => {
    setLoading(true);
    setPage(nextPage);
  }, []);
  const onMarkRead = useCallback(async (message: AdminInboxItem) => {
    await markMessageRead(message.id);
    refresh();
  }, [refresh]);
  const onArchive = useCallback(async (message: AdminInboxItem) => {
    await archiveMessage(message.id);
    refresh();
  }, [refresh]);
  const openMessage = useCallback((message: AdminInboxItem) => {
    router.push(`/shell/messages/${encodeURIComponent(message.id)}`);
  }, [router]);

  return (
    <AdminInboxList
      messages={rows}
      loading={loading}
      page={page}
      pageCount={pageCount}
      onPageChange={changePage}
      onOpen={openMessage}
      onMarkRead={onMarkRead}
      onArchive={onArchive}
    />
  );
}
