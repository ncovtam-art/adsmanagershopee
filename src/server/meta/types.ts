export type Source = "LIVE" | "MOCK";
export type MetaPage = {
  id: string;
  name: string;
  access_token: string;
  tasks: string[];
};
export type MetaAccount = {
  id: string;
  account_id: string;
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number;
  user_tasks?: string[];
};
export type MetaInventory = {
  user: { id: string; name: string };
  scopes: string[];
  pages: MetaPage[];
  accounts: MetaAccount[];
  expiresAt: Date;
};
export type MetaObject = Record<string, unknown>;
export interface MetaProvider {
  inventory(token: string, expiresAt: Date): Promise<MetaInventory>;
  read(token: string, id: string, fields: string[]): Promise<MetaObject>;
  insights?(token: string, account: {metaId:string;currency:string;timezone:string}, since:string, until:string): Promise<import("../analytics/engine").Insight[]>;
}
