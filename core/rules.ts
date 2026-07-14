/**
 * Browser-independent mirror of the declarativeNetRequest rule shape.
 * The core stays free of browser API imports; the adapter casts these
 * into the platform type when registering session rules.
 */

export const ALL_RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'webtransport',
  'webbundle',
  'other',
] as const;

export type ResourceType = (typeof ALL_RESOURCE_TYPES)[number];

export type HeaderOperation = 'set' | 'remove' | 'append';

export interface HeaderInfo {
  header: string;
  operation: HeaderOperation;
  value?: string;
}

export interface NetRule {
  id: number;
  priority: number;
  action: {
    type: 'modifyHeaders' | 'allow';
    requestHeaders?: HeaderInfo[];
    responseHeaders?: HeaderInfo[];
  };
  condition: {
    urlFilter?: string;
    regexFilter?: string;
    resourceTypes: ResourceType[];
  };
}

export interface CompileWarning {
  code: 'empty-header-name';
  profileId: string;
  modificationId: string;
  message: string;
}
