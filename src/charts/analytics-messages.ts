// SPDX-License-Identifier: MIT

export type AdminAnalyticsChartMessages = {
  pageViews: string;
  uniqueVisitors: string;
  deviceVisits: string;
};

export const defaultAdminAnalyticsChartMessages: AdminAnalyticsChartMessages = {
  pageViews: "Page views",
  uniqueVisitors: "Unique visitors",
  deviceVisits: "visits",
};

export const turkishAdminAnalyticsChartMessages: AdminAnalyticsChartMessages = {
  pageViews: "Sayfa görüntüleme",
  uniqueVisitors: "Tekil ziyaretçi",
  deviceVisits: "ziyaret",
};
