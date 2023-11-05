import {
  type CarrierTrackInput,
  Carrier,
  type TrackInfo,
  type CarrierInitInput,
} from "./core";

class CarrierAlias extends Carrier {
  constructor(readonly alias: string, readonly carrier: Carrier) {
    super();
  }

  public async init(input: CarrierInitInput & any): Promise<void> {
    await super.init(input);
    await this.carrier.init(input);
  }

  get carrierId(): string {
    return this.alias;
  }

  async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await this.carrier.track(input);
  }
}

export { CarrierAlias };
