// Navigator User-Agent Client Hints API
// https://wicg.github.io/ua-client-hints/
interface NavigatorUAData {
  readonly brands: ReadonlyArray<{ brand: string; version: string }>;
  readonly mobile: boolean;
  readonly platform: string;
  getHighEntropyValues(hints: string[]): Promise<{
    architecture?: string;
    bitness?: string;
    brands?: Array<{ brand: string; version: string }>;
    fullVersionList?: Array<{ brand: string; version: string }>;
    mobile?: boolean;
    model?: string;
    platform?: string;
    platformVersion?: string;
    uaFullVersion?: string;
  }>;
}

interface Navigator {
  readonly userAgentData?: NavigatorUAData;
}
