import { type Carrier } from "../core/interfaces";

interface CarrierRegistry {
  get: (carrierId: string) => Carrier | null;
  get carriers(): Carrier[];
}

export { type CarrierRegistry };
