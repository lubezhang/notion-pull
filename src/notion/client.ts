import { Client } from "@notionhq/client";
import { ProxyAgent, setGlobalDispatcher } from "undici";

export type NotionClient = Client;

export interface NotionClientOptions {
  token: string;
  proxy?: string;
}

export function createNotionClient(options: NotionClientOptions): NotionClient {
  if (options.proxy) {
    const agent = new ProxyAgent(options.proxy);
    setGlobalDispatcher(agent);
  }
  return new Client({
    auth: options.token,
  });
}
