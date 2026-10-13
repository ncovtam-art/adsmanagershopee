import type { MetaService } from "@/server/meta/service";
import type { DonorService } from "@/server/donors/service";
export type MetaState = Awaited<ReturnType<MetaService["connections"]>>;
export type Connection = MetaState["connections"][number];
export type PageRow = Awaited<ReturnType<MetaService["listPages"]>>[number];
export type AccountRow = Awaited<
  ReturnType<MetaService["listAccounts"]>
>[number];
export type PageDetail = Awaited<ReturnType<MetaService["page"]>>;
export type DonorPreview = Awaited<ReturnType<DonorService["preview"]>>;
export type DonorRow = Awaited<ReturnType<DonorService["list"]>>[number];
export type DonorDetail = Awaited<ReturnType<DonorService["detail"]>>;
