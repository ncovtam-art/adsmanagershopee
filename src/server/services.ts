import { db } from "./db";
import { AuthService } from "./auth/service";
import { TeamService } from "./team/service";
import { SettingsService } from "./settings/service";
export const auth = new AuthService(db);
export const team = new TeamService(db);
export const settings = new SettingsService(db);

import { MetaService } from "./meta/service";
import { DonorService } from "./donors/service";
import { MetaImportService } from "./meta/import";
export const meta = new MetaService(db);
export const donorService = new DonorService(db);
export const metaImport = new MetaImportService(db);

import { TrackingService } from "./shopee/tracking";
import { CommissionService } from "./shopee/commissions";
export const trackingService = new TrackingService(db);
export const commissions = new CommissionService(db);

import { AnalyticsService } from "./analytics/service";
export const analytics = new AnalyticsService(db);

import { PublisherService } from "./publisher/service";
export const publisher = new PublisherService(db);

import { AdsService } from "./ads/service";
export const ads = new AdsService(db);

import { BulkAdsService } from "./ads/bulk/service";
export const bulkAds = new BulkAdsService(db);

import { CareService } from "./care/service";
import { TelegramService } from "./care/telegram";
export const care = new CareService(db);
export const telegram = new TelegramService(db);
