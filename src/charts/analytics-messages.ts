// SPDX-License-Identifier: MIT

export type AdminAnalyticsChartMessages = {
  pageViews: string;
  uniqueVisitors: string;
  deviceVisits: string;
  period: string;
  item: string;
  value: string;
};

export const defaultAdminAnalyticsChartMessages: AdminAnalyticsChartMessages = {
  pageViews: "Page views",
  uniqueVisitors: "Unique visitors",
  deviceVisits: "visits",
  period: "Period",
  item: "Item",
  value: "Value",
};

export const turkishAdminAnalyticsChartMessages: AdminAnalyticsChartMessages = {
  pageViews: "Sayfa görüntüleme",
  uniqueVisitors: "Tekil ziyaretçi",
  deviceVisits: "ziyaret",
  period: "Dönem",
  item: "Öğe",
  value: "Değer",
};
