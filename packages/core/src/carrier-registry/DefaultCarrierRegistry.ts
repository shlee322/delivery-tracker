import fsPromises from "fs/promises";
import YAML from "yaml";
import { type CarrierRegistry } from "./CarrierRegistry";
import { type Carrier } from "../core/interfaces";
import { CarrierUpstreamFetcher } from "../carrier-upstream-fetcher";
import { CJLogistics } from "../carriers/kr.cjlogistics";
import { Chunilps } from "../carriers/kr.chunilps";
import { CarrierAlias } from "../CarrierAlias";
import { CVSnet } from "../carriers/kr.cvsnet";
import { DHL } from "../carriers/de.dhl";
import { Cway } from "../carriers/kr.cway";
import { Sagawa } from "../carriers/jp.sagawa";
import { Daesin } from "../carriers/kr.daesin";
import { Hanjin } from "../carriers/kr.hanjin";
import { KoreaPost } from "../carriers/kr.epost";
import { HonamLogis } from "../carriers/kr.honamlogis";
import { IlyangLogis } from "../carriers/kr.ilyanglogis";
import { KyungdongExpress } from "../carriers/kr.kdexp";
import { Kunyoung } from "../carriers/kr.kunyoung";
import { Logen } from "../carriers/kr.logen";
import { LotteGlobalLogistics } from "../carriers/kr.lotte";
import { SLX } from "../carriers/kr.slx";
import { TodayPickup } from "../carriers/kr.todaypickup";
import { EMS } from "../carriers/un.upu.ems";
import { TNT } from "../carriers/nl.tnt";
import { Fedex } from "../carriers/us.fedex";
import { UPS } from "../carriers/us.ups";
import { USPS } from "../carriers/us.usps";
import { ActcoreOceanInbound } from "../carriers/kr.actcore.ocean-inbound";
import { CoupangLogisticsServices } from "../carriers/kr.coupangls";
import { GoodsToLuck } from "../carriers/kr.goodstoluck";

interface DefaultCarrierRegistryConfig {
  carriers: Record<
    string,
    {
      enabled: boolean;
    }
  >;
}

class DefaultCarrierRegistry implements CarrierRegistry {
  private readonly _carriers = new Map<string, Carrier>();
  private _config: DefaultCarrierRegistryConfig = this.defaultConfig();

  public async init(): Promise<void> {
    await this.loadConfig();

    await this.register(new DHL());
    await this.register(new Sagawa());
    await this.register(new ActcoreOceanInbound());
    await this.register(new CJLogistics());
    await this.register(new CoupangLogisticsServices());
    await this.register(new CarrierAlias("kr.cupost", new CJLogistics()));
    await this.register(new Chunilps());
    await this.register(new CVSnet());
    await this.register(new Cway());
    await this.register(new Daesin());
    await this.register(new KoreaPost());
    await this.register(new GoodsToLuck());
    await this.register(new CarrierAlias("kr.homepick", new Hanjin()));
    await this.register(new Hanjin());
    await this.register(new HonamLogis());
    await this.register(new IlyangLogis());
    await this.register(new KyungdongExpress());
    await this.register(new Kunyoung());
    await this.register(new Logen());
    await this.register(new LotteGlobalLogistics());
    await this.register(new SLX());
    await this.register(new CarrierAlias("kr.swgexp.epost", new KoreaPost()));
    await this.register(
      new CarrierAlias("kr.swgexp.cjlogistics", new CJLogistics())
    );
    await this.register(new TodayPickup());
    await this.register(new TNT());
    await this.register(new EMS());
    await this.register(new Fedex());
    await this.register(new UPS());
    await this.register(new USPS());
  }

  private defaultConfig(): DefaultCarrierRegistryConfig {
    return {
      carriers: {
        "de.dhl": {
          enabled: false,
        },
        "us.fedex": {
          enabled: false,
        },
        "us.usps": {
          enabled: false,
        },
      },
    };
  }

  private async loadConfig(): Promise<void> {
    const configFilePath =
      process.env.DELIVERY_TRACKER_CARRIER_REGISTRY_CONFIG_FILE;
    if (configFilePath === undefined) {
      this._config = this.defaultConfig();
      return;
    }

    const configFileRawText = await fsPromises.readFile(configFilePath, {
      encoding: "utf-8",
    });
    // TODO zod
    this._config = YAML.parse(configFileRawText);
  }

  protected getConfig(carrier: Carrier): any {
    const defaultConfig = this.defaultConfig();
    const carrierConfig = this._config.carriers[carrier.carrierId];
    const enabled =
      carrierConfig?.enabled ??
      defaultConfig.carriers[carrier.carrierId]?.enabled ??
      true;

    if (!enabled) {
      return {
        enabled: false,
      };
    }

    return {
      ...carrierConfig,
    };
  }

  protected createCarrierUpstreamFetcher(
    carrier: Carrier
  ): CarrierUpstreamFetcher {
    return new CarrierUpstreamFetcher({ carrier });
  }

  private async register(carrier: Carrier): Promise<void> {
    const config = this.getConfig(carrier);
    if (config.enabled === false) {
      return;
    }

    await carrier.init({
      upstreamFetcher: this.createCarrierUpstreamFetcher(carrier),
      config,
    });

    this.add(carrier);
  }

  private add(carrier: Carrier): void {
    this._carriers.set(carrier.carrierId, carrier);
  }

  get(carrierId: string): Carrier | null {
    return this._carriers.get(carrierId) ?? null;
  }

  get carriers(): Carrier[] {
    return Array.from(this._carriers.values());
  }
}

export { DefaultCarrierRegistry };
