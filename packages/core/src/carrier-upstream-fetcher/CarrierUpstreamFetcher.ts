import { type Carrier } from "../core";

interface CarrierUpstreamFetcherInitInput {
  carrier: Carrier;
}

class CarrierUpstreamFetcher {
  protected readonly carrier: Carrier;

  constructor(input: CarrierUpstreamFetcherInitInput) {
    this.carrier = input.carrier;
  }

  public async fetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    return await fetch(input, init);
  }
}

export { type CarrierUpstreamFetcherInitInput, CarrierUpstreamFetcher };
